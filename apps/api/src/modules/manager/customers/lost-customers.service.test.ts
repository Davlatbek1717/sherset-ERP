import { describe, expect, it, vi } from 'vitest';
import { LOST_REASON_NOTE_KIND, LostCustomersService } from './lost-customers.service.js';

/**
 * MK17 — «yo'qolgan mijozlar» I/O qatlami. Prisma qo'lda mock qilingan
 * (`debt-collection.service.test.ts` uslubi) — DB yo'q.
 *
 * Shu yerda tekshiriladigan shartnomalar:
 *  1. **Faollik FAKTdan o'qiladi** — `Demand` va `RetailSale` ikkalasi ham
 *     (POS orqali olayotgan mijoz «yo'qolgan» bo'lib qolmaydi).
 *  2. **Valyuta bo'yicha filtr YO'Q** — bu yerda pul emas, SANA o'qiladi.
 *  3. **Chegara MK13 registridan** — ikkinchi sozlama manbai yo'q; noto'g'ri
 *     birlik jimgina talqin qilinmaydi.
 *  4. **Kesim to'liq to'plam ustidan** — kesilgan sahifa yolg'on son bermaydi.
 *  5. **Sabab yangi jadvalga emas**, `counterparty_notes` ga yoziladi.
 */

const NOW = new Date('2026-08-10T09:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const ACC = 'acc-1';

function daysBefore(n: number): Date {
  return new Date(NOW.getTime() - n * DAY);
}

interface CpSeed {
  id: string;
  name?: string;
  ownerId?: string | null;
  ownerName?: string | null;
  demand?: { first?: Date; last: Date; count?: number };
  retail?: { first?: Date; last: Date; count?: number };
}

function makeService(opts: {
  counterparties: CpSeed[];
  ruleRows?: Array<{
    ruleType: string;
    enabled?: boolean;
    thresholdValue?: string | null;
    thresholdUnit?: string | null;
  }>;
  reasons?: Array<{
    counterpartyId: string;
    reasonCode: string | null;
    text?: string;
    authorName?: string | null;
  }>;
}) {
  const groupBy = (source: 'demand' | 'retail') =>
    vi.fn(async (args: { where: Record<string, unknown> }) => {
      // Shartnoma 2: bu so'rovda valyuta filtri BO'LMASLIGI kerak.
      expect(args.where).not.toHaveProperty('currency');
      expect(args.where.state).toBe('posted');
      expect(args.where.deletedAt).toBeNull();
      return opts.counterparties
        .filter((c) => c[source])
        .map((c) => {
          const s = c[source] as NonNullable<CpSeed['demand']>;
          return {
            agentId: c.id,
            _min: { moment: s.first ?? s.last },
            _max: { moment: s.last },
            _count: { _all: s.count ?? 1 },
          };
        });
    });

  const demandGroupBy = groupBy('demand');
  const retailGroupBy = groupBy('retail');
  const noteCreate = vi.fn(async () => ({
    id: 'note-1',
    createdAt: NOW,
    reasonCode: 'price',
  }));

  const client = {
    managerRuleConfig: {
      findMany: vi.fn(async () =>
        (opts.ruleRows ?? []).map((r) => ({
          ruleType: r.ruleType,
          enabled: r.enabled ?? true,
          thresholdValue: r.thresholdValue ?? null,
          thresholdUnit: r.thresholdUnit ?? 'days',
          mode: 'notify',
          severity: 'warning',
        })),
      ),
    },
    counterparty: {
      findMany: vi.fn(async () =>
        opts.counterparties.map((c) => ({
          id: c.id,
          name: c.name ?? `CP ${c.id}`,
          phone: null,
          ownerId: c.ownerId ?? null,
          owner: c.ownerName ? { name: c.ownerName } : null,
        })),
      ),
      findFirst: vi.fn(async ({ where }: { where: { id: string } }) =>
        opts.counterparties.some((c) => c.id === where.id) ? { id: where.id } : null,
      ),
    },
    demand: { groupBy: demandGroupBy },
    retailSale: { groupBy: retailGroupBy },
    counterpartyNote: { create: noteCreate },
    $queryRaw: vi.fn(async () =>
      (opts.reasons ?? []).map((r) => ({
        counterpartyId: r.counterpartyId,
        reasonCode: r.reasonCode,
        text: r.text ?? '',
        createdAt: daysBefore(1),
        authorId: 'emp-9',
        authorName: r.authorName ?? 'Anna',
      })),
    ),
  };

  const svc = new LostCustomersService({ client } as never);
  return { svc, client, noteCreate };
}

const QUERY = { scope: 'lost' as const, limit: 100 };

describe('LostCustomersService.list — faollik FAKTdan', () => {
  it('ulgurji va chakana savdodan KECHROG`i olinadi', async () => {
    const { svc } = makeService({
      counterparties: [
        // Jo'natma 200 kun oldin, lekin kassada 3 kun oldin xarid bor.
        {
          id: 'cp-pos',
          demand: { last: daysBefore(200) },
          retail: { last: daysBefore(3) },
        },
        { id: 'cp-lost', demand: { last: daysBefore(200) } },
      ],
    });
    const res = await svc.list(ACC, QUERY, NOW);
    expect(res.rows.map((r) => r.counterpartyId)).toEqual(['cp-lost']);
    expect(res.summary.lostCount).toBe(1);
    expect(res.summary.activeCount).toBe(1);
  });

  it('hech qachon xarid qilmagan mijoz ro`yxatga TUSHMAYDI', async () => {
    const { svc } = makeService({ counterparties: [{ id: 'cp-new' }] });
    const res = await svc.list(ACC, QUERY, NOW);
    expect(res.rows).toHaveLength(0);
    expect(res.summary.neverPurchasedCount).toBe(1);
    expect(res.summary.lostCount).toBe(0);
  });

  it('kassa hujjatida xaridor NULL bo`lsa (o`tkinchi) hech kimga yozilmaydi', async () => {
    const { svc, client } = makeService({ counterparties: [{ id: 'cp-1' }] });
    client.retailSale.groupBy = vi.fn(async () => [
      { agentId: null, _min: { moment: NOW }, _max: { moment: NOW }, _count: { _all: 5 } },
    ]) as never;
    const res = await svc.list(ACC, { scope: 'all', limit: 100 }, NOW);
    expect(res.rows[0]?.bucket).toBe('never_purchased');
  });
});

describe('LostCustomersService.list — chegara MK13 registridan', () => {
  it('sozlama yo`q bo`lsa registr sukuti (60 kun) amal qiladi', async () => {
    const { svc } = makeService({
      counterparties: [
        { id: 'cp-59', demand: { last: daysBefore(59) } },
        { id: 'cp-61', demand: { last: daysBefore(61) } },
      ],
    });
    const res = await svc.list(ACC, QUERY, NOW);
    expect(res.config.lostDays).toBe(60);
    expect(res.config.lostDaysConfigured).toBe(false);
    expect(res.rows.map((r) => r.counterpartyId)).toEqual(['cp-61']);
  });

  it('sozlangan davr qo`llanadi (MK17 «davr sozlanadi»)', async () => {
    const { svc } = makeService({
      counterparties: [{ id: 'cp-40', demand: { last: daysBefore(40) } }],
      ruleRows: [{ ruleType: 'LOST_CUSTOMER_DAYS', thresholdValue: '30' }],
    });
    const res = await svc.list(ACC, QUERY, NOW);
    expect(res.config.lostDays).toBe(30);
    expect(res.config.lostDaysConfigured).toBe(true);
    expect(res.rows.map((r) => r.counterpartyId)).toEqual(['cp-40']);
  });

  it('NOTO`G`RI birlikdagi sozlama jimgina qo`llanmaydi', async () => {
    const { svc } = makeService({
      counterparties: [{ id: 'cp-40', demand: { last: daysBefore(40) } }],
      ruleRows: [
        { ruleType: 'LOST_CUSTOMER_DAYS', thresholdValue: '30', thresholdUnit: 'percent' },
      ],
    });
    const res = await svc.list(ACC, QUERY, NOW);
    expect(res.config.lostDays).toBe(60); // sukutga qaytdi
    expect(res.config.lostDaysRejectReason).toBe('unit_mismatch');
    expect(res.rows).toHaveLength(0); // 40 kun < 60 ⇒ hali yo'qolmagan
  });

  it('signal O`CHIRILGAN bo`lsa ro`yxat bo`sh, LEKIN sabab ochiq', async () => {
    const { svc, client } = makeService({
      counterparties: [{ id: 'cp-old', demand: { last: daysBefore(500) } }],
      ruleRows: [{ ruleType: 'LOST_CUSTOMER_DAYS', enabled: false, thresholdValue: '60' }],
    });
    const res = await svc.list(ACC, QUERY, NOW);
    expect(res.config.lostSignalEnabled).toBe(false);
    expect(res.rows).toHaveLength(0);
    // Hisoblash umuman boshlanmaydi — bekorga DB o'qilmaydi.
    expect(client.counterparty.findMany).not.toHaveBeenCalled();
  });

  it('egalik taymeri o`chirilgan bo`lsa `ownershipReleaseDays` null bo`ladi', async () => {
    const { svc } = makeService({
      counterparties: [
        { id: 'cp-old', ownerId: 'emp-1', ownerName: 'Anna', demand: { last: daysBefore(500) } },
      ],
      ruleRows: [{ ruleType: 'OWNERSHIP_RELEASE_DAYS', enabled: false, thresholdValue: '90' }],
    });
    const res = await svc.list(ACC, QUERY, NOW);
    expect(res.config.ownershipReleaseDays).toBeNull();
    expect(res.summary.releaseDueCount).toBe(0);
    expect(res.summary.ownershipConflict).toBe(false);
  });
});

describe('LostCustomersService.list — kesim va kesish', () => {
  it('kesim TO`LIQ to`plam ustidan, kesilgan sahifa bo`yicha EMAS', async () => {
    const { svc } = makeService({
      counterparties: Array.from({ length: 5 }, (_, i) => ({
        id: `cp-${i}`,
        ownerId: 'emp-1',
        ownerName: 'Anna',
        demand: { last: daysBefore(100 + i) },
      })),
    });
    const res = await svc.list(ACC, { scope: 'lost', limit: 2 }, NOW);
    expect(res.rows).toHaveLength(2);
    expect(res.truncated).toBe(true);
    expect(res.totalCount).toBe(5);
    // 🔴 Kesim baribir 5 ta ko'rsatadi.
    expect(res.summary.byOwner).toEqual([{ ownerId: 'emp-1', ownerName: 'Anna', lostCount: 5 }]);
  });

  it('`unmarkedOnly` faqat sababi belgilanmaganlarni qoldiradi', async () => {
    const { svc } = makeService({
      counterparties: [
        { id: 'cp-1', demand: { last: daysBefore(100) } },
        { id: 'cp-2', demand: { last: daysBefore(100) } },
      ],
      reasons: [{ counterpartyId: 'cp-1', reasonCode: 'price' }],
    });
    const res = await svc.list(ACC, { scope: 'lost', limit: 100, unmarkedOnly: true }, NOW);
    expect(res.rows.map((r) => r.counterpartyId)).toEqual(['cp-2']);
    // Kesim esa ikkalasini ham biladi.
    expect(res.summary.lostCount).toBe(2);
    expect(res.summary.unmarkedCount).toBe(1);
  });

  it('sabab belgisi (kod + izoh + muallif) qatorga yetib boradi', async () => {
    const { svc } = makeService({
      counterparties: [{ id: 'cp-1', demand: { last: daysBefore(100) } }],
      reasons: [
        {
          counterpartyId: 'cp-1',
          reasonCode: 'competitor',
          text: 'Boshqa bazaga o`tdi',
          authorName: 'Bek',
        },
      ],
    });
    const row = (await svc.list(ACC, QUERY, NOW)).rows[0];
    expect(row?.reasonCode).toBe('competitor');
    expect(row?.reasonNote).toBe('Boshqa bazaga o`tdi');
    expect(row?.reasonAuthorName).toBe('Bek');
  });
});

describe('LostCustomersService.markReason — yangi jadval EMAS', () => {
  it('belgi `counterparty_notes` ga `kind=lost_reason` bilan yoziladi', async () => {
    const { svc, noteCreate } = makeService({ counterparties: [{ id: 'cp-1' }] });
    const res = await svc.markReason(ACC, 'emp-9', {
      counterpartyId: 'cp-1',
      code: 'price',
      note: 'Qimmat dedi',
    });
    expect(res.ok).toBe(true);
    const arg = noteCreate.mock.calls[0]?.[0] as unknown as { data: Record<string, unknown> };
    expect(arg.data.kind).toBe(LOST_REASON_NOTE_KIND);
    expect(arg.data.reasonCode).toBe('price');
    expect(arg.data.text).toBe('Qimmat dedi');
    expect(arg.data.authorId).toBe('emp-9');
  });

  it('begona akkaunt mijoziga belgi qo`yilmaydi', async () => {
    const { svc, noteCreate } = makeService({ counterparties: [{ id: 'cp-1' }] });
    await expect(
      svc.markReason(ACC, 'emp-9', {
        counterpartyId: 'cp-begona',
        code: 'price',
        note: null,
      }),
    ).rejects.toThrow(/topilmadi/);
    expect(noteCreate).not.toHaveBeenCalled();
  });
});
