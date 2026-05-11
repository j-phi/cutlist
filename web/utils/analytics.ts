type EventMetadata = Record<string, string | number | boolean>;

declare global {
  interface Window {
    sa_event?: (name: string, metadata?: EventMetadata) => void;
  }
}

export function trackEvent(name: string, metadata?: EventMetadata): void {
  if (typeof window === 'undefined') return;
  window.sa_event?.(name, metadata);
}
