import { randomBytes } from 'node:crypto';
import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../../prisma/prisma.service.js';

/**
 * Kassa qurilmasi — PIN-only kirishning IKKINCHI omili.
 *
 * NEGA: PIN'da foydalanuvchi nomi yo'q (4 raqam = 10 000 variant). Qurilma
 * kaliti bo'lmasa ochiq internetdan har kim PIN tera olardi. Kalit kassa
 * kompyuterida DPAPI bilan shifrlangan holda yotadi ⇒ hujum uchun avval
 * jismoniy kirish kerak bo'ladi.
 */
@Injectable()
export class PosDeviceService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Qurilmani do'kon/kassa/tashkilotga bog'lash.
   *
   * Kalit FAQAT shu javobda ko'rinadi — bazada argon2 xeshi qoladi, ya'ni
   * keyinchalik uni tiklab bo'lmaydi. Kalit yo'qolsa qurilma qayta juftlanadi.
   */
  async pair(
    accountId: string,
    pairedById: string,
    input: { name: string; storeId: string; cashDeskId: string; organizationId: string },
  ): Promise<{ deviceId: string; deviceSecret: string; name: string }> {
    const deviceSecret = randomBytes(32).toString('hex'); // 256 bit
    const created = await this.prisma.client.posDevice.create({
      data: {
        accountId,
        name: input.name,
        storeId: input.storeId,
        cashDeskId: input.cashDeskId,
        organizationId: input.organizationId,
        secretHash: await argon2.hash(deviceSecret),
        pairedById,
      },
      select: { id: true, name: true },
    });
    return { deviceId: created.id, deviceSecret, name: created.name };
  }

  /**
   * Qurilmani tanish. Xato holatlar ATAYLAB bir xil 401 beradi (qurilma yo'q /
   * bekor qilingan / kalit noto'g'ri) — farqli xabar qurilma identifikatorlarini
   * sanab chiqishga yo'l ochardi. Faqat QULF holati ajratiladi (423), chunki
   * kassirga «qancha kutish kerak» deb aytish kerak.
   */
  async verify(deviceId: string, deviceSecret: string): Promise<PosDeviceContext> {
    const row = await this.prisma.client.posDevice.findUnique({ where: { id: deviceId } });

    if (!row || row.revokedAt) {
      throw new UnauthorizedException('Qurilma tanilmadi');
    }

    if (row.lockedUntil && row.lockedUntil > new Date()) {
      const remaining = Math.ceil((row.lockedUntil.getTime() - Date.now()) / 60_000);
      throw new HttpException(
        `Qurilma vaqtincha qulflangan (${remaining} daqiqa qoldi)`,
        HttpStatus.LOCKED,
      );
    }

    const ok = await argon2.verify(row.secretHash, deviceSecret).catch(() => false);
    if (!ok) throw new UnauthorizedException('Qurilma tanilmadi');

    return {
      id: row.id,
      accountId: row.accountId,
      storeId: row.storeId,
      cashDeskId: row.cashDeskId,
      organizationId: row.organizationId,
      name: row.name,
    };
  }

  /**
   * Noto'g'ri PIN/kalit urinishi.
   *
   * Hisoblagich BAZADA (xodimniki `pos-pin.service.ts` da ataylab xotirada):
   * qurilma qulfi API qayta ishga tushganda yo'qolmasligi kerak, aks holda
   * qulfni restart bilan aylanib o'tish mumkin bo'lardi.
   */
  async registerFailure(deviceId: string): Promise<void> {
    const row = await this.prisma.client.posDevice.findUnique({
      where: { id: deviceId },
      select: { failedAttempts: true },
    });
    if (!row) return;

    const attempts = row.failedAttempts + 1;
    const locked = attempts >= POS_DEVICE_MAX_ATTEMPTS;
    await this.prisma.client.posDevice.update({
      where: { id: deviceId },
      data: {
        // Qulflanganda hisoblagich nolga tushadi — qulf muddati tugagach
        // kassir yana to'liq urinishlarga ega bo'ladi.
        failedAttempts: locked ? 0 : attempts,
        lockedUntil: locked ? new Date(Date.now() + POS_DEVICE_LOCKOUT_MS) : null,
      },
    });
  }

  /**
   * @param shellVersion Electron qobig'i versiyasi. `undefined` bo'lsa ustun
   *   TEGILMAYDI — brauzerdan kirish reyestrni o'chirib yubormasin (K07).
   */
  async registerSuccess(deviceId: string, shellVersion?: string): Promise<void> {
    await this.prisma.client.posDevice.update({
      where: { id: deviceId },
      data: {
        failedAttempts: 0,
        lockedUntil: null,
        lastSeenAt: new Date(),
        ...(shellVersion ? { shellVersion } : {}),
      },
    });
  }
}

export interface PosDeviceContext {
  id: string;
  accountId: string;
  storeId: string;
  cashDeskId: string;
  organizationId: string;
  name: string;
}

/** Ketma-ket xato chegarasi — shundan keyin qurilma qulflanadi. */
export const POS_DEVICE_MAX_ATTEMPTS = 5;

/** Qulf davomiyligi. Parol-login lockout'i bilan bir xil (15 daqiqa). */
export const POS_DEVICE_LOCKOUT_MS = 15 * 60 * 1000;
