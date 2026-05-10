---
name: write-tests
description: Write or update Cutlist frontend tests with Vitest, TypeScript, Nuxt test utilities, fake IndexedDB, and project-specific conventions. Use when adding regression tests, increasing coverage, fixing flaky tests, or creating tests for helpers, packers, composables, workers, routes, or Vue components in this app.
---

# Write Tests

Write or update tests for the target file in the Cutlist app. Read the source before writing tests, then choose the narrowest test shape that proves the behaviour. **Fewer sharper tests beat many shallow ones.**

## Step 0 — Apply the tautology check

Before writing OR keeping any test, ask:

> **What real, user-visible bug class would slip through if this assertion vanished?**

If you can't name one, don't write it (or delete it if it exists). This is the most important rule in this skill.

### Anti-patterns to refuse

Do NOT write any of these — they are pure tautologies that generate maintenance load without preventing user-visible bugs:

- **Mock-shape introspection.** `expect(mock).toHaveBeenCalledWith(...)` where the mock returns data the test then asserts on. Tests the mock, not the code.
- **Vue template forwarding.** Asserting that a parent passes a prop or emits an event the template literally writes (`<Child :foo="foo" @bar="onBar" />`). Vue guarantees this; the test only fires on rename pain.
- **Type-checker duplicates.** Asserting that a default-fill function fills the field it's typed to fill, or that a function returns its declared return type.
- **Object-spread tautologies.** "Preserves existing values" cases on `applyDefaults`-style helpers. Pure verification of `{...x, defaults}`.
- **Copy-edit smoke.** `expect(text).toContain('Right-drag')`. Rewards typo-catching, rots on copy edits.
- **Lifecycle no-ops.** "Should not throw when disposed before init", "renders default slot content". Framework guarantees.
- **Stable-API surface checks.** `expect(typeof result.foo).toBe('function')`. The type checker does this for free.

When trimming an existing test file, run every `it()` through the tautology check. Trim aggressively. Bloated test files are technical debt.

## Step 1 — Identify the module type

- **Pure helper / utility** — deterministic TypeScript, no browser API or IndexedDB; usually `web/utils/`, `web/lib/utils/`, `web/lib/geometry/`.
- **Packing engine / packer** — board layout, rectangle, stock, scoring, packers in `web/lib/`.
- **Parser / import / export / migration** — GLTF, COLLADA, stock YAML, PDF export, project import, schema defaults, version migration.
- **IDB-backed module** — code using `useIdb`, Dexie records, project/model/build-doc persistence, write batching.
- **Composable** — Vue reactive state in `web/composables/`. (No Pinia.)
- **Worker / browser API module** — `Worker`, file APIs, URL APIs, Sentry, Nuxt UI toast, other globals.
- **Nuxt route / middleware / page / component** — `.vue`, `web/pages/`, `web/middleware/`, code that needs Nuxt auto-imports/plugins.

## Step 2 — Read context

Before writing tests, read:

1. The source file being tested.
2. The existing test file, if any.
3. Imported collaborators that need fakes or real setup.
4. Peer test files that may already cover the same ground (avoid duplicating coverage between layers).
5. `web/test-setup.ts` and `web/vitest.config.ts` only if the test needs IndexedDB, Nuxt, globals, or unusual environment behaviour.

## Project test basics

- Test files are TypeScript named `*.test.ts` under sibling `__tests__/` directories. Examples: `web/utils/foo.ts` → `web/utils/__tests__/foo.test.ts`.
- Vitest globals are disabled — always import `describe`, `it`, `expect`, `beforeEach`, `afterEach`, `vi` from `vitest`.
- Default environment is `happy-dom`. Add `// @vitest-environment nuxt` only when a test needs Nuxt runtime, plugins, auto-imports, or `mountSuspended`.
- `web/test-setup.ts` installs `fake-indexeddb` and resets the Cutlist DB before every test. Don't depend on test order.
- Import Vue primitives explicitly (`ref`, `nextTick`, `effectScope`, etc.) even when source relies on Nuxt auto-imports.
- Aliases: `~` for `web/`, `cutlist` for `web/lib`.

## Outcome over mock-shape

Test public behaviour: return values, thrown errors, emitted events, DOM output, persisted records, worker messages, observable state changes. Do NOT test private helpers, implementation order users can't see, Nuxt UI internals, or Dexie internals.

For composables that need to record interactions with a fake dependency, prefer **plain functions pushing into typed arrays** over `vi.fn()` + `toHaveBeenCalled`. The typed-array pattern asserts on what was recorded (an outcome) rather than the mock's wiring.

```ts
// Good — outcome assertion
const adds: AddCall[] = [];
const captured: number[] = [];
const author = {
  captureCurrentSceneState: () => {
    captureSeq = ++nextSeq;
    captured.push(captureSeq);
    return /* ... */;
  },
  // ...
};
const scenesApi = {
  addScene: async () => {
    adds.push({ whenCaptured: captureSeq });
    return 'new-id';
  },
  // ...
};
// ... run the code under test
expect(adds[0].whenCaptured).toBe(captured[0]); // capture preceded persist
```

