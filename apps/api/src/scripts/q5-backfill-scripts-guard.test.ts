import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Q5 — BACKFILL va TESKARI skriptlarining KOD-SHAKL qo'riqchisi.
 * Reja: `docs/plans/2026-08-25-kassa-qarzi-undirish-reyestri.md` §Q5.
 *
 * Bu skriptlar JONLI ma'lumotga yozadi va ularni birlik testi bilan
 * «yugurtirib» bo'lmaydi (baza kerak, qoida 7 bo'yicha lokal dev bazada
 * sinaladi). Lekin ULARNING SHAKLI — nima YOZMASLIGI — testda qulflanishi
 * SHART: aynan shu joyda bitta noto'g'ri qator mijozlarning saldosini
 * buzardi.
 *
 * Uslub: `foreign-cash-desk-guard.test.ts` / Q2 ning kod-shakl testlari —
 * fayl matni SKANERLANADI. Izohlar olib tashlanadi, ya'ni «izohda yozilgan»
 * narsa testni qondirmaydi.
 */

const HERE = import.meta.dirname;
const BACKFILL = readFileSync(join(HERE, 'ops-q5-backfill-sale-debts.ts'), 'utf8');
const ROLLBACK = readFileSync(join(HERE, 'ops-q5-backfill-rollback.ts'), 'utf8');

/** Izohsiz kod — «izohda aytilgan» narsa dalil bo'lmasin. */
function codeOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const BACKFILL_CODE = codeOnly(BACKFILL);
const ROLLBACK_CODE = codeOnly(ROLLBACK);

describe('Q5 backfill — invariant 1: BALANSGA TEGMAYDI', () => {
  it('🔴 `applyDelta` CHAQIRILMAYDI', () => {
    expect(BACKFILL_CODE).not.toContain('applyDelta');
  });

  it('🔴 `counterpartyBalance` ga YOZILMAYDI (faqat o`qiladi)', () => {
    expect(BACKFILL_CODE).not.toMatch(/counterpartyBalance\.(create|update|upsert|delete)/);
    expect(BACKFILL_CODE).toContain('counterpartyBalance.findMany');
  });

  it('qator HAR DOIM `balanceAdopted: true` — recompute filtri uni chiqarib tashlaydi', () => {
    expect(BACKFILL_CODE).toContain('balanceAdopted: true');
    expect(BACKFILL_CODE).not.toContain('balanceAdopted: false');
  });
});

