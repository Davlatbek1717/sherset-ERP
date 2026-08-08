import type { Prisma } from '@moysklad/db';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { allocateDocumentNumber } from '../../prisma/document-number.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AttachmentService } from '../attachment/attachment.service.js';
import { CounterpartyBalanceService } from '../counterparty-balance/counterparty-balance.service.js';
import { MoneyService } from '../money/money.service.js';
import { HtmlPdfService } from '../print-template/html-pdf.service.js';
import { TASHKENT_OFFSET_MS, tashkentRangeBounds } from '../report/report-date-bounds.util.js';
import { formatSomMinor, renderSmsTemplate } from '../sms/sms-render.util.js';
import { MessageTemplateService } from '../sms/sms-template.service.js';
import { SmsService } from '../sms/sms.service.js';
import { TelegramService } from '../telegram/telegram.service.js';
import {
  debtCashDeskDeltas,
  debtCashLedgerWasWritten,
  debtLedgerDocumentId,
} from './debt-cash-ledger.js';
import { deriveDebtStatus, recalcDebt } from './debt-recalc.js';
import {
  BulkRemindersSchema,
  CASHIER_METHODS,
  type CancelCallNoteInput,
  CancelCallNoteSchema,
  type CashierReportFilterInput,
  CashierReportFilterSchema,
  type CreateCardPaymentInput,
  CreateCardPaymentSchema,
  type CreateCashPaymentInput,
  CreateCashPaymentSchema,
  type CreateDebtInput,
  type CreateDebtNoteInput,
  CreateDebtNoteSchema,
  CreateDebtSchema,
  type DebtFilterInput,
  DebtFilterSchema,
  type DebtNoteKind,
  type DebtPaymentMethod,
  DebtPaymentsFeedFilterSchema,
  type DebtPaymentsReportFilterInput,
  DebtPaymentsReportFilterSchema,
  type DebtStatus,
  type MarkCallInput,
  MarkCallSchema,
  type ReversePaymentInput,
  ReversePaymentSchema,
  type SetProblemInput,
  SetProblemSchema,
} from './debt.schema.js';
import { renderReminderText } from './telegram-template-render.util.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Muallif roli — muloqot yozuvida va to'lovda ko'rsatiladi (TZ §3.4). */
export type ActorRole = 'operator' | 'cashier' | 'admin';

/**
 * «Qarz undirish» xizmati — TZ v2 ning butun biznes-mantiqi.
 *
 * Asosiy invariantlar:
 *  1. `paidMinor` — HAR DOIM `debt_payments` yig'indisidan qayta hisoblanadi
 *     (denormalizatsiya faqat tezlik uchun; yagona haqiqat manbai — to'lovlar).
 *  2. `status` — qoldiqdan KELIB CHIQADI, qo'lda yozilmaydi:
 *        qoldiq == total → 'unpaid'
 *        0 < qoldiq < total → 'partial'
 *        qoldiq == 0 → 'paid'  ⇒ qarzdorlar ro'yxatidan chiqadi (§3.1, §3.6)
 *  3. Qarz to'liq yopilganda `nextContactAt` NULL'ga tushadi (§3.6: «kiritilgan
 *     keyingi sana maydoni endi kerak bo'lmaydi») — qo'ng'iroqlar ro'yxatini
 *     yopilgan qarz bilan ifloslantirmaslik uchun.
 *  4. Ortiqcha to'lov TAQIQ — qoldiqdan katta summa 400 qaytaradi (kassir
 *     xatosini darhol tutadi; TZ «qolgan summa 0 ga teng bo'lsa» mantig'i
 *     manfiy qoldiqni ko'zda tutmaydi).
 *  5. Har bir yozuv $transaction ichida — to'lov + status + izoh atomik.
 */
