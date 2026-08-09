import { describe, expect, it } from 'vitest';
import {
  BRIEFING_BLOCK_ROLE,
  BRIEFING_KIND,
  BRIEFING_STATUS,
  type BriefingBlock,
  type BriefingBlockKey,
  type BriefingReading,
  DIGEST_LIVE_STATUSES,
  EVENING_BLOCK_KEYS,
  MORNING_BLOCK_KEYS,
  buildBriefingBlock,
  digestTag,
  isDigestAlreadyQueued,
  renderDigest,
  summarizeBriefing,
} from './day-briefing.js';

/**
 * MK19 — ertalabki brifing va kechki yakun, SOF qatlam testlari.
 *
 * Uchta qulf shu yerda (rejadagi uchta test bandi):
 *  (1) bo'sh kunda «tinch kun» — LEKIN faqat hamma signal O'LCHANGAN bo'lsa;
 *  (2) digest yorlig'i determinist ⇒ dublikat yuborish tanib olinadi;
 *  (3) raqamlar bu yerda HISOBLANMAYDI — blok manbadan tayyor holda keladi
 *      (`source` provenance majburiy).
 */

function reading(over: Partial<BriefingReading> & { key: BriefingBlockKey }): BriefingReading {
  return {
    count: 0,
    amountMinor: null,
    sourceComplete: true,
    source: `TestService.${over.key}`,
    ...over,
  };
}

/** Hamma signal o'lchandi va nol — «tinch kun» sharti. */
function calmMorning(): BriefingBlock[] {
  return MORNING_BLOCK_KEYS.map((key) => buildBriefingBlock(reading({ key })));
}

describe('MK19 — blok registri', () => {
  it('ertalabki va kechki ro‘yxatlar rejadagi bandlarni qoplaydi', () => {
    expect([...MORNING_BLOCK_KEYS]).toEqual([
      'stuck',
      'sla_breach',
      'acceptance_pending',
      'stock_signal',
    ]);
    expect([...EVENING_BLOCK_KEYS]).toEqual([
      'revenue',
      'shift_acceptance',
      'cash_variance',
      'open_items',
    ]);
  });

  it('«jarayonda turgan ish» va «tushum» — OGOHLANTIRISH emas (soxta signal yo‘q)', () => {
    // Bu ikki blok `measure`: 5 ta buyurtma yig'ilayotgani va bugun 12 mln
    // sotilgani — normal ish kuni, ogohlantirish emas. Ularni `signal` qilish
    // har ishlaydigan kunni «diqqat» holatiga aylantirardi va menejer bir
    // haftada ekranga ishonishni to'xtatardi.
    expect(BRIEFING_BLOCK_ROLE.stuck).toBe('measure');
    expect(BRIEFING_BLOCK_ROLE.revenue).toBe('measure');
    expect(BRIEFING_BLOCK_ROLE.sla_breach).toBe('signal');
    expect(BRIEFING_BLOCK_ROLE.cash_variance).toBe('signal');
  });

  it('har blok registrda rol oladi (yangi blok jimgina signal bo‘lib qolmaydi)', () => {
    for (const key of [...MORNING_BLOCK_KEYS, ...EVENING_BLOCK_KEYS]) {
      expect(BRIEFING_BLOCK_ROLE[key]).toBeDefined();
    }
  });
});

describe('MK19 — blok qurilishi (NULL ≠ 0)', () => {
  it('o‘lchangan nol — `complete` bayrog‘i, diqqat YO‘Q', () => {
    const b = buildBriefingBlock(reading({ key: 'sla_breach', count: 0 }));
    expect(b.count).toBe(0);
    expect(b.quality).toBe('complete');
    expect(b.attention).toBe(false);
  });

  it('o‘lchanmagan blok `count: null` va `uncollected` — 0 EMAS', () => {
    const b = buildBriefingBlock(reading({ key: 'sla_breach', count: null }));
    expect(b.count).toBeNull();
    expect(b.quality).toBe('uncollected');
    // O'lchanmagan signal «muammo yo'q» degani emas ⇒ diqqat bayrog'i
    // ko'tarilmaydi, lekin xulosada u «tinch kun» ni ham BERMAYDI (pastda).
    expect(b.attention).toBe(false);
  });

  it('manba chala bo‘lsa `partial` — raqam bor, lekin kam ko‘rsatilgan', () => {
    const b = buildBriefingBlock(reading({ key: 'open_items', count: 500, sourceComplete: false }));
    expect(b.quality).toBe('partial');
    expect(b.attention).toBe(true);
  });

  it('`measure` bloki nolga teng bo‘lmasa ham diqqat BERMAYDI', () => {
    const b = buildBriefingBlock(reading({ key: 'stuck', count: 7 }));
    expect(b.role).toBe('measure');
    expect(b.attention).toBe(false);
  });

  it('pul o‘lchovi satr bo‘lib qaytadi, o‘lchanmagani `null`', () => {
    const withMoney = buildBriefingBlock(
      reading({ key: 'revenue', count: 3, amountMinor: 1_250_000n }),
    );
    expect(withMoney.amountMinor).toBe('1250000');
    const none = buildBriefingBlock(reading({ key: 'revenue', count: null, amountMinor: null }));
    expect(none.amountMinor).toBeNull();
  });

  it('provenance saqlanadi — «bu raqam qayerdan» ekranda ko‘rinadi', () => {
    const b = buildBriefingBlock(
      reading({ key: 'stock_signal', source: 'ManagerInventoryService.stockSignals' }),
    );
    expect(b.source).toBe('ManagerInventoryService.stockSignals');
  });
});

