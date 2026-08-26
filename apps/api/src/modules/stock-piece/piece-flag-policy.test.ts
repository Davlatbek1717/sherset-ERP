import { describe, expect, it } from 'vitest';
import {
  DIGEST_PREVIEW_ROWS,
  type FlagCandidate,
  buildFlagDecisionPatch,
  buildPendingDecisionList,
  classifyFlagDecision,
  defaultPieceTrackedForUom,
  isMeterUom,
  resolveDigestRecipients,
  summarizePieceDigest,
} from './piece-flag-policy.js';

/**
 * K6 — bayroq siyosati yadrosi.
 *
 * Bu testlar JONLI XULQNI qulflaydi: bayroq yoqilgan tovarda kassa taqsimoti
 * boshqacha ishlaydi (K3 ning 7.1 istisnosi — bo'linish O'CHADI va bitta
 * manba qoplamasa chek 400 oladi). Ya'ni «qaysi tovarda bayroq yoqiladi»
 * degan savol savdo to'xtashi bilan bevosita bog'liq.
 */

const row = (over: Partial<FlagCandidate> = {}): FlagCandidate => ({
  id: 'p1',
  name: 'Kabel',
  code: '00001',
  uom: 'м',
  pieceTracked: false,
  decidedAt: null,
  ...over,
});

// ── 1. «m» birligini tanish ──────────────────────────────────────────────────

describe('K6 — «m» birligi (K-Q9: yangi «m» tovarda bayroq YOQILGAN keladi)', () => {
  it('kirill «м» va lotin «m» — IKKALASI ham metr', () => {
    // Ko'rinishi bir xil, kod nuqtasi boshqa. Foydalanuvchi qaysi
    // klaviaturada yozganini bilib bo'lmaydi.
    expect(isMeterUom('м')).toBe(true);
    expect(isMeterUom('m')).toBe(true);
  });

  it('registr va bo`shliqlar ahamiyatsiz', () => {
    expect(isMeterUom(' М ')).toBe(true);
    expect(isMeterUom('Metr')).toBe(true);
    expect(isMeterUom('МЕТР')).toBe(true);
    expect(isMeterUom('м е т р')).toBe(true);
  });

  it('🔴 `мм` · `м2` · `м3` · `мл` metr EMAS (prefiks bo`yicha tekshirish tuzog`i)', () => {
    // Prefiks bo'yicha tekshirilsa bu to'rttasi ham bo'lak hisobiga tortilardi
    // va millimetrli tovar kassada «uzluksiz bo'lak» talab qila boshlardi.
    for (const uom of ['мм', 'м2', 'м3', 'мл', 'mm', 'm2', 'ml']) {
      expect(isMeterUom(uom), uom).toBe(false);
    }
  });

  it('bo`sh, null va boshqa birliklar — metr emas', () => {
    expect(isMeterUom(null)).toBe(false);
    expect(isMeterUom(undefined)).toBe(false);
    expect(isMeterUom('')).toBe(false);
    expect(isMeterUom('шт')).toBe(false);
    expect(isMeterUom('kg')).toBe(false);
  });

  it('yangi tovar sukuti birlikdan chiqadi', () => {
    expect(defaultPieceTrackedForUom('м')).toBe(true);
    expect(defaultPieceTrackedForUom('шт')).toBe(false);
    expect(defaultPieceTrackedForUom(null)).toBe(false);
  });
});

// ── 2. Qaror holati ──────────────────────────────────────────────────────────

describe('K6 — qaror holati (uch holat, ikki emas)', () => {
  it('sana bo`lsa — QAROR QILINGAN (bayroq qanday bo`lishidan qat`i nazar)', () => {
    expect(classifyFlagDecision(row({ decidedAt: new Date(), pieceTracked: false }))).toBe(
      'decided',
    );
    expect(classifyFlagDecision(row({ decidedAt: new Date(), pieceTracked: true }))).toBe(
      'decided',
    );
  });

  it('🔴 sanasiz `false` — «yo`q dedik» EMAS, «hali hech kim qaramagan»', () => {
    // Aynan shu farq uchun ustun qo'shildi: boolean bu ikkalasini ajrata
    // olmaydi va yangi nomenklatura jimgina o'tib ketardi.
    expect(classifyFlagDecision(row({ decidedAt: null, pieceTracked: false }))).toBe('pending-off');
  });

  it('sanasiz `true` — yangi «m» tovar sukuti, TASDIQ kutmoqda', () => {
    expect(classifyFlagDecision(row({ decidedAt: null, pieceTracked: true }))).toBe('pending-on');
  });

  it('sana satr ko`rinishida kelsa ham qaror deb o`qiladi (JSON yo`li)', () => {
    expect(classifyFlagDecision(row({ decidedAt: '2026-08-26T10:00:00.000Z' }))).toBe('decided');
  });
});

