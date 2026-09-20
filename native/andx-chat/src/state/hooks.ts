import { useCallback, useContext, useEffect, useRef } from 'react';
import { ChatContext } from './ChatContext';
import { ask } from '../api/ask';
import {
  startHandoff,
  sendHandoffMessage,
  pollAgentReplies,
  pollQueue,
  endHandoff,
} from '../api/handoff';
import { sendReaction } from '../api/reactions';
import { newMessageId } from '../utils/id';
import type {
  ChatHistoryItem,
  Message,
  Mode,
  Reaction,
  ReplyToContext,
} from '../api/types';
import { XoreApiError } from '../api/client';

// ─── useChat ────────────────────────────────────────────────────────────────

export function useChat() {
  const { state, dispatch } = useContext(ChatContext);
  const askCtrlRef = useRef<AbortController | null>(null);

  const askQuestion = useCallback(
    async (question: string) => {
      if (!question.trim() || state.isStreaming) return;

      const userMsg = {
        id: newMessageId(),
        role: 'user' as const,
        text: question.trim(),
        ts: Math.floor(Date.now() / 1000),
        replyTo: state.pendingReplyTo || undefined,
      };
      dispatch({ type: 'ADD_MESSAGE', message: userMsg });
      dispatch({ type: 'SET_REPLY_TO', replyTo: null });
      dispatch({ type: 'SET_STREAMING', value: true });

      // Build history from last 8 user/ai pairs
      const history: ChatHistoryItem[] = [];
      const msgs: Message[] = state.messages.filter((m: Message) => m.role === 'user' || m.role === 'ai');
      for (let i = 0; i < msgs.length - 1; i++) {
        if (msgs[i].role === 'user' && msgs[i + 1]?.role === 'ai') {
          history.push({ q: msgs[i].text, a: msgs[i + 1].text });
        }
      }

      const aiMsgId = newMessageId();
      askCtrlRef.current = new AbortController();
      try {
        const res = await ask(
          {
            question: question.trim(),
            mode: state.mode,
            history: history.slice(-8),
            reply_to: state.pendingReplyTo ? { content_preview: state.pendingReplyTo.text.slice(0, 300) } : undefined,
          },
          { signal: askCtrlRef.current.signal },
        );
        dispatch({
          type: 'ADD_MESSAGE',
          message: {
            id: aiMsgId,
            role: 'ai',
            text: res.answer,
            ts: Math.floor(Date.now() / 1000),
          },
        });
      } catch (err) {
        if ((err as Error).name === 'AbortError') return; // user cleared chat
        dispatch({
          type: 'ADD_MESSAGE',
          message: {
            id: aiMsgId,
            role: 'ai',
            text:
              err instanceof XoreApiError && err.status === 429
                ? 'Hmm — too many questions too fast. Give it a second and try again.'
                : 'Something went wrong reaching XORE. Tap retry below.',
            ts: Math.floor(Date.now() / 1000),
            error: true,
          },
        });
      } finally {
        dispatch({ type: 'SET_STREAMING', value: false });
        askCtrlRef.current = null;
      }
    },
    [state.messages, state.mode, state.isStreaming, state.pendingReplyTo, dispatch],
  );

  const retryLast = useCallback(() => {
    // Remove the last errored AI message and the user message before it, then resend
    const msgs = state.messages;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'ai' && msgs[i].error) {
        const userMsg = msgs[i - 1];
        if (userMsg && userMsg.role === 'user') {
          dispatch({ type: 'REMOVE_MESSAGE', id: msgs[i].id });
          dispatch({ type: 'REMOVE_MESSAGE', id: userMsg.id });
          askQuestion(userMsg.text);
        }
        return;
      }
    }
  }, [state.messages, dispatch, askQuestion]);

  const clearChat = useCallback(() => {
    if (askCtrlRef.current) {
      try { askCtrlRef.current.abort(); } catch {}
      askCtrlRef.current = null;
    }
    dispatch({ type: 'CLEAR_CHAT' });
  }, [dispatch]);

  const setMode = useCallback((mode: Mode) => dispatch({ type: 'SET_MODE', mode }), [dispatch]);
  const setReplyTo = useCallback((replyTo: ReplyToContext | null) => dispatch({ type: 'SET_REPLY_TO', replyTo }), [dispatch]);

  return {
    state,
    messages: state.messages,
    isStreaming: state.isStreaming,
    mode: state.mode,
    pendingReplyTo: state.pendingReplyTo,
    askQuestion,
    retryLast,
    clearChat,
    setMode,
    setReplyTo,
  };
}

