/**
 * Tiny typed pub/sub. Modules talk through this so they can't reach into each
 * other's refs. The discriminator is `event.type`; handlers registered for a
 * specific type are only invoked when the matching variant fires.
 */

export class EventBus<E extends { type: string }> {
  private handlers = new Map<E['type'], Set<(e: E) => void>>();

  on<T extends E['type']>(
    type: T,
    cb: (e: Extract<E, { type: T }>) => void,
  ): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    const handler = cb as (e: E) => void;
    set.add(handler);
    return () => set!.delete(handler);
  }

  emit(event: E): void {
    this.handlers.get(event.type)?.forEach((cb) => cb(event));
  }

  dispose(): void {
    this.handlers.clear();
  }
}
