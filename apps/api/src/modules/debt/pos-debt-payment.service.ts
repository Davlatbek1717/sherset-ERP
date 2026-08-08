import { randomUUID } from 'node:crypto';
import type { Prisma } from '@moysklad/db';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CounterpartyBalanceService } from '../counterparty-balance/counterparty-balance.service.js';
import { MoneyService } from '../money/money.service.js';
import { debtCashDeskDeltas } from './debt-cash-ledger.js';
import { type FifoDebt, allocateFifo, summarize } from './debt-fifo.js';
import { recalcDebt } from './debt-recalc.js';
import { type PosDebtPaymentInput, PosDebtPaymentSchema } from './debt.schema.js';

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
  async summary(accountId: string, counterpartyId: string) {
    const cp = await this.prisma.client.counterparty.findFirst({
      where: { id: counterpartyId, accountId },
      select: { id: true, name: true, phone: true },
    });
    if (!cp) throw new NotFoundException('Mijoz topilmadi');

    const rows = await this.loadOpenDebts(accountId, counterpartyId);
    const s = summarize(rows.map(toFifo));

    return {
      counterparty: cp,
      outstandingMinor: s.outstandingMinor.toString(),
      openCount: s.openCount,
      oldestAt: s.oldestAt,
      debts: rows.map((d) => ({
        id: d.id,
        name: d.name,
        totalMinor: d.totalMinor.toString(),
        paidMinor: d.paidMinor.toString(),
        outstandingMinor: (d.totalMinor - d.paidMinor).toString(),
        currency: d.currency,
        orderAt: d.nextContactAt ?? d.createdAt,
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
    const amountMinor = BigInt(input.amountMinor);
    if (amountMinor <= 0n) {
      throw new BadRequestException('To`lov summasi noldan katta bo`lishi kerak');
    }

    // Bitta jismoniy to'lov = N qator, lekin PKO cheki BITTA hujjat.
    // Shu id chekni keyin ANIQ yig'ishga imkon beradi (mijoz+vaqt bo'yicha
    // taxmin qilish moliyaviy hujjatda yaramaydi).
    const batchId = randomUUID();

    const result = await this.prisma.client.$transaction(async (tx) => {
      // ⚠️ FIFO REJA TRANZAKSIYA ICHIDA, QULFLANGAN qatorlardan hisoblanadi
      // (2026-08-08 `M-10`). Ilgari qarzlar tx'dan TASHQARIDA o'qilardi: bir
      // mijozga ikki parallel to'lov bir xil eski `paidMinor`ni ko'rib, bir
      // qarzga jami qarzdan ortiq allokatsiya yozardi.
      const rows = await this.lockOpenDebts(tx, accountId, input.counterpartyId);
      if (rows.length === 0) {
        throw new BadRequestException('Mijozda ochiq qarz yo`q');
      }

      const plan = allocateFifo(rows.map(toFifo), amountMinor);
      if (plan.leftoverMinor > 0n) {
        // Ortiqcha to'lovni jimgina «avans» qilib yozib qo'ymaymiz: kassa
        // TZ §6.2 bo'yicha qaytim FAQAT naqddan beriladi va bu qaror
        // kassirniki. Shuning uchun aniq xato — qancha ortiqcha ekani bilan.
        throw new BadRequestException(
          `To\`lov qarzdan ${plan.leftoverMinor.toString()} tiyinga ko\`p. Qaytimni kassadan bering yoki summani kamaytiring.`,
        );
      }

      const currency = input.currency ?? rows[0]?.currency ?? 'UZS';
      const receipts: Array<{ debtName: string; amountMinor: bigint; closed: boolean }> = [];

      for (const alloc of plan.allocations) {
        const debt = rows.find((r) => r.id === alloc.debtId);
        if (!debt) continue;

        await tx.debtPayment.create({
          data: {
            accountId,
            debtId: alloc.debtId,
            amountMinor: alloc.amountMinor,
            method: input.method,
            currency,
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
        paidMinor: result.appliedMinor.toString(),
        currency: result.currency,
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
    const paidMinor = rows
      .filter((r) => r.reversedAt === null)
      .reduce((acc, r) => acc + r.amountMinor, 0n);

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
