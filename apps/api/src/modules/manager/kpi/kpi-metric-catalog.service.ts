import type { Prisma } from '@moysklad/db';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import {
  BUILT_IN_CATALOG,
  KPI_METRICS,
  type KpiMetricDef,
  type MetricCatalog,
  isBuiltInMetric,
} from './kpi-metrics.js';
import type { SaveCustomMetricInput } from './manager-kpi.schema.js';

/**
 * Ko'rsatkich katalogi — built-in + **hisobning O'Z ko'rsatkichlari**.
 *
 * NEGA KERAK BO'LDI: `kpi-metrics.ts` dagi ro'yxat kod ichida qattiq yozilgan
 * va `saveEmployeeConfig` undan tashqaridagi kalitni rad etardi. Ya'ni egasi
 * xodimga faqat TAYYOR ko'rsatkichlarni bera olardi; o'zining o'lchovini
 * («mijoz shikoyati», «yig'ilgan quti», «ustoz bahosi») qo'sha olmasdi.
 *
 * ⚠️ HALOL CHEKLOV: hisob yaratgan ko'rsatkich `source = 'manual'` bo'ladi —
 * tizim uni HISOBLAY OLMAYDI (biror modulga ulanmagan). Kunlik dvigatel unga
 * `autoValue = NULL` (o'lchanmagan) qator ochadi, faktni esa menejer qo'lda
 * kiritadi. Bu yashirilmaydi: ekranda «qo'lda kiritiladi» deb turadi. Aks
 * holda menejer raqam o'zi paydo bo'lishini kutib, kun bo'sh qolaverardi.
 *
 * Kalit `custom_` prefiksi bilan yaratiladi — built-in kalit bilan hech
 * qachon to'qnashmasligi uchun (built-in ro'yxat kelajakda kengayadi).
 */
