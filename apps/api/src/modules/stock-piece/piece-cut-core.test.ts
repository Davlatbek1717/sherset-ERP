import { describe, expect, it } from 'vitest';
import {
  PIECE_CONSUMED_REASON,
  canConfirmPieceLine,
  cutErrorMessage,
  evaluateCutCoverage,
  formatPieceLengths,
  parsePieceLengths,
  planCut,
  planSaleConsumption,
} from './piece-cut-core.js';

/**
 * K4 — kesim yadrosining qulfi.
 *
 * Eng muhim da'vo — ZANJIR INVARIANTI: har kesim manba uzunligini
 * QOLDIQSIZ taqsimlaydi (mijoz + qoldiq + chiqindi + yo'qotish = manba).
 * Buzilsa sverkada sababsiz farq paydo bo'lardi va uni hech kim
 * tushuntira olmasdi (IS-5 — ko'rinmaydigan nosozlik).
 */

const active = (length: string, whole = false, label: string | null = 'BLK-000001') => ({
  length,
  whole,
  status: 'active',
  label: whole ? null : label,
});

/** Kesimdan chiqqan HAMMA bolaning yig'indisi. */
function chainSum(plan: ReturnType<typeof planCut>): number {
  return [plan.customer, plan.remainder, plan.scrap, plan.loss]
    .filter((c) => c != null)
    .reduce((sum, c) => sum + Number(c?.length ?? 0), 0);
}

describe('K4 — kassirning kelishuvi («150+30»)', () => {
  it('matndan massivga va orqaga', () => {
    expect(parsePieceLengths('150+30')).toEqual(['150', '30']);
    expect(formatPieceLengths(['150', '30'])).toBe('150+30');
  });

  it("vergul NUQTAga o'giriladi (uz/ru klaviaturasi)", () => {
    expect(parsePieceLengths('150,5+30')).toEqual(['150.5', '30']);
    expect(formatPieceLengths(['150,5', '30'])).toBe('150.5+30');
  });

  it("BITTA bo'lak — kelishuv EMAS, saqlanmaydi", () => {
    // Bo'linmagan qator: ustunni to'ldirish omborchiga hech narsa qo'shmaydi.
    expect(formatPieceLengths(['180'])).toBeNull();
    expect(formatPieceLengths([])).toBeNull();
    expect(formatPieceLengths(null)).toBeNull();
  });

  it('yaroqsiz qismlar jimgina tashlanadi, qolgani saqlanadi', () => {
    expect(parsePieceLengths('150+abc+30')).toEqual(['150', '30']);
    expect(parsePieceLengths('0+30')).toEqual(['30']);
    expect(parsePieceLengths('')).toEqual([]);
    expect(parsePieceLengths(null)).toEqual([]);
  });
});

