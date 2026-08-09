import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import {
  DECISION_SOURCE,
  type DecisionEventInput,
  type DecisionJournal,
  type DecisionMoney,
  type DecisionSource,
  buildDecisionJournal,
} from './decision-journal.js';
import {
  DEFAULT_WINDOW_DAYS,
  type DecisionJournalQuery,
  SOURCE_READ_CAP,
} from './manager-journal.schema.js';

/**
 * MK21 — qaror jurnalining I/O qatlami.
 *
 * **Qoidalar bu yerda emas** — ular sof `decision-journal.ts` da (21 test).
 * Bu yerda faqat to'rtta MAVJUD hodisa jurnalini o'qish, yorliq/ism/pul
 * biriktirish va sof qatlamga uzatish. Bitta ham yozuv amali yo'q
 * (`decision-journal-read-only.test.ts` skanerlab turadi).
 *
 * ⚠️ **Bekor qilish zondi (probe).** Ekran oynasi tugagandan KEYIN bo'lgan
 * `reopen` hodisasi ham o'qiladi — faqat oynadagi sub'ektlar bo'yicha va
 * faqat kalit maydonlar bilan. Zond bo'lmasa 1-avgustda qabul qilinib
 * 5-avgustda qayta ochilgan kun 1–2 avgust oynasida «kuchda» ko'rinardi.
 */
