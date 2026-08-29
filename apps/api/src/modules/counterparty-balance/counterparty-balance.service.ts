import type { Prisma } from '@moysklad/db';
import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  type CounterpartyBalanceChangeSource,
  type CounterpartyBalanceChangedEvent,
  HR_EVENT,
} from '../hr/hr-shared/hr-events.types.js';
import type { ApplyDeltaDocType } from './counterparty-balance-doc-types.js';

/**
 * Per-call metadata: WHICH document moved the balance, and under WHICH
 * organization. applyDelta itself has no knowledge of the source — every caller
 * passes it.
 *
 * Faza 9 (audit DUP-15/M-07) — `docType`/`docId`/`organizationId` MAJBURIY
 * bo'ldi. Sabab: ular endi faqat domen-hodisa uchun emas, append-only
 * `CounterpartyBalanceEntry` jurnaliga yoziladi va o'sha jurnal balans-o'quvchilar
 * (metrics byOrg, statement, akt-sverka, recompute-skript) uchun YAGONA manba.
 * Ilgari optional edi va aynan shu sababli barcha unpost/cancel yo'llari meta'siz
 * chaqirardi — jurnal yozuvining yarmi hujjat-identifikatorsiz qolar edi. Majburiy
 * qilingani = compile-time qo'riqchi: yangi applyDelta-yozuvchi meta'ni unutolmaydi
 * (`DUP-02` klassidagi «qamralmagan manba» bug'i takrorlanmaydi).
 *
 * `organizationId: null` — ATAYLAB tanlov, unutish emas: `Debt` modelida
 * organizatsiya o'lchovi yo'q, `RetailSale.organizationId` optional. Null qiymat
 * org-kesimda «taqsimlanmagan» qatoriga tushadi.
 *
 * `source` optional qoladi — u faqat HR owner-debt notifikatori uchun
 * (`source: undefined` → notifier no-op qiladi), jurnalga yozilmaydi.
 */
export interface ApplyDeltaMeta {
  source?: CounterpartyBalanceChangeSource;
  /**
   * Faza 10: `string` EMAS, `counterparty-balance-doc-types.ts` reyestrining
   * union'i. Bu — nomlar bo'yicha compile-time qulf: `'debtPayment'` va
   * `'debtpayment'` kabi bir harfli farq jimgina yangi tur yaratib, jurnal
   * qatorlarini ikkiga bo'lib yuborardi (o'quvchilar docType bo'yicha
   * guruhlaydi). `opening` bu unionda ATAYLAB yo'q — u faqat backfill
   * skriptining texnik turi, servis uni tanlay olmasligi kerak.
   */
  docType: ApplyDeltaDocType;
  docId: string;
  organizationId: string | null;
  /**
   * XABAR REJIMI (2026-08-28). Jurnalga TEGMAYDI — faqat domen-hodisasiga
   * (`COUNTERPARTY_BALANCE_CHANGED`, ya'ni mijoz/egaga ketadigan xabarga).
   *
   *   `'each'` (sukut) — har `applyDelta` o'z hodisasini chiqaradi;
   *   `'defer'`        — bu delta KATTAROQ hujjatning BO'LAGI. Hodisa shu
   *                      yerda chiqarilmaydi; chaqiruvchi hujjat COMMIT
   *                      bo'lgach `emitDocumentNotice` bilan BITTA yig'ma
   *                      hodisa beradi.
   *
   * NEGA KERAK (prodda o'lchangan, 2026-08-28): POS qarz to'lovi FIFO bo'yicha
   * N qarzga bo'linadi va HAR BO'LAK alohida `applyDelta` chaqiradi. Mijozga
   * ketadigan xabar esa BIRINCHI bo'lakning summasini va O'RTADAGI balansni
   * olardi — 2 616 000 to'lagan mijoz «qabul qilindi: 1 572 000 · qolgan
   * qarz: 1 044 000» degan YOLG'ON xabar olardi (haqiqatda qarzi 0 edi).
   *
   * 🔴 Bo'laklarni jurnalda QO'SHIB yuborish YECHIM EMAS: har qarz o'z
   * jurnal qatorini olishi SHART (`recalcDebt` → qarz kesimidagi delta,
   * akt-sverka va hisobotlar shundan yuriladi). Shuning uchun ajratiladigan
   * narsa — JURNAL emas, XABAR.
   */
  notice?: 'each' | 'defer';
}

