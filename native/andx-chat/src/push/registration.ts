/**
 * Push notification registration for ANDX support replies.
 *
 * Library: @react-native-firebase/messaging (covers FCM + APNs via Firebase).
 *
 * The host app must install:
 *   yarn add @react-native-firebase/app @react-native-firebase/messaging
 *
 * iOS requires extra Xcode setup — see ./ios-apns.md
 * Android needs google-services.json — see README.md
 *
 * NOTE: The backend endpoint POST /api/register-push-token is documented but
 * not yet implemented. This module is wired and ready; it just won't deliver
 * pushes until the backend ships its side. Calls fail silently (don't break
 * the app) until then.
 */

import { Platform } from 'react-native';
import { registerPushToken } from '../api/pushTokens';

type FirebaseMessaging = any; // we use `any` so the package doesn't hard-require firebase

let firebaseMessaging: (() => FirebaseMessaging) | null = null;

// Lazy-load firebase to keep the package usable without it
function loadMessaging(): (() => FirebaseMessaging) | null {
  if (firebaseMessaging) return firebaseMessaging;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('@react-native-firebase/messaging');
    firebaseMessaging = mod.default || mod;
    return firebaseMessaging;
  } catch {
    return null;
  }
}

export interface RegisterOptions {
  sessionId: string;
  ticketId?: string;
  ticketToken?: string;
  deviceId?: string;
}

/**
 * Call once on app mount (or when entering an authenticated state).
 * Requests notification permission, fetches the FCM token, sends it to the
 * backend. Returns the token on success; null if the user denied permission
 * or @react-native-firebase/messaging isn't installed.
 */
export async function registerPushTokenForUser(opts: RegisterOptions): Promise<string | null> {
  const messaging = loadMessaging();
  if (!messaging) {
    console.warn('[XORE] @react-native-firebase/messaging not installed; push disabled.');
    return null;
  }

  try {
    // iOS asks for permission; Android 13+ also needs POST_NOTIFICATIONS perm
    const authStatus = await messaging().requestPermission();
    const enabled = authStatus === 1 || authStatus === 2; // AUTHORIZED || PROVISIONAL
    if (!enabled) return null;

    const token = await messaging().getToken();
    if (!token) return null;

    await registerPushToken({
      session_id: opts.sessionId,
      ticket_id: opts.ticketId,
      ticket_token: opts.ticketToken,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
      push_token: token,
      device_id: opts.deviceId,
    }).catch(() => { /* backend may not have endpoint yet */ });

    // Re-register on rotation
    messaging().onTokenRefresh(async (newToken: string) => {
      await registerPushToken({
        session_id: opts.sessionId,
        ticket_id: opts.ticketId,
        ticket_token: opts.ticketToken,
        platform: Platform.OS === 'ios' ? 'ios' : 'android',
        push_token: newToken,
        device_id: opts.deviceId,
      }).catch(() => {});
    });

    return token;
  } catch (e) {
    console.warn('[XORE] push registration failed:', e);
    return null;
  }
}

// Re-export as named import host apps will see
export { registerPushTokenForUser as registerPushToken };

/**
 * Attach foreground + background handlers. Call once at app root, OUTSIDE of
 * any component, so the background message handler is registered before RN
 * tries to invoke it.
 *
 *   // In your App.tsx or index.js:
 *   attachPushHandlers({ onAgentReply: ({ ticketId, agentName }) => {...} });
 */
export interface PushHandlerOptions {
  /** Fired when an agent_reply push lands while app is foregrounded. */
  onAgentReply?: (payload: { ticketId: string; agentName: string; body: string }) => void;
  /** Fired when a push tap opens the app. Open your support screen here. */
  onPushOpen?: (payload: { ticketId: string; agentName: string }) => void;
}

export function attachPushHandlers(opts: PushHandlerOptions): () => void {
  const messaging = loadMessaging();
  if (!messaging) return () => {};

  // Foreground
  const unsubFg = messaging().onMessage(async (msg: any) => {
    if (msg?.data?.type === 'agent_reply' && opts.onAgentReply) {
      opts.onAgentReply({
        ticketId: msg.data.ticket_id || '',
        agentName: msg.data.agent_name || 'Live Agent',
        body: msg.notification?.body || '',
      });
    }
  });

  // Background tap → app opens
  const unsubOpen = messaging().onNotificationOpenedApp((msg: any) => {
    if (msg?.data?.type === 'agent_reply' && opts.onPushOpen) {
      opts.onPushOpen({
        ticketId: msg.data.ticket_id || '',
        agentName: msg.data.agent_name || 'Live Agent',
      });
    }
  });

  // Cold-start tap
  messaging().getInitialNotification().then((msg: any) => {
    if (msg?.data?.type === 'agent_reply' && opts.onPushOpen) {
      opts.onPushOpen({
        ticketId: msg.data.ticket_id || '',
        agentName: msg.data.agent_name || 'Live Agent',
      });
    }
  });

  // Required for background message delivery — must be called once at app root
  messaging().setBackgroundMessageHandler(async () => {
    // Backend's push payload includes a notification block, so the system tray
    // shows the message automatically. Nothing to do here — handler must
    // exist (even if empty) for the platform to deliver background pushes.
  });

  return () => {
    try { unsubFg(); } catch {}
    try { unsubOpen(); } catch {}
  };
}
