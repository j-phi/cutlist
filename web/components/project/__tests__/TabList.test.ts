// @vitest-environment nuxt
import { shallowMount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';

import TabList from '../TabList.vue';

interface RecordedObserver {
  cb: (entries: unknown[]) => void;
  observe: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
}

const resizeObservers: RecordedObserver[] = [];
const mutationObservers: RecordedObserver[] = [];

class FakeResizeObserver {
  observe: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  constructor(cb: (entries: unknown[]) => void) {
    this.observe = vi.fn();
    this.disconnect = vi.fn();
    resizeObservers.push({
      cb,
      observe: this.observe,
      disconnect: this.disconnect,
    });
  }
  unobserve() {}
}

class FakeMutationObserver {
  observe: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  constructor(cb: (entries: unknown[]) => void) {
    this.observe = vi.fn();
    this.disconnect = vi.fn();
    mutationObservers.push({
      cb,
      observe: this.observe,
      disconnect: this.disconnect,
    });
  }
  takeRecords() {
    return [];
  }
}

describe('TabList', () => {
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

  beforeEach(() => {
    resizeObservers.length = 0;
    mutationObservers.length = 0;
    (globalThis as any).ResizeObserver = FakeResizeObserver;
    (globalThis as any).MutationObserver = FakeMutationObserver;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Rendering', () => {
    it('Should hide both scroll buttons initially', () => {
      const component = getComponent();
      // v-show="false" → button has style="display: none;"
      const buttons = component.findAll('button');
      expect(buttons).toHaveLength(2);
      for (const b of buttons) {
        expect(b.attributes('style')).toContain('display: none');
      }
    });
  });

  describe('Scroll behavior', () => {
    it('Should show the left button after scrolling right', async () => {
      const component = getComponent();
      const ul = fakeScrollerSize(component, {
        scrollLeft: 50,
        clientWidth: 200,
        scrollWidth: 1000,
      });

      ul.dispatchEvent(new Event('scroll'));
      await nextTick();

      const leftBtn = component.get('button[aria-label="Scroll tabs left"]');
      expect(leftBtn.attributes('style') ?? '').not.toContain('display: none');
    });

    it('Should show the right button when content overflows on the right', async () => {
      const component = getComponent();
      const ul = fakeScrollerSize(component, {
        scrollLeft: 0,
        clientWidth: 200,
        scrollWidth: 1000,
      });

      ul.dispatchEvent(new Event('scroll'));
      await nextTick();

      const rightBtn = component.get('button[aria-label="Scroll tabs right"]');
      expect(rightBtn.attributes('style') ?? '').not.toContain('display: none');
    });

    it('Should call scrollBy with +240 on right-button click', async () => {
      const component = getComponent();
      const ul = fakeScrollerSize(component, {
        scrollLeft: 0,
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

      expect(scrollBy).toHaveBeenCalledWith({ left: 240, behavior: 'smooth' });
    });

    it('Should call scrollBy with -240 on left-button click', async () => {
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
        .get('button[aria-label="Scroll tabs left"]')
        .trigger('click');

      expect(scrollBy).toHaveBeenCalledWith({ left: -240, behavior: 'smooth' });
    });
  });

  describe('Lifecycle', () => {
    it('Should disconnect observers on unmount', () => {
      const component = getComponent();
      expect(resizeObservers).toHaveLength(1);
      expect(mutationObservers).toHaveLength(1);
      const ro = resizeObservers[0];
      const mo = mutationObservers[0];
      expect(ro.observe).toHaveBeenCalled();
      expect(mo.observe).toHaveBeenCalled();

      component.unmount();

      expect(ro.disconnect).toHaveBeenCalled();
      expect(mo.disconnect).toHaveBeenCalled();
    });
  });
});
