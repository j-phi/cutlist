// @vitest-environment nuxt
/**
 * AnnotationLabels — purely presentation. We assert label rendering, the
 * pointer-events lockout (per Spec 07: clicks belong to InputRouter, not to
 * the overlay), and that the leader opacity hook is driven by the tween
 * cross-fade curve.
 */
import { describe, expect, it, vi } from 'vitest';
import { mount, shallowMount } from '@vue/test-utils';
import { ref } from 'vue';
import AnnotationLabels from '../AnnotationLabels.vue';
import { AnnotationProjector } from '~/lib/viewer/modules/AnnotationProjector';
import type { IdbCallout } from '~/composables/useIdb';

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
        tweenFromSceneId: null,
        tweenT: 0,
        tweening: false,
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
        tweenFromSceneId: null,
        tweenT: 0,
        tweening: false,
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
        tweenFromSceneId: 's1',
        tweenT: 0.25,
        tweening: true,
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
        tweenFromSceneId: null,
        tweenT: 0,
        tweening: false,
        projector,
        onLeaderOpacityScale,
      },
    });
    expect(onLeaderOpacityScale).toHaveBeenLastCalledWith(1);

    wrapper.setProps({ tweening: true, tweenT: 0.5 });
    return wrapper.vm.$nextTick().then(() => {
      expect(onLeaderOpacityScale).toHaveBeenLastCalledWith(0);
    });
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
        tweenFromSceneId: null,
        tweenT: 0,
        tweening: false,
        projector,
        kindComponents: { callout: calloutComp },
      },
    });
    expect(wrapper.find('.cl').text()).toBe('hi');
  });
});
