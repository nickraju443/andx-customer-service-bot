# ANDX Chat iOS Demo

A minimal iOS app showing how to integrate the ANDX support chat SDK.

## Run it

Xcode project files are quirky to hand-craft, so this demo ships as Swift source files. Setting up a runnable project takes 60 seconds:

1. Open Xcode → **File → New → Project** → App template. Set the product name to `ANDXChatDemo` (or anything). Language: Swift, Interface: SwiftUI, Include Tests: unchecked.
2. Delete the auto-generated `ContentView.swift` from the new project.
3. Drag the two files in `ANDXChatDemo/` into your Xcode project navigator. When prompted, check "Copy items if needed."
4. **File → Add Package Dependencies → Add Local** → select the `../andx-chat-ios/` folder (one level up from this demo). Add the `ANDXSupportChat` product to your target.
5. Set the deployment target to iOS 15.0 in your target's General settings.
6. Hit Run.
7. When the app opens, tap the green **Support** pill in the top right. The full chat panel slides up.

That's it. AI chat, live agent handoff, everything works out of the box.

## What's in this demo

- `ANDXChatDemoApp.swift` — SwiftUI app entry point, one WindowGroup showing `DemoView`.
- `DemoView.swift` — a screen with a mocked-up "app header" containing a Support pill. Tapping the pill sets `supportOpen = true`, which triggers the `.andxSupportChat(...)` view modifier to present the chat.
- `Info.plist` — minimal Info.plist for the app target.

The whole integration is about 10 lines of code — see `DemoView.body` in `DemoView.swift`.

## What to change for your app

Only two things:

1. Replace `SupportPill(onTap: ...)` with your app's real Support pill component (from the top right of Home).
2. Replace `pageContext: "Sample app"` with something meaningful like `"Home"` or `"Trade"`.

Everything else stays the same.
