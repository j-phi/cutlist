// @vitest-environment nuxt
import { nextTick, ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import * as THREE from 'three';

import ObjectsPanel from '../ObjectsPanel.vue';
import type { SceneAuthor } from '~/composables/useSceneAuthor';
import type { GroupId, ObjectGraph, ObjectNode } from '~/utils/types';
import useModelViewerStore from '~/composables/useModelViewerStore';

function makeNode(
  groupId: number,
  partNumber: number,
  name: string,
): ObjectNode {
  return {
    groupId,
    partNumber,
    name,
    meshes: [],
    originalMatrix: new THREE.Matrix4(),
    edgesLocal: new Float32Array(0),
  };
}

function makeGraph(): ObjectGraph {
  const objects: ObjectNode[] = [
    makeNode(1, 10, 'Drawer Side A'),
    makeNode(2, 10, 'Drawer Side B'),
    makeNode(3, 11, 'Drawer Bottom'),
  ];
  const partIndex = new Map<number, ObjectNode[]>();
  for (const o of objects) {
    const list = partIndex.get(o.partNumber);
    if (list) list.push(o);
    else partIndex.set(o.partNumber, [o]);
  }
  const objectIndex = new Map<number, ObjectNode>();
  for (const o of objects) objectIndex.set(o.groupId, o);
  return {
    parts: [
      {
        partNumber: 10,
        instanceNumber: 1,
        name: 'Drawer Side',
        size: { width: 0, length: 0, thickness: 0 },
        colorKey: 'k',
      },
      {
        partNumber: 11,
        instanceNumber: 1,
        name: 'Drawer Bottom',
        size: { width: 0, length: 0, thickness: 0 },
        colorKey: 'k',
      },
    ],
    objects,
    objectIndex,
    partIndex,
    colorMap: {},
    nodePartMap: [],
  };
}

function makeAuthor(): SceneAuthor & { calls: string[] } {
  const visibleObjects = ref<Set<GroupId> | null>(null);
  const calls: string[] = [];
  return {
    visibleObjects,
    setObjectsVisibility(ids, visible) {
      calls.push(`setObjectsVisibility(${ids.join(',')}, ${visible})`);
      const set = visibleObjects.value ?? new Set([1, 2, 3]);
      const next = new Set(set);
      for (const id of ids) {
        if (visible) next.add(id);
        else next.delete(id);
      }
      visibleObjects.value = next;
    },
    toggleObjectVisibility(id) {
      const cur = visibleObjects.value === null || visibleObjects.value.has(id);
      this.setObjectsVisibility([id], !cur);
    },
    showAllObjects() {
      calls.push('showAllObjects');
      visibleObjects.value = null;
    },
    hideAllObjects() {
      calls.push('hideAllObjects');
      visibleObjects.value = new Set();
    },
    resetAllOffsets() {
      calls.push('resetAllOffsets');
    },
    calls,
  } as SceneAuthor & { calls: string[] };
}

const stubs = {
  UButton: {
    inheritAttrs: false,
    props: ['icon', 'title'],
    template: '<button type="button" :title="title" v-bind="$attrs"></button>',
  },
  UIcon: { props: ['name'], template: '<i :data-icon="name"></i>' },
};

describe('ObjectsPanel', () => {
  beforeEach(() => {
    useModelViewerStore().clearGroupSelection();
  });

  it('Should render imported part names and Object names', () => {
    const component = mount(ObjectsPanel, {
      props: { graph: makeGraph(), author: makeAuthor() },
      global: { stubs },
    });
    const text = component.text();
    expect(text).toContain('Drawer Side');
    expect(text).toContain('Drawer Bottom');
    expect(text).toContain('Drawer Side A');
    expect(text).toContain('Drawer Side B');
  });

  it('Should call resetAllOffsets when the reset header button is clicked', async () => {
    const author = makeAuthor();
    const component = mount(ObjectsPanel, {
      props: { graph: makeGraph(), author },
      global: { stubs },
    });
    const resetBtn = component
      .findAll('button')
      .find((b) => b.attributes('title') === 'Reset all positions');
    expect(resetBtn).toBeTruthy();
    await resetBtn!.trigger('click');
    expect(author.calls).toContain('resetAllOffsets');
  });

  it('Should call showAllObjects and hideAllObjects from the header buttons', async () => {
    const author = makeAuthor();
    const component = mount(ObjectsPanel, {
      props: { graph: makeGraph(), author },
      global: { stubs },
    });
    const buttons = component.findAll('button');
    const showAll = buttons.find((b) => b.attributes('title') === 'Show all');
    const hideAll = buttons.find((b) => b.attributes('title') === 'Hide all');
    await showAll!.trigger('click');
    await hideAll!.trigger('click');
    expect(author.calls).toContain('showAllObjects');
    expect(author.calls).toContain('hideAllObjects');
  });

  it('Should toggle a single Object visibility from its eye button', async () => {
    const author = makeAuthor();
    const component = mount(ObjectsPanel, {
      props: { graph: makeGraph(), author },
      global: { stubs },
    });
    // Find any per-Object eye toggle (title="Hide" by default since visible).
    const eyeBtn = component
      .findAll('button')
      .find((b) => b.attributes('title') === 'Hide');
    expect(eyeBtn).toBeTruthy();
    await eyeBtn!.trigger('click');
    expect(
      author.calls.some((c) => c.startsWith('setObjectsVisibility(')),
    ).toBe(true);
  });

  it('Should scroll the first selected Object row into view when selection changes', async () => {
    const author = makeAuthor();
    const component = mount(ObjectsPanel, {
      props: { graph: makeGraph(), author },
      global: { stubs },
      attachTo: document.body,
    });
    const store = useModelViewerStore();
    const rows = component.findAll('[class*="pl-7"]');
    expect(rows.length).toBe(3);
    const spies = rows.map((r) => {
      const el = r.element as HTMLElement;
      const spy = vi.fn();
      el.scrollIntoView = spy;
      return spy;
    });

    store.selectGroupIds([2]);
    await nextTick();
    await nextTick();

    expect(spies[1]).toHaveBeenCalledTimes(1);
    expect(spies[0]).not.toHaveBeenCalled();
    expect(spies[2]).not.toHaveBeenCalled();
    component.unmount();
  });

  it('Should expand a collapsed Part before scrolling its Object into view', async () => {
    const author = makeAuthor();
    const component = mount(ObjectsPanel, {
      props: { graph: makeGraph(), author },
      global: { stubs },
      attachTo: document.body,
    });
    const store = useModelViewerStore();
    const collapseBtn = component
      .findAll('button')
      .find((b) => b.attributes('title') === 'Collapse');
    await collapseBtn!.trigger('click');
    expect(component.findAll('[class*="pl-7"]').length).toBeLessThan(3);

    store.selectGroupIds([1]);
    await nextTick();
    await nextTick();

    const rows = component.findAll('[class*="pl-7"]');
    expect(rows.length).toBe(3);
    component.unmount();
  });

  it('Should render the empty-state message when no graph is provided', () => {
    const component = mount(ObjectsPanel, {
      props: { graph: null, author: makeAuthor() },
      global: { stubs },
    });
    expect(component.text()).toContain('Load a model');
  });
});
