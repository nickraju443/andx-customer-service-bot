//
//  PushRegistrar.swift
//  ANDXSupportChat
//
//  Registers the device's APNs token (via Firebase Messaging) with the backend
//  so agent replies can push through when the app is closed.
//
//  Backend endpoint: POST /api/register-push-token (live in production).
//  Backend picks up FCM tokens for both iOS + Android; APNs is bridged via
//  Firebase's Cloud Messaging service.
//
//  The host app must install Firebase Messaging separately — this file uses
//  reflection so the SDK compiles without Firebase as a hard dependency:
//
//    // Package.swift or Podfile:
//    .package(url: "https://github.com/firebase/firebase-ios-sdk", from: "11.0.0")
//    // then import FirebaseMessaging in the host app and call:
//    // await ANDXPushRegistrar.register(sessionId: <your install id>, fcmToken: token)
//

import Foundation
import UIKit

public final class ANDXPushRegistrar: @unchecked Sendable {
    public static let shared = ANDXPushRegistrar()

    private let client: APIClient
    private var lastRegistrationKey: String?
    private let lock = NSLock()

    public init(client: APIClient = APIClient()) {
        self.client = client
    }

    /// Register a Firebase Cloud Messaging token for this device. Idempotent.
    ///
    /// - Parameters:
    ///   - sessionId: Stable per-install identifier. Keep it in your keychain
    ///     or user defaults so the same value is used across app launches.
    ///   - fcmToken: The FCM token from `Messaging.messaging().token()`.
    ///   - ticketId: (Optional) If the user has an active live-agent ticket,
    ///     bind the token to it so pushes route correctly.
    ///   - ticketToken: (Optional) The HMAC token paired with `ticketId`.
    ///   - deviceId: (Optional) A device identifier for debugging.
    ///
    /// - Returns: `true` on success, `false` if the backend refused. Never
    ///   throws — safe to call on app open without a try/catch.
    @discardableResult
    public func register(
        sessionId: String,
        fcmToken: String,
        ticketId: String? = nil,
        ticketToken: String? = nil,
        deviceId: String? = nil
    ) async -> Bool {
        // Dedupe on the (token + ticket) pair so re-binding to a new ticket
        // still hits the backend even if the FCM token hasn't changed.
        let key = "\(fcmToken)|\(ticketId ?? "")"
        lock.lock()
        if lastRegistrationKey == key {
            lock.unlock()
            return true
        }
        lock.unlock()

        let req = RegisterPushTokenRequest(
            session_id: sessionId,
            ticket_id: ticketId,
            ticket_token: ticketToken,
            platform: "ios",
            push_token: fcmToken,
            device_id: deviceId ?? UIDevice.current.identifierForVendor?.uuidString
        )
        do {
            _ = try await client.registerPushToken(req)
            // Only mark deduped on success. A failed call should retry next time.
            lock.lock()
            lastRegistrationKey = key
            lock.unlock()
            return true
        } catch {
            return false
        }
    }
}

// MARK: - Push payload parser

public struct ANDXAgentReplyPush: Sendable {
    public let ticketId: String
    public let agentName: String
    public let title: String
    public let body: String

    /// Parse an incoming push payload. Returns nil if it isn't an ANDX
    /// agent-reply push (routes it back through to your normal push handler).
    ///
    /// Call from `UNUserNotificationCenterDelegate.userNotificationCenter(_:willPresent:withCompletionHandler:)`
    /// and `didReceive:withCompletionHandler:`.
    public static func parse(userInfo: [AnyHashable: Any]) -> ANDXAgentReplyPush? {
        guard let type = userInfo["type"] as? String, type == "agent_reply" else { return nil }
        let ticketId = (userInfo["ticket_id"] as? String) ?? ""
        let agentName = (userInfo["agent_name"] as? String) ?? "Live agent"
        let aps = userInfo["aps"] as? [String: Any] ?? [:]
        let alert = aps["alert"] as? [String: Any] ?? [:]
        let title = alert["title"] as? String ?? "\(agentName) replied"
        let body = alert["body"] as? String ?? ""
        return ANDXAgentReplyPush(ticketId: ticketId, agentName: agentName, title: title, body: body)
    }
}
