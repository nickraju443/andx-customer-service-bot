# Instructions for Chatbot Placement

The Support pill needs to stay in the top right header on every screen, not just Home. Trade, Competitions, Account, all of them. Same position everywhere.

There are two pieces to make this work:

1. The **Support pill** (the green button) lives in a shared header across every screen
2. The **chat panel** is mounted once at the root so it can open from any screen

Pick whichever of the two options below fits how the app's navigation is set up.

---

## Option 1: React Navigation (recommended)

If the app uses React Navigation with a Stack or Tab navigator, define the Support pill once via `screenOptions.headerRight`. Every screen inside the navigator inherits it automatically.

```tsx
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useState } from 'react';
import { View } from 'react-native';
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

      {/* Mounted ONCE at the root, lives above the whole navigator */}
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

Three things to notice:

- The `<Stack.Navigator>` defines the pill once via `headerRight`. Every screen inside it inherits the pill at the top right with zero extra code per screen.
- The `<XoreSupportBot />` mount lives **outside** the navigator, at the root. The Modal it renders sits above the navigation stack, so the chat opens correctly no matter which screen the user is on.
- `supportOpen` is a single state owned by the root, so it doesn't reset when the user navigates between screens.

---

## Option 2: Custom shared layout wrapper

If the Support pill is part of a custom top header (not React Navigation's built-in header), wrap every screen in a shared layout component:

```tsx
import { useState } from 'react';
import { View } from 'react-native';
import { XoreSupportBot } from '@andx/xore-support-bot';

export function ScreenLayout({ children }: { children: React.ReactNode }) {
  const [supportOpen, setSupportOpen] = useState(false);

  return (
    <View style={{ flex: 1 }}>
      <TopHeader>
        <Logo />
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

export function TradeScreen() {
  return (
    <ScreenLayout>
      {/* trade content */}
    </ScreenLayout>
  );
}
```

Same idea as Option 1: the pill and the chat mount live in one place, every screen uses it.

---

## State when navigating mid-chat

If a user opens the chat on Home, then navigates to Trade while the panel is open, the chat stays open because it's mounted at the root, not inside any one screen.

AsyncStorage also persists the conversation across app restarts, so if they force-quit and come back, the chat picks up where they left off.

---

## Props on `<XoreSupportBot />`

| Prop | Type | What it does |
|---|---|---|
| `hideFab` | boolean | Hide the floating cyan sphere we ship by default. Use this when wiring up your own button. |
| `openOnMount` | boolean | Open the chat panel immediately on mount. Combine with the `supportOpen` state pattern above. |
| `onOpenChange` | `(open) => void` | Fires when the panel opens or closes. Flip `supportOpen` back to false here when it closes. |
| `userEmail` | string | Pre-fills the email gate for live agent. Skip if the user isn't logged in. |
| `userName` | string | Pre-fills name in the email gate. |
| `pageContext` | string | Shown to live agents in Zoho so they know which screen the user is on. |
| `fabPosition` | `{ bottom?, right?, left?, top? }` | Where to dock the floating sphere. Not relevant when `hideFab` is true. Defaults to bottom right. |
| `initialMode` | `'beginner' \| 'pro'` | Tone of AI answers. Defaults to beginner. |
| `theme` | `Partial<Theme>` | Override colors. Tokens: `bg`, `accent`, `text`, `border`, `radius`, `font`, `space`. Example: `theme={{ accent: { primary: '#ff8800' } }}`. |
| `onLiveAgentConnected` | `(agentName) => void` | Fires when a live agent picks up the ticket. Useful for analytics. |

---

## Questions

If the nav is set up differently than either option above, send a screenshot of how it's structured and I'll send the right snippet.

