import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ManagerSlaService } from './manager-sla.service.js';
import { SLA_STAGE, SLA_STAGES, STAGE_OPEN_STATES } from './stuck-sla.js';

/**
 * MK10 — SLA paneli servisi: bazasiz ULANISH testlari.
 *
 * Sof qoidalar `stuck-sla.test.ts` da qulflangan. Bu yerda faqat mock'siz
 * chiqarib bo'lmaydigan shartnomalar:
 *   1. 🔴 YOPILGAN ob'ekt umuman O'QILMAYDI — `where` bandi `STAGE_OPEN_STATES`
 *      dan quriladi (3-majburiy test shu yerda ma'noga ega bo'ladi);
 *   2. 🔴 panel HECH NARSA YOZMAYDI (read-only ekran);
 *   3. sozlama faqat `SLA_*` kalitlarini oladi — MK06 navbat qoidalari bir
 *      jadvalda yashaydi va aralashib ketmasligi kerak;
 *   4. `bigint` transportga satr bo'lib chiqadi;
 *   5. manba shifti urilsa JIM qolmaydi (`sourceTruncated`).
 */

const ACC = 'acc-1';
/**
 * Servis `now` ni O'ZI oladi (`new Date()` — jonli holat ekrani bilan bir xil
 * konvensiya), shuning uchun testdagi sanalar HAQIQIY hozirgi paytdan
 * sanaladi. Qat'iy sana yozilsa yosh test yugurtirilgan vaqtga qarab
 * suzardi.
 */
const NOW_MS = Date.now();

function hoursAgo(h: number): Date {
  return new Date(NOW_MS - h * 3_600_000);
}

function makeClient(over: Record<string, unknown> = {}) {
  const empty = () => ({ findMany: vi.fn().mockResolvedValue([]) });
  const client = {
    managerRuleConfig: {
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn().mockResolvedValue({}),
    },
    msPickList: empty(),
    supply: empty(),
    supplyApprovalEvent: { groupBy: vi.fn().mockResolvedValue([]) },
    serviceRequest: empty(),
    cashierSession: empty(),
    demand: empty(),
    paymentIn: empty(),
    paymentOut: empty(),
    cashIn: empty(),
    cashOut: empty(),
    ...over,
  };
  const service = new ManagerSlaService({ client } as never);
  return { service, client };
}

// ── 🔴 Yopilgan ob'ekt o'qilmaydi ───────────────────────────────────────────

describe("🔴 YOPILGAN ob'ekt umuman O'QILMAYDI", () => {
  it('har manbaning `where` bandi `STAGE_OPEN_STATES` dan quriladi', async () => {
    const { service, client } = makeClient();
    await service.board(ACC, {});

    expect(client.msPickList.findMany.mock.calls[0]?.[0].where.pickState.in).toEqual(
      STAGE_OPEN_STATES[SLA_STAGE.orderPicking],
    );
    expect(client.supply.findMany.mock.calls[0]?.[0].where.approvalStage.in).toEqual(
      STAGE_OPEN_STATES[SLA_STAGE.supplyAcceptance],
    );
    expect(client.serviceRequest.findMany.mock.calls[0]?.[0].where.status.in).toEqual(
      STAGE_OPEN_STATES[SLA_STAGE.claimResponse],
    );
    expect(client.cashierSession.findMany.mock.calls[0]?.[0].where.state.in).toEqual(
      STAGE_OPEN_STATES[SLA_STAGE.shiftClose],
    );
    for (const doc of [client.demand, client.paymentIn, client.cashOut]) {
      expect(doc.findMany.mock.calls[0]?.[0].where.state.in).toEqual(
        STAGE_OPEN_STATES[SLA_STAGE.docApproval],
      );
    }
  });

  it("o'chirilgan (soft-deleted) hujjat ham o'qilmaydi", async () => {
    const { service, client } = makeClient();
    await service.board(ACC, {});
    expect(client.supply.findMany.mock.calls[0]?.[0].where.deletedAt).toBeNull();
    expect(client.demand.findMany.mock.calls[0]?.[0].where.deletedAt).toBeNull();
    expect(client.serviceRequest.findMany.mock.calls[0]?.[0].where.deletedAt).toBeNull();
  });
});

// ── 🔴 Panel yozmaydi ───────────────────────────────────────────────────────

describe('🔴 panel HECH NARSA YOZMAYDI', () => {
  it('`board` da create/update/delete/upsert UMUMAN chaqirilmaydi', async () => {
    const write = vi.fn();
    const { service, client } = makeClient();
    for (const model of Object.values(client)) {
      Object.assign(model as object, {
        create: write,
        createMany: write,
        update: write,
        updateMany: write,
        upsert: write,
        delete: write,
        deleteMany: write,
      });
    }

    await service.board(ACC, {});

    expect(write).not.toHaveBeenCalled();
  });
});

