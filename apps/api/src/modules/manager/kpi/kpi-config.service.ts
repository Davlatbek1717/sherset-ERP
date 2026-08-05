import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { localDateOnly } from '../../hr/hr-shared/tz.util.js';
import type { SaveKpiConfigInput } from './kpi-config.schema.js';
import { KpiMetricCatalogService } from './kpi-metric-catalog.service.js';
import { metricDef } from './kpi-metrics.js';

/**
 * KpiConfigService — har-xodim KPI konfiguratsiyasi (TZ 4M.2).
 *
 * Menejer xodimga ko'rsatkich + og'irlik + kunlik maqsad belgilaydi. Saqlash
 * yangi profil VERSIYASINI yozadi (tarix muzlaydi). Kunlik hisob (dvigatel)
 * profilni XODIM → LAVOZIM → sukut tartibida tanlaydi, shuning uchun bu yerda
 * yozilgan individual profil o'sha xodimга darhol amal qiladi (keyingi cron).
 *
 * `kpi_metric_defs` jadvali TS-katalogdan (`kpi-metrics.ts`) sinxronlanadi —
 * `KpiProfileMetric.metricDefId` FK'si uchun. Bu idempotent (upsert on key).
 */
@Injectable()
export class KpiConfigService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(KpiMetricCatalogService) private readonly catalog: KpiMetricCatalogService,
  ) {}

  /**
   * Ko'rsatkich katalogi — FE tanlagich uchun: built-in + hisobning O'Z
   * ko'rsatkichlari (`custom: true`). Ilgari bu yerda faqat TS ro'yxati
   * qaytarilardi, shuning uchun egasi o'z KPI'sini qo'sha olmasdi.
   */
  listMetrics(accountId: string) {
    return this.catalog.list(accountId);
  }

  /** Xodimning JORIY (eng oxirgi versiya) KPI konfiguratsiyasi. */
  async getEmployeeConfig(accountId: string, employeeId: string) {
    const profile = await this.prisma.client.kpiProfile.findFirst({
      where: { accountId, employeeId, archived: false },
      select: {
        id: true,
        versions: {
          orderBy: { version: 'desc' },
          take: 1,
          select: {
            id: true,
            version: true,
            effectiveFrom: true,
            metrics: {
              select: { weight: true, target: true, metricDef: { select: { key: true } } },
            },
          },
        },
      },
    });
    const v = profile?.versions[0];
    if (!v) return { profileId: profile?.id ?? null, version: 0, effectiveFrom: null, metrics: [] };
    return {
      profileId: profile?.id ?? null,
      version: v.version,
      effectiveFrom: v.effectiveFrom,
      metrics: v.metrics.map((pm) => ({
        metricKey: pm.metricDef.key,
        weight: Number(pm.weight),
        target: pm.target == null ? null : pm.target.toString(),
      })),
    };
  }

  /** Xodim KPI konfiguratsiyasini saqlaydi — YANGI versiya sifatida. */
  async saveEmployeeConfig(
    accountId: string,
    userId: string | null,
    employeeId: string,
    input: SaveKpiConfigInput,
  ) {
    const emp = await this.prisma.client.employee.findFirst({
      where: { id: employeeId, accountId },
      select: { id: true, name: true },
    });
    if (!emp) throw new NotFoundException('Xodim topilmadi');

    // Kalitlarni katalogга tekshir — noma'lum ko'rsatkich yozilmasin.
    // Katalog = built-in + hisobning O'Z ko'rsatkichlari; ilgari bu yerda
    // faqat TS ro'yxati ko'rilgani uchun egasining o'z KPI'si rad etilardi.
    const catalog = await this.catalog.resolve(accountId);
    const seen = new Set<string>();
    for (const m of input.metrics) {
      if (!metricDef(m.metricKey, catalog)) {
        throw new BadRequestException(`Noma'lum ko'rsatkich: ${m.metricKey}`);
      }
      if (seen.has(m.metricKey)) {
        throw new BadRequestException(`Takroriy ko'rsatkich: ${m.metricKey}`);
      }
      seen.add(m.metricKey);
    }

    return this.prisma.client.$transaction(async (tx) => {
      const keyToId = await this.catalog.ensureDefs(accountId, tx);

      let profileId = (
        await tx.kpiProfile.findFirst({
          where: { accountId, employeeId, archived: false },
          select: { id: true },
        })
      )?.id;
      if (!profileId) {
        profileId = (
          await tx.kpiProfile.create({
            data: { accountId, employeeId, name: emp.name },
            select: { id: true },
          })
        ).id;
      }

      const last = await tx.kpiProfileVersion.findFirst({
        where: { profileId },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      const version = (last?.version ?? 0) + 1;

      const pv = await tx.kpiProfileVersion.create({
        data: {
          accountId,
          profileId,
          version,
          effectiveFrom: localDateOnly(new Date()),
          note: input.note ?? null,
          createdById: userId,
        },
        select: { id: true, effectiveFrom: true },
      });

      if (input.metrics.length > 0) {
        await tx.kpiProfileMetric.createMany({
          data: input.metrics.map((m) => {
            const metricDefId = keyToId.get(m.metricKey);
            if (!metricDefId)
              throw new BadRequestException(`Ko'rsatkich topilmadi: ${m.metricKey}`);
            return {
              accountId,
              profileVersionId: pv.id,
              metricDefId,
              weight: m.weight,
              target: m.target == null ? null : BigInt(m.target),
            };
          }),
        });
      }

      return { profileId, version, effectiveFrom: pv.effectiveFrom };
    });
  }

  /**
   * Xodimning hisoblangan kunlik KPI'si (fakt vs maqsad). `date` berilmasa —
   * eng oxirgi hisoblangan kun. Bajarish %'ini FE `direction` bo'yicha hisoblaydi
   * (bu yerda faqat xom fakt + maqsad qaytariladi — noto'g'ri talqin bo'lmasin).
   */
  async getEmployeeDaily(accountId: string, employeeId: string, dateStr?: string) {
    const day = await this.prisma.client.employeeDailyKpi.findFirst({
      where: {
        accountId,
        employeeId,
        ...(dateStr ? { date: localDateOnly(new Date(dateStr)) } : {}),
      },
      orderBy: { date: 'desc' },
      select: {
        date: true,
        state: true,
        dataComplete: true,
        workedMinutes: true,
        metrics: {
          select: { metricKey: true, autoValue: true, adjustValue: true, complete: true },
        },
        profileVersion: {
          select: {
            metrics: {
              select: { weight: true, target: true, metricDef: { select: { key: true } } },
            },
          },
        },
      },
    });
    if (!day) return null;

    const cfgByKey = new Map(
      (day.profileVersion?.metrics ?? []).map((pm) => [
        pm.metricDef.key,
        { weight: Number(pm.weight), target: pm.target },
      ]),
    );

    return {
      date: day.date,
      state: day.state,
      dataComplete: day.dataComplete,
      workedMinutes: day.workedMinutes,
      metrics: day.metrics.map((m) => {
        const cfg = cfgByKey.get(m.metricKey);
        return {
          metricKey: m.metricKey,
          autoValue: m.autoValue == null ? null : m.autoValue.toString(),
          adjustValue: m.adjustValue == null ? null : m.adjustValue.toString(),
          target: cfg?.target == null ? null : cfg.target.toString(),
          weight: cfg?.weight ?? null,
          complete: m.complete,
        };
      }),
    };
  }
}
