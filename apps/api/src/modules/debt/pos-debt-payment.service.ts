import { randomUUID } from 'node:crypto';
import type { Prisma } from '@moysklad/db';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { allocateDocumentNumber } from '../../prisma/document-number.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CounterpartyBalanceService } from '../counterparty-balance/counterparty-balance.service.js';
import { MoneyService } from '../money/money.service.js';
import { debtCashDeskDeltas } from './debt-cash-ledger.js';
import {
  type FifoDebt,
  allocateFifo,
  outstandingOf,
  splitOriginalMinor,
  summarize,
} from './debt-fifo.js';
import { recalcDebt } from './debt-recalc.js';
import {
  type PosDebtPaymentInput,
  PosDebtPaymentSchema,
  usdCentsToSomTiyin,
} from './debt.schema.js';
import { debtPayable, planAdoption, splitDebtSources } from './pos-customer-debt.js';

/** FIFO/chek uchun kerakli maydonlar — qulfli va qulfsiz o'qish bir xil shaklda. */
const DEBT_FIFO_SELECT = {
  id: true,
  name: true,
  totalMinor: true,
  paidMinor: true,
  currency: true,
  createdAt: true,
  nextContactAt: true,
} as const;

/**
 * Qarz DAFTARI valyutasi (P1).
 *
 * `DebtPayment.amountMinor` har doim shu valyutada (sxema izohi), FIFO ham
 * valyutaga qaramay so'mda taqsimlaydi. Mijoz dollar bersa `usdCentsToSomTiyin`
 * uni shu valyutaga keltiradi. Adopsiya va balans qulfi ham AYNAN shu valyuta
 * qatoriga tegadi — boshqasini olsak, to'lov mijozning boshqa daftaridan
 * ayrilardi.
 */
const DEBT_LEDGER_CURRENCY = 'UZS';

/**
 * POS «Qarz to'lovi» oynasi (kassa TZ §7.2).
 *
 * NEGA ALOHIDA SERVIS: mavjud `DebtService.addCashPayment` **bitta qarzga**
 * to'lov yozadi va uning `amount > remaining` tekshiruvi bor. Kassada esa
 * mijoz «qarzimni to'layman» deb keladi — u qaysi QRZ- hujjatga tushishini
 * bilmaydi va bilishi ham shart emas. Shuning uchun bu yerda **bitta summa
 * → bir necha qarz** (FIFO, eng eskisidan) taqsimlanadi.
 *
 * Taqsimlash qoidasi `debt-fifo.ts` da (sof modul, testlangan) — bu servis
 * faqat Prisma-I/O va tranzaksiya chegarasi.
 *
 * ⚠️ HAMMASI BITTA TRANZAKSIYADA: to'lov qatorlari, qarz holatlari va
 * kontragent balansi birga yoziladi. Yarim bajarilgan to'lov — pul kirgan-u
 * qarz yopilmagan holat — eng yomon natija bo'lardi.
 */