// ── Sozlama ─────────────────────────────────────────────────────────────────

describe('sozlama', () => {
  it('faqat `SLA_*` kalitlari o`qiladi (MK06 qoidalari bilan aralashmaydi)', async () => {
    const { service, client } = makeClient();
    await service.board(ACC, {});

    const where = client.managerRuleConfig.findMany.mock.calls[0]?.[0].where;
    expect(where.accountId).toBe(ACC);
    expect([...where.ruleType.in].sort()).toEqual(
      Object.values(SLA_STAGES)
        .map((d) => d.ruleType)
        .sort(),
    );
  });

  it('notanish bosqich sozlamasi 400 beradi (yopiq ro`yxat)', async () => {
    const { service } = makeClient();
    await expect(service.updateStage(ACC, 'emp-1', 'NOT_A_STAGE', {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('sozlama `SLA_` prefiksli kalit bilan yoziladi', async () => {
    const { service, client } = makeClient();
    await service.updateStage(ACC, 'emp-1', SLA_STAGE.shiftClose, {
      thresholdValue: 6,
      thresholdUnit: 'hours',
    });

    const call = client.managerRuleConfig.upsert.mock.calls[0]?.[0];
    expect(call.where.accountId_ruleType.ruleType).toBe('SLA_SHIFT_CLOSE');
    expect(call.create.thresholdUnit).toBe('hours');
    expect(call.update.thresholdValue).toBe(6);
  });
});

// ── Shakl ───────────────────────────────────────────────────────────────────

describe('javob shakli', () => {
  it('`bigint` satr bo`lib chiqadi, o`lchanmagani `null` qoladi', async () => {
    const { service, client } = makeClient();
    client.cashierSession.findMany.mockResolvedValue([
      {
        id: 'sess-1',
        name: 'KS-1',
        state: 'open',
        openedAt: hoursAgo(40),
        openingCashMinor: 1_500_000n,
        cashierId: 'emp-9',
        cashier: { name: 'Kassir' },
        cashDesk: { name: 'Asosiy kassa' },
      },
    ]);
    client.serviceRequest.findMany.mockResolvedValue([
      {
        id: 'req-1',
        name: 'ZP-2026-00001',
        status: 'new',
        createdAt: hoursAgo(40),
        assigneeId: null,
        assignee: null,
      },
    ]);

    const res = await service.board(ACC, {});

    const shift = res.rows.find((r) => r.stage === SLA_STAGE.shiftClose);
    expect(shift?.amountMinor).toBe('1500000');
    expect(shift?.employeeName).toBe('Kassir');

    const claim = res.rows.find((r) => r.stage === SLA_STAGE.claimResponse);
    // Da'voda summa YO'Q — 0 emas, o'lchanmagan.
    expect(claim?.amountMinor).toBeNull();
  });

  it('bosqich xulosasi barcha bosqich uchun qaytadi', async () => {
    const { service } = makeClient();
    const res = await service.board(ACC, {});
    expect(res.stages).toHaveLength(Object.keys(SLA_STAGES).length);
    expect(res.overdueCount).toBe(0);
  });

  it('manba shifti urilsa JIM qolmaydi', async () => {
    const { service, client } = makeClient();
    const row = (i: number) => ({
      id: `p-${i}`,
      name: `ZK-${i}`,
      moment: hoursAgo(100),
      pickState: 'new',
      sumMinor: 0n,
      pickedById: null,
      pickedBy: null,
    });
    const cap = service.sourceCap;
    client.msPickList.findMany.mockResolvedValue(Array.from({ length: cap }, (_, i) => row(i)));

    const res = await service.board(ACC, {});
    expect(res.sourceTruncated).toBe(true);
  });

  it('yetkazma yoshi OXIRGI tasdiq hodisasidan hisoblanadi', async () => {
    const { service, client } = makeClient();
    client.supply.findMany.mockResolvedValue([
      {
        id: 'sup-1',
        name: 'PR-2026-00001',
        approvalStage: 'awaiting_admin',
        moment: hoursAgo(200),
        updatedAt: hoursAgo(150),
        sumMinor: 5_000_000n,
        currency: 'UZS',
        ownerId: 'emp-3',
        owner: { name: 'Taminotchi' },
      },
    ]);
    client.supplyApprovalEvent.groupBy.mockResolvedValue([
      { supplyId: 'sup-1', _max: { createdAt: hoursAgo(30) } },
    ]);

    const res = await service.board(ACC, {});
    const row = res.rows.find((r) => r.stage === SLA_STAGE.supplyAcceptance);
    // 200 emas, 150 emas — 30 soat: bosqich oxirgi marta shunda qimirlagan.
    expect(row?.ageHours).toBeCloseTo(30, 1);
  });
});
