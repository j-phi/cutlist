// @vitest-environment nuxt
/**
 * AnnotationLabels — purely presentation. We assert label rendering, the
 * pointer-events lockout (clicks belong to InputRouter, not to the overlay),
 * and that the leader opacity hook is driven by the tween cross-fade curve.
 */
import { describe, expect, it, vi } from 'vitest';
import { mount, shallowMount } from '@vue/test-utils';
import AnnotationLabels from '../AnnotationLabels.vue';
import { AnnotationProjector } from '~/lib/viewer/annotations/projector';
import type { IdbCallout, IdbDimension } from '~/composables/useIdb';

function callout(id: string, sceneId: string): IdbCallout {
  const now = '2026-04-29T00:00:00.000Z';
  return {
    id,
    sceneId,
    kind: 'callout',
    groupId: 1,
    anchorLocal: [0, 0, 0],
    anchorNormalLocal: [0, 1, 0],
    labelOffsetLocal: [0, 0.1, 0],
    text: 'hi',
    createdAt: now,
    updatedAt: now,
  };
}

function dimension(id: string, sceneId: string): IdbDimension {
  const now = '2026-04-29T00:00:00.000Z';
  return {
    id,
    sceneId,
    kind: 'dimension',
    groupId: 1,
    anchor1: { groupId: 1, local: [0, 0, 0] },
    anchor2: { groupId: 1, local: [0.1, 0, 0] },
    offsetLocal: [0, 0.05, 0],
    createdAt: now,
    updatedAt: now,
  };
}

function parseRotateRad(style: string): number {
  const m = style.match(/rotate\(([-0-9.]+)rad\)/);
  if (!m) throw new Error(`No rotate() in style: ${style}`);
  return Number(m[1]);
}

function makeProjector(): AnnotationProjector {
  const p = new AnnotationProjector(
    {
      objectLocalToWorld: () => [0, 0, 0],
      worldToScreen: () => ({ x: 100, y: 50, inFront: true }),
      onFrame: () => () => {},
    },
    () => [],
  );
  return p;
}