/**
 * Sign convention mirrors moysklad.uz's "Баланс":
 *   positive → counterparty OWES us   (they're a debtor)
 *   negative → we OWE the counterparty (we're a debtor)
 *
 * Document semantics (what each post does to the balance):
 *   - InvoiceOut.post   → +sumMinor  (we billed them; they owe us)
 *   - InvoiceIn.post    → −sumMinor  (they billed us; we owe them)
 *   - PaymentIn.post    → −sumMinor  (they paid us; debt shrinks)
 *   - PaymentOut.post   → +sumMinor  (we paid them; our debt shrinks)
 *   - CashIn.post       → −sumMinor  (cash from counterparty ~ PaymentIn)
 *   - CashOut.post      → +sumMinor  (cash to counterparty ~ PaymentOut)
 *   - Unpost / cancel reverse the sign of the delta that was applied.
 *
 * Callers pass the PRE-SIGNED delta; this service just applies it.
 */
@Injectable()
export class CounterpartyBalanceService {
  private readonly logger = new Logger(CounterpartyBalanceService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventEmitter2) private readonly events: EventEmitter2,
  ) {}

  /**
   * Atomically adjust a counterparty×currency balance. Must be called from
   * within the caller's $transaction. Uses an upsert so the row is created
   * on first touch.
   *
   * Faza 9: upsert bilan BIR TRANZAKSIYADA append-only `CounterpartyBalanceEntry`
   * jurnal qatori ham yoziladi (bir applyDelta = bir qator). Ikkalasi bitta
   * `tx`da bo'lgani uchun rollback ikkisini ham qaytaradi → «Σ(jurnal) ==
   * materiallashgan balans» invarianti hech qachon uzilmaydi.
   *
   * After the upsert we emit a COUNTERPARTY_BALANCE_CHANGED domain event
   * carrying the delta + the NEW balance (read back from the upsert). The emit
   * is wrapped in try/catch and listeners are strictly out-of-band
   * ({ async, promisify }), so a failing/throwing listener can NEVER break the
   * caller's transaction. NOTE: this runs pre-commit (inside the caller's tx);
   * on a later rollback the notification is a harmless phantom — the spec
   * explicitly permits "event commit-dan keyin, yoki try/catch".
   */
  async applyDelta(
    tx: Prisma.TransactionClient,
    accountId: string,
    counterpartyId: string,
    currency: string,
    deltaMinor: bigint,
    meta: ApplyDeltaMeta,
  ): Promise<void> {
    if (deltaMinor === 0n) return;
    if (currency.length !== 3) {
      throw new BadRequestException(`Invalid currency code: "${currency}"`);
    }
    const row = await tx.counterpartyBalance.upsert({
      where: {
        counterpartyId_currency: { counterpartyId, currency },
      },
      create: {
        accountId,
        counterpartyId,
        currency,
        balanceMinor: deltaMinor,
      },
      update: {
        balanceMinor: { increment: deltaMinor },
      },
      select: { balanceMinor: true },
    });

    // Jurnal qatori — upsert bilan BIR tranzaksiyada, ATAYLAB `tx` orqali
    // (`this.prisma` EMAS: aks holda rollback jurnalni qoldirib ketardi).
    await tx.counterpartyBalanceEntry.create({
      data: {
        accountId,
        counterpartyId,
        organizationId: meta.organizationId,
        currency,
        deltaMinor,
        docType: meta.docType,
        docId: meta.docId,
      },
    });

    // `'defer'` — hujjat bir necha deltadan iborat. Xabarni chaqiruvchi
    // hujjat tugagach BIR MARTA beradi (`emitDocumentNotice`), aks holda
    // mijoz birinchi bo'lakning summasini «to'liq to'lov» deb o'qiydi.
    if (meta.notice === 'defer') return;

    this.emitChanged({
      accountId,
      counterpartyId,
      currency,
      deltaMinor,
      newBalanceMinor: row.balanceMinor,
      source: meta.source,
      docType: meta.docType,
      docId: meta.docId,
    });
  }

  /**
   * BITTA HUJJAT = BITTA XABAR (2026-08-28) — `notice: 'defer'` ning juftligi.
   *
   * Chaqiruvchi bir hujjat doirasida N ta `applyDelta` qilgan bo'lsa (POS
   * qarz to'lovining FIFO taqsimoti), shu metod ularning O'RNIGA bitta
   * yig'ma hodisa chiqaradi: `deltaMinor` — HUJJATNING to'liq summasi,
   * `newBalanceMinor` — hujjatdan KEYINGI YAKUNIY balans.
   *
   * ⚠️ COMMIT'DAN KEYIN CHAQIRILADI va ATAYLAB `tx` OLMAYDI — balansni
   * `this.prisma.client` orqali o'qiydi. Uchta sabab:
   *   1. tx ichida o'qilsa balans O'RTA holatda bo'lishi mumkin edi (yana
   *      o'sha bug, faqat boshqa nuqtada);
   *   2. tranzaksiya ROLLBACK bo'lsa mijozga «to'lovingiz qabul qilindi»
   *      degan FANTOM xabar ketardi (`applyDelta` ning commit-oldi emit'i
   *      shu xavfni allaqachon oladi — bu yo'l uni takrorlamaydi);
   *   3. `debtpayment` kabi turlarda xabar sarlavhasi hujjat sanasini
   *      qidiradi (`fetchDocMeta`) — commit'gacha u BOSHQA ulanishga
   *      ko'rinmaydi va sarlavha sanasiz qolardi.
   *
   * Hech qachon throw QILMAYDI: xabar — yon ta'sir, pul yozuvi allaqachon
   * commit bo'lgan va uni xabar nosozligi bekor qilmasligi kerak.
   */
  async emitDocumentNotice(params: {
    accountId: string;
    counterpartyId: string;
    currency: string;
    /** Butun hujjatning oldindan ishoralangan deltasi (Σ bo'laklar). */
    deltaMinor: bigint;
    source: CounterpartyBalanceChangeSource;
    docType: ApplyDeltaDocType;
    docId: string;
  }): Promise<void> {
    if (params.deltaMinor === 0n) return;
    let row: { balanceMinor: bigint } | null;
    try {
      row = await this.prisma.client.counterpartyBalance.findFirst({
        where: {
          accountId: params.accountId,
          counterpartyId: params.counterpartyId,
          currency: params.currency,
        },
        select: { balanceMinor: true },
      });
    } catch (e) {
      this.logger.warn(`document-notice balance read failed: ${(e as Error).message}`);
      return;
    }
    // Qator yo'q = balans hech qachon qo'zg'almagan ⇒ aytadigan gap yo'q.
    if (!row) return;
    this.emitChanged({ ...params, newBalanceMinor: row.balanceMinor });
  }

  /**
   * YAGONA emit nuqtasi. Listener xatosi (yoki `EventEmitter2` ning o'zi)
   * hech qachon chaqiruvchining tranzaksiyasiga qaytmasligi kerak.
   */
  private emitChanged(payload: CounterpartyBalanceChangedEvent): void {
    try {
      this.events.emit(HR_EVENT.COUNTERPARTY_BALANCE_CHANGED, payload);
    } catch (e) {
      this.logger.warn(`balance-changed emit failed: ${(e as Error).message}`);
    }
  }

  /**
   * List all non-zero balances for a counterparty. Used by Counterparty
   * findById to render the Balance card.
   */
  async listForCounterparty(
    accountId: string,
    counterpartyId: string,
  ): Promise<Array<{ currency: string; balanceMinor: string; updatedAt: Date }>> {
    const rows = await this.prisma.client.counterpartyBalance.findMany({
      where: {
        accountId,
        counterpartyId,
      },
      orderBy: { currency: 'asc' },
      select: { currency: true, balanceMinor: true, updatedAt: true },
    });
    return rows.map((r) => ({
      currency: r.currency,
      balanceMinor: r.balanceMinor.toString(),
      updatedAt: r.updatedAt,
    }));
  }
}
