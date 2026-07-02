import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { encryptPassword } from '../../email/crypto.js';
import { ListOneCSyncLogsSchema, SaveOneCConfigSchema } from './onec.schema.js';

interface PublicOneCConfig {
  id: string;
  endpointUrl: string;
  username: string;
  hasPassword: boolean;
  direction: string;
  pollIntervalMin: number;
  enabled: boolean;
  lastSyncAt: Date | null;
  lastSyncOk: boolean | null;
  lastSyncMsg: string | null;
}

/**
 * OneCSyncService — 1C 8.3 CommerceML 2.x bridge config + sync log.
 *
 * V1 ships config CRUD + sync log read. The actual XML import/export
 * runner is a separate process (cron + http endpoint at 1C side); this
 * service just records what happened. Full XML conversion follows in
 * Sprint 31b.
 */
@Injectable()
export class OneCSyncService {
  private readonly logger = new Logger(OneCSyncService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getConfig(accountId: string): Promise<PublicOneCConfig | null> {
    const row = await this.prisma.client.oneCSyncConfig.findUnique({ where: { accountId } });
    if (!row) return null;
    return this.publicView(row);
  }

  async saveConfig(accountId: string, raw: unknown): Promise<PublicOneCConfig> {
    const r = SaveOneCConfigSchema.safeParse(raw);
    if (!r.success) {
      throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    }
    const parsed = r.data;
    const existing = await this.prisma.client.oneCSyncConfig.findUnique({ where: { accountId } });
    const passwordCipher =
      parsed.password && parsed.password.length > 0 ? encryptPassword(parsed.password) : undefined;
    if (!passwordCipher && !existing) {
      throw new BadRequestException('Birinchi sozlash uchun parol majburiy');
    }
    const data = {
      accountId,
      endpointUrl: parsed.endpointUrl,
      username: parsed.username,
      ...(passwordCipher !== undefined ? { passwordCipher } : {}),
      direction: parsed.direction,
      pollIntervalMin: parsed.pollIntervalMin,
    };
    const saved = existing
      ? await this.prisma.client.oneCSyncConfig.update({ where: { accountId }, data })
      : await this.prisma.client.oneCSyncConfig.create({
          data: { ...data, passwordCipher: passwordCipher as string },
        });
    return this.publicView(saved);
  }

  async deleteConfig(accountId: string): Promise<{ ok: true }> {
    await this.prisma.client.oneCSyncConfig.deleteMany({ where: { accountId } });
    return { ok: true };
  }

  async listLogs(accountId: string, raw: unknown) {
    const filter = ListOneCSyncLogsSchema.parse(raw);
    const items = await this.prisma.client.oneCSyncLog.findMany({
      where: {
        accountId,
        ...(filter.direction ? { direction: filter.direction } : {}),
        ...(filter.status ? { status: filter.status } : {}),
      },
      orderBy: { startedAt: 'desc' },
      take: filter.limit,
    });
    return { items };
  }

  /**
   * Record a sync cycle outcome. Called by the sync runner (V2). V1
   * exposes it as an admin endpoint so external schedulers (cron job
   * outside Node, or 1C-side push) can submit results.
   */
  async recordCycle(
    accountId: string,
    direction: 'pull' | 'push',
    status: 'success' | 'partial' | 'failed',
    counts: Record<string, number>,
    errorMsg?: string,
  ) {
    return this.prisma.client.oneCSyncLog.create({
      data: {
        accountId,
        direction,
        status,
        counts: counts as unknown as import('@moysklad/db').Prisma.InputJsonValue,
        finishedAt: new Date(),
        errorMsg: errorMsg?.slice(0, 500) ?? null,
      },
    });
  }

  private publicView(row: {
    id: string;
    endpointUrl: string;
    username: string;
    passwordCipher: string;
    direction: string;
    pollIntervalMin: number;
    enabled: boolean;
    lastSyncAt: Date | null;
    lastSyncOk: boolean | null;
    lastSyncMsg: string | null;
  }): PublicOneCConfig {
    return {
      id: row.id,
      endpointUrl: row.endpointUrl,
      username: row.username,
      hasPassword: row.passwordCipher.length > 0,
      direction: row.direction,
      pollIntervalMin: row.pollIntervalMin,
      enabled: row.enabled,
      lastSyncAt: row.lastSyncAt,
      lastSyncOk: row.lastSyncOk,
      lastSyncMsg: row.lastSyncMsg,
    };
  }
}
