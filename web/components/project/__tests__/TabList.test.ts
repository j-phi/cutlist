// @vitest-environment nuxt
import { shallowMount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';

import TabList from '../TabList.vue';

// Real ResizeObserver/MutationObserver aren't strictly needed here — the
// chevron-overflow logic runs synchronously on the scroll event, and
// scroll-to-active runs once on mount via scrollIntoView. We provide tiny
// no-op fakes so the component mounts in happy-dom.
class NoopObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
  takeRecords() {
    return [];
  }
}

beforeEach(() => {
  (globalThis as any).ResizeObserver = NoopObserver;
  (globalThis as any).MutationObserver = NoopObserver;
});

afterEach(() => {
  vi.restoreAllMocks();
});

function getComponent(slot = '<li data-tab-active="true">Tab</li>') {
  return shallowMount(TabList, {
    slots: { default: slot },
    global: { stubs: { UIcon: true } },
    attachTo: document.body,
  });
}

function fakeScrollerSize(
  component: ReturnType<typeof getComponent>,
  {
    scrollLeft,
    clientWidth,
    scrollWidth,
  }: { scrollLeft: number; clientWidth: number; scrollWidth: number },
) {
  const el = component.find('ul').element as HTMLUListElement;
  Object.defineProperty(el, 'scrollLeft', {
    configurable: true,
    writable: true,
    value: scrollLeft,
  });
  Object.defineProperty(el, 'clientWidth', {
    configurable: true,
    get: () => clientWidth,
  });
  Object.defineProperty(el, 'scrollWidth', {
    configurable: true,
    get: () => scrollWidth,
  });
  return el;
}

describe('TabList', () => {
  // Chevron overflow detection — drives the only state machine in the
  // component (showLeft / showRight via the scroll handler). Buggy version:
  // chevrons show when not needed or hide when content overflows.
  it('Should toggle the left/right chevrons based on scroll position', async () => {
    const component = getComponent();
    const buttons = component.findAll('button');
    expect(buttons).toHaveLength(2);
    // Initially both hidden.
    for (const b of buttons) {
      expect(b.attributes('style')).toContain('display: none');
    }

    // Scroll partway: both chevrons visible.
    const ul = fakeScrollerSize(component, {
      scrollLeft: 50,
      clientWidth: 200,
      scrollWidth: 1000,
    });
    ul.dispatchEvent(new Event('scroll'));
    await nextTick();

    const leftBtn = component.get('button[aria-label="Scroll tabs left"]');
    const rightBtn = component.get('button[aria-label="Scroll tabs right"]');
    expect(leftBtn.attributes('style') ?? '').not.toContain('display: none');
    expect(rightBtn.attributes('style') ?? '').not.toContain('display: none');
  });

  // Chevron click invokes scrollBy on the scroller — the only side effect
  // beyond observer setup.
  it('Should call scrollBy with the correct delta on chevron click', async () => {
    const component = getComponent();
    const ul = fakeScrollerSize(component, {
      scrollLeft: 100,
      clientWidth: 200,
      scrollWidth: 1000,
    });
    const scrollBy = vi.fn();
    Object.defineProperty(ul, 'scrollBy', {
      configurable: true,
      value: scrollBy,
    });
    ul.dispatchEvent(new Event('scroll'));
    await nextTick();

    await component
      .get('button[aria-label="Scroll tabs right"]')
      .trigger('click');
    expect(scrollBy).toHaveBeenLastCalledWith({
      left: 240,
      behavior: 'smooth',
    });

    await component
      .get('button[aria-label="Scroll tabs left"]')
      .trigger('click');
    expect(scrollBy).toHaveBeenLastCalledWith({
      left: -240,
      behavior: 'smooth',
    });
  });
});
