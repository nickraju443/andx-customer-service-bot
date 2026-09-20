# ANDX Chat Android Demo

A minimal Android app showing how to integrate the ANDX support chat SDK.

## Run it

1. Open the `sample/` folder in Android Studio (Giraffe or newer)
2. Wait for Gradle sync
3. Hit Run (green triangle)
4. On the demo screen, tap the green Support pill in the top right
5. The full chat panel slides up. AI chat, live agent handoff, everything works out of the box.

## What's in this demo

- `MainActivity.kt` — one screen with a mocked-up "app header" containing a Support pill
- Tap the pill → `ANDXSupportChat` opens in a full-screen Dialog
- `pageContext = "Sample app"` gets tagged in Zoho tickets

That's it. The whole integration is about 15 lines of code — see `DemoScreen` in `MainActivity.kt`.

## What to change for your app

Only two things:

1. Replace `SupportPill(onClick = ...)` with your app's real Support pill component (from the top right of Home).
2. Replace `pageContext = "Sample app"` with something meaningful like `"Home"` or `"Trade"`.

Everything else stays the same.

## Files

```
sample/
├── build.gradle.kts        Root project (plugin versions)
├── settings.gradle.kts     Modules + points at ../andx-chat-android for the SDK
├── gradle.properties       JVM args + AndroidX
└── app/
    ├── build.gradle.kts    App module
    └── src/main/
        ├── AndroidManifest.xml
        └── java/com/andx/chatdemo/MainActivity.kt
```

The SDK is loaded as a local module (`../andx-chat-android`) via `settings.gradle.kts`. When the ANDX team ships the app for real, they can swap that for a Maven-published artifact.