// ── 3. «Hal qilinmagan» ro'yxati ─────────────────────────────────────────────

describe('K6/3 — «hal qilinmagan» ro`yxati', () => {
  it('qaror qilinganlar ro`yxatga TUSHMAYDI, lekin sanaladi', () => {
    const out = buildPendingDecisionList([
      row({ id: 'a', decidedAt: new Date() }),
      row({ id: 'b', name: 'Sim' }),
    ]);
    expect(out.rows.map((r) => r.id)).toEqual(['b']);
    expect(out.totals).toMatchObject({ pending: 1, decided: 1 });
  });

  it('🔴 bayrog`i YOQILGANLAR birinchi — ular jonli xulqni ALLAQACHON o`zgartirgan', () => {
    // Kassada `no-single-source` 400 aynan shu tovarlarda chiqadi (K3 ning
    // ochiq xavfi), shuning uchun ular ro'yxatning boshida turishi kerak.
    const out = buildPendingDecisionList([
      row({ id: 'off', name: 'AAA', pieceTracked: false }),
      row({ id: 'on', name: 'ZZZ', pieceTracked: true }),
    ]);
    expect(out.rows.map((r) => r.id)).toEqual(['on', 'off']);
    expect(out.totals.pendingOn).toBe(1);
  });

  it('teng holatda reyestrda bo`lagi ko`pi oldinda, so`ng nom bo`yicha', () => {
    const out = buildPendingDecisionList([
      row({ id: 'c', name: 'Beta', activePieces: 0 }),
      row({ id: 'a', name: 'Alfa', activePieces: 0 }),
      row({ id: 'b', name: 'Gamma', activePieces: 7 }),
    ]);
    expect(out.rows.map((r) => r.id)).toEqual(['b', 'a', 'c']);
  });

  it('chegara — kesilgani `truncated` da KO`RINADI (jim kesish yo`q)', () => {
    const out = buildPendingDecisionList(
      [row({ id: '1', name: 'A' }), row({ id: '2', name: 'B' }), row({ id: '3', name: 'C' })],
      2,
    );
    expect(out.rows).toHaveLength(2);
    expect(out.truncated).toBe(1);
    expect(out.totals.pending).toBe(3);
  });

  it('bo`sh kirish — bo`sh ro`yxat, nol jamilar', () => {
    const out = buildPendingDecisionList([]);
    expect(out.rows).toEqual([]);
    expect(out.totals).toEqual({ pending: 0, pendingOn: 0, decided: 0 });
    expect(out.truncated).toBe(0);
  });
});

// ── 4. Qaror muhri ──────────────────────────────────────────────────────────

describe('K6 — qaror muhri', () => {
  const now = new Date('2026-08-26T12:00:00.000Z');

  it('«ha» ham, «yo`q» ham MUHRLANADI — ikkalasi ham qaror', () => {
    expect(buildFlagDecisionPatch(true, 'emp-1', now)).toEqual({
      pieceTracked: true,
      pieceTrackedDecidedAt: now,
      pieceTrackedDecidedById: 'emp-1',
    });
    expect(buildFlagDecisionPatch(false, 'emp-1', now).pieceTrackedDecidedAt).toBe(now);
  });

  it('aktyor noma`lum bo`lsa ham qaror yoziladi (sana muhim, ism ikkinchi darajali)', () => {
    expect(buildFlagDecisionPatch(true, null, now).pieceTrackedDecidedById).toBeNull();
  });
});

// ── 5. Kunlik signal ────────────────────────────────────────────────────────

const report = (over: Partial<Parameters<typeof summarizePieceDigest>[0]> = {}) => ({
  totals: { trackedProducts: 3, diffBuckets: 0, diffQty: '0', activePieces: 12 },
  rows: [],
  warnings: [],
  ...over,
});

