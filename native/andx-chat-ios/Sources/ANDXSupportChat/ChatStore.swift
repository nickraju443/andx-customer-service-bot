//
//  ChatStore.swift
//  ANDXSupportChat
//
//  MainActor-bound ObservableObject that drives the entire chat UI. Handles:
//  - AI questions via /api/ask
//  - Live agent handoff, polling, heartbeat
//  - Reactions + reply-to
//  - Persistence to UserDefaults
//

import Foundation
import Combine
import SwiftUI

@MainActor
public final class ChatStore: ObservableObject {
    // MARK: - Config

    let client: APIClient
    let config: ANDXSupportChatConfig

    // MARK: - Published state

    @Published public private(set) var messages: [Message] = []
    @Published public private(set) var isStreaming: Bool = false
    @Published public private(set) var liveAgent: LiveAgentState = LiveAgentState()
    @Published public private(set) var reactions: [String: [Reaction]] = [:]
    @Published public private(set) var pendingReplyTo: ReplyToContext? = nil
    @Published public private(set) var email: String = ""
    @Published public private(set) var mode: ChatMode = .beginner
    @Published public private(set) var agentsAvailable: Bool? = nil
    @Published public private(set) var unreadCount: Int = 0
    @Published public var currentView: ChatView = .welcome

    public enum ChatView: Equatable {
        case welcome
        case chat
        case emailGate
    }

    // MARK: - Internal

    private let persistence: Persistence
    private var askTask: Task<Void, Never>? = nil
    private var heartbeatTask: Task<Void, Never>? = nil
    private var pollTask: Task<Void, Never>? = nil
    private var lifecycleObservers: [NSObjectProtocol] = []
    let sessionId: String

    public init(config: ANDXSupportChatConfig, persistence: Persistence = Persistence(), client: APIClient? = nil) {
        self.config = config
        self.persistence = persistence
        self.client = client ?? APIClient()
        self.sessionId = persistence.sessionId

        // Hydrate from persistence
        self.messages = persistence.loadMessages()
        self.reactions = persistence.loadReactions()
        self.liveAgent = persistence.loadLiveAgent() ?? LiveAgentState()
        self.email = config.userEmail ?? persistence.lastEmail ?? ""
        self.mode = config.initialMode ?? persistence.mode
        self.currentView = messages.isEmpty && !liveAgent.active ? .welcome : .chat

        Task { await self.checkAgentAvailability() }
    }

    // MARK: - Persistence

    private func persistAll() {
        persistence.saveMessages(messages)
        persistence.saveReactions(reactions)
        persistence.saveLiveAgent(liveAgent)
        if !email.isEmpty { persistence.lastEmail = email }
        persistence.mode = mode
    }

    // MARK: - Mutators

    func setEmail(_ email: String) {
        self.email = email
        persistAll()
    }

    func setMode(_ mode: ChatMode) {
        self.mode = mode
        persistAll()
    }

    func setPendingReplyTo(_ replyTo: ReplyToContext?) {
        pendingReplyTo = replyTo
    }

    func addMessage(_ message: Message) {
        guard !messages.contains(where: { $0.id == message.id }) else { return }
        messages.append(message)
        if messages.count > 50 { messages.removeFirst(messages.count - 50) }
        persistAll()
    }

    // MARK: - AI ask

    func askAI(_ question: String) {
        let text = question.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !isStreaming else { return }

        let userMsg = Message(
            id: makeId(),
            role: .user,
            text: text,
            ts: Date().timeIntervalSince1970,
            replyTo: pendingReplyTo
        )
        addMessage(userMsg)
        pendingReplyTo = nil
        isStreaming = true
        currentView = .chat

        askTask = Task { [weak self] in
            guard let self else { return }
            let history = await self.buildHistory()
            do {
                let response = try await self.client.ask(AskRequest(
                    question: text,
                    mode: self.mode.rawValue,
                    history: history,
                    reply_to: userMsg.replyTo.map { .init(content_preview: String($0.text.prefix(300))) }
                ))
                // Back on MainActor because the whole Task is spawned from a @MainActor context.
                self.addMessage(Message(
                    id: self.makeId(),
                    role: .ai,
                    text: response.answer,
                    ts: Date().timeIntervalSince1970
                ))
                self.isStreaming = false
            } catch is CancellationError {
                self.isStreaming = false
            } catch {
                let errText: String
                if case APIError.rateLimited = error {
                    errText = "Too many questions too fast. Give it a second and try again."
                } else {
                    errText = "Something went wrong reaching XORE. Tap retry below."
                }
                self.addMessage(Message(
                    id: self.makeId(),
                    role: .ai,
                    text: errText,
                    ts: Date().timeIntervalSince1970,
                    isError: true
                ))
                self.isStreaming = false
            }
        }
    }

