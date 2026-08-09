import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import {
  type CommentTemplate,
  type CommentTemplateKind,
  materializeComment,
  suggestTemplates,
} from './comment-templates.js';
import type {
  CommentTemplateCreateInput,
  CommentTemplateListQuery,
  CommentTemplateSuggestQuery,
  CommentTemplateUpdateInput,
} from './manager-comment-template.schema.js';

/**
 * MK20 / 4M TZ §8.1/6 — shablon izohlar, I/O qatlami.
 *
 * Qoidalar sof modulda (`comment-templates.ts`). Bu yerda Prisma o'qish/yozish
 * va bitta muhim shartnoma: **`resolveComment` jurnal uchun MATN qaytaradi.**
 * Chaqiruvchi (navbat va kun qabuli servislari) uni to'g'ridan-to'g'ri
 * `comment` ustuniga yozadi — shu bilan yozuv shablondan uziladi va keyingi
 * tahrirlar tarixga ta'sir qilmaydi.
 */

/** Prisma qatoridan sof shaklga. `kind` DB CHECK bilan qulflangan. */
type TemplateRow = {
  id: string;
  kind: string;
  locale: string;
  title: string;
  body: string;
  ruleTypes: string[];
  actions: string[];
  sortOrder: number;
  usageCount: number;
  archivedAt: Date | null;
};

const ROW_SELECT = {
  id: true,
  kind: true,
  locale: true,
  title: true,
  body: true,
  ruleTypes: true,
  actions: true,
  sortOrder: true,
  usageCount: true,
  lastUsedAt: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { id: true, name: true } },
} as const;

function toPure(row: TemplateRow): CommentTemplate {
  return {
    id: row.id,
    kind: row.kind as CommentTemplateKind,
    locale: row.locale,
    title: row.title,
    body: row.body,
    ruleTypes: row.ruleTypes,
    actions: row.actions,
    sortOrder: row.sortOrder,
    usageCount: row.usageCount,
    archivedAt: row.archivedAt,
  };
}

@Injectable()
export class ManagerCommentTemplateService {
  private readonly logger = new Logger(ManagerCommentTemplateService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  // ── Sozlamalar ekrani ─────────────────────────────────────────────────────

  async list(accountId: string, query: CommentTemplateListQuery = {}) {
    const rows = await this.prisma.client.managerCommentTemplate.findMany({
      where: {
        accountId,
        ...(query.includeArchived ? {} : { archivedAt: null }),
        ...(query.kind ? { kind: query.kind } : {}),
        ...(query.locale ? { locale: query.locale } : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
      select: ROW_SELECT,
    });
    return { count: rows.length, templates: rows };
  }

  /**
   * Kontekstga mos shablonlar. Arxivlanganlar SO'ROVDA kesiladi (sof modul ham
   * kesadi — ikki qatlam, chunki bittasi unutilsa arxivdagi matn menejerga
   * qaytib ko'rinardi).
   */
  async suggest(accountId: string, query: CommentTemplateSuggestQuery = {}) {
    const rows = await this.prisma.client.managerCommentTemplate.findMany({
      where: { accountId, archivedAt: null },
      select: ROW_SELECT,
    });
    const templates = suggestTemplates(rows.map(toPure), {
      action: query.action,
      ruleType: query.ruleType,
      locale: query.locale,
    });
    return { count: templates.length, templates };
  }

  async create(accountId: string, actorId: string | null, input: CommentTemplateCreateInput) {
    return this.prisma.client.managerCommentTemplate.create({
      data: {
        accountId,
        kind: input.kind,
        locale: input.locale,
        title: input.title,
        body: input.body,
        ruleTypes: input.ruleTypes,
        actions: input.actions,
        sortOrder: input.sortOrder,
        createdById: actorId,
      },
      select: ROW_SELECT,
    });
  }

  async update(accountId: string, id: string, patch: CommentTemplateUpdateInput) {
    await this.mustFind(accountId, id);
    return this.prisma.client.managerCommentTemplate.update({
      where: { id },
      data: {
        ...(patch.kind === undefined ? {} : { kind: patch.kind }),
        ...(patch.locale === undefined ? {} : { locale: patch.locale }),
        ...(patch.title === undefined ? {} : { title: patch.title }),
        ...(patch.body === undefined ? {} : { body: patch.body }),
        ...(patch.ruleTypes === undefined ? {} : { ruleTypes: patch.ruleTypes }),
        ...(patch.actions === undefined ? {} : { actions: patch.actions }),
        ...(patch.sortOrder === undefined ? {} : { sortOrder: patch.sortOrder }),
      },
      select: ROW_SELECT,
    });
  }

  /**
   * ARXIVLASH — o'chirish emas.
   *
   * Qattiq o'chirish tarixni buzmasdi (jurnalda matn nusxasi turadi), lekin
   * `usageCount` statistikasi yo'qolardi: «qaysi shablon ishlatilgan» savoli
   * javobsiz qolardi.
   */
  async archive(accountId: string, id: string) {
    await this.mustFind(accountId, id);
    return this.prisma.client.managerCommentTemplate.update({
      where: { id },
      data: { archivedAt: new Date() },
      select: ROW_SELECT,
    });
  }

  /** Arxivdan qaytarish — matn yo'qolmagani uchun bu oddiy bayroq. */
  async restore(accountId: string, id: string) {
    await this.mustFind(accountId, id);
    return this.prisma.client.managerCommentTemplate.update({
      where: { id },
      data: { archivedAt: null },
      select: ROW_SELECT,
    });
  }

  // ── Jurnal uchun matn ─────────────────────────────────────────────────────

  /**
   * 🔴 JURNALGA TUSHADIGAN MATN. Qaytadigan qiymat — satr yoki `null`, HECH
   * QACHON shablon identifikatori.
   *
   * `templateId` noma'lum bo'lsa **404**: jimgina izohsiz yopish menejerni
   * «izohim yozildi» degan yolg'on ishonchda qoldirardi.
   */
  async resolveComment(
    accountId: string,
    input: { templateId?: string | null; comment?: string | null },
  ): Promise<string | null> {
    if (!input.templateId) return materializeComment({ comment: input.comment });

    const row = await this.prisma.client.managerCommentTemplate.findFirst({
      where: { accountId, id: input.templateId },
      select: { id: true, body: true },
    });
    if (!row) throw new NotFoundException('Izoh shabloni topilmadi');

    const text = materializeComment({ comment: input.comment, template: { body: row.body } });

    // Statistika menejerning qarorini BLOKLAMAYDI: hisoblagich yozuvi
    // yiqilsa ham izoh qaytadi. Aks holda «qaysi shablon ko'p ishlatiladi»
    // degan yordamchi o'lchov navbatni to'xtatib qo'yardi.
    try {
      await this.prisma.client.managerCommentTemplate.update({
        where: { id: row.id },
        data: { usageCount: { increment: 1 }, lastUsedAt: new Date() },
      });
    } catch (err) {
      this.logger.warn(`Shablon ishlatilishi yozilmadi (${row.id}): ${String(err)}`);
    }

    return text;
  }

  private async mustFind(accountId: string, id: string) {
    const row = await this.prisma.client.managerCommentTemplate.findFirst({
      where: { accountId, id },
      select: { id: true },
    });
    if (!row) throw new NotFoundException('Izoh shabloni topilmadi');
    return row;
  }
}
