//
//  APIClient.swift
//  ANDXSupportChat
//
//  URLSession wrapper. One shared client, per-call cancellation via async/await.
//  Throws typed APIError on non-2xx. Single retry on 502/503.
//

import Foundation

public enum APIError: Error, LocalizedError, Sendable {
    case invalidURL
    case network(URLError)
    case badStatus(Int, String)
    case decoding(Error)
    case rateLimited
    case cancelled

    public var errorDescription: String? {
        switch self {
        case .invalidURL:               return "Invalid URL"
        case .network(let e):           return e.localizedDescription
        case .badStatus(let c, let m):  return "HTTP \(c): \(m)"
        case .decoding(let e):          return "Decoding failed: \(e.localizedDescription)"
        case .rateLimited:              return "Rate limited"
        case .cancelled:                return "Cancelled"
        }
    }
}

public final class APIClient: @unchecked Sendable {
    public static let defaultBaseURL = URL(string: "https://andx-bot-245374915379.us-central1.run.app")!

    private var baseURL: URL
    private let session: URLSession
    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()
    private let lock = NSLock()

    public init(baseURL: URL = APIClient.defaultBaseURL, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session
    }

    public func setBaseURL(_ url: URL) {
        lock.lock(); defer { lock.unlock() }
        baseURL = url
    }

    // MARK: - Endpoints

    func ask(_ req: AskRequest) async throws -> AskResponse {
        try await post("/api/ask", body: req)
    }

    func agentStatus() async throws -> AgentStatusResponse {
        try await get("/api/agent-status")
    }

    func startHandoff(_ req: HandoffRequest) async throws -> HandoffResponse {
        try await post("/api/handoff", body: req)
    }

    func sendHandoffMessage(_ req: HandoffMessageRequest) async throws -> HandoffOKResponse {
        try await post("/api/handoff-message", body: req)
    }

    func pollAgentReplies(ticketId: String, ticketToken: String, sinceTs: TimeInterval) async throws -> HandoffPollResponse {
        try await get("/api/handoff-poll", query: [
            "ticket_id": ticketId,
            "ticket_token": ticketToken,
            "since_ts": String(Int(sinceTs)),
        ])
    }

    func pollQueue(ticketId: String, ticketToken: String) async throws -> HandoffQueueResponse {
        try await get("/api/handoff-queue", query: [
            "ticket_id": ticketId,
            "ticket_token": ticketToken,
        ])
    }

    func endHandoff(_ req: HandoffEndRequest) async throws -> HandoffOKResponse {
        try await post("/api/handoff-end", body: req)
    }

    func sendTranscript(ticketId: String, ticketToken: String) async throws -> HandoffOKResponse {
        struct Body: Codable { let ticket_id: String; let ticket_token: String }
        return try await post("/api/handoff-transcript", body: Body(ticket_id: ticketId, ticket_token: ticketToken))
    }

    func sendReaction(_ req: ReactionRequest) async throws -> ReactionResponse {
        try await post("/api/reaction", body: req)
    }

    func registerPushToken(_ req: RegisterPushTokenRequest) async throws -> HandoffOKResponse {
        try await post("/api/register-push-token", body: req)
    }

    // MARK: - Core

    private func get<R: Decodable>(_ path: String, query: [String: String] = [:]) async throws -> R {
        try await requestWithRetry(path: path, method: "GET", query: query, body: Optional<EmptyBody>.none)
    }

    private func post<B: Encodable, R: Decodable>(_ path: String, body: B) async throws -> R {
        try await requestWithRetry(path: path, method: "POST", query: [:], body: body)
    }

    private struct EmptyBody: Encodable {}

    private func requestWithRetry<B: Encodable, R: Decodable>(
        path: String,
        method: String,
        query: [String: String],
        body: B?
    ) async throws -> R {
        do {
            return try await rawRequest(path: path, method: method, query: query, body: body)
        } catch let APIError.badStatus(code, _) where code == 502 || code == 503 {
            return try await rawRequest(path: path, method: method, query: query, body: body)
        }
    }

    private func rawRequest<B: Encodable, R: Decodable>(
        path: String,
        method: String,
        query: [String: String],
        body: B?
    ) async throws -> R {
        lock.lock()
        let base = baseURL
        lock.unlock()

        guard var comps = URLComponents(url: base.appendingPathComponent(path), resolvingAgainstBaseURL: false) else {
            throw APIError.invalidURL
        }
        if !query.isEmpty {
            comps.queryItems = query.map { URLQueryItem(name: $0.key, value: $0.value) }
        }
        guard let url = comps.url else { throw APIError.invalidURL }

        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        req.timeoutInterval = 20
        if let body {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try encoder.encode(body)
        }

        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await session.data(for: req)
        } catch let urlErr as URLError where urlErr.code == .cancelled {
            throw APIError.cancelled
        } catch let urlErr as URLError {
            throw APIError.network(urlErr)
        }

        guard let http = response as? HTTPURLResponse else {
            throw APIError.badStatus(-1, "Not an HTTP response")
        }
        if !(200..<300).contains(http.statusCode) {
            let body = String(data: data, encoding: .utf8) ?? ""
            if http.statusCode == 429 { throw APIError.rateLimited }
            throw APIError.badStatus(http.statusCode, body)
        }

        do {
            return try decoder.decode(R.self, from: data)
        } catch {
            throw APIError.decoding(error)
        }
    }
}
