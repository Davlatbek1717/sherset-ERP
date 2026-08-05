import type { Prisma } from '@moysklad/db';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CounterpartyBalanceService } from '../counterparty-balance/counterparty-balance.service.js';
import { type FifoDebt, allocateFifo, summarize } from './debt-fifo.js';
import { type PosDebtPaymentInput, PosDebtPaymentSchema } from './debt.schema.js';

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

    const rows = await this.loadOpenDebts(accountId, input.counterpartyId);
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

    const result = await this.prisma.client.$transaction(async (tx) => {
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
            receivedById: userId,
            comment: input.comment ?? null,
          },
        });

        const paid = debt.paidMinor + alloc.amountMinor;
        await tx.debt.update({
          where: { id: alloc.debtId },
          data: {
            paidMinor: paid,
            status: paid >= debt.totalMinor ? 'paid' : 'partial',
          },
        });

        receipts.push({
          debtName: debt.name,
          amountMinor: alloc.amountMinor,
          closed: alloc.closes,
        });
      }

      // Balans: to'lov qarzni kamaytiradi (ishora `Debt.create` ga teskari).
      await this.balances.applyDelta(
        tx,
        accountId,
        input.counterpartyId,
        currency,
        -plan.appliedMinor,
        { docType: 'debtpayment', docId: plan.allocations[0]?.debtId },
      );

      return receipts;
    });

    const rest = await this.loadOpenDebts(accountId, input.counterpartyId);
    const after = summarize(rest.map(toFifo));

    return {
      /** PKO (prixodnik order) cheki uchun — TZ §7.2/5-qadam. */
      receipt: {
        paidMinor: plan.appliedMinor.toString(),
        currency,
        method: input.method,
        lines: result.map((r) => ({
          debtName: r.debtName,
          amountMinor: r.amountMinor.toString(),
          closed: r.closed,
        })),
        /** To'lovdan KEYINGI qoldiq — chekda ko'rinadi, mijoz bilib tursin. */
        outstandingAfterMinor: after.outstandingMinor.toString(),
      },
      closedCount: result.filter((r) => r.closed).length,
    };
  }

  /** Ochiq (yopilmagan va bekor qilinmagan) qarzlar — eng eskisi birinchi. */
  private async loadOpenDebts(accountId: string, counterpartyId: string) {
    return this.prisma.client.debt.findMany({
      where: {
        accountId,
        counterpartyId,
        status: { notIn: ['paid', 'cancelled'] },
      },
      select: {
        id: true,
        name: true,
        totalMinor: true,
        paidMinor: true,
        currency: true,
        createdAt: true,
        nextContactAt: true,
      },
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
