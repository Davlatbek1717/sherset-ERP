import { type CurrencyCode, Money, isCurrencyCode } from '@moysklad/money';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import type {
  CreateEmployeeKpiTargetInput,
  KpiTargetPeriod,
  ListAllKpiTargetsQuery,
  UpdateEmployeeKpiTargetInput,
} from './employee-kpi-target.schema.js';
import { KpiMetricCatalogService } from './kpi-metric-catalog.service.js';
import type { MetricCatalog, MetricDirection, MetricUnit } from './kpi-metrics.js';
import { metricDef } from './kpi-metrics.js';

/**
 * EmployeeKpiTargetService — «biriktirilgan KPI» CRUD (KPI-02).
 *
 * Bu qatlam **todo** ni beradi: menejer xodimga bitta metrikani maqsad+davr
 * bilan biriktiradi, profil versiyalamasdan va og'irliklarni 100% ga
 * yig'masdan. Og'irlik qo'yilsa — oylik ballash yo'li (payroll) buzilmagan
 * holda ishlaydi (normalizatsiya — KPI-05).
 *
 * ## Shartnomalar (buzilsa jimgina noto'g'ri ishlaydi)
 * 1. **so'm → tiyin shu yerda**, FE'da emas. Ikki tomonda bo'lsa vaqt o'tib
 *    biri unutiladi va pul 100× noto'g'ri saqlanadi
 *    ([[manager-kpi-unit-vocabularies]]).
 * 2. `unit`/`currency` **katalogdan**, klientdan emas — DB CHECK
 *    (`currency ↔ unit`) ni buzmaslik uchun.
 * 3. `weight = NULL` ≠ `0`. NULL = ballash yo'lidan tashqarida.
 * 4. Har mutatsiya **append-only event** yozadi; payload — o'sha ondagi
 *    qiymatlar MATNI, havola emas ([[journal-copies-text-not-reference]]).
 *    Qator o'chsa ham «nima edi» javobi qoladi ([[bulk-update-wrote-no-audit]]).
 * 5. Fakt `NULL` bo'lsa `NULL` qoladi — 0 ga aylantirilmaydi
 *    ([[data-quality-flag-layer]]).
 *
 * ## Dvigatel bilan aloqa — HALI YO'Q
 * Kunlik hisob maqsadni hamon profil versiyasidan oladi; bu qatlamni
 * resolverga ulash **KPI-03**. Shu sababda bu servis hech qanday mavjud
 * endpoint javobini o'zgartirmaydi.
 */

/** Bitta biriktirilgan KPI — ekran uchun tayyor shakl. */
export interface EmployeeKpiTargetRow {
  id: string;
  employeeId: string;
  employeeName: string | null;
  metricKey: string;
  labelUz: string;
  labelRu: string;
  unit: MetricUnit;
  direction: MetricDirection;
  /**
   * Dvigatel bu metrikani HISOBLAY oladimi. `false` — qo'lda: fakt menejerning
   * «bajarildi» belgisidan keladi. Ekran tugmani aynan shundan biladi (o'zi
   * taxmin qilmaydi).
   */
  measurable: boolean;
  period: KpiTargetPeriod;
  /** Maqsad — MINOR birlik (pul = tiyin). `null` = raqamsiz «todo». */
  targetMinor: string | null;
  currency: string | null;
  /** `null` = oylik balldan tashqarida (0 EMAS). */
  weight: number | null;
  manualDoneAt: Date | null;
  active: boolean;
  /** Oxirgi hisoblangan fakt — MINOR. `null` = O'LCHANMAGAN (0 emas). */
  lastFactMinor: string | null;
  lastFactDate: Date | null;
  /** `null` = umuman hisoblangan kun yo'q; `false` = qisman ma'lumot. */
  lastFactComplete: boolean | null;
}

/** DB qatorining bu servisga kerakli qismi. */
interface TargetRecord {
  id: string;
  employeeId: string;
  metricKey: string;
  unit: string;
  targetValue: bigint | null;
  period: string;
  weight: unknown;
  currency: string | null;
  manualDoneAt: Date | null;
  active: boolean;
  employee?: { name: string | null } | null;
}

