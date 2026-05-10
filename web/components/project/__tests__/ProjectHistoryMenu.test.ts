// @vitest-environment nuxt
import { describe, expect, it } from 'vitest';
import { shallowMount } from '@vue/test-utils';

import ProjectHistoryMenu from '../ProjectHistoryMenu.vue';
import { UButtonStub } from '~/test-utils/stubs';

const stubs = { UButton: UButtonStub, UIcon: true };

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
    props: { archived: [], ...props },
    global: { stubs },
  });
}

function findButton(
  component: ReturnType<typeof getComponent>,
  predicate: (b: ReturnType<typeof component.findAll>[number]) => boolean,
) {
  return component.findAll('button').find(predicate);
}

describe('ProjectHistoryMenu', () => {
  describe('Rendering', () => {
    it('Should render the empty state when archived is empty (no list, no clear footer)', () => {
      const component = getComponent({ archived: [] });
      expect(component.text()).toContain('No closed projects');
      expect(component.find('ul').exists()).toBe(false);
      expect(component.text()).not.toContain('Clear history');
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
  });

  describe('On restore', () => {
    it('Should emit restore with the item id when reopen is clicked', async () => {
      const component = getComponent({
        archived: [makeArchived({ id: 'a1' })],
      });

      const reopenBtn = findButton(
        component,
        (b) => b.attributes('title') === 'Reopen',
      );
      await reopenBtn!.trigger('click');

      expect(component.emitted('restore')).toEqual([['a1']]);
    });
  });

  // Three near-identical confirm flows (per-item delete, reset database, clear
  // history). Same shape: trigger click → confirm row appears + no emit yet,
  // confirm click → emit, cancel click → row hidden + no emit.
  describe.each([
    {
      kind: 'permanently-delete' as const,
      archived: [makeArchived({ id: 'a1' })],
      triggerLabel: 'Delete permanently',
      triggerKind: 'title' as const,
      confirmText: 'Delete',
      revealedText: undefined,
      payload: 'a1',
    },
    {
      kind: 'reset' as const,
      archived: [],
      triggerLabel: 'Reset database',
      triggerKind: 'text' as const,
      confirmText: 'Confirm',
      revealedText: 'Delete everything?',
      payload: undefined,
    },
    {
      kind: 'clear' as const,
      archived: [makeArchived({ id: 'a1' })],
      triggerLabel: 'Clear history',
      triggerKind: 'text' as const,
      confirmText: 'Confirm',
      revealedText: 'Delete all?',
      payload: undefined,
    },
  ])('On $kind (two-click confirm)', (c) => {
    function clickTrigger(component: ReturnType<typeof getComponent>) {
      const trigger = findButton(component, (b) =>
        c.triggerKind === 'title'
          ? b.attributes('title') === c.triggerLabel
          : b.text() === c.triggerLabel,
      );
      expect(trigger).toBeTruthy();
      return trigger!.trigger('click');
    }

    it(`Should reveal the confirm row on first click and not emit ${c.kind}`, async () => {
      const component = getComponent({ archived: c.archived });
      await clickTrigger(component);

      expect(
        findButton(component, (b) => b.text() === c.confirmText),
      ).toBeTruthy();
      if (c.revealedText) expect(component.text()).toContain(c.revealedText);
      expect(component.emitted(c.kind)).toBeUndefined();
    });

    it(`Should emit ${c.kind} on confirm click`, async () => {
      const component = getComponent({ archived: c.archived });
      await clickTrigger(component);
      await findButton(component, (b) => b.text() === c.confirmText)!.trigger(
        'click',
      );

      const expected = c.payload === undefined ? [[]] : [[c.payload]];
      expect(component.emitted(c.kind)).toEqual(expected);
    });

    it(`Should hide the confirm row on cancel and not emit ${c.kind}`, async () => {
      const component = getComponent({ archived: c.archived });
      await clickTrigger(component);
      await findButton(component, (b) => b.text() === 'Cancel')!.trigger(
        'click',
      );

      if (c.revealedText)
        expect(component.text()).not.toContain(c.revealedText);
      expect(
        findButton(component, (b) => b.text() === c.confirmText),
      ).toBeFalsy();
      expect(component.emitted(c.kind)).toBeUndefined();
    });
  });

  it('Should always render the Reset database button, even with no archived items', () => {
    const component = getComponent({ archived: [] });
    expect(
      findButton(component, (b) => b.text() === 'Reset database'),
    ).toBeTruthy();
  });
});
