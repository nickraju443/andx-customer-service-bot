export function formatTime(epochSecondsOrMs: number): string {
  const ms = epochSecondsOrMs < 1e12 ? epochSecondsOrMs * 1000 : epochSecondsOrMs;
  const d = new Date(ms);
  let h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}