```ts
// Avoid — mock-shape introspection
const captureMock = vi.fn();
const addMock = vi.fn();
expect(captureMock).toHaveBeenCalled();
expect(addMock).toHaveBeenCalledWith(/* repeating the call args */);
```

For Vue components, prefer `wrapper.emitted()` over mocked event handlers.

Canonical examples in the repo:

- `web/lib/viewer/modules/__tests__/GizmoController.test.ts`
- `web/lib/viewer/modules/__tests__/MarqueeSelector.test.ts`
- `web/composables/__tests__/useSceneAuthoringActions.test.ts`

## Shared test utilities — use these, don't reinvent

- **Component stubs** — `web/test-utils/stubs.ts` exports `UButtonStub`, `UInputStub`, `UModalStub`, `USelectStub`, `UFormFieldStub`, etc. Use these instead of inlining stubs in each test file. Inline stubs drift silently when the real component gains a prop.
- **Migration / import fixtures** — `web/utils/projectImport/__tests__/_helpers.ts` exports `makePayload(overrides?)` and `makeIdbMock({ newProjectId? })`. Use them for any test exercising the project-import pipeline.

## General rules

- Group tests by exported function, public method, lifecycle behaviour, or rendered section.
- Put input validation/error cases before success cases; integration and edge cases after basic behaviour.
- For new or substantially rewritten suites, name tests with `Should …`. For small updates, preserve local naming.
- Keep setup close to the tests. Use `beforeEach` only when several tests genuinely share setup.
- Use small typed factory helpers (`makePart`, `makeProject`, `makeStock`, `makeConfig`) instead of large inline fixtures.
- Prefer exact assertions: `toBe`, `toEqual`, `toMatchObject`, `toBeCloseTo`, `resolves`, `rejects`. Avoid broad `toContain` text checks unless asserting a stable contract.
- Avoid snapshots unless the structure is intentionally stable.
- Use `vi.restoreAllMocks()` in `afterEach` when using `vi.spyOn`. Use `mockClear()` for reusable `vi.fn()` mocks. Don't add cleanup that isn't needed.

## Pure helper / utility tests

```ts
import { describe, expect, it } from 'vitest';
import { myHelper } from '../myHelper';

describe('myHelper', () => {
  describe('#methodName', () => {
    it('Should throw when the required value is missing', () => {
      expect(() => myHelper(null)).toThrow('required value');
    });

    it('Should return the expected result for the base case', () => {
      expect(myHelper({ value: 1 })).toEqual({ result: 1 });
    });
  });
});
```

- One `describe('#name')` per exported function/method when the module has multiple exports.
- Cover invalid inputs first, then representative successes, then edges.
- Don't mock HTTP, IDB, Vue, or Nuxt for pure modules.

## Packing engine / packer tests

Use real geometry. Focus on invariants that matter to wood-cutting:

- Empty inputs return empty placements and leftovers.
- Oversize parts become leftovers.
- Placements stay inside the board, account for margin/kerf, do not overlap.
- Rotation, grain lock, orientation, grouping, scoring rules are observable in the result.
- Determinism where the algorithm promises it.

```ts
import { describe, expect, it } from 'vitest';
import { Rectangle } from '../../geometry';
import { createStripPacker } from '../StripPacker';

describe('StripPacker', () => {
  it('Should return oversize rectangles as leftovers', () => {
    const packer = createStripPacker<string>();
    const bin = new Rectangle(null, 0, 0, 5, 5);
    const result = packer.pack(bin, [new Rectangle('too-wide', 0, 0, 6, 3)], {
      allowRotations: false,
      gap: 0,
      precision: 0,
    });
    expect(result.placements).toEqual([]);
    expect(result.leftovers).toEqual(['too-wide']);
  });
});
```

- Use `toBeCloseTo` for floating-point geometry / unit conversion.
- Assert behaviour, not full layout arrays, unless the exact layout is the contract.
- Include no-overlap and inside-board checks for new packers.

## Parser / import / export / migration tests

Cover both accepted and rejected data:

- Valid minimal input.
- Invalid/malformed input with a useful thrown error.
- Missing optional fields and defaults.
- Current-version no-op behaviour and future-version rejection.
- Preservation of user data and unknown fields where the import path promises it.

For the project-import pipeline specifically, use the shared `makePayload()` / `makeIdbMock()` from `web/utils/projectImport/__tests__/_helpers.ts`. Don't duplicate the payload shape — it's defined once.

When adding a stored field that bumps `SCHEMA_VERSION`, add tests for: the per-version migration file, IDB defaults if added there, the import-flow round-trip.

## IDB-backed module tests

Use the real `useIdb()` API with fake IndexedDB. Every test starts with an empty DB.