@Injectable()
export class DecisionJournalService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(
    accountId: string,
    query: DecisionJournalQuery,
    now: Date = new Date(),
  ): Promise<
    DecisionJournal & {
      from: string;
      to: string;
      /** Chegaraga tegib kesilgan manbalar — JIM qolmaydi. */
      cappedSources: DecisionSource[];
      generatedAt: string;
    }
  > {
    const to = query.to ?? now;
    const from = query.from ?? new Date(to.getTime() - DEFAULT_WINDOW_DAYS * 86_400_000);
    const wanted = new Set<DecisionSource>(
      (query.sources as DecisionSource[] | undefined) ?? [
        DECISION_SOURCE.dailyKpi,
        DECISION_SOURCE.workItem,
        DECISION_SOURCE.shift,
        DECISION_SOURCE.supply,
      ],
    );

    const window = { gte: from, lt: to };
    const cappedSources: DecisionSource[] = [];

    const [kpiEvents, itemEvents, shiftEvents, supplyEvents] = await Promise.all([
      wanted.has(DECISION_SOURCE.dailyKpi)
        ? this.prisma.client.employeeDailyKpiEvent.findMany({
            where: { accountId, createdAt: window },
            orderBy: { createdAt: 'desc' },
            take: SOURCE_READ_CAP,
            select: {
              id: true,
              dailyKpiId: true,
              fromState: true,
              toState: true,
              action: true,
              actorType: true,
              actorId: true,
              reasonCode: true,
              comment: true,
              createdAt: true,
            },
          })
        : [],
      wanted.has(DECISION_SOURCE.workItem)
        ? this.prisma.client.managerWorkItemEvent.findMany({
            where: { accountId, createdAt: window },
            orderBy: { createdAt: 'desc' },
            take: SOURCE_READ_CAP,
            select: {
              id: true,
              itemId: true,
              fromStatus: true,
              toStatus: true,
              action: true,
              actorType: true,
              actorId: true,
              reasonCode: true,
              comment: true,
              createdAt: true,
            },
          })
        : [],
      wanted.has(DECISION_SOURCE.shift)
        ? this.prisma.client.cashierSessionAcceptanceEvent.findMany({
            where: { accountId, createdAt: window },
            orderBy: { createdAt: 'desc' },
            take: SOURCE_READ_CAP,
            select: {
              id: true,
              sessionId: true,
              fromState: true,
              toState: true,
              action: true,
              actorType: true,
              actorId: true,
              reasonCode: true,
              comment: true,
              createdAt: true,
            },
          })
        : [],
      wanted.has(DECISION_SOURCE.supply)
        ? this.prisma.client.supplyApprovalEvent.findMany({
            where: { accountId, createdAt: window },
            orderBy: { createdAt: 'desc' },
            take: SOURCE_READ_CAP,
            select: {
              id: true,
              supplyId: true,
              fromStage: true,
              toStage: true,
              action: true,
              actorType: true,
              actorId: true,
              reason: true,
              createdAt: true,
            },
          })
        : [],
    ]);

    if (kpiEvents.length === SOURCE_READ_CAP) cappedSources.push(DECISION_SOURCE.dailyKpi);
    if (itemEvents.length === SOURCE_READ_CAP) cappedSources.push(DECISION_SOURCE.workItem);
    if (shiftEvents.length === SOURCE_READ_CAP) cappedSources.push(DECISION_SOURCE.shift);
    if (supplyEvents.length === SOURCE_READ_CAP) cappedSources.push(DECISION_SOURCE.supply);

    const kpiIds = unique(kpiEvents.map((e) => e.dailyKpiId));
    const itemIds = unique(itemEvents.map((e) => e.itemId));
    const sessionIds = unique(shiftEvents.map((e) => e.sessionId));
    const supplyIds = unique(supplyEvents.map((e) => e.supplyId));

    const [kpiCards, items, sessions, supplies, money, probes] = await Promise.all([
      kpiIds.length
        ? this.prisma.client.employeeDailyKpi.findMany({
            where: { accountId, id: { in: kpiIds } },
            select: { id: true, employeeId: true, date: true },
          })
        : [],
      itemIds.length
        ? this.prisma.client.managerWorkItem.findMany({
            where: { accountId, id: { in: itemIds } },
            select: { id: true, ruleType: true, subjectEmployeeId: true },
          })
        : [],
      sessionIds.length
        ? this.prisma.client.cashierSession.findMany({
            where: { accountId, id: { in: sessionIds } },
            select: { id: true, name: true, cashierId: true, openedAt: true },
          })
        : [],
      supplyIds.length
        ? this.prisma.client.supply.findMany({
            where: { accountId, id: { in: supplyIds } },
            select: { id: true, name: true },
          })
        : [],
      // MK01 puli — «natijasi» ustunining pul yarmi. Teskari (manfiy) yozuv
      // ham shu yerdan keladi: bekor qilish pulni jimgina yo'qotmaydi.
      kpiEvents.length
        ? this.prisma.client.hrBonusFineLog.findMany({
            where: { accountId, kpiEventId: { in: kpiEvents.map((e) => e.id) } },
            select: { kpiEventId: true, kind: true, amountMinor: true },
          })
        : [],
      this.loadVoidProbes(accountId, to, { kpiIds, itemIds, sessionIds }),
    ]);

    const kpiById = new Map(kpiCards.map((k) => [k.id, k]));
    const itemById = new Map(items.map((i) => [i.id, i]));
    const sessionById = new Map(sessions.map((s) => [s.id, s]));
    const supplyById = new Map(supplies.map((s) => [s.id, s]));

    const moneyByEvent = new Map<string, DecisionMoney[]>();
    for (const m of money) {
      if (!m.kpiEventId) continue;
      const list = moneyByEvent.get(m.kpiEventId);
      const row = { kind: m.kind, amountMinor: m.amountMinor };
      if (list) list.push(row);
      else moneyByEvent.set(m.kpiEventId, [row]);
    }

    // Ismlar bitta so'rovda: hodisa jurnallarida FK yo'q (jurnal xodimdan omon
    // qolishi kerak), shuning uchun id → ism xaritasi qo'lda quriladi.
    const employeeIds = unique([
      ...kpiEvents.map((e) => e.actorId),
      ...itemEvents.map((e) => e.actorId),
      ...shiftEvents.map((e) => e.actorId),
      ...supplyEvents.map((e) => e.actorId),
      ...kpiCards.map((k) => k.employeeId),
      ...items.map((i) => i.subjectEmployeeId),
      ...sessions.map((s) => s.cashierId),
    ]);
    const employees = employeeIds.length
      ? await this.prisma.client.employee.findMany({
          where: { accountId, id: { in: employeeIds } },
          select: { id: true, name: true },
        })
      : [];
    const nameById = new Map(employees.map((e) => [e.id, e.name]));
    const nameOf = (id: string | null | undefined) => (id ? (nameById.get(id) ?? null) : null);

    const events: DecisionEventInput[] = [];

    for (const e of kpiEvents) {
      const card = kpiById.get(e.dailyKpiId);
      events.push({
        source: DECISION_SOURCE.dailyKpi,
        eventId: e.id,
        occurredAt: e.createdAt,
        action: e.action,
        fromState: e.fromState,
        toState: e.toState,
        actorType: e.actorType,
        actorId: e.actorId,
        actorName: nameOf(e.actorId),
        subjectId: e.dailyKpiId,
        subjectLabel: card ? isoDate(card.date) : '',
        subjectEmployeeId: card?.employeeId ?? null,
        subjectEmployeeName: nameOf(card?.employeeId),
        reasonCode: e.reasonCode,
        comment: e.comment,
        money: moneyByEvent.get(e.id) ?? [],
      });
    }

    for (const e of itemEvents) {
      const item = itemById.get(e.itemId);
      events.push({
        source: DECISION_SOURCE.workItem,
        eventId: e.id,
        occurredAt: e.createdAt,
        action: e.action,
        fromState: e.fromStatus,
        toState: e.toStatus,
        actorType: e.actorType,
        actorId: e.actorId,
        actorName: nameOf(e.actorId),
        subjectId: e.itemId,
        // Qoida TURI — ekranda MK07 tarjimalari bilan ko'rsatiladi.
        subjectLabel: item?.ruleType ?? '',
        subjectEmployeeId: item?.subjectEmployeeId ?? null,
        subjectEmployeeName: nameOf(item?.subjectEmployeeId),
        reasonCode: e.reasonCode,
        comment: e.comment,
      });
    }

    for (const e of shiftEvents) {
      const s = sessionById.get(e.sessionId);
      events.push({
        source: DECISION_SOURCE.shift,
        eventId: e.id,
        occurredAt: e.createdAt,
        action: e.action,
        fromState: e.fromState,
        toState: e.toState,
        actorType: e.actorType,
        actorId: e.actorId,
        actorName: nameOf(e.actorId),
        subjectId: e.sessionId,
        subjectLabel: s ? s.name || isoDate(s.openedAt) : '',
        subjectEmployeeId: s?.cashierId ?? null,
        subjectEmployeeName: nameOf(s?.cashierId),
        reasonCode: e.reasonCode,
        comment: e.comment,
      });
    }

    for (const e of supplyEvents) {
      events.push({
        source: DECISION_SOURCE.supply,
        eventId: e.id,
        occurredAt: e.createdAt,
        action: e.action,
        fromState: e.fromStage,
        toState: e.toStage,
        actorType: e.actorType,
        actorId: e.actorId,
        // Aktyor taminotchi (kontragent) bo'lishi ham mumkin — xodim
        // ro'yxatidan topilmasa ism `null` qoladi, «Tizim» deb yozilmaydi.
        actorName: nameOf(e.actorId),
        subjectId: e.supplyId,
        subjectLabel: supplyById.get(e.supplyId)?.name ?? '',
        subjectEmployeeId: null,
        subjectEmployeeName: null,
        // Qabul zanjirida YOPIQ sabab kodi yo'q — faqat erkin matn.
        reasonCode: null,
        comment: e.reason,
      });
    }

    const journal = buildDecisionJournal([...events, ...probes], {
      from,
      to,
      sources: query.sources as DecisionSource[] | undefined,
      actorId: query.actorId,
      subjectEmployeeId: query.subjectEmployeeId,
      action: query.action,
      reasonCode: query.reasonCode,
      includeSystem: query.includeSystem,
      limit: query.limit,
    });

    return {
      ...journal,
      from: from.toISOString(),
      to: to.toISOString(),
      cappedSources,
      generatedAt: now.toISOString(),
    };
  }

  /**
   * Oynadan KEYINGI bekor qiluvchi hodisalar (`reopen`) — faqat oynada
   * uchragan sub'ektlar bo'yicha. Ular qator sifatida chiqmaydi (oyna filtri
   * kesadi), lekin oynadagi qarorga «bekor qilingan» belgisini qo'yadi.
   */
  private async loadVoidProbes(
    accountId: string,
    after: Date,
    ids: { kpiIds: string[]; itemIds: string[]; sessionIds: string[] },
  ): Promise<DecisionEventInput[]> {
    const [kpi, item, shift] = await Promise.all([
      ids.kpiIds.length
        ? this.prisma.client.employeeDailyKpiEvent.findMany({
            where: {
              accountId,
              dailyKpiId: { in: ids.kpiIds },
              action: 'reopen',
              createdAt: { gte: after },
            },
            select: { id: true, dailyKpiId: true, createdAt: true },
          })
        : [],
      ids.itemIds.length
        ? this.prisma.client.managerWorkItemEvent.findMany({
            where: {
              accountId,
              itemId: { in: ids.itemIds },
              action: 'reopen',
              createdAt: { gte: after },
            },
            select: { id: true, itemId: true, createdAt: true },
          })
        : [],
      ids.sessionIds.length
        ? this.prisma.client.cashierSessionAcceptanceEvent.findMany({
            where: {
              accountId,
              sessionId: { in: ids.sessionIds },
              action: 'reopen',
              createdAt: { gte: after },
            },
            select: { id: true, sessionId: true, createdAt: true },
          })
        : [],
    ]);

    const probe = (
      source: DecisionSource,
      eventId: string,
      subjectId: string,
      occurredAt: Date,
    ): DecisionEventInput => ({
      source,
      eventId,
      occurredAt,
      action: 'reopen',
      fromState: '',
      toState: '',
      actorType: 'system',
      actorId: null,
      actorName: null,
      subjectId,
      subjectLabel: '',
      subjectEmployeeId: null,
      subjectEmployeeName: null,
      reasonCode: null,
      comment: null,
      money: [],
    });

    return [
      ...kpi.map((e) => probe(DECISION_SOURCE.dailyKpi, e.id, e.dailyKpiId, e.createdAt)),
      ...item.map((e) => probe(DECISION_SOURCE.workItem, e.id, e.itemId, e.createdAt)),
      ...shift.map((e) => probe(DECISION_SOURCE.shift, e.id, e.sessionId, e.createdAt)),
    ];
  }
}

function unique(ids: Array<string | null | undefined>): string[] {
  return [...new Set(ids.filter((x): x is string => !!x))];
}

/** `YYYY-MM-DD` — kun kartasi yorlig'i (DATE ustuni UTC yarim tunda saqlanadi). */
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
