// @vitest-environment nuxt
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ref } from 'vue';
import { shallowMount } from '@vue/test-utils';
import { mockNuxtImport } from '@nuxt/test-utils/runtime';

import ProjectWorkspaceModals from '../ProjectWorkspaceModals.vue';

const showConfirm = ref(false);
const pendingGrainLock = ref<'length' | 'width' | undefined>(undefined);
const confirmChange = vi.fn();
const cancelChange = vi.fn();

mockNuxtImport('useGrainLockConfirm', () => () => ({
  showConfirm,
  pendingGrainLock,
  confirmChange,
  cancelChange,
}));

const GrainLockConfirmModalStub = {
  name: 'GrainLockConfirmModal',
  props: ['open', 'grainLock'],
  emits: ['confirm', 'cancel'],
  template: `
    <div :data-open="String(open)" :data-grain-lock="grainLock ?? ''">
      <button type="button" @click="$emit('confirm')">confirm</button>
      <button type="button" @click="$emit('cancel')">cancel</button>
    </div>
  `,
};

describe('ProjectWorkspaceModals', () => {
  beforeEach(() => {
    showConfirm.value = false;
    pendingGrainLock.value = undefined;
    confirmChange.mockClear();
    cancelChange.mockClear();
  });

  function getComponent() {
    return shallowMount(ProjectWorkspaceModals, {
      global: {
        stubs: {
          GrainLockConfirmModal: GrainLockConfirmModalStub,
        },
      },
    });
  }

  describe('Prop wiring', () => {
    it('Should mirror showConfirm onto open', async () => {
      const component = getComponent();
      const stub = component.findComponent(GrainLockConfirmModalStub);

      expect(stub.props('open')).toBe(false);

      showConfirm.value = true;
      await component.vm.$nextTick();

      expect(stub.props('open')).toBe(true);
    });

    it('Should mirror pendingGrainLock onto grainLock', async () => {
      const component = getComponent();
      const stub = component.findComponent(GrainLockConfirmModalStub);

      pendingGrainLock.value = 'width';
      await component.vm.$nextTick();

      expect(stub.props('grainLock')).toBe('width');
    });
  });

  describe('Event wiring', () => {
    it('Should call confirmChange on confirm', async () => {
      const component = getComponent();

      await component.findAll('button')[0].trigger('click');

      expect(confirmChange).toHaveBeenCalledTimes(1);
    });

    it('Should call cancelChange on cancel', async () => {
      const component = getComponent();

      await component.findAll('button')[1].trigger('click');

      expect(cancelChange).toHaveBeenCalledTimes(1);
    });
  });
});
