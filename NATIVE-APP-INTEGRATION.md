# ANDX Support Bot — Native App Integration Guide

This document gives the mobile dev team three ways to add the ANDX support bot ("XORE") to the iOS and Android apps. **Option 1 (WebView)** is the recommended starting point — it ships in a day, requires zero UI work, and stays in sync with the web widget automatically. Options 2 and 3 are for teams that want a fully native chat surface.

---

## 1. Backend it talks to

**Production URL:** `https://andx-bot-245374915379.us-central1.run.app`

All HTTP. No auth required from the client side. CORS is open to `*.andx.global`, `*.andxus.io`, `localhost`, and `null` (which covers WebView origins on mobile). If the mobile team uses a custom WebView origin (e.g. `capacitor://`, `ionic://`, `https://app.local`), send the origin to us and we'll add it to the allowlist in `app.py:12`.

Anthropic API key, Zoho Desk credentials, and SMTP settings live as env vars on the Cloud Run service — the client never sees or sends them.

---

## 2. Option 1 — Embed in a WebView *(recommended)*

The bot is already built as a self-contained mobile-optimized page. Just point a full-screen WebView at:

```
https://andx-bot-245374915379.us-central1.run.app/mobile
```

That URL returns a dark page sized for phones with the chat panel pre-opened in full-screen. Backend handles every detail: AI replies, live agent handoff, queue management, persistent chat history (via sessionStorage), reactions, reply-to, email gating after hours.

### iOS (Swift / SwiftUI)

```swift
import SwiftUI
import WebKit

struct SupportBotView: UIViewRepresentable {
    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        let webView = WKWebView(frame: .zero, configuration: config)
        webView.scrollView.bounces = false
        webView.isOpaque = false
        webView.backgroundColor = .black
        if let url = URL(string: "https://andx-bot-245374915379.us-central1.run.app/mobile") {
            webView.load(URLRequest(url: url))
        }
        return webView
    }
    func updateUIView(_ uiView: WKWebView, context: Context) {}
}
```

Push it from your Support tab:

```swift
NavigationLink("Get help", destination: SupportBotView()
    .navigationTitle("Support")
    .ignoresSafeArea(.keyboard, edges: .bottom))
```

**Info.plist** — no special permissions needed. Internet access only.

### Android (Kotlin / Jetpack Compose)

```kotlin
@Composable
fun SupportBotScreen() {
    AndroidView(factory = { ctx ->
        WebView(ctx).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true        // required — chat history uses sessionStorage
            settings.databaseEnabled = true
            settings.loadWithOverviewMode = true
            settings.useWideViewPort = true
            setBackgroundColor(Color.BLACK)
            webViewClient = WebViewClient()
            loadUrl("https://andx-bot-245374915379.us-central1.run.app/mobile")
        }
    })
}
```

**AndroidManifest.xml** — needs:

```xml
<uses-permission android:name="android.permission.INTERNET" />
```

That's it. No `usesCleartextTraffic` flag, the bot URL is HTTPS.

### React Native (single codebase)

```jsx
import { WebView } from 'react-native-webview';

export default function SupportBot() {
  return (
    <WebView
      source={{ uri: 'https://andx-bot-245374915379.us-central1.run.app/mobile' }}
      style={{ flex: 1, backgroundColor: '#050508' }}
      domStorageEnabled
      javaScriptEnabled
      originWhitelist={['*']}
      mediaPlaybackRequiresUserAction={false}
    />
  );
}
```

### Flutter

```dart
import 'package:webview_flutter/webview_flutter.dart';

final controller = WebViewController()
  ..setJavaScriptMode(JavaScriptMode.unrestricted)
  ..setBackgroundColor(const Color(0xFF050508))
  ..loadRequest(Uri.parse('https://andx-bot-245374915379.us-central1.run.app/mobile'));

class SupportBotScreen extends StatelessWidget {
  @override
  Widget build(BuildContext context) =>
    Scaffold(body: SafeArea(child: WebViewWidget(controller: controller)));
}
```

### Things to verify on first build

