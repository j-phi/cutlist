/**
 * Write text to the system clipboard. Resolves true on success, false when the
 * Clipboard API is unavailable or the write is rejected (e.g. permission
 * denied, insecure context). Callers surface the outcome via a toast rather
 * than throwing.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
