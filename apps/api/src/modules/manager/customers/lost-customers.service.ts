import { Prisma } from '@moysklad/db';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import type { RuleConfigRow } from '../queue/work-item-rules.js';
import {
  MANAGER_THRESHOLD,
  type ResolvedThreshold,
  effectiveThreshold,
  resolveManagerThresholds,
} from '../thresholds/manager-thresholds.js';
import {
  type CustomerActivityInput,
  type LostCustomerOptions,
  type LostCustomerRow,
  type LostCustomerSummary,
  buildLostCustomerList,
  summarizeLostCustomers,
} from './lost-customers.js';
import type { LostCustomerQueryInput, MarkLostReasonInput } from './lost-customers.schema.js';

/** `counterparty_notes.kind` — MK17 belgisi. */
export const LOST_REASON_NOTE_KIND = 'lost_reason';

/** Chegara qanday hal qilingani — ekranda ochiq ko'rsatiladi. */
export interface LostCustomerConfig {
  lostDays: number;
  lostDaysConfigured: boolean;
  /** 🔴 `false` = signal O'CHIRILGAN: ro'yxat bo'sh, lekin sabab ko'rinadi. */
  lostSignalEnabled: boolean;
  ownershipReleaseDays: number | null;
  /** Sozlama rad etilgan bo'lsa nima uchun (birlik/oraliq/raqam emas). */
  lostDaysRejectReason: string | null;
}

export interface LostCustomerListResult {
  rows: LostCustomerRow[];
  summary: LostCustomerSummary;
  config: LostCustomerConfig;
  totalCount: number;
  truncated: boolean;
  generatedAt: string;
}

interface ReasonRawRow {
  counterpartyId: string;
  reasonCode: string | null;
  text: string;
  createdAt: Date;
  authorId: string | null;
  authorName: string | null;
}

/**
 * MK17 — «yo'qolgan mijozlar signali» I/O qatlami (4M TZ §8.1/3).
 * **Qoidalar bu yerda emas** — ular sof `lost-customers.ts` da.
 *
 * ## Uchta narsa ATAYLAB qurilmadi
 *  1. **`Counterparty.lastActivityAt` ustuni yo'q** va kerak ham emas: faollik
 *     mavjud hujjatlardan (`Demand` + `RetailSale`) o'qiladi. Denormalizatsiya
 *     qilingan ustun har yozuvchidan yangilanishni talab qilardi va bitta
 *     unutilgan joy jimgina «yo'qolgan mijoz» yolg'onini bergan bo'lardi.
 *     F005 shu ustunni qo'shsa ham, bu yerdagi ta'rif o'zgarmasligi kerak —
 *     u FAKTdan o'qiydi.
 *  2. **Sabab uchun yangi jadval yo'q** — `counterparty_notes` ga
 *     `kind='lost_reason'` bilan yoziladi (MK16 `DebtNote.kind='reminder'`
 *     naqshi). Amaldagi sabab = eng oxirgi belgi; oldingilari o'chmaydi.
 *  3. **Chegara uchun ikkinchi sozlama manbai yo'q** — davr MK13 registridan
 *     (`manager_rule_configs`) o'qiladi ([[sla-thresholds-in-rule-config-table]]).
 */
