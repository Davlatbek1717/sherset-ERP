import { Prisma } from '@moysklad/db';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  type CreateHelpArticleInput,
  CreateHelpArticleSchema,
  HelpArticleFilterSchema,
  type UpdateHelpArticleInput,
  UpdateHelpArticleSchema,
} from './help.schema.js';

/**
 * HelpService — context-aware knowledge-base CRUD.
 *
 * Articles are surfaced by the web help drawer. The hot read path is
 * `findForRoute(accountId, route, locale)` — used at every page mount
 * to populate the drawer. Cached cheaply by the index on (accountId,
 * routeKey, enabled, locale).
 */
@Injectable()
export class HelpService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(accountId: string, rawFilter: unknown) {
    const filter = HelpArticleFilterSchema.parse(rawFilter);
    const where: Prisma.HelpArticleWhereInput = {
      accountId,
      ...(filter.locale ? { locale: filter.locale } : {}),
      ...(filter.routeKey ? { routeKey: { contains: filter.routeKey } } : {}),
      ...(filter.category ? { category: filter.category } : {}),
      ...(filter.enabled !== undefined ? { enabled: filter.enabled } : {}),
      ...(filter.archived !== undefined ? { archived: filter.archived } : { archived: false }),
      ...(filter.search
        ? {
            OR: [
              { title: { contains: filter.search, mode: 'insensitive' } },
              { bodyMd: { contains: filter.search, mode: 'insensitive' } },
              { slug: { contains: filter.search.toLowerCase() } },
            ],
          }
        : {}),
    };
    const rows = await this.prisma.client.helpArticle.findMany({
      where,
      orderBy: [{ category: 'asc' }, { position: 'asc' }, { title: 'asc' }],
      take: filter.limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > filter.limit;
    const items = hasMore ? rows.slice(0, filter.limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;
    const total = await this.prisma.client.helpArticle.count({ where });
    return { items, nextCursor, total };
  }

  /**
   * Hot path: pick context-relevant articles for a given route + locale.
   * Returns up to 20 articles with routeKey containing the request route,
   * plus 5 generic (no routeKey) fallbacks. Ordered by position.
   */
  async findForRoute(accountId: string, route: string, locale: string) {
    const [contextual, generic] = await Promise.all([
      this.prisma.client.helpArticle.findMany({
        where: {
          accountId,
          locale,
          enabled: true,
          archived: false,
          routeKey: { not: null, mode: 'insensitive', contains: route },
        },
        orderBy: { position: 'asc' },
        take: 20,
      }),
      this.prisma.client.helpArticle.findMany({
        where: {
          accountId,
          locale,
          enabled: true,
          archived: false,
          routeKey: null,
        },
        orderBy: [{ category: 'asc' }, { position: 'asc' }],
        take: 5,
      }),
    ]);
    return { contextual, generic };
  }

  async findById(accountId: string, id: string) {
    const row = await this.prisma.client.helpArticle.findFirst({
      where: { id, accountId },
    });
    if (!row) throw new NotFoundException(`Help article ${id} not found`);
    return row;
  }

  async findBySlug(accountId: string, slug: string, locale: string) {
    const row = await this.prisma.client.helpArticle.findFirst({
      where: { accountId, slug, locale, enabled: true, archived: false },
    });
    if (!row) throw new NotFoundException(`Help article '${slug}' (${locale}) not found`);
    return row;
  }

  async create(accountId: string, raw: unknown) {
    const parsed = this.parseCreate(raw);
    try {
      return await this.prisma.client.helpArticle.create({
        data: {
          accountId,
          slug: parsed.slug,
          routeKey: parsed.routeKey ?? null,
          locale: parsed.locale,
          title: parsed.title,
          bodyMd: parsed.bodyMd,
          position: parsed.position,
          category: parsed.category ?? null,
          tags: parsed.tags,
          enabled: parsed.enabled,
        },
      });
    } catch (e) {
      this.handlePrisma(e);
    }
  }

  async update(accountId: string, id: string, raw: unknown) {
    const parsed = this.parseUpdate(raw);
    await this.findById(accountId, id);
    const data: Prisma.HelpArticleUpdateInput = {};
    if (parsed.slug !== undefined) data.slug = parsed.slug;
    if (parsed.routeKey !== undefined) data.routeKey = parsed.routeKey;
    if (parsed.locale !== undefined) data.locale = parsed.locale;
    if (parsed.title !== undefined) data.title = parsed.title;
    if (parsed.bodyMd !== undefined) data.bodyMd = parsed.bodyMd;
    if (parsed.position !== undefined) data.position = parsed.position;
    if (parsed.category !== undefined) data.category = parsed.category;
    if (parsed.tags !== undefined) data.tags = { set: parsed.tags };
    if (parsed.enabled !== undefined) data.enabled = parsed.enabled;
    try {
      return await this.prisma.client.helpArticle.update({ where: { id }, data });
    } catch (e) {
      this.handlePrisma(e);
    }
  }

  async archive(accountId: string, id: string) {
    await this.findById(accountId, id);
    return this.prisma.client.helpArticle.update({
      where: { id },
      data: { archived: true },
    });
  }

  async restore(accountId: string, id: string) {
    await this.findById(accountId, id);
    return this.prisma.client.helpArticle.update({
      where: { id },
      data: { archived: false },
    });
  }

  async delete(accountId: string, id: string) {
    await this.findById(accountId, id);
    await this.prisma.client.helpArticle.delete({ where: { id } });
    return { ok: true };
  }

  private parseCreate(raw: unknown): CreateHelpArticleInput {
    const r = CreateHelpArticleSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  private parseUpdate(raw: unknown): UpdateHelpArticleInput {
    const r = UpdateHelpArticleSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  private handlePrisma(e: unknown): never {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2002') {
        throw new ConflictException('Bunday slug allaqachon mavjud (boshqa locale uchun ham)');
      }
    }
    throw e;
  }
}
