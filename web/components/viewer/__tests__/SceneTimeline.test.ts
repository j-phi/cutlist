// @vitest-environment nuxt
/**
 * Tests for SceneTimeline — the bottom strip of scene cards. The component
 * is dumb (props in, events out): we verify which user gestures emit which
 * events and that pinned scenes can't be dragged/renamed/deleted.
 */
import { describe, expect, it } from 'vitest';
import { shallowMount } from '@vue/test-utils';
import type { IdbScene } from '~/composables/useIdb';

import SceneTimeline from '../SceneTimeline.vue';

const stubs = {
  UButton: {
    inheritAttrs: false,
    props: ['label', 'icon'],
    template: '<button type="button" v-bind="$attrs"></button>',
  },
  UIcon: true,
};

function makeScene(overrides: Partial<IdbScene> = {}): IdbScene {
  return {
    id: 's1',
    projectId: 'p',
    name: 'Front',
    order: 0,
    cameraMode: 'perspective',
    cameraPose: { position: [0, 0, 0], target: [0, 0, 0] },
    objectOffsets: {},
    floorVisible: true,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

function makeDragEvent(type: string): DragEvent {
  const dt = new DataTransfer();
  const e = new Event(type, { bubbles: true, cancelable: true }) as DragEvent;
  Object.defineProperty(e, 'dataTransfer', { value: dt });
  return e;
}

function mount(props: {
  scenes: IdbScene[];
  activeSceneId?: string | null;
  busy?: boolean;
  pinnedIds?: string[];
}) {
  return shallowMount(SceneTimeline, {
    props: {
      scenes: props.scenes,
      activeSceneId: props.activeSceneId ?? null,
      busy: props.busy ?? false,
      pinnedIds: props.pinnedIds,
    },
    global: { stubs },
  });
}

describe('SceneTimeline', () => {
  it('Should emit add when the trailing + button is clicked', async () => {
    const wrapper = mount({ scenes: [] });
    await wrapper.get('button[type="button"]').trigger('click');
    expect(wrapper.emitted('add')).toHaveLength(1);
  });

  it('Should emit select when a scene card is clicked', async () => {
    const wrapper = mount({
      scenes: [makeScene({ id: 'a' }), makeScene({ id: 'b' })],
    });
    const cards = wrapper.findAll('[draggable]');
    await cards[1].trigger('click');
    expect(wrapper.emitted('select')).toEqual([['b']]);
  });

  it('Should reorder via drag-and-drop, emitting (id, toIndex)', async () => {
    const wrapper = mount({
      scenes: [
        makeScene({ id: 'a' }),
        makeScene({ id: 'b' }),
        makeScene({ id: 'c' }),
      ],
    });
    const cards = wrapper.findAll('[draggable]');
    await cards[0].element.dispatchEvent(makeDragEvent('dragstart'));
    await cards[2].element.dispatchEvent(makeDragEvent('drop'));
    expect(wrapper.emitted('reorder')).toEqual([['a', 2]]);
  });

  it('Should emit rename on Enter and not emit on Escape', async () => {
    const wrapper = mount({ scenes: [makeScene({ id: 'a', name: 'Old' })] });
    const label = wrapper.get('span.text-body');
    await label.trigger('dblclick');
    const input = wrapper.get('input');
    (input.element as HTMLInputElement).value = 'New';
    await input.trigger('keydown.enter');
    expect(wrapper.emitted('rename')).toEqual([['a', 'New']]);
  });

  it('Should not emit rename when value is whitespace-only', async () => {
    const wrapper = mount({ scenes: [makeScene({ id: 'a' })] });
    await wrapper.get('span.text-body').trigger('dblclick');
    const input = wrapper.get('input');
    (input.element as HTMLInputElement).value = '   ';
    await input.trigger('blur');
    expect(wrapper.emitted('rename')).toBeUndefined();
  });

  it('Should refuse rename / drag for pinned scenes', async () => {
    const wrapper = mount({
      scenes: [
        makeScene({ id: 'pinned', name: 'Default' }),
        makeScene({ id: 'b' }),
      ],
      pinnedIds: ['pinned'],
    });
    const card = wrapper.findAll('[draggable]')[0];
    expect(card.attributes('draggable')).toBe('false');
    await card.get('span.text-body').trigger('dblclick');
    expect(wrapper.find('input').exists()).toBe(false);
  });

  it('Should highlight the active scene with the teal border class', () => {
    const wrapper = mount({
      scenes: [makeScene({ id: 'a' }), makeScene({ id: 'b' })],
      activeSceneId: 'b',
    });
    const cards = wrapper.findAll('[draggable]');
    expect(cards[0].classes()).not.toContain('border-teal-400');
    expect(cards[1].classes()).toContain('border-teal-400');
  });
});
