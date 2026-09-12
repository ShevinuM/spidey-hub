/** "42s"/"6m"/"1h"/"3d" — floors at 0 (never a negative age even if `ts` is
 * momentarily ahead of `now`, e.g. a fresh injection read back the same
 * tick). */
export function agoLabel(ts: number, now: number): string {
  const diffMs = Math.max(0, now - ts);
  const s = Math.floor(diffMs / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}
