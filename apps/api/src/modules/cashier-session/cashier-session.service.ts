import type { Prisma } from '@moysklad/db';
import { scaleMinorByQty } from '@moysklad/money';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { allocateDocumentNumber } from '../../prisma/document-number.js';
import { PrismaService } from '../../prisma/prisma.service.js';
// P4 — «unutilgan smena» chegarasi MK13 registrida (ikkinchi sozlama manbai
// yaratilmaydi — `sla-thresholds-in-rule-config-table` intizomi).
//
// 🔴 Qator tipi `manager/queue` dan IMPORT QILINMAYDI: `queue-does-not-block`
// arxitektura qulfi navbat modulini faqat `manager.module.ts` ga ochadi
// (MK06 §5.1 — «navbat hech narsani bloklamaydi» YO'Q-xususiyatining
// yagona isboti shu). Shuning uchun tip registr funksiyasining O'ZIDAN
// olinadi.
import {
  MANAGER_THRESHOLD,
  MANAGER_THRESHOLDS,
  effectiveThreshold,
  resolveManagerThresholds,
} from '../manager/thresholds/manager-thresholds.js';
// Faza 4 (2026-08-12) — yashiq amallari UMUMIY pul daftariga yozadi. Ilgari bu
// modulda `applyDeltas` chaqirig'i UMUMAN yo'q edi (grep → 0).
import { MoneyService } from '../money/money.service.js';
// Amaldagi ruxsat KANONIK hal qiluvchisi (rollar MAX'i + MK26 override).
import { type RoleGrant, resolveEffective } from '../permissions/employee-permission.js';
import type { PermissionScope } from '../permissions/permissions.types.js';
// Faza Q1 (SALES-08): «to'lovgacha bo'lgan holatlar» ro'yxati YAGONA manbadan.
// `close()` qo'lda `['draft','picking','ready']` yozsa, FSM'ga yangi oraliq
// holat qo'shilgan kuni u jimgina yopilgan smenada osilib qolardi.
import { allowedFrom } from '../retail-sale/retail-sale-fsm.js';
// Faza Q1: tender qiymati ('DEBT') — Z-hisobotdagi «qarzga sotildi» so'rovi
// uni HARFMA-HARF takrorlamasin (`'debt'` yozilgani uchun ko'rsatkich doim 0 edi).
import { TENDER } from '../retail-sale/retail-tenders.js';
import { resolveCreatorGroupId } from '../shared/group-stamp.js';
// Pure, adversarially-tested shift cash reconciliation (the §74 pattern;
// fixes the §100 latent bug — drawer in/out were omitted from expected).
import {
  type ShiftCashInputs,
  type ShiftUsdCashInputs,
  expectedCashMinor,
  expectedUsdCashMinor,
  shiftDiscrepancyMinor,
  shiftUsdDiscrepancyMinor,
} from './cashier-session-reconciliation.js';
import {
  CloseSessionSchema,
  DrawerCashSchema,
  OpenSessionSchema,
  PosCashOutSchema,
  SessionFilterSchema,
} from './cashier-session.schema.js';
// Yashiq amalining pul-daftari tomoni — sof modul (ishorani FAQAT u qo'yadi).
import { drawerMoneyDeltas } from './drawer-money-ledger.js';
// Xarajat/inkassatsiya qoidalari — sof modul (§8.2/§8.3).
import {
  type CashOutKind,
  cashOutLedgerLabel,
  cashOutPrefix,
  planCashOutAuditEvents,
  summarizeCashOut,
  validateCashOut,
} from './pos-cash-out.js';
// MK08 — smena yopilishi bilan MENEJER qabuli navbatiga tushadi.
import {
  SHIFT_ACCEPTANCE_ACTION,
  SHIFT_ACCEPTANCE_STATE,
  SHIFT_ACTOR,
} from './shift-acceptance.js';
// Farq akti va Z-hisobot qoidalari — sof modul (§8.4/§8.5).
import {
  type VarianceAct,
  buildZReport,
  formatVarianceMessage,
  planVarianceActs,
} from './shift-variance.js';
// P4 — smena yoshi va «allaqachon ochiq» xabari (sof modul).
import { describeShiftAge, formatOpenShiftConflict } from './stale-shift.js';
// P3 — yopilishni bloklovchi yakunlanmagan cheklar xabari (sof modul).
import { describeUnresolvedSales } from './unresolved-sales.js';
// H7 (P4) — farq xabari kimga boradi (sof modul).
import {
  type VarianceCandidate,
  type VarianceRecipient,
  type VarianceScope,
  type VarianceSessionRef,
  selectVarianceRecipients,
} from './variance-recipients.js';

/** Hisob valyutasi — Z-hisobotdagi jamilar shu valyutada (MK31). */
const BASE_CURRENCY = 'UZS';

/**
 * Farq xabarini oladigan ruxsat (H7). `update` EMAS — sabab
 * `resolveVarianceRecipients` izohida.
 */
const VARIANCE_ENTITY = 'cashiersession';
const VARIANCE_ACTION = 'approve';

/**
 * CashierSessionService — manages cashier shift lifecycle.
 *
 * Invariants:
 *   - One open session per cashier at a time.
 *   - Closing requires all draft RetailSales to be resolved first.
 *   - expectedCashMinor = openingCashMinor + cashSalesSum - cashReturnsSum
 *     (cash portion of sales/returns only).
 *   - discrepancyMinor = closingCashMinor - expectedCashMinor
 */
@Injectable()
export class CashierSessionService {
  private readonly logger = new Logger(CashierSessionService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(MoneyService) private readonly money: MoneyService,
  ) {}

