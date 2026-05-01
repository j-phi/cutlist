import { ref } from 'vue';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { partVisibility, useObjectsPanel } from '../useObjectsPanel';
import type { SceneAuthor } from '../useSceneAuthor';
import type { GroupId, ObjectGraph, ObjectNode } from '~/utils/types';

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
    makeNode(3, 10, 'Drawer Side C'),
    makeNode(4, 11, 'Drawer Bottom'),
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

function makeAuthor(initial: Set<GroupId> | null = null): SceneAuthor & {
  resetCalls: number;
} {
  const visibleObjects = ref<Set<GroupId> | null>(initial);
  let resetCalls = 0;

  function ensure(): Set<GroupId> {
    if (visibleObjects.value === null) {
      visibleObjects.value = new Set([1, 2, 3, 4]);
    }
    return new Set(visibleObjects.value);
  }
  return {
    visibleObjects,
    setObjectsVisibility(ids, visible) {
      const next = ensure();
      for (const id of ids) {
        if (visible) next.add(id);
        else next.delete(id);
      }
      visibleObjects.value = next;
    },
    toggleObjectVisibility(id) {
      const set = visibleObjects.value;
      const cur = set === null ? true : set.has(id);
      this.setObjectsVisibility([id], !cur);
    },
    showAllObjects() {
      visibleObjects.value = null;
    },
    hideAllObjects() {
      visibleObjects.value = new Set();
    },
    resetAllOffsets() {
      resetCalls++;
    },
    get resetCalls() {
      return resetCalls;
    },
  } as SceneAuthor & { resetCalls: number };
}

describe('partVisibility', () => {
  it('Should return all when every Object is visible', () => {
    expect(partVisibility(3, 3)).toBe('all');
  });
  it('Should return none when no Object is visible', () => {
    expect(partVisibility(0, 3)).toBe('none');
  });
  it('Should return mixed when some are visible', () => {
    expect(partVisibility(1, 3)).toBe('mixed');
  });
  it('Should treat zero-Object parts as all-visible', () => {
    expect(partVisibility(0, 0)).toBe('none');
  });
});

describe('useObjectsPanel', () => {
  it('Should build a Part → Object tree ordered by partNumber', () => {
    const graph = ref<ObjectGraph | null>(makeGraph());
    const panel = useObjectsPanel(graph, makeAuthor());
    const tree = panel.tree.value;
    expect(tree).toHaveLength(2);
    expect(tree[0].partNumber).toBe(10);
    expect(tree[0].partName).toBe('Drawer Side');
    expect(tree[0].objects.map((o) => o.groupId)).toEqual([1, 2, 3]);
    expect(tree[1].partNumber).toBe(11);
    expect(tree[1].objects[0].name).toBe('Drawer Bottom');
  });

  it('Should report all visible by default (null sentinel)', () => {
    const graph = ref<ObjectGraph | null>(makeGraph());
    const panel = useObjectsPanel(graph, makeAuthor());
    expect(panel.partVisibilityState(10)).toBe('all');
    expect(panel.isObjectVisible(1)).toBe(true);
  });

  it('Should report mixed when some Objects are hidden', () => {
    const graph = ref<ObjectGraph | null>(makeGraph());
    const author = makeAuthor(new Set([1, 4]));
    const panel = useObjectsPanel(graph, author);
    expect(panel.partVisibilityState(10)).toBe('mixed');
    expect(panel.partVisibilityState(11)).toBe('all');
  });

  it('Should resolve mixed → show all on togglePartVisibility', () => {
    const graph = ref<ObjectGraph | null>(makeGraph());
    const author = makeAuthor(new Set([1]));
    const panel = useObjectsPanel(graph, author);
    panel.togglePartVisibility(10);
    expect(panel.partVisibilityState(10)).toBe('all');
  });

  it('Should hide a fully visible part on togglePartVisibility', () => {
    const graph = ref<ObjectGraph | null>(makeGraph());
    const author = makeAuthor(null);
    const panel = useObjectsPanel(graph, author);
    panel.togglePartVisibility(10);
    expect(panel.partVisibilityState(10)).toBe('none');
  });

  it('Should toggle a single Object via toggleObjectVisibility', () => {
    const graph = ref<ObjectGraph | null>(makeGraph());
    const author = makeAuthor(null);
    const panel = useObjectsPanel(graph, author);
    panel.toggleObjectVisibility(2);
    expect(panel.isObjectVisible(2)).toBe(false);
    expect(panel.partVisibilityState(10)).toBe('mixed');
  });

  it('Should track collapsed parts with togglePartCollapse', () => {
    const graph = ref<ObjectGraph | null>(makeGraph());
    const panel = useObjectsPanel(graph, makeAuthor());
    expect(panel.isCollapsed(10)).toBe(false);
    panel.togglePartCollapse(10);
    expect(panel.isCollapsed(10)).toBe(true);
    panel.togglePartCollapse(10);
    expect(panel.isCollapsed(10)).toBe(false);
  });

  it('Should call sceneAuthor.resetAllOffsets via resetAllPositions', () => {
    const graph = ref<ObjectGraph | null>(makeGraph());
    const author = makeAuthor();
    const panel = useObjectsPanel(graph, author);
    panel.resetAllPositions();
    expect(author.resetCalls).toBe(1);
  });

  it('Should fall back to "Part #N" when the graph parts list lacks an entry', () => {
    const g = makeGraph();
    g.parts = [];
    const graph = ref<ObjectGraph | null>(g);
    const panel = useObjectsPanel(graph, makeAuthor());
    expect(panel.tree.value[0].partName).toBe('Part #10');
  });
});