@Injectable()
export class DebtService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AttachmentService) private readonly attachments: AttachmentService,
    @Inject(HtmlPdfService) private readonly htmlPdf: HtmlPdfService,
    @Inject(CounterpartyBalanceService)
    private readonly balances: CounterpartyBalanceService,
    // Mijozga Telegram xabari (2026-07-13). Xabar YUBORILMASA ham qarz oqimi
    // to'xtamaydi — chat bog'lanmagan bo'lishi mumkin (mijoz botga yozmagan).
    @Inject(TelegramService) private readonly telegram: TelegramService,
    // Ommaviy SMS eslatmasi (2026-07-20): tanlangan qarzdorlarga SMS navbati.
    @Inject(SmsService) private readonly sms: SmsService,
    @Inject(MessageTemplateService) private readonly msgTemplates: MessageTemplateService,
    // Kassa daftari (Faza 11, `M-05`): kassir naqd qabul qilganda va uni
    // storno qilganda `CashDesk` qoldig'i / `/money` lentasi qimirlashi uchun.
    @Inject(MoneyService) private readonly money: MoneyService,
  ) {}

  // ────────────────────────────────────────────────────────────── helpers ──

  /** Asia/Tashkent kalendar-kunining UTC chegaralari [gte, lt). */
  private tashkentDay(date?: string | null): { gte: Date; lt: Date } {
    // Bugungi Toshkent kunini aniqlash: UTC "hozir" + 5h → sana qismini olamiz.
    const base = date
      ? new Date(date)
      : new Date(
          `${new Date(Date.now() + TASHKENT_OFFSET_MS).toISOString().slice(0, 10)}T00:00:00.000Z`,
        );
    const utcMidnight = new Date(`${base.toISOString().slice(0, 10)}T00:00:00.000Z`);
    return {
      gte: new Date(utcMidnight.getTime() - TASHKENT_OFFSET_MS),
      lt: new Date(utcMidnight.getTime() + DAY_MS - TASHKENT_OFFSET_MS),
    };
  }

  /**
   * `todayCalls(dayOffset)` uchun kun siljishi → ISO sana (`tashkentDay` kutgan
   * shakl). 0 → `undefined` (tashkentDay o'zi bugunni oladi), 1 → ertaga.
   *
   * MASTER-TODO #139/#142: `/debts/calls/tomorrow` sahifasi adoption'da
   * yo'qolgan edi va u bilan birga BE'ning `dayOffset` parametri ham. Bu yerda
   * FAQAT siljish tiklanadi — `includeOverdue` default'i va main'dagi
   * «qo'ng'iroq qilinganlar ro'yxatdan chiqadi» filtri ATAYLAB ko'chirilmadi
   * (ular mavjud `/debts/calls` xulqini o'zgartiradi → alohida QA talab qiladi,
   * MASTER-TODO'da follow-up sifatida qayd etilgan).
   */
  private dayOffsetIso(offset: number): string | undefined {
    if (!offset) return undefined;
    const shifted = new Date(Date.now() + TASHKENT_OFFSET_MS + offset * DAY_MS);
    return shifted.toISOString().slice(0, 10);
  }

  /** Qoldiqdan status chiqarish — statusning YAGONA manbai (`debt-recalc.ts`). */
  private deriveStatus(totalMinor: bigint, paidMinor: bigint): DebtStatus {
    return deriveDebtStatus(totalMinor, paidMinor);
  }

  /** Ro'yxat/detalga chiqariladigan shakl — qoldiq har doim server hisoblaydi. */
  private toDto(d: {
    id: string;
    name: string;
    totalMinor: bigint;
    paidMinor: bigint;
    currency: string;
    status: string;
    nextContactAt: Date | null;
    lastCallAt?: Date | null;
    lastCallOutcome?: string | null;
    problem?: boolean;
    problemReason?: string | null;
    problemAt?: Date | null;
    comment: string | null;
    closedAt: Date | null;
    createdAt: Date;
    counterparty?: { id: string; name: string; phone: string | null } | null;
    owner?: { id: string; name: string } | null;
    issuedBy?: { id: string; name: string } | null;
    notes?: { text: string; createdAt: Date }[];
  }) {
    const remaining = d.totalMinor - d.paidMinor;
    const now = Date.now();
    return {
      id: d.id,
      name: d.name,
      counterpartyId: d.counterparty?.id ?? null,
      counterpartyName: d.counterparty?.name ?? null,
      phone: d.counterparty?.phone ?? null,
      totalMinor: d.totalMinor.toString(),
      paidMinor: d.paidMinor.toString(),
      /** Qolgan (joriy) qarz — §3.1 ustuni. */
      remainingMinor: (remaining > 0n ? remaining : 0n).toString(),
      currency: d.currency,
      status: d.status,
      nextContactAt: d.nextContactAt,
      /** §3.5 — muddati o'tgan qo'ng'iroq qizil bilan ajratiladi. */
      overdue: d.status !== 'paid' && d.nextContactAt !== null && d.nextContactAt.getTime() < now,
      lastNote: d.notes?.[0]?.text ?? null,
      lastCallAt: d.lastCallAt ?? null,
      lastCallOutcome: d.lastCallOutcome ?? null,
      /** MUAMMOLI MIJOZ (2026-07-14) — alohida bo'lim shundan filtrlanadi. */
      problem: d.problem ?? false,
      problemReason: d.problemReason ?? null,
      problemAt: d.problemAt ?? null,
      comment: d.comment,
      ownerId: d.owner?.id ?? null,
      ownerName: d.owner?.name ?? null,
      issuedByName: d.issuedBy?.name ?? null,
      closedAt: d.closedAt,
      createdAt: d.createdAt,
    };
  }

  /**
   * To'lovdan keyin qarzni qayta hisoblash — `paidMinor` to'lovlar
   * yig'indisidan QAYTA O'QILADI (increment emas): shu bilan denormalizatsiya
   * hech qachon haqiqatdan ajralib qolmaydi (o'chirilgan to'lov, qo'lda tuzatish).
   *
   * Amalga oshirish `debt-recalc.ts` da — POS qarz-to'lovi ham AYNAN shuni
   * chaqiradi (2026-08-08 `DUP-07`: ilgari u o'zining chala nusxasini ishlatardi).
   */
  private async recalc(
    tx: Prisma.TransactionClient,
    accountId: string,
    debtId: string,
    nextContactAt: Date | null | undefined,
    /**
     * Balans jurnaliga (Faza 9) yoziladigan hujjat-identifikatori — to'lov
     * ID'si ma'lum bo'lsa o'sha, aks holda qarz kartochkasining o'zi (delta
     * to'lovlar YIG'INDISIDAN kelib chiqadi, ya'ni kartochkaga tegishli).
     * `organizationId` doim `null`: `Debt` modelida organizatsiya o'lchovi yo'q.
     */
    docId: string,
  ) {
    return recalcDebt(tx, this.balances, {
      accountId,
      debtId,
      nextContactAt,
      meta: { docType: 'debtpayment', docId, organizationId: null },
    });
  }

  // ── MIJOZGA TELEGRAM XABARI (2026-07-13, 2026-07-20e avtomatik xabarlar
  //    olib tashlandi) ────────────────────────────────────────────────────
  //
  // Faqat QO'LDA yuboriladigan eslatma (sendTelegramReminder, pastda) mijozga
  // Telegram xabari jo'natadi. Qarz yaratish/to'lov/storno kabi harakatlar
  // ENDI AVTOMATIK xabar yubormaydi — foydalanuvchi buni so'ramagan edi
  // (2026-07-20e: har bir debt-harakat tugmasi sukut bo'yicha xabar
  // yuborayotgani xato edi, faqat operator ATAYLAB bosgan tugma yubormog'i
  // kerak).

  /**
   * QO'LDA Telegram qarz-eslatmasi (2026-07-19 talab) — qarzdorlar ro'yxatidagi
   * har mijoz qatoridagi «Telegram eslatma» tugmasi shuni chaqiradi. Avtomatik
   * cron eslatmasi (debt-reminder.service) bilan bir xil MATN, lekin operator
   * xohlagan paytda yuboradi. Natijani KUTAMIZ (fire-and-forget emas) — tugma
   * «yuborildi / yuborilmadi (sabab)» deb halol javob bersin.
   */
  async sendTelegramReminder(
    accountId: string,
    debtId: string,
  ): Promise<{ sent: boolean; reason?: string }> {
    const debt = await this.prisma.client.debt.findFirst({
      where: { id: debtId, accountId },
      select: {
        totalMinor: true,
        paidMinor: true,
        counterpartyId: true,
        counterparty: { select: { name: true } },
      },
    });
    if (!debt) throw new NotFoundException('Qarz topilmadi');
    if (!debt.counterpartyId) return { sent: false, reason: 'no_counterparty' };

    const remaining = debt.totalMinor - debt.paidMinor;
    // Qarz yopilgan/qolmagan bo'lsa — eslatma yubormaymiz (mijozga «qarzingiz
    // bor» deb noto'g'ri xabar ketmasin).
    if (remaining <= 0n) return { sent: false, reason: 'no_debt' };

    const name = debt.counterparty?.name ?? 'mijoz';
    const contact = await this.sms.getContacts(accountId);
    // Kanalning default Telegram shabloni (yo'q/o'chirilgan → fallback hardcoded).
    const tpl = await this.msgTemplates.findDefault(accountId, 'telegram');
    const text = renderReminderText(tpl, {
      name,
      remainingMinor: remaining,
      totalMinor: debt.totalMinor,
      contact,
    });
    return this.telegram.notifyCounterparty(accountId, debt.counterpartyId, text, 'reminder');
  }

  /**
   * OMMAVIY eslatma (2026-07-20) — checkbox bilan tanlangan qarzdorlarga
   * bittada xabar. channel='sms' → shablon render → SmsLog navbati (worker
   * yuboradi); channel='telegram' → mavjud notifyCounterparty yo'li. Halol
   * xulosa: nechta navbatga qo'yildi + o'tkazib yuborilganlar sabab bilan.
   */
  async sendBulkReminders(accountId: string, userId: string, raw: unknown) {
    const { ids, channel, templateId } = BulkRemindersSchema.parse(raw);
    const debts = await this.prisma.client.debt.findMany({
      where: {
        id: { in: ids },
        accountId,
        deletedAt: null,
        status: { in: ['unpaid', 'partial'] },
      },
      select: {
        id: true,
        totalMinor: true,
        paidMinor: true,
        counterpartyId: true,
        counterparty: { select: { name: true, phone: true } },
      },
    });

    const skipped: Array<{ id: string; name: string; reason: string }> = [];
    let queued = 0;

    if (channel === 'sms') {
      const cfg = await this.sms.getConfig(accountId);
      const configured = !!cfg && cfg.enabled;
      // Tanlangan (templateId) yoki kanalning default+enabled shabloni. findOne
      // o'chirilganini ham qaytaradi → quyida `enabled` tekshiriladi.
      const template = templateId
        ? await this.msgTemplates.findOne(accountId, templateId).catch(() => null)
        : await this.msgTemplates.findDefault(accountId, 'sms');
      const contact = await this.sms.getContacts(accountId);
      for (const d of debts) {
        const name = d.counterparty?.name ?? 'mijoz';
        const remaining = d.totalMinor - d.paidMinor;
        if (remaining <= 0n) {
          skipped.push({ id: d.id, name, reason: 'no_debt' });
          continue;
        }
        if (!configured) {
          skipped.push({ id: d.id, name, reason: 'sms_not_configured' });
          continue;
        }
        if (!template || !template.enabled) {
          // default yo'q, yoki tanlangan shablon o'chirilgan.
          skipped.push({ id: d.id, name, reason: 'template_disabled' });
          continue;
        }
        const phone = d.counterparty?.phone;
        if (!phone) {
          skipped.push({ id: d.id, name, reason: 'no_phone' });
          continue;
        }
        // Bitta qarzdorda render/enqueue yiqilsa (masalan render xatosi yoki
        // matn 1600 belgidan oshsa) — butun partiya to'xtamasin, aks holda
        // allaqachon navbatga qo'yilganlar qolib, operator qayta bosib DUBLIKAT
        // SMS yuborishi mumkin edi. Shu qarzdor `send_error` bilan o'tkaziladi.
        try {
          const body = renderSmsTemplate(template.body, {
            counterparty: { name },
            debt: {
              remainingFormatted: formatSomMinor(remaining),
              totalFormatted: formatSomMinor(d.totalMinor),
            },
            company: contact,
          });
          await this.sms.send(accountId, userId, {
            toPhone: phone,
            body,
            entity: 'Debt',
            entityId: d.id,
          });
          queued += 1;
        } catch {
          skipped.push({ id: d.id, name, reason: 'send_error' });
        }
      }
      return { queued, skipped };
    }

    // channel === 'telegram'
    const contact = await this.sms.getContacts(accountId);
    // Tanlangan shablon (templateId) yoki kanalning default'i; ikkovi yo'q →
    // renderReminderText fallback (hardcoded reminderMessage) ishlatadi.
    const tpl = templateId
      ? await this.msgTemplates.findOne(accountId, templateId).catch(() => null)
      : await this.msgTemplates.findDefault(accountId, 'telegram');
    for (const d of debts) {
      const name = d.counterparty?.name ?? 'mijoz';
      const remaining = d.totalMinor - d.paidMinor;
      if (remaining <= 0n) {
        skipped.push({ id: d.id, name, reason: 'no_debt' });
        continue;
      }
      const text = renderReminderText(tpl, {
        name,
        remainingMinor: remaining,
        totalMinor: d.totalMinor,
        contact,
      });
      // notifyCounterparty hech qachon throw qilmaydi — { sent, reason } qaytaradi;
      // reason (no_phone/no_chat/telegram_off/...) o'zi bilan uzatiladi.
      const res = await this.telegram
        .notifyCounterparty(accountId, d.counterpartyId, text, 'reminder')
        .catch(() => ({ sent: false, reason: 'send_error' }) as { sent: boolean; reason?: string });
      if (res.sent) queued += 1;
      else skipped.push({ id: d.id, name, reason: res.reason ?? 'no_telegram_chat' });
    }
    return { queued, skipped };
  }

  /** Qarzni oladi yoki 404. */
  /**
   * Storno'ning kassa tomoni (Faza 11, `M-05`) — IKKALA qaytarish yo'li
   * (`reversePayment`, `cancelCallNote`) shu yerdan o'tadi.
   *
   * Ikki shart: (1) to'lov umuman yashiqqa tegishlimi (`debtCashDeskDeltas` —
   * naqd + kassa), (2) o'sha kredit HAQIQATAN daftarda bormi
   * (`debtCashLedgerWasWritten` — Faza 11'dan oldingi to'lovlar uchun yo'q).
   */
  private async reverseCashDeskDelta(
    tx: Prisma.TransactionClient,
    accountId: string,
    payment: {
      id: string;
      batchId: string | null;
      method: string;
      cashDeskId: string | null;
      currency: string;
      amountMinor: bigint;
      amountOriginalMinor: bigint | null;
    },
    counterpartyId: string,
    reason: string,
  ): Promise<void> {
    const deltas = debtCashDeskDeltas(payment, {
      sign: -1n,
      documentId: debtLedgerDocumentId(payment),
      counterpartyId,
      description: `Storno: ${reason}`,
    });
    if (deltas.length === 0) return;
    if (!(await debtCashLedgerWasWritten(tx, accountId, payment))) return;
    await this.money.applyDeltas(tx, accountId, deltas);
  }

  private async mustFind(accountId: string, id: string) {
    const debt = await this.prisma.client.debt.findFirst({
      where: { id, accountId, deletedAt: null },
    });
    if (!debt) throw new NotFoundException('Qarz topilmadi');
    return debt;
  }

  // ─────────────────────────────────────────────────── §3.1 qarzdorlar ro'yxati ──

  async list(accountId: string, raw: unknown) {
    const f: DebtFilterInput = DebtFilterSchema.parse(raw);
    const where: Prisma.DebtWhereInput = {
      accountId,
      ...(f.includeDeleted ? {} : { deletedAt: null }),
      ...(f.counterpartyId ? { counterpartyId: f.counterpartyId } : {}),
      ...(f.ownerId ? { ownerId: f.ownerId } : {}),
      ...(f.status ? { status: f.status } : {}),
    };

    // ANIQ TANLANGAN idlar (checkbox-eksport) — scope'ni chetlab o'tadi:
    // foydalanuvchi ro'yxatdan qo'lda belgilagan yozuvlar filtr holatidan
    // qat'i nazar chiqishi kerak.
    if (f.ids?.length) {
      where.id = { in: f.ids };
    }

    // scope — TZ §3.1 filtrlari.
    const now = new Date();
    if (f.ids?.length) {
      // ids rejimida status/scope torlashtirilmaydi.
    } else if (f.scope === 'active') {
      // «Faqat qarzi to'liq yopilmagan (qoldiq > 0) mijozlar ko'rinadi.»
      where.status = f.status ?? { in: ['unpaid', 'partial'] };
    } else if (f.scope === 'today') {
      // §3.5 — keyingi qo'ng'iroq sanasi BUGUNGI Toshkent kuniga to'g'ri keladi.
      const day = this.tashkentDay();
      where.status = { in: ['unpaid', 'partial'] };
      where.nextContactAt = { gte: day.gte, lt: day.lt };
    } else if (f.scope === 'overdue') {
      where.status = { in: ['unpaid', 'partial'] };
      where.nextContactAt = { lt: now };
    } else if (f.scope === 'problem') {
      // «MUAMMOLI QARZDORLAR» (2026-07-14): operator qo'ng'iroqda belgilagan
      // mijozlar. Yopilgan qarz bu yerda ko'rinmaydi — muammo hal bo'lgan.
      where.problem = true;
      where.status = { in: ['unpaid', 'partial'] };
    } else if (f.scope === 'called') {
      // «Qo'ng'iroq qilinganlar» (2026-07-12): tanlangan Toshkent kunida
      // qo'ng'iroq belgilangan qarzlar — statusidan qat'i nazar (to'lab
      // yopilganlar ham ko'rinadi, natijani baholash uchun).
      const day = this.tashkentDay(f.calledDate);
      where.lastCallAt = { gte: day.gte, lt: day.lt };
      if (f.callOutcome) where.lastCallOutcome = f.callOutcome;
    }

    // Kontragent bo'yicha shartlar bitta obyektga YIG'ILADI — search ham,
    // segment (guruh) ham bir vaqtda ishlashi mumkin (masalan Elektriklar
    // ichida ism qidirish).
    const cpWhere: Prisma.CounterpartyWhereInput = {};
    if (f.search) {
      cpWhere.OR = [
        { name: { contains: f.search, mode: 'insensitive' } },
        { phone: { contains: f.search, mode: 'insensitive' } },
      ];
    }
    if (f.counterpartyGroupId || f.counterpartyGroupExclude) {
      cpWhere.groups = {
        ...(f.counterpartyGroupId ? { some: { id: f.counterpartyGroupId } } : {}),
        ...(f.counterpartyGroupExclude ? { none: { id: f.counterpartyGroupExclude } } : {}),
      };
    }
    if (Object.keys(cpWhere).length > 0) {
      where.counterparty = cpWhere;
    }

    // Saralash. `remainingMinor` — hisoblanuvchi ustun, SQL'da yo'q; Prisma uni
    // orderBy qila olmaydi ⇒ shu holatda xotirada saralaymiz (sahifa hajmi ≤500).
    const inMemorySort = f.sortBy === 'remainingMinor';
    const orderBy: Prisma.DebtOrderByWithRelationInput[] = inMemorySort
      ? [{ createdAt: 'desc' }]
      : f.sortBy === 'counterparty'
        ? [{ counterparty: { name: f.sortDir } }, { id: 'asc' }]
        : [
            // nextContactAt: NULL'lar oxirida tursin (yopilgan qarzlarda null).
            { [f.sortBy]: f.sortDir } as Prisma.DebtOrderByWithRelationInput,
            { id: 'asc' },
          ];

    const [rows, total] = await Promise.all([
      this.prisma.client.debt.findMany({
        where,
        orderBy,
        ...(inMemorySort ? {} : { take: f.limit, skip: f.offset }),
        include: {
          counterparty: { select: { id: true, name: true, phone: true } },
          owner: { select: { id: true, name: true } },
          issuedBy: { select: { id: true, name: true } },
          notes: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { text: true, createdAt: true },
          },
        },
      }),
      this.prisma.client.debt.count({ where }),
    ]);

    let items = rows.map((r) => this.toDto(r));
    if (inMemorySort) {
      items.sort((a, b) => {
        const d = BigInt(a.remainingMinor) - BigInt(b.remainingMinor);
        const n = d > 0n ? 1 : d < 0n ? -1 : 0;
        return f.sortDir === 'asc' ? n : -n;
      });
      items = items.slice(f.offset, f.offset + f.limit);
    }

    // §4 — umumiy qarzdorlik summasi (joriy filtr bo'yicha).
    const totals = await this.prisma.client.debt.aggregate({
      where,
      _sum: { totalMinor: true, paidMinor: true },
    });
    const outstanding = (totals._sum.totalMinor ?? 0n) - (totals._sum.paidMinor ?? 0n);

    return {
      rows: items,
      total,
      outstandingMinor: (outstanding > 0n ? outstanding : 0n).toString(),
    };
  }

  // ────────────────────────────────────────────────── §3.3 yangi qarz berish ──

  /**
   * Kassir mijozga yangi qarz beradi. Izoh + keyingi aloqa sanasi MAJBURIY
   * (schema darajasida) — va ular darhol muloqot tarixiga «Kassir» yozuvi
   * sifatida tushadi (§3.3 oxirgi band).
   */
  async create(accountId: string, userId: string, role: ActorRole, raw: unknown) {
    const input: CreateDebtInput = CreateDebtSchema.parse(raw);

    const cp = await this.prisma.client.counterparty.findFirst({
      where: { id: input.counterpartyId, accountId },
      select: { id: true },
    });
    if (!cp) throw new BadRequestException('Kontragent topilmadi');

    const created = await this.prisma.client.$transaction(async (tx) => {
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
          totalMinor: BigInt(input.totalMinor),
          paidMinor: 0n,
          currency: input.currency,
          status: 'unpaid',
          nextContactAt: input.nextContactAt,
          ownerId: input.ownerId ?? userId,
          issuedById: userId,
          comment: input.comment,
        },
      });

      // 🔴 BALANS SIMMETRIYASI (kassa TZ §7.3, 2026-08-05).
      //
      // OLDIN: `create` balansga UMUMAN yozmasdi, `recalc` esa to'lovda
      // `-paidDelta` yozardi. Natijada qo'lda ochilgan QRZ- qarz to'liq
      // to'langanda kontragent saldosi o'sha summaga MANFIYga ketardi —
      // ya'ni pul kirgani balansdan ayrilar, lekin qarz kirgani hech qachon
      // qo'shilmagan edi (xotira: `debt-ledger-asymmetry`).
      //
      // ENDI: reyestrga qarz ochilishi ham daftarga tushadi. Qarz berilishi
      // (+) va to'lanishi (−) bir jurnalda, ya'ni to'liq to'langan qarz
      // saldoni AYNAN nolga qaytaradi.
      //
      // ⚠️ Nega bu ikki marta sanashga olib kelmaydi: hujjatdan kelgan qarz
      // (kassa qarzga sotuvi) reyestrga YOZILMAYDI — u faqat balansga
      // tushadi (`retail-sale.service.ts` §7.1 izohi). Reyestr esa faqat
      // qo'lda ochiladigan, hujjatsiz qarzlar uchun. Bitta qarz — bitta yo'l.
      await this.balances.applyDelta(
        tx,
        accountId,
        input.counterpartyId,
        input.currency,
        BigInt(input.totalMinor),
        // Qarz kartochkasida organizatsiya o'lchovi yo'q ⇒ jurnalda `null`.
        { docType: 'debt', docId: debt.id, organizationId: null },
      );

      // §3.3 — izoh muloqot tarixiga «Kassir» yozuvi bo'lib tushadi.
      await tx.debtNote.create({
        data: {
          accountId,
          debtId: debt.id,
          text: input.comment,
          nextContactAt: input.nextContactAt,
          authorId: userId,
          authorRole: role,
          kind: 'debt_issue' satisfies DebtNoteKind,
        },
      });

      return debt;
    });

    return created;
  }

  // ────────────────────────────────────────────────────── §3.2 mijoz profili ──

  /**
   * Mijoz profili: qarz + to'lovlar tarixi + muloqot tarixi (xronologik,
   * oxirgisi yuqorida — §3.4). Screenshot'lar attachment id bilan qaytadi;
   * FE ularni `/attachments/:id/raw` orqali ochadi (§3.7 — nizoda tekshirish).
   */
  async findById(accountId: string, id: string) {
    const debt = await this.prisma.client.debt.findFirst({
      where: { id, accountId, deletedAt: null },
      include: {
        counterparty: { select: { id: true, name: true, phone: true } },
        owner: { select: { id: true, name: true } },
        issuedBy: { select: { id: true, name: true } },
      },
    });
    if (!debt) throw new NotFoundException('Qarz topilmadi');

    const [payments, notes] = await Promise.all([
      this.prisma.client.debtPayment.findMany({
        where: { accountId, debtId: id },
        orderBy: { createdAt: 'desc' },
        include: {
          receivedBy: { select: { id: true, name: true } },
          reversedBy: { select: { id: true, name: true } },
          cashDesk: { select: { id: true, name: true } },
        },
      }),
      this.prisma.client.debtNote.findMany({
        where: { accountId, debtId: id },
        orderBy: { createdAt: 'desc' },
        include: {
          author: { select: { id: true, name: true } },
          canceledBy: { select: { id: true, name: true } },
        },
      }),
    ]);

    return {
      ...this.toDto(debt),
      payments: payments.map((p) => ({
        id: p.id,
        amountMinor: p.amountMinor.toString(),
        method: p.method,
        // To'lov VALYUTASI (2026-07-13): naqd dollarda berilgan bo'lsa, mijoz
        // kartochkasida asl summa va kurs ham ko'rinadi — «qancha dollar,
        // qaysi kursda» degan savol javobsiz qolmasin.
        currency: p.currency,
        amountOriginalMinor: p.amountOriginalMinor?.toString() ?? null,
        exchangeRate: p.exchangeRate?.toString() ?? null,
        // §3.8 — «qayerdan qabul qilingani» har yozuvda ko'rinadi.
        sourceName: p.sourceName ?? p.cashDesk?.name ?? null,
        attachmentId: p.attachmentId,
        comment: p.comment,
        receivedByName: p.receivedBy?.name ?? null,
        receivedByRole: p.receivedByRole,
        // STORNO (2026-07-16): qaytarilgan to'lov ro'yxatda qoladi — kim,
        // qachon, nega qaytargani bilan (FE «qaytarilgan» belgisini shundan chizadi).
        reversedAt: p.reversedAt,
        reversedByName: p.reversedBy?.name ?? null,
        reverseReason: p.reverseReason,
        createdAt: p.createdAt,
      })),
      notes: notes.map((n) => ({
        id: n.id,
        text: n.text,
        nextContactAt: n.nextContactAt,
        authorName: n.author?.name ?? null,
        authorRole: n.authorRole,
        kind: n.kind,
        // NATIJANI BEKOR QILISH (2026-07-16): FE «↩︎ Bekor qilish» tugmasini
        // faqat jonli natija-yozuvida ko'rsatadi; bekor qilinganida — belgi.
        outcome: n.outcome,
        paymentId: n.paymentId,
        canceledAt: n.canceledAt,
        canceledByName: n.canceledBy?.name ?? null,
        cancelReason: n.cancelReason,
        createdAt: n.createdAt,
      })),
    };
  }

  // ──────────────────────────────────────────────────── §3.4 muloqot yozuvi ──

  async addNote(accountId: string, userId: string, role: ActorRole, debtId: string, raw: unknown) {
    const input: CreateDebtNoteInput = CreateDebtNoteSchema.parse(raw);
    const debt = await this.mustFind(accountId, debtId);

    return this.prisma.client.$transaction(async (tx) => {
      const note = await tx.debtNote.create({
        data: {
          accountId,
          debtId,
          text: input.text,
          nextContactAt: input.nextContactAt ?? null,
          authorId: userId,
          authorRole: role,
          kind: 'call' satisfies DebtNoteKind,
        },
      });

      // Oxirgi kelishilgan sana kuchda — Debt.nextContactAt'ni yangilaymiz.
      // Yopilgan qarzda sanani tiklamaymiz (§3.6).
      if (input.nextContactAt && debt.status !== 'paid') {
        await tx.debt.update({
          where: { id: debtId },
          // callRemindedAt: null — yangi muddat uchun eslatma qaytadan ishlasin.
          data: { nextContactAt: input.nextContactAt, callRemindedAt: null },
        });
      }
      return note;
    });
  }

  // ─────────────────────────── «Qo'ng'iroq qilindi» belgisi (2026-07-12 talab) ──

  /**
   * Operator qarzdor kartochkasida «qo'ng'iroq qilindi» deb natijani bosadi:
   *   to'ladi / qisman to'ladi / to'lamadi / qayta qo'ng'iroq (sana majburiy).
   *
   * Bitta tranzaksiyada: (1) muloqot tarixiga kind='call' + outcome yozuvi
   * (§3.4 — hech narsa o'chmaydi), (2) Debt.lastCallAt/lastCallOutcome
   * yangilanadi («Qo'ng'iroq qilinganlar» bo'limi shundan filtrlanadi),
   * (3) callback bo'lsa nextContactAt ham ko'chadi — «Bugungi qo'ng'iroqlar»
   * ro'yxatiga o'sha kunda qaytib tushadi.
   */
  async markCall(accountId: string, userId: string, role: ActorRole, debtId: string, raw: unknown) {
    const input: MarkCallInput = MarkCallSchema.parse(raw);
    const debt = await this.mustFind(accountId, debtId);

    const fmtSom = (minor: bigint): string =>
      (minor / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

    const isPayment = input.outcome === 'paid_full' || input.outcome === 'paid_partial';
    const remaining = debt.totalMinor - debt.paidMinor;

    // ── To'lovni SO'MGA keltirish ────────────────────────────────────────────
    // Mijoz naqdni dollarda bergan bo'lishi mumkin, lekin qarz daftari so'mda
    // yuritiladi. Shuning uchun har doim ikki qiymat saqlanadi:
    //   amountMinor          — so'mdagi ekvivalent (qarz hisobi shundan)
    //   amountOriginalMinor  — mijoz ASLIDA bergan summa (USD → sent)
    // USD → so'm: sent × (kurs×10000) / 10000 = tiyin.
    let paidSomMinor = 0n;
    let originalMinor: bigint | null = null;
    let rate: bigint | null = null;

    if (isPayment) {
      rate = input.exchangeRate ? BigInt(input.exchangeRate) : null;
      originalMinor = input.amountOriginalMinor
        ? BigInt(input.amountOriginalMinor)
        : input.amountMinor
          ? BigInt(input.amountMinor)
          : null;

      if (input.currency === 'USD') {
        // Kurs schema'da majburiy qilingan; bu yerda faqat hisob.
        if (originalMinor == null || rate == null || rate <= 0n) {
          throw new BadRequestException('Dollar to’lovida summa va kurs majburiy');
        }
        paidSomMinor = (originalMinor * rate) / 10_000n;
      } else {
        paidSomMinor = originalMinor ?? 0n;
      }

      if (input.outcome === 'paid_full') {
        // «To'liq to'ladi» — qarz butunlay yopiladi. Operator kiritgan summa
        // yaxlitlash tufayli qoldiqdan bir necha tiyinga farq qilishi mumkin,
        // shuning uchun daftarga QOLDIQ yoziladi (qarz 0 ga tushsin), asl
        // summa/valyuta/kurs esa metama'lumot sifatida saqlanadi.
        paidSomMinor = remaining;
        if (originalMinor == null) originalMinor = remaining;
        if (input.currency === 'UZS') rate = null;
      } else {
        // Qisman to'lov — kiritilgan summa aynan shu qiymatda yoziladi.
        if (paidSomMinor <= 0n) {
          throw new BadRequestException('To’lov summasi 0 dan katta bo’lishi kerak');
        }
        if (paidSomMinor > remaining) {
          throw new BadRequestException(
            `To’lov qoldiqdan katta (qoldiq: ${fmtSom(remaining)} so’m)`,
          );
        }
      }
    }

    // Tarix matni: natija + (to'lovda SUMMA va KANAL) + operator izohi.
    const KIND_LABEL =
      input.paymentKind === 'click'
        ? 'Click'
        : input.paymentKind === 'account'
          ? 'hisob raqam'
          : 'naqd';
    const origLabel =
      input.currency === 'USD' && originalMinor != null
        ? ` (${(Number(originalMinor) / 100).toFixed(2)} $ × ${
            rate != null ? (Number(rate) / 10_000).toLocaleString('ru-RU') : '—'
          })`
        : '';

    const OUTCOME_LABEL: Record<MarkCallInput['outcome'], string> = {
      paid_full: `Qo'ng'iroq: to'ladi — qarz to'liq yopildi, ${fmtSom(
        paidSomMinor,
      )} so'm ${KIND_LABEL}${origLabel}`,
      paid_partial: `Qo'ng'iroq: qisman to'ladi — ${fmtSom(
        paidSomMinor,
      )} so'm ${KIND_LABEL}${origLabel}`,
      not_paid: "Qo'ng'iroq: to'lamadi",
      callback: "Qo'ng'iroq: qayta qo'ng'iroq kerak",
    };
    const noteText = input.text?.length
      ? `${OUTCOME_LABEL[input.outcome]}. ${input.text}`
      : OUTCOME_LABEL[input.outcome];

    // Kanal → daftar metodi. Click = karta o'tkazmasi (chek rasmi bor), shuning
    // uchun mavjud 'card_screenshot' turiga tushadi va mijoz kartochkasining
    // KARTA bo'limida ko'rinadi. Hisob raqam (2026-07-17) — alohida 'account'
    // turi, kartochkaning HISOB RAQAM bo'limida. Naqd — 'cash', NAQD bo'limida.
    const method: DebtPaymentMethod =
      input.paymentKind === 'click'
        ? 'card_screenshot'
        : input.paymentKind === 'account'
          ? 'account'
          : 'cash';
    const sourceName =
      input.paymentKind === 'click'
        ? "Click — qo'ng'iroqda"
        : input.paymentKind === 'account'
          ? "Hisob raqam — qo'ng'iroqda"
          : input.currency === 'USD'
            ? "Naqd (dollar) — qo'ng'iroqda"
            : "Naqd — qo'ng'iroqda";

    const result = await this.prisma.client.$transaction(async (tx) => {
      // To'lov bo'lgan bo'lsa — HAQIQIY to'lov yozuvi (2026-07-13). Ilgari
      // «to'ladi» faqat statusni o'zgartirardi va to'lov na lentada, na
      // hisobotda ko'rinardi. Endi paidMinor recalc orqali yopiladi.
      // To'lov YOZUVDAN OLDIN yaratiladi (2026-07-16): qo'ng'iroq-yozuvi
      // to'lovga `paymentId` bilan bog'lanadi — natija bekor qilinganda
      // to'lov ham storno bo'lishi (va aksincha) shu bog'lamga tayanadi.
      let paymentId: string | null = null;
      if (isPayment && paidSomMinor > 0n) {
        const created = await tx.debtPayment.create({
          data: {
            accountId,
            debtId,
            amountMinor: paidSomMinor,
            currency: input.currency,
            amountOriginalMinor: originalMinor,
            exchangeRate: rate,
            method,
            sourceName,
            comment: input.text?.length ? input.text : null,
            receivedById: userId,
            receivedByRole: role === 'admin' ? 'operator' : role,
          },
        });
        paymentId = created.id;
      }

      await tx.debtNote.create({
        data: {
          accountId,
          debtId,
          text: noteText,
          nextContactAt: input.nextContactAt ?? null,
          outcome: input.outcome,
          paymentId,
          authorId: userId,
          authorRole: role,
          kind: 'call' satisfies DebtNoteKind,
        },
      });

      // recalc: paidMinor = Σ to'lovlar → status/closedAt + kontragent balansi.
      const updated = await this.recalc(
        tx,
        accountId,
        debtId,
        input.outcome === 'paid_full' ? null : (input.nextContactAt ?? null),
        paymentId ?? debtId,
      );

      // ── MUAMMOLI MIJOZ (2026-07-14) ────────────────────────────────────────
      // `problem` BERILMAGAN bo'lsa — TEGILMAYDI. Ya'ni oddiy qo'ng'iroq
      // (masalan «to'lamadi») mavjud muammo belgisini tasodifan o'chirmaydi.
      // Belgilanganda/yechilganda muloqot tarixiga ham yozuv tushadi: kim,
      // qachon, nega — bu yo'qolmasligi kerak.
      const problemPatch =
        input.problem === true
          ? {
              problem: true,
              problemReason: input.problemReason ?? null,
              problemAt: new Date(),
              problemById: userId,
            }
          : input.problem === false
            ? { problem: false, problemAt: null, problemById: null }
            : {};

      if (input.problem !== undefined) {
        await tx.debtNote.create({
          data: {
            accountId,
            debtId,
            text:
              input.problem === true
                ? `⚠️ MUAMMOLI mijoz deb belgilandi. Sabab: ${input.problemReason ?? '—'}`
                : '✅ Muammoli belgisi olib tashlandi',
            nextContactAt: input.nextContactAt ?? null,
            authorId: userId,
            authorRole: role,
            kind: 'call' satisfies DebtNoteKind,
          },
        });
      }

      const debtRow = await tx.debt.update({
        where: { id: debtId },
        data: {
          lastCallAt: new Date(),
          lastCallOutcome: input.outcome,
          ...problemPatch,
          ...(input.outcome === 'paid_full'
            ? {
                callRemindedAt: null,
                // Qarz yopilsa muammo ham yopiladi — qarzsiz «muammoli mijoz»
                // ro'yxatda osilib qolmasin.
                problem: false,
                problemAt: null,
                problemById: null,
                // Chekka holat: qoldiq 0 bo'lib to'lov yaratilmagan bo'lsa ham,
                // «to'ladi» — operatorning uzil-kesil hukmi, qarz yopiladi.
                ...(updated.status === 'paid'
                  ? {}
                  : { status: 'paid', closedAt: new Date(), nextContactAt: null }),
              }
            : input.nextContactAt && updated.status !== 'paid'
              ? { nextContactAt: input.nextContactAt, callRemindedAt: null }
              : {}),
        },
      });

      return { debtRow, paymentId };
    });

    // Chek rasmi — tranzaksiyadan TASHQARIDA (blob yozish pul tranzaksiyasini
    // ushlab turmasin; §3.7 dagi bilan bir xil intizom). Click'da majburiy,
    // hisob raqamda (2026-07-17) ixtiyoriy — yuborilgan bo'lsa biriktiriladi.
    if (
      result.paymentId &&
      (input.paymentKind === 'click' || input.paymentKind === 'account') &&
      input.screenshotBase64
    ) {
      const buffer = this.decodeImage(input.screenshotBase64);
      const attachment = await this.attachments.createFromBuffer(accountId, userId, {
        entity: 'DebtPayment',
        entityId: result.paymentId,
        filename: input.filename,
        mime: input.mime,
        buffer,
        description: 'Qarz to’lovi — Click chek',
      });
      await this.prisma.client.debtPayment.update({
        where: { id: result.paymentId },
        data: { attachmentId: attachment.id },
      });
    }

    return result.debtRow;
  }

  // ───────────────────────────────────────── §3.6 kassada to'lov (naqd/terminal) ──

  /**
   * KASSIR to'lovi. Qisman to'lovda izoh + keyingi to'lov sanasi MAJBURIY
   * (TZ §3.6: «Agar to'lov QISMAN bo'lsa, kassir shu yerning o'zida izoh va
   * keyingi to'lov sanasini kiritishi kerak»). Summa oldindan noma'lum
   * bo'lgani uchun bu tekshiruv schema'da emas — shu yerda.
   */
  async addCashPayment(accountId: string, userId: string, debtId: string, raw: unknown) {
    const input: CreateCashPaymentInput = CreateCashPaymentSchema.parse(raw);
    const debt = await this.mustFind(accountId, debtId);

    if (debt.status === 'paid') {
      throw new BadRequestException('Qarz allaqachon to’liq to’langan');
    }

    const amount = BigInt(input.amountMinor);
    const remaining = debt.totalMinor - debt.paidMinor;
    if (amount > remaining) {
      throw new BadRequestException(
        `To’lov qoldiqdan katta (qoldiq: ${remaining.toString()} tiyin)`,
      );
    }

    const isPartial = amount < remaining;
    if (isPartial && (!input.comment || !input.nextContactAt)) {
      throw new BadRequestException('Qisman to’lovda izoh va keyingi to’lov sanasi majburiy');
    }

    let cashDeskName: string | null = null;
    if (input.cashDeskId) {
      const cd = await this.prisma.client.cashDesk.findFirst({
        where: { id: input.cashDeskId, accountId },
        select: { name: true },
      });
      if (!cd) throw new BadRequestException('Kassa topilmadi');
      cashDeskName = cd.name;
    }

    const updated = await this.prisma.client.$transaction(async (tx) => {
      const payment = await tx.debtPayment.create({
        data: {
          accountId,
          debtId,
          amountMinor: amount,
          method: input.method,
          sourceName: cashDeskName,
          cashDeskId: input.cashDeskId ?? null,
          comment: input.comment ?? null,
          receivedById: userId,
          receivedByRole: 'cashier',
        },
      });

      // Kassa daftari (`M-05`): kassir jismonan naqd oldi — yashiq qoldig'i va
      // `/money` lentasi shu yerda harakat qiladi. Predikat storno yo'li bilan
      // BIR XIL (`debtCashDeskDeltas`), aks holda kreditlanib qaytarilmagan
      // (yoki teskarisi) summa qolib ketardi.
      await this.money.applyDeltas(
        tx,
        accountId,
        // SAQLANGAN qatordan o'qiymiz, kirish DTO'sidan emas: storno ham aynan
        // shu qatorni o'qiydi, ya'ni ikki tomon bir manbadan kelib chiqadi.
        debtCashDeskDeltas(payment, {
          sign: 1n,
          documentId: debtLedgerDocumentId(payment),
          counterpartyId: debt.counterpartyId,
        }),
      );

      // Qisman to'lovda kassir izohi muloqot tarixiga tushadi (§3.4).
      if (isPartial && input.comment) {
        await tx.debtNote.create({
          data: {
            accountId,
            debtId,
            text: input.comment,
            nextContactAt: input.nextContactAt ?? null,
            authorId: userId,
            authorRole: 'cashier',
            kind: 'payment' satisfies DebtNoteKind,
          },
        });
      }

      return this.recalc(tx, accountId, debtId, input.nextContactAt ?? null, debtId);
    });

    return updated;
  }

  // ────────────────────────────────── §3.7 karta to'lovi (screenshot, operator) ──

  /**
   * OPERATOR to'lovi. Mijoz kartadan o'tkazib, chek rasmini yuborgan.
   * Rasm mavjud `attachments` jadvaliga yoziladi va uning id'si to'lovga
   * bog'lanadi — keyinchalik nizoli holatda ochib ko'rish uchun (§3.7).
   *
   * TZ aniq: summa screenshot bilan avtomatik solishtirilMAYDI — operator
   * qo'lda diqqat bilan kiritadi.
   */
  async addCardPayment(accountId: string, userId: string, debtId: string, raw: unknown) {
    const input: CreateCardPaymentInput = CreateCardPaymentSchema.parse(raw);
    const debt = await this.mustFind(accountId, debtId);

    if (debt.status === 'paid') {
      throw new BadRequestException('Qarz allaqachon to’liq to’langan');
    }

    const amount = BigInt(input.amountMinor);
    const remaining = debt.totalMinor - debt.paidMinor;
    if (amount > remaining) {
      throw new BadRequestException(
        `To’lov qoldiqdan katta (qoldiq: ${remaining.toString()} tiyin)`,
      );
    }

    const payment = await this.prisma.client.$transaction(async (tx) => {
      const created = await tx.debtPayment.create({
        data: {
          accountId,
          debtId,
          amountMinor: amount,
          method: 'card_screenshot',
          // §3.8 — to'lov manbai tarixda ajralib turadi.
          sourceName: 'Karta — screenshot',
          comment: input.comment ?? null,
          receivedById: userId,
          receivedByRole: 'operator',
        },
      });

      if (input.comment) {
        await tx.debtNote.create({
          data: {
            accountId,
            debtId,
            text: input.comment,
            nextContactAt: input.nextContactAt ?? null,
            authorId: userId,
            authorRole: 'operator',
            kind: 'payment' satisfies DebtNoteKind,
          },
        });
      }

      await this.recalc(tx, accountId, debtId, input.nextContactAt ?? null, created.id);
      return created;
    });

    // Rasmni tranzaksiyadan TASHQARIDA yozamiz: blob yozish uzoq davom etadi va
    // pul tranzaksiyasini ushlab turishi kerak emas. Muvaffaqiyatsiz bo'lsa
    // to'lov saqlangan, lekin rasm biriktirilmagan bo'ladi — operator qayta
    // yuklaydi (pulni yo'qotishdan ko'ra xavfsizroq).
    const buffer = this.decodeImage(input.screenshotBase64);
    const attachment = await this.attachments.createFromBuffer(accountId, userId, {
      entity: 'DebtPayment',
      entityId: payment.id,
      filename: input.filename,
      mime: input.mime,
      buffer,
      description: 'Qarz to’lovi — chek screenshot',
    });

    await this.prisma.client.debtPayment.update({
      where: { id: payment.id },
      data: { attachmentId: attachment.id },
    });

    return { ...payment, attachmentId: attachment.id, amountMinor: payment.amountMinor.toString() };
  }

  /** data-URI yoki toza base64 → Buffer. */
  private decodeImage(raw: string): Buffer {
    const comma = raw.indexOf(',');
    const body = raw.startsWith('data:') && comma !== -1 ? raw.slice(comma + 1) : raw;
    const buf = Buffer.from(body, 'base64');
    if (buf.length === 0) throw new BadRequestException('Rasm bo’sh yoki buzilgan');
    return buf;
  }

  // ─────────────────────────────── TO'LOVNI QAYTARISH — storno (2026-07-16) ──

  /**
   * Xato kiritilgan to'lovni QAYTARISH (storno).
   *
   * Printsiplar:
   *  1. To'lov JISMONAN O'CHIRILMAYDI — `reversedAt/By/Reason` belgilanadi.
   *     Tarix dalil bo'lib qoladi (§3.7 nizolarda ochib ko'riladi), hisob esa
   *     recalc invarianti (paidMinor = Σ jonli to'lovlar) orqali o'zi tuzaladi:
   *     status paid → partial/unpaid qaytadi, closedAt tozalanadi, kontragent
   *     balansi delta bilan tiklanadi.
   *  2. KIM qaytara oladi: to'lovni KIRITGAN xodimning o'zi (o'z xatosini
   *     darhol tuzatsin) yoki RAHBAR (admin — ikkala to'lov huquqi bor).
   *     Boshqa xodimning to'lovini oddiy operator/kassir qaytara olmaydi.
   *  3. SABAB majburiy (schema) va muloqot tarixiga yozuv tushadi — «bu pul
   *     qayoqqa ketdi?» degan savol hech qachon javobsiz qolmaydi.
   *  4. Qarz to'liq yopiq bo'lib qayta ochilsa — `nextContactAt` berilgan
   *     bo'lsa qo'ng'iroq jadvaliga qaytadi (callRemindedAt ham tozalanadi).
   */
  async reversePayment(
    accountId: string,
    userId: string,
    role: ActorRole,
    debtId: string,
    paymentId: string,
    raw: unknown,
  ) {
    const input: ReversePaymentInput = ReversePaymentSchema.parse(raw);
    const debt = await this.mustFind(accountId, debtId);

    const payment = await this.prisma.client.debtPayment.findFirst({
      where: { id: paymentId, accountId, debtId },
      include: { receivedBy: { select: { name: true } } },
    });
    if (!payment) throw new NotFoundException('To’lov topilmadi');
    if (payment.reversedAt) {
      throw new BadRequestException('Bu to’lov allaqachon qaytarilgan');
    }
    if (role !== 'admin' && payment.receivedById !== userId) {
      throw new ForbiddenException(
        'Faqat to’lovni kiritgan xodim yoki rahbar to’lovni qaytara oladi',
      );
    }

    const fmtSom = (minor: bigint): string =>
      (minor / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

    const updated = await this.prisma.client.$transaction(async (tx) => {
      await tx.debtPayment.update({
        where: { id: payment.id },
        data: {
          reversedAt: new Date(),
          reversedById: userId,
          reverseReason: input.reason,
        },
      });

      // Kassa daftari (`M-05`): qaytarilgan naqd yashiqdan CHIQADI.
      await this.reverseCashDeskDelta(tx, accountId, payment, debt.counterpartyId, input.reason);

      // Bu to'lov QO'NG'IROQ NATIJASIDAN tug'ilgan bo'lsa («to'ladi»/«qisman»),
      // o'sha natija-yozuvi ham bekor qilinadi (2026-07-16): aks holda
      // «Qo'ng'iroq qilinganlar» ro'yxatida mijoz haligacha «to'ladi» deb
      // ko'rinib qolaverardi, holbuki pul qaytarilgan.
      await tx.debtNote.updateMany({
        where: { accountId, debtId, paymentId: payment.id, canceledAt: null },
        data: {
          canceledAt: new Date(),
          canceledById: userId,
          cancelReason: input.reason,
        },
      });

      // Muloqot tarixiga iz: summa + manba + kim kiritgan edi + sabab.
      await tx.debtNote.create({
        data: {
          accountId,
          debtId,
          text: `↩️ TO'LOV QAYTARILDI: ${fmtSom(payment.amountMinor)} so'm (${
            payment.sourceName ?? payment.method
          }${payment.receivedBy?.name ? `, kiritgan: ${payment.receivedBy.name}` : ''}). Sabab: ${input.reason}`,
          nextContactAt: input.nextContactAt ?? null,
          authorId: userId,
          authorRole: role,
          kind: 'payment' satisfies DebtNoteKind,
        },
      });

      // recalc: paidMinor = Σ jonli to'lovlar → status/closedAt + balans delta.
      const debtRow = await this.recalc(
        tx,
        accountId,
        debtId,
        input.nextContactAt ?? undefined,
        payment.id,
      );

      // lastCallAt/lastCallOutcome — qolgan JONLI natija-yozuvlaridan qayta
      // hisoblanadi (bekor qilingan «to'ladi» belgisi ro'yxatlarda qolmasin).
      await this.recomputeLastCall(tx, accountId, debtId);

      // Yangi aloqa sanasi berilgan bo'lsa — eslatma cheklovi ham qayta ochiladi
      // (boshqa joylardagi nextContactAt yangilanishlari bilan bir intizom).
      if (input.nextContactAt && debtRow.status !== 'paid') {
        return tx.debt.update({
          where: { id: debtId },
          data: { callRemindedAt: null },
        });
      }
      return tx.debt.findFirstOrThrow({ where: { id: debtId, accountId } });
    });

    return updated;
  }

  /**
   * lastCallAt/lastCallOutcome — JONLI (bekor qilinmagan) natija-yozuvlaridan
   * qayta hisoblash. Yagona haqiqat manbai — debt_notes: natija bekor
   * qilinganda yoki bog'liq to'lov storno bo'lganda denormalizatsiya shu yerdan
   * o'zi tuzaladi (paidMinor↔debt_payments bilan bir xil intizom).
   */
  private async recomputeLastCall(tx: Prisma.TransactionClient, accountId: string, debtId: string) {
    const latest = await tx.debtNote.findFirst({
      where: { accountId, debtId, kind: 'call', outcome: { not: null }, canceledAt: null },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, outcome: true },
    });
    return tx.debt.update({
      where: { id: debtId },
      data: {
        lastCallAt: latest?.createdAt ?? null,
        lastCallOutcome: latest?.outcome ?? null,
      },
    });
  }

  // ─────────────── QO'NG'IROQ NATIJASINI BEKOR QILISH (2026-07-16 talab) ──────

  /**
   * Operator qo'ng'iroqda xato natija qo'ygan bo'lsa («to'ladi / qisman /
   * to'lamadi / qayta qo'ng'iroq») — o'sha amalni QAYTARADI.
   *
   * Printsiplar (to'lov stornosi bilan bir intizom):
   *  1. Yozuv O'CHMAYDI — `canceledAt/By/Reason` belgilanadi, tarixda
   *     «bekor qilingan» ko'rinishida qoladi (§3.4 append-only buzilmaydi).
   *  2. Natija TO'LOV YARATGAN bo'lsa (paid_full/paid_partial) — bog'langan
   *     to'lov ham BITTA tranzaksiyada storno bo'ladi: qoldiq/status/balans
   *     recalc orqali tiklanadi, mijozga Telegram xabari ketadi.
   *  3. lastCallAt/lastCallOutcome qolgan jonli yozuvlardan qayta hisoblanadi —
   *     «Qo'ng'iroq qilinganlar» ro'yxati hech qachon yolg'on ko'rsatmaydi.
   *  4. KIM bekor qila oladi: yozuvni KIRITGAN xodim yoki RAHBAR (admin).
   *  5. SABAB majburiy (schema) va tarixga alohida yozuv tushadi.
   */
  async cancelCallNote(
    accountId: string,
    userId: string,
    role: ActorRole,
    debtId: string,
    noteId: string,
    raw: unknown,
  ) {
    const input: CancelCallNoteInput = CancelCallNoteSchema.parse(raw);
    const debt = await this.mustFind(accountId, debtId);

    const note = await this.prisma.client.debtNote.findFirst({
      where: { id: noteId, accountId, debtId },
      include: { payment: true },
    });
    if (!note) throw new NotFoundException('Yozuv topilmadi');
    if (note.kind !== 'call' || !note.outcome) {
      throw new BadRequestException('Faqat qo’ng’iroq natijasi yozuvini bekor qilish mumkin');
    }
    if (note.canceledAt) {
      throw new BadRequestException('Bu yozuv allaqachon bekor qilingan');
    }
    if (role !== 'admin' && note.authorId !== userId) {
      throw new ForbiddenException(
        'Faqat yozuvni kiritgan xodim yoki rahbar natijani bekor qila oladi',
      );
    }

    // Guard'dan keyin outcome null emas; closure ichida narrowing yo'qolmasin.
    const outcome = note.outcome;

    // Bog'langan JONLI to'lov — natija bilan birga storno bo'ladi.
    const payment = note.payment && !note.payment.reversedAt ? note.payment : null;

    const fmtSom = (minor: bigint): string =>
      (minor / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

    const OUTCOME_LABEL: Record<string, string> = {
      paid_full: "to'ladi",
      paid_partial: "qisman to'ladi",
      not_paid: "to'lamadi",
      callback: "qayta qo'ng'iroq",
    };

    const updated = await this.prisma.client.$transaction(async (tx) => {
      await tx.debtNote.update({
        where: { id: note.id },
        data: {
          canceledAt: new Date(),
          canceledById: userId,
          cancelReason: input.reason,
        },
      });

      if (payment) {
        await tx.debtPayment.update({
          where: { id: payment.id },
          data: {
            reversedAt: new Date(),
            reversedById: userId,
            reverseReason: input.reason,
          },
        });

        // Storno bo'lgan naqd — yashiqdan chiqadi (`M-05`). `reversePayment`
        // bilan AYNAN bir yo'l: ikki kirish nuqtasi bir xil daftar harakatini
        // berishi shart.
        await this.reverseCashDeskDelta(tx, accountId, payment, debt.counterpartyId, input.reason);
      }

      // Tarixga iz: qaysi natija bekor qilindi, pul qaytdimi, nega.
      await tx.debtNote.create({
        data: {
          accountId,
          debtId,
          text: `↩️ QO'NG'IROQ NATIJASI BEKOR QILINDI: «${OUTCOME_LABEL[outcome] ?? outcome}»${
            payment ? ` — ${fmtSom(payment.amountMinor)} so'm to'lov ham qaytarildi` : ''
          }. Sabab: ${input.reason}`,
          nextContactAt: input.nextContactAt ?? null,
          authorId: userId,
          authorRole: role,
          kind: 'call' satisfies DebtNoteKind,
        },
      });

      // recalc: to'lov storno bo'lgan bo'lsa qoldiq/status/balans tiklanadi
      // (to'lov bo'lmasa — zararsiz, paidDelta = 0).
      const debtRow = await this.recalc(
        tx,
        accountId,
        debtId,
        input.nextContactAt ?? undefined,
        payment?.id ?? debtId,
      );

      // lastCallAt/lastCallOutcome — qolgan jonli yozuvlardan.
      await this.recomputeLastCall(tx, accountId, debtId);

      // Yangi aloqa sanasi berilgan bo'lsa — qo'ng'iroq jadvaliga qaytadi.
      if (input.nextContactAt && debtRow.status !== 'paid') {
        return tx.debt.update({
          where: { id: debtId },
          data: { nextContactAt: input.nextContactAt, callRemindedAt: null },
        });
      }
      return tx.debt.findFirstOrThrow({ where: { id: debtId, accountId } });
    });

    return updated;
  }

  // ──────────────────────────────────────────────── §3.5 bugungi qo'ng'iroqlar ──

  /**
   * «Bugungi qo'ng'iroqlar» — keyingi aloqa sanasi BUGUN bo'lganlar,
   * soat bo'yicha o'sish tartibida (eng erta vaqt yuqorida).
   *
   * `includeOverdue` (default: true) — muddati o'tib ketganlar ham qo'shiladi;
   * ular ro'yxatda qizil bilan ajratiladi (FE `overdue` bayrog'iga qaraydi).
   * TZ §3.5 «muddati o'tib ketgan qo'ng'iroqlar ro'yxatda rangda ajratiladi»
   * degani — demak ular ro'yxatda TURISHI kerak.
   */
  async todayCalls(
    accountId: string,
    opts: { ownerId?: string; includeOverdue?: boolean; dayOffset?: number } = {},
  ) {
    const dayOffset = opts.dayOffset ?? 0;
    const day = this.tashkentDay(this.dayOffsetIso(dayOffset));
    // Bugundan boshqa kunda «muddati o'tgan» tushunchasi yo'q — oyna qat'iy.
    // dayOffset=0 da mavjud xulq o'zgarmaydi (default hamon `true`).
    const includeOverdue = dayOffset === 0 && (opts.includeOverdue ?? true);

    const rows = await this.prisma.client.debt.findMany({
      where: {
        accountId,
        deletedAt: null,
        status: { in: ['unpaid', 'partial'] },
        ...(opts.ownerId ? { ownerId: opts.ownerId } : {}),
        nextContactAt: includeOverdue ? { lt: day.lt } : { gte: day.gte, lt: day.lt },
      },
      orderBy: { nextContactAt: 'asc' },
      include: {
        counterparty: { select: { id: true, name: true, phone: true } },
        owner: { select: { id: true, name: true } },
        issuedBy: { select: { id: true, name: true } },
        notes: { orderBy: { createdAt: 'desc' }, take: 1, select: { text: true, createdAt: true } },
      },
      take: 500,
    });

    return { rows: rows.map((r) => this.toDto(r)) };
  }

  // ───────────────────────────────────────── §3.9 kassirlar bo'yicha kunlik hisobot ──

  /**
   * Har bir kassir bo'yicha tanlangan kun kesimida:
   *   - qabul qilingan to'lovlar (FAQAT naqd/terminal — TZ: screenshot to'lovlar
   *     bu yerga KIRMAYDI, ular operator hisobotida),
   *   - berilgan yangi qarzlar,
   *   - tranzaksiyalar soni (tekshirish uchun).
   */
  async cashierReport(accountId: string, raw: unknown) {
    const f: CashierReportFilterInput = CashierReportFilterSchema.parse(raw);
    const day = this.tashkentDay(f.date);

    const [payments, issued] = await Promise.all([
      this.prisma.client.debtPayment.groupBy({
        by: ['receivedById'],
        where: {
          accountId,
          createdAt: { gte: day.gte, lt: day.lt },
          // §3.9 — screenshot to'lovlari kassir hisobotiga kirmaydi.
          method: { in: [...CASHIER_METHODS] },
          // Qaytarilgan (storno) to'lov kassir kunlik yig'indisiga kirmaydi.
          reversedAt: null,
        },
        _sum: { amountMinor: true },
        _count: { _all: true },
      }),
      this.prisma.client.debt.groupBy({
        by: ['issuedById'],
        where: { accountId, deletedAt: null, createdAt: { gte: day.gte, lt: day.lt } },
        _sum: { totalMinor: true },
        _count: { _all: true },
      }),
    ]);

    const ids = new Set<string>();
    for (const p of payments) if (p.receivedById) ids.add(p.receivedById);
    for (const i of issued) if (i.issuedById) ids.add(i.issuedById);

    const employees = ids.size
      ? await this.prisma.client.employee.findMany({
          where: { id: { in: [...ids] }, accountId },
          select: { id: true, name: true },
        })
      : [];
    const nameById = new Map(employees.map((e) => [e.id, e.name]));

    const rows = [...ids].map((id) => {
      const p = payments.find((x) => x.receivedById === id);
      const i = issued.find((x) => x.issuedById === id);
      return {
        cashierId: id,
        cashierName: nameById.get(id) ?? '—',
        collectedMinor: (p?._sum.amountMinor ?? 0n).toString(),
        collectedCount: p?._count._all ?? 0,
        issuedMinor: (i?._sum.totalMinor ?? 0n).toString(),
        issuedCount: i?._count._all ?? 0,
      };
    });

    rows.sort((a, b) => {
      const dir = f.sortDir === 'asc' ? 1 : -1;
      if (f.sortBy === 'name') return a.cashierName.localeCompare(b.cashierName) * dir;
      const key = f.sortBy === 'issuedMinor' ? 'issuedMinor' : 'collectedMinor';
      const d = BigInt(a[key]) - BigInt(b[key]);
      return (d > 0n ? 1 : d < 0n ? -1 : 0) * dir;
    });

    const totals = rows.reduce(
      (acc, r) => ({
        collectedMinor: acc.collectedMinor + BigInt(r.collectedMinor),
        issuedMinor: acc.issuedMinor + BigInt(r.issuedMinor),
        collectedCount: acc.collectedCount + r.collectedCount,
        issuedCount: acc.issuedCount + r.issuedCount,
      }),
      { collectedMinor: 0n, issuedMinor: 0n, collectedCount: 0, issuedCount: 0 },
    );

    return {
      date: day.gte,
      rows,
      totals: {
        collectedMinor: totals.collectedMinor.toString(),
        issuedMinor: totals.issuedMinor.toString(),
        collectedCount: totals.collectedCount,
        issuedCount: totals.issuedCount,
      },
    };
  }

  // ─────────────────────────────────────── §4 operator hisoboti + to'lov hisoboti ──

  /**
   * §4 — «Har bir operator bo'yicha: nechta qo'ng'iroq qilingani, nechta mijoz
   * to'lov qilgani, nechta screenshot to'lov tasdiqlangani».
   */
  async operatorReport(accountId: string, raw: unknown) {
    const f: CashierReportFilterInput = CashierReportFilterSchema.parse(raw);
    const day = this.tashkentDay(f.date);
    const window = { gte: day.gte, lt: day.lt };

    const [calls, cards] = await Promise.all([
      this.prisma.client.debtNote.groupBy({
        by: ['authorId'],
        where: { accountId, kind: 'call', createdAt: window },
        _count: { _all: true },
      }),
      this.prisma.client.debtPayment.groupBy({
        by: ['receivedById'],
        // reversedAt: null — qaytarilgan to'lov operator ko'rsatkichiga kirmaydi.
        // 2026-07-17: hisob raqam ('account') ham operator masofadan qabul
        // qilgan to'lov — Click bilan bir qatorda hisoblanadi.
        where: {
          accountId,
          method: { in: ['card_screenshot', 'account'] },
          createdAt: window,
          reversedAt: null,
        },
        _sum: { amountMinor: true },
        _count: { _all: true },
      }),
    ]);

    const ids = new Set<string>();
    for (const c of calls) if (c.authorId) ids.add(c.authorId);
    for (const c of cards) if (c.receivedById) ids.add(c.receivedById);

    const employees = ids.size
      ? await this.prisma.client.employee.findMany({
          where: { id: { in: [...ids] }, accountId },
          select: { id: true, name: true },
        })
      : [];
    const nameById = new Map(employees.map((e) => [e.id, e.name]));

    const rows = [...ids].map((id) => {
      const c = calls.find((x) => x.authorId === id);
      const s = cards.find((x) => x.receivedById === id);
      return {
        operatorId: id,
        operatorName: nameById.get(id) ?? '—',
        callCount: c?._count._all ?? 0,
        screenshotCount: s?._count._all ?? 0,
        screenshotMinor: (s?._sum.amountMinor ?? 0n).toString(),
      };
    });
    rows.sort((a, b) => b.callCount - a.callCount);

    return { date: day.gte, rows };
  }

  /** §4 — davr bo'yicha tushgan to'lovlar, TUR bo'yicha ajratilgan. */
  async paymentsReport(accountId: string, raw: unknown) {
    const f: DebtPaymentsReportFilterInput = DebtPaymentsReportFilterSchema.parse(raw);
    const bounds = tashkentRangeBounds(f.from, f.to);

    const grouped = await this.prisma.client.debtPayment.groupBy({
      by: ['method'],
      where: {
        accountId,
        ...(bounds.gte || bounds.lt ? { createdAt: bounds } : {}),
        ...(f.method ? { method: f.method } : {}),
        // Qaytarilgan (storno) to'lov davr hisobotiga kirmaydi.
        reversedAt: null,
      },
      _sum: { amountMinor: true },
      _count: { _all: true },
    });

    const byMethod = grouped.map((g) => ({
      method: g.method,
      amountMinor: (g._sum.amountMinor ?? 0n).toString(),
      count: g._count._all,
    }));
    const totalMinor = grouped.reduce((acc, g) => acc + (g._sum.amountMinor ?? 0n), 0n).toString();

    return { byMethod, totalMinor, from: bounds.gte ?? null, to: bounds.lt ?? null };
  }

  /**
   * «To'lovlar lentasi» — AYNAN QAYSI MIJOZ to'laganini ko'rsatadigan
   * xronologik ro'yxat (eng yangisi tepada). Har qatorda: mijoz, qarz raqami,
   * summa, usul, qayerdan (§3.8), kim qabul qilgani va to'lovdan keyingi
   * QOLDIQ + qarz statusi — «to'liq yopildi»mi bir qarashda ko'rinadi.
   *
   * Default davr — BUGUNGI Toshkent kuni («bugun kim to'ladi?» savoli);
   * sana/usul/qidiruv filtri bilan istalgan davr ochiladi.
   */
  async paymentsFeed(accountId: string, raw: unknown) {
    const f = DebtPaymentsFeedFilterSchema.parse(raw);
    // Sana berilmasa — bugungi kun (lenta odatiy holda kunlik).
    const bounds = f.from || f.to ? tashkentRangeBounds(f.from, f.to) : this.tashkentDay();

    const where: Prisma.DebtPaymentWhereInput = {
      accountId,
      createdAt: bounds,
      ...(f.method ? { method: f.method } : {}),
      ...(f.search
        ? {
            debt: {
              counterparty: {
                OR: [
                  { name: { contains: f.search, mode: 'insensitive' } },
                  { phone: { contains: f.search, mode: 'insensitive' } },
                ],
              },
            },
          }
        : {}),
    };

    const [rows, total, agg] = await Promise.all([
      this.prisma.client.debtPayment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: f.limit,
        skip: f.offset,
        include: {
          receivedBy: { select: { name: true } },
          reversedBy: { select: { name: true } },
          cashDesk: { select: { name: true } },
          debt: {
            select: {
              id: true,
              name: true,
              status: true,
              totalMinor: true,
              paidMinor: true,
              counterparty: { select: { id: true, name: true, phone: true } },
            },
          },
        },
      }),
      this.prisma.client.debtPayment.count({ where }),
      // Yig'indi QAYTARILGANLARSIZ — «tanlangan davrda tushgan» real pulni
      // ko'rsatsin. Qatorlar esa storno bilan ham ko'rinadi (lenta = tarix).
      this.prisma.client.debtPayment.aggregate({
        where: { ...where, reversedAt: null },
        _sum: { amountMinor: true },
      }),
    ]);

    return {
      rows: rows.map((p) => {
        const remaining = p.debt.totalMinor - p.debt.paidMinor;
        return {
          id: p.id,
          debtId: p.debt.id,
          debtName: p.debt.name,
          counterpartyName: p.debt.counterparty.name,
          phone: p.debt.counterparty.phone,
          amountMinor: p.amountMinor.toString(),
          method: p.method,
          sourceName: p.sourceName ?? p.cashDesk?.name ?? null,
          /** CHEK (2026-07-14): to'lovlar sahifasidan ham ochib ko'rilsin. */
          attachmentId: p.attachmentId,
          /** Naqd dollarda berilgan bo'lsa — asl summa va kurs ko'rinsin. */
          currency: p.currency,
          amountOriginalMinor: p.amountOriginalMinor?.toString() ?? null,
          exchangeRate: p.exchangeRate?.toString() ?? null,
          receivedByName: p.receivedBy?.name ?? null,
          receivedByRole: p.receivedByRole,
          /** STORNO (2026-07-16) — lentada «qaytarilgan» belgisi shu yerdan. */
          reversedAt: p.reversedAt,
          reversedByName: p.reversedBy?.name ?? null,
          reverseReason: p.reverseReason,
          /** To'lovdan keyin qarzning JORIY holati — «to'liq yopildi» belgisi shu yerdan. */
          debtStatus: p.debt.status,
          remainingMinor: (remaining > 0n ? remaining : 0n).toString(),
          createdAt: p.createdAt,
        };
      }),
      total,
      totalAmountMinor: (agg._sum.amountMinor ?? 0n).toString(),
    };
  }

  /** §4 — umumiy qarzdorlik + muddati o'tganlar (dashboard kartochkalari). */
  async summary(accountId: string) {
    const now = new Date();
    const day = this.tashkentDay();

    const [all, overdue, todayCount, problemCount] = await Promise.all([
      this.prisma.client.debt.aggregate({
        where: { accountId, deletedAt: null, status: { in: ['unpaid', 'partial'] } },
        _sum: { totalMinor: true, paidMinor: true },
        _count: { _all: true },
      }),
      this.prisma.client.debt.aggregate({
        where: {
          accountId,
          deletedAt: null,
          status: { in: ['unpaid', 'partial'] },
          nextContactAt: { lt: now },
        },
        _sum: { totalMinor: true, paidMinor: true },
        _count: { _all: true },
      }),
      this.prisma.client.debt.count({
        where: {
          accountId,
          deletedAt: null,
          status: { in: ['unpaid', 'partial'] },
          nextContactAt: { gte: day.gte, lt: day.lt },
        },
      }),
      // MUAMMOLI mijozlar (2026-07-14) — dashboard kartochkasi.
      this.prisma.client.debt.count({
        where: {
          accountId,
          deletedAt: null,
          problem: true,
          status: { in: ['unpaid', 'partial'] },
        },
      }),
    ]);

    const out = (a: { _sum: { totalMinor: bigint | null; paidMinor: bigint | null } }) => {
      const v = (a._sum.totalMinor ?? 0n) - (a._sum.paidMinor ?? 0n);
      return (v > 0n ? v : 0n).toString();
    };

    return {
      outstandingMinor: out(all),
      debtorCount: all._count._all,
      overdueMinor: out(overdue),
      overdueCount: overdue._count._all,
      todayCallCount: todayCount,
      /** «Muammoli qarzdorlar» bo'limidagi mijozlar soni. */
      problemCount,
    };
  }

  // ───────────────────────────────── MUAMMOLI MIJOZ (2026-07-14 talab) ──────

  /**
   * Muammo belgisini QO'YISH yoki YECHISH — «Muammoli qarzdorlar» sahifasidan.
   *
   * Qo'ng'iroq modalidan tashqari alohida yo'l kerak: muammo hal bo'lganda
   * operator qayta qo'ng'iroq qilmasdan ham ro'yxatdan chiqarishi mumkin
   * bo'lsin. Har ikkala amal MULOQOT TARIXIGA yoziladi — kim, qachon, nega.
   */
  async setProblem(
    accountId: string,
    userId: string,
    role: ActorRole,
    debtId: string,
    raw: unknown,
  ) {
    const input: SetProblemInput = SetProblemSchema.parse(raw);
    await this.mustFind(accountId, debtId);

    return this.prisma.client.$transaction(async (tx) => {
      await tx.debtNote.create({
        data: {
          accountId,
          debtId,
          text: input.problem
            ? `⚠️ MUAMMOLI mijoz deb belgilandi. Sabab: ${input.problemReason ?? '—'}`
            : `✅ Muammoli belgisi olib tashlandi${input.problemReason ? `. ${input.problemReason}` : ''}`,
          nextContactAt: input.nextContactAt ?? null,
          authorId: userId,
          authorRole: role,
          kind: 'call' satisfies DebtNoteKind,
        },
      });

      return tx.debt.update({
        where: { id: debtId },
        data: input.problem
          ? {
              problem: true,
              problemReason: input.problemReason ?? null,
              problemAt: new Date(),
              problemById: userId,
              ...(input.nextContactAt
                ? { nextContactAt: input.nextContactAt, callRemindedAt: null }
                : {}),
            }
          : { problem: false, problemAt: null, problemById: null },
      });
    });
  }

  // ───────────────────────────── qarzdorlar ro'yxati PDF (2026-07-12 talab) ──

  /**
   * Joriy filtr holatidagi (segment/scope/qidiruv/natija) BARCHA qarzdorlarni
   * bitta PDF jadvalga chiqaradi. Sahifalash list() orqali aylanadi (bir xil
   * filtr-mantiq, dublikat yo'q); remainingMinor saralashi sahifalararo buzilmasin
   * deb yakunda global qayta-saralanadi. 5000 qator xavfsizlik qopqog'i.
   */
  async printPdf(accountId: string, raw: unknown, heading: string | null): Promise<Buffer> {
    const f = DebtFilterSchema.parse(raw);
    type Row = Awaited<ReturnType<DebtService['list']>>['rows'][number];
    const rows: Row[] = [];
    let outstanding = '0';
    for (let offset = 0; offset < 5000; offset += 500) {
      const page = await this.list(accountId, { ...f, limit: 500, offset });
      rows.push(...page.rows);
      outstanding = page.outstandingMinor;
      if (rows.length >= page.total || page.rows.length === 0) break;
    }
    if (f.sortBy === 'remainingMinor') {
      rows.sort((a, b) => {
        const d = BigInt(a.remainingMinor) - BigInt(b.remainingMinor);
        const n = d > 0n ? 1 : d < 0n ? -1 : 0;
        return f.sortDir === 'asc' ? n : -n;
      });
    }

    const fmtSom = (minor: string): string => {
      const som = (BigInt(minor) / 100n).toString();
      return som.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    };
    const fmtDate = (iso: Date | string | null): string =>
      iso
        ? new Date(iso).toLocaleString('ru-RU', {
            timeZone: 'Asia/Tashkent',
            day: '2-digit',
            month: '2-digit',
            year: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })
        : '—';
    const esc = (s: string | null): string =>
      (s ?? '—').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const STATUS: Record<string, string> = {
      unpaid: "To'lanmagan",
      partial: "Qisman to'langan",
      paid: "To'liq to'langan",
    };
    const OUTCOME: Record<string, string> = {
      paid_full: "✓ to'ladi",
      paid_partial: '◐ qisman',
      not_paid: "✗ to'lamadi",
      callback: "↻ qayta qo'ng'iroq",
    };

    const now = new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Tashkent' });
    const body = rows
      .map(
        (r, i) => `<tr>
          <td class="n">${i + 1}</td>
          <td><b>${esc(r.counterpartyName)}</b><div class="sub">${esc(r.phone)}</div></td>
          <td class="mono">${esc(r.name)}</td>
          <td class="num">${fmtSom(r.totalMinor)}</td>
          <td class="num"><b>${fmtSom(r.remainingMinor)}</b></td>
          <td>${fmtDate(r.nextContactAt)}</td>
          <td>${STATUS[r.status] ?? r.status}${
            r.lastCallOutcome ? `<div class="sub">${OUTCOME[r.lastCallOutcome] ?? ''}</div>` : ''
          }</td>
        </tr>`,
      )
      .join('\n');

    const html = `<!doctype html><html><head><meta charset="utf-8"><style>
      * { box-sizing: border-box; font-family: Arial, sans-serif; }
      body { margin: 0; font-size: 10.5px; color: #111; }
      h1 { font-size: 16px; margin: 0 0 2px; }
      .meta { color: #555; font-size: 10px; margin-bottom: 10px; }
      .totals { font-size: 11px; margin-bottom: 8px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #bbb; padding: 4px 6px; text-align: left; vertical-align: top; }
      th { background: #f0f0f0; font-size: 10px; }
      td.n { width: 26px; color: #777; }
      td.num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
      td.mono { white-space: nowrap; color: #555; }
      .sub { color: #777; font-size: 9.5px; }
      tr { page-break-inside: avoid; }
      thead { display: table-header-group; }
    </style></head><body>
      <h1>Qarzdorlar ro'yxati${heading ? ` — ${esc(heading)}` : ''}</h1>
      <div class="meta">Chiqarilgan: ${now} · sherset.biznesjon.uz</div>
      <div class="totals"><b>${rows.length} ta qarzdor</b> · umumiy qoldiq: <b>${fmtSom(outstanding)} so'm</b></div>
      <table>
        <thead><tr>
          <th>№</th><th>Mijoz / telefon</th><th>Qarz №</th>
          <th>Jami (so'm)</th><th>Qoldiq (so'm)</th>
          <th>Keyingi qo'ng'iroq</th><th>Holat</th>
        </tr></thead>
        <tbody>${body}</tbody>
      </table>
    </body></html>`;

    return this.htmlPdf.renderHtmlToPdf(html, {
      marginTop: 10,
      marginRight: 8,
      marginBottom: 10,
      marginLeft: 8,
    });
  }

  // ───────────────────────────────────────────────────────────── soft-delete ──

  /** Korzina parity — qarz jismonan o'chmaydi (to'lov tarixi saqlanadi). */
  async remove(accountId: string, id: string) {
    const debt = await this.mustFind(accountId, id);
    if (debt.paidMinor > 0n) {
      throw new ForbiddenException('To’lov kiritilgan qarzni o’chirib bo’lmaydi (tarix saqlanadi)');
    }
    await this.prisma.client.debt.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { ok: true };
  }
}
