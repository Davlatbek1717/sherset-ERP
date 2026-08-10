import { describe, expect, it, vi } from 'vitest';
import { ManagerThresholdsService } from './manager-thresholds.service.js';

/**
 * MK13 yozuv sirti (MK17 da qo'shildi).
 *
 * Ikki shartnoma:
 *  1. **Birlik mijozdan olinmaydi** — har doim registrdan yoziladi, aks holda
 *     `percent` yozib `days` deb o'qish yo'li ochilardi.
 *  2. **Yozishda baland ovozda rad** — oraliqdan chiqqan qiymat 400 beradi
 *     (o'qishda esa jimgina sukutga qaytadi — bu ATAYLAB assimetrik).
 */

function makeService(existing: unknown[] = []) {
  const upsert = vi.fn(async () => ({}));
  const client = {
    managerRuleConfig: {
      findMany: vi.fn(async () => existing),
      upsert,
    },
  };
  return { svc: new ManagerThresholdsService({ client } as never), upsert, client };
}

describe('ManagerThresholdsService', () => {
  it('sozlamasiz akkaunt registr sukutlarini qaytaradi', async () => {
    const { svc } = await makeService();
    const list = await svc.list('acc-1');
    const lost = list.find((t) => t.key === 'LOST_CUSTOMER_DAYS');
    expect(lost?.value).toBe(60);
    expect(lost?.unit).toBe('days');
    expect(list.map((t) => t.key).sort()).toEqual([
      'BUDGET_WARN_PERCENT',
      'KPI_SCORE_CAP',
      'LOST_CUSTOMER_DAYS',
      'OWNERSHIP_RELEASE_DAYS',
    ]);
  });

  it('birlik REGISTRDAN yoziladi, mijoz yuborgan qiymatdan emas', async () => {
    const { svc, upsert } = await makeService();
    await svc.update('acc-1', 'LOST_CUSTOMER_DAYS', { value: 45 }, 'emp-1');
    const arg = upsert.mock.calls[0]?.[0] as unknown as {
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    };
    expect(arg.create.thresholdUnit).toBe('days');
    expect(arg.update.thresholdUnit).toBe('days');
    expect(arg.create.thresholdValue).toBe(45);
  });

  it('oraliqdan tashqari qiymat 400 beradi (jimgina sukutga QAYTMAYDI)', async () => {
    const { svc, upsert } = await makeService();
    await expect(svc.update('acc-1', 'LOST_CUSTOMER_DAYS', { value: 3 }, 'emp-1')).rejects.toThrow(
      /7–730/,
    );
    expect(upsert).not.toHaveBeenCalled();
  });

  it('noma`lum kalit rad etiladi (begona `ruleType` yozib bo`lmaydi)', async () => {
    const { svc, upsert } = await makeService();
    await expect(svc.update('acc-1', 'SLA_ORDER_PICKING', { value: 4 }, 'emp-1')).rejects.toThrow(
      /Noma'lum chegara/,
    );
    expect(upsert).not.toHaveBeenCalled();
  });

  it('faqat `enabled` o`zgartirilganda qiymatga tegilmaydi', async () => {
    const { svc, upsert } = await makeService();
    await svc.update('acc-1', 'LOST_CUSTOMER_DAYS', { enabled: false }, 'emp-1');
    const arg = upsert.mock.calls[0]?.[0] as unknown as { update: Record<string, unknown> };
    expect(arg.update).not.toHaveProperty('thresholdValue');
    expect(arg.update.enabled).toBe(false);
  });
});
