// @vitest-environment nuxt
import { describe, expect, it } from 'vitest';
import { shallowMount } from '@vue/test-utils';
import PlanCard from '../PlanCard.vue';
import type { PlanSummary } from '~/utils/plans/types';

const basePlan: PlanSummary = {
  slug: 'workbench',
  title: 'Workbench',
  description: 'A solid bench.',
  tags: [],
  hero: '/plans/_build/workbench/scenes/hero.webp',
};

function mount(plan: Partial<PlanSummary> = {}) {
  return shallowMount(PlanCard, {
    props: { plan: { ...basePlan, ...plan } },
    global: {
      stubs: {
        UIcon: true,
        // Render the slot so children (the placeholder icon) appear in
        // the tree — `NuxtLink: true` would render an empty tag.
        NuxtLink: { template: '<a><slot /></a>' },
      },
    },
  });
}

describe('PlanCard', () => {
  it('renders a hammer placeholder when no hero is set', () => {
    const wrapper = mount({ hero: undefined });
    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.findComponent({ name: 'UIcon' }).exists()).toBe(true);
  });
});