describe('MK19 — «tinch kun» (soxta ogohlantirish YO‘Q)', () => {
  it('bo‘sh kun: hamma signal o‘lchandi va nol ⇒ `quiet`', () => {
    const s = summarizeBriefing(BRIEFING_KIND.morning, calmMorning());
    expect(s.status).toBe(BRIEFING_STATUS.quiet);
    expect(s.attentionCount).toBe(0);
    expect(s.attentionBlocks).toEqual([]);
    expect(s.quality).toBe('complete');
  });

  it('`measure` bloki katta bo‘lsa ham kun TINCH qoladi', () => {
    const blocks = MORNING_BLOCK_KEYS.map((key) =>
      buildBriefingBlock(reading({ key, count: key === 'stuck' ? 9 : 0 })),
    );
    expect(summarizeBriefing(BRIEFING_KIND.morning, blocks).status).toBe(BRIEFING_STATUS.quiet);
  });

  it('🔴 o‘lchanmagan SIGNAL «tinch kun» BERMAYDI — u soxta xotirjamlik', () => {
    const blocks = MORNING_BLOCK_KEYS.map((key) =>
      buildBriefingBlock(reading({ key, count: key === 'stock_signal' ? null : 0 })),
    );
    const s = summarizeBriefing(BRIEFING_KIND.morning, blocks);
    expect(s.status).toBe(BRIEFING_STATUS.incomplete);
    // Yarim yig'indi berilmaydi: «0 ta ogohlantirish» to'liq raqamdek ko'rinardi.
    expect(s.attentionCount).toBeNull();
    expect(s.quality).toBe('partial');
  });

  it('o‘lchanmagan MEASURE «tinch kun» ni buzmaydi, lekin bayroqni tushiradi', () => {
    const blocks = MORNING_BLOCK_KEYS.map((key) =>
      buildBriefingBlock(reading({ key, count: key === 'stuck' ? null : 0 })),
    );
    const s = summarizeBriefing(BRIEFING_KIND.morning, blocks);
    expect(s.status).toBe(BRIEFING_STATUS.quiet);
    expect(s.attentionCount).toBe(0);
    expect(s.quality).toBe('partial');
  });

  it('haqiqiy ogohlantirish `incomplete` ostida YASHIRINMAYDI', () => {
    const blocks = MORNING_BLOCK_KEYS.map((key) =>
      buildBriefingBlock(
        reading({
          key,
          count: key === 'sla_breach' ? 3 : key === 'stock_signal' ? null : 0,
        }),
      ),
    );
    const s = summarizeBriefing(BRIEFING_KIND.morning, blocks);
    expect(s.status).toBe(BRIEFING_STATUS.attention);
    expect(s.attentionBlocks).toEqual(['sla_breach']);
    // Bitta signal o'lchanmagani uchun JAMI berilmaydi (3 = yarim yig'indi).
    expect(s.attentionCount).toBeNull();
  });

  it('hammasi o‘lchangan bo‘lsa jami signal birliklari qo‘shiladi', () => {
    const blocks = EVENING_BLOCK_KEYS.map((key) =>
      buildBriefingBlock(
        reading({ key, count: key === 'cash_variance' ? 2 : key === 'open_items' ? 5 : 0 }),
      ),
    );
    const s = summarizeBriefing(BRIEFING_KIND.evening, blocks);
    expect(s.status).toBe(BRIEFING_STATUS.attention);
    expect(s.attentionCount).toBe(7);
    expect(s.attentionBlocks).toEqual(['cash_variance', 'open_items']);
  });

  it('bo‘sh blok ro‘yxati «tinch kun» EMAS — hech narsa tekshirilmagan', () => {
    const s = summarizeBriefing(BRIEFING_KIND.morning, []);
    expect(s.status).toBe(BRIEFING_STATUS.incomplete);
    expect(s.quality).toBe('uncollected');
  });
});