@Injectable()
export class PosDebtPaymentService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CounterpartyBalanceService) private readonly balances: CounterpartyBalanceService,
    // Kassa daftari (Faza 11, `M-05`) — naqd qarz to'lovi `CashDesk`
    // qoldig'iga va `/money` lentasiga tushishi uchun.
    @Inject(MoneyService) private readonly money: MoneyService,
  ) {}

  /**
   * Oyna ochilganda ko'rsatiladigan xulosa (TZ §7.2/2-qadam).
   *
   * Kassir to'lovni qabul qilishdan oldin kontekstni ko'rishi kerak: jami
   * qoldiq, **eng eski qarz sanasi** va ochiq qarzlar ro'yxati. Faqat
   * summa maydonini ko'rsatish uni ko'r-ko'rona kiritishga majbur qilardi.
   */
  async summary(accountId: string, counterpartyId: string, tillCurrency = 'UZS') {
    const cp = await this.prisma.client.counterparty.findFirst({
      where: { id: counterpartyId, accountId },
      select: { id: true, name: true, phone: true, description: true },
    });
    if (!cp) throw new NotFoundException('Mijoz topilmadi');

    const [rows, balanceRows] = await Promise.all([
      this.loadOpenDebts(accountId, counterpartyId),
      // F9 — IKKINCHI daftar. POS qarz-sotuvi `Debt` reyestriga EMAS, aynan
      // shu balansga yozadi (`retail-sale.service.ts#post`), ya'ni pastdagi
      // FIFO qoldig'i mijozning haqiqiy qarzidan KAM bo'lishi mumkin.
      this.prisma.client.counterpartyBalance.findMany({
        where: { accountId, counterpartyId },
        select: { currency: true, balanceMinor: true },
      }),
    ]);
    const s = summarize(rows.map(toFifo));
    const split = splitDebtSources(balanceRows, s.outstandingMinor, tillCurrency);
    const payable = debtPayable(split.balanceMinor, s.outstandingMinor);

    return {
      counterparty: cp,
      /**
       * 🔴 P1 — KASSIR EKRANIDAGI ASOSIY SON: POS shu summagacha qabul qila
       * oladi. `outstandingMinor` (reyestr) EMAS: prodda reyestr bo'sh,
       * qarz esa balansda — ekran o'sha reyestrga qarab «qarzi yo'q» derdi.
       * Formulasi server bilan bitta (`debtPayable`, sof modul).
       */
      payableMinor: payable.payableMinor.toString(),
      /** Shundan reyestrda YO'Q, to'lov paytida adopsiya qilinadigan qism. */
      adoptableMinor: payable.adoptableMinor.toString(),
      /** `Debt` reyestri — FIFO taqsimoti AYNAN shundan boshlanadi. */
      outstandingMinor: s.outstandingMinor.toString(),
      openCount: s.openCount,
      oldestAt: s.oldestAt,
      /**
       * F9 — `CounterpartyBalance` dagi umumiy qarz.
       * 🔴 `null` = O'LCHANMAGAN (balans qatori yo'q), «0» EMAS.
       */
      balanceMinor: split.balanceMinor?.toString() ?? null,
      /** Balansda bor, reyestrda yo'q — POS bu qarzni QABUL QILA OLMAYDI. */
      unregisteredMinor: split.unregisteredMinor?.toString() ?? null,
      /** Teskari nomuvofiqlik: reyestr balansdan katta (ikkala son shubhali). */
      registryExceedsBalance: split.registryExceedsBalance,
      /** Kassa valyutasidan boshqa, noldan farqli qoldiqlar. */
      otherCurrencyBalances: split.otherCurrencies.map((b) => ({
        currency: b.currency,
        balanceMinor: b.balanceMinor.toString(),
      })),
      debts: rows.map((d) => ({
        id: d.id,
        name: d.name,
        totalMinor: d.totalMinor.toString(),
        paidMinor: d.paidMinor.toString(),
        outstandingMinor: (d.totalMinor - d.paidMinor).toString(),
        currency: d.currency,
        // 🔴 F9/AUDIT: qarz OCHILGAN sana. Ilgari `nextContactAt ?? createdAt`
        // turardi — ya'ni ekranda KELAJAKDAGI qo'ng'iroq sanasi «qarz sanasi»
        // bo'lib ko'rinardi va ro'yxat tartibi server yopadigan FIFO
        // tartibidan (`toFifo` → `createdAt`) farq qilardi.
        orderAt: d.createdAt,
      })),
    };
  }

  /**
   * To'lovni FIFO bo'yicha taqsimlab yozadi va **PKO** uchun ma'lumot qaytaradi.
   *
   * `retailShiftId` — to'lov qaysi smenaga tushgani. Naqd bo'lsa u smena
   * yakunidagi «kutilgan naqd» hisobiga kiradi (TZ §8.4); busiz kassir har
   * safar shu summaga ortiqcha chiqardi.
   */
  async pay(accountId: string, userId: string, raw: unknown) {
    const input: PosDebtPaymentInput = PosDebtPaymentSchema.parse(raw);

    // ── To'lovni SO'MGA keltirish (F6) ──────────────────────────────────────
    // Mijoz dollar berishi mumkin, qarz daftari esa so'mda yuriladi. Ikki
    // qiymat ajratiladi va IKKALASI ham saqlanadi:
    //   amountMinor         — qarzga tushadigan SO'M (FIFO shundan)
    //   originalTotalMinor  — mijoz JISMONAN bergan pul (USD → sent), yashiq
    //                         daftari va chek shundan.
    // O'girish formulasi `retail-tenders.ts` bilan BITTA (`usdCentsToSomTiyin`).
    // 🔴 Klientning so'm hisobiga ishonilmaydi — u umuman yuborilmaydi.
    const enteredMinor = BigInt(input.amountMinor);
    const rateE8 = input.exchangeRate ? BigInt(input.exchangeRate) : null;
    const isUsd = input.currency === 'USD';
    if (isUsd && (rateE8 == null || rateE8 <= 0n)) {
      // Schema majburiy qilgan; bu — ikkinchi qatlam (servis to'g'ridan-to'g'ri
      // chaqirilsa ham sent tiyin deb o'qilmasin).
      throw new BadRequestException('Dollar to`lovida kurs majburiy');
    }
    const amountMinor =
      isUsd && rateE8 != null ? usdCentsToSomTiyin(enteredMinor, rateE8) : enteredMinor;
    const originalTotalMinor = isUsd ? enteredMinor : null;
    if (amountMinor <= 0n) {
      throw new BadRequestException('To`lov summasi noldan katta bo`lishi kerak');
    }

    // `retailShiftId` KLIENTDAN keladi — unga ko'r-ko'rona ishonib bo'lmaydi.
    // Tekshiruvsiz yozilsa yopiq/begona/mavjud bo'lmagan smena id jim qabul
    // qilinadi va naqd pul JORIY smenaning «kutilgan naqd» hisobiga (TZ §8.4)
    // tushmaydi — reconciliation buziladi, kamomadni yashirish yo'li ochiladi.
    // Faqat SHU akkauntning OCHIQ smenasi qabul qilinadi.
    if (input.retailShiftId) {
      const shift = await this.prisma.client.cashierSession.findFirst({
        where: { id: input.retailShiftId, accountId, state: 'open' },
        select: { id: true },
      });
      if (!shift) throw new BadRequestException('Smena topilmadi yoki yopilgan');
    }

    // Bitta jismoniy to'lov = N qator, lekin PKO cheki BITTA hujjat.
    // Shu id chekni keyin ANIQ yig'ishga imkon beradi (mijoz+vaqt bo'yicha
    // taxmin qilish moliyaviy hujjatda yaramaydi).
    const batchId = randomUUID();

    const result = await this.prisma.client.$transaction(async (tx) => {
      // ⚠️ QULF TARTIBI: BALANS → QARZLAR (P1). Ikkalasi ham shu tranzaksiya
      // oxirigacha ushlanadi.
      //
      // Nega balans BIRINCHI: (1) adopsiya qarori aynan balansdan olinadi va
      // reyestr bo'sh bo'lganda `debts … FOR UPDATE` hech nimani ushlamaydi —
      // ikki parallel to'lov bir xil qoldiqni ko'rib balansdan ORTIQ yozardi;
      // (2) `debt.service.addCashPayment` yo'li ham amalda shu tartibda
      // qulflaydi (recalc → applyDelta → debt.update), ya'ni ikki yo'l bir xil
      // tartibda yuradi va o'zaro deadlock qilmaydi.
      const balanceMinor = await this.lockBalance(tx, accountId, input.counterpartyId);

      // ⚠️ FIFO REJA TRANZAKSIYA ICHIDA, QULFLANGAN qatorlardan hisoblanadi
      // (2026-08-08 `M-10`). Ilgari qarzlar tx'dan TASHQARIDA o'qilardi: bir
      // mijozga ikki parallel to'lov bir xil eski `paidMinor`ni ko'rib, bir
      // qarzga jami qarzdan ortiq allokatsiya yozardi.
      const rows = await this.lockOpenDebts(tx, accountId, input.counterpartyId);
      const registryOutstandingMinor = rows.reduce((acc, r) => acc + outstandingOf(r), 0n);

      // P1 — «to'lanadigan qarz» = max(reyestr, balans). Shu bitta son
      // ekranda ham, bu yerda ham AYNAN bir formuladan chiqadi.
      const { payableMinor } = debtPayable(balanceMinor, registryOutstandingMinor);
      if (payableMinor <= 0n) {
        throw new BadRequestException('Mijozda ochiq qarz yo`q');
      }
      if (amountMinor > payableMinor) {
        // Ortiqcha to'lovni jimgina «avans» qilib yozib qo'ymaymiz: kassa
        // TZ §6.2 bo'yicha qaytim FAQAT naqddan beriladi va bu qaror
        // kassirniki. Shuning uchun aniq xato — qancha ortiqcha ekani bilan.
        throw new BadRequestException(
          `To\`lov qarzdan ${(amountMinor - payableMinor).toString()} tiyinga ko\`p. Qaytimni kassadan bering yoki summani kamaytiring.`,
        );
      }

      // Reyestrdan ortiq qism — balansdan reyestrga OLIB KIRILADI (adopsiya).
      // Qator shu yerda tug'iladi va pastdagi FIFO uni oxirgi bo'lib yopadi
      // (`createdAt` = hozir ⇒ eng yangi). Shartnoma: `pos-customer-debt.ts`.
      const { adoptMinor } = planAdoption({
        amountMinor,
        registryOutstandingMinor,
        balanceMinor,
      });
      const fifoRows =
        adoptMinor > 0n
          ? [...rows, await this.adoptBalanceDebt(tx, accountId, userId, input, adoptMinor)]
          : rows;

      const plan = allocateFifo(fifoRows.map(toFifo), amountMinor);
      if (plan.leftoverMinor > 0n) {
        // Yetib bo'lmaydigan shox: yuqoridagi `payableMinor` tekshiruvi va
        // adopsiya birgalikda butun summaga joy topadi. Baribir turadi —
        // FIFO qoidasi kelajakda o'zgarsa pul jimgina yo'qolmasin.
        throw new BadRequestException(
          `To\`lov qarzdan ${plan.leftoverMinor.toString()} tiyinga ko\`p. Qaytimni kassadan bering yoki summani kamaytiring.`,
        );
      }

      const currency = input.currency;
      const receipts: Array<{ debtName: string; amountMinor: bigint; closed: boolean }> = [];

      // F6: mijoz bergan ASL summa (sent) FIFO qatorlariga bo'linadi — har
      // qator o'z `amountOriginalMinor` ini oladi, chunki STORNO qatordan-
      // qatorga ishlaydi va yashiqdan aynan o'sha jismoniy summani chiqaradi.
      // Bo'lish qoldig'i oxirgi qatorga: Σ bo'laklar = asl summa (invariant).
      const originalParts =
        originalTotalMinor == null
          ? null
          : splitOriginalMinor(
              plan.allocations.map((a) => a.amountMinor),
              originalTotalMinor,
            );

      for (const [index, alloc] of plan.allocations.entries()) {
        // `fifoRows` — reyestr + (bo'lsa) adopsiya qatori. `rows` bo'lsa
        // adopsiya qatorining cheki jimgina tushib qolardi.
        const debt = fifoRows.find((r) => r.id === alloc.debtId);
        if (!debt) continue;

        await tx.debtPayment.create({
          data: {
            accountId,
            debtId: alloc.debtId,
            // HAR DOIM so'mda — qarz hisobi shu ustundan yuriladi.
            amountMinor: alloc.amountMinor,
            method: input.method,
            currency,
            // Kurs CHEKKA MUZLATILADI: ertangi kurs bilan qayta baholanmaydi.
            exchangeRate: rateE8,
            amountOriginalMinor: originalParts?.[index] ?? null,
            cashDeskId: input.cashDeskId ?? null,
            retailShiftId: input.retailShiftId ?? null,
            batchId,
            receivedById: userId,
            comment: input.comment ?? null,
          },
        });

        // KANONIK yo'l (`DUP-07`): `paidMinor` to'lovlardan qayta o'qiladi,
        // `status`/`closedAt`/`nextContactAt` va kontragent balansi shu yerda
        // yopiladi. Ilgari bu yerda increment + `closedAt`siz o'z nusxasi bor edi.
        // docId = BATCH: buxgalter jurnaldan chekka boradi, ixtiyoriy qarz
        // qatoriga emas.
        const updated = await recalcDebt(tx, this.balances, {
          accountId,
          debtId: alloc.debtId,
          // `Debt`da organizatsiya o'lchovi yo'q ⇒ jurnalda `organizationId` null.
          meta: { docType: 'debtpayment', docId: batchId, organizationId: null },
        });

        receipts.push({
          debtName: debt.name,
          amountMinor: alloc.amountMinor,
          // Yopilganini REJA emas, qayta hisoblangan HOLAT aytadi.
          closed: updated.status === 'paid',
        });
      }

      // Kassa daftari (`M-05`) — TRANZAKSIYA ICHIDA va BIR MARTA: mijoz bitta
      // summa berdi, FIFO uni nechta qarzga bo'lgani yashiqqa aloqasiz.
      // Havola PKO cheki (`batchId`) — buxgalter daftardan chekka boradi.
      // Naqd bo'lmasa yoki kassa ko'rsatilmagan bo'lsa — bo'sh ro'yxat.
      await this.money.applyDeltas(
        tx,
        accountId,
        debtCashDeskDeltas(
          {
            method: input.method,
            cashDeskId: input.cashDeskId ?? null,
            currency,
            amountMinor: plan.appliedMinor,
            // F6: yashiqda mijoz bergan JISMONIY pul yotadi — dollar bo'lsa
            // sent, so'm ekvivalenti emas (`debt-cash-ledger.ts` qoidasi).
            amountOriginalMinor: originalTotalMinor,
          },
          { sign: 1n, documentId: batchId, counterpartyId: input.counterpartyId },
        ),
      );

      return { receipts, appliedMinor: plan.appliedMinor, currency };
    });

    const rest = await this.loadOpenDebts(accountId, input.counterpartyId);
    const after = summarize(rest.map(toFifo));

    return {
      batchId,
      /** PKO (prixodnik order) cheki uchun — TZ §7.2/5-qadam. */
      receipt: {
        batchId,
        /** Qarz daftariga tushgan SO'M — chekning «TO'LANDI» qatori. */
        paidMinor: result.appliedMinor.toString(),
        currency: result.currency,
        /** Mijoz bergan ASL summa (USD → sent). So'm to'lovda `null`. */
        originalMinor: originalTotalMinor?.toString() ?? null,
        /** Chekka MUZLATILGAN kurs, kanonik ×10^8. So'm to'lovda `null`. */
        exchangeRate: rateE8?.toString() ?? null,
        method: input.method,
        lines: result.receipts.map((r) => ({
          debtName: r.debtName,
          amountMinor: r.amountMinor.toString(),
          closed: r.closed,
        })),
        /** To'lovdan KEYINGI qoldiq — chekda ko'rinadi, mijoz bilib tursin. */
        outstandingAfterMinor: after.outstandingMinor.toString(),
      },
      closedCount: result.receipts.filter((r) => r.closed).length,
    };
  }

  /**
   * PKO chekini QAYTA yig'adi (kassir chekni yo'qotdi / printer tiqildi).
   *
   * Chek — moliyaviy hujjat: qayta chop etilgani ham AYNAN o'sha summalarni
   * ko'rsatishi shart. Shuning uchun qatorlar `batchId` bo'yicha aniq
   * olinadi, qayta hisoblanmaydi. Storno qilingan qator ham ko'rinadi
   * (`reversedAt`) — chekni «tozalab» ko'rsatish tarixni yashirish bo'lardi.
   */
  async receipt(accountId: string, batchId: string) {
    const rows = await this.prisma.client.debtPayment.findMany({
      where: { accountId, batchId },
      select: {
        id: true,
        amountMinor: true,
        method: true,
        currency: true,
        // F6 — PKO chekidagi dollar qatori uchun (qayta chop etishda ham
        // AYNAN o'sha kurs va asl summa ko'rinishi shart).
        exchangeRate: true,
        amountOriginalMinor: true,
        createdAt: true,
        reversedAt: true,
        debt: { select: { id: true, name: true, counterpartyId: true } },
        receivedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    if (rows.length === 0) throw new NotFoundException('Chek topilmadi');

    const counterpartyId = rows[0]?.debt.counterpartyId;
    const [cp, org] = await Promise.all([
      this.prisma.client.counterparty.findFirst({
        where: { id: counterpartyId, accountId },
        select: { id: true, name: true, phone: true },
      }),
      this.prisma.client.organization.findFirst({
        where: { accountId },
        select: { name: true, legalTitle: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    // Qaytarilmagan qatorlar yig'indisi — chekdagi «jami».
    const live = rows.filter((r) => r.reversedAt === null);
    const paidMinor = live.reduce((acc, r) => acc + r.amountMinor, 0n);
    // F6 — chet valyutadagi ASL summa ham qatorlardan yig'iladi (bo'laklarni
    // qayta hisoblamaymiz: chek moliyaviy hujjat, u YOZILGANINI ko'rsatadi).
    const originalMinor = live.reduce((acc, r) => acc + (r.amountOriginalMinor ?? 0n), 0n);

    const rest = counterpartyId ? await this.loadOpenDebts(accountId, counterpartyId) : [];
    const after = summarize(rest.map(toFifo));

    return {
      batchId,
      counterparty: cp,
      organization: org,
      cashier: rows[0]?.receivedBy ?? null,
      paidAt: rows[0]?.createdAt ?? null,
      method: rows[0]?.method ?? 'cash',
      currency: rows[0]?.currency ?? 'UZS',
      /** Mijoz bergan ASL summa (USD → sent); so'm to'lovda `null`. */
      originalMinor: originalMinor > 0n ? originalMinor.toString() : null,
      /** Muzlatilgan kurs (kanonik ×10^8); so'm to'lovda `null`. */
      exchangeRate: rows[0]?.exchangeRate?.toString() ?? null,
      paidMinor: paidMinor.toString(),
      outstandingAfterMinor: after.outstandingMinor.toString(),
      lines: rows.map((r) => ({
        debtId: r.debt.id,
        debtName: r.debt.name,
        amountMinor: r.amountMinor.toString(),
        reversed: r.reversedAt !== null,
      })),
    };
  }

  /**
   * Ochiq (yopilmagan, bekor qilinmagan, O'CHIRILMAGAN) qarzlar — eng eskisi
   * birinchi. FAQAT KO'RSATISH uchun (xulosa/chek); pul yozadigan yo'l
   * `lockOpenDebts` dan foydalanadi.
   *
   * `deletedAt: null` — 2026-08-08 `DUP-07`: operator korzinaga tashlagan qarz
   * ilgari POS FIFO'sida turaverardi va mijoz puli mavjud bo'lmagan qarzga
   * tushardi.
   */
  private async loadOpenDebts(accountId: string, counterpartyId: string) {
    return this.prisma.client.debt.findMany({
      where: {
        accountId,
        counterpartyId,
        deletedAt: null,
        status: { notIn: ['paid', 'cancelled'] },
      },
      select: DEBT_FIFO_SELECT,
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Kontragentning qarz-valyutasidagi balans qatorini QULFLAB o'qiydi (P1).
   *
   * 🔴 `null` = qator YO'Q (o'lchanmagan), «0» EMAS — bu farq `debtPayable`da
   * qaror o'zgartiradi.
   *
   * NEGA raw SQL: Prisma'da qator-qulfi yo'q, `findFirst` esa snapshot beradi.
   * Reyestr bo'sh mijozda `debts … FOR UPDATE` hech nimani ushlamaydi, ya'ni
   * balansdan ortiq yozishga qarshi YAGONA to'siq shu qulf. Qator yo'q bo'lsa
   * qulf ham yo'q — lekin u holda adopsiya ham bo'lmaydi (`null` ⇒ 0).
   */
  private async lockBalance(
    tx: Prisma.TransactionClient,
    accountId: string,
    counterpartyId: string,
  ): Promise<bigint | null> {
    const rows = await tx.$queryRaw<Array<{ balance_minor: bigint }>>`
      SELECT balance_minor
      FROM counterparty_balances
      WHERE account_id = ${accountId}::uuid
        AND counterparty_id = ${counterpartyId}::uuid
        AND currency = ${DEBT_LEDGER_CURRENCY}
      FOR UPDATE
    `;
    const row = rows[0];
    return row === undefined ? null : BigInt(row.balance_minor);
  }

  /**
   * Balansdagi qarzning to'lanayotgan qismini REYESTRGA olib kirish (P1).
   *
   * Qator `balanceAdopted: true` bilan tug'iladi va **balansga `+total`
   * YOZMAYDI** — qarz u yerda allaqachon bor (`debt.service.create` bilan
   * asosiy farq; sabab `pos-customer-debt.ts` «ADOPSIYA» bo'limida).
   *
   * `nextContactAt: null` — chaqiruvchi uni o'sha tranzaksiyada to'liq yopadi,
   * ya'ni qo'ng'iroq jadvaliga tushmasligi kerak. Izoh yozuvi (`debt_issue`)
   * mijoz kartasidagi tarixda «bu qator qayerdan paydo bo'ldi» degan savolga
   * javob beradi.
   */
  private async adoptBalanceDebt(
    tx: Prisma.TransactionClient,
    accountId: string,
    userId: string,
    input: PosDebtPaymentInput,
    totalMinor: bigint,
  ) {
    const year = new Date().getFullYear();
    const prefix = `QRZ-${year}-`;
    const seq = await allocateDocumentNumber(tx, accountId, prefix, async () => {
      const last = await tx.debt.findFirst({
        where: { accountId, name: { startsWith: prefix } },
        orderBy: { name: 'desc' },
        select: { name: true },
      });
      return last ? Number.parseInt(last.name.slice(prefix.length), 10) || 0 : 0;
    });

    const debt = await tx.debt.create({
      data: {
        accountId,
        counterpartyId: input.counterpartyId,
        name: `${prefix}${String(seq).padStart(5, '0')}`,
        totalMinor,
        paidMinor: 0n,
        currency: DEBT_LEDGER_CURRENCY,
        status: 'unpaid',
        balanceAdopted: true,
        nextContactAt: null,
        ownerId: userId,
        issuedById: userId,
        comment: 'Balansdagi qarzdan kassada qabul qilingan to`lov uchun ochildi (P1).',
      },
      select: DEBT_FIFO_SELECT,
    });

    await tx.debtNote.create({
      data: {
        accountId,
        debtId: debt.id,
        text: 'Qator kassadagi to`lov paytida mijoz BALANSIDAGI qarzdan ochildi — balansga qayta qo`shilmadi.',
        authorId: userId,
        authorRole: 'cashier',
        kind: 'debt_issue',
      },
    });

    return debt;
  }

  /**
   * Xuddi shu ro'yxat, lekin qatorlar TRANZAKSIYA OXIRIGACHA QULFLANGAN
   * (`SELECT … FOR UPDATE`, `stock.lockBalances` naqshi).
   *
   * NEGA raw SQL: Prisma'da qator-qulfi yo'q. Qulfsiz FIFO — `M-10`: ikki
   * parallel to'lov bir xil snapshotni ko'rib, bir qarzga qarzdan ortiq
   * allokatsiya qiladi.
   *
   * Qulf olingandan KEYIN Postgres WHERE'ni qayta baholaydi (EvalPlanQual) —
   * raqib tranzaksiya qarzni yopib ulgurgan bo'lsa u qator to'plamdan tushadi.
   * `ORDER BY created_at, id` — deadlock'ga qarshi barqaror qulflash tartibi
   * (FIFO tartibining o'zi).
   */
  private async lockOpenDebts(
    tx: Prisma.TransactionClient,
    accountId: string,
    counterpartyId: string,
  ) {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM debts
      WHERE account_id = ${accountId}::uuid
        AND counterparty_id = ${counterpartyId}::uuid
        AND deleted_at IS NULL
        AND status NOT IN ('paid', 'cancelled')
      ORDER BY created_at ASC, id ASC
      FOR UPDATE
    `;
    if (locked.length === 0) return [];

    // Qulf olingach qiymatlarni QAYTA o'qiymiz: endi ular tranzaksiya
    // yakunigacha o'zgarmaydi.
    return tx.debt.findMany({
      where: { id: { in: locked.map((r) => r.id) }, accountId },
      select: DEBT_FIFO_SELECT,
      orderBy: { createdAt: 'asc' },
    });
  }
}

/** DB qatorini sof FIFO modelига o'giradi. */
function toFifo(d: {
  id: string;
  totalMinor: bigint;
  paidMinor: bigint;
  createdAt: Date;
  nextContactAt: Date | null;
}): FifoDebt {
  return {
    id: d.id,
    totalMinor: d.totalMinor,
    paidMinor: d.paidMinor,
    // «Eski» = qarz OCHILGAN sana. `nextContactAt` — kelajakdagi qo'ng'iroq
    // rejasi, u bo'yicha saralash yangi qarzni oldinga chiqarib yuborardi.
    orderAt: d.createdAt,
  };
}

export type { Prisma };
