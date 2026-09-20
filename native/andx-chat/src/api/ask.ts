import { postJson, RequestOptions } from './client';
import type { AskRequest, AskResponse, AgentStatusResponse } from './types';
import { getJson } from './client';

export function ask(req: AskRequest, opts?: RequestOptions): Promise<AskResponse> {
  return postJson<AskResponse>('/api/ask', req, opts);
}

export function getAgentStatus(opts?: RequestOptions): Promise<AgentStatusResponse> {
  return getJson<AgentStatusResponse>('/api/agent-status', undefined, opts);
}
