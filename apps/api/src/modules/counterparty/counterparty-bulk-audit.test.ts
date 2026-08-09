import { describe, expect, it } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { CounterpartyService } from './counterparty.service.js';

/**
 * MK38 — «mijoz egaligi o'zgarishi TARIXGA yoziladi» (4-bo'lim TZ §6 · 2-bo'lim
 * TZ §4.8 «faoliyat jurnali: … egalik o'zgarishi: kim, qachon, nima»).
 *
 * 🔴 TOPILGAN BO'SHLIQ: bitta kontragentni tahrirlash (`update`) audit yozadi,
 * lekin **`bulkUpdate` YOZMAGAN**. Mijoz taqsimoti aynan ommaviy amal — ya'ni
 * eng ko'p ishlatiladigan yo'lda tarix umuman qolmasdi va «kim bu mijozni
 * o'ziga oldi?» degan savolga javob bo'lmasdi.
 *
 * Tarix uchun YANGI jadval ochilmaydi: `audit_log` allaqachon shu maqsadda
 * ishlaydi va bitta-tahrir yo'li unga yozadi. Ikkinchi ombor ikki xil javob
 * bo'lardi.
 */

const OLD_OWNER = '11111111-1111-4111-8111-111111111111';
const NEW_OWNER = '22222222-2222-4222-8222-222222222222';
const CP_ID = '33333333-3333-4333-8333-333333333333';
const ACTOR = '44444444-4444-4444-8444-444444444444';

interface AuditCall {
  entity: string;
  entityId: string;
  action: string;
  userId: string;
  fieldChanges: unknown;
}

const CP = { id: CP_ID, name: 'Romashka MChJ', ownerId: OLD_OWNER };

function makeClient(over: {
  rows?: Array<Record<string, unknown>>;
  updated?: Record<string, unknown>;
  auditThrows?: boolean;
  audits: AuditCall[];
}) {
  const rows = over.rows ?? [CP];
  return {
    employee: { findFirst: async () => ({ id: NEW_OWNER }) },
    group: { findFirst: async () => ({ id: NEW_OWNER }) },
    priceType: { findFirst: async () => ({ id: NEW_OWNER }) },
    counterpartyGroup: { count: async () => 0 },
    counterparty: {
      findMany: async () => rows,
      update: async ({ where }: { where: { id: string } }) => ({
        ...rows.find((r) => r.id === where.id),
        ...(over.updated ?? { ownerId: NEW_OWNER }),
      }),
    },
    auditLog: {
      create: async ({ data }: { data: AuditCall }) => {
        if (over.auditThrows) throw new Error('jurnal band');
        over.audits.push(data);
        return data;
      },
    },
  };
}

function stub(rows?: Array<Record<string, unknown>>) {
  const audits: AuditCall[] = [];
  const client = makeClient({ rows, audits });
  return { svc: new CounterpartyService({ client } as unknown as PrismaService), audits };
}

describe('MK38 — ommaviy egalik o`zgarishi tarixga tushadi', () => {
  it('🔴 `bulkUpdate` egani almashtirsa AUDIT yoziladi', async () => {
    const { svc, audits } = stub();
    await svc.bulkUpdate('acc', ACTOR, { ids: [CP_ID], patch: { ownerId: NEW_OWNER } });

    expect(audits).toHaveLength(1);
    expect(audits[0]?.entity).toBe('Counterparty');
    expect(audits[0]?.entityId).toBe(CP_ID);
    expect(audits[0]?.userId).toBe(ACTOR);
  });

  it('audit yozuvida ESKI va YANGI ega ko`rinadi («nima o`zgardi»)', async () => {
    const { svc, audits } = stub();
    await svc.bulkUpdate('acc', ACTOR, { ids: [CP_ID], patch: { ownerId: NEW_OWNER } });

    const changes = audits[0]?.fieldChanges as Record<string, { before: unknown; after: unknown }>;
    expect(changes?.ownerId).toEqual({ before: OLD_OWNER, after: NEW_OWNER });
  });

  it('egasiz havzaga qaytarish (`null`) ham tarixga tushadi', async () => {
    const audits: AuditCall[] = [];
    const client = makeClient({ audits, updated: { ownerId: null } });
    const svc = new CounterpartyService({ client } as unknown as PrismaService);
    await svc.bulkUpdate('acc', ACTOR, { ids: [CP_ID], patch: { ownerId: null } });

    const changes = audits[0]?.fieldChanges as Record<string, { before: unknown; after: unknown }>;
    expect(changes?.ownerId).toEqual({ before: OLD_OWNER, after: null });
  });

  it('hech narsa o`zgarmasa audit YOZILMAYDI (shovqin bo`lmasin)', async () => {
    const { svc, audits } = stub([{ ...CP, ownerId: NEW_OWNER }]);
    await svc.bulkUpdate('acc', ACTOR, { ids: [CP_ID], patch: { ownerId: NEW_OWNER } });
    expect(audits).toEqual([]);
  });

  it('audit yozuvi amalni YIQITMAYDI (bulk natijasi baribir qaytadi)', async () => {
    // Jurnal — kuzatuv, biznes amali emas. Yozuv xato bersa mijoz taqsimoti
    // to'xtab qolmasligi kerak.
    const client = makeClient({ audits: [], auditThrows: true });
    const svc = new CounterpartyService({ client } as unknown as PrismaService);
    const res = await svc.bulkUpdate('acc', ACTOR, {
      ids: [CP_ID],
      patch: { ownerId: NEW_OWNER },
    });
    expect(res.succeeded).toEqual([CP_ID]);
  });
});
