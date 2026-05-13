/**
 * Project-scoped request tracking for the layout worker.
 *
 * Bun's test runner has no Web Worker, so a FakeWorker captures posted
 * messages and drives responses manually. Asserts target what consumers
 * observe — promise resolution and the `computingProjects` reactive flag —
 * not postMessage call shapes.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mmToUm, type ConfigInput, type PartToCut } from 'cutlist';

interface PostedMessage {
  type: 'layout';
  id: number;
  parts: PartToCut[];
  stockYaml: string;
  config: ConfigInput;
}

let workerInstance: FakeWorker | null = null;

class FakeWorker {
  posts: PostedMessage[] = [];
  onmessage:
    | ((e: {
        data: { type: 'layout'; id: number; result?: unknown; error?: string };
      }) => void)
    | null = null;
  onerror: ((e: unknown) => void) | null = null;
  constructor() {
    workerInstance = this;
  }
  postMessage(msg: PostedMessage) {
    this.posts.push(msg);
  }
  terminate() {
    if (workerInstance === this) workerInstance = null;
  }
  respond(id: number, result: unknown) {
    this.onmessage?.({ data: { type: 'layout', id, result } });
  }
  respondError(id: number, error: string) {
    this.onmessage?.({ data: { type: 'layout', id, error } });
  }
}

(globalThis as any).Worker = FakeWorker;
vi.mock('../useAppErrors', () => ({
  reportError: () => {},
}));

const {
  computeLayouts,
  computingProjects,
  PART_COUNT_HARD_LIMIT,
  PartCountExceededError,
  __resetForTests,
} = await import('../useComputationWorker');

function isComputing(projectId: string): boolean {
  return computingProjects.value.has(projectId);
}

function makeParts(n: number): PartToCut[] {
  return Array.from({ length: n }, (_, i) => ({
    partNumber: i + 1,
    instanceNumber: 1,
    name: `p${i + 1}`,
    size: {
      width: mmToUm(300),
      length: mmToUm(500),
      thickness: mmToUm(18),
    },
    material: 'plywood',
  }));
}

const CONFIG: ConfigInput = {
  bladeWidth: mmToUm(3),
  margin: 0,
  defaultAlgorithm: 'auto',
};

const emptyResult = () => ({ layouts: [], leftovers: [] });

beforeEach(() => {
  __resetForTests();
  workerInstance = null;
});

describe('computeLayouts', () => {
  it('rejects synchronously without spawning a worker when over the hard limit', async () => {
    const tooMany = makeParts(PART_COUNT_HARD_LIMIT + 1);
    await expect(
      computeLayouts('proj-a', tooMany, [], CONFIG),
    ).rejects.toBeInstanceOf(PartCountExceededError);
    expect(workerInstance).toBeNull();
  });

  it('marks a project as computing and clears on resolve', async () => {
    const promise = computeLayouts('proj-a', makeParts(3), [], CONFIG);
    expect(isComputing('proj-a')).toBe(true);

    const [post] = workerInstance!.posts;
    workerInstance!.respond(post.id, emptyResult());

    await expect(promise).resolves.toEqual(emptyResult());
    expect(isComputing('proj-a')).toBe(false);
  });

  it('propagates worker errors and clears the computing flag', async () => {
    const promise = computeLayouts('proj-a', makeParts(1), [], CONFIG);
    expect(isComputing('proj-a')).toBe(true);

    const [post] = workerInstance!.posts;
    workerInstance!.respondError(post.id, 'boom');

    await expect(promise).rejects.toThrow('boom');
    expect(isComputing('proj-a')).toBe(false);
  });
});

describe('project isolation', () => {
  it('tracks multiple projects independently', async () => {
    const pA = computeLayouts('proj-a', makeParts(1), [], CONFIG);
    const pB = computeLayouts('proj-b', makeParts(1), [], CONFIG);
    expect(isComputing('proj-a')).toBe(true);
    expect(isComputing('proj-b')).toBe(true);

    const [postA, postB] = workerInstance!.posts;
    workerInstance!.respond(postA.id, emptyResult());
    await pA;
    expect(isComputing('proj-a')).toBe(false);
    expect(isComputing('proj-b')).toBe(true);

    workerInstance!.respond(postB.id, emptyResult());
    await pB;
    expect(isComputing('proj-b')).toBe(false);
  });
});

describe('superseding within the same project', () => {
  // Single test covers both directions: the "computing" flag tracks the
  // *latest* request id, so neither an early-resolving older request nor a
  // late-resolving stale one should flip the flag prematurely or back on.
  it('clears computing only when the latest request resolves, regardless of order', async () => {
    const first = computeLayouts('proj-a', makeParts(1), [], CONFIG);
    const second = computeLayouts('proj-a', makeParts(2), [], CONFIG);
    expect(isComputing('proj-a')).toBe(true);

    const [postFirst, postSecond] = workerInstance!.posts;

    // Older request lands first — flag stays on (latest is still pending).
    workerInstance!.respond(postFirst.id, emptyResult());
    await first;
    expect(isComputing('proj-a')).toBe(true);

    // Latest lands — flag clears.
    workerInstance!.respond(postSecond.id, emptyResult());
    await second;
    expect(isComputing('proj-a')).toBe(false);
  });
});
