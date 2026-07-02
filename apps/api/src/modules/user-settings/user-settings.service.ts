import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { UpdateUserSettingsSchema } from './user-settings.schema.js';

@Injectable()
export class UserSettingsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * The current employee's settings row, creating the default-valued row on
   * first read so the FE always gets a concrete object (auth `sub` = employee
   * id — see auth.service `sub: employee.id`).
   *
   * Resolves the «Значения по умолчанию» reference NAMES (the model stores
   * plain ids with no Prisma relation) so both the settings page and the
   * document /new auto-fill can render labels without extra round-trips.
   * Lookups are tenant-scoped by `accountId` and exclude archived rows; a stale,
   * cross-tenant, deleted OR archived id resolves to null (the picker then shows
   * empty — self-healing, so a since-archived default never pre-fills a new doc).
   */
  async getForEmployee(employeeId: string, accountId: string) {
    const settings =
      (await this.prisma.client.userSettings.findUnique({ where: { employeeId } })) ??
      (await this.prisma.client.userSettings.create({ data: { employeeId } }));

    const pick = { id: true, name: true } as const;
    const [defaultCompany, defaultStore, defaultProject, defaultCustomer, defaultSupplier] =
      await Promise.all([
        settings.defaultCompanyId
          ? this.prisma.client.organization.findFirst({
              where: { id: settings.defaultCompanyId, accountId, archived: false },
              select: pick,
            })
          : null,
        settings.defaultStoreId
          ? this.prisma.client.store.findFirst({
              where: { id: settings.defaultStoreId, accountId, archived: false },
              select: pick,
            })
          : null,
        settings.defaultProjectId
          ? this.prisma.client.project.findFirst({
              where: { id: settings.defaultProjectId, accountId, archived: false },
              select: pick,
            })
          : null,
        settings.defaultCustomerId
          ? this.prisma.client.counterparty.findFirst({
              where: { id: settings.defaultCustomerId, accountId, archived: false },
              select: pick,
            })
          : null,
        settings.defaultSupplierId
          ? this.prisma.client.counterparty.findFirst({
              where: { id: settings.defaultSupplierId, accountId, archived: false },
              select: pick,
            })
          : null,
      ]);

    return {
      ...settings,
      defaultCompany,
      defaultStore,
      defaultProject,
      defaultCustomer,
      defaultSupplier,
    };
  }

  /** Upsert the current employee's settings (partial). */
  async update(employeeId: string, raw: unknown) {
    const data = UpdateUserSettingsSchema.parse(raw);
    return this.prisma.client.userSettings.upsert({
      where: { employeeId },
      create: { employeeId, ...data },
      update: data,
    });
  }
}
