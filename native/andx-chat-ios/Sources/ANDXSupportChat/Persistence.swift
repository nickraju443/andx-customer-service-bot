//
//  Persistence.swift
//  ANDXSupportChat
//
//  UserDefaults-backed persistence for chat history + live agent session.
//  Matches keys used by the web + RN + Android SDKs so a future export flow
//  could interop if needed.
//

import Foundation

enum PersistenceKeys {
    static let chatHistory = "xore.chatHistory"
    static let liveAgent   = "xore.liveAgent"
    static let lastEmail   = "xore.lastEmail"
    static let sessionId   = "xore.sessionId"
    static let mode        = "xore.mode"
    static let reactions   = "xore.reactions"
}

struct Persistence {
    private let defaults: UserDefaults
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    // MARK: - Session

    var sessionId: String {
        get {
            if let existing = defaults.string(forKey: PersistenceKeys.sessionId), !existing.isEmpty {
                return existing
            }
            let new = "ios-\(UUID().uuidString.lowercased())"
            defaults.set(new, forKey: PersistenceKeys.sessionId)
            return new
        }
    }

    // MARK: - Simple values

    var lastEmail: String? {
        get { defaults.string(forKey: PersistenceKeys.lastEmail) }
        set {
            if let newValue, !newValue.isEmpty {
                defaults.set(newValue, forKey: PersistenceKeys.lastEmail)
            } else {
                defaults.removeObject(forKey: PersistenceKeys.lastEmail)
            }
        }
    }

    var mode: ChatMode {
        get { ChatMode(rawValue: defaults.string(forKey: PersistenceKeys.mode) ?? "beginner") ?? .beginner }
        set { defaults.set(newValue.rawValue, forKey: PersistenceKeys.mode) }
    }

    // MARK: - Messages

    func loadMessages() -> [Message] {
        guard let data = defaults.data(forKey: PersistenceKeys.chatHistory) else { return [] }
        return (try? decoder.decode([Message].self, from: data)) ?? []
    }

    func saveMessages(_ messages: [Message]) {
        let trimmed = messages.suffix(50)
        if let data = try? encoder.encode(Array(trimmed)) {
            defaults.set(data, forKey: PersistenceKeys.chatHistory)
        }
    }

    // MARK: - Live agent

    func loadLiveAgent() -> LiveAgentState? {
        guard let data = defaults.data(forKey: PersistenceKeys.liveAgent) else { return nil }
        return try? decoder.decode(LiveAgentState.self, from: data)
    }

    func saveLiveAgent(_ state: LiveAgentState) {
        if let data = try? encoder.encode(state) {
            defaults.set(data, forKey: PersistenceKeys.liveAgent)
        }
    }

    func clearLiveAgent() {
        defaults.removeObject(forKey: PersistenceKeys.liveAgent)
    }

    // MARK: - Reactions

    func loadReactions() -> [String: [Reaction]] {
        guard let data = defaults.data(forKey: PersistenceKeys.reactions) else { return [:] }
        return (try? decoder.decode([String: [Reaction]].self, from: data)) ?? [:]
    }

    func saveReactions(_ reactions: [String: [Reaction]]) {
        if let data = try? encoder.encode(reactions) {
            defaults.set(data, forKey: PersistenceKeys.reactions)
        }
    }
}