@Injectable()
export class KpiMetricCatalogService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Hisobning to'liq katalogi: built-in'lar + o'z ko'rsatkichlari.
   *
   * Ball, ekran va tuzatma mantiqi shu xaritadan o'qiydi, ya'ni ikki tur
   * ko'rsatkich orasida farq qilmaydi (farq faqat qiymat qayerdan kelishida).
   */
  async resolve(accountId: string): Promise<MetricCatalog> {
    const custom = await this.listCustomRows(accountId);
    const merged = new Map<string, KpiMetricDef>(BUILT_IN_CATALOG);
    for (const row of custom) merged.set(row.key, row);
    return merged;
  }

  /** FE tanlagichi uchun ro'yxat — `custom` bayrog'i bilan. */
  async list(accountId: string): Promise<Array<KpiMetricDef & { custom: boolean }>> {
    const custom = await this.listCustomRows(accountId);
    return [
      ...KPI_METRICS.map((m) => ({ ...m, custom: false })),
      ...custom.map((m) => ({ ...m, custom: true })),
    ];
  }

  /** Hisob yaratgan (arxivlanmagan) ko'rsatkichlar. */
  private async listCustomRows(accountId: string): Promise<KpiMetricDef[]> {
    const rows = await this.prisma.client.kpiMetricDef.findMany({
      where: { accountId, source: 'manual', archived: false },
      orderBy: { createdAt: 'asc' },
      select: {
        key: true,
        labelUz: true,
        labelRu: true,
        unit: true,
        direction: true,
        source: true,
        perHour: true,
      },
    });
    return rows as KpiMetricDef[];
  }

  /** Yangi ko'rsatkich yaratadi. */
  async create(accountId: string, input: SaveCustomMetricInput) {
    const key = await this.uniqueKey(accountId, input.labelUz);
    return this.prisma.client.kpiMetricDef.create({
      data: {
        accountId,
        key,
        labelUz: input.labelUz,
        labelRu: input.labelRu || input.labelUz,
        unit: input.unit,
        direction: input.direction,
        // Manba har doim `manual` — hisob yaratgan ko'rsatkichni tizim
        // hisoblay olmaydi, uni biror modulga «ulab» ham bo'lmaydi.
        source: 'manual',
        perHour: input.perHour ?? false,
      },
      select: {
        key: true,
        labelUz: true,
        labelRu: true,
        unit: true,
        direction: true,
        perHour: true,
      },
    });
  }

  /**
   * Nomi/birligi/yo'nalishini yangilaydi.
   *
   * ⚠️ KALIT O'ZGARMAYDI: unga allaqachon yozilgan kunlik qiymatlar va profil
   * versiyalari bog'langan. Kalit almashtirilsa o'sha tarix uzilib qolardi.
   */
  async update(accountId: string, key: string, input: SaveCustomMetricInput) {
    const row = await this.findCustom(accountId, key);
    return this.prisma.client.kpiMetricDef.update({
      where: { id: row.id },
      data: {
        labelUz: input.labelUz,
        labelRu: input.labelRu || input.labelUz,
        unit: input.unit,
        direction: input.direction,
        perHour: input.perHour ?? false,
      },
      select: {
        key: true,
        labelUz: true,
        labelRu: true,
        unit: true,
        direction: true,
        perHour: true,
      },
    });
  }

  /**
   * Arxivlaydi (O'CHIRMAYDI).
   *
   * O'chirish `KpiProfileMetric.metricDefId` FK'si (`onDelete: Restrict`) ga
   * urilardi, ustiga o'tgan kunlarning raqamlari ma'nosini yo'qotardi —
   * hisobot tarixni qayta yozmasligi kerak. Arxivlangan ko'rsatkich yangi
   * profilga qo'shilmaydi, lekin eski kunlar o'z qiymati bilan qoladi.
   */
  async archive(accountId: string, key: string) {
    const row = await this.findCustom(accountId, key);
    await this.prisma.client.kpiMetricDef.update({
      where: { id: row.id },
      data: { archived: true },
    });
    return { key, archived: true };
  }

  private async findCustom(accountId: string, key: string) {
    if (isBuiltInMetric(key)) {
      throw new BadRequestException("Tizim ko'rsatkichini o'zgartirib bo'lmaydi");
    }
    const row = await this.prisma.client.kpiMetricDef.findFirst({
      where: { accountId, key, source: 'manual' },
      select: { id: true },
    });
    if (!row) throw new NotFoundException(`Ko'rsatkich topilmadi: ${key}`);
    return row;
  }

  /**
   * Nomdan kalit yasaydi: `custom_mijoz_shikoyati`. Band bo'lsa raqam
   * qo'shiladi. Kalit — barqaror identifikator, nom keyin o'zgarsa ham
   * o'zgarmaydi (unga kunlik qiymatlar bog'langan).
   */
  private async uniqueKey(accountId: string, label: string): Promise<string> {
    const base = `custom_${slugify(label)}`.slice(0, 40);
    const taken = new Set(
      (
        await this.prisma.client.kpiMetricDef.findMany({
          where: { accountId, key: { startsWith: base } },
          select: { key: true },
        })
      ).map((r) => r.key),
    );
    if (!taken.has(base) && !isBuiltInMetric(base)) return base;
    for (let i = 2; i < 500; i++) {
      const candidate = `${base}_${i}`;
      if (!taken.has(candidate)) return candidate;
    }
    throw new BadRequestException("Kalit yasab bo'lmadi — nomni o'zgartiring");
  }

  /**
   * TS-katalog + hisobning o'z ko'rsatkichlarini `kpi_metric_defs` bilan
   * sinxronlaydi va `kalit → id` xaritasini qaytaradi (profil FK'si uchun).
   */
  async ensureDefs(accountId: string, tx: Prisma.TransactionClient): Promise<Map<string, string>> {
    const existing = await tx.kpiMetricDef.findMany({
      where: { accountId },
      select: { id: true, key: true },
    });
    const map = new Map(existing.map((d) => [d.key, d.id]));
    for (const m of KPI_METRICS) {
      if (map.has(m.key)) continue;
      const row = await tx.kpiMetricDef.create({
        data: {
          accountId,
          key: m.key,
          labelUz: m.labelUz,
          labelRu: m.labelRu,
          unit: m.unit,
          direction: m.direction,
          source: m.source,
          perHour: m.perHour,
        },
        select: { id: true, key: true },
      });
      map.set(row.key, row.id);
    }
    return map;
  }
}

/** Lotin/kirill nomdan xavfsiz kalit bo'lagi. */
function slugify(label: string): string {
  const map: Record<string, string> = {
    а: 'a',
    б: 'b',
    в: 'v',
    г: 'g',
    д: 'd',
    е: 'e',
    ё: 'yo',
    ж: 'j',
    з: 'z',
    и: 'i',
    й: 'y',
    к: 'k',
    л: 'l',
    м: 'm',
    н: 'n',
    о: 'o',
    п: 'p',
    р: 'r',
    с: 's',
    т: 't',
    у: 'u',
    ф: 'f',
    х: 'h',
    ц: 'ts',
    ч: 'ch',
    ш: 'sh',
    щ: 'sch',
    ъ: '',
    ы: 'i',
    ь: '',
    э: 'e',
    ю: 'yu',
    я: 'ya',
    ў: 'o',
    қ: 'q',
    ғ: 'g',
    ҳ: 'h',
  };
  const out = label
    .toLowerCase()
    .split('')
    .map((ch) => map[ch] ?? ch)
    .join('')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return out || 'metric';
}
