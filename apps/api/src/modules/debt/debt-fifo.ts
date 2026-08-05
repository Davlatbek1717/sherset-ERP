/**
 * Qarz to'lovini FIFO bo'yicha taqsimlash (kassa TZ §7.2, qaror Q9).
 *
 * SOF modul — DB yo'q, soat yo'q. Bitta savolga javob beradi: **kelgan pul
 * qaysi qarzlarga, qanday tartibda va qancha-qanchadan tushadi.**
 *
 * NEGA FIFO: egasining Q9 qarori — «umumiy balansga, eski qarzlardan
 * boshlab yopiladi». Kassirga qaysi qarzni yopishni tanlatish ikki xavf
 * tug'diradi: (1) eng eski qarz abadiy ochiq qolib, muddati o'tganlar
 * hisoboti yolg'on bo'ladi; (2) tanlov subyektiv bo'lgani uchun keyin
 * «nega bu yopilgan» degan savolga javob yo'q.
 *
 * ⚠️ PUL — faqat `bigint`. `number` bilan ishlash 2^53 dan katta tiyinda
 * jimgina yaxlitlashga olib keladi.
 */

/** Taqsimlashga nomzod qarz (eng zarur maydonlar). */
export interface FifoDebt {
  readonly id: string;
  /** Umumiy summa, minor. */
  readonly totalMinor: bigint;
  /** Allaqachon to'langani, minor. */
  readonly paidMinor: bigint;
  /**
   * Tartib uchun sana — **eng eskisi birinchi**. Odatda `dueAt`, u bo'lmasa
   * `createdAt`. Chaqiruvchi qaysi birini berishni o'zi hal qiladi, chunki
   * «eski» tushunchasi hisobot kontekstiga bog'liq.
   */
  readonly orderAt: Date;
}

export interface FifoAllocation {
  readonly debtId: string;
  /** Shu qarzga tushadigan summa, minor (> 0). */
  readonly amountMinor: bigint;
  /** Shu to'lovdan keyin qarz **to'liq** yopiladimi. */
  readonly closes: boolean;
}

export interface FifoResult {
  readonly allocations: readonly FifoAllocation[];
  /** Taqsimlangan jami. */
  readonly appliedMinor: bigint;
  /**
   * Ortiqcha qolgan pul (qarzlardan ko'p to'langan).
   *
   * ATAYLAB shu yerda qoldiriladi va jimgina «oxirgi qarzga» qo'shilmaydi:
   * ortiqcha to'lov — bu **avans**, qarz emas. Uni qarzga yozish mijoz
   * kartochkasida qarzni haqiqatdan katta ko'rsatardi. Chaqiruvchi buni
   * balansga avans sifatida yozadi yoki kassirga qaytim beradi.
   */
  readonly leftoverMinor: bigint;
}

/** Qarzning yopilmagan qoldig'i (manfiy bo'lib ketmaydi). */
export function outstandingOf(debt: Pick<FifoDebt, 'totalMinor' | 'paidMinor'>): bigint {
  const rest = debt.totalMinor - debt.paidMinor;
  return rest > 0n ? rest : 0n;
}

/**
 * To'lovni eng eski qarzdan boshlab taqsimlaydi.
 *
 * Tartib **barqaror**: bir xil sanali qarzlar `id` bo'yicha saralanadi —
 * aks holda ikki marta chaqirilganda natija boshqacha bo'lib, «nega bu
 * qarz yopilgan» savoliga javob berib bo'lmasdi.
 *
 * Yopilgan (qoldig'i 0) qarzlar e'tiborga olinmaydi.
 */
export function allocateFifo(debts: readonly FifoDebt[], paymentMinor: bigint): FifoResult {
  if (paymentMinor <= 0n) {
    return { allocations: [], appliedMinor: 0n, leftoverMinor: 0n };
  }

  const open = debts
    .filter((d) => outstandingOf(d) > 0n)
    .sort((a, b) => {
      const byDate = a.orderAt.getTime() - b.orderAt.getTime();
      if (byDate !== 0) return byDate;
      // Barqarorlik uchun — sana teng bo'lsa `id` hal qiladi.
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });

  const allocations: FifoAllocation[] = [];
  let rest = paymentMinor;

  for (const debt of open) {
    if (rest <= 0n) break;
    const need = outstandingOf(debt);
    const take = rest >= need ? need : rest;
    allocations.push({ debtId: debt.id, amountMinor: take, closes: take === need });
    rest -= take;
  }

  return {
    allocations,
    appliedMinor: paymentMinor - rest,
    leftoverMinor: rest,
  };
}

/**
 * Mijozning qarz xulosasi — POS oynasining yuqori qismi (TZ §7.2/2-qadam).
 *
 * Kassir to'lovni qabul qilishdan OLDIN uchta narsani ko'rishi kerak:
 * jami qoldiq, **eng eski qarz sanasi** (muddati o'tganini shu ko'rsatadi)
 * va ochiq qarzlar soni. Busiz u faqat raqam kiritadi va kontekstni
 * bilmaydi.
 */
export interface DebtSummary {
  readonly outstandingMinor: bigint;
  readonly openCount: number;
  readonly oldestAt: Date | null;
}

export function summarize(debts: readonly FifoDebt[]): DebtSummary {
  let outstandingMinor = 0n;
  let openCount = 0;
  let oldestAt: Date | null = null;

  for (const debt of debts) {
    const rest = outstandingOf(debt);
    if (rest <= 0n) continue;
    outstandingMinor += rest;
    openCount++;
    if (oldestAt == null || debt.orderAt.getTime() < oldestAt.getTime()) {
      oldestAt = debt.orderAt;
    }
  }

  return { outstandingMinor, openCount, oldestAt };
}