  async list(accountId: string, rawFilter: unknown) {
    const filter = SessionFilterSchema.parse(rawFilter);
    const where: Prisma.CashierSessionWhereInput = {
      accountId,
      ...(filter.state ? { state: filter.state } : {}),
      ...(filter.cashierId ? { cashierId: filter.cashierId } : {}),
      ...(filter.cashDeskId ? { cashDeskId: filter.cashDeskId } : {}),
      ...(filter.storeId ? { storeId: filter.storeId } : {}),
      ...(filter.search
        ? {
            OR: [
              { cashier: { name: { contains: filter.search, mode: 'insensitive' } } },
              { description: { contains: filter.search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(filter.dateFrom || filter.dateTo
        ? {
            openedAt: {
              ...(filter.dateFrom ? { gte: filter.dateFrom } : {}),
              ...(filter.dateTo ? { lte: filter.dateTo } : {}),
            },
          }
        : {}),
    };

    const rows = await this.prisma.client.cashierSession.findMany({
      where,
      orderBy: { [filter.sortBy]: filter.sortDir },
      take: filter.limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      include: {
        cashier: { select: { id: true, name: true, email: true } },
        cashDesk: { select: { id: true, name: true, currency: true } },
        store: { select: { id: true, name: true } },
        organization: { select: { id: true, name: true } },
      },
    });

    const hasMore = rows.length > filter.limit;
    const items = hasMore ? rows.slice(0, filter.limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;
    const total = await this.prisma.client.cashierSession.count({ where });
    return { items, nextCursor, total };
  }

  async findById(accountId: string, id: string) {
    const session = await this.prisma.client.cashierSession.findFirst({
      where: { id, accountId },
      include: {
        cashier: { select: { id: true, name: true, email: true } },
        cashDesk: { select: { id: true, name: true, currency: true, balanceMinor: true } },
        store: { select: { id: true, name: true } },
        organization: { select: { id: true, name: true, legalTitle: true } },
        _count: { select: { sales: true } },
      },
    });
    if (!session) throw new NotFoundException(`CashierSession ${id} not found`);
    return session;
  }

  /**
   * Returns the active (open) session for a specific cashier, or null.
   *
   * P4 — javobga smena YOSHI qo'shiladi (`openMinutes` · `staleWarnHours` ·
   * `stale`). Yoshni SERVER hisoblaydi, ekran emas: chegara MK13 registrida
   * yashaydi va POS uni bilmaydi. «Ekran va server bitta manbadan» intizomi
   * (`price-floor-min-cost-or-card` saboqi) — aks holda ogohlantirish
   * chegarasi ikki joyda ikki xil bo'lardi.
   */
  async findCurrentForCashier(accountId: string, cashierId: string) {
    const session = await this.prisma.client.cashierSession.findFirst({
      where: { accountId, cashierId, state: 'open' },
      include: {
        // `cashier` MUST be included — the /retail POS register renders
        // `session.cashier.name` in its header, so omitting it crashed the
        // whole page with a client-side TypeError (undefined.name) whenever a
        // session was open. Mirrors list()/findOne()/open()/close(). (2026-06-08k)
        cashier: { select: { id: true, name: true } },
        cashDesk: { select: { id: true, name: true, currency: true } },
        store: { select: { id: true, name: true } },
        organization: { select: { id: true, name: true } },
      },
    });
    if (!session) return null;
    const age = describeShiftAge({
      openedAt: session.openedAt,
      now: new Date(),
      warnHours: await this.resolveShiftWarnHours(accountId),
    });
    return {
      ...session,
      openMinutes: age.openMinutes,
      staleWarnHours: age.warnHours,
      stale: age.stale,
    };
  }

  /**
   * «Unutilgan smena» chegarasi (soat) — MK13 registridan, `null` = o'chirilgan.
   *
   * Sozlama o'qib bo'lmasa registr SUKUTIGA qaytadi: chegarani o'qiy
   * olmaganimiz uchun butun POS ekranini yiqitish mutlaqo o'rinsiz bo'lardi.
   */
  private async resolveShiftWarnHours(accountId: string): Promise<number | null> {
    try {
      const rows = await this.prisma.client.managerRuleConfig.findMany({
        where: { accountId, ruleType: MANAGER_THRESHOLD.shiftOpenWarnHours },
        select: {
          ruleType: true,
          enabled: true,
          thresholdValue: true,
          thresholdUnit: true,
          mode: true,
          severity: true,
        },
      });
      const resolved = resolveManagerThresholds(
        rows as unknown as Parameters<typeof resolveManagerThresholds>[0],
      ).get(MANAGER_THRESHOLD.shiftOpenWarnHours);
      return resolved
        ? effectiveThreshold(resolved)
        : MANAGER_THRESHOLDS[MANAGER_THRESHOLD.shiftOpenWarnHours].defaultValue;
    } catch (err) {
      this.logger.warn(`Smena chegarasi o'qilmadi, sukut qo'llanadi: ${(err as Error).message}`);
      return MANAGER_THRESHOLDS[MANAGER_THRESHOLD.shiftOpenWarnHours].defaultValue;
    }
  }

  async open(accountId: string, cashierId: string, raw: unknown) {
    const parsed = OpenSessionSchema.parse(raw);

    // Invariant: one open session per cashier at a time. Two layers:
    //   1. Friendly pre-check — returns the existing session id in the error
    //      message so the cashier UI can offer to close it before opening a
    //      new one.
    //   2. DB-level partial unique index `cashier_sessions_open_per_cashier_idx`
    //      (`WHERE state='open'`) makes this invariant atomic under concurrent
    //      opens. The catch below maps the resulting P2002 to ConflictException.
    const existing = await this.prisma.client.cashierSession.findFirst({
      where: { accountId, cashierId, state: 'open' },
    });
    if (existing) {
      // P4 — xabar endi MA'LUMOTLI: qaysi smena, qachondan beri, nima
      // qilish kerak. Ilgari kassir faqat inglizcha UUID ko'rardi.
      throw new ConflictException(
        formatOpenShiftConflict({
          age: describeShiftAge({
            openedAt: existing.openedAt,
            now: new Date(),
            warnHours: await this.resolveShiftWarnHours(accountId),
          }),
          sessionId: existing.id,
          sessionName: existing.name,
        }),
      );
    }

    // Verify refs exist
    await this.ensureCashDesk(accountId, parsed.cashDeskId);
    await this.ensureStore(accountId, parsed.storeId);
    await this.ensureOrganization(accountId, parsed.organizationId);

    const creatorGroupId = await resolveCreatorGroupId(this.prisma.client, accountId, cashierId);

    try {
      return await this.prisma.client.cashierSession.create({
        data: {
          accountId,
          cashierId,
          groupId: creatorGroupId,
          cashDeskId: parsed.cashDeskId,
          storeId: parsed.storeId,
          organizationId: parsed.organizationId,
          openingCashMinor: BigInt(parsed.openingCashMinor),
          // MK31 (§8.1) — ochilish naqdi UZS va USD alohida.
          openingCashUsdMinor: BigInt(parsed.openingCashUsdMinor),
          // Were parsed from OpenSessionSchema but silently dropped before
          // (lossy create — §8.3 pattern). Persist both header fields.
          description: parsed.description ?? null,
          externalCode: parsed.externalCode ?? null,
          state: 'open',
        },
        include: {
          cashier: { select: { id: true, name: true } },
          cashDesk: { select: { id: true, name: true } },
          store: { select: { id: true, name: true } },
          organization: { select: { id: true, name: true } },
        },
      });
    } catch (e) {
      if (
        typeof e === 'object' &&
        e !== null &&
        'code' in e &&
        (e as { code: string }).code === 'P2002'
      ) {
        throw new ConflictException(
          'Cashier already has an open session (concurrent open detected). Close it first.',
        );
      }
      throw e;
    }
  }

  async close(accountId: string, cashierId: string, sessionId: string, raw: unknown) {
    const parsed = CloseSessionSchema.parse(raw);

    const session = await this.prisma.client.cashierSession.findFirst({
      where: { id: sessionId, accountId },
    });
    if (!session) throw new NotFoundException(`CashierSession ${sessionId} not found`);
    if (session.state !== 'open') {
      throw new BadRequestException(`Session is already ${session.state}`);
    }
    if (session.cashierId !== cashierId) {
      throw new BadRequestException('Only the cashier who opened the session can close it');
    }

    const closingCash = BigInt(parsed.closingCashMinor);
    // MK31 (§8.4): `null` = «dollar sanalmagan», `0n` = «sanadim, dollar
    // yo'q». Ikkalasi hech qachon aralashtirilmaydi.
    const closingCashUsd =
      parsed.closingCashUsdMinor != null ? BigInt(parsed.closingCashUsdMinor) : null;

    // Faza Q1 (SALES-07): sanoq + flip BITTA Serializable tranzaksiyada.
    // Ilgari agregatlar tranzaksiyadan tashqarida o'qilardi, ya'ni o'qish bilan
    // flip orasida `post()` yugurib chek qo'shsa, uning naqdi kutilganda
    // KO'RINMASDI — kassirga tushuntirib bo'lmaydigan kamomad yozilardi.
    // `post()` tomonida juftlik: smenani `state:'open'` sharti bilan claim
    // qiladi, shuning uchun yopish poygasida faqat bittasi o'tadi.
    const closed = await this.prisma.client.$transaction(
      async (tx) => {
        // Faza Q1 (SALES-08): faqat `draft` emas — YIG'ILAYOTGAN cheklar ham.
        // `picking`/`ready` chek yopilgan smenada osilib qolardi: uni endi post
        // qilib ham bo'lmaydi (`post()` ochiq smena talab qiladi), bekor qilish
        // esa kassirga taklif qilinmasdi.
        const pending = [...allowedFrom('cancel')];
        // P3 (egasi qarori, 2026-08-12): to'siq QOLADI, lekin endi ROʻYXAT
        // bilan. Avto-bekor ATAYLAB YO'Q — tizim kassirning o'rniga pul
        // qarorini qabul qilmaydi (haqiqiy mijoz kutayotgan chek jimgina
        // yo'qolib ketardi). Kassir har chekni O'ZI to'laydi yoki bekor
        // qiladi; P3 dan beri uning ikkalasiga ham ruxsati bor.
        //
        // Ilgari bu yerda faqat SON bor edi va xabar inglizcha edi
        // («Session has 4 unresolved sale(s)…»). Kassir qaysi chek ekanini
        // bilmasdi: prodda 5 ta qotgan chek turibdi va ular POS ro'yxatida
        // ikki BOSHQA bo'limda yotadi. Endi nom + summa aytiladi.
        const unresolvedSales = await tx.retailSale.findMany({
          where: { accountId, sessionId, state: { in: pending } },
          select: { name: true, state: true, sumMinor: true },
          orderBy: { createdAt: 'asc' },
        });
        if (unresolvedSales.length > 0) {
          throw new BadRequestException(describeUnresolvedSales(unresolvedSales));
        }

        const cashInputs = await this.collectCashInputs(
          tx,
          accountId,
          sessionId,
          session.openingCashMinor,
        );
        const expectedCash = expectedCashMinor(cashInputs);
        const discrepancy = shiftDiscrepancyMinor(closingCash, cashInputs);

        // MK31 — dollar yashiq (§8.4). Sentda, so'mga o'girilmaydi.
        const usdInputs = await this.collectUsdCashInputs(
          tx,
          accountId,
          sessionId,
          session.openingCashUsdMinor,
        );
        const expectedUsd = expectedUsdCashMinor(usdInputs);
        // Dollar oqimi bo'lgan smenani sanoqsiz yopib bo'lmaydi: jim 0 deb
        // qabul qilsak, yashiqdagi dollar o'lchanmay qolardi (MK31 gacha
        // bo'lgan holatning o'zi), yoki to'liq kamomad akti yozilardi.
        if (expectedUsd !== 0n && closingCashUsd === null) {
          throw new BadRequestException(
            `Smenada dollar naqd oqimi bor (kutilgan ${expectedUsd.toString()} sent) — sanalgan dollarni kiriting.`,
          );
        }
        const discrepancyUsd =
          closingCashUsd === null ? null : shiftUsdDiscrepancyMinor(closingCashUsd, usdInputs);
        // Dollarga UMUMAN tegilmagan smenada ustunlar NULL bo'lib qoladi:
        // aks holda «dollar bilan ishlamaydigan kassa» va «dollar sanaldi,
        // 0 chiqdi» hisobotlarda bir xil ko'rinardi.
        const usdTouched = expectedUsd !== 0n || closingCashUsd !== null;

        // Atomic state guard: 'open' → 'closed'. Two concurrent close() calls
        // would otherwise both succeed (both reads see 'open', both updates
        // target the same id), with the second overwriting
        // closingCash/expected/discrepancy computed from a stale aggregate
        // read. updateMany returns count=0 if the session has already been
        // closed by a peer.
        const closedAt = new Date();
        const flipResult = await tx.cashierSession.updateMany({
          where: { id: sessionId, accountId, state: 'open' },
          data: {
            state: 'closed',
            closedAt,
            closingCashMinor: closingCash,
            expectedCashMinor: expectedCash,
            discrepancyMinor: discrepancy,
            ...(usdTouched
              ? {
                  closingCashUsdMinor: closingCashUsd,
                  expectedCashUsdMinor: expectedUsd,
                  discrepancyUsdMinor: discrepancyUsd,
                }
              : {}),
            // MK08 — yopilgan smena MENEJER navbatiga tushadi
            // (`open_for_review`). Ayni `updateMany` ichida: agar keyin
            // alohida yozilsa va oradagi xato yuz bersa, smena yopilgan-u
            // hech kimning stolida ko'rinmaydigan holatda qolardi.
            acceptanceState: SHIFT_ACCEPTANCE_STATE.pending,
            acceptanceChangedAt: closedAt,
            // Persist the close-time note only when supplied — a non-
            // destructive conditional set (codebase-wide convention) so a
            // close without a note keeps the open-time description (§24).
            ...(parsed.description != null ? { description: parsed.description } : {}),
          },
        });
        if (flipResult.count === 0) {
          throw new ConflictException(
            `Session ${sessionId} state changed; close aborted (already closed?)`,
          );
        }
        // Qabul jurnalining BIRINCHI qatori — «tizim ko'rikka qo'ydi».
        // Busiz jurnal menejerning birinchi bosishidan boshlanardi va
        // «qachondan beri kutmoqda» savoliga javob yo'q bo'lardi.
        await tx.cashierSessionAcceptanceEvent.create({
          data: {
            accountId,
            sessionId,
            fromState: SHIFT_ACCEPTANCE_STATE.open,
            toState: SHIFT_ACCEPTANCE_STATE.pending,
            action: SHIFT_ACCEPTANCE_ACTION.openForReview,
            actorType: SHIFT_ACTOR.system,
            actorId: null,
          },
        });
        return { expectedCash, discrepancy, expectedUsd };
      },
      { isolationLevel: 'Serializable', timeout: 15000 },
    );

    // Farq akti — holat allaqachon 'closed' ga o'tgandan KEYIN. Tartib
    // muhim: `updateMany` optimistik qulf, ya'ni faqat BITTA chaqiruv shu
    // yergacha yetadi. Aktni oldin yozsak, poyga yutqazgan ikkinchi
    // chaqiruv ham akt yozib qo'yardi.
    await this.recordVariance({
      accountId,
      sessionId,
      cashierId,
      expectedCash: closed.expectedCash,
      closingCash,
      expectedUsd: closed.expectedUsd,
      closingCashUsd,
      varianceNote: parsed.varianceNote ?? null,
    });

    return this.prisma.client.cashierSession.findUniqueOrThrow({
      where: { id: sessionId, accountId },
      include: {
        cashier: { select: { id: true, name: true } },
        cashDesk: { select: { id: true, name: true } },
        store: { select: { id: true, name: true } },
        organization: { select: { id: true, name: true } },
      },
    });
  }

  /**
   * Smenaning naqd kirim/chiqimlarini yig'adi (kutilgan naqd manbasi).
   *
   * ALOHIDA metod: smena yopish ham, xarajat/inkassatsiya ham «yashiqda
   * hozir qancha bor» ni bilishi kerak. Nusxalash ikki formula qoldirardi
   * va biri jimgina eskirardi — §100 bug'i («drawer in/out kutilgan
   * naqddan tushib qolgan edi») aynan shu klassdan chiqqan.
   */
  private async collectCashInputs(
    db: Prisma.TransactionClient,
    accountId: string,
    sessionId: string,
    openingCashMinor: bigint,
  ): Promise<ShiftCashInputs> {
    const [cashAgg, refundAgg, debtCashAgg, drawerInAgg, drawerOutAgg] = await Promise.all([
      // Faza Q1 (SALES-02):
      //  · `refundedFromId: null` — OYNA cheklar bu yerga TUSHMASLIGI kerak.
      //    Ular ham `posted`, ya'ni ilgari sotuvga ham (+), qaytarishga ham (−)
      //    kirib, bir-birini yeb qo'yardi: qaytarish kutilgan naqdga UMUMAN
      //    ta'sir qilmasdi.
      //  · `− Σ changeMinor` — `cashAmountMinor` BERILGAN naqd, yashiqqa esa
      //    `cashAmount − change` tushadi (`retail-sale.service.ts` money-ledger
      //    aynan shuni yozadi). Qaytim ayirilmasa kutilgan naqd har qaytim
      //    summasicha ko'p bo'lib, kassirga SOXTA KAMOMAD yozilardi.
      //  · `refunded` holat qoladi: to'liq qaytarilgan chekning naqdi yashiqqa
      //    TUSHGAN edi (Faza 7 semantikasi), uni tushirib qoldirish ikkinchi
      //    marta ayirish bilan teng.
      db.retailSale.aggregate({
        where: {
          accountId,
          sessionId,
          state: { in: ['posted', 'refunded'] },
          refundedFromId: null,
        },
        _sum: { cashAmountMinor: true, changeMinor: true },
      }),
      db.retailSale.aggregate({
        where: { accountId, sessionId, state: 'posted', refundedFromId: { not: null } },
        _sum: { cashAmountMinor: true },
      }),
      // Kassa TZ §8.4 — «+ naqd qarz to'lovlari». Busiz kassir qabul qilgan
      // qarz puli yashiqda turadi-yu, kutilgan naqdda ko'rinmaydi va smena
      // har safar shu summaga ORTIQCHA (излишек) chiqardi.
      // Faqat NAQD: terminal to'lovi yashiqqa tushmaydi.
      //
      // 🔴 `currency: BASE_CURRENCY` (F6, audit §F6.6) — `DebtPayment.amountMinor`
      // HAR DOIM so'm ekvivalentida. Valyuta filtrisiz DOLLARDA qabul qilingan
      // to'lov ham shu yig'indiga tushardi: yashiqqa dollar kirar, so'm-kutilgani
      // esa dollarning so'm qiymatiga oshib ketar edi ⇒ SOXTA SO'M KAMOMADI.
      // Dollar to'lovlari `collectUsdCashInputs` da, o'z sanoq birligida.
      db.debtPayment.aggregate({
        where: {
          accountId,
          retailShiftId: sessionId,
          method: 'cash',
          currency: BASE_CURRENCY,
          reversedAt: null,
        },
        _sum: { amountMinor: true },
      }),
      // 🔴 `currency: BASE_CURRENCY` (F6, audit §F6.7): yashiq hujjatiga KASSA
      // valyutasi yoziladi (`loadOpenShiftForDrawer`), ya'ni so'm bo'lmagan
      // kassada sent shu so'm formulasiga qo'shilib ketardi. Bugungi bazada
      // hammasi UZS — filtr xulqni o'zgartirmaydi, kelajakdagi jim xatoni yopadi.
      db.retailDrawerCashIn.aggregate({
        where: {
          accountId,
          retailShiftId: sessionId,
          state: 'posted',
          deletedAt: null,
          currency: BASE_CURRENCY,
        },
        _sum: { sumMinor: true },
      }),
      // Xarajat (РКО) va inkassatsiya (ИНК) ham SHU jadvalda — tasnifi
      // `kind` da. Shuning uchun ular formulaga o'z-o'zidan kiradi va
      // «yangi turni qo'shishni unutish» xatosi tug'ilmaydi (§8.2/§8.3).
      db.retailDrawerCashOut.aggregate({
        where: {
          accountId,
          retailShiftId: sessionId,
          state: 'posted',
          deletedAt: null,
          currency: BASE_CURRENCY,
        },
        _sum: { sumMinor: true },
      }),
    ]);

    return {
      openingCashMinor,
      salesCashMinor: (cashAgg._sum.cashAmountMinor ?? 0n) - (cashAgg._sum.changeMinor ?? 0n),
      drawerInMinor: drawerInAgg._sum.sumMinor ?? 0n,
      drawerOutMinor: drawerOutAgg._sum.sumMinor ?? 0n,
      returnsCashMinor: refundAgg._sum.cashAmountMinor ?? 0n,
      debtCashMinor: debtCashAgg._sum.amountMinor ?? 0n,
    };
  }

  /**
   * Smenaning DOLLAR kirim/chiqimi — sentda (MK31 · §8.4).
   *
   * Manba `RetailSalePayment` qatorlari, `RetailSale.cashAmountMinor` EMAS:
   * o'sha ustun so'm semantikasida qoladi (`retail-tenders.legacyTotals`
   * dagi sabab) va unga dollarni qo'shish so'm kutilganini buzardi.
   *
   * Qaytim a'zosi YO'Q: qaytim doim so'mda beriladi (yashiqdagi dollarni
   * maydalash yo'li yo'q), ya'ni yashiqqa tushgan dollar — to'lovning
   * to'liq summasi.
   */
  private async collectUsdCashInputs(
    db: Prisma.TransactionClient,
    accountId: string,
    sessionId: string,
    openingUsdMinor: bigint,
  ): Promise<ShiftUsdCashInputs> {
    const [salesAgg, refundAgg, debtUsdAgg] = await Promise.all([
      db.retailSalePayment.aggregate({
        where: {
          accountId,
          method: TENDER.cashUsd,
          // Holat filtri so'm oqimi bilan bir xil: OYNA (qaytarish) cheklar
          // bu yerga tushmaydi, aks holda ular ham (+), ham (−) bo'lib
          // bir-birini yeb qo'yardi.
          sale: {
            accountId,
            sessionId,
            state: { in: ['posted', 'refunded'] },
            refundedFromId: null,
          },
        },
        _sum: { amountMinor: true },
      }),
      db.retailSalePayment.aggregate({
        where: {
          accountId,
          method: TENDER.cashUsd,
          sale: { accountId, sessionId, state: 'posted', refundedFromId: { not: null } },
        },
        _sum: { amountMinor: true },
      }),
      // F6 (audit §F6.6) — DOLLARDA qabul qilingan NAQD QARZ to'lovi.
      //
      // 🔴 `amountOriginalMinor` o'qiladi, `amountMinor` EMAS: ikkinchisi so'm
      // ekvivalenti va uni sent deb qo'shish yashiqdagi dollarni ~12 000×
      // ko'paytirardi. Manba ajratmasi so'm tomonidagi `currency: BASE_CURRENCY`
      // filtri bilan JUFT — bir to'lov ikkala jamiga ham tushmaydi.
      db.debtPayment.aggregate({
        where: {
          accountId,
          retailShiftId: sessionId,
          method: 'cash',
          currency: 'USD',
          reversedAt: null,
        },
        _sum: { amountOriginalMinor: true },
      }),
    ]);

    return {
      openingUsdMinor,
      salesUsdMinor: salesAgg._sum.amountMinor ?? 0n,
      returnsUsdMinor: refundAgg._sum.amountMinor ?? 0n,
      debtUsdMinor: debtUsdAgg._sum.amountOriginalMinor ?? 0n,
    };
  }

  // ---- Drawer cash in/out (Внесение / Изъятие) — §100/§101 ----

  /**
   * Shared guard for drawer operations: the shift must exist, be OPEN,
   * and belong to the acting cashier. Returns the session (with cashDesk
   * currency) so the drawer doc is recorded in the till's currency.
   */
  private async loadOpenShiftForDrawer(accountId: string, cashierId: string, sessionId: string) {
    const session = await this.prisma.client.cashierSession.findFirst({
      where: { id: sessionId, accountId },
      include: { cashDesk: { select: { currency: true } } },
    });
    if (!session) throw new NotFoundException(`CashierSession ${sessionId} not found`);
    if (session.state !== 'open') {
      throw new BadRequestException(
        `Shift is ${session.state}; drawer cash operations require an OPEN shift`,
      );
    }
    if (session.cashierId !== cashierId) {
      throw new BadRequestException(
        'Only the cashier who opened the shift can perform drawer operations',
      );
    }
    // 🔴 F6 (audit §F6.7) — SO'M BO'LMAGAN KASSA QO'LLAB-QUVVATLANMAYDI.
    //
    // Yashiq hujjatiga kassa valyutasi yoziladi (`currency: cashDesk.currency`),
    // smena hisobining butun oqimi esa so'm semantikasida: `openingCashMinor`,
    // sotuv naqdi, `expectedCashMinor`, farq akti. Dollar-kassada sent shu
    // formulaga 1 sent = 1 tiyin bo'lib kirar edi — kutilgan naqd JIMGINA
    // buzilardi va kassir tushuntirib bo'lmaydigan farqqa javob berardi.
    //
    // Shuning uchun to'liq qo'llab-quvvatlashgacha — OCHIQ to'xtash. Jim
    // noto'g'ri hisob ancha qimmatga tushadi (dollar oqimi `CASH_USD` tenderi
    // va F6 dollar qarz to'lovi orqali ALOHIDA sanaladi).
    if (session.cashDesk.currency !== BASE_CURRENCY) {
      throw new BadRequestException(
        `Kassa valyutasi ${session.cashDesk.currency} — yashiq amallari faqat ${BASE_CURRENCY} kassada qo'llab-quvvatlanadi`,
      );
    }
    return session;
  }

  /** Внесение наличных — add cash to the drawer during an open shift. */
  async drawerCashIn(accountId: string, cashierId: string, sessionId: string, raw: unknown) {
    const parsed = DrawerCashSchema.parse(raw);
    const session = await this.loadOpenShiftForDrawer(accountId, cashierId, sessionId);
    const year = new Date().getFullYear();
    const prefix = `ВН-${year}-`;
    const n = await allocateDocumentNumber(this.prisma.client, accountId, prefix, async () => {
      const last = await this.prisma.client.retailDrawerCashIn.findFirst({
        where: { accountId, name: { startsWith: prefix } },
        orderBy: { name: 'desc' },
        select: { name: true },
      });
      return last ? Number.parseInt(last.name.slice(prefix.length), 10) || 0 : 0;
    });
    const name = `${prefix}${String(n).padStart(5, '0')}`;
    const creatorGroupId = await resolveCreatorGroupId(this.prisma.client, accountId, cashierId);

    // 🔴 HUJJAT VA DAFTAR BITTA TRANZAKSIYADA (Faza 4, 2026-08-12). Ilgari
    // hujjat yolg'iz yaratilardi va yashiq qoldig'i umuman qimirlamasdi —
    // `CashDesk.balanceMinor` faqat kirim yo'llaridan shishardi.
    return this.prisma.client.$transaction(async (tx) => {
      const doc = await tx.retailDrawerCashIn.create({
        data: {
          accountId,
          ownerId: cashierId,
          groupId: creatorGroupId,
          name,
          retailShiftId: sessionId,
          organizationId: session.organizationId,
          sumMinor: BigInt(parsed.sumMinor),
          currency: session.cashDesk.currency,
          moment: new Date(),
          applicable: true,
          state: 'posted',
          postedAt: new Date(),
          description: parsed.description ?? null,
        },
      });
      await this.money.applyDeltas(
        tx,
        accountId,
        drawerMoneyDeltas({
          kind: 'in',
          cashDeskId: session.cashDeskId,
          currency: session.cashDesk.currency,
          sumMinor: doc.sumMinor,
          documentId: doc.id,
          description: `Внесение ${doc.name}`,
        }),
      );
      return doc;
    });
  }

  /** Изъятие наличных — remove cash from the drawer during an open shift. */
  async drawerCashOut(accountId: string, cashierId: string, sessionId: string, raw: unknown) {
    const parsed = DrawerCashSchema.parse(raw);
    const session = await this.loadOpenShiftForDrawer(accountId, cashierId, sessionId);
    const year = new Date().getFullYear();
    const prefix = `ИЗ-${year}-`;
    const n = await allocateDocumentNumber(this.prisma.client, accountId, prefix, async () => {
      const last = await this.prisma.client.retailDrawerCashOut.findFirst({
        where: { accountId, name: { startsWith: prefix } },
        orderBy: { name: 'desc' },
        select: { name: true },
      });
      return last ? Number.parseInt(last.name.slice(prefix.length), 10) || 0 : 0;
    });
    const name = `${prefix}${String(n).padStart(5, '0')}`;
    const creatorGroupId = await resolveCreatorGroupId(this.prisma.client, accountId, cashierId);

    // 🔴 Kirim yo'li bilan AYNI naqsh — farqi faqat ishorada, uni esa sof
    // modul qo'yadi. Bu yerdan boshlab yashiqda yo'q pulni chiqarib
    // bo'lmaydi: `applyDeltas` overdraft qo'riqchisi tranzaksiyani qaytaradi.
    return this.prisma.client.$transaction(async (tx) => {
      const doc = await tx.retailDrawerCashOut.create({
        data: {
          accountId,
          ownerId: cashierId,
          groupId: creatorGroupId,
          name,
          retailShiftId: sessionId,
          organizationId: session.organizationId,
          sumMinor: BigInt(parsed.sumMinor),
          currency: session.cashDesk.currency,
          moment: new Date(),
          applicable: true,
          state: 'posted',
          postedAt: new Date(),
          description: parsed.description ?? null,
        },
      });
      await this.money.applyDeltas(
        tx,
        accountId,
        drawerMoneyDeltas({
          kind: 'out',
          cashDeskId: session.cashDeskId,
          currency: session.cashDesk.currency,
          sumMinor: doc.sumMinor,
          documentId: doc.id,
          description: `Изъятие ${doc.name}`,
        }),
      );
      return doc;
    });
  }

  /**
   * Farq akti (`CashierSessionVariance`) + menejerga xabar — kassa TZ §8.4.
   *
   * ⚠️ **Yopishni yiqitmaydi.** Akt yozish yoki xabar navbatiga qo'yish
   * xato bersa, smena YOPILGAN holida qoladi: kassir ishini davom ettira
   * olishi kerak, aks holda bir texnik nosozlik butun kassani to'xtatardi.
   * Xato jurnalga tushadi, farq esa `CashierSession.discrepancyMinor` da
   * baribir saqlangan.
   *
   * Idempotent: `@@unique([sessionId, currency])` tufayli takroriy
   * urinish yangi akt yaratmaydi (`skipDuplicates`).
   */
  private async recordVariance(args: {
    accountId: string;
    sessionId: string;
    cashierId: string;
    expectedCash: bigint;
    closingCash: bigint;
    expectedUsd: bigint;
    closingCashUsd: bigint | null;
    varianceNote: string | null;
  }): Promise<VarianceAct[]> {
    // Har valyuta O'Z aktini oladi va o'z sanoq birligida qoladi (§8.4):
    // dollarni kurs bilan so'mga o'girish yo'qolgan dollarni «taxminiy
    // so'm»ga aylantirib, aktni dalil bo'lishdan to'xtatardi.
    //
    // MK31: dollar akti faqat dollar SANALGAN bo'lsa rejalanadi. Sanalmagan
    // (`null`) ni 0 deb olsak, dollar oqimi bo'lgan har smenada to'liq
    // kamomad akti chiqardi — ya'ni bu fazagacha bo'lgan «soxta signal»
    // xavfi teskari tomondan qaytardi. (`close()` esa dollar oqimi bor
    // smenani sanoqsiz yopishga umuman yo'l qo'ymaydi.)
    const acts = planVarianceActs([
      { currency: 'UZS', expectedMinor: args.expectedCash, countedMinor: args.closingCash },
      ...(args.closingCashUsd != null
        ? [
            {
              currency: 'USD',
              expectedMinor: args.expectedUsd,
              countedMinor: args.closingCashUsd,
            },
          ]
        : []),
    ]);
    if (acts.length === 0) return [];

    try {
      await this.prisma.client.cashierSessionVariance.createMany({
        data: acts.map((a) => ({
          accountId: args.accountId,
          sessionId: args.sessionId,
          cashierId: args.cashierId,
          currency: a.currency,
          expectedMinor: a.expectedMinor,
          countedMinor: a.countedMinor,
          varianceMinor: a.varianceMinor,
          kind: a.kind,
          cashierNote: args.varianceNote,
        })),
        skipDuplicates: true,
      });

      const session = await this.prisma.client.cashierSession.findFirst({
        where: { id: args.sessionId, accountId: args.accountId },
        select: {
          closedAt: true,
          groupId: true,
          cashier: { select: { name: true } },
          cashDesk: { select: { name: true } },
        },
      });

      const messageText = formatVarianceMessage({
        cashierName: session?.cashier?.name ?? '—',
        cashDeskName: session?.cashDesk?.name ?? null,
        closedAtLabel: (session?.closedAt ?? new Date())
          .toISOString()
          .slice(0, 16)
          .replace('T', ' '),
        acts,
        cashierNote: args.varianceNote,
      });

      // 🔴 H7 (P4, 2026-08-12) — xabar TELEFON orqali ketadi.
      // Ilgari faqat `toSelf: true` yozilardi: u direktorning O'Z akkaunti
      // (MTProto slot 0) orqali «Saved Messages» ga boradi, prodda esa slot 0
      // umuman ULANMAGAN ⇒ har `toSelf` xabar `mtproto_self_no_client` bilan
      // yiqilardi (o'lchandi: 4/4 failed, oxirgisi 10-avgust). Telefonli
      // yo'l esa ishlaydi (32/32 sent, slot 1). Kim oladi — `variance-recipients`.
      const recipients = await this.resolveVarianceRecipients(args.accountId, {
        cashierId: args.cashierId,
        groupId: session?.groupId ?? null,
      });

      if (recipients.length === 0) {
        // Zaxira: qabul qiluvchi topilmasa eski yo'l saqlanadi — xabar
        // yo'qolib ketmasin, hech bo'lmasa outbox'da o'lchanadigan joyda
        // qolsin. Jurnalga ochiq yoziladi (jim degradatsiya emas).
        this.logger.warn(
          'Smena farqi xabari uchun telefonli qabul qiluvchi topilmadi ' +
            `(session=${args.sessionId}) — toSelf zaxirasiga yozildi`,
        );
        await this.prisma.client.hrTelegramOutbox.create({
          data: {
            accountId: args.accountId,
            toPhone: '',
            toSelf: true,
            messageText,
            sourceEventType: 'kassa.smena_farqi',
            sourceDocId: args.sessionId,
            status: 'pending',
          },
        });
      } else {
        await this.prisma.client.hrTelegramOutbox.createMany({
          data: recipients.map((r) => ({
            accountId: args.accountId,
            employeeId: r.employeeId,
            toPhone: r.phone,
            messageText,
            sourceEventType: 'kassa.smena_farqi',
            sourceDocId: args.sessionId,
            status: 'pending',
          })),
        });
      }
    } catch (err) {
      // Yopish bajarildi — akt/xabar nosozligi uni bekor qilmaydi.
      this.logger.warn(
        `Smena farq akti (session=${args.sessionId}) yozilmadi: ${(err as Error).message}`,
      );
    }
    return acts;
  }

  /**
   * H7 (P4) — farq xabarini kim oladi.
   *
   * Mezon: `cashiersession.approve` (smenani QABUL QILISH huquqi) — ataylab
   * `update` EMAS, chunki `update` kassirning o'zida ham `ALL` va xabar
   * kassirlarga tarqab ketardi (prod matritsasi: `Kassir` rolida `approve`
   * yo'q, `update` bor).
   *
   * Amaldagi qamrov KANONIK hal qiluvchi bilan hisoblanadi
   * (`resolveEffective`): rollar MAX'i + MK26 xodim-override. Override rol
   * natijasini TUSHIRA ham oladi — shuning uchun uni takrorlab «MAX»
   * yozish cheklangan xodimga begona smenaning farqini yuborardi.
   */
  private async resolveVarianceRecipients(
    accountId: string,
    session: VarianceSessionRef,
  ): Promise<VarianceRecipient[]> {
    const emps = await this.prisma.client.employee.findMany({
      where: {
        accountId,
        archived: false,
        telegramPhone: { not: null },
        OR: [
          {
            roles: {
              some: {
                role: {
                  permissions: {
                    some: {
                      entity: VARIANCE_ENTITY,
                      action: VARIANCE_ACTION,
                      scope: { not: 'NO' },
                    },
                  },
                },
              },
            },
          },
          // Rolda umuman ruxsat bermagan, lekin override bilan berilgan
          // xodim ham qabul qiluvchi (override rolni KO'TARADI ham).
          { permissionOverrides: { some: { entity: VARIANCE_ENTITY, action: VARIANCE_ACTION } } },
        ],
      },
      select: {
        id: true,
        telegramPhone: true,
        groupId: true,
        roles: {
          select: {
            role: {
              select: {
                name: true,
                permissions: {
                  where: { entity: VARIANCE_ENTITY, action: VARIANCE_ACTION },
                  select: { scope: true },
                },
              },
            },
          },
        },
        permissionOverrides: {
          where: { entity: VARIANCE_ENTITY, action: VARIANCE_ACTION },
          select: { scope: true },
        },
      },
    });

    const candidates: VarianceCandidate[] = emps.map((e) => {
      const grants: RoleGrant[] = e.roles.flatMap((r) =>
        r.role.permissions.map((p) => ({
          roleName: r.role.name,
          scope: p.scope as PermissionScope,
        })),
      );
      const override = e.permissionOverrides[0];
      const effective = resolveEffective(
        grants,
        override
          ? { scope: override.scope as PermissionScope, grantedAt: null, grantedByName: null }
          : null,
      );
      return {
        employeeId: e.id,
        telegramPhone: e.telegramPhone,
        scope: effective.scope as VarianceScope,
        groupId: e.groupId,
      };
    });

    return selectVarianceRecipients(candidates, session);
  }

  /**
   * Z-hisobot (kassa TZ §8.5) — smenaning to'liq moliyaviy manzarasi.
   *
   * Ochiq smenada ham ishlaydi: kassir kun o'rtasida «hozirgi holat»ni
   * ko'rishi kerak. Bu holda `countedCashMinor` = `null` va farq ham
   * `null` — sanoq hali bo'lmagan (nol EMAS).
   */
  async zReport(accountId: string, sessionId: string) {
    const session = await this.prisma.client.cashierSession.findFirst({
      where: { id: sessionId, accountId },
      select: {
        id: true,
        state: true,
        openedAt: true,
        closedAt: true,
        openingCashMinor: true,
        closingCashMinor: true,
        openingCashUsdMinor: true,
        closingCashUsdMinor: true,
        // `close()` MUZLATGAN qiymatlar — yopilgan smenada hisobot manbai
        // (pastdagi `isClosed` izohi).
        expectedCashMinor: true,
        expectedCashUsdMinor: true,
        cashier: { select: { id: true, name: true } },
        cashDesk: { select: { id: true, name: true, currency: true } },
        store: { select: { name: true } },
        organization: { select: { name: true, legalTitle: true } },
      },
    });
    if (!session) throw new NotFoundException(`CashierSession ${sessionId} not found`);

    const [payments, unconverted, sales, refundAgg, debtAgg, cashOut, variances] =
      await Promise.all([
        // To'lov turlari kesimida tushum — `RetailSalePayment` bo'yicha, chunki
        // aralash to'lovda bitta chek bir necha turga bo'linadi (B3).
        //
        // MK31: valyuta ham kesimga kiradi va jamiga `amountBaseMinor`
        // (so'mdagi ekvivalent) qo'shiladi. `amountMinor` bo'yicha jamlash
        // sentni tiyinga qo'shib, tushumni ~12 000 barobar buzardi.
        this.prisma.client.retailSalePayment.groupBy({
          by: ['method', 'currency'],
          where: {
            sale: { accountId, sessionId, state: { in: ['posted', 'refunded'] } },
            OR: [{ currency: BASE_CURRENCY }, { rateMinor: { not: null } }],
          },
          _sum: { amountMinor: true, amountBaseMinor: true },
        }),
        // Kursi YO'Q valyutali qatorlar — jamiga kirmaydi, lekin ko'rinadi
        // (Faza 17 konvertatsiya shartnomasi). `amountBaseMinor` ustuni NOT
        // NULL bo'lgani uchun bunday qatorda u jim 1:1 yozilgan bo'lishi
        // mumkin — shuning uchun manba `rateMinor`, base EMAS.
        this.prisma.client.retailSalePayment.groupBy({
          by: ['method', 'currency'],
          where: {
            sale: { accountId, sessionId, state: { in: ['posted', 'refunded'] } },
            currency: { not: BASE_CURRENCY },
            rateMinor: null,
          },
          _sum: { amountMinor: true },
        }),
        this.prisma.client.retailSale.findMany({
          where: { accountId, sessionId, state: { in: ['posted', 'refunded'] } },
          select: {
            id: true,
            sumMinor: true,
            refundedFromId: true,
            positions: {
              select: {
                quantity: true,
                priceMinor: true,
                sumMinor: true,
                costMinor: true,
                basePriceMinor: true,
              },
            },
          },
        }),
        this.prisma.client.retailSale.aggregate({
          where: { accountId, sessionId, state: 'posted', refundedFromId: { not: null } },
          _sum: { sumMinor: true },
        }),
        this.prisma.client.debtPayment.aggregate({
          where: { accountId, retailShiftId: sessionId, reversedAt: null },
          _sum: { amountMinor: true },
        }),
        this.cashOutSummary(accountId, sessionId),
        this.prisma.client.cashierSessionVariance.findMany({
          where: { accountId, sessionId },
          select: {
            currency: true,
            expectedMinor: true,
            countedMinor: true,
            varianceMinor: true,
            kind: true,
            cashierNote: true,
            acknowledgedAt: true,
          },
        }),
      ]);

    // Yalpi foyda: tan narx MUZLATILGAN qatorlardan. Bittasi ham
    // muzlatilmagan bo'lsa natija `null` — 0 deb ko'rsatish «100% marja»
    // yolg'onini berardi (tan-narx shartnomasi).
    let grossProfitMinor: bigint | null = 0n;
    let discountMinor = 0n;
    let realSalesCount = 0;
    for (const sale of sales) {
      if (sale.refundedFromId == null) realSalesCount += 1;
      for (const pos of sale.positions) {
        if (pos.basePriceMinor != null) {
          const base = scaleMinorByQty(pos.basePriceMinor, pos.quantity.toString());
          if (base > pos.sumMinor) discountMinor += base - pos.sumMinor;
        }
        if (grossProfitMinor == null) continue;
        if (pos.costMinor == null) {
          grossProfitMinor = null;
          continue;
        }
        const cost = scaleMinorByQty(pos.costMinor, pos.quantity.toString());
        grossProfitMinor += pos.sumMinor - cost;
      }
    }

    // Faza Q1: tender qiymati `TENDER.debt === 'DEBT'` (KATTA harf). Bu yerda
    // `'debt'` qo'lda yozilgan edi, ya'ni «qarzga sotildi» ko'rsatkichi HAR
    // DOIM 0 chiqardi — nol qiymat esa «bugun qarzga sotilmagan» degan
    // ishonarli yolg'on. Endi qiymat konstantadan olinadi (drift imkonsiz).
    // Holat filtri yuqoridagi `payments` groupBy bilan bir xil: chek bekor
    // qilinmagan bo'lishi kerak.
    const creditAgg = await this.prisma.client.retailSalePayment.aggregate({
      where: {
        method: TENDER.debt,
        sale: { accountId, sessionId, state: { in: ['posted', 'refunded'] } },
      },
      _sum: { amountMinor: true },
    });

    const cashInputs = await this.collectCashInputs(
      this.prisma.client,
      accountId,
      sessionId,
      session.openingCashMinor,
    );

    const usdInputs = await this.collectUsdCashInputs(
      this.prisma.client,
      accountId,
      sessionId,
      session.openingCashUsdMinor,
    );

    // 🔴 YOPILGAN SMENA — MUZLATILGAN RAQAM (Faza 6, 2026-08-12 auditi).
    //
    // `close()` `expectedCashMinor`/`discrepancyMinor` ni Serializable
    // tranzaksiyada hisoblab MUZLATADI va farq aktini yozadi — kassir AYNAN
    // o'shanga imzo qo'yadi. Bu yerda qayta hisoblash ikki oqibat berardi:
    //  (1) yopilgandan keyin manba o'zgarsa (qarz to'lovi stornosi, chek
    //      holati, qo'lda tuzatish) farqsiz yopilgan smena keyin «ortiqcha»
    //      ko'rsatardi;
    //  (2) bitta javob ichida ikki avlod raqam turardi — `variances[]` akt
    //      qiymatini, `expectedCashMinor` esa jonli qiymatni bosardi.
    // Ochiq smenada esa jonli hisob AYNAN kerak: u yopish formasi preview'i.
    //
    // `expectedCashMinor !== null` sharti MAJBURIY: ustun muzlatish
    // joriy qilinishidan OLDIN yopilgan qatorlarda `null`. `null` ni 0 deb
    // o'qish soxta KAMOMAD berardi (`NULL` ≠ `0`) — bunday smenada jonli
    // hisob ishlatiladi va `basis: 'live'` buni halol aytadi.
    const isClosed = session.state === 'closed' && session.expectedCashMinor !== null;
    const basis: 'frozen' | 'live' = isClosed ? 'frozen' : 'live';
    const expectedCash = isClosed
      ? (session.expectedCashMinor as bigint)
      : expectedCashMinor(cashInputs);
    // Dollar tomoni mustaqil: `close()` dollarga UMUMAN tegilmagan smenada
    // USD ustunlarini NULL qoldiradi (`usdTouched`), ya'ni so'm muzlatilgan
    // bo'lsa ham USD muzlatilmagan bo'lishi mumkin.
    const expectedCashUsd = isClosed
      ? (session.expectedCashUsdMinor ?? expectedUsdCashMinor(usdInputs))
      : expectedUsdCashMinor(usdInputs);

    const z = buildZReport({
      salesCount: realSalesCount,
      revenueByMethod: [
        ...payments.map((p) => ({
          method: p.method,
          sumMinor: p._sum.amountMinor ?? 0n,
          currency: p.currency,
          baseMinor: p._sum.amountBaseMinor ?? 0n,
        })),
        // Kursi yo'q qatorlar: `baseMinor: null` — sof modul ularni jamidan
        // chiqarib, alohida ro'yxatda ko'rsatadi.
        ...unconverted.map((p) => ({
          method: p.method,
          sumMinor: p._sum.amountMinor ?? 0n,
          currency: p.currency,
          baseMinor: null,
        })),
      ],
      grossProfitMinor,
      discountMinor,
      creditSoldMinor: creditAgg._sum.amountMinor ?? 0n,
      debtPaidMinor: debtAgg._sum.amountMinor ?? 0n,
      returnsMinor: refundAgg._sum.sumMinor ?? 0n,
      expenseMinor: BigInt(cashOut.expenseMinor),
      collectionMinor: BigInt(cashOut.collectionMinor),
      // `varianceMinor` ni sof modul AYNAN shu qiymatdan hisoblaydi — aks
      // holda farq ikki avlod raqam aralashmasi bo'lib qolardi.
      expectedCashMinor: expectedCash,
      countedCashMinor: session.closingCashMinor,
      // MK31 (§8.5) — dollar qatori. Sentda; `null` sanoq = «hali
      // sanalmagan», shu holatda farq ham `null` bo'lib qoladi.
      expectedUsdCashMinor: expectedCashUsd,
      countedUsdCashMinor: session.closingCashUsdMinor,
    });

    return {
      session: {
        id: session.id,
        state: session.state,
        openedAt: session.openedAt,
        closedAt: session.closedAt,
        cashier: session.cashier,
        cashDesk: session.cashDesk,
        store: session.store,
        organization: session.organization,
      },
      salesCount: z.salesCount,
      revenueMinor: z.revenueMinor.toString(),
      revenueByMethod: z.revenueByMethod.map((r) => ({
        method: r.method,
        sumMinor: r.sumMinor.toString(),
        currency: r.currency ?? BASE_CURRENCY,
        baseMinor: r.baseMinor?.toString() ?? null,
      })),
      // Kursi noma'lumligi sababli jamiga KIRMAGAN summalar — jimgina
      // tashlanmaydi, hisobotda ochiq turadi.
      unconvertedByMethod: z.unconvertedByMethod.map((r) => ({
        method: r.method,
        sumMinor: r.sumMinor.toString(),
        currency: r.currency,
      })),
      averageReceiptMinor: z.averageReceiptMinor?.toString() ?? null,
      grossProfitMinor: z.grossProfitMinor?.toString() ?? null,
      discountMinor: z.discountMinor.toString(),
      creditSoldMinor: z.creditSoldMinor.toString(),
      debtPaidMinor: z.debtPaidMinor.toString(),
      returnsMinor: z.returnsMinor.toString(),
      expenseMinor: z.expenseMinor.toString(),
      collectionMinor: z.collectionMinor.toString(),
      expenseByItem: cashOut.byExpenseItem,
      // Kutilgan naqd/farq qaysi avloddan — `'frozen'` = yopishda muzlatilgan
      // (kassir imzolagan hujjat), `'live'` = shu so'rovda qayta hisoblangan
      // (ochiq smena preview'i yoki muzlatilmagan eski qator).
      basis,
      openingCashMinor: session.openingCashMinor.toString(),
      expectedCashMinor: z.expectedCashMinor.toString(),
      countedCashMinor: z.countedCashMinor?.toString() ?? null,
      varianceMinor: z.varianceMinor?.toString() ?? null,
      // Dollar yashiq — SENTDA (so'mga o'girilmaydi, §8.4).
      openingCashUsdMinor: session.openingCashUsdMinor.toString(),
      expectedUsdCashMinor: z.expectedUsdCashMinor.toString(),
      countedUsdCashMinor: z.countedUsdCashMinor?.toString() ?? null,
      varianceUsdMinor: z.varianceUsdMinor?.toString() ?? null,
      variances: variances.map((v) => ({
        currency: v.currency,
        expectedMinor: v.expectedMinor.toString(),
        countedMinor: v.countedMinor.toString(),
        varianceMinor: v.varianceMinor.toString(),
        kind: v.kind,
        cashierNote: v.cashierNote,
        acknowledgedAt: v.acknowledgedAt,
      })),
    };
  }

  /**
   * Farq aktlari — menejer ekrani (kassa TZ §8.4).
   *
   * Default: FAQAT ko'rilmaganlar. Menejerning savoli «bugun nimani
   * ko'rishim kerak», «bir yilda qancha farq bo'lgan» emas — to'liq
   * tarix `acknowledged=all` bilan so'raladi.
   */
  async listVariances(accountId: string, query: Record<string, unknown>) {
    const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 200);
    const scope = typeof query.acknowledged === 'string' ? query.acknowledged : 'pending';
    const where = {
      accountId,
      ...(scope === 'all'
        ? {}
        : scope === 'done'
          ? { NOT: { acknowledgedAt: null } }
          : { acknowledgedAt: null }),
      ...(typeof query.kind === 'string' && query.kind ? { kind: query.kind } : {}),
    };
    const [rows, total, pendingCount] = await Promise.all([
      this.prisma.client.cashierSessionVariance.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          currency: true,
          expectedMinor: true,
          countedMinor: true,
          varianceMinor: true,
          kind: true,
          cashierNote: true,
          managerNote: true,
          acknowledgedAt: true,
          createdAt: true,
          cashier: { select: { id: true, name: true } },
          acknowledgedBy: { select: { id: true, name: true } },
          session: {
            select: {
              id: true,
              openedAt: true,
              closedAt: true,
              cashDesk: { select: { name: true } },
            },
          },
        },
      }),
      this.prisma.client.cashierSessionVariance.count({ where }),
      // Ko'rilmaganlar soni HAR DOIM qaytadi — menejer filtrni o'zgartirsa
      // ham «nechta ish qoldi» raqami yo'qolmasin.
      this.prisma.client.cashierSessionVariance.count({
        where: { accountId, acknowledgedAt: null },
      }),
    ]);
    return {
      items: rows.map((v) => ({
        id: v.id,
        currency: v.currency,
        expectedMinor: v.expectedMinor.toString(),
        countedMinor: v.countedMinor.toString(),
        varianceMinor: v.varianceMinor.toString(),
        kind: v.kind,
        cashierNote: v.cashierNote,
        managerNote: v.managerNote,
        acknowledgedAt: v.acknowledgedAt,
        acknowledgedBy: v.acknowledgedBy,
        createdAt: v.createdAt,
        cashier: v.cashier,
        sessionId: v.session.id,
        cashDeskName: v.session.cashDesk?.name ?? null,
        openedAt: v.session.openedAt,
        closedAt: v.session.closedAt,
      })),
      total,
      pendingCount,
    };
  }

  /**
   * Aktni TAN OLISH — menejer ko'rdi va sababini yozdi.
   *
   * ⚠️ Aktning O'ZI o'zgarmaydi: summalar, kassir izohi, sana — hammasi
   * joyida qoladi. Tan olish faqat «ko'rildi» belgisi va menejer izohi
   * qo'shadi. Farq raqamini tahrirlash imkoni bo'lsa, akt dalil bo'lishdan
   * to'xtardi.
   *
   * Idempotent: qayta tan olish BIRINCHI vaqtni saqlaydi — aks holda
   * «qachon ko'rildi» har bosishda surilib ketardi.
   */
  async acknowledgeVariance(accountId: string, employeeId: string, id: string, raw: unknown) {
    const body = (raw ?? {}) as { note?: unknown };
    const row = await this.prisma.client.cashierSessionVariance.findFirst({
      where: { id, accountId },
      select: { id: true, acknowledgedAt: true, cashierId: true },
    });
    if (!row) throw new NotFoundException(`Variance ${id} not found`);

    // O'z-o'zini tasdiqlash taqiqi. Endpoint faqat `cashiersession.update`
    // talab qiladi va bu ruxsat kassir shablonida ham bor — ya'ni ruxsat
    // qatlami bu yo'lni ushlamaydi. Aktdagi kassir o'z kamomadini o'zi
    // «ko'rildi» qila olsa (yoki izoh-yangilash yo'li orqali menejer izohini
    // yozsa), akt dalil bo'lishdan to'xtaydi — shuning uchun tekshiruv
    // idempotent shoxdan OLDIN turadi.
    if (row.cashierId === employeeId) {
      throw new ForbiddenException("O'z smenangiz farq aktini o'zingiz tasdiqlay olmaysiz");
    }

    const note = typeof body.note === 'string' ? body.note.trim() || null : undefined;
    if (row.acknowledgedAt) {
      // Faqat izohni yangilashga ruxsat — vaqt va kim ko'rgani muzlagan.
      if (note === undefined) return { id, acknowledgedAt: row.acknowledgedAt, changed: false };
      const upd = await this.prisma.client.cashierSessionVariance.update({
        where: { id },
        data: { managerNote: note },
        select: { id: true, acknowledgedAt: true },
      });
      return { ...upd, changed: true };
    }

    const upd = await this.prisma.client.cashierSessionVariance.update({
      where: { id },
      data: {
        acknowledgedAt: new Date(),
        acknowledgedById: employeeId,
        ...(note === undefined ? {} : { managerNote: note }),
      },
      select: { id: true, acknowledgedAt: true },
    });
    return { ...upd, changed: true };
  }

  // ---- Xarajat (RKO) va inkassatsiya — kassa TZ §8.2 / §8.3 ----

  /**
   * Xarajat (RKO) yoki inkassatsiya hujjati.
   *
   * NEGA `drawerCashOut` ning o'zi yetarli emas: u tasnifsiz «Изъятие»
   * yozadi, ya'ni Z-hisobot «qaysi moddaga qancha ketdi» va «qancha
   * topshirildi» degan savollarga javob bera olmaydi (§8.5).
   *
   * ⚠️ Hujjat va audit izi BITTA tranzaksiyada: tasdiqsiz erkinlikning
   * (Q10) yagona muvozanati — izning o'zi. Izsiz qolgan xarajat bu
   * modelda eng yomon natija, shuning uchun iz yozilmasa hujjat ham
   * yozilmaydi.
   */
  async posCashOut(accountId: string, cashierId: string, sessionId: string, raw: unknown) {
    const parsed = PosCashOutSchema.parse(raw);
    const kind = parsed.kind as CashOutKind;
    const sumMinor = BigInt(parsed.sumMinor);

    const problems = validateCashOut({
      kind,
      sumMinor,
      expenseItemId: parsed.expenseItemId,
      recipientId: parsed.recipientId,
    });
    if (problems.length > 0) {
      throw new BadRequestException(problems.map((x) => x.message).join('; '));
    }

    const session = await this.loadOpenShiftForDrawer(accountId, cashierId, sessionId);

    // Nomlar audit payload'iga MUZLATIB yoziladi: modda keyin qayta
    // nomlansa ham jurnal o'sha ondagi holatni ko'rsatishi kerak.
    const [expenseItem, recipient] = await Promise.all([
      parsed.expenseItemId
        ? this.prisma.client.expenseItem.findFirst({
            where: { id: parsed.expenseItemId, accountId },
            select: { id: true, name: true },
          })
        : Promise.resolve(null),
      parsed.recipientId
        ? this.prisma.client.employee.findFirst({
            where: { id: parsed.recipientId, accountId },
            select: { id: true, name: true },
          })
        : Promise.resolve(null),
    ]);
    if (parsed.expenseItemId && !expenseItem) {
      throw new NotFoundException('Xarajat moddasi topilmadi');
    }
    if (parsed.recipientId && !recipient) {
      throw new NotFoundException('Qabul qiluvchi xodim topilmadi');
    }

    // Hujjatdan OLDINGI kutilgan naqd — «yashiqda yo'q pul chiqarildi»
    // anomaliyasini aniqlash uchun.
    const cashBeforeMinor = expectedCashMinor(
      await this.collectCashInputs(
        this.prisma.client,
        accountId,
        sessionId,
        session.openingCashMinor,
      ),
    );

    const year = new Date().getFullYear();
    const prefix = cashOutPrefix(kind, year);
    const n = await allocateDocumentNumber(this.prisma.client, accountId, prefix, async () => {
      const last = await this.prisma.client.retailDrawerCashOut.findFirst({
        where: { accountId, name: { startsWith: prefix } },
        orderBy: { name: 'desc' },
        select: { name: true },
      });
      return last ? Number.parseInt(last.name.slice(prefix.length), 10) || 0 : 0;
    });
    const name = `${prefix}${String(n).padStart(5, '0')}`;
    const creatorGroupId = await resolveCreatorGroupId(this.prisma.client, accountId, cashierId);

    return this.prisma.client.$transaction(async (tx) => {
      const doc = await tx.retailDrawerCashOut.create({
        data: {
          accountId,
          ownerId: cashierId,
          groupId: creatorGroupId,
          name,
          retailShiftId: sessionId,
          organizationId: session.organizationId,
          sumMinor,
          currency: session.cashDesk.currency,
          moment: new Date(),
          applicable: true,
          state: 'posted',
          postedAt: new Date(),
          description: parsed.description ?? null,
          kind,
          expenseItemId: expenseItem?.id ?? null,
          recipientId: recipient?.id ?? null,
        },
        select: {
          id: true,
          name: true,
          sumMinor: true,
          currency: true,
          kind: true,
          description: true,
          createdAt: true,
        },
      });

      const events = planCashOutAuditEvents({
        docId: doc.id,
        docName: doc.name,
        kind,
        sumMinor,
        expenseItemId: expenseItem?.id ?? null,
        expenseItemName: expenseItem?.name ?? null,
        recipientId: recipient?.id ?? null,
        recipientName: recipient?.name ?? null,
        description: parsed.description ?? null,
        cashBeforeMinor,
      });
      if (events.length > 0) {
        await tx.cashierAuditEvent.createMany({
          data: events.map((e) => ({
            accountId,
            sessionId,
            employeeId: cashierId,
            type: e.type,
            docId: e.docId,
            payload: e.payload as Prisma.InputJsonValue,
          })),
        });
      }

      // 🔴 Faza 4 (2026-08-12) — xarajat/inkassatsiya ham UMUMIY pul daftariga
      // yozadi. Ilgari `CASH_OVERDRAWN` audit hodisasi yagona «to'siq» edi:
      // u kassirni OGOHLANTIRARDI, lekin hujjatni to'xtatmasdi va yashiq
      // qoldig'iga umuman tegmasdi. Endi haqiqiy to'siq daftarda —
      // qoldiqdan ortiq chiqim tranzaksiyani orqaga qaytaradi (400).
      // Ogohlantirish hodisasi QOLADI: u «kutilgan naqd» o'lchovi bo'yicha
      // ishlaydi (opening + sotuvlar), qo'riqchi esa kassa qoldig'i
      // bo'yicha — ikki xil savol, ikkovi ham kerak.
      await this.money.applyDeltas(
        tx,
        accountId,
        drawerMoneyDeltas({
          kind: 'out',
          cashDeskId: session.cashDeskId,
          currency: session.cashDesk.currency,
          sumMinor: doc.sumMinor,
          documentId: doc.id,
          description: `${cashOutLedgerLabel(kind)} ${doc.name}`,
        }),
      );

      return {
        ...doc,
        sumMinor: doc.sumMinor.toString(),
        expenseItem,
        recipient,
        /** Yozilgan audit hodisalari — FE «anomaliya» belgisini shundan oladi. */
        auditTypes: events.map((e) => e.type),
      };
    });
  }

  /**
   * Inkassatsiyani qabul qila oladigan xodimlar — FAQAT `id` va `name`.
   *
   * NEGA `/hr/employees` EMAS: u `salaryMinor`, telefon va boshqa shaxsiy
   * ma'lumotni qaytaradi, va kiosk-kassirga uni ochish butun POS
   * terminalida oyliklarni oshkor qilardi. Kiosk allowlist'ida
   * `/cashier-sessions` allaqachon ochiq, shuning uchun eng tor yo'l —
   * shu yerda kerakli ikki maydonni berish.
   */
  async cashOutRecipients(accountId: string, cashierId: string) {
    return this.prisma.client.employee.findMany({
      where: {
        accountId,
        // O'ziga topshirish ma'nosiz — javobgarlik o'zgarmaydi.
        id: { not: cashierId },
        archived: false,
      },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
      take: 200,
    });
  }

  /** Bitta pul-chiqishi hujjati — RKO cheki uchun (§8.2). */
  async cashOutDoc(accountId: string, docId: string) {
    const doc = await this.prisma.client.retailDrawerCashOut.findFirst({
      where: { id: docId, accountId, deletedAt: null },
      select: {
        id: true,
        name: true,
        kind: true,
        sumMinor: true,
        currency: true,
        description: true,
        createdAt: true,
        expenseItem: { select: { id: true, name: true } },
        recipient: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true } },
        organization: { select: { name: true, legalTitle: true } },
        retailShift: { select: { id: true, cashDesk: { select: { name: true } } } },
      },
    });
    if (!doc) throw new NotFoundException('Hujjat topilmadi');
    return { ...doc, sumMinor: doc.sumMinor.toString() };
  }

