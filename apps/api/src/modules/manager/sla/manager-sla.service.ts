import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import type { RuleConfigRow } from '../queue/work-item-rules.js';
import type { SlaStageConfigBodyInput } from './manager-sla.schema.js';
import {
  DEFAULT_STUCK_ROW_LIMIT,
  SLA_STAGE,
  SLA_STAGES,
  STAGE_OPEN_STATES,
  type SlaStage,
  type StuckSubject,
  buildStuckBoard,
  resolveSlaStages,
  slaRuleType,
} from './stuck-sla.js';

/**
 * MK10 / 4M TZ §8 — «nima qotib qolgan» + SLA paneli, I/O qatlami.
 *
 * **Qoidalar bu yerda emas** — ular `stuck-sla.ts` da (25 test). Bu yerda
 * faqat Prisma o'qish va shakl moslash.
 *
 * ## 🔴 PANEL FAQAT O'QIYDI
 * Bu servis hech qanday hujjat holatini o'zgartirmaydi va yangi jadval
 * ochmaydi: qotib qolish holati manba jadvallarning o'zida (`pickState`,
 * `approvalStage`, `status`, `state`), uni nusxalash ikki haqiqat bo'lardi.
 * Yagona yozuv — menejer o'zgartiradigan SLA chegarasi
 * (`manager_rule_configs`, `SLA_*` kalitlari).
 *
 * ## Manba shifti JIM emas
 * Har manbadan ko'pi bilan `SOURCE_CAP` qator o'qiladi (eng eskisidan). Shift
 * urilgan bo'lsa javobda `sourceTruncated: true` qaytadi va ekranda ko'rinadi
 * — aks holda «xulosadagi son = hammasi» degan yolg'on ishonch tug'ilardi.
 */

/**
 * Bir manbadan o'qiladigan qator shifti. 500: menejer paneli uchun bir
 * bosqichda 500 dan ortiq qotib qolgan ob'ekt bo'lsa, muammo alohida
 * ro'yxatda emas — jarayonda; ekranga hammasini chiqarish yordam bermaydi.
 */
const SOURCE_CAP = 500;

/** Panelga bir marta chiqadigan qatorlar (sof modul ham shu qiymatni biladi). */
const ROW_LIMIT = DEFAULT_STUCK_ROW_LIMIT;

/** Ikki xonagacha — JSON'da suzuvchi shovqin ko'rinmasin. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Beshta qoralama-hujjat manbasi uchun AYNI `select` — bir joyda turadi,
 * chunki nusxa-ko'chirilgan so'rovlardan bittasi jimgina orqada qolib,
 * shu bosqichning yarmi ekranga chiqmay qo'yishi mumkin.
 */
const DRAFT_DOC_SELECT = {
  id: true,
  name: true,
  state: true,
  moment: true,
  sumMinor: true,
  currency: true,
  ownerId: true,
  owner: { select: { name: true } },
} as const;

/** Qoralamada turgan pul/tovar hujjatlari — `DOC_APPROVAL` manbalari. */
interface DraftDocRow {
  id: string;
  name: string;
  state: string;
  moment: Date;
  sumMinor: bigint;
  currency: string;
  ownerId: string | null;
  owner: { name: string | null } | null;
}

@Injectable()
export class ManagerSlaService {
  /** Test va ekran uchun ko'rinadigan shift. */
  readonly sourceCap = SOURCE_CAP;

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  // ── Sozlama ───────────────────────────────────────────────────────────────

  private async loadStages(accountId: string) {
    const rows = await this.prisma.client.managerRuleConfig.findMany({
      // 🔴 Faqat `SLA_*`: MK06 navbat qoidalari AYNI jadvalda yashaydi.
      where: {
        accountId,
        ruleType: { in: Object.values(SLA_STAGES).map((d) => d.ruleType) },
      },
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
      // Prisma `Decimal` → satr: aniqlik qaerda yo'qolgani bitta joyda ko'rinadi.
      thresholdValue: r.thresholdValue == null ? null : r.thresholdValue.toString(),
      thresholdUnit: r.thresholdUnit,
      mode: r.mode,
      severity: r.severity,
    }));

