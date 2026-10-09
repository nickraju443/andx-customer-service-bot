# ANDX Chat

This is the support chat from andx.global, packaged for the native app (iOS + Android). Drop the `<XoreSupportBot />` component into a screen and you get the full thing: AI chat, live agents, queue, reactions, push notifications. Same backend the website already uses, no WebView.

## Firebase config

- iOS bundle identifier: `one.andx.platform`
- Android package name: `one.and.platform`

Two files are attached separately with this delivery: `GoogleService-Info.plist` for iOS and `google-services.json` for Android. Drop the plist into `ios/[AppName]/` next to `Info.plist`, and the json into `android/app/`. That's what makes push notifications deliver when an agent replies.

Everything else works today without touching Firebase. Start with Install below.

Nick
nick@andxus.io

---

## Install

```bash
yarn add file:./XoreSupportBot
yarn add react-native-svg @react-native-async-storage/async-storage react-native-reanimated
cd ios && pod install && cd ..
```

Optional (for push notifications):
```bash
yarn add @react-native-firebase/app @react-native-firebase/messaging
cd ios && pod install && cd ..
```

If you don't already have it, add this to `babel.config.js`:
```js
plugins: ['react-native-reanimated/plugin'],  // must be last in the list
```

## Where it goes in the app

The Support button already exists in the app. It's the green "Support" pill at the top right of the home screen, next to the wallet and gear icons. Wire that button up to open the chat. Don't add a floating sphere, don't add another button somewhere else. Use the one that's already there.

Here's how:

```tsx
import { useState } from 'react';
import { XoreSupportBot } from '@andx/xore-support-bot';

export function HomeScreen() {
  const [supportOpen, setSupportOpen] = useState(false);

  return (
    <View style={{ flex: 1 }}>
      {/* the existing top header with the Support pill */}
      <Header>
        <SupportPill onPress={() => setSupportOpen(true)} />
      </Header>

      {/* the rest of the home screen */}

      {supportOpen && (
        <XoreSupportBot
          hideFab
          openOnMount
          pageContext="Home → Support"
          userEmail={currentUser?.email}
          userName={currentUser?.name}
          onOpenChange={setSupportOpen}
        />
      )}
    </View>
  );
}
```

Three things to notice:

1. `hideFab` turns off the floating cyan sphere we ship by default. You don't want it, since the Support pill is already there.
2. `openOnMount` opens the chat panel immediately when the component mounts. Combined with the `supportOpen` state, the chat opens the moment they tap Support.
3. `onOpenChange` fires when the panel closes (user taps the X or finishes a chat). We use it to flip `supportOpen` back to false so the component unmounts cleanly.

Pass `userEmail` and `userName` if the user is logged in. Saves them typing it when they start a live agent chat.

### Make the Support button live on every screen

The Support pill should be in the header of every screen, not just Home. Right now the screenshot shows it on Home only. To make it persistent across Trade, Competitions, Account, etc., you have two options. Pick whichever fits how the app's navigation is set up.

**Option 1: shared header in React Navigation (cleanest)**

If the app uses React Navigation with a Stack or Tab navigator, define the Support pill once in `screenOptions.headerRight` and it shows up on every screen automatically.

```tsx
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useState } from 'react';
import { XoreSupportBot } from '@andx/xore-support-bot';

const Stack = createNativeStackNavigator();

export function AppNavigator() {
  const [supportOpen, setSupportOpen] = useState(false);

  return (
    <View style={{ flex: 1 }}>
      <Stack.Navigator
        screenOptions={{
          headerRight: () => (
            <SupportPill onPress={() => setSupportOpen(true)} />
          ),
        }}
      >
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Trade" component={TradeScreen} />
        <Stack.Screen name="Competitions" component={CompetitionsScreen} />
        <Stack.Screen name="Account" component={AccountScreen} />
      </Stack.Navigator>

      {/* Mounted once at the root, lives above the whole navigator */}
      {supportOpen && (
        <XoreSupportBot
          hideFab
          openOnMount
          pageContext="Global"
          userEmail={currentUser?.email}
          userName={currentUser?.name}
          onOpenChange={setSupportOpen}
        />
      )}
    </View>
  );
}
```