  /** Smenadagi pul chiqishi — turlar va moddalar kesimida (Z-hisobot §8.5). */
  async cashOutSummary(accountId: string, sessionId: string) {
    const rows = await this.prisma.client.retailDrawerCashOut.findMany({
      where: { accountId, retailShiftId: sessionId, deletedAt: null },
      select: {
        id: true,
        name: true,
        kind: true,
        sumMinor: true,
        description: true,
        createdAt: true,
        expenseItem: { select: { id: true, name: true } },
        recipient: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const s = summarizeCashOut(
      rows.map((r) => ({
        kind: r.kind,
        sumMinor: r.sumMinor,
        expenseItemId: r.expenseItem?.id ?? null,
        expenseItemName: r.expenseItem?.name ?? null,
      })),
    );

    return {
      expenseMinor: s.expenseMinor.toString(),
      collectionMinor: s.collectionMinor.toString(),
      otherMinor: s.otherMinor.toString(),
      totalMinor: s.totalMinor.toString(),
      byExpenseItem: s.byExpenseItem.map((i) => ({
        id: i.id,
        name: i.name,
        sumMinor: i.sumMinor.toString(),
      })),
      rows: rows.map((r) => ({
        id: r.id,
        name: r.name,
        kind: r.kind,
        sumMinor: r.sumMinor.toString(),
        description: r.description,
        createdAt: r.createdAt,
        expenseItem: r.expenseItem,
        recipient: r.recipient,
      })),
    };
  }

  /** All posted drawer Внесение/Изъятие for a shift (session detail + Z). */
  async listDrawerOps(accountId: string, sessionId: string) {
    const [cashIn, cashOut] = await Promise.all([
      this.prisma.client.retailDrawerCashIn.findMany({
        where: { accountId, retailShiftId: sessionId, deletedAt: null },
        orderBy: { createdAt: 'asc' },
        select: { id: true, name: true, sumMinor: true, description: true, createdAt: true },
      }),
      this.prisma.client.retailDrawerCashOut.findMany({
        where: { accountId, retailShiftId: sessionId, deletedAt: null },
        orderBy: { createdAt: 'asc' },
        select: { id: true, name: true, sumMinor: true, description: true, createdAt: true },
      }),
    ]);
    return { cashIn, cashOut };
  }

  // ---- Private helpers ----

  private async ensureCashDesk(accountId: string, id: string) {
    const row = await this.prisma.client.cashDesk.findFirst({
      where: { id, accountId },
    });
    if (!row) throw new NotFoundException(`CashDesk ${id} not found`);
    return row;
  }

  private async ensureStore(accountId: string, id: string) {
    const row = await this.prisma.client.store.findFirst({ where: { id, accountId } });
    if (!row) throw new NotFoundException(`Store ${id} not found`);
    return row;
  }

  private async ensureOrganization(accountId: string, id: string) {
    const row = await this.prisma.client.organization.findFirst({
      where: { id, accountId },
    });
    if (!row) throw new NotFoundException(`Organization ${id} not found`);
    return row;
  }
}
