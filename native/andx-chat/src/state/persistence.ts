import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ChatState } from '../api/types';

// Keys persisted to AsyncStorage. Mirrors andx-widget-v2.js sessionStorage layout.
const KEYS = {
  chatHistory: 'xore:chatHistory',
  liveAgent: 'xore:liveAgent',
  lastEmail: 'xore:lastEmail',
  sessionId: 'xore:sessionId',
  mode: 'xore:mode',
  reactions: 'xore:reactions',
} as const;

export async function loadPersisted(): Promise<Partial<ChatState>> {
  try {
    const entries = await AsyncStorage.multiGet(Object.values(KEYS));
    const map: Record<string, string | null> = {};
    for (const [k, v] of entries) map[k] = v;

    const out: Partial<ChatState> = {};

    const raw = map[KEYS.chatHistory];
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) out.messages = parsed.slice(-50);
      } catch {}
    }

    const liveRaw = map[KEYS.liveAgent];
    if (liveRaw) {
      try {
        const parsed = JSON.parse(liveRaw);
        if (parsed && typeof parsed === 'object') {
          out.liveAgent = parsed;
        }
      } catch {}
    }

    const reactRaw = map[KEYS.reactions];
    if (reactRaw) {
      try {
        const parsed = JSON.parse(reactRaw);
        if (parsed && typeof parsed === 'object') out.reactions = parsed;
      } catch {}
    }

    if (map[KEYS.lastEmail]) out.email = map[KEYS.lastEmail]!;
    if (map[KEYS.sessionId]) out.sessionId = map[KEYS.sessionId]!;
    if (map[KEYS.mode] === 'pro' || map[KEYS.mode] === 'beginner') out.mode = map[KEYS.mode] as any;

    return out;
  } catch {
    return {};
  }
}

export async function savePersisted(state: ChatState): Promise<void> {
  try {
    const pairs: [string, string][] = [
      [KEYS.chatHistory, JSON.stringify(state.messages.slice(-50))],
      [KEYS.liveAgent, JSON.stringify(state.liveAgent)],
      [KEYS.reactions, JSON.stringify(state.reactions)],
      [KEYS.sessionId, state.sessionId],
      [KEYS.mode, state.mode],
    ];
    if (state.email) pairs.push([KEYS.lastEmail, state.email]);
    await AsyncStorage.multiSet(pairs);
  } catch {
    // best-effort — storage failures shouldn't break the chat
  }
}

export async function clearPersisted(): Promise<void> {
  try {
    await AsyncStorage.multiRemove(Object.values(KEYS));
  } catch {}
}
