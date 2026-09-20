// UUID-ish ids. No native crypto in RN by default; this is good enough for
// in-memory dedupe and Zoho comment correlation.

function rand(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function newMessageId(): string {
  return `m-${Date.now().toString(36)}-${rand()}`;
}

export function newSessionId(): string {
  return `native-${Date.now().toString(36)}-${rand()}${rand()}`;
}
