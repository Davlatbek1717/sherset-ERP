import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { UpdateVarianceConfigSchema } from './variance-config.schema.js';

const DEFAULT_GREEN = 5;
const DEFAULT_YELLOW = 15;

@Injectable()
export class VarianceConfigService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** Always returns a config — creates the default row on first read. */
  async get(accountId: string) {
    const existing = await this.prisma.client.analitikaVarianceConfig.findUnique({
      where: { accountId },
    });
    if (existing) return this.serialize(existing);
    const created = await this.prisma.client.analitikaVarianceConfig.create({
      data: { accountId, greenMaxPct: DEFAULT_GREEN, yellowMaxPct: DEFAULT_YELLOW },
    });
    return this.serialize(created);
  }

  async update(accountId: string, raw: unknown) {
    const r = UpdateVarianceConfigSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    const row = await this.prisma.client.analitikaVarianceConfig.upsert({
      where: { accountId },
      create: { accountId, greenMaxPct: r.data.greenMaxPct, yellowMaxPct: r.data.yellowMaxPct },
      update: { greenMaxPct: r.data.greenMaxPct, yellowMaxPct: r.data.yellowMaxPct },
    });
    return this.serialize(row);
  }

  // Decimal columns come back as Prisma.Decimal — convert to number for JSON.
  private serialize(row: {
    id: string;
    accountId: string;
    greenMaxPct: unknown;
    yellowMaxPct: unknown;
  }) {
    return {
      id: row.id,
      accountId: row.accountId,
      greenMaxPct: Number(row.greenMaxPct),
      yellowMaxPct: Number(row.yellowMaxPct),
    };
  }
}