// ─── useLiveAgent ───────────────────────────────────────────────────────────

export function useLiveAgent() {
  const { state, dispatch } = useContext(ChatContext);

  const startSession = useCallback(
    async (email: string, name: string | undefined, firstMessage: string, pageContext?: string) => {
      const history: ChatHistoryItem[] = [];
      const msgs: Message[] = state.messages.filter((m: Message) => m.role === 'user' || m.role === 'ai');
      for (let i = 0; i < msgs.length - 1; i++) {
        if (msgs[i].role === 'user' && msgs[i + 1]?.role === 'ai') {
          history.push({ q: msgs[i].text, a: msgs[i + 1].text });
        }
      }

      const res = await startHandoff({
        email,
        name,
        initial_message: firstMessage,
        last_message: firstMessage,
        history,
        session_id: state.sessionId,
        page_url: pageContext || 'andx-native-app',
      });

      dispatch({
        type: 'START_LIVE_AGENT',
        ticketId: res.ticket_id,
        ticketToken: res.ticket_token,
        email,
      });
      dispatch({ type: 'SET_EMAIL', email });

      // Drop the first message into the thread so user sees it
      dispatch({
        type: 'ADD_MESSAGE',
        message: {
          id: newMessageId(),
          role: 'user',
          text: firstMessage,
          ts: res.start_ts,
        },
      });
      return res;
    },
    [state.messages, state.sessionId, dispatch],
  );

  const sendMessage = useCallback(
    async (text: string, replyTo?: ReplyToContext) => {
      if (!state.liveAgent.ticketId || !state.liveAgent.ticketToken) return;

      dispatch({
        type: 'ADD_MESSAGE',
        message: {
          id: newMessageId(),
          role: 'user',
          text,
          ts: Math.floor(Date.now() / 1000),
          replyTo,
        },
      });

      await sendHandoffMessage({
        ticket_id: state.liveAgent.ticketId,
        ticket_token: state.liveAgent.ticketToken,
        message: text,
        reply_to: replyTo ? { content_preview: replyTo.text.slice(0, 200) } : undefined,
      });
    },
    [state.liveAgent.ticketId, state.liveAgent.ticketToken, dispatch],
  );

  const endSession = useCallback(async () => {
    if (!state.liveAgent.ticketId) {
      dispatch({ type: 'END_LIVE_AGENT' });
      return;
    }
    try {
      await endHandoff({
        ticket_id: state.liveAgent.ticketId,
        ticket_token: state.liveAgent.ticketToken,
      });
    } catch {
      // best-effort
    }
    dispatch({ type: 'END_LIVE_AGENT' });
  }, [state.liveAgent.ticketId, state.liveAgent.ticketToken, dispatch]);

  return {
    liveAgent: state.liveAgent,
    startSession,
    sendMessage,
    endSession,
  };
}

// ─── useHeartbeat ───────────────────────────────────────────────────────────
// Polls /api/handoff-queue every 12s while mounted; auto-stops when liveAgent
// becomes inactive or queue ends. CRITICAL: this is also the heartbeat — if
// the user backgrounds the app, the panel should unmount and stop polling so
// the backend can free their queue spot after 30s.

const HEARTBEAT_INTERVAL_MS = 12_000;

