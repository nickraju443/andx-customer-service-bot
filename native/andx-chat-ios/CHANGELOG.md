# Changelog

All notable changes to the ANDX Chat iOS SDK.

## [0.1.0] — Initial release

- SwiftUI panel with welcome, chat, and email-gate views
- AI chat via `POST /api/ask`
- Live agent handoff via Zoho Desk (`/api/handoff`, `/api/handoff-message`, `/api/handoff-poll`, `/api/handoff-queue`, `/api/handoff-end`, `/api/handoff-transcript`)
- Emoji reactions (long-press context menu) with 👎 auto-rephrase
- Reply-to for quoted context
- Persistent conversations via UserDefaults
- Retry on errored AI messages
- Push notifications: `ANDXPushRegistrar.register(sessionId:fcmToken:)` and `ANDXAgentReplyPush.parse(userInfo:)`
- Themeable via `ANDXTheme` (cyberpunk cyan defaults)
- Public API: `ANDXSupportChatView`, `.andxSupportChat(isPresented:config:)`, `ANDXSupportChatConfig`
- Minimum iOS 15.0
- Zero build-time dependencies