@Injectable()
export class EmployeeKpiTargetService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(KpiMetricCatalogService) private readonly catalog: KpiMetricCatalogService,
  ) {}

  /** Bitta xodimning biriktirilgan KPI'lari (xodim kartasi tabi). */
  async list(accountId: string, employeeId: string): Promise<EmployeeKpiTargetRow[]> {
    const rows = (await this.prisma.client.employeeKpiTarget.findMany({
      where: { accountId, employeeId },
      orderBy: [{ active: 'desc' }, { createdAt: 'asc' }],
      include: { employee: { select: { name: true } } },
    })) as unknown as TargetRecord[];
    return this.decorate(accountId, rows);
  }

  /** Butun hisob bo'yicha (menejer ekrani `/menejer/kpi`). */
  async listAll(
    accountId: string,
    filter: ListAllKpiTargetsQuery,
  ): Promise<EmployeeKpiTargetRow[]> {
    const rows = (await this.prisma.client.employeeKpiTarget.findMany({
      where: {
        accountId,
        ...(filter.employeeId ? { employeeId: filter.employeeId } : {}),
        ...(filter.period ? { period: filter.period } : {}),
      },
      orderBy: [{ employeeId: 'asc' }, { active: 'desc' }, { createdAt: 'asc' }],
      include: { employee: { select: { name: true } } },
    })) as unknown as TargetRecord[];
    return this.decorate(accountId, rows);
  }

  async create(
    accountId: string,
    actorId: string | null,
    employeeId: string,
    input: CreateEmployeeKpiTargetInput,
  ) {
    const emp = await this.prisma.client.employee.findFirst({
      where: { id: employeeId, accountId },
      select: { id: true },
    });
    if (!emp) throw new NotFoundException('Xodim topilmadi');

    const catalog = await this.catalog.resolve(accountId);
    const def = metricDef(input.metricKey, catalog);
    if (!def) throw new BadRequestException(`Noma'lum ko'rsatkich: ${input.metricKey}`);

    // 🔴 Birlik va valyuta KATALOGDAN — klient yuborgani e'tiborga olinmaydi.
    // `currency` faqat `money` da to'ldiriladi (DB CHECK ikki tomonlama).
    const currency = def.unit === 'money' ? await this.accountCurrency(accountId) : null;
    const targetValue =
      input.targetValue == null ? null : toMinor(def.unit, currency, input.targetValue);

    try {
      return await this.prisma.client.$transaction(async (tx) => {
        const created = (await tx.employeeKpiTarget.create({
          data: {
            accountId,
            employeeId,
            metricKey: def.key,
            unit: def.unit,
            targetValue,
            period: input.period,
            // `?? null` — `undefined` kelsa Prisma sukut (`true`) qo'yardi;
            // bu yerda esa «og'irlik yo'q» ATAYLAB tanlangan holat.
            weight: input.weight ?? null,
            currency,
            createdById: actorId,
          },
        })) as unknown as TargetRecord;

        await tx.employeeKpiTargetEvent.create({
          data: {
            accountId,
            targetId: created.id,
            employeeId,
            action: 'created',
            payloadJson: snapshot(created),
            actorId,
          },
        });
        return created;
      });
    } catch (e) {
      throw asConflict(e, def.key, input.period);
    }
  }

  async update(
    accountId: string,
    actorId: string | null,
    targetId: string,
    input: UpdateEmployeeKpiTargetInput,
  ) {
    const before = await this.mustFind(accountId, targetId);

    // Qisman patch: berilmagan maydon `data` ga UMUMAN tushmaydi. Spread
    // ishlatilsa klient yuborgan begona kalit (`unit`!) ham o'tib ketardi.
    const data: Record<string, unknown> = {};
    if (input.period !== undefined) data.period = input.period;
    if (input.active !== undefined) data.active = input.active;
    if (input.weight !== undefined) data.weight = input.weight;
    if (input.targetValue !== undefined) {
      data.targetValue =
        input.targetValue == null ? null : toMinor(before.unit, before.currency, input.targetValue);
    }

    return this.prisma.client.$transaction(async (tx) => {
      const after = (await tx.employeeKpiTarget.update({
        where: { id: targetId },
        data,
      })) as unknown as TargetRecord;

      await tx.employeeKpiTargetEvent.create({
        data: {
          accountId,
          targetId,
          employeeId: before.employeeId,
          action: 'updated',
          // Ikkala holat ham matn: «kim maqsadni pasaytirdi» savoliga javob
          // faqat shu ustunda qoladi.
          payloadJson: { before: snapshot(before), after: snapshot(after) },
          actorId,
        },
      });
      return after;
    });
  }

  /** Qator ketadi, JURNAL QOLADI. */
  async remove(accountId: string, actorId: string | null, targetId: string) {
    const row = await this.mustFind(accountId, targetId);

    return this.prisma.client.$transaction(async (tx) => {
      // 🔴 Event O'CHIRISHDAN OLDIN. `targetId` ATAYLAB `null`: qator
      // ketgandan keyin havola baribir bo'shab qolardi (`onDelete: SetNull`),
      // shuning uchun javob faqat payload MATNIDA bo'lishiga tayanamiz.
      await tx.employeeKpiTargetEvent.create({
        data: {
          accountId,
          targetId: null,
          employeeId: row.employeeId,
          action: 'deleted',
          payloadJson: snapshot(row),
          actorId,
        },
      });
      await tx.employeeKpiTarget.delete({ where: { id: targetId } });
      return { id: targetId, deleted: true };
    });
  }

  /**
   * «Bajarildi» belgisi — FAQAT dvigatel hisoblay olmaydigan metrikada.
   *
   * O'lchanadigan metrikada rad etiladi: fakt har doim dvigateldan keladi,
   * ikki manba = ikki haqiqat (ekranda ham tugma ko'rsatilmaydi, lekin server
   * o'z qarorini o'zi qo'riqlaydi).
   */
  async setDone(accountId: string, actorId: string | null, targetId: string, done: boolean) {
    const row = await this.mustFind(accountId, targetId);
    const catalog = await this.catalog.resolve(accountId);
    const def = metricDef(row.metricKey, catalog);

    // Fail-closed: katalogda yo'q kalit (arxivlangan o'z ko'rsatkichi) ham rad
    // etiladi — «qo'ldami yo'qmi» aniqlanmasa belgilash mumkin emas.
    if (!def || def.source !== 'manual') {
      throw new BadRequestException(
        "Bu ko'rsatkichni tizim o'lchanadi — «bajarildi» belgisi faqat qo'lda kiritiladigan ko'rsatkich uchun",
      );
    }

    return this.prisma.client.$transaction(async (tx) => {
      const after = (await tx.employeeKpiTarget.update({
        where: { id: targetId },
        data: { manualDoneAt: done ? new Date() : null },
      })) as unknown as TargetRecord;

      await tx.employeeKpiTargetEvent.create({
        data: {
          accountId,
          targetId,
          employeeId: row.employeeId,
          action: done ? 'marked_done' : 'reopened',
          payloadJson: snapshot(after),
          actorId,
        },
      });
      return after;
    });
  }

  // ── ichki ────────────────────────────────────────────────────────────────

  /** Hisob kesimida topadi — cross-tenant murojaat 404 bo'ladi. */
  private async mustFind(accountId: string, targetId: string): Promise<TargetRecord> {
    const row = (await this.prisma.client.employeeKpiTarget.findFirst({
      where: { id: targetId, accountId },
    })) as unknown as TargetRecord | null;
    if (!row) throw new NotFoundException('KPI topilmadi');
    return row;
  }

  private async accountCurrency(accountId: string): Promise<string> {
    const acc = await this.prisma.client.account.findFirst({
      where: { id: accountId },
      select: { currency: true },
    });
    const code = acc?.currency ?? 'UZS';
    if (!isCurrencyCode(code)) {
      throw new BadRequestException(`Hisob valyutasi noma'lum: ${code}`);
    }
    return code;
  }

  /**
   * Qatorlarga katalog yorlig'i va oxirgi faktni qo'shadi.
   *
   * Fakt BITTA so'rovda yuklanadi (`distinct` bilan har xodimning eng oxirgi
   * kuni) — xodim boshiga so'rov bo'lsa menejer ekrani N+1 ga aylanardi.
   */
  private async decorate(accountId: string, rows: TargetRecord[]): Promise<EmployeeKpiTargetRow[]> {
    if (rows.length === 0) return [];
    const catalog = await this.catalog.resolve(accountId);
    const facts = await this.latestFacts(accountId, [...new Set(rows.map((r) => r.employeeId))]);

    return rows.map((r) => {
      const def = metricDef(r.metricKey, catalog);
      const day = facts.get(r.employeeId);
      const m = day?.metrics.get(r.metricKey);
      // `adjustValue` menejer tuzatmasi — avto-qiymatdan ustun. `?? ` ishlatiladi
      // (`||` EMAS): tuzatma 0 bo'lsa ham u haqiqiy qiymat.
      const fact = m ? (m.adjustValue ?? m.autoValue) : null;

      return {
        id: r.id,
        employeeId: r.employeeId,
        employeeName: r.employee?.name ?? null,
        metricKey: r.metricKey,
        // Katalogda yo'q (arxivlangan) kalit — kalitning o'zi ko'rsatiladi;
        // xom kalitni yashirib «—» qo'yish qatorni tushunarsiz qilardi.
        labelUz: def?.labelUz ?? r.metricKey,
        labelRu: def?.labelRu ?? r.metricKey,
        unit: (def?.unit ?? r.unit) as MetricUnit,
        direction: def?.direction ?? 'neutral',
        measurable: def ? def.source !== 'manual' : false,
        period: r.period as KpiTargetPeriod,
        targetMinor: r.targetValue == null ? null : r.targetValue.toString(),
        currency: r.currency,
        weight: r.weight == null ? null : Number(r.weight),
        manualDoneAt: r.manualDoneAt,
        active: r.active,
        lastFactMinor: fact == null ? null : fact.toString(),
        lastFactDate: day?.date ?? null,
        lastFactComplete: m ? m.complete : null,
      };
    });
  }

  private async latestFacts(accountId: string, employeeIds: string[]) {
    const days = (await this.prisma.client.employeeDailyKpi.findMany({
      where: { accountId, employeeId: { in: employeeIds } },
      orderBy: [{ employeeId: 'asc' }, { date: 'desc' }],
      distinct: ['employeeId'],
      select: {
        employeeId: true,
        date: true,
        metrics: {
          select: { metricKey: true, autoValue: true, adjustValue: true, complete: true },
        },
      },
    })) as unknown as Array<{
      employeeId: string;
      date: Date;
      metrics: Array<{
        metricKey: string;
        autoValue: bigint | null;
        adjustValue: bigint | null;
        complete: boolean;
      }>;
    }>;

    return new Map(
      days.map((d) => [
        d.employeeId,
        { date: d.date, metrics: new Map(d.metrics.map((m) => [m.metricKey, m])) },
      ]),
    );
  }
}

