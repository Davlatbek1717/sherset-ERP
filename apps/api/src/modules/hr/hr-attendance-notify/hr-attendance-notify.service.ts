import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import type { UpsertNotifyConfigInput } from './hr-attendance-notify.schema.js';

/**
 * Serialized config DTO — `lateFineAmountMinor` is a string (tiyin) so a
 * BigInt never crosses the JSON boundary. Mirrors HrAttendanceNotifyConfig.
 */
export interface NotifyConfigDto {
  id: string | null;
  enabled: boolean;
  notifyCheckIn: boolean;
  notifyCheckOut: boolean;
  directorSlot: number | null;
  lateFineEnabled: boolean;
  lateThresholdMin: number;
  lateFineAmountMinor: string;
  lateFinePerMinute: boolean;
}

/** Shape of the sendTest result. */
export interface SendTestResult {
  ok: boolean;
  reason?: 'no_director_slot' | 'not_wired';
}

const DEFAULT_CONFIG: Omit<NotifyConfigDto, 'id'> = {
  enabled: false,
  notifyCheckIn: true,
  notifyCheckOut: true,
  directorSlot: null,
  lateFineEnabled: false,
  lateThresholdMin: 15,
  lateFineAmountMinor: '0',
  lateFinePerMinute: false,
};

interface NotifyConfigRow {
  id: string;
  enabled: boolean;
  notifyCheckIn: boolean;
  notifyCheckOut: boolean;
  directorSlot: number | null;
  lateFineEnabled: boolean;
  lateThresholdMin: number;
  lateFineAmountMinor: bigint;
  lateFinePerMinute: boolean;
}

function serialize(row: NotifyConfigRow): NotifyConfigDto {
  return {
    id: row.id,
    enabled: row.enabled,
    notifyCheckIn: row.notifyCheckIn,
    notifyCheckOut: row.notifyCheckOut,
    directorSlot: row.directorSlot,
    lateFineEnabled: row.lateFineEnabled,
    lateThresholdMin: row.lateThresholdMin,
    lateFineAmountMinor: row.lateFineAmountMinor.toString(),
    lateFinePerMinute: row.lateFinePerMinute,
  };
}

/**
 * Davomat → Telegram bildirishnoma config CRUD (akkаunt bo'yicha bitta).
 * `getConfig` yo'q bo'lsa in-memory default qaytaradi (UI to'g'ri ko'rsatadi);
 * `upsertConfig` accountId bo'yicha upsert (dublikat yo'q); `sendTest` —
 * darhol 'me'ga test outbox qatori qo'yadi (director slot sozlangан bo'lsa).
 */
@Injectable()
export class HrAttendanceNotifyService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** Returns the account's config, or an in-memory default (id=null) if none. */
  async getConfig(accountId: string): Promise<NotifyConfigDto> {
    const row = await this.prisma.client.hrAttendanceNotifyConfig.findUnique({
      where: { accountId },
    });
    if (!row) return { id: null, ...DEFAULT_CONFIG };
    return serialize(row as NotifyConfigRow);
  }

  /** Create-or-update the single per-account config (partial upsert). */
  async upsertConfig(accountId: string, dto: UpsertNotifyConfigInput): Promise<NotifyConfigDto> {
    const amount =
      dto.lateFineAmountMinor !== undefined ? BigInt(dto.lateFineAmountMinor) : undefined;
    // Fields present in the DTO drive both create + update; absent fields keep
    // their schema default (create) or current value (update).
    const writable = {
      ...(dto.enabled !== undefined && { enabled: dto.enabled }),
      ...(dto.notifyCheckIn !== undefined && { notifyCheckIn: dto.notifyCheckIn }),
      ...(dto.notifyCheckOut !== undefined && { notifyCheckOut: dto.notifyCheckOut }),
      ...(dto.directorSlot !== undefined && { directorSlot: dto.directorSlot }),
      ...(dto.lateFineEnabled !== undefined && { lateFineEnabled: dto.lateFineEnabled }),
      ...(dto.lateThresholdMin !== undefined && { lateThresholdMin: dto.lateThresholdMin }),
      ...(amount !== undefined && { lateFineAmountMinor: amount }),
      ...(dto.lateFinePerMinute !== undefined && { lateFinePerMinute: dto.lateFinePerMinute }),
    };
    const row = await this.prisma.client.hrAttendanceNotifyConfig.upsert({
      where: { accountId },
      create: { accountId, ...writable },
      update: writable,
    });
    return serialize(row as NotifyConfigRow);
  }

  /**
   * Test-send — wired in Task 9. Stub for now so the controller endpoint
   * exists; returns `not_wired` until the self outbox enqueue is added.
   */
  async sendTest(_accountId: string): Promise<SendTestResult> {
    return { ok: false, reason: 'not_wired' };
  }
}
