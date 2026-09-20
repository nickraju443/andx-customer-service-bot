package com.andx.supportchat.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.imePadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import com.andx.supportchat.LocalANDXTheme
import com.andx.supportchat.api.ReplyToContext
import com.andx.supportchat.state.ChatView
import com.andx.supportchat.state.ChatViewModel
import kotlinx.coroutines.launch

@Composable
fun ChatPanel(
    viewModel: ChatViewModel,
    onClose: () -> Unit,
) {
    val theme = LocalANDXTheme.current
    val messages by viewModel.messages.collectAsState()
    val isStreaming by viewModel.isStreaming.collectAsState()
    val liveAgent by viewModel.liveAgent.collectAsState()
    val reactions by viewModel.reactions.collectAsState()
    val pendingReplyTo by viewModel.pendingReplyTo.collectAsState()
    val currentView by viewModel.currentView.collectAsState()
    val agentsAvailable by viewModel.agentsAvailable.collectAsState()
    val email by viewModel.email.collectAsState()
    val scope = rememberCoroutineScope()

    DisposableEffect(Unit) {
        viewModel.onPanelOpened()
        onDispose { viewModel.onPanelClosed() }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(theme.bg.panel)
            .imePadding(),
    ) {
        Header(
            liveAgentActive = liveAgent.active,
            agentName = liveAgent.agentName,
            onClose = onClose,
            onClear = { viewModel.clearChat() },
            onEndLive = if (liveAgent.active) {
                { scope.launch { viewModel.endLiveAgent() } }
            } else null,
        )

        when (currentView) {
            ChatView.Welcome -> {
                val chips = if (agentsAvailable == true) {
                    listOf("What is ANDX?", "How do I sign up?", "Is ANDX free to use?", "Chat with a live agent")
                } else {
                    listOf("What is ANDX?", "How do I sign up?", "Is ANDX free to use?", "How do I deposit?")
                }
                Welcome(chips = chips) { chip ->
                    if (chip.lowercase().contains("live agent")) {
                        viewModel.startLiveAgentFlow()
                    } else {
                        viewModel.askAI(chip)
                    }
                }
            }

            ChatView.EmailGate -> {
                EmailGate(
                    initialEmail = email,
                    initialName = null,
                    onSubmit = { email, name, firstMessage ->
                        viewModel.startLiveAgent(email, name.ifBlank { null }, firstMessage)
                    },
                    onCancel = { viewModel.cancelEmailGate() },
                )
            }

            ChatView.Chat -> {
                Column(modifier = Modifier.fillMaxSize()) {
                    if (liveAgent.active) {
                        QueueWidget(liveAgent = liveAgent)
                    }
                    androidx.compose.foundation.layout.Box(
                        modifier = Modifier.weight(1f),
                    ) {
                        MessagesList(
                            messages = messages,
                            reactions = reactions,
                            isStreaming = isStreaming,
                            onReply = { msg ->
                                viewModel.setPendingReplyTo(
                                    ReplyToContext(id = msg.id, role = msg.role, text = msg.text.take(280))
                                )
                            },
                            onReact = { reaction, msg ->
                                viewModel.toggleReaction(reaction, msg)
                            },
                            onRetry = { viewModel.retryLast() },
                        )
                    }
                    pendingReplyTo?.let { reply ->
                        ReplyPreview(
                            replyText = "Replying to: ${reply.text}",
                            onClose = { viewModel.setPendingReplyTo(null) },
                        )
                    }
                    Composer(
                        placeholder = if (liveAgent.active) "Message the live agent…" else "Ask XORE anything…",
                        disabled = false,
                        onSend = { text ->
                            if (liveAgent.active) {
                                viewModel.sendLiveMessage(text)
                            } else {
                                viewModel.askAI(text)
                            }
                        }
                    )
                }
            }
        }
    }
}
