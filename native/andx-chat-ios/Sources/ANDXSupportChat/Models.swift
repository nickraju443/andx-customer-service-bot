//
//  Models.swift
//  ANDXSupportChat
//
//  All request + response types for the ANDX support bot backend, plus the
//  domain model used by the UI. Kept in one file so devs can scan the contract.
//

import Foundation

// MARK: - Domain

public enum Role: String, Codable, Sendable, Equatable {
    case user
    case ai
    case agent
}

public enum ChatMode: String, Codable, Sendable, Equatable {
    case beginner
    case pro
}

public enum Reaction: String, Codable, Sendable, Equatable, CaseIterable {
    case thumbsUp = "👍"
    case heart = "❤️"
    case laugh = "😂"
    case wow = "😮"
    case cry = "😢"
    case thumbsDown = "👎"
}

public struct ReplyToContext: Codable, Sendable, Equatable {
    public let id: String
    public let role: Role
    public let text: String

    public init(id: String, role: Role, text: String) {
        self.id = id
        self.role = role
        self.text = text
    }
}

public struct Message: Codable, Sendable, Equatable, Identifiable {
    public let id: String
    public let role: Role
    public let text: String
    public let ts: TimeInterval
    public var agentName: String?
    public var replyTo: ReplyToContext?
    public var isError: Bool
    public var isPending: Bool

    public init(
        id: String,
        role: Role,
        text: String,
        ts: TimeInterval,
        agentName: String? = nil,
        replyTo: ReplyToContext? = nil,
        isError: Bool = false,
        isPending: Bool = false
    ) {
        self.id = id
        self.role = role
        self.text = text
        self.ts = ts
        self.agentName = agentName
        self.replyTo = replyTo
        self.isError = isError
        self.isPending = isPending
    }
}

public struct LiveAgentState: Codable, Sendable, Equatable {
    public var active: Bool = false
    public var ticketId: String = ""
    public var ticketToken: String = ""
    public var email: String = ""
    public var agentName: String? = nil
    public var queueState: QueueState? = nil
    public var queuePosition: Int = 0
    public var queueTotal: Int = 0
    public var estimatedWaitMin: Int = 0
    public var isNext: Bool = false
    public var lastSeenTs: TimeInterval = 0

    // Decode leniently: if the backend ever adds a new state (e.g. "paused"),
    // we don't want the whole LiveAgentState decode to fail. Any unknown value
    // maps to `nil` (which the UI treats as "Connecting...").
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        active = try c.decodeIfPresent(Bool.self, forKey: .active) ?? false
        ticketId = try c.decodeIfPresent(String.self, forKey: .ticketId) ?? ""
        ticketToken = try c.decodeIfPresent(String.self, forKey: .ticketToken) ?? ""
        email = try c.decodeIfPresent(String.self, forKey: .email) ?? ""
        agentName = try c.decodeIfPresent(String.self, forKey: .agentName)
        queueState = (try? c.decodeIfPresent(QueueState.self, forKey: .queueState)) ?? nil
        queuePosition = try c.decodeIfPresent(Int.self, forKey: .queuePosition) ?? 0
        queueTotal = try c.decodeIfPresent(Int.self, forKey: .queueTotal) ?? 0
        estimatedWaitMin = try c.decodeIfPresent(Int.self, forKey: .estimatedWaitMin) ?? 0
        isNext = try c.decodeIfPresent(Bool.self, forKey: .isNext) ?? false
        lastSeenTs = try c.decodeIfPresent(TimeInterval.self, forKey: .lastSeenTs) ?? 0
    }

    public enum QueueState: String, Codable, Sendable, Equatable {
        case queued
        case active
        case ended
    }

    public init() {}
}

// MARK: - API: /api/ask

struct ChatHistoryItem: Codable, Sendable {
    let q: String
    let a: String
}

struct AskRequest: Codable, Sendable {
    let question: String
    let mode: String?
    let history: [ChatHistoryItem]?
    let reply_to: ReplyToPreview?

    struct ReplyToPreview: Codable, Sendable {
        let content_preview: String
    }
}

struct AskResponse: Codable, Sendable {
    let answer: String
    let follow_ups: [String]?
    let handoff_offer: Bool?
}

// MARK: - API: /api/agent-status

struct AgentStatusResponse: Codable, Sendable {
    let available: Bool
    let configured: Bool
}

// MARK: - API: /api/handoff

struct HandoffRequest: Codable, Sendable {
    let email: String
    let initial_message: String?
    let last_message: String?
    let history: [ChatHistoryItem]?
    let name: String?
    let page_url: String?
    let session_id: String?
}

struct HandoffResponse: Codable, Sendable {
    let ok: Bool
    let message: String?
    let agents_available: Bool?
    let ticket_id: String
    let ticket_token: String
    let start_ts: TimeInterval
}

// MARK: - API: /api/handoff-message

struct HandoffMessageRequest: Codable, Sendable {
    let ticket_id: String
    let ticket_token: String
    let message: String
    let reply_to: AskRequest.ReplyToPreview?
}

struct HandoffOKResponse: Codable, Sendable {
    let ok: Bool
    let message: String?
}

// MARK: - API: /api/reaction

struct ReactionRequest: Codable, Sendable {
    let message_id: String
    let message_role: String
    let reaction: String
    let message_preview: String?
    let ticket_id: String?
    let ticket_token: String?
    let history: [ChatHistoryItem]?
    let mode: String?
}

struct ReactionResponse: Codable, Sendable {
    let ok: Bool
    let follow_up: String?
}

// MARK: - API: /api/handoff-queue

struct HandoffQueueResponse: Codable, Sendable {
    let ok: Bool
    let state: String
    let position: Int
    let total: Int
    let is_next: Bool?
    let estimated_wait_min: Int?
    let agent_name: String?
}

// MARK: - API: /api/handoff-end

struct HandoffEndRequest: Codable, Sendable {
    let ticket_id: String
    let ticket_token: String
}

// MARK: - API: /api/handoff-poll

struct HandoffReply: Codable, Sendable, Equatable {
    let id: String
    let content: String
    let agent_name: String
    let ts: TimeInterval
}

struct HandoffPollResponse: Codable, Sendable {
    let ok: Bool
    let replies: [HandoffReply]
    let now_ts: TimeInterval
}

// MARK: - API: /api/register-push-token

struct RegisterPushTokenRequest: Codable, Sendable {
    let session_id: String
    let ticket_id: String?
    let ticket_token: String?
    let platform: String
    let push_token: String
    let device_id: String?
}

// MARK: - API: /health

struct HealthResponse: Codable, Sendable {
    let status: String
    let service: String
    let zoho_configured: Bool
}
