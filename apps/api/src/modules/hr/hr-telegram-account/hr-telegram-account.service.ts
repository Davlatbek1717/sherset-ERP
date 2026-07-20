import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { encryptHrSession } from '../hr-shared/crypto.util.js';
import { normalizeTelegramPhone } from '../hr-shared/phone-normalize.util.js';
import type { CreateHrTelegramAccountInput } from './hr-telegram-account.schema.js';

/**
 * Public-shape DTO returned to the admin web. Encrypted blobs (apiHash,
 * session) are NEVER surfaced — only metadata + connection state.
 */
export interface HrTelegramAccountDto {
  id: string;
  slot: number;
  phoneNumber: string;
  apiId: number;
  hasSession: boolean;
  isActive: boolean;
  lastConnectedAt: Date | null;
  floodWaitUntil: Date | null;
  createdAt: Date;
}

@Injectable()
export class HrTelegramAccountService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(accountId: string): Promise<HrTelegramAccountDto[]> {
    const rows = await this.prisma.client.hrTelegramAccount.findMany({
      where: { accountId },
      orderBy: { slot: 'asc' },
    });
    return rows.map(toDto);
  }

  async findOne(accountId: string, id: string): Promise<HrTelegramAccountDto> {
    const row = await this.prisma.client.hrTelegramAccount.findFirst({
      where: { id, accountId },
    });
    if (!row) throw new NotFoundException('Telegram akkaunt topilmadi');
    return toDto(row);
  }

  /** Internal: needed by login wizard + adapter — returns encrypted blobs intact. */
  async findInternal(accountId: string, id: string) {
    const row = await this.prisma.client.hrTelegramAccount.findFirst({
      where: { id, accountId },
    });
    if (!row) throw new NotFoundException('Telegram akkaunt topilmadi');
    return row;
  }

  /** Look up the active account for a given slot. Used by the adapter on send. */
  async findActiveBySlot(accountId: string, slot: number) {
    return this.prisma.client.hrTelegramAccount.findFirst({
      where: { accountId, slot, isActive: true },
    });
  }

  async create(
    accountId: string,
    input: CreateHrTelegramAccountInput,
  ): Promise<HrTelegramAccountDto> {
    // Phone normalization mirrors employee handling — keeps the API
    // surface consistent and prevents subtle "+998 / 998" duplicates.
    let normalizedPhone: string;
    try {
      const p = normalizeTelegramPhone(input.phoneNumber);
      if (!p) throw new Error("Bo'sh telefon raqami");
      normalizedPhone = p;
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }

    // Unique (accountId, slot) — Prisma will throw P2002 too, but we
    // pre-check for a cleaner error message.
    const existing = await this.prisma.client.hrTelegramAccount.findFirst({
      where: { accountId, slot: input.slot },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(`Slot ${input.slot} band — avval mavjudini o'chiring`);
    }

    const apiHashEncrypted = encryptHrSession(input.apiHash);

    const row = await this.prisma.client.hrTelegramAccount.create({
      data: {
        accountId,
        slot: input.slot,
        phoneNumber: normalizedPhone,
        apiId: input.apiId,
        apiHashEncrypted,
        sessionEncrypted: null,
        isActive: false, // OTP login wizard activates after session persisted
      },
    });
    return toDto(row);
  }

  /**
   * Soddalashtirilgan ulash — foydalanuvchi FAQAT telefonini beradi; apiId/
   * apiHash serverning env'idan (ikkala slot ham BIR XIL ilova kalitini
   * ishlatadi — faqat telefon raqami farq qiladi). `slot` 1 (asosiy) yoki 2
   * (zaxira — worker'ning failover mantig'i shuni kutadi, mtproto-worker.
   * service.ts:SLOTS = [1,2]). Mavjud bo'lsa telefonni yangilaydi (raqam
   * o'zgarsa sessiya bekor bo'ladi — boshqa raqamning sessiyasi ishlamaydi).
   * So'ng chaqiruvchi odatiy login/start → code oqimini yuritadi.
   *
   * 2026-07-20: ilgari FAQAT slot 1'ga cheklangan edi (soddalashtirish uchun,
   * "profil qo'shish shart bo'lmasin" talabiga ko'ra) — lekin bitta raqam
   * Telegram flood-wait'ga uchraganda (contacts.GetContacts, ko'p yangi
   * mijozga qisqa vaqtda yozganda 1-2+ soatga bloklanadi) hech qanday zaxira
   * bo'lmagani aniqlandi. Endi ikkinchi (zaxira) raqamni ham shu oddiy oqim
   * bilan ulash mumkin.
   */
  async connectSlot(
    accountId: string,
    slot: 1 | 2,
    phoneNumber: string,
  ): Promise<HrTelegramAccountDto> {
    const apiIdRaw = process.env.TELEGRAM_API_ID;
    const apiHash = process.env.TELEGRAM_API_HASH;
    const apiId = Number(apiIdRaw);
    if (!apiIdRaw || !apiHash || !Number.isInteger(apiId) || apiId <= 0 || apiHash.length < 20) {
      throw new BadRequestException(
        'Server Telegram sozlanmagan (TELEGRAM_API_ID / TELEGRAM_API_HASH) — administrator sozlashi kerak',
      );
    }

    let normalizedPhone: string;
    try {
      const p = normalizeTelegramPhone(phoneNumber);
      if (!p) throw new Error("Bo'sh telefon raqami");
      normalizedPhone = p;
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }

    const apiHashEncrypted = encryptHrSession(apiHash);
    const existing = await this.prisma.client.hrTelegramAccount.findFirst({
      where: { accountId, slot },
    });

    if (existing) {
      const phoneChanged = existing.phoneNumber !== normalizedPhone;
      const updated = await this.prisma.client.hrTelegramAccount.update({
        where: { id: existing.id },
        data: {
          phoneNumber: normalizedPhone,
          apiId,
          apiHashEncrypted,
          // Raqam o'zgargan bo'lsa eski sessiya endi mos emas — tozalaymiz.
          ...(phoneChanged ? { sessionEncrypted: null, isActive: false } : {}),
        },
      });
      return toDto(updated);
    }

    const row = await this.prisma.client.hrTelegramAccount.create({
      data: {
        accountId,
        slot,
        phoneNumber: normalizedPhone,
        apiId,
        apiHashEncrypted,
        sessionEncrypted: null,
        isActive: false,
      },
    });
    return toDto(row);
  }

  async setActive(accountId: string, id: string, isActive: boolean): Promise<HrTelegramAccountDto> {
    const row = await this.findInternal(accountId, id);
    if (isActive && !row.sessionEncrypted) {
      throw new BadRequestException("Sessiya yo'q — avval OTP orqali kirish kerak (login wizard)");
    }
    const updated = await this.prisma.client.hrTelegramAccount.update({
      where: { id },
      data: { isActive },
    });
    return toDto(updated);
  }

  async remove(accountId: string, id: string): Promise<{ ok: true }> {
    await this.findInternal(accountId, id);
    // Cascade also drops HrTelegramSession rows for this account+slot via
    // FK (no direct constraint — accountSlot is logical; manual cleanup).
    const row = await this.prisma.client.hrTelegramAccount.findFirst({
      where: { id, accountId },
      select: { slot: true },
    });
    if (row) {
      await this.prisma.client.hrTelegramSession.deleteMany({
        where: { accountId, accountSlot: row.slot },
      });
    }
    await this.prisma.client.hrTelegramAccount.delete({ where: { id } });
    return { ok: true };
  }

  // ─── flood-wait persistence (called by adapter on FLOOD_WAIT) ────────

  async setFloodWaitUntil(accountId: string, slot: number, until: Date): Promise<void> {
    await this.prisma.client.hrTelegramAccount.updateMany({
      where: { accountId, slot },
      data: { floodWaitUntil: until },
    });
  }

  async clearFloodWait(accountId: string, slot: number): Promise<void> {
    await this.prisma.client.hrTelegramAccount.updateMany({
      where: { accountId, slot },
      data: { floodWaitUntil: null },
    });
  }

  /** True iff the slot is currently inside a flood-wait window. */
  async isFlooded(accountId: string, slot: number, now: Date = new Date()): Promise<boolean> {
    const row = await this.prisma.client.hrTelegramAccount.findFirst({
      where: { accountId, slot },
      select: { floodWaitUntil: true },
    });
    if (!row?.floodWaitUntil) return false;
    return row.floodWaitUntil.getTime() > now.getTime();
  }

  // ─── session persistence (called by login wizard on success) ─────────

  async persistSession(
    accountId: string,
    id: string,
    sessionString: string,
  ): Promise<HrTelegramAccountDto> {
    await this.findInternal(accountId, id);
    const encrypted = encryptHrSession(sessionString);
    const updated = await this.prisma.client.hrTelegramAccount.update({
      where: { id },
      data: {
        sessionEncrypted: encrypted,
        isActive: true, // first successful login auto-activates
        lastConnectedAt: new Date(),
        floodWaitUntil: null,
      },
    });
    return toDto(updated);
  }
}

function toDto(row: {
  id: string;
  slot: number;
  phoneNumber: string;
  apiId: number;
  sessionEncrypted: string | null;
  isActive: boolean;
  lastConnectedAt: Date | null;
  floodWaitUntil: Date | null;
  createdAt: Date;
}): HrTelegramAccountDto {
  return {
    id: row.id,
    slot: row.slot,
    phoneNumber: row.phoneNumber,
    apiId: row.apiId,
    hasSession: !!row.sessionEncrypted,
    isActive: row.isActive,
    lastConnectedAt: row.lastConnectedAt,
    floodWaitUntil: row.floodWaitUntil,
    createdAt: row.createdAt,
  };
}
