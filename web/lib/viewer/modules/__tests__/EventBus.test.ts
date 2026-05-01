import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../EventBus';

type TestEvent = { type: 'a'; n: number } | { type: 'b'; s: string };

describe('EventBus', () => {
  it('Should call only handlers registered for the matching event type', () => {
    const bus = new EventBus<TestEvent>();
    const a = vi.fn();
    const b = vi.fn();
    bus.on('a', a);
    bus.on('b', b);

    bus.emit({ type: 'a', n: 1 });

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
    expect(a).toHaveBeenCalledWith({ type: 'a', n: 1 });
  });

  it('Should support multiple handlers for the same event type', () => {
    const bus = new EventBus<TestEvent>();
    const h1 = vi.fn();
    const h2 = vi.fn();
    bus.on('a', h1);
    bus.on('a', h2);

    bus.emit({ type: 'a', n: 7 });

    expect(h1).toHaveBeenCalledTimes(1);
    expect(h2).toHaveBeenCalledTimes(1);
  });

  it('Should stop calling a handler after the returned unsubscribe runs', () => {
    const bus = new EventBus<TestEvent>();
    const handler = vi.fn();
    const off = bus.on('a', handler);
    bus.emit({ type: 'a', n: 1 });
    off();
    bus.emit({ type: 'a', n: 2 });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('Should clear all handlers on dispose', () => {
    const bus = new EventBus<TestEvent>();
    const h = vi.fn();
    bus.on('a', h);
    bus.dispose();
    bus.emit({ type: 'a', n: 1 });

    expect(h).not.toHaveBeenCalled();
  });
});
