import { vi } from 'vitest';

/**
 * Stateful in-memory stand-in for the DocumentSequence delegate, for unit
 * tests that hand-roll a Prisma client mock. Mirrors allocateDocumentNumber's
 * contract: findUnique → null (no counter row yet), so the seed closure (the
 * service's read-max findFirst, already mocked per-test) runs on every
 * allocation and the allocated value is seed+1 — exactly the number the old
 * inline read-max code produced, keeping every existing name expectation
 * unchanged.
 */
export function mockDocumentSequence() {
  let value = 0;
  return {
    findUnique: vi.fn(async () => null),
    createMany: vi.fn(async (args: { data: Array<{ value: number }> }) => {
      value = args.data[0]?.value ?? 0;
      return { count: 1 };
    }),
    update: vi.fn(async () => ({ value: ++value })),
  };
}
