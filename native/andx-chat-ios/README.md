# ANDX Chat (iOS)

This is the support chat from andx.ai, packaged as a Swift Package for iOS. Wire it to the green Support pill at the top right of the app and users get the full thing: AI chat, live agent handoff, queue with heartbeat, reactions, reply-to, push notifications, persistent conversations. Same backend the web widget uses.

## Firebase config

Bundle identifier is `one.andx.platform`.

`GoogleService-Info.plist` is attached separately with this delivery (or forwarded by Op). Drop it into your Xcode project next to `Info.plist`. That file plus `@react-native-firebase` / `Firebase iOS SDK` is everything you need for push notifications to deliver when an agent replies.

Everything else works today without touching Firebase. Start with Install below.

Nick
nick@andxus.io

---

## Install

The SDK ships as a Swift Package. In Xcode:

1. `File → Add Package Dependencies…`
2. Click **Add Local…** at the bottom and pick this folder (`andx-chat-ios`).
3. Add the `ANDXSupportChat` product to your app target.

Or, if you want to add it to `Package.swift` directly:

```swift
dependencies: [
    .package(path: "../andx-chat-ios"),
],
targets: [
    .target(
        name: "YourApp",
        dependencies: [
            .product(name: "ANDXSupportChat", package: "andx-chat-ios"),
        ]
    ),
]
```

Minimum iOS version: **15.0**. Uses SwiftUI, URLSession, UserDefaults. Zero third-party dependencies at build time.

## Wire it to the Support pill

The Support button is already in the app (green pill, top right of home). Bind an `@State Bool` to whether the chat is presented, flip it when the user taps the pill, and drop the `.andxSupportChat(...)` modifier on the root view.

```swift
import SwiftUI
import ANDXSupportChat

struct HomeScreen: View {
    @State private var supportOpen = false
    let currentUser: User?  // your app's user model

    var body: some View {
        VStack {
            // your existing header with the Support pill
            HStack {
                Spacer()
                Button(action: { supportOpen = true }) {
                    Label("Support", systemImage: "questionmark.circle.fill")
                        .padding(.horizontal, 12).padding(.vertical, 6)
                        .background(Color.green.opacity(0.2))
                        .foregroundColor(.green)
                        .clipShape(Capsule())
                }
            }

            // rest of your Home screen
        }
        .andxSupportChat(
            isPresented: $supportOpen,
            config: ANDXSupportChatConfig(
                userEmail: currentUser?.email,
                userName: currentUser?.name,
                pageContext: "Home"
            )
        )
    }
}
```

Three things to notice:

1. `@State private var supportOpen` owns the presented state. Flip it to `true` when the user taps the Support pill.
2. `.andxSupportChat(isPresented:config:)` is a view modifier that presents the chat as a full-screen cover. It dismisses when the user taps the × in the panel header.
3. Pass `userEmail` and `userName` if the user is logged in. Saves them typing it when they start a live-agent chat.

### Make the Support pill live on every screen

Right now the pill lives on the Home screen only. To make it persistent across Trade, Competitions, Account, etc., put the button + the `.andxSupportChat(...)` modifier in a shared layout view and use it on every screen:

```swift
struct AppShell<Content: View>: View {
    @State private var supportOpen = false
    let currentUser: User?
    let content: () -> Content

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Spacer()
                Button(action: { supportOpen = true }) {
                    // your Support pill styling
                }
            }
            content()
        }
        .andxSupportChat(
            isPresented: $supportOpen,
            config: ANDXSupportChatConfig(
                userEmail: currentUser?.email,
                userName: currentUser?.name,
                pageContext: "Global"
            )
        )
    }
}

// then every screen:
struct TradeScreen: View {
    var body: some View {
        AppShell(currentUser: currentUser) {
            // trade UI
        }
    }
}
```

If you already have a top-level navigation container (`NavigationStack`, `TabView`, custom router), mount the modifier at that level instead. One `.andxSupportChat` per app, at the root.

## Public API

Three types you use:

- `ANDXSupportChatView` — the panel as a plain SwiftUI view. Use if you need to embed it inside your own navigation.
- `.andxSupportChat(isPresented:config:)` — view modifier that presents the chat as a full-screen cover. Recommended.
- `ANDXSupportChatConfig` — all the props (userEmail, userName, pageContext, initialMode, theme).

That's it. Everything else is internal.

## Backend

Talks to `https://andx-bot-245374915379.us-central1.run.app`. No auth required from the client. All 10 endpoints are documented inline in `Sources/ANDXSupportChat/Models.swift`.

Point at a different backend if you need to (staging, local dev):

```swift
APIClient.shared.setBaseURL(URL(string: "http://localhost:8080")!)
```

