import type { ChatState, Message, Mode, Reaction, ReplyToContext } from '../api/types';

export const INITIAL_STATE: ChatState = {
  sessionId: '',
  mode: 'beginner',
  messages: [],
  isStreaming: false,
  pendingReplyTo: null,
  liveAgent: {
    active: false,
    ticketId: '',
    ticketToken: '',
    email: '',
    agentName: null,
    queueState: null,
    queuePosition: 0,
    queueTotal: 0,
    estimatedWaitMin: 0,
    isNext: false,
    lastSeenTs: 0,
  },
  reactions: {},
  email: '',
  unreadCount: 0,
};

export type Action =
  | { type: 'HYDRATE'; payload: Partial<ChatState> }
  | { type: 'SET_SESSION_ID'; id: string }
  | { type: 'SET_MODE'; mode: Mode }
  | { type: 'ADD_MESSAGE'; message: Message }
  | { type: 'UPDATE_MESSAGE'; id: string; patch: Partial<Message> }
  | { type: 'REMOVE_MESSAGE'; id: string }
  | { type: 'SET_STREAMING'; value: boolean }
  | { type: 'SET_REPLY_TO'; replyTo: ReplyToContext | null }
  | { type: 'CLEAR_CHAT' }
  | { type: 'SET_EMAIL'; email: string }
  | { type: 'TOGGLE_REACTION'; messageId: string; reaction: Reaction }
  | { type: 'SET_REACTIONS'; messageId: string; reactions: Reaction[] }
  | { type: 'START_LIVE_AGENT'; ticketId: string; ticketToken: string; email: string }
  | { type: 'UPDATE_QUEUE'; state: 'queued' | 'active' | 'ended'; position: number; total: number; isNext?: boolean; estimatedWaitMin?: number; agentName?: string }
  | { type: 'AGENT_REPLY_SEEN'; ts: number }
  | { type: 'END_LIVE_AGENT' }
  | { type: 'INCREMENT_UNREAD' }
  | { type: 'CLEAR_UNREAD' };

const MAX_MESSAGES = 50;

export function reducer(state: ChatState, action: Action): ChatState {
  switch (action.type) {
    case 'HYDRATE':
      return { ...state, ...action.payload };

    case 'SET_SESSION_ID':
      return { ...state, sessionId: action.id };

    case 'SET_MODE':
      return { ...state, mode: action.mode };

    case 'ADD_MESSAGE': {
      // Dedupe by id (handles late agent-poll responses)
      if (state.messages.some(m => m.id === action.message.id)) return state;
      const next = [...state.messages, action.message];
      if (next.length > MAX_MESSAGES) next.splice(0, next.length - MAX_MESSAGES);
      return { ...state, messages: next };
    }

    case 'UPDATE_MESSAGE':
      return {
        ...state,
        messages: state.messages.map(m =>
          m.id === action.id ? { ...m, ...action.patch } : m,
        ),
      };

    case 'REMOVE_MESSAGE':
      return { ...state, messages: state.messages.filter(m => m.id !== action.id) };

    case 'SET_STREAMING':
      return { ...state, isStreaming: action.value };

    case 'SET_REPLY_TO':
      return { ...state, pendingReplyTo: action.replyTo };

    case 'CLEAR_CHAT':
      return {
        ...state,
        messages: [],
        reactions: {},
        pendingReplyTo: null,
        isStreaming: false,
        unreadCount: 0,
      };

    case 'SET_EMAIL':
      return { ...state, email: action.email };

    case 'TOGGLE_REACTION': {
      const current = state.reactions[action.messageId] || [];
      const has = current.includes(action.reaction);
      const next = has
        ? current.filter(r => r !== action.reaction)
        : [...current, action.reaction];
      return {
        ...state,
        reactions: { ...state.reactions, [action.messageId]: next },
      };
    }

    case 'SET_REACTIONS':
      return {
        ...state,
        reactions: { ...state.reactions, [action.messageId]: action.reactions },
      };

    case 'START_LIVE_AGENT':
      return {
        ...state,
        email: action.email,
        liveAgent: {
          ...state.liveAgent,
          active: true,
          ticketId: action.ticketId,
          ticketToken: action.ticketToken,
          email: action.email,
          queueState: 'queued',
          lastSeenTs: Math.floor(Date.now() / 1000),
        },
      };

    case 'UPDATE_QUEUE':
      return {
        ...state,
        liveAgent: {
          ...state.liveAgent,
          queueState: action.state,
          queuePosition: action.position,
          queueTotal: action.total,
          isNext: action.isNext ?? state.liveAgent.isNext,
          estimatedWaitMin: action.estimatedWaitMin ?? state.liveAgent.estimatedWaitMin,
          agentName: action.agentName ?? state.liveAgent.agentName,
        },
      };

    case 'AGENT_REPLY_SEEN':
      return {
        ...state,
        liveAgent: { ...state.liveAgent, lastSeenTs: Math.max(state.liveAgent.lastSeenTs, action.ts) },
      };

    case 'END_LIVE_AGENT':
      return { ...state, liveAgent: { ...INITIAL_STATE.liveAgent, email: state.liveAgent.email } };

    case 'INCREMENT_UNREAD':
      return { ...state, unreadCount: state.unreadCount + 1 };

    case 'CLEAR_UNREAD':
      return { ...state, unreadCount: 0 };

    default:
      return state;
  }
}
