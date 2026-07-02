import {
  BadRequestException,
  ForbiddenException,
  GoneException,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { describe, expect, it, vi } from 'vitest';
import { PublicationService } from './publication.service.js';

/**
 * Publication coverage:
 *   - Token generation: unique, URL-safe, sufficient entropy
 *   - Idempotent create (re-publish same target returns existing + un-revokes)
 *   - Expired vs revoked vs deleted — 410 Gone / 404 / 404
 *   - Password verify: correct → ok, wrong → ForbiddenException
 *   - View count increment
 *   - Token rotation invalidates old URL
 *   - List sanitises passwordHash
 */

interface PublicationRow {
  id: string;
  accountId: string;
  ownerId: string;
  targetType: string;
  targetId: string;
  token: string;
  description: string | null;
  viewCount: number;
  lastViewedAt: Date | null;
  expiresAt: Date | null;
  passwordHash: string | null;
  revokedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function makeRow(overrides: Partial<PublicationRow> = {}): PublicationRow {
  return {
    id: 'pub-1',
    accountId: 'acc-1',
    ownerId: 'emp-1',
    targetType: 'invoiceout',
    targetId: '00000000-0000-0000-0000-000000000050',
    token: 'tok-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    description: null,
    viewCount: 0,
    lastViewedAt: null,
    expiresAt: null,
    passwordHash: null,
    revokedAt: null,
    deletedAt: null,
    createdAt: new Date('2026-05-12'),
    updatedAt: new Date('2026-05-12'),
    ...overrides,
  };
}

function makePrismaMock(rows: PublicationRow[]) {
  const findFirst = vi.fn(async (args: { where: Record<string, unknown> }) => {
    const w = args.where ?? {};
    return (
      rows.find((r) => {
        if (w.id && r.id !== w.id) return false;
        if (w.accountId && r.accountId !== w.accountId) return false;
        if (w.deletedAt === null && r.deletedAt !== null) return false;
        if (w.targetType && r.targetType !== w.targetType) return false;
        if (w.targetId && r.targetId !== w.targetId) return false;
        return true;
      }) ?? null
    );
  });
  const findUnique = vi.fn(async (args: { where: { token?: string; id?: string } }) => {
    return (
      rows.find((r) =>
        args.where.token ? r.token === args.where.token : r.id === args.where.id,
      ) ?? null
    );
  });
  const findMany = vi.fn(async () => rows);
  const count = vi.fn(async () => rows.length);
  const create = vi.fn(async (args: { data: Partial<PublicationRow> }) => {
    const row = makeRow({ ...args.data, id: `pub-${rows.length + 1}` });
    rows.push(row);
    return row;
  });
  const update = vi.fn(async (args: { where: { id: string }; data: Partial<PublicationRow> }) => {
    const row = rows.find((r) => r.id === args.where.id);
    if (!row) throw new Error('not found');
    Object.assign(row, args.data);
    return row;
  });
  const updateMany = vi.fn(
    async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      let count = 0;
      for (const r of rows) {
        if (args.where.token && r.token !== args.where.token) continue;
        if (args.where.deletedAt === null && r.deletedAt !== null) continue;
        if (args.where.revokedAt === null && r.revokedAt !== null) continue;
        const data = args.data as { viewCount?: { increment?: number }; lastViewedAt?: Date };
        if (data.viewCount?.increment) r.viewCount += data.viewCount.increment;
        if (data.lastViewedAt) r.lastViewedAt = data.lastViewedAt;
        count++;
      }
      return { count };
    },
  );

  return {
    client: {
      publication: { findFirst, findUnique, findMany, count, create, update, updateMany },
    },
    spies: { findFirst, findUnique, create, update, updateMany },
  };
}

const validInput = {
  targetType: 'invoiceout' as const,
  targetId: '00000000-0000-0000-0000-000000000050',
};

describe('PublicationService — create', () => {
  it('generates unique URL-safe token (43 chars, base64url alphabet)', async () => {
    const rows: PublicationRow[] = [];
    const prisma = makePrismaMock(rows);
    const svc = new PublicationService({ client: prisma.client } as never);
    await svc.create('acc-1', 'emp-1', validInput);
    const tok = rows[0]?.token ?? '';
    expect(tok).toHaveLength(43);
    expect(tok).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('idempotent: re-publishing same target returns existing row', async () => {
    const rows: PublicationRow[] = [];
    const prisma = makePrismaMock(rows);
    const svc = new PublicationService({ client: prisma.client } as never);
    const first = await svc.create('acc-1', 'emp-1', validInput);
    const second = await svc.create('acc-1', 'emp-1', validInput);
    expect(rows).toHaveLength(1);
    expect(second.id).toBe(first.id);
    expect(second.token).toBe(first.token); // token preserved
  });

  it('re-publishing a revoked publication un-revokes it', async () => {
    const rows = [makeRow({ revokedAt: new Date() })];
    const prisma = makePrismaMock(rows);
    const svc = new PublicationService({ client: prisma.client } as never);
    const result = await svc.create('acc-1', 'emp-1', {
      ...validInput,
      targetId: rows[0]!.targetId,
    });
    expect(rows[0]?.revokedAt).toBeNull();
    expect(result.id).toBe(rows[0]?.id);
  });

  it('hashes password before persisting (argon2 verifiable)', async () => {
    const rows: PublicationRow[] = [];
    const prisma = makePrismaMock(rows);
    const svc = new PublicationService({ client: prisma.client } as never);
    await svc.create('acc-1', 'emp-1', { ...validInput, password: 'secret123' });
    expect(rows[0]?.passwordHash).toBeTruthy();
    expect(rows[0]?.passwordHash).not.toBe('secret123'); // not plain-text
    const verified = await argon2.verify(rows[0]!.passwordHash!, 'secret123');
    expect(verified).toBe(true);
  });

  it('rejects expiresAt in the past', async () => {
    const rows: PublicationRow[] = [];
    const prisma = makePrismaMock(rows);
    const svc = new PublicationService({ client: prisma.client } as never);
    await expect(
      svc.create('acc-1', 'emp-1', {
        ...validInput,
        expiresAt: '2020-01-01T00:00:00Z',
      }),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('PublicationService — resolveByToken (public viewer)', () => {
  it('returns metadata for a valid token', async () => {
    const rows = [makeRow({ token: 'good-tok-123', viewCount: 5 })];
    const prisma = makePrismaMock(rows);
    const svc = new PublicationService({ client: prisma.client } as never);
    const meta = await svc.resolveByToken('good-tok-123');
    expect(meta.targetType).toBe('invoiceout');
    expect(meta.viewCount).toBe(5);
    expect(meta.passwordProtected).toBe(false);
  });

  it('returns 404 for unknown token', async () => {
    const rows: PublicationRow[] = [];
    const prisma = makePrismaMock(rows);
    const svc = new PublicationService({ client: prisma.client } as never);
    await expect(svc.resolveByToken('nope')).rejects.toThrow(NotFoundException);
  });

  it('returns 410 Gone when revoked', async () => {
    const rows = [makeRow({ token: 'rev', revokedAt: new Date() })];
    const prisma = makePrismaMock(rows);
    const svc = new PublicationService({ client: prisma.client } as never);
    await expect(svc.resolveByToken('rev')).rejects.toThrow(GoneException);
  });

  it('returns 410 Gone when expired', async () => {
    const rows = [makeRow({ token: 'exp', expiresAt: new Date('2020-01-01') })];
    const prisma = makePrismaMock(rows);
    const svc = new PublicationService({ client: prisma.client } as never);
    await expect(svc.resolveByToken('exp')).rejects.toThrow(GoneException);
  });

  it('returns 404 when soft-deleted', async () => {
    const rows = [makeRow({ token: 'del', deletedAt: new Date() })];
    const prisma = makePrismaMock(rows);
    const svc = new PublicationService({ client: prisma.client } as never);
    await expect(svc.resolveByToken('del')).rejects.toThrow(NotFoundException);
  });

  it('flags passwordProtected when hash is set', async () => {
    const rows = [makeRow({ token: 'prot', passwordHash: 'fake-hash' })];
    const prisma = makePrismaMock(rows);
    const svc = new PublicationService({ client: prisma.client } as never);
    const meta = await svc.resolveByToken('prot');
    expect(meta.passwordProtected).toBe(true);
  });
});

describe('PublicationService — verifyPassword', () => {
  it('returns ok on correct password', async () => {
    const hash = await argon2.hash('secret123');
    const rows = [makeRow({ token: 'p-tok', passwordHash: hash })];
    const prisma = makePrismaMock(rows);
    const svc = new PublicationService({ client: prisma.client } as never);
    const r = await svc.verifyPassword('p-tok', 'secret123');
    expect(r.ok).toBe(true);
  });

  it('throws ForbiddenException on wrong password', async () => {
    const hash = await argon2.hash('secret123');
    const rows = [makeRow({ token: 'p-tok', passwordHash: hash })];
    const prisma = makePrismaMock(rows);
    const svc = new PublicationService({ client: prisma.client } as never);
    await expect(svc.verifyPassword('p-tok', 'wrong')).rejects.toThrow(ForbiddenException);
  });

  it('no-op success when publication has no password set', async () => {
    const rows = [makeRow({ token: 'open' })]; // passwordHash null
    const prisma = makePrismaMock(rows);
    const svc = new PublicationService({ client: prisma.client } as never);
    const r = await svc.verifyPassword('open', 'anything');
    expect(r.ok).toBe(true);
  });

  it('rejects when publication is revoked', async () => {
    const rows = [makeRow({ token: 'rev', revokedAt: new Date(), passwordHash: 'x' })];
    const prisma = makePrismaMock(rows);
    const svc = new PublicationService({ client: prisma.client } as never);
    await expect(svc.verifyPassword('rev', 'any')).rejects.toThrow(GoneException);
  });
});

describe('PublicationService — recordView', () => {
  it('increments viewCount and stamps lastViewedAt', async () => {
    const rows = [makeRow({ token: 't', viewCount: 3 })];
    const prisma = makePrismaMock(rows);
    const svc = new PublicationService({ client: prisma.client } as never);
    await svc.recordView('t');
    expect(rows[0]?.viewCount).toBe(4);
    expect(rows[0]?.lastViewedAt).toBeInstanceOf(Date);
  });

  it('does not increment for revoked publication', async () => {
    const rows = [makeRow({ token: 't', viewCount: 3, revokedAt: new Date() })];
    const prisma = makePrismaMock(rows);
    const svc = new PublicationService({ client: prisma.client } as never);
    await svc.recordView('t');
    expect(rows[0]?.viewCount).toBe(3);
  });
});

describe('PublicationService — admin lifecycle (revoke, rotate, delete)', () => {
  it('revoke stamps revokedAt; subsequent resolve returns 410', async () => {
    const rows = [makeRow({ token: 'r' })];
    const prisma = makePrismaMock(rows);
    const svc = new PublicationService({ client: prisma.client } as never);
    await svc.revoke('acc-1', 'pub-1');
    expect(rows[0]?.revokedAt).toBeInstanceOf(Date);
    await expect(svc.resolveByToken('r')).rejects.toThrow(GoneException);
  });

  it('rotateToken generates a new token (old URL no longer resolves)', async () => {
    const rows = [makeRow({ token: 'old-tok' })];
    const prisma = makePrismaMock(rows);
    const svc = new PublicationService({ client: prisma.client } as never);
    await svc.rotateToken('acc-1', 'pub-1');
    expect(rows[0]?.token).not.toBe('old-tok');
    expect(rows[0]?.token).toHaveLength(43);
    await expect(svc.resolveByToken('old-tok')).rejects.toThrow(NotFoundException);
  });

  it('softDelete stamps deletedAt and excludes from list/findById', async () => {
    const rows = [makeRow()];
    const prisma = makePrismaMock(rows);
    const svc = new PublicationService({ client: prisma.client } as never);
    await svc.softDelete('acc-1', 'pub-1');
    expect(rows[0]?.deletedAt).toBeInstanceOf(Date);
    await expect(svc.findById('acc-1', 'pub-1')).rejects.toThrow(NotFoundException);
  });

  it('list sanitises passwordHash (never returned to clerks)', async () => {
    const rows = [makeRow({ passwordHash: 'do-not-leak' })];
    const prisma = makePrismaMock(rows);
    const svc = new PublicationService({ client: prisma.client } as never);
    const list = await svc.list('acc-1', {});
    expect(list.items[0]?.passwordHash).toBeUndefined();
    expect((list.items[0] as { passwordProtected: boolean }).passwordProtected).toBe(true);
  });
});
