import { randomUUID } from 'node:crypto';
import type { Prisma } from '@moysklad/db';
/**
 * 🔴 QIYMAT importi — yuqoridagi `import type` dan ALOHIDA va ATAYLAB.
 *
 * `import type` TypeScript tomonidan butunlay O'CHIRILADI, ya'ni undan olingan
 * `Prisma.PrismaClientKnownRequestError` runtime'da `undefined` bo'lardi va
 * `instanceof` «Right-hand side is not callable» bilan yiqilardi — aynan
 * takroriy to'lovni to'sadigan shoxda. Yuqoridagi type-import esa fayl
 * oxiridagi `export type { Prisma }` ga kerak, shuning uchun o'chirilmaydi.
 */
import { Prisma as PrismaRuntime } from '@moysklad/db';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { allocateDocumentNumber } from '../../prisma/document-number.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  type BalanceDocClient,
  resolveBalanceDocs,
} from '../counterparty-balance/counterparty-balance-doc-resolver.js';
import { OPENING_DOC_TYPE } from '../counterparty-balance/counterparty-balance-doc-types.js';
import { journalWhere } from '../counterparty-balance/counterparty-balance-journal.util.js';
import { CounterpartyBalanceService } from '../counterparty-balance/counterparty-balance.service.js';
import { MoneyService } from '../money/money.service.js';
import { NO_CASH_DESK_CURRENCY, debtCashDeskDeltas } from './debt-cash-ledger.js';
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
import {
  customerStanding,
  debtPayable,
  planAdoption,
  prepayAvailable,
  splitDebtSources,
} from './pos-customer-debt.js';
import { type PosHistoryLabel, foldPosHistory } from './pos-debt-history.js';
import { DEBT_LEDGER_CURRENCY } from './sale-debt-registry.js';

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

// 🔴 `DEBT_LEDGER_CURRENCY` bu yerda BOSHQA E'LON QILINMAYDI (Q2, 2026-08-25).
// Ilgari u shu faylda yopiq `const` edi; Q2 ga (chekdan tug'iladigan reyestr
// qatori) ham AYNAN o'sha valyuta kerak bo'ldi va ikkinchi nusxa yozish ikki
// haqiqat yaratardi. E'lon `sale-debt-registry.ts` SOF moduliga ko'chirildi
// (yuqoridagi import) — u yerda nega aynan shu valyuta ekani ham yozilgan.

