import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { type Settlement, computeSettlement } from './counterparty-settlement.util.js';

/**
 * Kontragentning yakuniy hisob-kitobini IKKALA daftardan o'qiydi.
 *
 * Bu servis balansni hujjatlardan QAYTA QURMAYDI — ataylab. Ilgari har hisobot
 * o'zicha qayta qurardi va har biri boshqacha hujjat ro'yxati ishlatardi:
 *   - `recompute-counterparty-balances.ts` — 8 hujjat, **Supply yo'q**
 *   - `CounterpartyService.metrics()` — 9 hujjat, **Supply va DebtPayment yo'q**
 *   - `report/counterparty-act` — 8 hujjat, **Supply va DebtPayment yo'q**
 *   - `counterparty-statement` akt-sverka — Supply bor, lekin **Prepayment /
 *     PrepaymentReturn / CounterpartyAdjustment / Debt yo'q**
 * Natijada bitta kontragent uchun to'rt xil son chiqardi. Materiallashgan
 * `CounterpartyBalance` esa BARCHA yo'llarni ko'radi, chunki ularning hammasi
 * `CounterpartyBalanceService.applyDelta` orqali yozadi — shuning uchun manba
 * shu jadval.
 *
 * Sof hisob mantiqi `counterparty-settlement.util.ts` da (to'liq testlangan);
 * bu yerda faqat o'qish.
 */
@Injectable()
export class CounterpartySettlementService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Kontragentning valyuta kesimidagi yakuniy holati.
   *
   * `status: 'paid'` qarzlar so'rovdan tashqarida qoldirilmaydi — `computeSettlement`
   * qoldiqni total−paid dan o'zi chiqaradi va yopilganini 0 deb tashlaydi. Buning
   * sababi: `status` hosila maydon (`deriveStatus`) va u nazariy jihatdan
   * `paidMinor` bilan rassinxron bo'lishi mumkin; qoldiqni raqamdan hisoblash
   * status-drift'ga bardoshli.
   */
  async forCounterparty(accountId: string, counterpartyId: string): Promise<Settlement> {
    const c = this.prisma.client;
    const [balances, debts] = await Promise.all([
      c.counterpartyBalance.findMany({
        where: { accountId, counterpartyId },
        select: { currency: true, balanceMinor: true },
      }),
      c.debt.findMany({
        where: { accountId, counterpartyId },
        select: { currency: true, totalMinor: true, paidMinor: true },
      }),
    ]);
    return computeSettlement({ balances, debts });
  }
}
