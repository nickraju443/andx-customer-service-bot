/**
 * Single fetch wrapper used by every endpoint module.
 * - Per-call AbortController so callers can cancel (e.g. user taps Clear chat)
 * - 15s default timeout
 * - Single retry on 502/503 (matches web widget behavior)
 * - Typed XoreApiError thrown on non-2xx
 */

import type { ErrorResponse } from './types';

export const DEFAULT_BASE_URL = 'https://andx-bot-245374915379.us-central1.run.app';

// Host app can override at runtime: `setBaseUrl('http://localhost:8080')`
let baseUrl = DEFAULT_BASE_URL;

export function setBaseUrl(url: string): void {
  baseUrl = url.replace(/\/$/, '');
}

export function getBaseUrl(): string {
  return baseUrl;
}

export class XoreApiError extends Error {
  status: number;
  body: ErrorResponse | string;
  constructor(status: number, body: ErrorResponse | string, message?: string) {
    super(message || (typeof body === 'string' ? body : body.message || body.error || `HTTP ${status}`));
    this.name = 'XoreApiError';
    this.status = status;
    this.body = body;
  }
}

export interface RequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function rawRequest<T>(path: string, init: RequestInit, opts: RequestOptions): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? 15000;
  const timeoutCtrl = new AbortController();
  const timer = setTimeout(() => timeoutCtrl.abort(), timeoutMs);

  // Combine caller signal + timeout signal
  const signals: AbortSignal[] = [timeoutCtrl.signal];
  if (opts.signal) signals.push(opts.signal);
  const combined = anySignal(signals);

  try {
    const res = await fetch(`${baseUrl}${path}`, {
      ...init,
      signal: combined,
      headers: {
        'Accept': 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers || {}),
      },
    });
    const body = await parseBody(res);
    if (!res.ok) {
      throw new XoreApiError(
        res.status,
        (body as ErrorResponse | string) ?? `HTTP ${res.status}`,
      );
    }
    return body as T;
  } finally {
    clearTimeout(timer);
  }
}

export async function request<T>(path: string, init: RequestInit, opts: RequestOptions = {}): Promise<T> {
  try {
    return await rawRequest<T>(path, init, opts);
  } catch (err) {
    if (err instanceof XoreApiError && (err.status === 502 || err.status === 503)) {
      // single retry on transient backend errors
      return rawRequest<T>(path, init, opts);
    }
    throw err;
  }
}

// Combine multiple AbortSignals into one. (Native AbortSignal.any is RN 0.74+.)
function anySignal(signals: AbortSignal[]): AbortSignal {
  if (signals.length === 1) return signals[0];
  if (typeof (AbortSignal as any).any === 'function') {
    return (AbortSignal as any).any(signals);
  }
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  for (const s of signals) {
    if (s.aborted) {
      ctrl.abort();
      return ctrl.signal;
    }
    s.addEventListener('abort', onAbort);
  }
  return ctrl.signal;
}

// Shorthand helpers
export function getJson<T>(path: string, query?: Record<string, string | number | boolean>, opts?: RequestOptions): Promise<T> {
  const qs = query ? '?' + new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)])).toString() : '';
  return request<T>(path + qs, { method: 'GET' }, opts);
}

export function postJson<T>(path: string, body: unknown, opts?: RequestOptions): Promise<T> {
  return request<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) }, opts);
}
