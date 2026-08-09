import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ManagerCommentTemplateService } from './manager-comment-template.service.js';

/**
 * MK20 — shablon servisi: bazasiz ULANISH testlari.
 *
 * Sof qoidalar `comment-templates.test.ts` da qulflangan. Bu yerda faqat
 * mock'siz ko'rinmaydigan shartnomalar:
 *   1. 🔴 `resolveComment` JURNAL UCHUN MATN qaytaradi — hech qachon `id`;
 *   2. tahrirlangan matn shablondan ustun, lekin ishlatilish HAMON sanaladi;
 *   3. begona/noma'lum shablon RAD etiladi (hisob chegarasi so'rovda);
 *   4. 🔴 statistika yozuvi menejerning qarorini BLOKLAMAYDI (xato yutiladi);
 *   5. yaratishda noma'lum qoida/amat kaliti rad etiladi (jim ko'rinmas
 *      shablonning oldini oladi) — bu Zod qatlamida, `schema.test` da.
 */

const ACC = 'acc-1';

function makeService(row: Record<string, unknown> | null = null) {
  const findFirst = vi.fn().mockResolvedValue(row);
  const update = vi.fn().mockResolvedValue({});
  const findMany = vi.fn().mockResolvedValue([]);
  const create = vi.fn().mockResolvedValue({ id: 'new-1' });
  const client = {
    managerCommentTemplate: { findFirst, findMany, create, update },
  };
  const service = new ManagerCommentTemplateService({ client } as never);
  return { service, findFirst, findMany, create, update };
}

const TPL = {
  id: 'tpl-1',
  kind: 'rejection',
  locale: 'uz',
  title: 'Dublikat',
  body: 'Bu element dublikat — hodisa allaqachon ko`rilgan.',
  ruleTypes: [],
  actions: [],
  sortOrder: 0,
  usageCount: 3,
  lastUsedAt: null,
  archivedAt: null,
};

describe('resolveComment — jurnalga MATN', () => {
  it('shablon tanlansa uning TANASI qaytadi (id emas)', async () => {
    const { service } = makeService(TPL);
    const text = await service.resolveComment(ACC, { templateId: TPL.id });
    expect(text).toBe(TPL.body);
    expect(text).not.toContain(TPL.id);
  });

  it('shablon SO`ROVI hisob bilan chegaralangan (begona hisobniki ko`rinmaydi)', async () => {
    const { service, findFirst } = makeService(TPL);
    await service.resolveComment(ACC, { templateId: TPL.id });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ accountId: ACC, id: TPL.id }) }),
    );
  });

  it('noma`lum shablon 404 — jimgina bo`sh izoh yozilmaydi', async () => {
    const { service } = makeService(null);
    await expect(service.resolveComment(ACC, { templateId: 'yo`q' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('tahrirlangan matn shablondan USTUN, ishlatilish baribir sanaladi', async () => {
    const { service, update } = makeService(TPL);
    const text = await service.resolveComment(ACC, {
      templateId: TPL.id,
      comment: 'Dublikat, lekin ombor farqi bilan',
    });
    expect(text).toBe('Dublikat, lekin ombor farqi bilan');
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('shablonsiz izoh — baza UMUMAN o`qilmaydi', async () => {
    const { service, findFirst, update } = makeService(null);
    const text = await service.resolveComment(ACC, { comment: 'Erkin izoh' });
    expect(text).toBe('Erkin izoh');
    expect(findFirst).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('na shablon, na izoh — `null` (amal baribir o`tadi)', async () => {
    const { service } = makeService(null);
    expect(await service.resolveComment(ACC, {})).toBeNull();
  });

  it('🔴 statistika yozuvi yiqilsa ham izoh QAYTADI (qaror bloklanmaydi)', async () => {
    const { service, update } = makeService(TPL);
    update.mockRejectedValueOnce(new Error('DB yiqildi'));
    await expect(service.resolveComment(ACC, { templateId: TPL.id })).resolves.toBe(TPL.body);
  });

  it('ishlatilish hisoblagichi OSHADI va oxirgi ishlatilish sanasi yoziladi', async () => {
    const { service, update } = makeService(TPL);
    await service.resolveComment(ACC, { templateId: TPL.id });
    const arg = update.mock.calls[0]?.[0] as {
      where: { id: string };
      data: { usageCount: { increment: number }; lastUsedAt: Date };
    };
    expect(arg.where.id).toBe(TPL.id);
    expect(arg.data.usageCount).toEqual({ increment: 1 });
    expect(arg.data.lastUsedAt).toBeInstanceOf(Date);
  });
});

describe('suggest — kontekst bo`yicha', () => {
  it('arxivlanganlar SO`ROVDA kesiladi va sof modul tartibi qo`llanadi', async () => {
    const { service, findMany } = makeService();
    findMany.mockResolvedValue([
      { ...TPL, id: 'gen', title: 'Umumiy', usageCount: 0 },
      { ...TPL, id: 'debt', title: 'Qarz', ruleTypes: ['BIG_DEBT'], usageCount: 0 },
      { ...TPL, id: 'warn', kind: 'warning', title: 'Ogohlantirish' },
    ]);
    const out = await service.suggest(ACC, { action: 'dismiss', ruleType: 'BIG_DEBT' });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ archivedAt: null }) }),
    );
    expect(out.templates.map((t) => t.id)).toEqual(['debt', 'gen']);
  });
});

describe('archive — o`chirish emas, arxivlash', () => {
  it('qator O`CHIRILMAYDI (`delete` chaqirilmaydi), `archivedAt` yoziladi', async () => {
    const { service, findFirst, update } = makeService(TPL);
    update.mockResolvedValue({ ...TPL, archivedAt: new Date() });
    await service.archive(ACC, TPL.id);
    expect(findFirst).toHaveBeenCalled();
    expect(update.mock.calls[0]?.[0]).toMatchObject({
      where: { id: TPL.id },
      data: { archivedAt: expect.any(Date) },
    });
  });

  it('begona shablon arxivlanmaydi (404)', async () => {
    const { service } = makeService(null);
    await expect(service.archive(ACC, 'begona')).rejects.toBeInstanceOf(NotFoundException);
  });
});
