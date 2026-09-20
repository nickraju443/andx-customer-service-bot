# Changelog

All notable changes to the ANDX Chat Android SDK.

## [0.1.0] — Initial release

- Jetpack Compose panel with welcome, chat, and email-gate views
- AI chat via `POST /api/ask`
- Live agent handoff via Zoho Desk (`/api/handoff`, `/api/handoff-message`, `/api/handoff-poll`, `/api/handoff-queue`, `/api/handoff-end`, `/api/handoff-transcript`)
- Emoji reactions (long-press dropdown menu) with 👎 auto-rephrase
- Reply-to for quoted context
- Persistent conversations via DataStore Preferences
- Retry on errored AI messages
- Push notifications: `ANDXPushRegistrar.register(context, sessionId, fcmToken)` and `ANDXAgentReplyPush.parse(data)`
- Themeable via `ANDXTheme` (cyberpunk cyan defaults)
- Public API: `@Composable ANDXSupportChat(config, onDismiss)` and `ANDXSupportChatConfig`
- Minimum Android API 26 (Android 8+)
- Build dependencies: OkHttp, kotlinx-serialization, DataStore, Compose Material 3
- Firebase Messaging is a soft/compile-only dependency