@Injectable()
export class LostCustomersService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Yo'qolgan mijozlar ro'yxati + kesimlar. `now` argument sifatida kiradi
   * (test muzlatilgan vaqt bilan ishlaydi).
   */
  async list(
    accountId: string,
    query: LostCustomerQueryInput,
    now: Date = new Date(),
  ): Promise<LostCustomerListResult> {
    const config = await this.resolveConfig(accountId);

    // Signal o'chirilgan bo'lsa hisoblash ham qilinmaydi: bo'sh ro'yxat
    // SABABI bilan qaytadi, «hech kim yo'qolmagan» degan yolg'on emas.
    if (!config.lostSignalEnabled) {
      return {
        rows: [],
        summary: summarizeLostCustomers([], {
          lostDays: config.lostDays,
          ownershipReleaseDays: config.ownershipReleaseDays,
        }),
        config,
        totalCount: 0,
        truncated: false,
        generatedAt: now.toISOString(),
      };
    }

    const opts: LostCustomerOptions = {
      lostDays: config.lostDays,
      ownershipReleaseDays: config.ownershipReleaseDays,
    };

    const where = {
      accountId,
      archived: false,
      ...(query.unassigned ? { ownerId: null } : query.ownerId ? { ownerId: query.ownerId } : {}),
    };

    const counterparties = await this.prisma.client.counterparty.findMany({
      where,
      select: {
        id: true,
        name: true,
        phone: true,
        ownerId: true,
        owner: { select: { name: true } },
      },
    });

    const ids = counterparties.map((c) => c.id);
    const [demand, retail, reasons] = await Promise.all([
      this.purchaseAggregate(accountId, ids, 'demand'),
      this.purchaseAggregate(accountId, ids, 'retail'),
      this.latestReasons(accountId),
    ]);

    const inputs: CustomerActivityInput[] = counterparties.map((c) => {
      const d = demand.get(c.id);
      const r = retail.get(c.id);
      const mark = reasons.get(c.id);
      return {
        counterpartyId: c.id,
        name: c.name,
        phone: c.phone,
        ownerId: c.ownerId,
        ownerName: c.owner?.name ?? null,
        lastDemandAt: d?.last ?? null,
        lastRetailAt: r?.last ?? null,
        firstDemandAt: d?.first ?? null,
        firstRetailAt: r?.first ?? null,
        purchaseCount: (d?.count ?? 0) + (r?.count ?? 0),
        reason: mark
          ? {
              code: mark.reasonCode ?? '',
              note: mark.text || null,
              at: mark.createdAt,
              authorId: mark.authorId,
              authorName: mark.authorName,
            }
          : null,
      };
    });

    const all = buildLostCustomerList(inputs, opts, now);
    // 🔴 Kesimlar HAR DOIM to'liq to'plam ustidan: kesilgan sahifa bo'yicha
    // sanalsa «Anna: 3» kabi yolg'on son chiqardi.
    const summary = summarizeLostCustomers(all, opts);

    let rows = query.scope === 'lost' ? all.filter((r) => r.bucket === 'lost') : all;
    if (query.unmarkedOnly) rows = rows.filter((r) => r.bucket === 'lost' && !r.reasonCode);

    const totalCount = rows.length;
    const truncated = totalCount > query.limit;
    if (truncated) rows = rows.slice(0, query.limit);

    return { rows, summary, config, totalCount, truncated, generatedAt: now.toISOString() };
  }

  /**
   * Ketish sababini belgilash. Yangi jadval emas — mijozning izoh jurnaliga
   * yoziladi, shuning uchun tarix o'z-o'zidan qoladi.
   */
  async markReason(accountId: string, userId: string, body: MarkLostReasonInput) {
    // Tenant qo'riqchisi: begona akkaunt mijoziga belgi qo'yilmaydi.
    const cp = await this.prisma.client.counterparty.findFirst({
      where: { id: body.counterpartyId, accountId },
      select: { id: true },
    });
    if (!cp) throw new BadRequestException('Kontragent topilmadi');

    const note = await this.prisma.client.counterpartyNote.create({
      data: {
        accountId,
        counterpartyId: body.counterpartyId,
        authorId: userId,
        kind: LOST_REASON_NOTE_KIND,
        reasonCode: body.code,
        // Erkin matn ATAYLAB `text` da: kod barqaror, matn esa odam uchun.
        text: body.note ?? '',
      },
      select: { id: true, createdAt: true, reasonCode: true },
    });
    return { ok: true, noteId: note.id, at: note.createdAt, code: note.reasonCode };
  }

  // ── Ichki o'qishlar ─────────────────────────────────────────────────────

  /** MK13 registri + akkaunt sozlamasi (`manager_rule_configs`). */
  private async resolveConfig(accountId: string): Promise<LostCustomerConfig> {
    const rows = (await this.prisma.client.managerRuleConfig.findMany({
      where: {
        accountId,
        ruleType: {
          in: [MANAGER_THRESHOLD.lostCustomerDays, MANAGER_THRESHOLD.ownershipReleaseDays],
        },
      },
      select: {
        ruleType: true,
        enabled: true,
        thresholdValue: true,
        thresholdUnit: true,
        mode: true,
        severity: true,
      },
    })) as unknown as RuleConfigRow[];

    const resolved = resolveManagerThresholds(rows);
    const lost = must(resolved.get(MANAGER_THRESHOLD.lostCustomerDays));
    const release = must(resolved.get(MANAGER_THRESHOLD.ownershipReleaseDays));

    return {
      lostDays: lost.value,
      lostDaysConfigured: lost.configured,
      lostSignalEnabled: lost.enabled,
      lostDaysRejectReason: lost.rejectReason,
      // `enabled:false` = taymer YO'Q (registr sukutiga QAYTMAYDI).
      ownershipReleaseDays: effectiveThreshold(release),
    };
  }

  /**
   * Har mijoz uchun birinchi/oxirgi xarid va hujjat soni.
   *
   * **Valyuta bo'yicha FILTR YO'Q** — bu yerda pul qo'shilmaydi, faqat SANA
   * o'qiladi. `counterparty.service.ts` dagi «Сумма продаж» base-valyuta bilan
   * cheklangan (summalar aralashmasin uchun); bu yerda esa boshqa valyutadagi
   * jo'natma ham FAOLLIK — uni chiqarib tashlash mijozni yolg'ondan
   * «yo'qolgan» qilardi.
   */
  private async purchaseAggregate(
    accountId: string,
    ids: string[],
    source: 'demand' | 'retail',
  ): Promise<Map<string, { first: Date | null; last: Date | null; count: number }>> {
    const out = new Map<string, { first: Date | null; last: Date | null; count: number }>();
    if (ids.length === 0) return out;

    const where = {
      accountId,
      agentId: { in: ids },
      state: 'posted',
      deletedAt: null,
    };
    const rows =
      source === 'demand'
        ? await this.prisma.client.demand.groupBy({
            by: ['agentId'],
            where,
            _min: { moment: true },
            _max: { moment: true },
            _count: { _all: true },
          })
        : await this.prisma.client.retailSale.groupBy({
            by: ['agentId'],
            where,
            _min: { moment: true },
            _max: { moment: true },
            _count: { _all: true },
          });

    for (const r of rows as Array<{
      agentId: string | null;
      _min: { moment: Date | null };
      _max: { moment: Date | null };
      _count: { _all: number };
    }>) {
      // `RetailSale.agentId` NULL bo'lishi mumkin (kassadagi «o'tkinchi»
      // xaridor) — u hech bir mijozga tegishli emas.
      if (!r.agentId) continue;
      out.set(r.agentId, { first: r._min.moment, last: r._max.moment, count: r._count._all });
    }
    return out;
  }

  /**
   * Har mijozning ENG OXIRGI (arxivlanmagan) sabab belgisi.
   *
   * `DISTINCT ON (counterparty_id) … ORDER BY counterparty_id, created_at DESC`
   * — «guruhdagi eng yangi qator» ning kanonik shakli; migratsiyadagi indeks
   * aynan shu tartibda qo'yilgan ([[index-needs-matching-query-shape]]).
   * `counterparty.service.ts` dagi «oxirgi qo'ng'iroq» ham shu naqshda.
   */
  private async latestReasons(accountId: string): Promise<Map<string, ReasonRawRow>> {
    const rows = await this.prisma.client.$queryRaw<ReasonRawRow[]>(Prisma.sql`
      SELECT DISTINCT ON (n.counterparty_id)
             n.counterparty_id AS "counterpartyId",
             n.reason_code     AS "reasonCode",
             n.text            AS "text",
             n.created_at      AS "createdAt",
             n.author_id       AS "authorId",
             e.name            AS "authorName"
      FROM counterparty_notes n
      LEFT JOIN employees e ON e.id = n.author_id
      WHERE n.account_id = ${accountId}::uuid
        AND n.kind = ${LOST_REASON_NOTE_KIND}
        AND n.archived = false
      ORDER BY n.counterparty_id, n.created_at DESC
    `);
    const out = new Map<string, ReasonRawRow>();
    for (const r of rows) out.set(r.counterpartyId, r);
    return out;
  }
}

function must(t: ResolvedThreshold | undefined): ResolvedThreshold {
  if (!t) throw new Error('MK13 registrida chegara topilmadi');
  return t;
}
