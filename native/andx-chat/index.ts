/**
 * @andx/xore-support-bot — Public API
 *
 * Drop <XoreSupportBot /> anywhere in your React Native app to add the
 * ANDX support chat (XORE). See README.md for installation + props.
 */

export { XoreSupportBot } from './src/XoreSupportBot';
export type { XoreSupportBotProps } from './src/XoreSupportBot';

// Theming
export { defaultTheme } from './src/theme';
export type { Theme } from './src/theme';

// Optional: expose context + hooks for host apps that want to read chat state
export { ChatProvider, ChatContext } from './src/state/ChatContext';
export { useChat, useLiveAgent } from './src/state/hooks';

// Optional: push notifications
export { registerPushToken, attachPushHandlers } from './src/push/registration';

// Types host apps may want
export type { Message, Role, LiveAgentState, ChatState } from './src/api/types';