describe('K6/5 — kunlik sverka signali', () => {
  it('🔴 farq YO`Q — bildirishnoma ham YO`Q («bo`ri keldi» ga aylanmasin)', () => {
    const out = summarizePieceDigest(report());
    expect(out.shouldNotify).toBe(false);
  });

  it('farq bor — signal beriladi va eng kattalari matnda ko`rinadi', () => {
    const out = summarizePieceDigest(
      report({
        totals: { trackedProducts: 2, diffBuckets: 2, diffQty: '-30', activePieces: 5 },
        rows: [
          {
            storeName: 'Ombor 07',
            cellName: '07-01-01-01',
            productName: 'Kabel VVG',
            diffQty: '-20',
            status: 'missing',
          },
          {
            storeName: 'Taqsimlanmagan',
            cellName: null,
            productName: 'Sim',
            diffQty: '10',
            status: 'excess',
          },
        ],
      }),
    );
    expect(out.shouldNotify).toBe(true);
    expect(out.diffBuckets).toBe(2);
    expect(out.body).toContain('Kabel VVG');
    expect(out.body).toContain('07-01-01-01');
    // Yacheykasiz qator — faqat ombor nomi (K1 sverkasining ikkinchi qatlami).
    expect(out.body).toContain('Sim (Taqsimlanmagan)');
  });

  it('ogohlantirish ham signal beradi (farq ustunida ko`rinmaydi)', () => {
    // `pieces-without-flag` — bayroq o'chiq, lekin reyestrda bo'lak bor.
    // Bu farq sifatida hisoblanmaydi, lekin reyestr haqiqatdan uzilgan.
    const out = summarizePieceDigest(
      report({ warnings: [{ code: 'pieces-without-flag', productName: 'Kabel', count: 4 }] }),
    );
    expect(out.shouldNotify).toBe(true);
    expect(out.warnings).toBe(4);
    expect(out.body).toContain('ogohlantirish: 4');
  });

  it(`ko'p farqda faqat ${DIGEST_PREVIEW_ROWS} tasi ko'rsatiladi, qolgani «+N» bilan`, () => {
    const rows = Array.from({ length: 6 }, (_, i) => ({
      storeName: 'S',
      cellName: null,
      productName: `P${i}`,
      diffQty: '1',
      status: 'excess' as const,
    }));
    const out = summarizePieceDigest(
      report({
        totals: { trackedProducts: 6, diffBuckets: 6, diffQty: '6', activePieces: 6 },
        rows,
      }),
    );
    expect(out.body).toContain(`+${6 - DIGEST_PREVIEW_ROWS}`);
    expect(out.body).not.toContain('P5');
  });
});

// ── 6. Signal kimga boradi ──────────────────────────────────────────────────

describe('K6/5 — signal qabul qiluvchilari (MK26 override qatlami)', () => {
  it('rol bergan ruxsat — xodim ro`yxatga tushadi', () => {
    expect(
      resolveDigestRecipients({
        roleGrants: [
          { employeeId: 'e2', scope: 'ALL' },
          { employeeId: 'e1', scope: 'OWN' },
        ],
        overrides: [],
      }),
    ).toEqual(['e1', 'e2']); // barqaror tartib
  });

  it('rol qatoridagi `NO` — ruxsat emas', () => {
    expect(
      resolveDigestRecipients({ roleGrants: [{ employeeId: 'e1', scope: 'NO' }], overrides: [] }),
    ).toEqual([]);
  });

  it('🔴 xodim OVERRIDE `NO` — rol bergan bo`lsa ham signal YO`Q', () => {
    // `scope='NO'` overrride'i «yozuv yo'q» emas, «ataylab taqiqlangan».
    // Aks holda tizim odamga u ko'ra olmaydigan ekran haqida xabar berardi.
    expect(
      resolveDigestRecipients({
        roleGrants: [{ employeeId: 'e1', scope: 'ALL' }],
        overrides: [{ employeeId: 'e1', scope: 'NO' }],
      }),
    ).toEqual([]);
  });

  it('override ruxsat bersa — roli bo`lmasa ham signal boradi', () => {
    expect(
      resolveDigestRecipients({
        roleGrants: [],
        overrides: [{ employeeId: 'e9', scope: 'ALL' }],
      }),
    ).toEqual(['e9']);
  });

  it('takrorlanish yo`q (bir xodim bir necha rol bilan)', () => {
    expect(
      resolveDigestRecipients({
        roleGrants: [
          { employeeId: 'e1', scope: 'ALL' },
          { employeeId: 'e1', scope: 'OWN' },
        ],
        overrides: [],
      }),
    ).toEqual(['e1']);
  });
});
