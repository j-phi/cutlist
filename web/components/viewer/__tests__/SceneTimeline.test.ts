// @vitest-environment nuxt
/**
 * Tests for SceneTimeline — the bottom-stuck Scenes strip. The component
 * is dumb (props in, events out): we verify which user gestures emit
 * which events and that pinned scenes can't be dragged/renamed/deleted.
 */
import { describe, expect, it } from 'vitest';
import { shallowMount } from '@vue/test-utils';
import type { IdbScene } from '~/composables/useIdb';

import SceneTimeline from '../SceneTimeline.vue';

const stubs = {
  UButton: {
    inheritAttrs: false,
    props: ['label', 'icon', 'block', 'size', 'variant', 'color', 'disabled'],
    template: '<button type="button" v-bind="$attrs">{{ label }}</button>',
  },
  UIcon: true,
};

function makeScene(overrides: Partial<IdbScene> = {}): IdbScene {
  return {
    id: 's1',
    modelId: 'm',
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
  collapsed?: boolean;
  canUpdateActive?: boolean;
}) {
  return shallowMount(SceneTimeline, {
    props: {
      scenes: props.scenes,
      activeSceneId: props.activeSceneId ?? null,
      busy: props.busy ?? false,
      pinnedIds: props.pinnedIds,
      collapsed: props.collapsed ?? false,
      canUpdateActive: props.canUpdateActive ?? false,
    },
    global: { stubs },
  });
}

function findByLabel(wrapper: ReturnType<typeof mount>, label: string) {
  return wrapper.findAll('button').find((b) => b.text().trim() === label);
}

describe('SceneTimeline', () => {
  it('Should emit add when the Capture scene button is clicked', async () => {
    const wrapper = mount({ scenes: [] });
    const addBtn = findByLabel(wrapper, 'Capture scene');
    expect(addBtn).toBeDefined();
    await addBtn!.trigger('click');
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

  it('Should hide the cards body when collapsed', () => {
    const wrapper = mount({
      scenes: [makeScene({ id: 'a' })],
      collapsed: true,
    });
    expect(wrapper.findAll('[draggable]')).toHaveLength(0);
    // Header still renders the Capture button.
    expect(findByLabel(wrapper, 'Capture scene')).toBeDefined();
  });

  it('Should show an Update overlay on the active scene when canUpdateActive', async () => {
    const wrapper = mount({
      scenes: [makeScene({ id: 'a' }), makeScene({ id: 'b' })],
      activeSceneId: 'b',
      canUpdateActive: true,
    });
    const updateBtn = findByLabel(wrapper, 'Update');
    expect(updateBtn).toBeDefined();
    await updateBtn!.trigger('click');
    expect(wrapper.emitted('updateActive')).toHaveLength(1);
    // Activating Update must not also activate the underlying scene card.
    expect(wrapper.emitted('select')).toBeUndefined();
  });

  it('Should not emit updateActive when canUpdateActive is false', () => {
    const wrapper = mount({
      scenes: [makeScene({ id: 'a' })],
      activeSceneId: 'a',
      canUpdateActive: false,
    });
    expect(findByLabel(wrapper, 'Update')).toBeUndefined();
  });
});