describe('K4 — kesim rejasi', () => {
  it('250 dan 180 kesildi: mijozga 180, omborga 70 — IKKALASI ham YORLIQLI', () => {
    const plan = planCut({ source: active('250'), cutLength: '180', startSeq: 41 });
    expect(plan.rule).toBe('cut');
    expect(plan.customer).toMatchObject({ length: '180', label: 'BLK-000041', whole: false });
    expect(plan.remainder).toMatchObject({ length: '70', label: 'BLK-000042' });
    expect(plan.scrap).toBeNull();
    expect(plan.loss).toBeNull();
    expect(plan.labels).toEqual(['BLK-000041', 'BLK-000042']);
  });

  it("BUTUN RULONDAN kesilganda qolgani BO'LAK bo'ladi va yorliq oladi", () => {
    const plan = planCut({ source: active('250', true), cutLength: '180', startSeq: 1 });
    expect(plan.customer?.whole).toBe(false);
    expect(plan.remainder?.whole).toBe(false);
    expect(plan.remainder?.label).toBe('BLK-000002');
  });

  it('ZANJIR INVARIANTI: bolalar yig`indisi manbaga TENG', () => {
    for (const [source, cut, remaining] of [
      ['250', '180', null],
      ['250', '180', '68'],
      ['250', '249.5', null],
      ['100.5', '50.25', '50'],
    ] as Array<[string, string, string | null]>) {
      const plan = planCut({
        source: active(source),
        cutLength: cut,
        remainingLength: remaining,
        startSeq: 1,
      });
      expect(plan.error).toBeUndefined();
      expect(chainSum(plan)).toBeCloseTo(Number(source), 6);
    }
  });

  it("omborchi qoldiqni TUZATSA farq `cut-loss` bo'lib chiqadi", () => {
    // 250 − 180 = 70 kutilardi, omborchi 68 o'lchadi ⇒ 2 m kesim yo'qotishi.
    const plan = planCut({
      source: active('250'),
      cutLength: '180',
      remainingLength: '68',
      startSeq: 1,
    });
    expect(plan.remainder?.length).toBe('68');
    expect(plan.loss).toMatchObject({
      length: '2',
      status: 'consumed',
      reason: PIECE_CONSUMED_REASON.cutLoss,
      label: null,
    });
    expect(chainSum(plan)).toBe(250);
  });

  it('1 m dan kalta qoldiq — CHIQINDI: yorliqsiz va reyestrdan chiqadi (K-Q6)', () => {
    const plan = planCut({ source: active('250'), cutLength: '249.6', startSeq: 1 });
    expect(plan.remainder).toBeNull();
    expect(plan.scrap).toMatchObject({
      length: '0.4',
      status: 'consumed',
      reason: PIECE_CONSUMED_REASON.scrap,
      label: null,
    });
    // Yorliq FAQAT bitta — mijoz bo'lagiga. Chiqindiga yorliq bosish
    // omborchini javonda yo'q narsani qidirishga majburlardi.
    expect(plan.labels).toEqual(['BLK-000001']);
    expect(chainSum(plan)).toBeCloseTo(250, 6);
  });

  it('aynan 1 m qolsa u CHIQINDI EMAS — yorliq oladi (chegara inklyuziv)', () => {
    const plan = planCut({ source: active('250'), cutLength: '249', startSeq: 1 });
    expect(plan.scrap).toBeNull();
    expect(plan.remainder).toMatchObject({ length: '1', label: 'BLK-000002' });
  });

  it("mijoz butun bo'lakni olsa KESIM YO'Q (`take-whole`) — yangi yorliq ham yo'q", () => {
    const plan = planCut({ source: active('250'), cutLength: '250', startSeq: 1 });
    expect(plan.rule).toBe('take-whole');
    expect(plan.customer).toMatchObject({ length: '250', label: 'BLK-000001' });
    expect(plan.remainder).toBeNull();
    expect(plan.labels).toEqual([]);
  });

  it('`take-whole` butun rulonda ham ishlaydi va yorliq TALAB QILMAYDI', () => {
    const plan = planCut({ source: active('250', true), cutLength: '250', startSeq: 1 });
    expect(plan.rule).toBe('take-whole');
    expect(plan.customer).toMatchObject({ whole: true, label: null });
  });

  it("mijoz bo'lagi 1 m dan kalta bo'lishi MUMKIN (0,5 m sotish normal)", () => {
    // Chiqindi chegarasi QOLDIQQA tegishli, mijoz olayotgan narsaga emas.
    const plan = planCut({ source: active('250'), cutLength: '0.5', startSeq: 1 });
    expect(plan.customer?.length).toBe('0.5');
    expect(plan.remainder?.length).toBe('249.5');
  });

  it('xatolar: manba yopiq, kesim noto`g`ri, qoldiq ko`p', () => {
    expect(
      planCut({ source: { ...active('250'), status: 'consumed' }, cutLength: '10', startSeq: 1 })
        .error,
    ).toBe('source-not-active');
    expect(planCut({ source: active('250'), cutLength: '0', startSeq: 1 }).error).toBe(
      'cut-not-positive',
    );
    expect(planCut({ source: active('250'), cutLength: '-5', startSeq: 1 }).error).toBe(
      'cut-not-positive',
    );
    expect(planCut({ source: active('250'), cutLength: '251', startSeq: 1 }).error).toBe(
      'cut-exceeds-source',
    );
    // Kesimdan tovar KO'PAYMAYDI: 250 − 180 = 70 dan katta qoldiq — o'lchov
    // xatosi yoki noto'g'ri manba, ikkalasida ham jim qabul qilib bo'lmaydi.
    expect(
      planCut({ source: active('250'), cutLength: '180', remainingLength: '71', startSeq: 1 })
        .error,
    ).toBe('remaining-exceeds-source');
    expect(
      planCut({ source: active('250'), cutLength: '180', remainingLength: '-1', startSeq: 1 })
        .error,
    ).toBe('remaining-negative');
  });

  it('har xato kodining omborchiga ko`rinadigan matni bor', () => {
    for (const code of [
      'source-not-active',
      'cut-not-positive',
      'cut-exceeds-source',
      'remaining-negative',
      'remaining-exceeds-source',
      'chain-mismatch',
    ] as const) {
      expect(cutErrorMessage(code).length).toBeGreaterThan(10);
    }
  });

  it('kasr uzunliklar Decimal(20,6) aniqligida yuradi (float drift yo`q)', () => {
    const plan = planCut({ source: active('0.3'), cutLength: '0.1', startSeq: 1 });
    expect(plan.customer?.length).toBe('0.1');
    expect(plan.remainder).toBeNull(); // 0.2 < 1 m ⇒ chiqindi
    expect(plan.scrap?.length).toBe('0.2');
  });
});