describe('Q5 backfill — shakl Q2 yozuvchisi bilan bir xil', () => {
  it('manba ustunlari yoziladi (Q4 filtri va Q3 manzili shundan)', () => {
    expect(BACKFILL_CODE).toContain('sourceDocType: SALE_DEBT_SOURCE_DOC_TYPE');
    expect(BACKFILL_CODE).toContain('sourceDocId: row.saleId');
  });

  it('🔴 `createMany({ skipDuplicates })` — `create` + `P2002` EMAS (Q2 sabog`i)', () => {
    expect(BACKFILL_CODE).toContain('skipDuplicates: true');
    expect(BACKFILL_CODE).not.toMatch(/tx\.debt\.create\(/);
  });

  it('raqam `allocateDocumentNumber` orqali (race-safe), qo`lda emas', () => {
    expect(BACKFILL_CODE).toContain('allocateDocumentNumber(tx, accountId, prefix');
  });

  it('`DebtNote` (`kind:debt_issue`) yoziladi — qator qayerdan kelgani', () => {
    expect(BACKFILL_CODE).toContain('debtNote.create');
    expect(BACKFILL_CODE).toContain("kind: 'debt_issue'");
  });

  it('reja §Q5: `problem:false`, `ownerId:null` (javobgar keyin qo`yiladi)', () => {
    expect(BACKFILL_CODE).toContain('problem: false');
    expect(BACKFILL_CODE).toContain('ownerId: null');
  });

  it('valyuta reyestrniki — USD chek chetlab o`tiladi (§2.3, Q2 bilan bir xil)', () => {
    expect(BACKFILL_CODE).toContain('currency: DEBT_LEDGER_CURRENCY');
  });
});

describe('Q5 backfill — xavfsizlik', () => {
  it('🔴 DRY-RUN default: `APPLY=1` bo`lmasa yozuv yo`li ochilmaydi', () => {
    expect(BACKFILL_CODE).toContain("const APPLY = process.env.APPLY === '1';");
    expect(BACKFILL_CODE).toMatch(/if \(!APPLY\)\s*\{[\s\S]*?return;/);
  });

  it('bosqichma-bosqich yuritish argumentlari bor (reja §Q5 vazifa 2)', () => {
    expect(BACKFILL_CODE).toContain('process.env.LIMIT');
    expect(BACKFILL_CODE).toContain('process.env.ONLY_CP');
  });

  it('🔴 Q1 migratsiyasi tekshiriladi — ustunsiz bazada tushunarli xato', () => {
    expect(BACKFILL_CODE).toContain('information_schema.columns');
    expect(BACKFILL_CODE).toContain('await preflight();');
  });

  it('mijozi aniqlanmagan chek skriptni TO`XTATADI (jimgina o`tmaydi)', () => {
    expect(BACKFILL_CODE).toMatch(/orphans\.length > 0[\s\S]*?throw new Error/);
  });

  it('🔴 qarzdor audit HODISASIDAN o`qiladi, chek qatoridan EMAS', () => {
    // `RetailSale.agentId` faqat ZAXIRA yo'l — recompute skripti bilan bir xil
    // qoida. Aks holda backfill qarzni BOSHQA mijozga ochib qo'yardi.
    expect(BACKFILL_CODE).toContain('CASHIER_EVENT.soldOnCredit');
    expect(BACKFILL_CODE).toContain('agents.get(l.saleId) ?? l.sale.agentId');
  });

  it('qaytarilgan ulush ayiriladi (qaytarilgan tovar uchun pul so`ralmaydi)', () => {
    expect(BACKFILL_CODE).toContain('debtReturnMinor');
    expect(BACKFILL_CODE).toContain('debtReturnedMinor: returned.get(r.saleId) ?? 0n');
  });

  it('🔴 muddat `now` dan — chek sanasidan EMAS (eslatma «portlashi»)', () => {
    // Sof modul `saleDebtDueAt(opts.now, …)` dan yuradi; skript faqat `now`
    // beradi va chekning `postedAt` ini muddat uchun ISHLATMAYDI.
    expect(BACKFILL_CODE).toContain('const now = new Date();');
    expect(BACKFILL_CODE).not.toMatch(/nextContactAt:\s*.*postedAt/);
  });
});

describe('Q5 teskari skript — qoida 12', () => {
  it('mavjud va backfill uni hisobotda ko`rsatadi', () => {
    expect(ROLLBACK.length).toBeGreaterThan(0);
    expect(BACKFILL).toContain('ops-q5-backfill-rollback.ts');
  });

  it('🔴 belgi bo`yicha topadi — Q2 ning JONLI qatorlariga tegmaydi', () => {
    expect(ROLLBACK_CODE).toContain('q5BackfillMarker');
    expect(ROLLBACK_CODE).toContain('sourceDocType: SALE_DEBT_SOURCE_DOC_TYPE');
    expect(ROLLBACK_CODE).toContain('startsWith: marker');
  });

  it('🔴 `deleteMany` — soft-delete EMAS (unique indeks band qolib ketardi)', () => {
    expect(ROLLBACK_CODE).toContain('tx.debt.deleteMany');
    expect(ROLLBACK_CODE).not.toMatch(/deletedAt:\s*new Date/);
  });

  it('🔴 izohlar QARZDAN OLDIN o`chiriladi (FK tartibi)', () => {
    const notesAt = ROLLBACK_CODE.indexOf('tx.debtNote.deleteMany');
    const debtsAt = ROLLBACK_CODE.indexOf('tx.debt.deleteMany');
    expect(notesAt).toBeGreaterThan(-1);
    expect(debtsAt).toBeGreaterThan(notesAt);
  });

  it('🔴 `applyDelta` CHAQIRILMAYDI — balanceAdopted simmetriyasi', () => {
    expect(ROLLBACK_CODE).not.toContain('applyDelta');
  });

  it('🔴 TO`LOV tushgan qator O`CHIRILMAYDI', () => {
    expect(ROLLBACK_CODE).toContain('d.paidMinor > 0n');
    expect(ROLLBACK_CODE).toContain('d._count.payments > 0');
    expect(ROLLBACK_CODE).toMatch(/kept\.push/);
  });

  it('DRY-RUN default va `RUN` siz ommaviy o`chirish TAQIQ', () => {
    expect(ROLLBACK_CODE).toContain("const APPLY = process.env.APPLY === '1';");
    expect(ROLLBACK_CODE).toMatch(/if \(!RUN_ID && !ALL_RUNS\)[\s\S]*?throw new Error/);
  });
});
