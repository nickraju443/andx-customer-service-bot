import { postJson, RequestOptions } from './client';
import type { RegisterPushTokenRequest, RegisterPushTokenResponse } from './types';

/**
 * NOTE: This endpoint is NOT YET built on the backend.
 * The contract is fixed; the implementation is the follow-up task documented
 * in the package README under "Push notifications".
 *
 * When backend ships it, this client function is ready to use as-is.
 */
export function registerPushToken(
  req: RegisterPushTokenRequest,
  opts?: RequestOptions,
): Promise<RegisterPushTokenResponse> {
  return postJson<RegisterPushTokenResponse>('/api/register-push-token', req, opts);
}