/**
 * Jurnal payloadi — `interface` EMAS, `type`: Prisma'ning `InputJsonValue`
 * turiga faqat implicit indeks-imzosi bo'lgan tur mos keladi (interface'da u
 * yo'q, shuning uchun typecheck rad etadi).
 */
type TargetSnapshot = {
  metricKey: string;
  unit: string;
  period: string;
  targetValue: string | null;
  weight: number | null;
  currency: string | null;
  manualDoneAt: string | null;
  active: boolean;
};

/** O'sha ondagi qiymatlar MATNI — havola emas. */
function snapshot(r: TargetRecord): TargetSnapshot {
  return {
    metricKey: r.metricKey,
    unit: r.unit,
    period: r.period,
    // BigInt JSON'ga sig'maydi — matnga o'giriladi (aks holda serializatsiya
    // yiqilardi va audit yozuvi butun mutatsiyani buzardi).
    targetValue: r.targetValue == null ? null : r.targetValue.toString(),
    weight: r.weight == null ? null : Number(r.weight),
    currency: r.currency,
    manualDoneAt: r.manualDoneAt ? r.manualDoneAt.toISOString() : null,
    active: r.active,
  };
}

/**
 * Ko'rinish birligi → minor.
 *
 * Pul: `Money.fromMajor` (aniq o'nlik parser — float yaxlitlashi yo'q).
 * Sanoq/vaqt/foiz: kasr **rad etiladi** — jimgina yaxlitlash menejer kiritgan
 * raqamni o'zgartirib qo'yardi.
 */
function toMinor(unit: string, currency: string | null, display: string): bigint {
  if (unit === 'money') {
    const code = currency ?? 'UZS';
    if (!isCurrencyCode(code)) throw new BadRequestException(`Valyuta noma'lum: ${code}`);
    return Money.fromMajor(display, code as CurrencyCode).toMinor();
  }
  if (display.includes('.')) {
    throw new BadRequestException('Bu ko`rsatkich maqsadi butun son bo`lishi kerak');
  }
  return BigInt(display);
}

/** Prisma unique buzilishi → tushunarli 409. */
function asConflict(e: unknown, metricKey: string, period: string): unknown {
  if (typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002') {
    return new ConflictException(
      `Bu ko'rsatkich (${metricKey}, ${period}) xodimga allaqachon biriktirilgan`,
    );
  }
  return e;
}

export type { MetricCatalog };
