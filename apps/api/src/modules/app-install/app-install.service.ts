import { Prisma } from '@moysklad/db';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  APP_CATALOG,
  AppKeySchema,
  InstallAppSchema,
  SaveConfigSchema,
} from './app-install.schema.js';

/**
 * AppInstallService — static catalog merged with per-account install state.
 *
 * The catalog (APP_CATALOG) is hardcoded here — no DB table for catalog entries.
 * Only AppInstall rows (the "installed" state) live in the DB.
 */
@Injectable()
export class AppInstallService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Returns the full catalog merged with this account's install state.
   * GET /app-installs/available
   */
  async listAvailable(accountId: string) {
    const installed = await this.prisma.client.appInstall.findMany({
      where: { accountId },
    });
    const installedMap = new Map(installed.map((i) => [i.appKey, i]));

    return APP_CATALOG.map((entry) => {
      const install = installedMap.get(entry.appKey);
      return {
        ...entry,
        installed: !!install,
        enabled: install?.enabled ?? false,
        config: install?.config ?? null,
        installedAt: install?.installedAt ?? null,
        installId: install?.id ?? null,
      };
    });
  }

  async findByKey(accountId: string, appKey: string) {
    const key = AppKeySchema.parse(appKey);
    const install = await this.prisma.client.appInstall.findUnique({
      where: { accountId_appKey: { accountId, appKey: key } },
    });
    if (!install) throw new NotFoundException(`App '${appKey}' is not installed`);
    return install;
  }

  /**
   * Install an app — creates AppInstall with enabled=true.
   * Idempotent: if already installed, just returns existing row.
   */
  async install(accountId: string, rawBody: unknown) {
    const data = InstallAppSchema.parse(rawBody);

    const existing = await this.prisma.client.appInstall.findUnique({
      where: { accountId_appKey: { accountId, appKey: data.appKey } },
    });
    if (existing) {
      // Idempotent — return existing install
      return existing;
    }

    return this.prisma.client.appInstall.create({
      data: {
        accountId,
        appKey: data.appKey,
        enabled: true,
        config: data.config != null ? (data.config as Prisma.InputJsonValue) : undefined,
      },
    });
  }

  /**
   * Uninstall — deletes the AppInstall row.
   */
  async uninstall(accountId: string, appKey: string) {
    const key = AppKeySchema.parse(appKey);
    const existing = await this.prisma.client.appInstall.findUnique({
      where: { accountId_appKey: { accountId, appKey: key } },
    });
    if (!existing) throw new NotFoundException(`App '${appKey}' is not installed`);
    await this.prisma.client.appInstall.delete({ where: { id: existing.id } });
    return { success: true, appKey: key };
  }

  /**
   * SaveConfig — updates the JSON config blob for an installed app.
   */
  async saveConfig(accountId: string, appKey: string, rawBody: unknown) {
    const key = AppKeySchema.parse(appKey);
    const data = SaveConfigSchema.parse(rawBody);

    const existing = await this.prisma.client.appInstall.findUnique({
      where: { accountId_appKey: { accountId, appKey: key } },
    });
    if (!existing) throw new NotFoundException(`App '${appKey}' is not installed`);

    return this.prisma.client.appInstall.update({
      where: { id: existing.id },
      data: {
        config: data.config == null ? Prisma.JsonNull : (data.config as Prisma.InputJsonValue),
      },
    });
  }
}