/** P2 — mijoz kartasidagi tarix oynasi (klient boshqasini so'rashi mumkin). */
const POS_HISTORY_LIMIT_DEFAULT = 20;

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
    // A3 — ekran holati (yorliq + rang) AYNAN shu sof qoidadan chiqadi.
    const standing = customerStanding(split.balanceMinor, s.outstandingMinor);

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
      /**
       * 🔴 A2 — MIJOZNING AVANSI (`payableMinor` ning ko'zgusi). POS to'lov
       * oynasidagi «Avansdan» tugmasi AYNAN shu songa qaraydi.
       *
       * Nega mavjud maydonlar yetmadi: `payableMinor` manfiy balansda `0`
       * qaytaradi (`debtPayable` — qarzdan avans olinmaydi), `balanceMinor`
       * esa ishorasi bilan xom son va uni ekranda `-1` ga ko'paytirish
       * formulaning IKKINCHI nusxasi bo'lardi. Server ham, ekran ham AYNAN
       * `prepayAvailable` dan yuradi.
       */
      prepayAvailableMinor: prepayAvailable(split.balanceMinor).toString(),
      /**
       * 🔴 A3 — KARTA EKRANINING HOLATI: yagona yirik son QAYSI MA'NODA
       * ko'rsatilishi (`debt` / `prepaid` / `settled` / `unmeasured`) va
       * uning summasi. Ekran yorliqni va rangni AYNAN shundan tanlaydi —
       * ilgari u `payableMinor` ni ko'rib manfiy balansda «0» chizardi,
       * ya'ni kassir mijozning pulimiz turganini bilmasdi (reja §1.3).
       *
       * Yangi formula EMAS: `customerStanding` yuqoridagi ikki maydonning
       * (`payableMinor` va `prepayAvailableMinor`) ustida turadi.
       */
      standing: {
        kind: standing.kind,
        amountMinor: standing.amountMinor.toString(),
        /** Ikki daftar zid: avans bor, lekin reyestrda ochiq qarz ham bor. */
        conflicted: standing.conflicted,
      },
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
   * P2 — mijoz kartasidagi QARZ TARIXI (`GET /debts/pos/history/:cpId`).
   *
   * Manba — `CounterpartyBalanceEntry` jurnali, ya'ni kartadagi asosiy raqam
   * bilan AYNAN bir daftar. Kassir «bu qarz qayerdan?» degan savolga shu
   * ro'yxatdan javob beradi; ilgari javob YO'Q edi (jurnalda 2 qator).
   *
   * ⚠️ `docType` bo'yicha FILTR YO'Q — `journalWhere()` shakli aynan shuni
   * kafolatlaydi (chala-ro'yxat bug-klassi, `counterparty-balance-journal.util`
   * sarlavhasi). Yangi hujjat turi qo'shilsa bu metod o'zgarmaydi.
   *
   * `opening` (backfill) qatori ALOHIDA so'rov bilan olinadi — u sahifalashdan
   * mustaqil bo'lishi shart: tarixi uzun mijozda birinchi sahifaga tushmasa
   * boshlang'ich qoldiq jimgina yo'qolardi.
   */
  async history(
    accountId: string,
    counterpartyId: string,
    currency = 'UZS',
    limit = POS_HISTORY_LIMIT_DEFAULT,
  ) {
    const cp = await this.prisma.client.counterparty.findFirst({
      where: { id: counterpartyId, accountId },
      select: { id: true, name: true },
    });
    if (!cp) throw new NotFoundException('Mijoz topilmadi');

    // Kassir ekrani cheksiz so'rov yubormasin (klient `?limit=` ni o'zi beradi).
    const take = Math.min(Math.max(Math.trunc(limit) || POS_HISTORY_LIMIT_DEFAULT, 1), 100);
    const where = journalWhere({ accountId, counterpartyId, currency });
    const journal = this.prisma.client.counterpartyBalanceEntry;

    const [page, opening, totalCount] = await Promise.all([
      // `take + 1` — 1 ta ortiqcha qator «yana bor» degan aniq signal.
      journal.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: take + 1,
        select: { deltaMinor: true, docType: true, docId: true, createdAt: true },
      }),
      // 🔴 `_sum` Prisma'da qator bo'lmasa `null` qaytaradi — bu AYNAN kerakli
      // «o'lchanmagan» signali (`0n` bo'lsa qator bor va nol).
      journal.aggregate({
        where: { ...where, docType: OPENING_DOC_TYPE },
        _sum: { deltaMinor: true },
      }),
      journal.count({ where }),
    ]);

    const hasMore = page.length > take;
    const rows = hasMore ? page.slice(0, take) : page;

    // Yorliqlar (hujjat raqami + O'Z sanasi) — umumiy resolverdan, o'z
    // hujjat-ro'yxatidan EMAS (`DUP-06`: bitta ro'yxat, N iste'molchi).
    const resolved = await resolveBalanceDocs(
      this.prisma.client as unknown as BalanceDocClient,
      accountId,
      rows.map((r) => ({ docType: r.docType, docId: r.docId })),
    );
    const labels = new Map<string, PosHistoryLabel>();
    for (const [k, v] of resolved) labels.set(k, { number: v.number, moment: v.moment });

    const fold = foldPosHistory(rows, labels, opening._sum.deltaMinor ?? null);

    return {
      counterparty: cp,
      currency,
      /** Tarixiy boshlang'ich qoldiq; `null` = backfill qatori yo'q. */
      openingMinor: fold.openingMinor?.toString() ?? null,
      /** Jurnaldagi BARCHA qatorlar soni (`opening` bilan birga). */
      totalCount,
      hasMore,
      entries: fold.lines.map((l) => ({
        at: l.at,
        docType: l.docType,
        docId: l.docId,
        number: l.number,
        deltaMinor: l.deltaMinor.toString(),
        increase: l.increase,
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

    // ── TEZ YO'L: bu so'rov allaqachon bajarilganmi? ────────────────────────
    // Takroriy so'rov ODATDA birinchisi COMMIT bo'lgandan keyin keladi (javob
    // tarmoqda yo'qoldi, kassir qayta bosdi) — ya'ni kalit reyestrda bor.
    // Shunda tranzaksiya umuman ochilmaydi: qulf ham, rollback ham qimmat.
    // 🔴 Bu FAQAT optimizatsiya, yagona himoya EMAS — haqiqiy poygada
    // (ikkala so'rov bir vaqtda) bu o'qish hech nimani ko'rmaydi va pastdagi
    // unique konflikt ushlaydi.
    if (input.clientRequestId) {
      const prior = await this.prisma.client.posDebtPaymentRequest.findFirst({
        where: { accountId, clientRequestId: input.clientRequestId },
        select: { batchId: true },
      });
      if (prior) return this.replayReceipt(accountId, prior.batchId);
    }

    let result: {
      receipts: Array<{ debtName: string; amountMinor: bigint; closed: boolean }>;
      appliedMinor: bigint;
      currency: string;
      /** `[valyuta, delta]` — commit'dan keyingi YAGONA xabar uchun. */
      notices: Array<[string, bigint]>;
    };
    try {
      result = await this.prisma.client.$transaction(async (tx) => {
        // 🔴 IDEMPOTENTLIK QULFI — tranzaksiyaning BIRINCHI yozuvi, ATAYLAB.
        //
        // Ikki parallel (yoki retry) so'rov bir xil kalit bilan kelsa,
        // ikkinchisi AYNAN shu yerda unique konfliktga uchraydi va butun
        // tranzaksiya orqaga qaytadi — hech qanday to'lov qatori, yashiq
        // kirimi yoki balans deltasi qolmaydi. Agar bu yozuv oxirida bo'lsa,
        // konflikt paytida yuqoridagi yozuvlar allaqachon bajarilgan bo'lardi
        // va faqat rollbackka umid qilinardi.
        if (input.clientRequestId) {
          await tx.posDebtPaymentRequest.create({
            data: { accountId, clientRequestId: input.clientRequestId, batchId },
          });
        }

        // `cashDeskId` KLIENTDAN keladi. Mavjudligi va tenant tegishliligi shu
        // yerda tekshiriladi (`retailShiftId` uchun yuqorida allaqachon shunday
        // qilingan — ilgari yashiq id'si ko'r-ko'rona qabul qilinardi); valyutasi
        // esa yashiq deltasi qoidasiga kerak (`debt-cash-ledger.deskCurrency`).
        // QULFDAN OLDIN: bu shunchaki o'qish, qulf ushlab turishga hojat yo'q.
        // Kassa ko'rsatilmagan bo'lsa sentinel qoladi — u solishtirishga yetib
        // bormaydi (`DEBT_LEDGER_CURRENCY` bu yerda semantik XATO bo'lardi:
        // qarz daftari valyutasi ≠ yashiq valyutasi).
        let deskCurrency: string = NO_CASH_DESK_CURRENCY;
        if (input.cashDeskId) {
          const desk = await tx.cashDesk.findFirst({
            where: { id: input.cashDeskId, accountId },
            select: { currency: true },
          });
          if (!desk) throw new BadRequestException('Kassa topilmadi');
          deskCurrency = desk.currency;
        }

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

        // ── BITTA TO'LOV = BITTA XABAR (2026-08-28) ─────────────────────────
        // Balans jurnaliga har qarz O'Z qatorini yozadi (o'zgarmaydi), lekin
        // mijozga/egaga ketadigan xabar HUJJAT darajasida bo'lishi kerak.
        // Bu yerda faqat YIG'INDI to'planadi; hodisa commit'dan KEYIN
        // (`emitDocumentNotice`) chiqariladi.
        //
        // Valyuta KESIMIDA yig'iladi, chunki balans deltasi QARZNING
        // valyutasida yoziladi (`recalcDebt`), `lockOpenDebts` esa valyuta
        // bo'yicha FILTRLAMAYDI. Amalda reyestr `DEBT_LEDGER_CURRENCY` da
        // yuriladi ⇒ ro'yxat bir elementli bo'ladi; bir kun ikkinchi valyuta
        // paydo bo'lsa xabar jimgina noto'g'ri balansni ko'rsatmasin.
        const noticeByCurrency = new Map<string, bigint>();

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
            meta: {
              docType: 'debtpayment',
              docId: batchId,
              organizationId: null,
              // `source` — xabarning TURI («✅ To'lovingiz qabul qilindi»).
              // 2026-08-28 dan beri xabarni bu yerdagi delta EMAS, pastdagi
              // yig'ma `emitDocumentNotice` chiqaradi; `source` esa o'sha
              // xabarga ham shu yerdan ko'chadi.
              source: 'debtpayment',
              // 🔴 Bo'lak xabari YO'Q — pastda butun hujjat uchun bitta xabar
              // chiqariladi. Busiz mijoz FIFO'ning birinchi bo'lagini «to'liq
              // to'lov» deb o'qirdi (2026-08-28 nuqsoni).
              notice: 'defer',
            },
          });

          // Qulf ostidagi qator ⇒ `recalcDebt` ning balans deltasi AYNAN
          // `-alloc.amountMinor` (paidDelta = yangi − eski to'langan, va bu
          // to'lov qatorini shu tranzaksiyadan boshqa hech kim yoza olmaydi).
          noticeByCurrency.set(
            debt.currency,
            (noticeByCurrency.get(debt.currency) ?? 0n) - alloc.amountMinor,
          );

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
            {
              sign: 1n,
              documentId: batchId,
              deskCurrency,
              counterpartyId: input.counterpartyId,
            },
          ),
        );

        return {
          receipts,
          appliedMinor: plan.appliedMinor,
          currency,
          // Valyuta → hujjatning to'liq balans deltasi (manfiy = qarz kamaydi).
          notices: [...noticeByCurrency],
        };
      });
    } catch (e) {
      // Poygada YUTQAZGAN takroriy so'rov: tez yo'l kalitni ko'rmadi (ikkala
      // so'rov bir vaqtda keldi), tranzaksiya esa unique konfliktga urildi va
      // TO'LIQ orqaga qaytdi — hech qanday to'lov qatori, yashiq kirimi yoki
      // balans deltasi qolmadi. Kassirga xato EMAS, BIRINCHI chek qaytariladi:
      // u ikki holatni farqlamasligi kerak va farqlamasligi ham shart.
      if (
        input.clientRequestId &&
        e instanceof PrismaRuntime.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        const prior = await this.prisma.client.posDebtPaymentRequest.findFirst({
          where: { accountId, clientRequestId: input.clientRequestId },
          select: { batchId: true },
        });
        if (prior) return this.replayReceipt(accountId, prior.batchId);
      }
      // Boshqa har qanday xato yuqoriga O'ZGARISHSIZ ketadi. P2002 boshqa
      // unique indeksdan ham kelishi mumkin — kalit qatori topilmasa uni
      // «takror» deb yutib yuborish haqiqiy xatoni YASHIRARDI.
      throw e;
    }

    // ── XABAR: COMMIT'DAN KEYIN, HUJJAT UCHUN BIR MARTA ────────────────────
    // Bu yerdaligi ATAYLAB: tranzaksiya ichida bo'lsa (a) rollbackda mijozga
    // fantom «to'lovingiz qabul qilindi» ketardi, (b) balans o'rta holatda
    // o'qilardi, (c) xabar sarlavhasidagi hujjat sanasi commit'gacha boshqa
    // ulanishga ko'rinmasdi. `emitDocumentNotice` hech qachon throw qilmaydi.
    for (const [noticeCurrency, deltaMinor] of result.notices) {
      await this.balances.emitDocumentNotice({
        accountId,
        counterpartyId: input.counterpartyId,
        currency: noticeCurrency,
        deltaMinor,
        source: 'debtpayment',
        docType: 'debtpayment',
        docId: batchId,
      });
    }

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
      /**
       * Bu javob YANGI to'lov (pul haqiqatan yozildi). Bayroq ikkala shoxda
       * ham BOR — kalitlar to'plami bir xil bo'lsin (`replayReceipt` bilan
       * solishtir): iste'molchi `'replayed' in res` kabi shakl-tekshiruvga
       * tayanmasin, qiymatni o'qisin.
       */
      replayed: false,
    };
  }

  /**
   * TAKRORIY so'rov javobi — AYNI chek, QAYTA HISOBLANMAYDI.
   *
   * Manba `receipt()` — chekni `batchId` bo'yicha yig'adigan YAGONA joy.
   * Bu yerda summa ikkinchi marta hisoblanmaydi: ikkinchi manba muqarrar
   * birinchisidan uzoqlashardi va kassir ikki xil chek ko'rardi.
   *
   * Javob `pay()` ning odatiy shakli bilan bir xil (kalitlar to'plami AYNAN
   * bir xil) — kassir ekrani ikki holatni farqlamaydi va farqlamasligi kerak.
   *
   * ⚠️ `closed`/`closedCount` bu yerda `false`/`0`: `receipt()` qator-darajali
   * «yopildi» belgisini saqlamaydi (u chekdagi summalarni ko'rsatadi, qarz
   * holatini emas). Takror javobda chekning «qarz yopildi» bezagi tushib
   * qoladi — summalar esa AYNAN to'g'ri. Bu ataylab qabul qilingan cheklov:
   * qarz statusini bu yerda qayta o'qish ikkinchi hisob manbaini ochardi.
   */
  private async replayReceipt(accountId: string, batchId: string) {
    const r = await this.receipt(accountId, batchId);
    return {
      batchId,
      receipt: {
        batchId,
        paidMinor: r.paidMinor,
        currency: r.currency,
        originalMinor: r.originalMinor,
        exchangeRate: r.exchangeRate,
        method: r.method,
        lines: r.lines.map((l) => ({
          debtName: l.debtName,
          amountMinor: l.amountMinor,
          closed: false,
        })),
        outstandingAfterMinor: r.outstandingAfterMinor,
      },
      closedCount: 0,
      /** 🔴 Bu javob TAKROR — yangi pul YOZILMADI. */
      replayed: true,
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
        // `phone` — chek shapkasida (tovar-chek shabloni, 2026-08-16).
        select: { name: true, legalTitle: true, phone: true },
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
