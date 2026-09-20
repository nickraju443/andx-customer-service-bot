/**
 * API contracts for the ANDX support bot backend.
 * Backend: https://andx-bot-245374915379.us-central1.run.app
 * Source of truth: app.py in the andx-customer-service-bot repo.
 *
 * Every shape here matches the Python code verbatim. If the backend changes,
 * update this file FIRST.
 */

// ─── Domain types ───────────────────────────────────────────────────────────

export type Role = 'user' | 'ai' | 'agent';

export type Mode = 'beginner' | 'pro';

export type Reaction = '👍' | '❤️' | '😂' | '😮' | '😢' | '👎';

export interface Message {
  id: string;
  role: Role;
  text: string;
  ts: number;                 // epoch seconds
  agentName?: string;         // populated for role === 'agent'
  replyTo?: ReplyToContext;
  error?: boolean;            // true if /api/ask failed; show retry button
  pending?: boolean;          // true while in flight
}

export interface ReplyToContext {
  id: string;
  role: Role;
  text: string;               // truncated to 200-300 chars before send
}

export interface ChatHistoryItem {
  q: string;
  a: string;
}

export interface LiveAgentState {
  active: boolean;
  ticketId: string;
  ticketToken: string;
  email: string;
  agentName: string | null;
  queueState: 'queued' | 'active' | 'ended' | null;
  queuePosition: number;
  queueTotal: number;
  estimatedWaitMin: number;
  isNext: boolean;
  lastSeenTs: number;         // for /api/handoff-poll's `since_ts`
}

export interface ChatState {
  sessionId: string;
  mode: Mode;
  messages: Message[];        // capped at 50
  isStreaming: boolean;
  pendingReplyTo: ReplyToContext | null;
  liveAgent: LiveAgentState;
  reactions: Record<string, Reaction[]>;
  email: string;              // last-known email (auto-fill the gate)
  unreadCount: number;        // for FAB badge when panel is closed
}

// ─── POST /api/ask ──────────────────────────────────────────────────────────

export interface AskRequest {
  question: string;                        // max 500 chars
  mode?: Mode;                             // default 'beginner'
  history?: ChatHistoryItem[];             // max 8 items
  reply_to?: { content_preview: string };  // max 300 chars
}

export interface AskResponse {
  answer: string;
  follow_ups: string[];
  citations: unknown[];
  handoff_offer: boolean;
}

// ─── GET /api/agent-status ──────────────────────────────────────────────────

export interface AgentStatusResponse {
  available: boolean;
  configured: boolean;
}

// ─── POST /api/handoff ──────────────────────────────────────────────────────

export interface HandoffRequest {
  email: string;                           // REQUIRED — must look like an email
  initial_message?: string;                // max 5000 chars
  last_message?: string;                   // max 1000 chars
  history?: ChatHistoryItem[];
  name?: string;                           // max 120 chars
  page_url?: string;                       // max 500 chars
  session_id?: string;                     // max 100 chars
}

export interface HandoffResponse {
  ok: true;
  message: string;
  agents_available: boolean;
  ticket_id: string;
  ticket_token: string;
  start_ts: number;
}

// ─── POST /api/handoff-message ──────────────────────────────────────────────

export interface HandoffMessageRequest {
  ticket_id: string;
  ticket_token: string;
  message: string;                                  // max 5000 chars
  reply_to?: { content_preview: string };           // max 200 chars
}

// ─── POST /api/reaction ─────────────────────────────────────────────────────

export interface ReactionRequest {
  message_id: string;                      // max 64 chars
  message_role: 'ai' | 'agent';
  reaction: Reaction;
  message_preview?: string;                // max 500 chars
  ticket_id?: string;                      // required if message_role === 'agent'
  ticket_token?: string;                   // required if message_role === 'agent'
  history?: ChatHistoryItem[];             // included on 👎 against AI for rephrase
  mode?: Mode;                             // included on 👎 against AI
}

export interface ReactionResponse {
  ok: true;
  follow_up: string | null;                // rephrased AI answer on 👎; otherwise null
}

// ─── GET /api/handoff-queue ─────────────────────────────────────────────────
// (Also acts as the heartbeat — call every 10-15s while user is on chat screen)

export type HandoffQueueResponse =
  | {
      ok: true;
      state: 'queued';
      position: number;            // 1-indexed
      total: number;
      is_next: boolean;
      estimated_wait_min: number;  // rounded, min 1
    }
  | {
      ok: true;
      state: 'active';
      position: 0;
      total: 0;
      agent_name: string;          // already disguised
    }
  | {
      ok: true;
      state: 'ended';
      position: 0;
      total: 0;
    };

// ─── POST /api/handoff-end ──────────────────────────────────────────────────

export interface HandoffEndRequest {
  ticket_id: string;
  ticket_token: string;
}

// ─── GET /api/handoff-poll ──────────────────────────────────────────────────

export interface HandoffReply {
  id: string;                                // "t-{thread_id}" or "c-{comment_id}"
  content: string;                           // cleaned text, max 5000 chars
  agent_name: string;
  ts: number;                                // epoch seconds
}

export interface HandoffPollResponse {
  ok: true;
  replies: HandoffReply[];
  now_ts: number;
}

// ─── POST /api/handoff-transcript ───────────────────────────────────────────

export interface HandoffTranscriptResponse {
  ok: boolean;
  message: string;
}

// ─── GET /health ────────────────────────────────────────────────────────────

export interface HealthResponse {
  status: 'ok';
  service: string;
  zoho_configured: boolean;
}

// ─── POST /api/register-push-token (BACKEND ENDPOINT TO BE BUILT) ───────────

export interface RegisterPushTokenRequest {
  session_id: string;
  ticket_id?: string;
  ticket_token?: string;
  platform: 'ios' | 'android';
  push_token: string;
  device_id?: string;
}

export interface RegisterPushTokenResponse {
  ok: boolean;
}

// ─── Generic error envelope ─────────────────────────────────────────────────

export interface ErrorResponse {
  ok?: false;
  error?: string;
  message?: string;
}
