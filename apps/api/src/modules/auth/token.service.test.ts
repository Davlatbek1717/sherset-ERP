import { describe, expect, it, vi } from 'vitest';
import { TokenService } from './token.service.js';

/**
 * Refresh-token rotation GRACE WINDOW (cross-tab refresh race).
 *
 * The API rotates the refresh cookie on every /auth/refresh. Two browser
 * tabs are separate JS contexts, so the web auth-store single-flight
 * (006f2fe4) cannot dedupe them — both can send the SAME cookie
 * concurrently. Before the grace window the loser got 401 → logout.
 *
 * Semantics under test:
 *  - active token rotates: successor minted into the same family, old row
 *    revoked with replacedById = successor id;
 *  - rotation-revoked token re-used WITHIN the grace window → benign race:
 *    mint a sibling token (no 401, no family nuke);
 *  - rotation-revoked token re-used BEYOND the grace window → replay of a
 *    consumed token: revoke the whole family, reject;
 *  - logout-revoked token (no replacedById) → no grace, no family nuke;
 *  - expired / unknown → reject.
 */

interface MockRow {
  id: string;
  employeeId: string;
  familyId: string | null;
  replacedById: string | null;
  revokedAt: Date | null;
  expiresAt: Date;
}

function makePrisma(row: MockRow | null, opts?: { revokeCount?: number }) {
  const creates: Array<Record<string, unknown>> = [];
  const updateManyCalls: Array<{ where: Record<string, unknown>; data: Record<string, unknown> }> =
    [];
  const client = {
    refreshToken: {
      findUnique: vi.fn().mockResolvedValue(row),
      create: vi.fn().mockImplementation(async (args: { data: Record<string, unknown> }) => {
        creates.push(args.data);
        return args.data;
      }),
      updateMany: vi
        .fn()
        .mockImplementation(
          async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
            updateManyCalls.push(args);
            return { count: opts?.revokeCount ?? 1 };
          },
        ),
    },
  };
  return { prisma: { client }, creates, updateManyCalls };
}

function svc(prisma: unknown) {
  // jwt + config unused by rotation paths.
  return new TokenService({} as never, {} as never, prisma as never);
}

const FUTURE = new Date(Date.now() + 86_400_000);

describe('TokenService.rotateRefreshToken — active rotation', () => {
  it('mints the successor into the same family and revokes the old token pointing at it', async () => {
    const { prisma, creates, updateManyCalls } = makePrisma({
      id: 'old-1',
      employeeId: 'emp-1',
      familyId: 'fam-1',
      replacedById: null,
      revokedAt: null,
      expiresAt: FUTURE,
    });
    const result = await svc(prisma).rotateRefreshToken('raw-old', {});
    expect(result).not.toBeNull();
    expect(result?.employeeId).toBe('emp-1');
    expect(creates).toHaveLength(1);
    expect(creates[0]?.familyId).toBe('fam-1');
    expect(updateManyCalls).toHaveLength(1);
    expect(updateManyCalls[0]?.where).toMatchObject({ id: 'old-1', revokedAt: null });
    expect(updateManyCalls[0]?.data.replacedById).toBe(creates[0]?.id);
    expect(updateManyCalls[0]?.data.revokedAt).toBeInstanceOf(Date);
  });

  it('legacy row without familyId roots the family at the old token id', async () => {
    const { prisma, creates } = makePrisma({
      id: 'legacy-1',
      employeeId: 'emp-1',
      familyId: null,
      replacedById: null,
      revokedAt: null,
      expiresAt: FUTURE,
    });
    const result = await svc(prisma).rotateRefreshToken('raw-legacy', {});
    expect(result).not.toBeNull();
    expect(creates[0]?.familyId).toBe('legacy-1');
  });

  it('concurrent revoke race (updateMany count 0) still returns the minted sibling', async () => {
    // Another request rotated the same active token between our findUnique
    // and updateMany — exactly the in-window race; our successor is a valid
    // grace sibling, so the caller must still get it (not a 401).
    const { prisma, creates } = makePrisma(
      {
        id: 'old-1',
        employeeId: 'emp-1',
        familyId: 'fam-1',
        replacedById: null,
        revokedAt: null,
        expiresAt: FUTURE,
      },
      { revokeCount: 0 },
    );
    const result = await svc(prisma).rotateRefreshToken('raw-old', {});
    expect(result).not.toBeNull();
    expect(creates).toHaveLength(1);
  });
});

