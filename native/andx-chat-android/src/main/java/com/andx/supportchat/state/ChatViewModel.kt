package com.andx.supportchat.state

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.andx.supportchat.ANDXSupportChatConfig
import com.andx.supportchat.api.ApiClient
import com.andx.supportchat.api.AskRequest
import com.andx.supportchat.api.ChatHistoryItem
import com.andx.supportchat.api.ChatMode
import com.andx.supportchat.api.HandoffEndRequest
import com.andx.supportchat.api.HandoffMessageRequest
import com.andx.supportchat.api.HandoffRequest
import com.andx.supportchat.api.LiveAgentState
import com.andx.supportchat.api.Message
import com.andx.supportchat.api.Reaction
import com.andx.supportchat.api.ReactionRequest
import com.andx.supportchat.api.ReplyToContext
import com.andx.supportchat.api.Role
import com.andx.supportchat.api.ApiException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import java.util.UUID

sealed class ChatView {
    object Welcome : ChatView()
    object Chat : ChatView()
    object EmailGate : ChatView()
}

/**
 * The store that drives all UI state. Owns:
 * - AI ask flow with cancellation
 * - Live agent handoff, heartbeat, poll loops
 * - Reactions + reply-to
 * - Persistence
 */
class ChatViewModel(
    app: Application,
    val config: ANDXSupportChatConfig,
    val client: ApiClient = ApiClient(),
) : AndroidViewModel(app) {

    private val persistence = Persistence(app.applicationContext, viewModelScope)

    // ─── Observable state ─────────────────────────────────────────────────

    private val _messages = MutableStateFlow<List<Message>>(emptyList())
    val messages: StateFlow<List<Message>> = _messages.asStateFlow()

    private val _isStreaming = MutableStateFlow(false)
    val isStreaming: StateFlow<Boolean> = _isStreaming.asStateFlow()

    private val _liveAgent = MutableStateFlow(LiveAgentState())
    val liveAgent: StateFlow<LiveAgentState> = _liveAgent.asStateFlow()

    private val _reactions = MutableStateFlow<Map<String, List<Reaction>>>(emptyMap())
    val reactions: StateFlow<Map<String, List<Reaction>>> = _reactions.asStateFlow()

    private val _pendingReplyTo = MutableStateFlow<ReplyToContext?>(null)
    val pendingReplyTo: StateFlow<ReplyToContext?> = _pendingReplyTo.asStateFlow()

    private val _email = MutableStateFlow(config.userEmail.orEmpty())
    val email: StateFlow<String> = _email.asStateFlow()

    private val _mode = MutableStateFlow(config.initialMode ?: ChatMode.BEGINNER)
    val mode: StateFlow<ChatMode> = _mode.asStateFlow()

    private val _agentsAvailable = MutableStateFlow<Boolean?>(null)
    val agentsAvailable: StateFlow<Boolean?> = _agentsAvailable.asStateFlow()

    private val _currentView = MutableStateFlow<ChatView>(ChatView.Welcome)
    val currentView: StateFlow<ChatView> = _currentView.asStateFlow()

    // ─── Internal ──────────────────────────────────────────────────────────

    private var askJob: Job? = null
    private var heartbeatJob: Job? = null
    private var pollJob: Job? = null
    private val _sessionId = MutableStateFlow<String?>(null)
    val sessionIdReady: StateFlow<String?> = _sessionId.asStateFlow()

    // Snapshot the user-provided initialMode override before the async
    // hydration starts, so subsequent user mode changes aren't clobbered.
    private var hydrated = false

    init {
        viewModelScope.launch {
            val loadedSession = persistence.sessionId()
            val loadedMessages = persistence.loadMessages()
            val loadedReactions = persistence.loadReactions()
            val loadedLiveAgent = persistence.loadLiveAgent()
            val loadedEmail = persistence.loadEmail()
            val loadedMode = persistence.loadMode()

            _sessionId.value = loadedSession
            _messages.value = loadedMessages
            _reactions.value = loadedReactions
            if (loadedLiveAgent != null) _liveAgent.value = loadedLiveAgent
            if (_email.value.isEmpty() && !loadedEmail.isNullOrEmpty()) _email.value = loadedEmail
            if (config.initialMode == null && !hydrated) _mode.value = loadedMode

            _currentView.value = if (_messages.value.isEmpty() && !_liveAgent.value.active) ChatView.Welcome else ChatView.Chat
            hydrated = true

            checkAgentAvailability()

            if (_liveAgent.value.active) startPollingLoops()
        }
    }

    /** Await hydration completion. Call from any suspend fn that reads sessionId. */
    private suspend fun awaitSessionId(): String {
        _sessionId.value?.let { return it }
        return sessionIdReady.filterNotNull().first()
    }

    // ─── Mutators ─────────────────────────────────────────────────────────

    fun setEmail(email: String) {
        _email.value = email
        if (email.isNotEmpty()) persistence.saveEmailAsync(email)
    }

    fun setMode(mode: ChatMode) {
        _mode.value = mode
        persistence.saveModeAsync(mode)
    }

    fun setPendingReplyTo(replyTo: ReplyToContext?) {
        _pendingReplyTo.value = replyTo
    }

    private fun addMessage(message: Message) {
        val current = _messages.value
        if (current.any { it.id == message.id }) return
        val newList = (current + message).takeLast(50)
        _messages.value = newList
        persistence.saveMessagesAsync(newList)
    }

    // ─── AI ask ───────────────────────────────────────────────────────────

    fun askAI(question: String) {
        val text = question.trim()
        if (text.isEmpty() || _isStreaming.value) return

        val userMsg = Message(
            id = newId(),
            role = Role.USER,
            text = text,
            ts = nowTs(),
            replyTo = _pendingReplyTo.value,
        )
        addMessage(userMsg)
        _pendingReplyTo.value = null
        _isStreaming.value = true
        _currentView.value = ChatView.Chat

        val previousJob = askJob
        askJob = viewModelScope.launch {
            // Await cancellation of the previous ask before we set isStreaming
            // to true and start a new one. Prevents the older job's `finally`
            // block from clobbering our new streaming state.
            if (previousJob != null) {
                try { previousJob.cancelAndJoin() } catch (_: CancellationException) { /* fine */ }
            }
            val history = buildHistory()
            try {
                val response = client.ask(
                    AskRequest(
                        question = text,
                        mode = _mode.value.name.lowercase(),
                        history = history,
                        replyTo = userMsg.replyTo?.let {
                            AskRequest.ReplyToPreview(contentPreview = it.text.take(300))
                        },
                    )
                )
                addMessage(
                    Message(
                        id = newId(),
                        role = Role.AI,
                        text = response.answer,
                        ts = nowTs(),
                    )
                )
            } catch (_: CancellationException) {
                // user cleared or panel closed
            } catch (e: Throwable) {
                val text = when (e) {
                    is ApiException.RateLimited -> "Too many questions too fast. Give it a second and try again."
                    else -> "Something went wrong reaching XORE. Tap retry below."
                }
                addMessage(
                    Message(
                        id = newId(),
                        role = Role.AI,
                        text = text,
                        ts = nowTs(),
                        isError = true,
                    )
                )
            } finally {
                _isStreaming.value = false
            }
        }
    }

    fun cancelAsk() {
        askJob?.cancel()
        askJob = null
        _isStreaming.value = false
    }

    fun retryLast() {
        val list = _messages.value
        val lastErrorIdx = list.indexOfLast { it.role == Role.AI && it.isError }
        if (lastErrorIdx <= 0) return
        val userMsg = list[lastErrorIdx - 1]
        if (userMsg.role != Role.USER) return
        val next = list.toMutableList().apply {
            removeAt(lastErrorIdx)
            removeAt(lastErrorIdx - 1)
        }
        _messages.value = next
        persistence.saveMessagesAsync(next)
        askAI(userMsg.text)
    }

    // ─── Clear ────────────────────────────────────────────────────────────

    fun clearChat() {
        cancelAsk()
        _messages.value = emptyList()
        _reactions.value = emptyMap()
        _pendingReplyTo.value = null
        _currentView.value = ChatView.Welcome
        persistence.saveMessagesAsync(emptyList())
        persistence.saveReactionsAsync(emptyMap())
    }

    // ─── Live agent ───────────────────────────────────────────────────────

    fun startLiveAgentFlow() {
        _currentView.value = ChatView.EmailGate
    }

    fun cancelEmailGate() {
        _currentView.value = if (_messages.value.isEmpty()) ChatView.Welcome else ChatView.Chat
    }

    suspend fun startLiveAgent(email: String, name: String?, firstMessage: String) {
        val history = buildHistory()
        // Ensure persistence has hydrated our session_id before we hand it off
        // to the backend — otherwise a cold-start user tapping "Chat with a
        // live agent" would send an empty session_id.
        val sessionId = awaitSessionId()
        val res = client.startHandoff(
            HandoffRequest(
                email = email,
                initialMessage = firstMessage,
                lastMessage = firstMessage,
                history = history,
                name = name,
                pageUrl = config.pageContext ?: "andx-android-app",
                sessionId = sessionId,
            )
        )
        _liveAgent.value = LiveAgentState(
            active = true,
            ticketId = res.ticketId,
            ticketToken = res.ticketToken,
            email = email,
            queueState = LiveAgentState.QueueState.QUEUED,
            lastSeenTs = res.startTs,
        )
        setEmail(email)
        addMessage(
            Message(
                id = newId(),
                role = Role.USER,
                text = firstMessage,
                ts = res.startTs,
            )
        )
        _currentView.value = ChatView.Chat
        persistence.saveLiveAgentAsync(_liveAgent.value)
        startPollingLoops()
    }

    fun sendLiveMessage(text: String) {
        val la = _liveAgent.value
        if (la.ticketId.isEmpty()) return
        val trimmed = text.trim()
        if (trimmed.isEmpty()) return

        val reply = _pendingReplyTo.value
        addMessage(
            Message(
                id = newId(),
                role = Role.USER,
                text = trimmed,
                ts = nowTs(),
                replyTo = reply,
            )
        )
        _pendingReplyTo.value = null

        viewModelScope.launch {
            runCatching {
                client.sendHandoffMessage(
                    HandoffMessageRequest(
                        ticketId = la.ticketId,
                        ticketToken = la.ticketToken,
                        message = trimmed,
                        replyTo = reply?.let { AskRequest.ReplyToPreview(contentPreview = it.text.take(200)) },
                    )
                )
            }
        }
    }

    suspend fun endLiveAgent() {
        val la = _liveAgent.value
        if (la.ticketId.isNotEmpty()) {
            runCatching {
                client.endHandoff(HandoffEndRequest(la.ticketId, la.ticketToken))
            }
        }
        stopPollingLoops()
        _liveAgent.value = LiveAgentState(email = _email.value)
        persistence.clearLiveAgentAsync()
    }

    // ─── Polling loops ────────────────────────────────────────────────────

    fun startPollingLoops() {
        stopPollingLoops()
        heartbeatJob = viewModelScope.launch { runHeartbeatLoop() }
        pollJob = viewModelScope.launch { runPollLoop() }
    }

    fun stopPollingLoops() {
        heartbeatJob?.cancel(); heartbeatJob = null
        pollJob?.cancel(); pollJob = null
    }

    private suspend fun runHeartbeatLoop() {
        while (true) {
            val la = _liveAgent.value
            if (!la.active || la.ticketId.isEmpty()) return
            runCatching {
                val res = client.pollQueue(la.ticketId, la.ticketToken)
                val state = when (res.state) {
                    "queued" -> LiveAgentState.QueueState.QUEUED
                    "active" -> LiveAgentState.QueueState.ACTIVE
                    "ended" -> LiveAgentState.QueueState.ENDED
                    else -> la.queueState
                }
                val isEnded = state == LiveAgentState.QueueState.ENDED
                _liveAgent.value = la.copy(
                    // When the queue reports ended, flip `active` to false too
                    // so the panel returns to the welcome state and polling
                    // doesn't restart on next panel open.
                    active = if (isEnded) false else la.active,
                    queueState = state,
                    queuePosition = res.position,
                    queueTotal = res.total,
                    isNext = res.isNext ?: false,
                    estimatedWaitMin = res.estimatedWaitMin ?: 0,
                    agentName = res.agentName ?: la.agentName,
                )
                persistence.saveLiveAgentAsync(_liveAgent.value)
                if (isEnded) {
                    stopPollingLoops()
                    return
                }
            }
            delay(12_000L)
        }
    }

    private suspend fun runPollLoop() {
        while (true) {
            val la = _liveAgent.value
            if (!la.active || la.ticketId.isEmpty()) return
            runCatching {
                val res = client.pollAgentReplies(la.ticketId, la.ticketToken, la.lastSeenTs)
                var latest = la.lastSeenTs
                for (reply in res.replies) {
                    addMessage(
                        Message(
                            id = reply.id,
                            role = Role.AGENT,
                            text = reply.content,
                            ts = reply.ts,
                            agentName = reply.agentName,
                        )
                    )
                    if (reply.ts > latest) latest = reply.ts
                }
                if (latest > la.lastSeenTs) {
                    _liveAgent.value = la.copy(lastSeenTs = latest)
                    persistence.saveLiveAgentAsync(_liveAgent.value)
                }
            }
            delay(4_000L)
        }
    }

    // ─── Reactions ────────────────────────────────────────────────────────

    fun toggleReaction(reaction: Reaction, message: Message) {
        val current = _reactions.value[message.id].orEmpty()
        val hasIt = current.contains(reaction)
        val next = if (hasIt) current - reaction else current + reaction
        val newMap = _reactions.value + (message.id to next)
        _reactions.value = newMap
        persistence.saveReactionsAsync(newMap)

        val history = if (reaction == Reaction.THUMBS_DOWN && message.role == Role.AI) buildHistory() else null

        viewModelScope.launch {
            runCatching {
                val res = client.sendReaction(
                    ReactionRequest(
                        messageId = message.id,
                        messageRole = if (message.role == Role.AGENT) "agent" else "ai",
                        reaction = reaction.emoji,
                        messagePreview = message.text.take(500),
                        ticketId = if (message.role == Role.AGENT) _liveAgent.value.ticketId else null,
                        ticketToken = if (message.role == Role.AGENT) _liveAgent.value.ticketToken else null,
                        history = history,
                        mode = if (reaction == Reaction.THUMBS_DOWN && message.role == Role.AI) _mode.value.name.lowercase() else null,
                    )
                )
                res.followUp?.let {
                    addMessage(
                        Message(
                            id = newId(),
                            role = Role.AI,
                            text = it,
                            ts = nowTs(),
                        )
                    )
                }
            }.onFailure { e ->
                if (e is CancellationException) throw e
                // Rollback the specific reaction we just added/removed. Read
                // the CURRENT reactions map at failure time so we don't clobber
                // other reactions the user has added while our request was
                // in flight.
                val currentAtFailure = _reactions.value[message.id].orEmpty()
                val restored = if (hasIt) currentAtFailure + reaction else currentAtFailure - reaction
                val newMap = _reactions.value + (message.id to restored)
                _reactions.value = newMap
                persistence.saveReactionsAsync(newMap)
            }
        }
    }

    // ─── Panel lifecycle ──────────────────────────────────────────────────

    fun onPanelOpened() {
        if (_liveAgent.value.active) startPollingLoops()
    }

    fun onPanelClosed() {
        stopPollingLoops()
    }

    // ─── Helpers ──────────────────────────────────────────────────────────

    private fun checkAgentAvailability() {
        viewModelScope.launch {
            runCatching { client.agentStatus() }
                .onSuccess { _agentsAvailable.value = it.available }
                .onFailure { _agentsAvailable.value = false }
        }
    }

    private fun buildHistory(): List<ChatHistoryItem> {
        val out = mutableListOf<ChatHistoryItem>()
        val filtered = _messages.value.filter { it.role == Role.USER || it.role == Role.AI }
        // Guard against 0- and 1-element lists — `0 until (n-1)` would iterate
        // over 0..0 when n=1 and produce nothing, but the boundary is easier
        // to reason about explicitly.
        if (filtered.size < 2) return out
        for (i in 0 until filtered.size - 1) {
            if (filtered[i].role == Role.USER && filtered[i + 1].role == Role.AI) {
                out += ChatHistoryItem(q = filtered[i].text, a = filtered[i + 1].text)
            }
        }
        return out.takeLast(8)
    }

    private fun newId(): String = "m-${System.currentTimeMillis().toString(36)}-${UUID.randomUUID().toString().take(8)}"

    private fun nowTs(): Double = System.currentTimeMillis() / 1000.0
}
