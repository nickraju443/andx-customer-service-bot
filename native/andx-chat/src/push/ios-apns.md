# iOS APNs Setup for ANDX Support Bot

This walks through everything Xcode/Firebase needs so the XORE bot can deliver push notifications when a live agent replies on iOS.

> **Backend status:** the `POST /api/register-push-token` endpoint is documented in `src/api/types.ts` and `src/api/pushTokens.ts` but is not yet implemented on the Cloud Run service. Until it ships, this setup is harmless — token registration will silently no-op. Schedule this setup so it's done by the time the backend ships.

---

## 1. Install dependencies

In the ANDX app root:

```bash
yarn add @react-native-firebase/app @react-native-firebase/messaging
cd ios && pod install && cd ..
```

## 2. Firebase project setup

1. Go to https://console.firebase.google.com and select (or create) the ANDX project.
2. **Project settings → General → Your apps → Add app → iOS**.
3. Enter the iOS bundle ID (e.g. `ai.andx.app` — check `ios/AppName/Info.plist` for the actual value).
4. Download `GoogleService-Info.plist` and drag it into your Xcode project under `ios/AppName/` (NOT inside any subfolder — the file must live at the same level as `Info.plist`). When Xcode prompts, check **"Copy items if needed"** and add it to your app target.

## 3. APNs auth key (once per Apple Developer team)

1. Visit https://developer.apple.com/account/resources/authkeys/list.
2. Click **+** to create a new Key. Name: "ANDX Push". Check **Apple Push Notifications service (APNs)**. Continue → Register → **Download** the `.p8` file (you can only download it once — save it somewhere safe).
3. Note the **Key ID** (10 chars, e.g. `ABC123DEFG`) and your **Team ID** (10 chars, top right of the Apple Developer site).
4. In the Firebase console → **Project settings → Cloud Messaging → Apple app configuration → APNs Authentication Key → Upload**. Provide the `.p8` file, Key ID, and Team ID.

## 4. Xcode capabilities

1. Open `ios/AppName.xcworkspace` (the `.xcworkspace`, not `.xcodeproj`).
2. Select the app target → **Signing & Capabilities** → **+ Capability**.
3. Add **Push Notifications**.
4. Add **Background Modes** and check:
   - ☑ Remote notifications
   - ☑ Background fetch (optional, helps with delivery)

## 5. AppDelegate registration

Open `ios/AppName/AppDelegate.swift` (or `AppDelegate.mm` for older RN templates). At the top:

```swift
import Firebase
```

In `application(_:didFinishLaunchingWithOptions:)`, BEFORE the `return true`:

```swift
FirebaseApp.configure()
```

That's it for iOS — `@react-native-firebase/messaging` handles APNs token retrieval and delivery to the JS side from there.

## 6. Test

Build and run on a **physical device** (the iOS Simulator cannot receive remote APNs pushes — you'll see this fail silently if you test on Simulator).

In your `App.tsx`, the package's `attachPushHandlers()` + `registerPushToken()` calls should already be wired (see README). Confirm:

1. App prompts for notification permission on first launch (after `registerPushToken` is called).
2. The Xcode console logs an APNs token (start with `FIRMessaging`).
3. Use **Firebase Console → Cloud Messaging → Send test message** to send a test push to that token. Body should appear in the iOS notification tray.
4. Tap the push → app opens; `onPushOpen` fires.

## 7. Production checklist

- ☑ APNs auth key uploaded to Firebase
- ☑ `GoogleService-Info.plist` checked into git (it's safe — it's a client identifier, not a secret)
- ☑ Push entitlement set to **production** for App Store builds (Xcode does this automatically when archiving for distribution)
- ☑ `aps-environment` in entitlements file (Xcode auto-manages)
- ☑ App Store Connect → App → Push notifications section enabled
- ☑ Backend `/api/register-push-token` endpoint deployed and FCM admin key configured in Cloud Run env vars

---

## Troubleshooting

**"FIRMessaging: No APNs device token available"** — you're on Simulator. Use a real device.

**Token registers but pushes never arrive** — check the Firebase console → Cloud Messaging diagnostic. If you see "InvalidRegistration", the token in the backend DB is stale; re-register.

**Permission prompt never shows** — check that `registerPushToken()` is actually being called and not blocked by `Platform.OS !== 'ios'`.

**Push lands but app doesn't deep-link to the chat** — verify `attachPushHandlers()` is called at app root (not inside a screen component), and that your handler calls `setOpen(true)` on the `<XoreSupportBot />`.
