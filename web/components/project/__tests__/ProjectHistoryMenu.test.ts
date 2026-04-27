// @vitest-environment nuxt
import { describe, expect, it } from 'vitest';
import { shallowMount } from '@vue/test-utils';

import ProjectHistoryMenu from '../ProjectHistoryMenu.vue';

const UButtonStub = {
  // Inherit attrs (including onClick) onto the rendered button so a click on
  // the button fires the parent handler exactly once.
  props: ['label'],
  template: '<button type="button"><slot />{{ label }}</button>',
};

const stubs = {
  UButton: UButtonStub,
  UIcon: true,
};

function makeArchived(overrides: Partial<{ id: string; name: string }> = {}) {
  return {
    id: 'a1',
    name: 'Old Project',
    archivedAt: new Date().toISOString(),
    ...overrides,
  };
}

function getComponent(
  props: Partial<InstanceType<typeof ProjectHistoryMenu>['$props']> = {},
) {
  return shallowMount(ProjectHistoryMenu, {
    props: {
      archived: [],
      ...props,
    },
    global: { stubs },
  });
}

describe('ProjectHistoryMenu', () => {
  describe('Rendering', () => {
    it('Should render the empty state when archived is empty', () => {
      const component = getComponent({ archived: [] });
      expect(component.text()).toContain('No closed projects');
      expect(component.find('ul').exists()).toBe(false);
    });

    it('Should render one row per archived item', () => {
      const archived = [
        makeArchived({ id: 'a1', name: 'Alpha' }),
        makeArchived({ id: 'a2', name: 'Beta' }),
      ];
      const component = getComponent({ archived });

      const rows = component.findAll('li');
      expect(rows).toHaveLength(2);
      expect(rows[0].text()).toContain('Alpha');
      expect(rows[1].text()).toContain('Beta');
    });

    it('Should not render the clear-history footer when empty', () => {
      const component = getComponent({ archived: [] });
      expect(component.text()).not.toContain('Clear history');
    });
  });

  describe('On restore', () => {
    it('Should emit restore with the item id when reopen is clicked', async () => {
      const component = getComponent({
        archived: [makeArchived({ id: 'a1' })],
      });

      const reopenBtn = component
        .findAll('button')
        .find((b) => b.attributes('title') === 'Reopen');
      expect(reopenBtn).toBeTruthy();
      await reopenBtn!.trigger('click');

      expect(component.emitted('restore')).toEqual([['a1']]);
    });
  });

  describe('On delete (two-click confirm)', () => {
    it('Should reveal the confirm row on first click and not emit', async () => {
      const component = getComponent({
        archived: [makeArchived({ id: 'a1' })],
      });

      const trashBtn = component
        .findAll('button')
        .find((b) => b.attributes('title') === 'Delete permanently');
      await trashBtn!.trigger('click');

      const confirmDelete = component
        .findAll('button')
        .find((b) => b.text() === 'Delete');
      expect(confirmDelete).toBeTruthy();
      expect(component.emitted('permanently-delete')).toBeUndefined();
    });

    it('Should emit permanently-delete with the id on the second click', async () => {
      const component = getComponent({
        archived: [makeArchived({ id: 'a1' })],
      });

      const trashBtn = component
        .findAll('button')
        .find((b) => b.attributes('title') === 'Delete permanently');
      await trashBtn!.trigger('click');

      const confirmDelete = component
        .findAll('button')
        .find((b) => b.text() === 'Delete');
      await confirmDelete!.trigger('click');

      expect(component.emitted('permanently-delete')).toEqual([['a1']]);
    });

    it('Should hide the confirm row when cancel is clicked', async () => {
      const component = getComponent({
        archived: [makeArchived({ id: 'a1' })],
      });

      const trashBtn = component
        .findAll('button')
        .find((b) => b.attributes('title') === 'Delete permanently');
      await trashBtn!.trigger('click');

      const cancelBtn = component
        .findAll('button')
        .find((b) => b.text() === 'Cancel');
      expect(cancelBtn).toBeTruthy();
      await cancelBtn!.trigger('click');

      // Reopen button is back, Delete confirm gone.
      const reopen = component
        .findAll('button')
        .find((b) => b.attributes('title') === 'Reopen');
      expect(reopen).toBeTruthy();
      const confirmDelete = component
        .findAll('button')
        .find((b) => b.text() === 'Delete');
      expect(confirmDelete).toBeFalsy();
      expect(component.emitted('permanently-delete')).toBeUndefined();
    });
  });

  describe('On clear history', () => {
    it('Should reveal the Delete-all confirm row on first click and not emit', async () => {
      const component = getComponent({
        archived: [makeArchived({ id: 'a1' })],
      });

      const clearBtn = component
        .findAll('button')
        .find((b) => b.text() === 'Clear history');
      expect(clearBtn).toBeTruthy();
      await clearBtn!.trigger('click');

      expect(component.text()).toContain('Delete all?');
      const confirmBtn = component
        .findAll('button')
        .find((b) => b.text() === 'Confirm');
      expect(confirmBtn).toBeTruthy();
      expect(component.emitted('clear')).toBeUndefined();
    });

    it('Should emit clear when the user confirms', async () => {
      const component = getComponent({
        archived: [makeArchived({ id: 'a1' })],
      });

      await component
        .findAll('button')
        .find((b) => b.text() === 'Clear history')!
        .trigger('click');
      await component
        .findAll('button')
        .find((b) => b.text() === 'Confirm')!
        .trigger('click');

      expect(component.emitted('clear')).toEqual([[]]);
    });

    it('Should revert to the Clear history button when cancel is clicked', async () => {
      const component = getComponent({
        archived: [makeArchived({ id: 'a1' })],
      });

      await component
        .findAll('button')
        .find((b) => b.text() === 'Clear history')!
        .trigger('click');

      // Cancel inside the clear-history confirm row (a <button>, not UButton).
      const cancelBtn = component
        .findAll('button')
        .find((b) => b.text() === 'Cancel');
      expect(cancelBtn).toBeTruthy();
      await cancelBtn!.trigger('click');

      expect(component.text()).not.toContain('Delete all?');
      expect(
        component.findAll('button').find((b) => b.text() === 'Clear history'),
      ).toBeTruthy();
      expect(component.emitted('clear')).toBeUndefined();
    });
  });
});
