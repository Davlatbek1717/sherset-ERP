import { describe, expect, it } from 'vitest';
import {
  COMMENT_TEMPLATE_KIND,
  type CommentTemplate,
  MAX_COMMENT_LENGTH,
  materializeComment,
  suggestTemplates,
  templateKindForAction,
} from './comment-templates.js';

/**
 * MK20 — SHABLON IZOHLAR, sof qoidalar.
 *
 * Bu modulda I/O yo'q: jurnalga NIMA yozilishi va menejerga QAYSI shablon
 * taklif qilinishi shu yerda hal qilinadi. Test aynan ikki xavfni qulflaydi:
 *
 *   1. **Havola emas, MATN.** Shablon tanlansa jurnalga uning matni NUSXA
 *      bo'lib tushadi. Havola saqlansa, menejer ertaga shablonni tahrirlaganda
 *      kechagi qaror boshqacha o'qilardi — tarix jimgina o'zgarardi.
 *   2. **Majburlamaydi.** Shablon — taklif: tahrirlangan matn ham, shablonsiz
 *      erkin izoh ham, umuman izohsiz amal ham qabul qilinadi.
 */

function tpl(over: Partial<CommentTemplate> = {}): CommentTemplate {
  return {
    id: over.id ?? 'tpl-1',
    kind: over.kind ?? COMMENT_TEMPLATE_KIND.rejection,
    locale: over.locale ?? 'uz',
    title: over.title ?? 'Dublikat',
    body: over.body ?? 'Bu element dublikat — hodisa allaqachon ko`rilgan.',
    ruleTypes: over.ruleTypes ?? [],
    actions: over.actions ?? [],
    sortOrder: over.sortOrder ?? 0,
    usageCount: over.usageCount ?? 0,
    archivedAt: over.archivedAt ?? null,
  };
}

// ── 1. Jurnalga MATN ko'chiriladi ───────────────────────────────────────────

describe('materializeComment — jurnalga matn ko`chiriladi, havola emas', () => {
  it('shablon tanlansa jurnal matni = shablon TANASI (to`liq)', () => {
    const t = tpl({ body: 'Narx raqobatchiga qarab tushirilgan, chegirma tasdiqlangan.' });
    expect(materializeComment({ template: t })).toBe(t.body);
  });

  it('materiallashgan matn shablondan UZILGAN — keyin shablon o`zgarsa tarix o`zgarmaydi', () => {
    const t = tpl({ body: 'Birinchi tahrir' });
    const written = materializeComment({ template: t });

    // Menejer ertaga shablonni tahrirladi (havola saqlangan bo'lsa jurnal ham
    // o'zgarardi — aynan shu qulflanadi).
    const edited = { ...t, body: 'Ikkinchi tahrir' };
    expect(materializeComment({ template: edited })).toBe('Ikkinchi tahrir');
    expect(written).toBe('Birinchi tahrir');
  });

  it('natija ID ni O`ZIDA SAQLAMAYDI — matnda shablon identifikatori yo`q', () => {
    const t = tpl({ id: 'b3f0c1de-0000-4000-8000-000000000001', body: 'Ogohlantirish yozildi.' });
    const written = materializeComment({ template: t }) ?? '';
    expect(written.includes(t.id)).toBe(false);
    expect(written).toBe(t.body);
  });
});

// ── 2. Shablon MAJBURLAMAYDI ────────────────────────────────────────────────