    func cancelAsk() {
        askTask?.cancel()
        askTask = nil
        isStreaming = false
    }

    func retryLast() {
        guard let lastAi = messages.last(where: { $0.role == .ai && $0.isError }) else { return }
        guard let idx = messages.firstIndex(where: { $0.id == lastAi.id }) else { return }
        // Walk backwards from the error to find the nearest user prompt. Reaction
        // rephrases can interpose additional .ai messages between the user's
        // question and the error, so `idx - 1` isn't reliable.
        var userIdx = idx - 1
        while userIdx >= 0 && messages[userIdx].role != .user { userIdx -= 1 }
        guard userIdx >= 0 else { return }
        let userMsg = messages[userIdx]
        messages.removeSubrange(userIdx...idx)
        persistAll()
        askAI(userMsg.text)
    }

    // MARK: - Clear

    func clearChat() {
        cancelAsk()
        messages = []
        reactions = [:]
        pendingReplyTo = nil
        unreadCount = 0
        currentView = .welcome
        persistAll()
    }

    // MARK: - Live agent

    func startLiveAgentFlow() {
        currentView = .emailGate
    }

    func cancelEmailGate() {
        currentView = messages.isEmpty ? .welcome : .chat
    }

    func startLiveAgent(email: String, name: String?, firstMessage: String) async throws {
        let history = buildHistory()
        let req = HandoffRequest(
            email: email,
            initial_message: firstMessage,
            last_message: firstMessage,
            history: history,
            name: name,
            page_url: config.pageContext ?? "andx-ios-app",
            session_id: sessionId
        )
        let res = try await client.startHandoff(req)
        var la = LiveAgentState()
        la.active = true
        la.ticketId = res.ticket_id
        la.ticketToken = res.ticket_token
        la.email = email
        la.queueState = .queued
        la.lastSeenTs = res.start_ts

        self.liveAgent = la
        self.email = email
        addMessage(Message(
            id: makeId(),
            role: .user,
            text: firstMessage,
            ts: res.start_ts
        ))
        currentView = .chat
        startPollingLoops()
    }

    func sendLiveMessage(_ text: String) {
        guard !liveAgent.ticketId.isEmpty else { return }
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        addMessage(Message(
            id: makeId(),
            role: .user,
            text: trimmed,
            ts: Date().timeIntervalSince1970,
            replyTo: pendingReplyTo
        ))
        let reply = pendingReplyTo
        pendingReplyTo = nil
        let req = HandoffMessageRequest(
            ticket_id: liveAgent.ticketId,
            ticket_token: liveAgent.ticketToken,
            message: trimmed,
            reply_to: reply.map { .init(content_preview: String($0.text.prefix(200))) }
        )
        Task { [weak self] in
            guard let self else { return }
            _ = try? await self.client.sendHandoffMessage(req)
        }
    }

    func endLiveAgent() async {
        // Flip to .ended first so the UI shows "Chat ended" rather than the
        // ambiguous "Connecting..." placeholder when queueState goes to nil.
        liveAgent.queueState = .ended
        let req = HandoffEndRequest(
            ticket_id: liveAgent.ticketId,
            ticket_token: liveAgent.ticketToken
        )
        _ = try? await client.endHandoff(req)
        stopPollingLoops()
        var reset = LiveAgentState()
        reset.email = self.email
        liveAgent = reset
        persistAll()
    }

    // MARK: - Polling loops

    func startPollingLoops() {
        stopPollingLoops()
        heartbeatTask = Task { [weak self] in await self?.runHeartbeatLoop() }
        pollTask = Task { [weak self] in await self?.runPollLoop() }
    }

    func stopPollingLoops() {
        heartbeatTask?.cancel()
        pollTask?.cancel()
        heartbeatTask = nil
        pollTask = nil
    }