1. Page loads black (not white flash) when the WebView appears
2. The XORE sphere is visible at the bottom-right within ~1 second
3. Tapping it opens the chat panel full-screen
4. Asking "What is ANDX?" returns an AI reply within a few seconds
5. Tapping "Chat with a live agent" shows the email gate (no live agent online during off-hours is expected — they'll see a message saying so)
6. Closing and reopening the app preserves the conversation (sessionStorage)

---

## 3. Option 2 — Embed only the floating button, full chat in modal

If you want the bot to live as a floating action button on every screen and only open into chat when tapped, use this URL instead:

```
https://andx-bot-245374915379.us-central1.run.app/fab-embed
```

This returns a transparent page with only the sphere FAB visible. Mount it in a small fixed-position WebView (e.g. 90×90 px in the bottom-right). When the user taps it, the WebView itself grows to full-screen (you'll need a JS bridge or `onMessage` listener to intercept the click).

For most teams this is more work than Option 1 with no real benefit. Skip unless you have a specific UX requirement for a global FAB across the entire app.

---

## 4. Option 3 — Build native chat UI against the REST API

The full chat experience can be reproduced in native UI. All endpoints are JSON over HTTPS. Below are the contracts.

### `POST /api/ask` — Send a message, get an AI reply

```json
// Request
{
  "question": "What is ANDX?",
  "mode": "beginner",                    // or "pro"
  "session_id": "device-uuid-here",       // any stable string per install
  "history": [                            // optional, last ~10 turns
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ],
  "reply_to": {                           // optional — for reply-to-message UX
    "id": "msg-uuid",
    "role": "assistant",
    "text": "..."
  }
}

// Response
{
  "answer": "ANDX is a crypto trading platform...",
  "followups": [                          // suggested next questions
    "How do I sign up?",
    "Is it free?",
    "What chains does it support?"
  ]
}
```

### `GET /api/agent-status` — Check if live agents are available

```json
// Response
{ "available": true, "configured": true }
```

Use this to decide whether to show the "Chat with a live agent" button. `available: false` means after-hours.

### `POST /api/handoff` — Start a live-agent conversation

```json
// Request — email is REQUIRED
{
  "email": "user@example.com",
  "name": "Jane Doe",                     // optional
  "first_message": "I can't log in",      // optional
  "session_id": "device-uuid-here",
  "page_url": "andx-mobile-app",          // for context in the agent ticket
  "history": [/* same shape as /api/ask */]
}

// Response
{
  "ticket_id": "1234567000001234567",
  "token": "...",                          // store this — required for all follow-up calls
  "queue_position": 2,
  "estimated_wait_min": 5
}
```

### `POST /api/handoff-message` — Send a message in an active live chat

```json
{
  "ticket_id": "...",
  "token": "...",
  "message": "Still waiting for the agent",
  "reply_to": { /* optional */ }
}
// Response: { "ok": true }
```

### `GET /api/handoff-poll?ticket_id=...&token=...&since=<unix_ms>` — Poll for new agent replies

```json
// Response
{
  "messages": [
    {
      "id": "msg-uuid",
      "agent_name": "Mary Williams",       // already disguised
      "text": "Hi! How can I help?",
      "ts": 1731234567890
    }
  ],
  "agent_typing": false,                   // true if agent currently typing
  "ticket_closed": false                   // true if agent closed the ticket
}
```

**Poll cadence:** every 4 seconds while the chat is open. Stop polling when the screen is backgrounded. The web widget also uses 4s.

### `GET /api/handoff-queue?ticket_id=...&token=...` — Live queue position + heartbeat

```json
// Response
{
  "state": "queued",                       // or "active" or "ended"
  "position": 2,
  "total": 4,
  "estimated_wait_min": 5,
  "agent_name": null                       // populated once active
}
```

**IMPORTANT:** Calling this endpoint **also acts as a heartbeat** — it tells the backend the user is still waiting. If you stop polling for 30 seconds, the backend will assume they left and free their spot. Poll every 10–15 seconds while the chat panel is visible.

### `POST /api/handoff-end` — User ends the live chat

```json
{ "ticket_id": "...", "token": "..." }
// Response: { "ok": true }
```

Call this when the user explicitly taps "End live chat", or when they swipe-close the support screen. Frees the queue spot and closes the ticket in Zoho.

### `POST /api/reaction` — User reacts to a message (👍 ❤️ 😂 😮 😢 👎)

```json
{
  "ticket_id": "...",        // optional — only present in live agent mode
  "token": "...",
  "message_id": "msg-uuid",
  "message_text": "the bubble text",
  "reaction": "👍",
  "role": "assistant"        // or "agent"
}
// Response: { "ok": true, "rephrased": "..." }   // rephrased only present on 👎 against AI
```

If the user dislikes an AI reply, the response will include `rephrased` — show that as a new AI message.

### `POST /api/handoff-transcript` — Email the full chat transcript to the user

```json
{ "ticket_id": "...", "token": "..." }
// Response: { "ok": true }
```

Trigger this from a "Email me the transcript" button on the live-chat screen.

---

## 5. State the native client should track

```
sessionId          string   — generate once per install, persist forever
chatMode           string   — "beginner" or "pro"
chatHistory        array    — last 50 messages, persist to disk
activeTicketId     string?  — null when not in live chat
activeTicketToken  string?  — paired with ticketId
liveAgentName      string?  — set when agent picks up
lastPollTimestamp  int      — for /api/handoff-poll's `since` param
```

Persist `chatHistory` and live-agent state to local storage (UserDefaults / SharedPreferences / AsyncStorage) so users don't lose their conversation if they background the app and come back.

---

## 6. Push notifications (optional, recommended)

The current web widget uses tab-title flashing + sound when a live agent replies. On mobile you should use real push notifications instead. We don't currently send pushes from the backend — if you want this, the mobile team needs to:

1. Register an FCM / APNs token with the backend (we'll add a new `POST /api/register-push-token` endpoint)
2. Backend will send a push to that token whenever a live agent posts to the user's open ticket
3. Tapping the push opens the support screen with the ticket already loaded

Tell us when you're ready and we'll wire up the push endpoint. Until then, in-app polling (Option 1 or Option 3) handles message delivery while the chat screen is visible.

---

## 7. Branding hooks

The widget uses ANDX colors (electric cyan #00e0ff on near-black #050508). If the native app uses a different palette and the team builds custom UI (Option 3), match these for consistency:

| Token | Value | Use |
|-------|-------|-----|
| `bg/panel` | `#050508` | Chat surface |
| `bg/elevated` | `#08080d` | Bubbles, popovers |
| `accent/primary` | `#00e0ff` | Buttons, sender labels, links |
| `accent/alert` | `#ff2ec8` | Live agent highlights, errors |
| `accent/online` | `#00ff9e` | "Live" status indicators |
| `text/primary` | `#d8e0ec` | Body text |
| `text/secondary` | `rgba(216,224,236,.55)` | Meta, timestamps |

Fonts used by the web widget (if you want pixel parity in native): **Space Grotesk** (headings), **Inter** (body), **JetBrains Mono** (meta/labels/timestamps). All free on Google Fonts.

---

## 8. Health check

Before integration, hit the health endpoint to confirm backend reachability:

```
GET https://andx-bot-245374915379.us-central1.run.app/health
→ 200 { "status": "ok", "zoho": true, "ai": true }
```

---

## 9. Support contact

For backend changes, new endpoints, or CORS additions for a new WebView origin, contact **nick@andxus.io**. The bot source lives in the `andx-customer-service-bot` repo and is deployed via Cloud Run (`gcloud run deploy andx-bot --source . --region us-central1 --project andx-support-bot`).

---

## TL;DR for the dev team

> **Fastest path: drop a WebView pointing at `https://andx-bot-245374915379.us-central1.run.app/mobile` into your Support screen. That's it.** Two lines of code per platform. Everything else — AI, live agents, queue, reactions, history — is already handled server-side.