## Push notifications

Backend endpoint (`POST /api/register-push-token`) is live and firing FCM pushes to registered tokens whenever an agent replies. To hook it up on iOS you need Firebase Messaging in your host app.

### 1. Add Firebase Messaging to your app

```swift
// Package.swift
.package(url: "https://github.com/firebase/firebase-ios-sdk", from: "11.0.0"),
// then in targets:
.product(name: "FirebaseMessaging", package: "firebase-ios-sdk"),
```

### 2. Register the app in Firebase

I'll do this — I just need your bundle ID (see top of this README). Once I send you `GoogleService-Info.plist`, drop it into your Xcode project next to `Info.plist`.

You'll also need an **APNs auth key** uploaded to Firebase. If you don't have one already on the Apple Developer team, generate one (Apple Developer Portal → Keys → new key with APNs enabled) and I'll upload it. Takes 5 minutes.

### 3. Xcode capabilities

- Add **Push Notifications** capability (Signing & Capabilities tab).
- Add **Background Modes** capability with **Remote notifications** checked.

### 4. Wire it up in AppDelegate

```swift
import Firebase
import FirebaseMessaging
import UserNotifications
import ANDXSupportChat

class AppDelegate: NSObject, UIApplicationDelegate, MessagingDelegate, UNUserNotificationCenterDelegate {
    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey : Any]? = nil) -> Bool {
        FirebaseApp.configure()
        Messaging.messaging().delegate = self
        UNUserNotificationCenter.current().delegate = self
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { _, _ in }
        application.registerForRemoteNotifications()
        return true
    }

    func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        guard let token = fcmToken else { return }
        Task {
            await ANDXPushRegistrar.shared.register(
                sessionId: getYourStableInstallId(),
                fcmToken: token
            )
        }
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                didReceive response: UNNotificationResponse,
                                withCompletionHandler completionHandler: @escaping () -> Void) {
        if let payload = ANDXAgentReplyPush.parse(userInfo: response.notification.request.content.userInfo) {
            // Navigate to your Support screen. The stored ticket in UserDefaults
            // will auto-reload when ANDXSupportChatView mounts.
            openSupportScreen(ticketId: payload.ticketId)
        }
        completionHandler()
    }
}
```

## Theming

Cyberpunk cyan on near-black by default. Override tokens per instance:

```swift
ANDXSupportChatConfig(
    theme: ANDXTheme(
        bg: .init(
            panel: Color(red: 0.1, green: 0.1, blue: 0.12),
            elevated: .black,
            deep: .black
        ),
        accent: .init(
            primary: Color(red: 1.0, green: 0.5, blue: 0.0),  // orange instead of cyan
            alert: .pink,
            online: .green
        ),
        text: .init(
            primary: .white,
            secondary: .white.opacity(0.6),
            muted: .white.opacity(0.3),
            inverse: .black
        ),
        border: .init(
            default: .white.opacity(0.15),
            strong: .white.opacity(0.35),
            subtle: .white.opacity(0.08)
        )
    )
)
```

Or just use `.default` and skip theming.

## Persistence

Conversations survive app restarts. `UserDefaults` keys used:

- `xore.chatHistory` — last 50 messages
- `xore.liveAgent` — active ticket ID + token + queue state
- `xore.lastEmail` — auto-fill on the email gate
- `xore.sessionId` — stable per-install UUID
- `xore.mode` — beginner or pro
- `xore.reactions` — emoji reactions per message ID

If a user backgrounds the app during a live agent chat and comes back, the conversation is right where they left it. If they leave for more than 30 seconds, the backend frees their queue spot — that's intentional and matches the web widget.

## Verification checklist

Test on a physical iPhone:

- [ ] Support pill opens the chat panel
- [ ] Welcome screen shows four chips
- [ ] "What is ANDX?" → AI replies within a few seconds
- [ ] "Chat with a live agent" → email gate appears (email required)
- [ ] Submit email + first message → queue widget shows position + wait time
- [ ] Once an agent picks up → messages arrive every ~4 seconds
- [ ] Long-press an AI bubble → context menu with reactions + Reply
- [ ] 👎 on an AI message → rephrased reply appears
- [ ] Close panel, reopen → conversation restored
- [ ] Force-quit app, reopen → conversation still there
- [ ] Background app for 30+ seconds → queue spot freed on the Zoho side
- [ ] Tap END in the header → ticket closes in Zoho

For push (after I send the Firebase config file): use Firebase Console → Cloud Messaging → send a test push to a registered device, confirm it lands in the notification tray, tap it, app opens.

## Questions

Anything weird, anything you want changed, anything that doesn't work — ping me.

Nick
nick@andxus.io
