import { describe, expect, it } from 'vitest';
import { PIECE_CONSUMED_REASON } from './piece-cut-core.js';
import {
  MAX_INTAKE_GROUPS,
  MAX_INTAKE_PIECES,
  MAX_WHOLE_COUNT,
  formatPieceEntry,
  intakeErrorMessage,
  matchQuantity,
  parsePieceEntry,
  planPieceReturn,
  planRecount,
  planSupplyIntake,
} from './piece-intake-core.js';

/**
 * K5 — ommaviy kiritish yadrosining qulfi.
 *
 * Uch da'vo eng muhimi:
 *   1. sanash MUTLAQ, lekin o'zgarish MINIMAL — o'zgarmagan bo'lakning
 *      yorlig'i QAYTA BOSILMAYDI;
 *   2. Σ tarkib === miqdor SHART (aks holda reyestr birinchi kundan qizil);
 *   3. priyomkada bo'lak QABUL QILINMAYDI (u yorliqsiz qolardi).
 */

const parse = (raw: string) => {
  const r = parsePieceEntry(raw);
  if (!r.entry) throw new Error(`kutilmagan xato: ${r.error}`);
  return r.entry;
};

// ---------------------------------------------------------------------------
describe('K5 — kiritish matnini o`qish', () => {
  it('butun rulon guruhi: «250x3» → 3 qator, jami 750', () => {
    const e = parse('250x3');
    expect(e.whole).toEqual([{ length: '250', count: 3 }]);
    expect(e.pieces).toEqual([]);
    expect(e.total).toBe('750');
    expect(e.pieceCount).toBe(3);
  });

  it('sonsiz guruh bitta rulon: «250»', () => {
    expect(parse('250').whole).toEqual([{ length: '250', count: 1 }]);
  });

  it('egasining misoli: «250x3+200+150+70+50» = 1220 (K2 qabul mezoni)', () => {
    // K1/K2 hisobotlaridagi AYNI son — uchala qatlam bir xil hisoblashi shart.
    expect(parse('250x3+200+150+70+50').total).toBe('1220');
  });

  it('yorliqli bo`lak: «BLK-000041:200»', () => {
    const e = parse('BLK-000041:200');
    expect(e.pieces).toEqual([{ label: 'BLK-000041', length: '200' }]);
    expect(e.whole).toEqual([]);
    expect(e.total).toBe('200');
  });

  it('yorliqsiz yangi bo`lak: «?:150»', () => {
    expect(parse('?:150').pieces).toEqual([{ label: null, length: '150' }]);
  });

  it('aralash: «250x3+BLK-000041:200+?:150» = 1100', () => {
    const e = parse('250x3+BLK-000041:200+?:150');
    expect(e.whole).toEqual([{ length: '250', count: 3 }]);
    expect(e.pieces).toEqual([
      { label: 'BLK-000041', length: '200' },
      { label: null, length: '150' },
    ]);
    expect(e.total).toBe('1100');
    expect(e.pieceCount).toBe(5);
  });

  it('🔴 VERGUL nuqtaga o`giriladi (uz/ru klaviaturasi) — «250,5»', () => {
    // K2 `parseLengthInput` bilan AYNI qoida: vergul jimgina yiqilsa kesim
    // yo'qotishi aynan shunday yo'qolardi.
    expect(parse('250,5').whole).toEqual([{ length: '250.5', count: 1 }]);
    expect(parse('?:12,25').pieces).toEqual([{ label: null, length: '12.25' }]);
  });

  it('ajratgich atrofidagi bo`shliqlar va `×` / `*` belgilari qabul qilinadi', () => {
    expect(parse(' 250 × 3 + ?: 150 ').total).toBe('900');
    expect(parse('250*2').total).toBe('500');
  });

  it('yorliq katta-kichik harf farqsiz (skaner turlicha yuboradi)', () => {
    expect(parse('blk-000041:200').pieces[0]?.label).toBe('BLK-000041');
  });

  it('bo`sh matn → `empty`', () => {
    expect(parsePieceEntry('').error).toBe('empty');
    expect(parsePieceEntry(null).error).toBe('empty');
    expect(parsePieceEntry('  ').error).toBe('empty');
  });

  it('🔴 xato JIMGINA yutilmaydi — kod va guruh raqami bilan qaytadi', () => {
    // K4 `parsePieceLengths` yaroqsiz qismni jimgina tashlab ketardi; bu yerda
    // esa Σ miqdorga TENG bo'lishi shart, ya'ni tushib qolgan guruh jimgina
    // noto'g'ri qoldiqqa olib borardi.
    const r = parsePieceEntry('250+abc+70');
    expect(r.entry).toBeUndefined();
    expect(r.error).toBe('bad-length');
    expect(r.groupIndex).toBe(2);
  });

  it('yorliq `BLK-` makonidan tashqarida → `bad-label` (7.3)', () => {
    const r = parsePieceEntry('4780123456789:200');
    expect(r.error).toBe('bad-label');
  });

  it('bir yorliq ikki marta → `duplicate-label` (jismonan mumkin emas)', () => {
    expect(parsePieceEntry('BLK-000041:200+BLK-000041:50').error).toBe('duplicate-label');
  });

  it('1 m dan kalta → `scrap-length` (K-Q6), ikkala shaklda ham', () => {
    expect(parsePieceEntry('0.4').error).toBe('scrap-length');
    expect(parsePieceEntry('?:0.9').error).toBe('scrap-length');
    // Aynan 1 m — CHIQINDI EMAS (inklyuziv chegara, K2 bilan bir xil).
    expect(parse('1').total).toBe('1');
  });

  it('rulonlar soni butun va 1..200 oralig`ida', () => {
    expect(parsePieceEntry('250x0').error).toBe('bad-count');
    expect(parsePieceEntry('250x2.5').error).toBe('bad-count');
    expect(parsePieceEntry(`250x${MAX_WHOLE_COUNT + 1}`).error).toBe('bad-count');
    expect(parse(`250x${MAX_WHOLE_COUNT}`).pieceCount).toBe(MAX_WHOLE_COUNT);
  });

  it('guruh va bo`lak chegaralari', () => {
    const many = Array.from({ length: MAX_INTAKE_GROUPS + 1 }, () => '10').join('+');
    expect(parsePieceEntry(many).error).toBe('too-many-groups');
    // 3 × 200 = 600 > 500 ⇒ ikkinchi guruhda chegara oshadi.
    expect(parsePieceEntry('10x200+20x200+30x200').error).toBe('too-many-pieces');
    expect(MAX_INTAKE_PIECES).toBe(500);
  });

  it('manfiy va nol RAD etiladi', () => {
    expect(parsePieceEntry('-5').error).toBe('bad-length');
    expect(parsePieceEntry('0').error).toBe('bad-length');
    expect(parsePieceEntry('?:0').error).toBe('bad-length');
  });

  it('har xato kodining O`ZBEKCHA matni bor (bo`sh emas)', () => {
    const codes = [
      'empty',
      'bad-group',
      'bad-length',
      'bad-count',
      'bad-label',
      'duplicate-label',
      'scrap-length',
      'too-many-groups',
      'too-many-pieces',
    ] as const;
    for (const c of codes) expect(intakeErrorMessage(c, 2).length).toBeGreaterThan(5);
    expect(intakeErrorMessage('bad-length', 2)).toContain('2-guruh');
    expect(intakeErrorMessage('bad-length')).not.toContain('guruh');
  });
});

