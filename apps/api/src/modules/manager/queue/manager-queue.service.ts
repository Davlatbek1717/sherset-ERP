import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { monthInstantBounds } from '../../hr/hr-salary/payroll-formula.util.js';
import { localDateOnly } from '../../hr/hr-shared/tz.util.js';
import {
  type PriceAuditRow,
  extractPriceChanges,
  reviewPriceChanges,
} from '../inventory/price-change-control.js';
import type {
  QueueActionBodyInput,
  QueueListQueryInput,
  QueueSyncBodyInput,
  RuleConfigBodyInput,
} from './manager-queue.schema.js';
import {
  CLOSED_WORK_ITEM_STATUSES,
  WORK_ITEM_ACTION,
  WORK_ITEM_JOURNAL_ONLY_ACTION,
  WORK_ITEM_STATUS,
  type WorkItemActor,
  type WorkItemStatus,
  workItemFsm,
} from './work-item-fsm.js';
import {
  type CashVarianceRow,
  MANAGER_RULES,
  type ManagerRuleType,
  type RuleConfigRow,
  type WorkItemCandidate,
  buildCashVarianceCandidates,
  buildPriceChangeCandidates,
  isManagerRuleType,
  resolveRules,
} from './work-item-rules.js';
import {
  DEFAULT_STALE_AFTER_DAYS,
  type ExistingWorkItem,
  planQueueSync,
  sortQueue,
} from './work-queue-planner.js';

/**
 * MK06 / 4M TZ §5 — MENEJER ISH NAVBATI, I/O qatlami.
 *
 * **Qoidalar bu yerda emas** — ular uch sof modulda (`work-item-rules.ts`,
 * `work-queue-planner.ts`, `work-item-fsm.ts`, 57 test). Bu yerda faqat Prisma
 * o'qish/yozish va shakl moslash.
 *
 * ## Yangi yozuvchi OCHILMAYDI
 * Nomzodlar mavjud manbalardan o'qiladi: narx tarixi — `AuditLog` (MK11
 * tasdiqlagan), kassa farqi — `CashierSessionVariance` (Kassa TZ §8.4).
 * Navbat ULARNI takrorlamaydi, faqat «ko'rilishi kerak» degan belgini
 * saqlaydi.
 *
 * ## 🔴 NAVBAT HECH NARSANI BLOKLAMAYDI (§5.1)
 * Bu servis hujjat yaratish/o'tkazish yo'llaridan CHAQIRILMAYDI va hech qanday
 * `throw` bilan amalni to'xtatmaydi. Arxitektura qulfi
 * `queue-does-not-block.test.ts` da: modulga tashqaridan import qidiriladi.
 */

/** Manbani qancha orqaga qarab o'qish (nomzod yig'ishda). */
const DEFAULT_SYNC_SINCE_DAYS = 30;
/** Bir `sync` da o'qiladigan audit qatorlari shifti. */
const AUDIT_CAP = 2000;
/** Bir `sync` da o'qiladigan farq aktlari shifti. */
const VARIANCE_CAP = 2000;
const DEFAULT_LIST_LIMIT = 100;

const OPEN_STATUSES: WorkItemStatus[] = [WORK_ITEM_STATUS.open, WORK_ITEM_STATUS.inReview];

