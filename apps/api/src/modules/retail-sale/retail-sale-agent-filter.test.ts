import { describe, expect, it, vi } from 'vitest';
import { RetailSaleFilterSchema } from './retail-sale.schema.js';
import { RetailSaleService } from './retail-sale.service.js';

/**
 * F9 — mijoz kartasidagi «oxirgi xaridlar» bloki.
 *
 * Ro'yxat MIJOZ bo'yicha filtrlanadi. Ilgari `RetailSaleFilterSchema` da
 * faqat `search` bor edi va u `agent.name contains` qilardi — ya'ni bir xil
 * ismli ikki mijozning cheklari ARALASHIB ketardi va chek nomiga («CHK-90»)
 * tasodifan mos kelgan qatorlar ham tushardi. Karta bloki uchun bu yaramaydi:
 * u ANIQ kontragent bo'yicha o'qiydi.
 *
 * NON-VACUOUS: qo'shishdan oldin `RetailSaleFilterSchema` `agentId` ni
 * jimgina TASHLAB yuborardi (Zod default `strip`), `where` da esa `agentId`
 * umuman yo'q edi — ikkala test ham yiqiladi.
 */

const ACC = 'acc-1';
const AGENT = '00000000-0000-0000-0000-0000000000c1';

function makeHarness() {
  const findMany = vi.fn(async () => [] as unknown[]);
  const count = vi.fn(async () => 0);
  const client = { retailSale: { findMany, count } };
  const svc = new RetailSaleService(
    { client } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { svc, findMany, count };
}

describe('F9 — `GET /retail-sales?agentId=`', () => {
  it('sxema `agentId` ni QABUL qiladi (jimgina tashlamaydi)', () => {
    const parsed = RetailSaleFilterSchema.parse({ agentId: AGENT });
    expect(parsed.agentId).toBe(AGENT);
  });

  it('uuid bo`lmagan `agentId` RAD etiladi (butun ro`yxat qaytib qolmasin)', () => {
    expect(() => RetailSaleFilterSchema.parse({ agentId: 'hammasi' })).toThrow();
  });

  it('`where` ga AYNAN `agentId` tengligi tushadi', async () => {
    const h = makeHarness();
    await h.svc.list(ACC, { agentId: AGENT, limit: 5 });

    const args = h.findMany.mock.calls[0]?.[0] as { where?: Record<string, unknown> } | undefined;
    expect(args?.where?.agentId).toBe(AGENT);
    // Umumiy so'rov shakli buzilmaydi.
    expect(args?.where?.accountId).toBe(ACC);
  });

  it('`agentId` berilmasa `where` ga tushmaydi (ro`yxat sahifasi o`zgarmaydi)', async () => {
    const h = makeHarness();
    await h.svc.list(ACC, { limit: 5 });

    const args = h.findMany.mock.calls[0]?.[0] as { where?: Record<string, unknown> } | undefined;
    expect(args?.where && 'agentId' in args.where).toBe(false);
  });
});
