import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { CounterpartyService } from '../../counterparty/counterparty.service.js';
import {
  type AuditRowLite,
  distributionSummary,
  ownerChangeEvents,
} from './customer-assignment.js';
import type { CustomerListQueryInput, ReassignBodyInput } from './manager-customers.schema.js';

export interface CustomerRow {
  id: string;
  name: string;
  ownerId: string | null;
  ownerName: string | null;
  phone: string | null;
  /** Oxirgi tahrir vaqti — «qachondan beri tegilmagan» savolining yaqinlashuvi. */
  updatedAt: Date | null;
}

export interface CustomerDistribution {
  total: number;
  unassigned: number;
  owners: Array<{ ownerId: string; name: string; count: number }>;
}

/**
 * MK38 / 4-bo'lim TZ §6 — MIJOZ TAQSIMOTI.
 *
 * 🔴 EGALIKNI SHU SERVIS O'ZI YOZMAYDI. U `CounterpartyService.bulkUpdate` ga
 * topshiradi — o'sha yerda tenant qo'riqchisi, versiyalash va (MK38 da
 * qo'shilgan) audit jurnali bor. Ikkinchi yozuvchi ochilsa, biri albatta
 * jurnalsiz yoki qo'riqchisiz qolardi ([[copy-paste-loses-a-branch]]).
 *
 * Tarix ham yangi jadvaldan emas — `audit_log` dan o'qiladi.
 */
@Injectable()
export class ManagerCustomersService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CounterpartyService) private readonly counterparties: CounterpartyService,
  ) {}

  /** Mijozlar ro'yxati + havza manzarasi (kim nechta mijozga javobgar). */
  async list(
    accountId: string,
    q: CustomerListQueryInput,
  ): Promise<{ rows: CustomerRow[]; distribution: CustomerDistribution }> {
    const where = {
      accountId,
      archived: false,
      // `unassigned` ustun turadi: ikkalasi berilsa «egasiz» so'raladi —
      // aks holda javob bo'sh bo'lardi va sabab ko'rinmasdi.
      ...(q.unassigned ? { ownerId: null } : q.ownerId ? { ownerId: q.ownerId } : {}),
      ...(q.search ? { name: { contains: q.search, mode: 'insensitive' as const } } : {}),
    };

    const [rows, all, owners] = await Promise.all([
      this.prisma.client.counterparty.findMany({
        where,
        select: {
          id: true,
          name: true,
          ownerId: true,
          phone: true,
          updatedAt: true,
          owner: { select: { name: true } },
        },
        orderBy: { name: 'asc' },
        take: q.limit ?? 100,
        skip: q.offset ?? 0,
      }),
      // Manzara HAR DOIM butun havza bo'yicha: filtrlangan ro'yxat ustidan
      // sanalsa, «egasiz 0 ta» degan yolg'on ko'rinardi.
      this.prisma.client.counterparty.findMany({
        where: { accountId, archived: false },
        select: { ownerId: true },
      }),
      this.prisma.client.employee.findMany({
        where: { accountId, archived: false },
        select: { id: true, name: true },
      }),
    ]);

    const summary = distributionSummary(all);
    const nameOf = new Map(owners.map((o) => [o.id, o.name]));

    return {
      rows: rows.map((r) => ({
        id: r.id,
        name: r.name,
        ownerId: r.ownerId,
        ownerName: r.owner?.name ?? null,
        phone: r.phone,
        updatedAt: r.updatedAt,
      })),
      distribution: {
        total: summary.total,
        unassigned: summary.unassigned,
        owners: [...summary.byOwner.entries()]
          .map(([ownerId, count]) => ({
            ownerId,
            name: nameOf.get(ownerId) ?? ownerId,
            count,
          }))
          .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
      },
    };
  }

  /**
   * Egalikni o'zgartirish. Tarix `bulkUpdate` ichida yoziladi — bu yerda
   * takrorlanmaydi.
   */
  async reassign(accountId: string, actorId: string, body: ReassignBodyInput) {
    return this.counterparties.bulkUpdate(accountId, actorId, {
      ids: body.counterpartyIds,
      patch: { ownerId: body.toOwnerId },
    });
  }

  /** Bitta mijozning egalik tarixi (eng yangisi tepada). */
  async ownerHistory(accountId: string, counterpartyId: string) {
    const rows = (await this.prisma.client.auditLog.findMany({
      where: { accountId, entity: 'Counterparty', entityId: counterpartyId },
      // `audit_log` da vaqt ustuni `at` (`createdAt` EMAS).
      select: { id: true, userId: true, action: true, at: true, fieldChanges: true },
      orderBy: { at: 'desc' },
      // Egalik o'zgarishi kam uchraydi, lekin xom jurnalda har tahrir bor —
      // shuning uchun kengroq oyna olinadi va filtr kodda bo'ladi.
      take: 200,
    })) as AuditRowLite[];

    const events = ownerChangeEvents(rows);
    const employeeIds = [
      ...new Set(
        events.flatMap((e) => [e.fromOwnerId, e.toOwnerId, e.actorId].filter(Boolean) as string[]),
      ),
    ];
    const people = employeeIds.length
      ? await this.prisma.client.employee.findMany({
          where: { accountId, id: { in: employeeIds } },
          select: { id: true, name: true },
        })
      : [];
    const nameOf = new Map(people.map((p) => [p.id, p.name]));

    return {
      counterpartyId,
      events: events.map((e) => ({
        id: e.id,
        at: e.at,
        actorId: e.actorId,
        actorName: e.actorId ? (nameOf.get(e.actorId) ?? null) : null,
        fromOwnerId: e.fromOwnerId,
        fromOwnerName: e.fromOwnerId ? (nameOf.get(e.fromOwnerId) ?? null) : null,
        toOwnerId: e.toOwnerId,
        toOwnerName: e.toOwnerId ? (nameOf.get(e.toOwnerId) ?? null) : null,
      })),
    };
  }
}