describe('TokenService.rotateRefreshToken — grace window (cross-tab race)', () => {
  it('rotation-revoked token within the grace window yields a sibling token, not a logout', async () => {
    const { prisma, creates, updateManyCalls } = makePrisma({
      id: 'old-1',
      employeeId: 'emp-1',
      familyId: 'fam-1',
      replacedById: 'succ-1',
      revokedAt: new Date(Date.now() - 5_000), // rotated 5s ago
      expiresAt: FUTURE,
    });
    const result = await svc(prisma).rotateRefreshToken('raw-old', {});
    expect(result).not.toBeNull();
    expect(result?.employeeId).toBe('emp-1');
    expect(creates).toHaveLength(1);
    expect(creates[0]?.familyId).toBe('fam-1');
    // Benign race — the family must NOT be revoked, the old row not re-touched.
    expect(updateManyCalls).toHaveLength(0);
  });

  it('replay beyond the grace window revokes the WHOLE family and rejects', async () => {
    const { prisma, creates, updateManyCalls } = makePrisma({
      id: 'old-1',
      employeeId: 'emp-1',
      familyId: 'fam-1',
      replacedById: 'succ-1',
      revokedAt: new Date(Date.now() - 120_000), // rotated 2min ago — replay
      expiresAt: FUTURE,
    });
    const result = await svc(prisma).rotateRefreshToken('raw-old', {});
    expect(result).toBeNull();
    expect(creates).toHaveLength(0);
    expect(updateManyCalls).toHaveLength(1);
    expect(updateManyCalls[0]?.where).toMatchObject({ familyId: 'fam-1', revokedAt: null });
  });

  it('logout-revoked token (no replacedById) gets no grace and no family nuke', async () => {
    const { prisma, creates, updateManyCalls } = makePrisma({
      id: 'old-1',
      employeeId: 'emp-1',
      familyId: 'fam-1',
      replacedById: null,
      revokedAt: new Date(Date.now() - 5_000), // revoked by logout 5s ago
      expiresAt: FUTURE,
    });
    const result = await svc(prisma).rotateRefreshToken('raw-old', {});
    expect(result).toBeNull();
    expect(creates).toHaveLength(0);
    expect(updateManyCalls).toHaveLength(0);
  });
});

describe('TokenService.rotateRefreshToken — boundary rejects', () => {
  it('expired token is rejected without side effects', async () => {
    const { prisma, creates, updateManyCalls } = makePrisma({
      id: 'old-1',
      employeeId: 'emp-1',
      familyId: 'fam-1',
      replacedById: null,
      revokedAt: null,
      expiresAt: new Date(Date.now() - 1_000),
    });
    const result = await svc(prisma).rotateRefreshToken('raw-old', {});
    expect(result).toBeNull();
    expect(creates).toHaveLength(0);
    expect(updateManyCalls).toHaveLength(0);
  });

  it('unknown token is rejected', async () => {
    const { prisma, creates } = makePrisma(null);
    const result = await svc(prisma).rotateRefreshToken('raw-nope', {});
    expect(result).toBeNull();
    expect(creates).toHaveLength(0);
  });
});

describe('TokenService.createRefreshToken — family rooting', () => {
  it('login-issued token roots its own family (familyId = own id)', async () => {
    const { prisma, creates } = makePrisma(null);
    const raw = await svc(prisma).createRefreshToken('emp-1', {});
    expect(typeof raw).toBe('string');
    expect(raw.length).toBeGreaterThan(40);
    expect(creates).toHaveLength(1);
    expect(creates[0]?.id).toBeDefined();
    expect(creates[0]?.familyId).toBe(creates[0]?.id);
  });
});