describe('MK19 — Telegram digest yorlig‘i (dublikatsizlik kaliti)', () => {
  it('yorliq tur + ish kunidan determinist chiqadi', () => {
    expect(digestTag(BRIEFING_KIND.morning, '2026-08-10')).toBe('#brifing_2026-08-10');
    expect(digestTag(BRIEFING_KIND.evening, '2026-08-10')).toBe('#yakun_2026-08-10');
  });

  it('ertalabki va kechki yorliqlar KESISHMAYDI (bir kunda ikkalasi ketadi)', () => {
    expect(digestTag(BRIEFING_KIND.morning, '2026-08-10')).not.toBe(
      digestTag(BRIEFING_KIND.evening, '2026-08-10'),
    );
  });

  it('navbatda yoki yuborilgan xabar bo‘lsa — dublikat', () => {
    for (const status of DIGEST_LIVE_STATUSES) {
      expect(isDigestAlreadyQueued([{ status }])).toBe(true);
    }
  });

  it('yetkazilmagani (`dead`/`failed`) QAYTA yuborishga to‘sqinlik qilmaydi', () => {
    expect(isDigestAlreadyQueued([{ status: 'dead' }, { status: 'failed' }])).toBe(false);
    expect(isDigestAlreadyQueued([])).toBe(false);
  });
});

describe('MK19 — digest matni', () => {
  const summaryOf = (blocks: BriefingBlock[]) => summarizeBriefing(BRIEFING_KIND.morning, blocks);

  it('tinch kunda bitta xotirjam qator — soxta ogohlantirish yo‘q', () => {
    const blocks = calmMorning();
    const text = renderDigest({
      kind: BRIEFING_KIND.morning,
      businessDate: '2026-08-10',
      blocks,
      summary: summaryOf(blocks),
      currency: 'UZS',
    });
    expect(text).toContain('Tinch kun');
    expect(text).not.toMatch(/⚠/);
    expect(text.trimEnd().endsWith('#brifing_2026-08-10')).toBe(true);
    // Tinch kunda SIGNAL ro'yxati chizilmaydi — nol qatorlar xabarni
    // o'qilmaydigan qilardi.
    expect(text).not.toContain('SLA buzilishi');
  });

  it('🔴 `measure` bloki TINCH kunda ham chiziladi — kechki yakun tushum uchun ochiladi', () => {
    const blocks = EVENING_BLOCK_KEYS.map((key) =>
      buildBriefingBlock(
        reading({
          key,
          count: key === 'revenue' ? 4 : 0,
          amountMinor: key === 'revenue' ? 1_500_000n : null,
        }),
      ),
    );
    const summary = summarizeBriefing(BRIEFING_KIND.evening, blocks);
    expect(summary.status).toBe(BRIEFING_STATUS.quiet);
    const text = renderDigest({
      kind: BRIEFING_KIND.evening,
      businessDate: '2026-08-10',
      blocks,
      summary,
      currency: 'UZS',
    });
    expect(text).toContain('Tushum');
    expect(text).toContain('Tinch kun');
  });

  it('o‘lchanmagan blok matnda `—`, `0` EMAS', () => {
    const blocks = MORNING_BLOCK_KEYS.map((key) =>
      buildBriefingBlock(reading({ key, count: key === 'stock_signal' ? null : 0 })),
    );
    const text = renderDigest({
      kind: BRIEFING_KIND.morning,
      businessDate: '2026-08-10',
      blocks,
      summary: summaryOf(blocks),
      currency: 'UZS',
    });
    const line = text.split('\n').find((l) => l.includes('Zaxira'));
    expect(line).toBeDefined();
    expect(line).toContain('—');
    expect(line).not.toMatch(/\b0\b/);
    expect(text).not.toContain('Tinch kun');
  });

  it('pul o‘lchovi mavjud formatlagich bilan chiziladi', () => {
    const blocks = EVENING_BLOCK_KEYS.map((key) =>
      buildBriefingBlock(
        reading({
          key,
          count: key === 'revenue' ? 4 : 0,
          amountMinor: key === 'revenue' ? 1_500_000n : null,
        }),
      ),
    );
    const text = renderDigest({
      kind: BRIEFING_KIND.evening,
      businessDate: '2026-08-10',
      blocks,
      summary: summarizeBriefing(BRIEFING_KIND.evening, blocks),
      currency: 'UZS',
    });
    // `Money.format('uz')` — 15 000,00 so'm. Yangi formatlagich yozilmagan.
    expect(text).toContain('15 000');
    expect(text).toContain('#yakun_2026-08-10');
  });

  it('diqqat talab qilgan signal matnda belgilanadi', () => {
    const blocks = MORNING_BLOCK_KEYS.map((key) =>
      buildBriefingBlock(reading({ key, count: key === 'sla_breach' ? 4 : 0 })),
    );
    const text = renderDigest({
      kind: BRIEFING_KIND.morning,
      businessDate: '2026-08-10',
      blocks,
      summary: summaryOf(blocks),
      currency: 'UZS',
    });
    expect(text).toMatch(/⚠/);
    expect(text).toContain('4');
  });
});