describe('materializeComment — shablon majburlamaydi', () => {
  it('shablonsiz erkin izoh qabul qilinadi', () => {
    expect(materializeComment({ comment: 'O`zim yozgan izoh' })).toBe('O`zim yozgan izoh');
  });

  it('tahrirlangan matn shablon tanasidan USTUN', () => {
    const t = tpl({ body: 'Standart matn' });
    expect(materializeComment({ template: t, comment: 'Standart matn + qo`shimcha' })).toBe(
      'Standart matn + qo`shimcha',
    );
  });

  it('izoh ham, shablon ham yo`q — `null` (amal baribir o`tadi)', () => {
    expect(materializeComment({})).toBeNull();
    expect(materializeComment({ comment: '   ' })).toBeNull();
  });

  it('bo`sh izoh + shablon = shablon tanasi (bo`shliq tanlovni bekor qilmaydi)', () => {
    const t = tpl({ body: 'Shablon matni' });
    expect(materializeComment({ template: t, comment: '   ' })).toBe('Shablon matni');
  });

  it('matn kesiladi (chetdagi bo`shliq jurnalga tushmaydi)', () => {
    expect(materializeComment({ comment: '  izoh  ' })).toBe('izoh');
  });

  it('juda uzun matn KESILADI, jimgina yo`qolmaydi', () => {
    const long = 'a'.repeat(MAX_COMMENT_LENGTH + 500);
    const written = materializeComment({ comment: long }) ?? '';
    expect(written.length).toBe(MAX_COMMENT_LENGTH);
  });
});

// ── 3. Amal → shablon turi ──────────────────────────────────────────────────

describe('templateKindForAction — amal qaysi turga tegishli', () => {
  it('rad etish: navbatdagi `dismiss` va kun qabulidagi `reject`', () => {
    expect(templateKindForAction('dismiss')).toBe(COMMENT_TEMPLATE_KIND.rejection);
    expect(templateKindForAction('reject')).toBe(COMMENT_TEMPLATE_KIND.rejection);
  });

  it('tuzatma: tushuntirish/tuzatish amallari', () => {
    expect(templateKindForAction('request_explanation')).toBe(COMMENT_TEMPLATE_KIND.correction);
    expect(templateKindForAction('explain')).toBe(COMMENT_TEMPLATE_KIND.correction);
    expect(templateKindForAction('adjust')).toBe(COMMENT_TEMPLATE_KIND.correction);
  });

  it('ogohlantirish: jarima va ogohlantirish', () => {
    expect(templateKindForAction('record_fine')).toBe(COMMENT_TEMPLATE_KIND.warning);
    expect(templateKindForAction('write_warning')).toBe(COMMENT_TEMPLATE_KIND.warning);
  });

  it('uchta turdan biriga TUSHMAGAN amal uchun tur TO`QILMAYDI', () => {
    // `escalate` — egaga uzatish, xodimga ogohlantirish EMAS; `acknowledge` —
    // «hammasi o'rinli». Ularga soxta tur berilsa menejer noto'g'ri shablonlar
    // ro'yxatini ko'rardi.
    expect(templateKindForAction('escalate')).toBeNull();
    expect(templateKindForAction('acknowledge')).toBeNull();
    expect(templateKindForAction('accept')).toBeNull();
    expect(templateKindForAction('reopen')).toBeNull();
    expect(templateKindForAction('nomalum_amal')).toBeNull();
  });
});

// ── 4. Kontekst bo'yicha taklif ─────────────────────────────────────────────

