/**
 * EXAMPLE: How to mount <XoreSupportBot /> in an ANDX app screen.
 *
 * Copy ONE of the patterns below into your app. The simplest is "Pattern A".
 */

import React, { useEffect } from 'react';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { XoreSupportBot, attachPushHandlers, registerPushToken } from '@andx/xore-support-bot';

// ────────────────────────────────────────────────────────────────────────────
// Pattern A — just mount it on the screen where you want the FAB visible.
// ────────────────────────────────────────────────────────────────────────────

export function SettingsScreenWithSupportBot() {
  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.body}>
        <Text style={styles.title}>Settings</Text>
        {/* ...the rest of your screen... */}
      </View>

      {/* The FAB is fixed to the corner via absolute positioning; mount once
          per screen where you want it visible. For an app-wide FAB, mount it
          at the root layout instead. */}
      <XoreSupportBot pageContext="Settings" />
    </SafeAreaView>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Pattern B — pre-fill the user's email from your auth + open programmatically
// ────────────────────────────────────────────────────────────────────────────

export function SupportTabWithKnownUser({ user }: { user: { email: string; name: string } }) {
  return (
    <SafeAreaView style={styles.root}>
      <XoreSupportBot
        userEmail={user.email}
        userName={user.name}
        pageContext="Support tab"
        onLiveAgentConnected={(name) => {
          // log to analytics, show toast, etc.
          console.log(`[ANDX] Connected to ${name}`);
        }}
      />
    </SafeAreaView>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Pattern C — open the panel from your own button (custom UI). Hide the FAB.
// ────────────────────────────────────────────────────────────────────────────

import { useRef, useState } from 'react';
import { Pressable } from 'react-native';

export function CustomTriggerSupportBot() {
  const [open, setOpen] = useState(false);
  // Re-mount with openOnMount=true to programmatically open
  const key = useRef(0);

  return (
    <SafeAreaView style={styles.root}>
      <Pressable onPress={() => { key.current++; setOpen(true); }} style={styles.customBtn}>
        <Text style={{ color: 'white' }}>Get Help</Text>
      </Pressable>
      {open && (
        <XoreSupportBot
          key={key.current}
          hideFab
          openOnMount
          onOpenChange={(o) => { if (!o) setOpen(false); }}
        />
      )}
    </SafeAreaView>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Pattern D — push notifications wired up at app root.
// ────────────────────────────────────────────────────────────────────────────

/*
// In your App.tsx or root navigator:

import { useEffect, useRef } from 'react';
import { attachPushHandlers, registerPushToken, XoreSupportBot } from '@andx/xore-support-bot';

export default function App() {
  const supportRef = useRef<{ open: () => void }>(null);

  useEffect(() => {
    // 1) Get the FCM token and send it to the backend so it can push us
    registerPushToken({
      sessionId: yourStableInstallId,
      // ticketId/ticketToken: pass these if you've already got an active live ticket
    });

    // 2) Wire up handlers — must be called once, at app root
    const detach = attachPushHandlers({
      onAgentReply: ({ ticketId, agentName, body }) => {
        // App is in foreground — show your own in-app toast, or do nothing if
        // the chat panel is already visible.
      },
      onPushOpen: ({ ticketId }) => {
        // User tapped a push from outside the app — open the support panel.
        // Navigate to your Support screen and let <XoreSupportBot /> mount
        // with openOnMount.
        navigateToSupport(ticketId);
      },
    });
    return detach;
  }, []);

  return (
    <NavigationContainer>
      ...routes...
    </NavigationContainer>
  );
}
*/

// ────────────────────────────────────────────────────────────────────────────
// Pattern E — match the host app's brand color
// ────────────────────────────────────────────────────────────────────────────

export function ThemedSupportBot() {
  return (
    <SafeAreaView style={styles.root}>
      <XoreSupportBot
        theme={{
          accent: {
            primary: '#ff8800',     // orange instead of cyan
            alert: '#ff2ec8',
            online: '#00ff9e',
          },
        }}
      />
    </SafeAreaView>
  );
}

// ────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0a0c' },
  body: { padding: 24 },
  title: { color: '#fff', fontSize: 28, fontWeight: '700' },
  customBtn: {
    position: 'absolute',
    bottom: 30,
    alignSelf: 'center',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 8,
    backgroundColor: '#00e0ff',
  },
});