Notice:
- The `<Stack.Navigator>` defines the pill once via `headerRight`. Every screen inside it inherits the pill at the top right.
- The `<XoreSupportBot />` mount lives OUTSIDE the navigator, at the root. The `Modal` it renders sits above the navigation stack, so the chat opens correctly no matter which screen the user is on.
- `supportOpen` is a single state owned by the root, so it doesn't reset when the user navigates between screens.

**Option 2: shared layout wrapper (if you're not using React Navigation's header)**

If the Support pill is part of a custom top header component (not React Navigation's), wrap every screen in a shared layout:

```tsx
import { useState } from 'react';
import { XoreSupportBot } from '@andx/xore-support-bot';

export function ScreenLayout({ children }: { children: React.ReactNode }) {
  const [supportOpen, setSupportOpen] = useState(false);

  return (
    <View style={{ flex: 1 }}>
      <TopHeader>
        <SupportPill onPress={() => setSupportOpen(true)} />
      </TopHeader>

      <View style={{ flex: 1 }}>{children}</View>

      {supportOpen && (
        <XoreSupportBot
          hideFab
          openOnMount
          pageContext="Global"
          userEmail={currentUser?.email}
          userName={currentUser?.name}
          onOpenChange={setSupportOpen}
        />
      )}
    </View>
  );
}
```

Then wrap each screen:

```tsx
export function HomeScreen() {
  return (
    <ScreenLayout>
      {/* home content */}
    </ScreenLayout>
  );
}
```

Same idea: the pill and the chat mount live in one place, every screen uses it.

**A note on state when navigating mid-chat**

If a user opens the chat on Home, then navigates to Trade while the panel is open, the chat stays open because it's mounted at the root. AsyncStorage also persists the conversation across app restarts, so if they force-quit and come back, it picks up where they left off.

## Props

| Prop | Type | What it does |
|---|---|---|
| `userEmail` | string | Pre-fills the email gate for live agent. Skip if you don't have the user's email yet. |
| `userName` | string | Pre-fills name in the email gate. |
| `pageContext` | string | Shown to live agents in Zoho so they know which screen the user is on. |
| `fabPosition` | `{ bottom?, right?, left?, top? }` | Where to dock the floating sphere. Defaults to bottom right. |
| `hideFab` | boolean | Hide the sphere. Use this with Pattern A. |
| `openOnMount` | boolean | Open the chat immediately on mount. Use with `hideFab` for "open from a button" flows or push tap deep links. |
| `initialMode` | `'beginner' \| 'pro'` | Tone of AI answers. |
| `theme` | `Partial<Theme>` | Override colors (see Theming below). |
| `onLiveAgentConnected` | `(agentName) => void` | Fires when an agent picks up. Useful for analytics. |
| `onOpenChange` | `(open) => void` | Fires when the panel opens or closes. |

## Backend

Already live at `https://andx-bot-245374915379.us-central1.run.app`. No auth needed from the client. All 10 endpoints typed in `src/api/types.ts`.

CORS is open for andx.global, andxus.io, andx.one (including platform.andx.global and any subdomain), plus localhost. React Native fetch on iOS and Android doesn't send an Origin header anyway, so CORS isn't usually an issue. If you do hit one, email me the origin and I'll add it.

If you need to point at a staging or dev backend:
```ts
import { setBaseUrl } from '@andx/xore-support-bot/src/api/client';
setBaseUrl('http://localhost:8080');
```

## Push notifications

The package is wired for FCM (Android) and APNs (iOS) via `@react-native-firebase/messaging`. Backend endpoint (`POST /api/register-push-token`) is live.

In your `App.tsx` or root layout:

```tsx
import { useEffect } from 'react';
import { registerPushToken, attachPushHandlers } from '@andx/xore-support-bot';

export default function App() {
  useEffect(() => {
    registerPushToken({ sessionId: getYourStableInstallId() });

    const detach = attachPushHandlers({
      onAgentReply: ({ ticketId, agentName, body }) => {
        // app is in foreground; show your toast or do nothing if chat is already open
      },
      onPushOpen: ({ ticketId }) => {
        // user tapped a push from outside the app, navigate to your support screen
        navigation.navigate('Support');
      },
    });
    return detach;
  }, []);

  return <YourNavigator />;
}
```

For iOS, see `src/push/ios-apns.md` for the Xcode + APNs auth key walkthrough.

For Android:
1. Drop `google-services.json` (I'll send) into `android/app/`
2. In `android/build.gradle`, add to `buildscript.dependencies`: `classpath 'com.google.gms:google-services:4.4.0'`
3. In `android/app/build.gradle`, add at the top: `apply plugin: 'com.google.gms.google-services'`
4. Android 13+ needs `POST_NOTIFICATIONS` permission. Firebase's `requestPermission()` handles it.
5. Recommended: register a notification channel called `xore_support` (notifee or similar).

## Theming

Default look is cyberpunk cyan on near black to match the web widget. Override per instance:

```tsx
<XoreSupportBot
  theme={{
    accent: { primary: '#ff8800' },
    bg: { panel: '#1a1a1f' },
    font: { body: 'YourCustomFont' },
  }}
/>
```

Full token list:
```ts
{
  bg: { panel, elevated, deep },
  accent: { primary, alert, online },
  text: { primary, secondary, muted, inverse },
  border: { default, strong, subtle },
  radius: { sm, md, lg },
  font: { body, heading, mono },
  space: (n) => n * 4,
}
```

The default fonts (Inter, Space Grotesk, JetBrains Mono) aren't bundled. Install them in the app via `react-native.config.js` or just override with system fonts in the theme prop.

## Hooks for advanced use

If you want to read chat state from somewhere else in the app:

```tsx
import { ChatProvider, useChat, useLiveAgent } from '@andx/xore-support-bot';

function StatusBadge() {
  const { messages } = useChat();
  const { liveAgent } = useLiveAgent();
  return <Text>{liveAgent.active ? 'In live chat' : `${messages.length} messages`}</Text>;
}
```

If you do this, mount `<XoreSupportBot hideFab />` somewhere inside the same `<ChatProvider>` so both share state.

## Verification checklist

Smoke test these on a physical iPhone and Android device:

- [ ] Sphere appears bottom right (Pattern B or C), or the Settings row opens the panel (Pattern A)
- [ ] Welcome screen shows four chips
- [ ] Tap "What is ANDX?", AI replies within a few seconds
- [ ] Tap "Chat with a live agent", email gate appears (email is mandatory)
- [ ] Submit email + first message, "Position N of N" widget appears
- [ ] Once an agent picks up, agent messages flow in every few seconds
- [ ] Long-press an AI bubble, reaction palette + Reply appears
- [ ] 👎 on an AI message, a rephrased reply appears below
- [ ] Tap Reply on a message, reply preview appears above the composer
- [ ] Close the panel, reopen, conversation is restored from AsyncStorage
- [ ] Force quit the app, reopen, navigate back, conversation is still there
- [ ] Background the app for 30+ seconds, reopen, your queue spot was freed (check in Zoho)
- [ ] Tap End live chat, ticket closes in Zoho

Push test (once I send the Firebase config files): use Firebase Console to send a test push to a registered device, confirm it lands in the notification tray, tap it, app opens to the support panel with the ticket loaded.

## Questions

Anything weird, anything you want changed, anything that doesn't work — ping me.

Nick
nick@andxus.io
