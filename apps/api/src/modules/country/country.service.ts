import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

interface ListQuery {
  search?: string;
  limit?: string | number;
  cursor?: string;
}

/**
 * Country read-only API — covers what the «Страна» (country of origin)
 * position picker needs on import-inbound documents (Приёмка §41, Возврат
 * покупателя §45). ISO 3166-1 lookup; full CRUD lives in Settings later.
 */
@Injectable()
export class CountryService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(accountId: string, query: ListQuery) {
    const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 250);
    const items = await this.prisma.client.country.findMany({
      where: {
        accountId,
        ...(query.search
          ? {
              OR: [
                { name: { contains: String(query.search), mode: 'insensitive' } },
                { code: { contains: String(query.search), mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { name: 'asc' },
      take: limit,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: { id: true, name: true, code: true, externalCode: true },
    });
    return { items };
  }

  async findById(accountId: string, id: string) {
    const country = await this.prisma.client.country.findFirst({
      where: { id, accountId },
    });
    if (!country) throw new NotFoundException(`Country ${id} not found`);
    return country;
  }
}
