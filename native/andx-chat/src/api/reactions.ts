import { postJson, RequestOptions } from './client';
import type { ReactionRequest, ReactionResponse } from './types';

export function sendReaction(req: ReactionRequest, opts?: RequestOptions): Promise<ReactionResponse> {
  return postJson<ReactionResponse>('/api/reaction', req, opts);
}
