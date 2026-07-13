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
import { HtmlPdfService } from '../print-template/html-pdf.service.js';
import { TASHKENT_OFFSET_MS, tashkentRangeBounds } from '../report/report-date-bounds.util.js';
import {
  CASHIER_METHODS,
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
  DebtPaymentsFeedFilterSchema,
  type DebtPaymentsReportFilterInput,
  DebtPaymentsReportFilterSchema,
  type DebtStatus,
  type MarkCallInput,
  MarkCallSchema,
} from './debt.schema.js';

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

  /** Qoldiqdan status chiqarish — statusning YAGONA manbai. */
  private deriveStatus(totalMinor: bigint, paidMinor: bigint): DebtStatus {
    if (paidMinor >= totalMinor) return 'paid';
    if (paidMinor > 0n) return 'partial';
    return 'unpaid';
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
   */
  private async recalc(
    tx: Prisma.TransactionClient,
    accountId: string,
    debtId: string,
    nextContactAt: Date | null | undefined,
  ) {
    const agg = await tx.debtPayment.aggregate({
      where: { accountId, debtId },
      _sum: { amountMinor: true },
    });
    const paid = agg._sum.amountMinor ?? 0n;

    const debt = await tx.debt.findFirstOrThrow({
      where: { id: debtId, accountId },
      select: { totalMinor: true },
    });

    const status = this.deriveStatus(debt.totalMinor, paid);
    const closed = status === 'paid';

    return tx.debt.update({
      where: { id: debtId },
      data: {
        paidMinor: paid,
        status,
        // §3.6 — to'liq yopilganda keyingi aloqa sanasi kerak emas.
        nextContactAt: closed ? null : (nextContactAt ?? undefined),
        closedAt: closed ? new Date() : null,
      },
    });
  }

  /** Qarzni oladi yoki 404. */
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

    return this.prisma.client.$transaction(async (tx) => {
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
          cashDesk: { select: { id: true, name: true } },
        },
      }),
      this.prisma.client.debtNote.findMany({
        where: { accountId, debtId: id },
        orderBy: { createdAt: 'desc' },
        include: { author: { select: { id: true, name: true } } },
      }),
    ]);

    return {
      ...this.toDto(debt),
      payments: payments.map((p) => ({
        id: p.id,
        amountMinor: p.amountMinor.toString(),
        method: p.method,
        // §3.8 — «qayerdan qabul qilingani» har yozuvda ko'rinadi.
        sourceName: p.sourceName ?? p.cashDesk?.name ?? null,
        attachmentId: p.attachmentId,
        comment: p.comment,
        receivedByName: p.receivedBy?.name ?? null,
        receivedByRole: p.receivedByRole,
        createdAt: p.createdAt,
      })),
      notes: notes.map((n) => ({
        id: n.id,
        text: n.text,
        nextContactAt: n.nextContactAt,
        authorName: n.author?.name ?? null,
        authorRole: n.authorRole,
        kind: n.kind,
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

    const fmtSom = (minor: string): string =>
      (BigInt(minor) / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

    // Tarix matni: natija + (partial'da SUMMA) + operator izohi.
    const OUTCOME_LABEL: Record<MarkCallInput['outcome'], string> = {
      paid_full: "Qo'ng'iroq: to'ladi — qarz to'liq yopildi",
      paid_partial: input.amountMinor
        ? `Qo'ng'iroq: qisman to'ladi — ${fmtSom(input.amountMinor)} so'm`
        : "Qo'ng'iroq: bir qismini to'ladi",
      not_paid: "Qo'ng'iroq: to'lamadi",
      callback: "Qo'ng'iroq: qayta qo'ng'iroq kerak",
    };
    const noteText = input.text?.length
      ? `${OUTCOME_LABEL[input.outcome]}. ${input.text}`
      : OUTCOME_LABEL[input.outcome];

    return this.prisma.client.$transaction(async (tx) => {
      await tx.debtNote.create({
        data: {
          accountId,
          debtId,
          text: noteText,
          nextContactAt: input.nextContactAt ?? null,
          outcome: input.outcome,
          authorId: userId,
          authorRole: role,
          kind: 'call' satisfies DebtNoteKind,
        },
      });

      // «TO'LADI» (2026-07-12 talab): qarz BUTUNLAY «to'liq to'langan»
      // hisobiga o'tadi — ro'yxatdan chiqadi, keyingi sana o'chadi.
      // Eslatma: bu deriveStatus invariantining YAGONA qo'lda istisnosi —
      // operator suhbatda to'liq to'lovni tasdiqladi (masalan kassadan
      // tashqarida to'langan). paidMinor tegilmaydi; keyin rasmiy to'lov
      // kiritilsa recalc o'z holicha ishlayveradi.
      if (input.outcome === 'paid_full') {
        // 2026-07-13 tuzatish: avval faqat status o'zgarardi — natijada to'lov
        // «To'lovlar» lentasida ham, hisobotlarda ham KO'RINMASDI. Endi qolgan
        // qoldiq HAQIQIY to'lov yozuvi bo'lib tushadi (method='manual_close'),
        // paidMinor recalc bilan yopiladi. Kassir kunlik hisoboti buzilmaydi —
        // u faqat cash+terminal ni sanaydi (§3.9).
        const remaining = debt.totalMinor - debt.paidMinor;
        if (remaining > 0n) {
          await tx.debtPayment.create({
            data: {
              accountId,
              debtId,
              amountMinor: remaining,
              method: 'manual_close',
              sourceName: "Qo'ng'iroqda tasdiqlandi",
              comment: input.text?.length ? input.text : null,
              receivedById: userId,
              receivedByRole: role === 'admin' ? 'operator' : role,
            },
          });
        }

        // recalc paidMinor = Σ to'lovlar → status='paid', closedAt, sana null.
        const updated = await this.recalc(tx, accountId, debtId, null);
        return tx.debt.update({
          where: { id: debtId },
          data: {
            lastCallAt: new Date(),
            lastCallOutcome: 'paid_full',
            callRemindedAt: null,
            // recalc allaqachon status/closedAt/nextContactAt ni to'g'riladi;
            // qoldiq 0 bo'lmagan chekka holatda (to'lov yaratilmagan) status'ni
            // majburan yopamiz — «To'ladi» degani operatorning uzil-kesil hukmi.
            ...(updated.status === 'paid'
              ? {}
              : { status: 'paid', closedAt: new Date(), nextContactAt: null }),
          },
        });
      }

      return tx.debt.update({
        where: { id: debtId },
        data: {
          lastCallAt: new Date(),
          lastCallOutcome: input.outcome,
          // Yopilgan qarzga keyingi sana qo'yilmaydi (§3.6 intizomi).
          ...(input.nextContactAt && debt.status !== 'paid'
            ? {
                nextContactAt: input.nextContactAt,
                // Yangi muddat — eslatma-cron shu muddat uchun qaytadan ishlasin.
                callRemindedAt: null,
              }
            : {}),
        },
      });
    });
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

    return this.prisma.client.$transaction(async (tx) => {
      await tx.debtPayment.create({
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

      return this.recalc(tx, accountId, debtId, input.nextContactAt ?? null);
    });
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

      await this.recalc(tx, accountId, debtId, input.nextContactAt ?? null);
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
  async todayCalls(accountId: string, opts: { ownerId?: string; includeOverdue?: boolean } = {}) {
    const day = this.tashkentDay();
    const includeOverdue = opts.includeOverdue ?? true;

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
        where: { accountId, method: 'card_screenshot', createdAt: window },
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
      this.prisma.client.debtPayment.aggregate({ where, _sum: { amountMinor: true } }),
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
          receivedByName: p.receivedBy?.name ?? null,
          receivedByRole: p.receivedByRole,
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

    const [all, overdue, todayCount] = await Promise.all([
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
    };
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