describe('AnnotationLabels — rendering', () => {
  it('Should render one wrapper per visible annotation in the active scene', () => {
    const projector = makeProjector();
    const annotations = [callout('a1', 's1'), callout('a2', 's2')];
    // Pre-seed projector positions so labels render visible.
    (projector.getScreenPositions() as Map<string, unknown>).set('a1', {
      x: 10,
      y: 20,
      inFront: true,
      worldAnchor: [0, 0, 0],
    });
    const wrapper = shallowMount(AnnotationLabels, {
      props: {
        annotations,
        activeSceneId: 's1',
        tween: null,
        projector,
      },
    });
    const labels = wrapper.findAll('[data-annotation-id]');
    expect(labels).toHaveLength(1);
    expect(labels[0].attributes('data-annotation-id')).toBe('a1');
  });

  it('Should disable pointer events on the overlay so clicks fall through', () => {
    const projector = makeProjector();
    const wrapper = shallowMount(AnnotationLabels, {
      props: {
        annotations: [],
        activeSceneId: null,
        tween: null,
        projector,
      },
    });
    const root = wrapper.find('[data-testid="annotation-labels"]');
    expect(root.attributes('style')).toContain('pointer-events: none');
  });

  it('Should swap to the outgoing scene during the first half of a tween', () => {
    const projector = makeProjector();
    const annotations = [callout('a1', 's1'), callout('a2', 's2')];
    (projector.getScreenPositions() as Map<string, unknown>).set('a1', {
      x: 10,
      y: 20,
      inFront: true,
      worldAnchor: [0, 0, 0],
    });
    const wrapper = shallowMount(AnnotationLabels, {
      props: {
        annotations,
        activeSceneId: 's2',
        tween: { from: 's1', to: 's2', t: 0.25 },
        projector,
      },
    });
    const labels = wrapper.findAll('[data-annotation-id]');
    expect(labels).toHaveLength(1);
    expect(labels[0].attributes('data-annotation-id')).toBe('a1');
  });

  it('Should drive leader opacity scale on the cross-fade curve', () => {
    const projector = makeProjector();
    const onLeaderOpacityScale = vi.fn();
    const wrapper = shallowMount(AnnotationLabels, {
      props: {
        annotations: [],
        activeSceneId: null,
        tween: null,
        projector,
        onLeaderOpacityScale,
      },
    });
    expect(onLeaderOpacityScale).toHaveBeenLastCalledWith(1);

    wrapper.setProps({ tween: { from: null, to: 's2', t: 0.5 } });
    return wrapper.vm.$nextTick().then(() => {
      expect(onLeaderOpacityScale).toHaveBeenLastCalledWith(0);
    });
  });

  it('Should keep label opacity at 1 outside a tween', () => {
    const projector = makeProjector();
    (projector.getScreenPositions() as Map<string, unknown>).set('a1', {
      x: 10,
      y: 20,
      inFront: true,
      worldAnchor: [0, 0, 0],
    });
    const wrapper = shallowMount(AnnotationLabels, {
      props: {
        annotations: [callout('a1', 's1')],
        activeSceneId: 's1',
        tween: null,
        projector,
      },
    });
    const label = wrapper.find('[data-annotation-id="a1"]');
    const style = label.attributes('style') ?? '';
    expect(style).toContain('opacity: 1');
  });

  it('Should hide labels whose projected position is behind the camera', () => {
    const projector = makeProjector();
    (projector.getScreenPositions() as Map<string, unknown>).set('a1', {
      x: 10,
      y: 20,
      inFront: false,
      worldAnchor: [0, 0, 0],
    });
    const wrapper = shallowMount(AnnotationLabels, {
      props: {
        annotations: [callout('a1', 's1')],
        activeSceneId: 's1',
        tween: null,
        projector,
      },
    });
    const style =
      wrapper.find('[data-annotation-id="a1"]').attributes('style') ?? '';
    expect(style).toContain('display: none');
  });

  it('Should anchor a dimension chip with translate(-50%, -100%) so it sits on the line', () => {
    const projector = makeProjector();
    (projector.getAuxScreenPositions() as Map<string, unknown>).set('d1', [
      { x: 100, y: 200, inFront: true, worldAnchor: [0, 0, 0] },
      { x: 200, y: 200, inFront: true, worldAnchor: [0.1, 0, 0] },
    ]);
    const wrapper = shallowMount(AnnotationLabels, {
      props: {
        annotations: [dimension('d1', 's1')],
        activeSceneId: 's1',
        tween: null,
        projector,
      },
    });
    const style =
      wrapper.find('[data-annotation-id="d1"]').attributes('style') ?? '';
    expect(style).toContain('translate(-50%, -100%)');
    expect(style).toContain('translate(150px, 200px)');
  });

  it('Should keep the dimension chip rotation continuous across a vertical-line crossing', async () => {
    // Camera-orbit scenario: the projected line passes from "just before
    // vertical, going down" to "just after vertical, now going up". Without
    // continuity tracking the angle would snap by ~π between frames and the
    // chip would appear to flip onto the opposite side of the line.
    const projector = makeProjector();
    const aux = projector.getAuxScreenPositions() as Map<string, unknown>;
    aux.set('d1', [
      { x: 100, y: 100, inFront: true, worldAnchor: [0, 0, 0] },
      { x: 101, y: 200, inFront: true, worldAnchor: [0.1, 0, 0] },
    ]);
    const wrapper = shallowMount(AnnotationLabels, {
      props: {
        annotations: [dimension('d1', 's1')],
        activeSceneId: 's1',
        tween: null,
        projector,
      },
    });
    const styleBefore =
      wrapper.find('[data-annotation-id="d1"]').attributes('style') ?? '';
    const before = parseRotateRad(styleBefore);

    aux.set('d1', [
      { x: 100, y: 100, inFront: true, worldAnchor: [0, 0, 0] },
      { x: 99, y: 200, inFront: true, worldAnchor: [0.1, 0, 0] },
    ]);
    projector.version.value++;
    await wrapper.vm.$nextTick();

    const styleAfter =
      wrapper.find('[data-annotation-id="d1"]').attributes('style') ?? '';
    const after = parseRotateRad(styleAfter);

    // A π-snap would push the delta close to π (≈ 3.14). Continuity should
    // keep them within a small fraction of a radian.
    expect(Math.abs(after - before)).toBeLessThan(0.1);
  });

  it('Should forward the projector measurement to the dimension kind component as measuredMeters', () => {
    const projector = makeProjector();
    (projector.getAuxScreenPositions() as Map<string, unknown>).set('d1', [
      { x: 100, y: 200, inFront: true, worldAnchor: [0, 0, 0] },
      { x: 200, y: 200, inFront: true, worldAnchor: [0.1, 0, 0] },
    ]);
    (projector.getMeasurements() as Map<string, number>).set('d1', 0.42);
    const dimComp = {
      props: ['annotation', 'draft', 'measuredMeters'],
      template: '<span class="dl">{{ measuredMeters }}</span>',
    };
    const wrapper = mount(AnnotationLabels, {
      props: {
        annotations: [dimension('d1', 's1')],
        activeSceneId: 's1',
        tween: null,
        projector,
        kindComponents: { dimension: dimComp },
      },
    });
    expect(wrapper.find('.dl').text()).toBe('0.42');
  });

  it('Should render kindComponents when provided', () => {
    const projector = makeProjector();
    (projector.getScreenPositions() as Map<string, unknown>).set('a1', {
      x: 10,
      y: 20,
      inFront: true,
      worldAnchor: [0, 0, 0],
    });
    const calloutComp = {
      props: ['annotation', 'draft'],
      template: '<span class="cl">{{ annotation.text }}</span>',
    };
    const wrapper = mount(AnnotationLabels, {
      props: {
        annotations: [callout('a1', 's1')],
        activeSceneId: 's1',
        tween: null,
        projector,
        kindComponents: { callout: calloutComp },
      },
    });
    expect(wrapper.find('.cl').text()).toBe('hi');
  });

  it('Should bubble a child label `committed` event as `draftCommitted` with the annotation id', async () => {
    const projector = makeProjector();
    (projector.getScreenPositions() as Map<string, unknown>).set('a1', {
      x: 10,
      y: 20,
      inFront: true,
      worldAnchor: [0, 0, 0],
    });
    const calloutComp = {
      props: ['annotation', 'draft'],
      emits: ['committed'],
      template:
        '<button class="cl" @click="$emit(\'committed\')">{{ annotation.text }}</button>',
    };
    const wrapper = mount(AnnotationLabels, {
      props: {
        annotations: [callout('a1', 's1')],
        activeSceneId: 's1',
        tween: null,
        projector,
        kindComponents: { callout: calloutComp },
      },
    });
    await wrapper.find('.cl').trigger('click');
    expect(wrapper.emitted('draftCommitted')).toBeTruthy();
    expect(wrapper.emitted('draftCommitted')![0]).toEqual(['a1']);
  });
});