    private func runHeartbeatLoop() async {
        while !Task.isCancelled {
            // We're already on MainActor here; no need for MainActor.run.
            guard liveAgent.active, !liveAgent.ticketId.isEmpty else { return }
            let (ticketId, ticketToken) = (liveAgent.ticketId, liveAgent.ticketToken)
            do {
                let res = try await client.pollQueue(ticketId: ticketId, ticketToken: ticketToken)
                self.liveAgent.queueState = LiveAgentState.QueueState(rawValue: res.state) ?? self.liveAgent.queueState
                self.liveAgent.queuePosition = res.position
                self.liveAgent.queueTotal = res.total
                self.liveAgent.isNext = res.is_next ?? false
                self.liveAgent.estimatedWaitMin = res.estimated_wait_min ?? 0
                if let name = res.agent_name { self.liveAgent.agentName = name }
                self.persistAll()
                if res.state == "ended" {
                    self.stopPollingLoops()
                    return
                }
            } catch {
                // transient — sleep and retry
            }
            try? await Task.sleep(nanoseconds: 12 * 1_000_000_000)
        }
    }

    private func runPollLoop() async {
        while !Task.isCancelled {
            guard liveAgent.active, !liveAgent.ticketId.isEmpty else { return }
            // If the heartbeat has already marked us ended, exit too.
            if liveAgent.queueState == .ended { return }
            let (ticketId, ticketToken, lastSeen) = (liveAgent.ticketId, liveAgent.ticketToken, liveAgent.lastSeenTs)
            do {
                let res = try await client.pollAgentReplies(
                    ticketId: ticketId,
                    ticketToken: ticketToken,
                    sinceTs: lastSeen
                )
                var latest = self.liveAgent.lastSeenTs
                for reply in res.replies {
                    self.addMessage(Message(
                        id: reply.id,
                        role: .agent,
                        text: reply.content,
                        ts: reply.ts,
                        agentName: reply.agent_name
                    ))
                    if reply.ts > latest { latest = reply.ts }
                }
                if latest > self.liveAgent.lastSeenTs {
                    self.liveAgent.lastSeenTs = latest
                    self.persistAll()
                }
            } catch {
                // transient
            }
            try? await Task.sleep(nanoseconds: 4 * 1_000_000_000)
        }
    }

    // MARK: - Reactions

    func toggleReaction(_ reaction: Reaction, on message: Message) {
        var current = reactions[message.id] ?? []
        if let existingIdx = current.firstIndex(of: reaction) {
            current.remove(at: existingIdx)
        } else {
            current.append(reaction)
        }
        reactions[message.id] = current
        persistAll()

        let history = reaction == .thumbsDown && message.role == .ai ? buildHistory() : nil
        let req = ReactionRequest(
            message_id: message.id,
            message_role: message.role == .agent ? "agent" : "ai",
            reaction: reaction.rawValue,
            message_preview: String(message.text.prefix(500)),
            ticket_id: message.role == .agent ? liveAgent.ticketId : nil,
            ticket_token: message.role == .agent ? liveAgent.ticketToken : nil,
            history: history,
            mode: reaction == .thumbsDown && message.role == .ai ? mode.rawValue : nil
        )
        Task { [weak self] in
            guard let self else { return }
            do {
                let response = try await self.client.sendReaction(req)
                await MainActor.run {
                    if let followUp = response.follow_up {
                        self.addMessage(Message(
                            id: self.makeId(),
                            role: .ai,
                            text: followUp,
                            ts: Date().timeIntervalSince1970
                        ))
                    }
                }
            } catch {
                // rollback local toggle on failure
                await MainActor.run {
                    var current = self.reactions[message.id] ?? []
                    if let idx = current.firstIndex(of: reaction) { current.remove(at: idx) } else { current.append(reaction) }
                    self.reactions[message.id] = current
                    self.persistAll()
                }
            }
        }
    }

    // MARK: - Helpers

    private func checkAgentAvailability() async {
        // We're already on MainActor; no MainActor.run needed.
        do {
            let status = try await client.agentStatus()
            self.agentsAvailable = status.available
        } catch {
            self.agentsAvailable = false
        }
    }

    private func buildHistory() -> [ChatHistoryItem] {
        var out: [ChatHistoryItem] = []
        let filtered = messages.filter { $0.role == .user || $0.role == .ai }
        // Guard against empty/single-element lists — `0 ..< -1` traps.
        guard filtered.count >= 2 else { return out }
        for i in 0 ..< (filtered.count - 1) where filtered[i].role == .user && filtered[i + 1].role == .ai {
            out.append(ChatHistoryItem(q: filtered[i].text, a: filtered[i + 1].text))
        }
        return Array(out.suffix(8))
    }

    private func makeId() -> String {
        "m-\(Int(Date().timeIntervalSince1970 * 1000))-\(UUID().uuidString.prefix(8))"
    }

    // MARK: - Panel visibility

    func onPanelOpened() {
        unreadCount = 0
        if liveAgent.active { startPollingLoops() }
    }

    func onPanelClosed() {
        stopPollingLoops()
    }
}