describe('suggestTemplates — kontekst bo`yicha taklif', () => {
  it('amal turiga MOS shablonlar qaytadi, boshqasi emas', () => {
    const list = [
      tpl({ id: 'r', kind: COMMENT_TEMPLATE_KIND.rejection }),
      tpl({ id: 'w', kind: COMMENT_TEMPLATE_KIND.warning }),
      tpl({ id: 'c', kind: COMMENT_TEMPLATE_KIND.correction }),
    ];
    expect(suggestTemplates(list, { action: 'dismiss' }).map((x) => x.id)).toEqual(['r']);
    expect(suggestTemplates(list, { action: 'record_fine' }).map((x) => x.id)).toEqual(['w']);
  });

  it('OSHKORA `actions` ro`yxati tur xaritasidan USTUN', () => {
    // Menejer «ogohlantirish» shablonini eskalatsiyaga ham biriktirishi mumkin.
    const list = [
      tpl({ id: 'esc', kind: COMMENT_TEMPLATE_KIND.warning, actions: ['escalate'] }),
      tpl({ id: 'gen', kind: COMMENT_TEMPLATE_KIND.warning }),
    ];
    expect(suggestTemplates(list, { action: 'escalate' }).map((x) => x.id)).toEqual(['esc']);
  });

  it('`ruleTypes` bo`sh = HAMMA qoidaga, to`ldirilgan = faqat o`shalarga', () => {
    const list = [
      tpl({ id: 'any' }),
      tpl({ id: 'debt', ruleTypes: ['BIG_DEBT'] }),
      tpl({ id: 'late', ruleTypes: ['LATE'] }),
    ];
    const ids = suggestTemplates(list, { action: 'dismiss', ruleType: 'BIG_DEBT' }).map(
      (x) => x.id,
    );
    expect(ids).toContain('any');
    expect(ids).toContain('debt');
    expect(ids).not.toContain('late');
  });

  it('ANIQROQ shablon tepada: qoidaga biriktirilgani umumiydan oldin', () => {
    const list = [
      tpl({ id: 'any', title: 'Umumiy' }),
      tpl({ id: 'debt', title: 'Qarz', ruleTypes: ['BIG_DEBT'] }),
    ];
    expect(suggestTemplates(list, { action: 'dismiss', ruleType: 'BIG_DEBT' })[0]?.id).toBe('debt');
  });

  it('ARXIVLANGAN shablon hech qachon taklif qilinmaydi', () => {
    const list = [tpl({ id: 'live' }), tpl({ id: 'dead', archivedAt: new Date('2026-08-01') })];
    expect(suggestTemplates(list, { action: 'dismiss' }).map((x) => x.id)).toEqual(['live']);
  });

  it('til so`ralsa o`sha tildagilar tepada, lekin boshqasi YO`QOLMAYDI', () => {
    // Menejer ru shablonini uz interfeysda ham ishlatishi mumkin — matn uniki,
    // tanlash huquqi ham uniki. Filtr qattiq bo'lsa ro'yxat bo'shab qolardi.
    const list = [tpl({ id: 'ru', locale: 'ru' }), tpl({ id: 'uz', locale: 'uz' })];
    expect(suggestTemplates(list, { action: 'dismiss', locale: 'ru' }).map((x) => x.id)).toEqual([
      'ru',
      'uz',
    ]);
  });

  it('teng shartlarda: `sortOrder`, keyin ishlatilish soni, keyin sarlavha', () => {
    const list = [
      tpl({ id: 'b', title: 'B', sortOrder: 0, usageCount: 1 }),
      tpl({ id: 'a', title: 'A', sortOrder: 0, usageCount: 1 }),
      tpl({ id: 'top', title: 'Z', sortOrder: 0, usageCount: 9 }),
      tpl({ id: 'first', title: 'Y', sortOrder: -1, usageCount: 0 }),
    ];
    expect(suggestTemplates(list, { action: 'dismiss' }).map((x) => x.id)).toEqual([
      'first',
      'top',
      'a',
      'b',
    ]);
  });

  it('amal berilmasa — arxivlanmagan hammasi (sozlamalar ekrani)', () => {
    const list = [
      tpl({ id: 'r', kind: COMMENT_TEMPLATE_KIND.rejection }),
      tpl({ id: 'w', kind: COMMENT_TEMPLATE_KIND.warning }),
      tpl({ id: 'x', archivedAt: new Date() }),
    ];
    expect(
      suggestTemplates(list, {})
        .map((x) => x.id)
        .sort(),
    ).toEqual(['r', 'w']);
  });

  it('turi yo`q amalda (masalan `acknowledge`) faqat OSHKORA biriktirilgani chiqadi', () => {
    const list = [tpl({ id: 'gen' }), tpl({ id: 'ack', actions: ['acknowledge'] })];
    expect(suggestTemplates(list, { action: 'acknowledge' }).map((x) => x.id)).toEqual(['ack']);
  });
});