describe('K4 — qator yopilishi (kesim yozilganmi)', () => {
  const piece = (length: string) => ({ length, status: 'active' });

  it("bayrog'i O'CHIQ tovarda kesim TALAB QILINMAYDI", () => {
    expect(
      evaluateCutCoverage({
        pieceTracked: false,
        registryHasPieces: true,
        reserved: [],
        quantity: '180',
      }),
    ).toBe('not-required');
  });

  it("🔴 reyestr BO'SH bo'lsa ham talab qilinmaydi (K3 `no-registry` qoidasi)", () => {
    // Bayroq yoqilgan-u bo'laklar hali kiritilmagan holat K5 gacha NORMAL.
    // Kesimni majburiy qilsak birinchi kundayoq har kabel yig'ishi to'xtardi.
    expect(
      evaluateCutCoverage({
        pieceTracked: true,
        registryHasPieces: false,
        reserved: [],
        quantity: '180',
      }),
    ).toBe('not-required');
  });

  it('reyestr to`la, kesim yo`q ⇒ `missing`', () => {
    expect(
      evaluateCutCoverage({
        pieceTracked: true,
        registryHasPieces: true,
        reserved: [],
        quantity: '180',
      }),
    ).toBe('missing');
  });

  it('qisman kesim ⇒ `partial`, to`liq ⇒ `covered`', () => {
    const base = { pieceTracked: true, registryHasPieces: true, quantity: '180' };
    expect(evaluateCutCoverage({ ...base, reserved: [piece('150')] })).toBe('partial');
    expect(evaluateCutCoverage({ ...base, reserved: [piece('150'), piece('30')] })).toBe('covered');
    // Ortiqcha ham qoplangan hisoblanadi (omborchi kattaroq bo'lak bergan).
    expect(evaluateCutCoverage({ ...base, reserved: [piece('200')] })).toBe('covered');
  });

  it('`consumed` bo`lak qoplamaydi (u allaqachon ketgan)', () => {
    expect(
      evaluateCutCoverage({
        pieceTracked: true,
        registryHasPieces: true,
        reserved: [{ length: '180', status: 'consumed' }],
        quantity: '180',
      }),
    ).toBe('missing');
  });

  it('qatorni faqat `not-required` yoki `covered` yopadi', () => {
    expect(canConfirmPieceLine('not-required')).toBe(true);
    expect(canConfirmPieceLine('covered')).toBe(true);
    expect(canConfirmPieceLine('partial')).toBe(false);
    expect(canConfirmPieceLine('missing')).toBe(false);
  });
});

describe('K4 — to`lovda bo`laklar reyestrdan chiqadi', () => {
  const POS = 'pos-1';

  it('faqat FAOL bo`laklar chiqadi', () => {
    const plan = planSaleConsumption(
      [
        { id: 'a', reservedPositionId: POS, length: '150', status: 'active' },
        { id: 'b', reservedPositionId: POS, length: '30', status: 'active' },
        { id: 'c', reservedPositionId: POS, length: '10', status: 'consumed' },
      ],
      [{ id: POS, quantity: '180' }],
    );
    expect(plan.pieceIds).toEqual(['a', 'b']);
    expect(plan.mismatches).toEqual([]);
  });

  it('🔴 nomuvofiqlik sotuvni TO`XTATMAYDI — faqat ko`rinadi', () => {
    // To'lov paytida chekni rad etish 2026-08-24 hodisasining aynan shakli
    // bo'lardi: tizim ishlaydi, kassa to'xtaydi.
    const plan = planSaleConsumption(
      [{ id: 'a', reservedPositionId: POS, length: '150', status: 'active' }],
      [{ id: POS, quantity: '180' }],
    );
    expect(plan.pieceIds).toEqual(['a']);
    expect(plan.mismatches).toEqual([{ positionId: POS, expected: '180', pieces: '150' }]);
  });

  it("bo'lak biriktirilmagan qator nomuvofiqlik EMAS (reyestr bo'sh — normal)", () => {
    const plan = planSaleConsumption([], [{ id: POS, quantity: '180' }]);
    expect(plan.pieceIds).toEqual([]);
    expect(plan.mismatches).toEqual([]);
  });
});