export function useHeartbeat() {
  const { state, dispatch } = useContext(ChatContext);
  const { ticketId, ticketToken, active, queueState } = state.liveAgent;

  useEffect(() => {
    if (!active || !ticketId || !ticketToken || queueState === 'ended') return;

    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      try {
        const res = await pollQueue(ticketId, ticketToken);
        if (cancelled || !res.ok) return;
        if (res.state === 'queued') {
          dispatch({
            type: 'UPDATE_QUEUE',
            state: 'queued',
            position: res.position,
            total: res.total,
            isNext: res.is_next,
            estimatedWaitMin: res.estimated_wait_min,
          });
        } else if (res.state === 'active') {
          dispatch({
            type: 'UPDATE_QUEUE',
            state: 'active',
            position: 0,
            total: 0,
            agentName: res.agent_name,
          });
        } else {
          dispatch({ type: 'UPDATE_QUEUE', state: 'ended', position: 0, total: 0 });
        }
      } catch {
        // transient — try again next tick
      }
    };

    tick(); // fire immediately
    const id = setInterval(tick, HEARTBEAT_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [active, ticketId, ticketToken, queueState, dispatch]);
}

// ─── useAgentReplyPolling ───────────────────────────────────────────────────
// Polls /api/handoff-poll every 4s while a live ticket is active and panel
// is mounted. Dedupes by reply id (reducer ADD_MESSAGE skips known ids).

const REPLY_POLL_INTERVAL_MS = 4_000;

export function useAgentReplyPolling(panelOpen: boolean) {
  const { state, dispatch } = useContext(ChatContext);
  const { ticketId, ticketToken, active, lastSeenTs } = state.liveAgent;
  const lastSeenRef = useRef(lastSeenTs);
  lastSeenRef.current = lastSeenTs;

  useEffect(() => {
    if (!active || !ticketId || !ticketToken) return;

    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      try {
        const res = await pollAgentReplies(ticketId, ticketToken, lastSeenRef.current);
        if (cancelled || !res.ok) return;

        let maxTs = lastSeenRef.current;
        for (const reply of res.replies) {
          dispatch({
            type: 'ADD_MESSAGE',
            message: {
              id: reply.id,
              role: 'agent',
              text: reply.content,
              ts: reply.ts,
              agentName: reply.agent_name,
            },
          });
          if (reply.ts > maxTs) maxTs = reply.ts;
          if (!panelOpen) dispatch({ type: 'INCREMENT_UNREAD' });
        }
        if (maxTs > lastSeenRef.current) {
          lastSeenRef.current = maxTs;
          dispatch({ type: 'AGENT_REPLY_SEEN', ts: maxTs });
        }
      } catch {
        // transient
      }
    };

    tick();
    const id = setInterval(tick, REPLY_POLL_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [active, ticketId, ticketToken, panelOpen, dispatch]);
}

// ─── useReactions ───────────────────────────────────────────────────────────

export function useReactions(messageId: string) {
  const { state, dispatch } = useContext(ChatContext);
  const reactions = state.reactions[messageId] || [];

  const react = useCallback(
    async (
      reaction: Reaction,
      messageRole: 'ai' | 'agent',
      messagePreview: string,
    ): Promise<{ rephrased?: string } | void> => {
      dispatch({ type: 'TOGGLE_REACTION', messageId, reaction });

      try {
        const res = await sendReaction({
          message_id: messageId,
          message_role: messageRole,
          message_preview: messagePreview.slice(0, 500),
          reaction,
          ticket_id: messageRole === 'agent' ? state.liveAgent.ticketId : undefined,
          ticket_token: messageRole === 'agent' ? state.liveAgent.ticketToken : undefined,
          history: reaction === '👎' && messageRole === 'ai' ? buildHistoryFor(state) : undefined,
          mode: reaction === '👎' && messageRole === 'ai' ? state.mode : undefined,
        });

        if (res.follow_up) {
          dispatch({
            type: 'ADD_MESSAGE',
            message: {
              id: newMessageId(),
              role: 'ai',
              text: res.follow_up,
              ts: Math.floor(Date.now() / 1000),
            },
          });
          return { rephrased: res.follow_up };
        }
      } catch {
        // revert optimistic toggle on failure
        dispatch({ type: 'TOGGLE_REACTION', messageId, reaction });
      }
    },
    [messageId, state, dispatch],
  );

  return { reactions, react };
}

function buildHistoryFor(state: { messages: Array<{ role: string; text: string }> }): ChatHistoryItem[] {
  const out: ChatHistoryItem[] = [];
  const msgs = state.messages.filter(m => m.role === 'user' || m.role === 'ai');
  for (let i = 0; i < msgs.length - 1; i++) {
    if (msgs[i].role === 'user' && msgs[i + 1]?.role === 'ai') {
      out.push({ q: msgs[i].text, a: msgs[i + 1].text });
    }
  }
  return out.slice(-8);
}
