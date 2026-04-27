/**
 * Format an ISO timestamp as a short, human-readable "time ago" string used by
 * the archived/closed projects history menu.
 *
 * Buckets:
 *   < 1 minute  -> "just now"
 *   < 1 hour    -> "{N}m ago"
 *   < 24 hours  -> "{N}h ago"
 *   < 7 days    -> "{N}d ago"
 *   otherwise   -> locale-formatted month + day (e.g. "Apr 27")
 */
export function formatArchivedDate(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diff = now - d.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
