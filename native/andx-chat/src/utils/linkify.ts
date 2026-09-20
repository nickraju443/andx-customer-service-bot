const URL_RE = /(https?:\/\/[^\s<>")]+)/g;

export interface TextSegment {
  type: 'text' | 'link';
  value: string;
}

// Strip HTML tags. The backend sometimes returns tags like <strong>, <br>, <em>
// in AI responses. Native Text components render them as literal characters,
// which is a bug. This converts the important ones to plain text.
export function stripHtml(input: string): string {
  if (!input) return '';
  let s = input;
  // Convert <br>/<br/> to newlines
  s = s.replace(/<br\s*\/?>/gi, '\n');
  // Convert </p><p> and </div><div> to double newlines
  s = s.replace(/<\/(p|div)>\s*<(p|div)[^>]*>/gi, '\n\n');
  // Strip all remaining tags entirely (leaves inner text)
  s = s.replace(/<[^>]+>/g, '');
  // Decode common HTML entities
  s = s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&mdash;/gi, '—')
    .replace(/&ndash;/gi, '–');
  // Collapse 3+ newlines to 2
  s = s.replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

export function tokenize(text: string): TextSegment[] {
  if (!text) return [];
  const cleaned = stripHtml(text);
  const out: TextSegment[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  URL_RE.lastIndex = 0;
  while ((m = URL_RE.exec(cleaned)) !== null) {
    if (m.index > last) out.push({ type: 'text', value: cleaned.slice(last, m.index) });
    out.push({ type: 'link', value: m[0] });
    last = m.index + m[0].length;
  }
  if (last < cleaned.length) out.push({ type: 'text', value: cleaned.slice(last) });
  return out;
}

export function isValidEmail(s: string): boolean {
  if (!s) return false;
  const t = s.trim();
  const at = t.indexOf('@');
  if (at < 1) return false;
  const dot = t.indexOf('.', at);
  return dot > at + 1 && dot < t.length - 1;
}
