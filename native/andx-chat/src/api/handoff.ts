import { getJson, postJson, RequestOptions } from './client';
import type {
  HandoffRequest,
  HandoffResponse,
  HandoffMessageRequest,
  HandoffEndRequest,
  HandoffPollResponse,
  HandoffQueueResponse,
  HandoffTranscriptResponse,
} from './types';

export function startHandoff(req: HandoffRequest, opts?: RequestOptions): Promise<HandoffResponse> {
  return postJson<HandoffResponse>('/api/handoff', req, opts);
}

export function sendHandoffMessage(req: HandoffMessageRequest, opts?: RequestOptions): Promise<{ ok: true }> {
  return postJson<{ ok: true }>('/api/handoff-message', req, opts);
}

export function pollAgentReplies(
  ticketId: string,
  ticketToken: string,
  sinceTs: number,
  opts?: RequestOptions,
): Promise<HandoffPollResponse> {
  return getJson<HandoffPollResponse>(
    '/api/handoff-poll',
    { ticket_id: ticketId, ticket_token: ticketToken, since_ts: sinceTs },
    opts,
  );
}

// Calling this endpoint ALSO acts as the heartbeat. Call every 10-15s or the
// backend drops the user from the queue after 30s of silence.
export function pollQueue(
  ticketId: string,
  ticketToken: string,
  opts?: RequestOptions,
): Promise<HandoffQueueResponse> {
  return getJson<HandoffQueueResponse>(
    '/api/handoff-queue',
    { ticket_id: ticketId, ticket_token: ticketToken },
    opts,
  );
}

export function endHandoff(req: HandoffEndRequest, opts?: RequestOptions): Promise<{ ok: true }> {
  return postJson<{ ok: true }>('/api/handoff-end', req, opts);
}

export function sendTranscript(
  ticketId: string,
  ticketToken: string,
  opts?: RequestOptions,
): Promise<HandoffTranscriptResponse> {
  return postJson<HandoffTranscriptResponse>(
    '/api/handoff-transcript',
    { ticket_id: ticketId, ticket_token: ticketToken },
    opts,
  );
}