@Injectable()
export class ManagerQueueService {
  private readonly logger = new Logger(ManagerQueueService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  // ── Qoida sozlamalari ─────────────────────────────────────────────────────

  private async loadRules(accountId: string) {
    const rows = await this.prisma.client.managerRuleConfig.findMany({
      where: { accountId },
      select: {
        ruleType: true,
        enabled: true,
        thresholdValue: true,
        thresholdUnit: true,
        mode: true,
        severity: true,
      },
    });

    const config: RuleConfigRow[] = rows.map((r) => ({
      ruleType: r.ruleType,
      enabled: r.enabled,
      // Prisma `Decimal` — satrga aylantiramiz, `Number` ga emas: sof modul
      // o'zi parse qiladi va qaerda aniqlik yo'qolgani bitta joyda ko'rinadi.
      thresholdValue: r.thresholdValue == null ? null : r.thresholdValue.toString(),
      thresholdUnit: r.thresholdUnit,
      mode: r.mode,
      severity: r.severity,
    }));

    return resolveRules(config);
  }

  /** Ekran uchun: registr + akkаunt sozlamasi birlashgan holda. */
  async rules(accountId: string) {
    const resolved = await this.loadRules(accountId);
    return {
      rules: [...resolved.values()].map((rule) => ({
        ruleType: rule.ruleType,
        category: rule.category,
        enabled: rule.enabled,
        threshold: rule.threshold,
        thresholdUnit: rule.thresholdUnit,
        mode: rule.mode,
        severity: rule.severity,
        /** Sozlamadagi chegara birligi mos kelmagani uchun e'tiborsiz qoldi. */
        thresholdRejected: rule.thresholdRejected,
        /** 🔴 Doim `false` — navbat kuzatadi, to'xtatmaydi. */
        blocks: rule.blocks,
      })),
    };
  }

  async updateRule(
    accountId: string,
    actorId: string | null,
    ruleType: string,
    patch: RuleConfigBodyInput,
  ) {
    if (!isManagerRuleType(ruleType)) {
      throw new NotFoundException(`Noma'lum qoida turi: ${ruleType}`);
    }
    const def = MANAGER_RULES[ruleType];

    // Chegara birligi qoidaning birligiga MOS bo'lishi shart. Aks holda qator
    // saqlanadi-yu, `resolveRules` uni jimgina rad etardi — menejer «men
    // chegarani o'zgartirdim» degan yolg'on ishonchda qolardi.
    if (patch.thresholdValue != null) {
      const unit = patch.thresholdUnit ?? def.thresholdUnit;
      if (unit !== def.thresholdUnit) {
        throw new BadRequestException(
          `${ruleType} chegarasi «${def.thresholdUnit}» birligida bo'lishi kerak`,
        );
      }
    }

    const data = {
      enabled: patch.enabled,
      thresholdValue: patch.thresholdValue ?? null,
      thresholdUnit: patch.thresholdValue == null ? null : def.thresholdUnit,
      mode: patch.mode,
      severity: patch.severity,
      updatedById: actorId,
    };

    await this.prisma.client.managerRuleConfig.upsert({
      where: { accountId_ruleType: { accountId, ruleType } },
      create: {
        accountId,
        ruleType,
        enabled: data.enabled ?? def.defaultEnabled,
        thresholdValue: data.thresholdValue,
        thresholdUnit: data.thresholdUnit,
        mode: data.mode ?? 'notify',
        severity: data.severity ?? def.defaultSeverity,
        updatedById: actorId,
      },
      update: data,
    });

    return this.rules(accountId);
  }

  // ── Nomzod yig'ish ────────────────────────────────────────────────────────

  private async priceChangeCandidates(
    accountId: string,
    since: Date,
    rules: Awaited<ReturnType<ManagerQueueService['loadRules']>>,
  ): Promise<WorkItemCandidate[]> {
    const rule = rules.get('PRICE_CHANGE');
    if (!rule?.enabled) return [];

    const logs = await this.prisma.client.auditLog.findMany({
      where: { accountId, entity: 'Product', action: 'update', at: { gte: since } },
      orderBy: { at: 'desc' },
      take: AUDIT_CAP,
      select: {
        id: true,
        entityId: true,
        userId: true,
        at: true,
        fieldChanges: true,
        user: { select: { name: true } },
      },
    });

    const rows: PriceAuditRow[] = logs.map((l) => ({
      id: l.id,
      entityId: l.entityId,
      userId: l.userId,
      userName: l.user?.name ?? null,
      at: l.at,
      fieldChanges: l.fieldChanges,
    }));

    const productIds = [...new Set(rows.map((r) => r.entityId))];
    const products = productIds.length
      ? await this.prisma.client.product.findMany({
          where: { accountId, id: { in: productIds } },
          select: { id: true, name: true },
        })
      : [];
    const names: Record<string, string | null> = {};
    for (const p of products) names[p.id] = p.name;

    const changes = extractPriceChanges(rows, names);
    // Chegara SOZLAMADAN — MK11 dagi so'rov parametri endi doimiy qiymatga
    // aylandi (o'sha fazaning 2-ochiq qarzi shu bilan yopiladi).
    const reviews = reviewPriceChanges(changes, {
      thresholdPercent: rule.threshold ?? MANAGER_RULES.PRICE_CHANGE.defaultThreshold,
    });
    return buildPriceChangeCandidates(reviews, rule);
  }

  private async cashVarianceCandidates(
    accountId: string,
    since: Date,
    rules: Awaited<ReturnType<ManagerQueueService['loadRules']>>,
  ): Promise<WorkItemCandidate[]> {
    const rule = rules.get('CASH_VARIANCE');
    if (!rule?.enabled) return [];

    const rows = await this.prisma.client.cashierSessionVariance.findMany({
      where: { accountId, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: VARIANCE_CAP,
      select: {
        id: true,
        sessionId: true,
        cashierId: true,
        currency: true,
        varianceMinor: true,
        kind: true,
        createdAt: true,
        acknowledgedAt: true,
      },
    });

    return buildCashVarianceCandidates(rows satisfies CashVarianceRow[], rule);
  }

  // ── Dvigatel ──────────────────────────────────────────────────────────────

  /**
   * Qoidalarni yugurtirib navbatni yangilaydi. **Idempotent**: ikkinchi
   * chaqiruv yangi element yaratmaydi (`dedupKey` unique indeksi + planner).
   */
  async sync(accountId: string, body: QueueSyncBodyInput = {}) {
    const now = new Date();
    const sinceDays = body.sinceDays ?? DEFAULT_SYNC_SINCE_DAYS;
    const since = new Date(now.getTime() - sinceDays * 86_400_000);
    const staleAfterDays = body.staleAfterDays ?? DEFAULT_STALE_AFTER_DAYS;

    const rules = await this.loadRules(accountId);

    const candidates = [
      ...(await this.priceChangeCandidates(accountId, since, rules)),
      ...(await this.cashVarianceCandidates(accountId, since, rules)),
    ];

    const dedupKeys = [...new Set(candidates.map((c) => c.dedupKey))];

    // Mavjud elementlar: (a) nomzod kalitlari — dedup uchun HOLATIDAN qat'i
    // nazar; (b) barcha ochiq elementlar — eskirish uchun.
    const existingRows = await this.prisma.client.managerWorkItem.findMany({
      where: {
        accountId,
        OR: [
          ...(dedupKeys.length ? [{ dedupKey: { in: dedupKeys } }] : []),
          { status: { in: OPEN_STATUSES } },
        ],
      },
      select: { id: true, dedupKey: true, status: true, staleAt: true, statusChangedAt: true },
    });

    const plan = planQueueSync(candidates, existingRows satisfies ExistingWorkItem[], {
      now,
      staleAfterDays,
    });

    let created = 0;
    if (plan.creates.length > 0) {
      // `skipDuplicates` — ikki parallel `sync` poygasida ham ikkinchi element
      // tug'ilmaydi (unique indeks bilan birga ishlaydi).
      const result = await this.prisma.client.managerWorkItem.createMany({
        data: plan.creates.map((c) => ({
          accountId,
          ruleType: c.ruleType,
          dedupKey: c.dedupKey,
          severity: c.severity,
          subjectEmployeeId: c.subjectEmployeeId,
          amountMinor: c.amountMinor,
          currency: c.currency,
          docType: c.docType,
          docId: c.docId,
          occurredAt: c.occurredAt,
          context: c.context as never,
          statusChangedAt: now,
        })),
        skipDuplicates: true,
      });
      created = result.count;
    }

    let markedStale = 0;
    if (plan.markStaleIds.length > 0) {
      const statusById = new Map(existingRows.map((r) => [r.id, r.status]));
      const result = await this.prisma.client.managerWorkItem.updateMany({
        // `staleAt: null` sharti — parallel `sync` ikki marta belgilamasin.
        where: { accountId, id: { in: plan.markStaleIds }, staleAt: null },
        data: { staleAt: now },
      });
      markedStale = result.count;

      if (markedStale > 0) {
        // Eskirish HOLATNI o'zgartirmaydi — jurnalda `from === to`.
        await this.prisma.client.managerWorkItemEvent.createMany({
          data: plan.markStaleIds.map((id) => ({
            accountId,
            itemId: id,
            fromStatus: statusById.get(id) ?? WORK_ITEM_STATUS.open,
            toStatus: statusById.get(id) ?? WORK_ITEM_STATUS.open,
            action: WORK_ITEM_JOURNAL_ONLY_ACTION.markStale,
            actorType: 'system',
          })),
        });
      }
    }

    return {
      candidates: candidates.length,
      created,
      duplicates: plan.duplicates,
      markedStale,
      sinceDays,
      staleAfterDays,
    };
  }

  // ── Ro'yxat ───────────────────────────────────────────────────────────────

  async list(accountId: string, query: QueueListQueryInput = {}) {
    const limit = query.limit ?? DEFAULT_LIST_LIMIT;
    const openOnly = query.openOnly ?? !query.status;

    const rows = await this.prisma.client.managerWorkItem.findMany({
      where: {
        accountId,
        ...(query.status
          ? { status: query.status }
          : openOnly
            ? { status: { in: OPEN_STATUSES } }
            : {}),
        ...(query.ruleType ? { ruleType: query.ruleType } : {}),
        ...(query.employeeId ? { subjectEmployeeId: query.employeeId } : {}),
        ...(query.staleOnly ? { staleAt: { not: null } } : {}),
        ...(query.days
          ? { occurredAt: { gte: new Date(Date.now() - query.days * 86_400_000) } }
          : {}),
      },
      orderBy: { occurredAt: 'desc' },
      take: limit,
      select: {
        id: true,
        ruleType: true,
        dedupKey: true,
        status: true,
        severity: true,
        subjectEmployeeId: true,
        amountMinor: true,
        currency: true,
        docType: true,
        docId: true,
        occurredAt: true,
        context: true,
        staleAt: true,
        resolutionCode: true,
        resolvedAt: true,
        subject: { select: { id: true, name: true } },
        resolvedBy: { select: { id: true, name: true } },
      },
    });

    // §5.1 «kontekst — shu oydagi naqsh, bitta hodisa emas». Bir xil xodim +
    // bir xil qoida bo'yicha shu oyda nechta element bo'lgani: tendensiya
    // ko'rinmasa menejer har elementni yakka hodisa deb ko'radi.
    const ym = localDateOnly(new Date()).toISOString().slice(0, 7);
    const { start, endExclusive } = monthInstantBounds(ym);
    const monthly = await this.prisma.client.managerWorkItem.groupBy({
      by: ['subjectEmployeeId', 'ruleType'],
      where: { accountId, occurredAt: { gte: start, lt: endExclusive } },
      _count: { _all: true },
    });
    const monthlyCount = new Map(
      monthly.map((m) => [`${m.subjectEmployeeId ?? '-'}:${m.ruleType}`, m._count._all]),
    );

    const shaped = rows.map((r) => ({
      id: r.id,
      ruleType: r.ruleType,
      status: r.status,
      severity: r.severity as 'info' | 'warning' | 'critical',
      subject: r.subject,
      // BigInt JSON'da satr — `null` esa «O'LCHANMADI» (0 EMAS).
      amountMinor: r.amountMinor == null ? null : r.amountMinor.toString(),
      currency: r.currency,
      docType: r.docType,
      docId: r.docId,
      occurredAt: r.occurredAt,
      context: r.context,
      staleAt: r.staleAt,
      resolutionCode: r.resolutionCode,
      resolvedAt: r.resolvedAt,
      resolvedBy: r.resolvedBy,
      monthlyCount: monthlyCount.get(`${r.subjectEmployeeId ?? '-'}:${r.ruleType}`) ?? 1,
      /** Shu holatda menejer qanday tugmalarni ko'radi. */
      allowedActions: workItemFsm.allowedActions(r.status as WorkItemStatus, 'manager'),
    }));

    const sorted = sortQueue(shaped);

    return {
      count: sorted.length,
      staleCount: sorted.filter((r) => r.staleAt != null).length,
      rows: sorted,
    };
  }

  // ── Harakat ───────────────────────────────────────────────────────────────

  async act(
    accountId: string,
    actor: { actor: WorkItemActor; actorId: string | null },
    itemId: string,
    body: QueueActionBodyInput,
  ) {
    const item = await this.prisma.client.managerWorkItem.findFirst({
      where: { accountId, id: itemId },
      select: { id: true, status: true },
    });
    if (!item) throw new NotFoundException('Navbat elementi topilmadi');

    const from = item.status as WorkItemStatus;
    const verdict = workItemFsm.evaluate({
      from,
      action: body.action as never,
      actor: actor.actor,
      reasonCode: body.reasonCode,
      comment: body.comment,
    });

    if (!verdict.ok) {
      const { failure } = verdict;
      if (failure.code === 'illegal_transition') {
        throw new ConflictException(
          `«${failure.action}» amali «${failure.from}» holatidan mumkin emas`,
        );
      }
      throw new BadRequestException(failure);
    }

    // Takror bosish: holat allaqachon maqsadda — na yozuv, na jurnal qatori.
    if (verdict.noop) return { ok: true, status: from, noop: true };

    const to = verdict.to;
    const now = new Date();
    const closing = CLOSED_WORK_ITEM_STATUSES.has(to);

    return this.prisma.client.$transaction(async (tx) => {
      // Optimistik da'vo: ikki menejer bir vaqtda bosgan bo'lsa, ikkinchisi
      // 0 qator yangilaydi va 409 oladi — jimgina ustidan yozish emas.
      const claim = await tx.managerWorkItem.updateMany({
        where: { id: itemId, accountId, status: from },
        data: {
          status: to,
          statusChangedAt: now,
          // Qayta ochilgan element eskirish belgisini YO'QOTADI: u endi
          // yangi ish, sanoq noldan boshlanadi.
          ...(to === WORK_ITEM_STATUS.open ? { staleAt: null } : {}),
          ...(closing
            ? {
                resolutionCode: body.reasonCode ?? null,
                resolutionComment: body.comment ?? null,
                resolvedById: actor.actorId,
                resolvedAt: now,
              }
            : {}),
        },
      });

      if (claim.count === 0) {
        throw new ConflictException('Element boshqa foydalanuvchi tomonidan o`zgartirildi');
      }

      await tx.managerWorkItemEvent.create({
        data: {
          accountId,
          itemId,
          fromStatus: from,
          toStatus: to,
          action: body.action,
          actorType: actor.actor,
          actorId: actor.actorId,
          reasonCode: body.reasonCode ?? null,
          comment: body.comment ?? null,
        },
      });

      if (body.action === WORK_ITEM_ACTION.recordFine) {
        // ⚠️ OCHIQ QARZ (MK07): jarima hozircha faqat JURNALGA yoziladi —
        // `HrBonusFineLog` ga pul yozilmaydi. Ulash MK01 dagi `applyRule`
        // naqshini talab qiladi (qoidaga bog'langan summa), u esa 12 qoida
        // turi bilan birga keladi. Jim qoldirmaslik uchun log.
        this.logger.warn(
          `record_fine: item=${itemId} — jurnal yozildi, PUL YOZILMADI (MK07 qarzi)`,
        );
      }

      return { ok: true, status: to, noop: false };
    });
  }

  /** Element kartochkasi tarixi (§5.3 statistikasining manbai). */
  async history(accountId: string, itemId: string) {
    const events = await this.prisma.client.managerWorkItemEvent.findMany({
      where: { accountId, itemId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        fromStatus: true,
        toStatus: true,
        action: true,
        actorType: true,
        actorId: true,
        reasonCode: true,
        comment: true,
        createdAt: true,
      },
    });
    return { count: events.length, events };
  }

  /** Registrdagi qoida turlari — FE tanlagichlari uchun. */
  ruleTypes(): ManagerRuleType[] {
    return Object.keys(MANAGER_RULES) as ManagerRuleType[];
  }
}