// ---------------------------------------------------------------------------
describe('K5 — kanonik matnga qaytarish', () => {
  it('parse → format → parse aylanishi barqaror', () => {
    const raw = '250x3+BLK-000041:200+?:150';
    const e = parse(raw);
    expect(formatPieceEntry(e)).toBe(raw);
    expect(parse(formatPieceEntry(e)).total).toBe(e.total);
  });

  it('bitta rulon `x1` siz yoziladi', () => {
    expect(formatPieceEntry({ whole: [{ length: '250', count: 1 }], pieces: [] })).toBe('250');
  });
});

// ---------------------------------------------------------------------------
describe('K5 — miqdor bilan mosligi', () => {
  it('teng / kam / ortiq', () => {
    expect(matchQuantity('1220', '1220')).toBe('exact');
    expect(matchQuantity('1220', '1250')).toBe('short');
    expect(matchQuantity('1250', '1220')).toBe('over');
  });

  it('kasrli tenglik float xatosisiz', () => {
    expect(matchQuantity('0.1', '0.10')).toBe('exact');
    expect(matchQuantity('250.5', '250.500000')).toBe('exact');
  });
});

// ---------------------------------------------------------------------------
describe('K5/1 — SANASH rejasi (mutlaq, lekin o`zgarish minimal)', () => {
  const existing = [
    { id: 'w1', length: '250', whole: true, label: null },
    { id: 'w2', length: '250', whole: true, label: null },
    { id: 'p1', length: '200', whole: false, label: 'BLK-000041' },
    { id: 'p2', length: '150', whole: false, label: 'BLK-000042' },
  ];

  it('🔴 hech nima o`zgarmagan sanoq — HAMMASI `keep`, YORLIQ BOSILMAYDI', () => {
    const plan = planRecount({
      existing,
      entry: parse('250x2+BLK-000041:200+BLK-000042:150'),
      startSeq: 100,
    });
    expect(plan.keep).toHaveLength(4);
    expect(plan.create).toEqual([]);
    expect(plan.close).toEqual([]);
    expect(plan.adjust).toEqual([]);
    expect(plan.labels).toEqual([]);
  });

  it('uzunlik tuzatildi — MAVJUD qator o`zgaradi, yorliq RAQAMI saqlanadi', () => {
    const plan = planRecount({
      existing,
      entry: parse('250x2+BLK-000041:180+BLK-000042:150'),
      startSeq: 100,
    });
    expect(plan.adjust).toEqual([
      { id: 'p1', length: '180', previousLength: '200', label: 'BLK-000041' },
    ]);
    expect(plan.create).toEqual([]);
    // Yorliqda ESKI uzunlik yozilgan ⇒ qayta bosiladi (reja 5-bo'lim).
    expect(plan.labels).toEqual(['BLK-000041']);
  });

  it('sanashda uchramagan bo`lak — `close` (reyestrdan chiqadi)', () => {
    const plan = planRecount({
      existing,
      entry: parse('250x2+BLK-000041:200'),
      startSeq: 100,
    });
    expect(plan.close).toEqual(['p2']);
    expect(plan.keep).toContain('p1');
  });

  it('yangi bo`lak «?» — yangi qator + ketma-ket yangi yorliq', () => {
    const plan = planRecount({
      existing,
      entry: parse('250x2+BLK-000041:200+BLK-000042:150+?:70+?:50'),
      startSeq: 100,
    });
    expect(plan.create).toEqual([
      { length: '70', whole: false, label: 'BLK-000100' },
      { length: '50', whole: false, label: 'BLK-000101' },
    ]);
    expect(plan.labels).toEqual(['BLK-000100', 'BLK-000101']);
  });

  it('butun rulonlar ALMASHTIRILADIGAN: kami yaratiladi, ortig`i yopiladi', () => {
    const three = planRecount({
      existing,
      entry: parse('250x3+BLK-000041:200+BLK-000042:150'),
      startSeq: 100,
    });
    expect(three.create).toEqual([{ length: '250', whole: true, label: null }]);
    expect(three.close).toEqual([]);

    const one = planRecount({
      existing,
      entry: parse('250+BLK-000041:200+BLK-000042:150'),
      startSeq: 100,
    });
    expect(one.close).toEqual(['w2']);
    expect(one.keep).toContain('w1');
  });

  it('boshqa uzunlikdagi rulon eskisini almashtirmaydi (200x1 ≠ 250x1)', () => {
    const plan = planRecount({
      existing: [{ id: 'w1', length: '250', whole: true, label: null }],
      entry: parse('200'),
      startSeq: 100,
    });
    expect(plan.create).toEqual([{ length: '200', whole: true, label: null }]);
    expect(plan.close).toEqual(['w1']);
  });

  it('🔴 tanilmagan yorliq sanoqni RAD ETMAYDI — yangi qator + OGOHLANTIRISH', () => {
    // Omborchi javonda ko'rib turibdi: bo'lak boshqa yacheykadan ko'chgan yoki
    // reyestrdan tushib qolgan. Sanoqni to'xtatish savdoni to'xtatardi; jim
    // qabul qilish esa IS-5 («nosozlik signali yo'q») bo'lardi.
    const plan = planRecount({
      existing: [],
      entry: parse('BLK-999999:70'),
      startSeq: 100,
    });
    expect(plan.unknownLabels).toEqual(['BLK-999999']);
    expect(plan.create).toEqual([{ length: '70', whole: false, label: 'BLK-000100' }]);
  });

  it('bo`sh yacheyka sanaldi — hamma mavjud qator yopiladi', () => {
    // «Javonda hech narsa yo'q» ham sanoq natijasi. Bu yerda tarkib bo'sh
    // bo'lolmaydi (parse `empty` beradi), shuning uchun oqim `actualQty = 0`
    // va tarkibsiz qatordan o'tadi — reyestr o'sha holicha qoladi. Bu test
    // FAQAT rejaning o'zi bo'sh kiritishda nima qilishini qulflaydi.
    const plan = planRecount({
      existing,
      entry: { whole: [], pieces: [], total: '0', pieceCount: 0 },
      startSeq: 100,
    });
    expect(plan.close).toHaveLength(4);
    expect(plan.create).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
describe('K5/2 — PRIYOMKA rejasi', () => {
  it('«250x5» → 5 ta YORLIQSIZ butun rulon (K-Q3)', () => {
    const plan = planSupplyIntake(parse('250x5'));
    expect(plan.create).toHaveLength(5);
    expect(plan.create?.every((r) => r.whole && r.label === null)).toBe(true);
  });

  it('turli uzunliklar: «250x2+180x1»', () => {
    const plan = planSupplyIntake(parse('250x2+180'));
    expect(plan.create?.map((r) => r.length)).toEqual(['250', '250', '180']);
  });

  it('🔴 BO`LAK rad etiladi — priyomkada yorliq bosish oqimi yo`q', () => {
    expect(planSupplyIntake(parse('250x2+?:180')).error).toBe('pieces-not-allowed');
    expect(planSupplyIntake(parse('BLK-000041:180')).error).toBe('pieces-not-allowed');
  });
});

// ---------------------------------------------------------------------------
describe('K5/3 — VOZVRAT rejasi', () => {
  const sold = [{ id: 'p1', label: 'BLK-000041', status: 'consumed', length: '180' }];

  it('🔴 yorlig`i tanilgan bo`lak AYNAN o`sha qator bilan tiklanadi', () => {
    // Yangi qator ochilsa mijozdagi yorliq raqami tizimdagi BOSHQA qatorga
    // ishora qilib qolardi va skaner noto'g'ri bo'lakni ochardi (7.3).
    const plan = planPieceReturn({ entry: parse('BLK-000041:180'), found: sold, startSeq: 100 });
    expect(plan.restore).toEqual([
      { id: 'p1', length: '180', label: 'BLK-000041', previousLength: '180' },
    ]);
    expect(plan.create).toEqual([]);
    // Uzunlik o'zgarmagan ⇒ mijozdagi yorliq hamon to'g'ri, qayta bosilmaydi.
    expect(plan.labels).toEqual([]);
  });

  it('uzunligi o`zgargan bo`lsa tiklanadi VA yorliq qayta bosiladi', () => {
    const plan = planPieceReturn({ entry: parse('BLK-000041:150'), found: sold, startSeq: 100 });
    expect(plan.restore[0]?.length).toBe('150');
    expect(plan.restore[0]?.previousLength).toBe('180');
    expect(plan.labels).toEqual(['BLK-000041']);
  });

  it('yorliqsiz qaytdi — yangi qator + yangi yorliq', () => {
    const plan = planPieceReturn({ entry: parse('?:180'), found: [], startSeq: 100 });
    expect(plan.create).toEqual([{ length: '180', whole: false, label: 'BLK-000100' }]);
    expect(plan.labels).toEqual(['BLK-000100']);
  });

  it('reyestrda umuman yo`q yorliq — yangi qator (eski raqam tiklanmaydi)', () => {
    const plan = planPieceReturn({ entry: parse('BLK-999999:180'), found: [], startSeq: 100 });
    expect(plan.restore).toEqual([]);
    expect(plan.create).toEqual([{ length: '180', whole: false, label: 'BLK-000100' }]);
  });

  it('🔴 allaqachon FAOL yorliq QAYTARILMAYDI (ikki hisoblash oldini olish)', () => {
    const plan = planPieceReturn({
      entry: parse('BLK-000041:180'),
      found: [{ id: 'p1', label: 'BLK-000041', status: 'active', length: '180' }],
      startSeq: 100,
    });
    expect(plan.alreadyActive).toEqual(['BLK-000041']);
    expect(plan.restore).toEqual([]);
    expect(plan.create).toEqual([]);
  });

  it('butun rulon qaytdi — BUTUN rulon bo`lib qaytadi (yorliqsiz)', () => {
    const plan = planPieceReturn({ entry: parse('250x2'), found: [], startSeq: 100 });
    expect(plan.create).toEqual([
      { length: '250', whole: true, label: null },
      { length: '250', whole: true, label: null },
    ]);
    expect(plan.labels).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
describe('K5 — sabab lug`ati', () => {
  it('`recount` sababi qo`shildi va K4 ning sabablari joyida', () => {
    // Migratsiyadagi CHECK bilan AYNI ro'yxat bo'lishi shart.
    expect(PIECE_CONSUMED_REASON.recount).toBe('recount');
    expect(Object.values(PIECE_CONSUMED_REASON)).toEqual([
      'sold',
      'scrap',
      'cut-loss',
      'closed',
      'recount',
    ]);
  });
});