    return resolveSlaStages(config);
  }

  /**
   * SLA chegarasini o'zgartirish (MK10 DoD: «chegaralar sozlamada»).
   *
   * Birlik Zod darajasida VAQT birligiga cheklangan; bu yerda faqat bosqich
   * nomi tekshiriladi — yopiq ro'yxat.
   */
  async updateStage(
    accountId: string,
    employeeId: string | null,
    stage: string,
    body: SlaStageConfigBodyInput,
  ) {
    const def = Object.values(SLA_STAGES).find((d) => d.stage === stage);
    if (!def) throw new BadRequestException(`Noma'lum SLA bosqichi: ${stage}`);

    const ruleType = slaRuleType(def.stage);
    const data = {
      ...(body.enabled === undefined ? {} : { enabled: body.enabled }),
      ...(body.thresholdValue === undefined ? {} : { thresholdValue: body.thresholdValue }),
      ...(body.thresholdUnit === undefined ? {} : { thresholdUnit: body.thresholdUnit }),
      ...(body.severity === undefined ? {} : { severity: body.severity }),
      updatedById: employeeId,
    };

    await this.prisma.client.managerRuleConfig.upsert({
      where: { accountId_ruleType: { accountId, ruleType } },
      create: {
        accountId,
        ruleType,
        enabled: body.enabled ?? def.defaultEnabled,
        thresholdValue: body.thresholdValue ?? def.defaultThresholdHours,
        thresholdUnit: body.thresholdUnit ?? def.thresholdUnit,
        severity: body.severity ?? def.defaultSeverity,
        updatedById: employeeId,
      },
      update: data,
    });

    return this.stages(accountId);
  }

  /** Ekran uchun: registr + akkаunt sozlamasi birlashgan holda. */
  async stages(accountId: string) {
    const resolved = await this.loadStages(accountId);
    return {
      stages: [...resolved.values()].map((s) => ({
        stage: s.stage,
        ruleType: s.ruleType,
        enabled: s.enabled,
        thresholdHours: s.thresholdHours,
        defaultThresholdHours: s.defaultThresholdHours,
        thresholdUnit: s.thresholdUnit,
        thresholdRejected: s.thresholdRejected,
        severity: s.severity,
        /** 🔴 Doim `false` — SLA oshgani hujjatni to'xtatmaydi. */
        blocks: s.blocks,
      })),
    };
  }

  // ── Taxta ─────────────────────────────────────────────────────────────────

  async board(accountId: string, opts: { limit?: number }) {
    const now = new Date();

    const [
      resolved,
      pickLists,
      supplies,
      claims,
      sessions,
      demands,
      payIns,
      payOuts,
      cashIns,
      cashOuts,
    ] = await Promise.all([
      this.loadStages(accountId),
      // 1. Yig'ilmagan buyurtma.
      this.prisma.client.msPickList.findMany({
        where: { accountId, pickState: { in: [...STAGE_OPEN_STATES[SLA_STAGE.orderPicking]] } },
        select: {
          id: true,
          name: true,
          moment: true,
          pickState: true,
          sumMinor: true,
          pickedById: true,
          pickedBy: { select: { name: true } },
        },
        orderBy: { moment: 'asc' },
        take: SOURCE_CAP,
      }),
      // 2. Tasdiq zanjirida turib qolgan yetkazma.
      this.prisma.client.supply.findMany({
        where: {
          accountId,
          deletedAt: null,
          approvalStage: { in: [...STAGE_OPEN_STATES[SLA_STAGE.supplyAcceptance]] },
        },
        select: {
          id: true,
          name: true,
          moment: true,
          approvalStage: true,
          sumMinor: true,
          currency: true,
          ownerId: true,
          owner: { select: { name: true } },
        },
        orderBy: { moment: 'asc' },
        take: SOURCE_CAP,
      }),
      // 3. Javobsiz da'vo.
      this.prisma.client.serviceRequest.findMany({
        where: {
          accountId,
          deletedAt: null,
          archived: false,
          status: { in: [...STAGE_OPEN_STATES[SLA_STAGE.claimResponse]] },
        },
        select: {
          id: true,
          name: true,
          status: true,
          createdAt: true,
          assigneeId: true,
          assignee: { select: { name: true } },
        },
        orderBy: { createdAt: 'asc' },
        take: SOURCE_CAP,
      }),
      // 4. Yopilmagan smena.
      this.prisma.client.cashierSession.findMany({
        where: { accountId, state: { in: [...STAGE_OPEN_STATES[SLA_STAGE.shiftClose]] } },
        select: {
          id: true,
          name: true,
          state: true,
          openedAt: true,
          openingCashMinor: true,
          cashierId: true,
          cashier: { select: { name: true } },
          cashDesk: { select: { name: true } },
        },
        orderBy: { openedAt: 'asc' },
        take: SOURCE_CAP,
      }),
      // 5. Tasdiqlanmagan (qoralama) hujjatlar — beshta manba.
      this.prisma.client.demand.findMany(this.draftDocQuery(accountId)),
      this.prisma.client.paymentIn.findMany(this.draftDocQuery(accountId)),
      this.prisma.client.paymentOut.findMany(this.draftDocQuery(accountId)),
      this.prisma.client.cashIn.findMany(this.draftDocQuery(accountId)),
      this.prisma.client.cashOut.findMany(this.draftDocQuery(accountId)),
    ]);

    /**
     * Yetkazmaning yoshi — bosqich OXIRGI marta qachon qimirlagani.
     * `updatedAt` yaramaydi: pozitsiya tahriri ham uni yangilaydi va qotib
     * qolgan hujjat «hozirgina qimirlagan» bo'lib ko'rinardi.
     */
    const lastEventBySupply = new Map<string, Date>();
    if (supplies.length > 0) {
      const events = await this.prisma.client.supplyApprovalEvent.groupBy({
        by: ['supplyId'],
        where: { accountId, supplyId: { in: supplies.map((s) => s.id) } },
        _max: { createdAt: true },
      });
      for (const e of events) {
        if (e._max.createdAt) lastEventBySupply.set(e.supplyId, e._max.createdAt);
      }
    }

    const subjects: StuckSubject[] = [
      ...pickLists.map((p) => ({
        stage: SLA_STAGE.orderPicking,
        refId: p.id,
        docType: 'customerorder',
        docName: p.name,
        stateKey: p.pickState,
        employeeId: p.pickedById,
        employeeName: p.pickedBy?.name ?? null,
        /**
         * Buyurtma KELGAN payt — yig'ish boshlangani emas. Savol «buyurtma
         * qachondan beri yig'ilmagan», ya'ni omborchi uni endi qo'liga
         * olgani kutish vaqtini nolga qaytarmaydi.
         */
        since: p.moment,
        amountMinor: p.sumMinor,
        // `MsPickList` da valyuta ustuni yo'q — «UZS» deb yozib qo'yish
        // tasdiqlanmagan da'vo bo'lardi.
        currency: null,
      })),
      ...supplies.map((s) => ({
        stage: SLA_STAGE.supplyAcceptance,
        refId: s.id,
        docType: 'supply',
        docName: s.name,
        stateKey: s.approvalStage,
        employeeId: s.ownerId,
        employeeName: s.owner?.name ?? null,
        since: lastEventBySupply.get(s.id) ?? s.moment,
        amountMinor: s.sumMinor,
        currency: s.currency,
      })),
      ...claims.map((c) => ({
        stage: SLA_STAGE.claimResponse,
        refId: c.id,
        docType: 'servicerequest',
        docName: c.name,
        stateKey: c.status,
        employeeId: c.assigneeId,
        employeeName: c.assignee?.name ?? null,
        // Mijoz QACHONDAN BERI kutmoqda — javob bergan-bermaganimiz emas.
        since: c.createdAt,
        // Murojaatda summa yo'q: `0` yozish «bepul» degan ma'no berardi.
        amountMinor: null,
        currency: null,
      })),
      ...sessions.map((s) => ({
        stage: SLA_STAGE.shiftClose,
        refId: s.id,
        docType: 'cashiersession',
        docName: s.cashDesk?.name ?? s.name,
        stateKey: s.state,
        employeeId: s.cashierId,
        employeeName: s.cashier?.name ?? null,
        since: s.openedAt,
        // Ochilish naqdi — «kamida shuncha» javobgarlik (jonli holat ekrani
        // bilan bir xil mulohaza). Joriy kutilgan naqd har smena uchun
        // alohida hisob talab qiladi va bu ekran uchun ortiqcha.
        amountMinor: s.openingCashMinor,
        currency: null,
      })),
      ...this.draftDocSubjects(demands, 'demand'),
      ...this.draftDocSubjects(payIns, 'paymentin'),
      ...this.draftDocSubjects(payOuts, 'paymentout'),
      ...this.draftDocSubjects(cashIns, 'cashin'),
      ...this.draftDocSubjects(cashOuts, 'cashout'),
    ];

    const board = buildStuckBoard(subjects, resolved, now, { limit: opts.limit ?? ROW_LIMIT });

    const sourceTruncated = [
      pickLists,
      supplies,
      claims,
      sessions,
      demands,
      payIns,
      payOuts,
      cashIns,
      cashOuts,
    ].some((rows) => rows.length >= SOURCE_CAP);

    return {
      now,
      overdueCount: board.overdueCount,
      truncated: board.truncated,
      /** Manbadan hammasi o'qilmadi — xulosadagi sonlar «kamida shuncha». */
      sourceTruncated,
      sourceCap: SOURCE_CAP,
      stages: board.stages.map((s) => ({
        stage: s.stage,
        ruleType: s.ruleType,
        enabled: s.enabled,
        thresholdHours: s.thresholdHours,
        thresholdUnit: s.thresholdUnit,
        thresholdRejected: s.thresholdRejected,
        severity: s.severity,
        total: s.total,
        overdue: s.overdue,
        /** `null` = oshgani YO'Q (0 EMAS). */
        worstOverdueHours: s.worstOverdueHours == null ? null : round2(s.worstOverdueHours),
        blocks: s.blocks,
      })),
      rows: board.rows.map((r) => ({
        stage: r.stage,
        refId: r.refId,
        docType: r.docType,
        docName: r.docName,
        stateKey: r.stateKey,
        employeeId: r.employeeId,
        employeeName: r.employeeName,
        since: r.since,
        ageHours: round2(r.ageHours),
        thresholdHours: r.thresholdHours,
        overdueHours: round2(r.overdueHours),
        severity: r.severity,
        /** Tiyin, satr. `null` = O'LCHANMADI (0 EMAS). */
        amountMinor: r.amountMinor == null ? null : r.amountMinor.toString(),
        currency: r.currency,
      })),
    };
  }

  // ── Qoralama hujjat manbalari ─────────────────────────────────────────────

  /** Beshta pul/tovar hujjati uchun AYNI so'rov — shakl bir joyda. */
  private draftDocQuery(accountId: string) {
    return {
      where: {
        accountId,
        deletedAt: null,
        state: { in: [...STAGE_OPEN_STATES[SLA_STAGE.docApproval]] },
      },
      select: DRAFT_DOC_SELECT,
      orderBy: { moment: 'asc' as const },
      take: SOURCE_CAP,
    };
  }

  private draftDocSubjects(rows: ReadonlyArray<DraftDocRow>, docType: string): StuckSubject[] {
    return rows.map((d) => ({
      stage: SLA_STAGE.docApproval as SlaStage,
      refId: d.id,
      docType,
      docName: d.name,
      stateKey: d.state,
      employeeId: d.ownerId,
      employeeName: d.owner?.name ?? null,
      since: d.moment,
      amountMinor: d.sumMinor,
      currency: d.currency,
    }));
  }
}
