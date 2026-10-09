# ANDX Chat (Android)

This is the support chat from andx.global, packaged as a Gradle library for Android. Wire it to the green Support pill at the top right of the app and users get the full thing: AI chat, live agent handoff, queue with heartbeat, reactions, reply-to, push notifications, persistent conversations. Same backend the web widget uses.

## Firebase config

Package name: `one.and.platform`.

`google-services.json` is attached separately with this delivery (or forwarded by Op). Drop it into `android/app/`. That file plus Firebase Messaging is everything you need for push notifications to deliver when an agent replies.

Everything else works today without touching Firebase. Start with Install below.

Nick
nick@andxus.io

---

## Install

The SDK ships as an Android library module.

**Option 1: local module** (fastest if you're OK with a git submodule or vendored folder)

In your app's `settings.gradle.kts`:

```kotlin
include(":andx-chat-android")
project(":andx-chat-android").projectDir = file("../path/to/andx-chat-android")
```

In your app's `build.gradle.kts`:

```kotlin
dependencies {
    implementation(project(":andx-chat-android"))
}
```

**Option 2: local AAR** (if you don't want the module in your workspace)

Build once:
```bash
cd andx-chat-android && ./gradlew :assembleRelease
```

Copy `build/outputs/aar/andx-chat-android-release.aar` into your app's `libs/` folder and reference it:

```kotlin
dependencies {
    implementation(files("libs/andx-chat-android-release.aar"))
}
```

Minimum Android: **API 26** (Android 8+). Compose + Material 3.

## Wire it to the Support pill

The Support button is already in the app (green pill, top right of home). Hoist a `mutableStateOf(false)` in your host screen, flip it when the user taps the pill, render the composable when it's true.

```kotlin
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import com.andx.supportchat.ANDXSupportChat
import com.andx.supportchat.ANDXSupportChatConfig

@Composable
fun HomeScreen(currentUser: User?) {
    var supportOpen by remember { mutableStateOf(false) }

    Column {
        // your existing header with the Support pill
        Row(horizontalArrangement = Arrangement.End) {
            SupportPill(onClick = { supportOpen = true })
        }
        // rest of your Home screen
    }

    if (supportOpen) {
        ANDXSupportChat(
            config = ANDXSupportChatConfig(
                userEmail = currentUser?.email,
                userName = currentUser?.name,
                pageContext = "Home",
            ),
            onDismiss = { supportOpen = false },
        )
    }
}
```

Three things to notice:

1. `var supportOpen by remember { mutableStateOf(false) }` owns whether the chat is shown. Flip it to `true` when the user taps the Support pill.
2. `ANDXSupportChat(...)` is a Composable that renders the full chat panel edge-to-edge. Put it inside a `Dialog`, a `ModalBottomSheet`, or a full-screen route — whichever fits your navigation.
3. Pass `userEmail` and `userName` if the user is logged in. Saves them typing when they start a live agent chat.

### Rendering it as a full-screen route (recommended)

For a proper full-screen experience, wrap the composable in a `Dialog` with `DialogProperties(usePlatformDefaultWidth = false)`:

```kotlin
if (supportOpen) {
    Dialog(
        onDismissRequest = { supportOpen = false },
        properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false),
    ) {
        ANDXSupportChat(
            config = ANDXSupportChatConfig(
                userEmail = currentUser?.email,
                pageContext = "Home",
            ),
            onDismiss = { supportOpen = false },
        )
    }
}
```

Or as a Navigation Compose destination:

```kotlin
composable("support") {
    ANDXSupportChat(
        config = ANDXSupportChatConfig(userEmail = currentUser?.email, pageContext = "Support"),
        onDismiss = { navController.popBackStack() },
    )
}

// then to open:
Button(onClick = { navController.navigate("support") }) { Text("Support") }
```

### Make the Support pill live on every screen

Right now the pill only shows on Home. To make it persistent across Trade, Competitions, Account, etc., put the Support pill + the `if (supportOpen) ANDXSupportChat(...)` block in a shared layout composable:

```kotlin
@Composable
fun AppShell(currentUser: User?, content: @Composable () -> Unit) {
    var supportOpen by remember { mutableStateOf(false) }

    Column(Modifier.fillMaxSize()) {
        Row(horizontalArrangement = Arrangement.End) {
            SupportPill(onClick = { supportOpen = true })
        }
        content()
    }

    if (supportOpen) {
        Dialog(
            onDismissRequest = { supportOpen = false },
            properties = DialogProperties(usePlatformDefaultWidth = false),
        ) {
            ANDXSupportChat(
                config = ANDXSupportChatConfig(
                    userEmail = currentUser?.email,
                    userName = currentUser?.name,
                    pageContext = "Global",
                ),
                onDismiss = { supportOpen = false },
            )
        }
    }
}

// then every screen uses it:
@Composable
fun TradeScreen() {
    AppShell(currentUser = currentUser) {
        // trade UI
    }
}
```

If you already have a top-level navigation container (`NavHost`, custom router), mount the button + dialog at that level instead. One `AppShell` per app, at the root.

## Public API

Two things you use:

- `ANDXSupportChat(config, onDismiss)` — the full panel as a Composable
- `ANDXSupportChatConfig(userEmail, userName, pageContext, initialMode, theme)` — all the config

That's it. Everything else is internal.

## Backend

Talks to `https://andx-bot-245374915379.us-central1.run.app`. No auth required from the client. All 10 endpoints are documented in `src/main/java/com/andx/supportchat/api/Models.kt`.

Point at a different backend if you need to (staging, local dev):

```kotlin
val client = ApiClient(baseUrl = "http://10.0.2.2:8080")  // 10.0.2.2 is host machine from Android emulator
```

## Push notifications

Backend endpoint (`POST /api/register-push-token`) is live and firing FCM pushes to registered tokens whenever an agent replies.

### 1. Add Firebase Messaging to your app

In your app's `build.gradle.kts`:

```kotlin
plugins {
    id("com.google.gms.google-services")
}

dependencies {
    implementation(platform("com.google.firebase:firebase-bom:33.4.0"))
    implementation("com.google.firebase:firebase-messaging")
}
```

In project-level `build.gradle.kts`:

```kotlin
plugins {
    id("com.google.gms.google-services") version "4.4.2" apply false
}
```

### 2. Register the app in Firebase

I'll do this — I just need your Android package name (see top of this README). Once I send you `google-services.json`, drop it into `android/app/`.

### 3. Register the FCM token with the backend

Somewhere near app startup (e.g. in `Application.onCreate()` or your first Activity):

```kotlin
import com.andx.supportchat.push.ANDXPushRegistrar
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
    if (!task.isSuccessful) return@addOnCompleteListener
    val token = task.result
    CoroutineScope(Dispatchers.IO).launch {
        ANDXPushRegistrar.register(
            context = applicationContext,
            sessionId = getYourStableInstallId(),
            fcmToken = token,
        )
    }
}
```

### 4. Handle incoming pushes

Create a `FirebaseMessagingService` and route ANDX pushes through the SDK's payload parser:

```kotlin
class ANDXPushService : FirebaseMessagingService() {
    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        val agentPush = ANDXAgentReplyPush.parse(remoteMessage.data)
        if (agentPush != null) {
            // Show a notification, deep-link into Support screen, etc.
            showAgentReplyNotification(agentPush)
        }
    }

    override fun onNewToken(token: String) {
        CoroutineScope(Dispatchers.IO).launch {
            ANDXPushRegistrar.register(applicationContext, getYourStableInstallId(), token)
        }
    }
}
```

Register the service in `AndroidManifest.xml`:

```xml
<service
    android:name=".ANDXPushService"
    android:exported="false">
    <intent-filter>
        <action android:name="com.google.firebase.MESSAGING_EVENT" />
    </intent-filter>
</service>
```

### 5. Android 13+ notification permission

On Android 13 and up, you need to request `POST_NOTIFICATIONS` at runtime before pushes will show:

```kotlin
if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
    val perm = Manifest.permission.POST_NOTIFICATIONS
    if (ContextCompat.checkSelfPermission(this, perm) != PackageManager.PERMISSION_GRANTED) {
        ActivityCompat.requestPermissions(this, arrayOf(perm), 100)
    }
}
```

### 6. Notification channel (recommended)

```kotlin
val channel = NotificationChannel(
    "xore_support",
    "XORE Support",
    NotificationManager.IMPORTANCE_HIGH,
)
getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
```

## Theming

Cyberpunk cyan on near-black by default. Override tokens per instance:

```kotlin
ANDXSupportChatConfig(
    theme = ANDXTheme.Default.copy(
        accent = ANDXTheme.Default.accent.copy(
            primary = Color(0xFFFF8800),  // orange instead of cyan
        ),
    ),
)
```

Full token list:

```kotlin
ANDXTheme(
    bg = Backgrounds(panel, elevated, deep),
    accent = Accents(primary, alert, online),
    text = TextColors(primary, secondary, muted, inverse),
    border = Borders(default, strong, subtle),
    radius = Radius(sm, md, lg),
    fontFamily = FontFamily.Default,
    monoFontFamily = FontFamily.Monospace,
)
```

## Persistence

Conversations survive app restarts via DataStore Preferences. Keys used:

- `xore.chatHistory` — last 50 messages
- `xore.liveAgent` — active ticket ID + token + queue state
- `xore.lastEmail` — auto-fill on the email gate
- `xore.sessionId` — stable per-install UUID
- `xore.mode` — beginner or pro
- `xore.reactions` — emoji reactions per message ID

If a user backgrounds the app during a live agent chat and comes back, the conversation is right where they left it. If they leave for more than 30 seconds, the backend frees their queue spot — that's intentional and matches the web widget.

## Verification checklist

Test on a physical Android device:

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