```ts
import { describe, expect, it } from 'vitest';
import { useIdb } from '../useIdb';

const idb = useIdb();

describe('project CRUD', () => {
  it('Should create a project with defaults', async () => {
    const project = await idb.createProject('Test Project');
    expect(project.id).toBeDefined();
    expect(project.name).toBe('Test Project');
    expect(project.colorMap).toEqual({});
  });
});
```

- Prefer real IDB records over faking persistence.
- After model write batching, call `await idb.flushPendingModelWrites()` before reading back.
- Test cascade behaviour and read-path defaults via public APIs (`getProjectWithModels`).
- Don't manually delete IndexedDB unless the test is specifically about reset behaviour.

## Composable tests

For composables with injected dependencies, pass real refs and small fakes (typed-array pattern, not `vi.fn()` introspection). For reactive watchers, use `effectScope()` and stop it in `afterEach`.

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref, type EffectScope } from 'vue';
import { useMyComposable } from '../useMyComposable';

describe('useMyComposable', () => {
  let scope: EffectScope;

  beforeEach(() => {
    scope = effectScope();
  });

  afterEach(() => {
    scope.stop();
    vi.restoreAllMocks();
  });

  it('Should react when the source ref changes', async () => {
    const source = ref('a');
    const result = scope.run(() => useMyComposable(source))!;
    source.value = 'b';
    await nextTick();
    expect(result.value.value).toBe('b');
  });
});
```

- Use `nextTick()` for Vue updates. `flushPromises()` only when promises are the thing being flushed.
- Use fake timers only for debounce/intervals/timeouts; restore real timers.
- Reset module-level caches with exported test helpers (`__resetForTests()`) when present.
- **For thin orchestration composables** (single caller, mostly delegation): consider whether the composable earns its keep before writing tests for it. If it's a candidate to be inlined, the test is short-lived too.

## Worker / browser API tests

Set globals and mocks before importing the module. Use dynamic `await import(...)` after setup.

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

class FakeWorker {
  posts: unknown[] = [];
  onmessage: ((event: { data: unknown }) => void) | null = null;
  postMessage(message: unknown) {
    this.posts.push(message);
  }
  terminate() {}
}

(globalThis as any).Worker = FakeWorker;

vi.mock('../useAppErrors', () => ({ reportError: vi.fn() }));

const { computeLayouts, __resetForTests } =
  await import('../useComputationWorker');

beforeEach(() => {
  __resetForTests();
});
```

- Drive fake browser APIs manually and assert captured messages/state.
- Keep fake classes minimal and typed enough that intent is clear.
- Use `vi.hoisted` when a `vi.mock` factory needs shared state initialised before imports.

## Nuxt / Vue component tests

```ts
// @vitest-environment nuxt
import { describe, expect, it } from 'vitest';
import { mountSuspended } from '@nuxt/test-utils/runtime';
import { UButtonStub, UInputStub } from '~/test-utils/stubs';
import MyComponent from '../MyComponent.vue';

describe('MyComponent', () => {
  async function getComponent(
    props: Partial<InstanceType<typeof MyComponent>['$props']> = {},
  ) {
    return mountSuspended(MyComponent, {
      props: { requiredProp: 'default', ...props },
      global: { stubs: { UButton: UButtonStub, UInput: UInputStub } },
    });
  }

  it('Should emit save when the user submits', async () => {
    const component = await getComponent();
    await component.find('input').setValue('hello');
    await component.find('button').trigger('click');
    expect(component.emitted('save')?.[0]).toEqual(['hello']);
  });
});
```

- Use `mountSuspended` for components needing auto-imports, routing, Nuxt UI, plugins, or async setup.
- Use `shallowMount` for plain Vue components that don't need Nuxt runtime.
- Import shared stubs from `~/test-utils/stubs` (don't inline).
- Selector preference: accessible text/labels (when stable) → `data-testid` → component names for stubbed children.
- Don't assert Nuxt UI internals. Assert: emitted events, visible text, disabled/loading states, public callback calls.
- Suggested block order: `Initialization`, `Props`, `Watchers`, public methods, `Rendering`, then nested `On <event>` blocks.

## When you find a bloated test file

Trim it. For each `it()`:

1. Tautology check — what bug class would slip through if this vanished?
2. If you can't name one, delete the test.
3. If multiple cases test the same code path with slightly different fixtures, collapse into `it.each` or one well-chosen case.

A 600-LOC test file for a 200-LOC composable is over-fitted to implementation. Bias toward fewer sharper tests over many shallow ones. The audit at `audit/synthesis.md` documents which files were trimmed and which patterns drove the trims.

## Verification

After writing or updating tests:

1. Run the targeted file:

   ```bash
   cd web && vitest run path/to/__tests__/file.test.ts
   ```

2. If types, components, or fakes changed:

   ```bash
   bun run check
   ```

3. If files were created or formatting changed:
   ```bash
   bun run lint
   ```

Fix failures before considering the work complete. If a command can't be run, say why and list remaining risk.
