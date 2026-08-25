import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../../prisma/prisma.service.js';
import { POS_DEVICE_LOCKOUT_MS, POS_DEVICE_MAX_ATTEMPTS } from './pos-device.service.js';

/**
 * TSD qurilmasi — omborchining qo'l terminali (G-reja G5).
 *
 * `PosDeviceService` bilan bir xil xavfsizlik naqshi (argon2 kalit, bazadagi
 * qulf, bir xil 401 xabari), lekin O'Z jadvali ustida ishlaydi. Nega alohida
 * jadval — `schema.prisma` dagi `TsdDevice` izohi (qisqasi: kassa qurilmasida
 * `cash_desk_id` NOT NULL, TSD da kassa yo'q; va TSD kaliti kassa smenasini
 * TUZILMAVIY ravishda ocholmasin).
 *
 * Chegara qiymatlari (`POS_DEVICE_MAX_ATTEMPTS`, `POS_DEVICE_LOCKOUT_MS`)
 * ATAYLAB import qilinadi, nusxalanmaydi: ikkita qurilma sirtining qulf
 * siyosati bir kun jimgina ajralib ketmasin.
 */
@Injectable()
export class TsdDeviceService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Terminalni omborga bog'lash.
   *
   * Kalit FAQAT shu javobda ko'rinadi — bazada argon2 xeshi qoladi. Kalit
   * yo'qolsa qurilma qayta juftlanadi (eskisi `revokedAt` bilan yopiladi).
   */
  async pair(
    accountId: string,
    pairedById: string,
    input: { name: string; storeId: string },
  ): Promise<{ deviceId: string; deviceSecret: string; name: string; storeId: string }> {
    // Tenant chegarasi. `pos_devices` da `store_id` uchun FK YO'Q (tarixiy),
    // ya'ni begona akkauntning ombor ID'sini yozib qo'yish mumkin bo'lardi va
    // terminal o'zga akkaunt omborida «ishlayotgandek» ko'rinardi. TSD da bu
    // yo'l boshidanoq yopiladi.
    const store = await this.prisma.client.store.findFirst({
      where: { id: input.storeId, accountId, archived: false },
      select: { id: true },
    });
    if (!store) throw new BadRequestException('Ombor topilmadi');

    const deviceSecret = randomBytes(32).toString('hex'); // 256 bit
    const created = await this.prisma.client.tsdDevice.create({
      data: {
        accountId,
        name: input.name,
        storeId: input.storeId,
        secretHash: await argon2.hash(deviceSecret),
        pairedById,
      },
      select: { id: true, name: true, storeId: true },
    });
    return {
      deviceId: created.id,
      deviceSecret,
      name: created.name,
      storeId: created.storeId,
    };
  }

  /**
   * Qurilmani tanish. Xato holatlar ATAYLAB bir xil 401 beradi (qurilma yo'q /
   * bekor qilingan / kalit noto'g'ri) — farqli xabar qurilma identifikatorlarini
   * sanab chiqishga yo'l ochardi. Faqat QULF holati ajratiladi (423), chunki
   * omborchiga «qancha kutish kerak» deb aytish kerak.
   */
  async verify(deviceId: string, deviceSecret: string): Promise<TsdDeviceContext> {
    const row = await this.prisma.client.tsdDevice.findUnique({ where: { id: deviceId } });

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
      name: row.name,
    };
  }

  /**
   * Sessiya davom etishi mumkinmi (refresh yo'li uchun).
   *
   * KALIT SO'RALMAYDI — bu qayta autentifikatsiya emas, terminal HALI HAM
   * haqiqiy ekanini tekshirish. Admin qurilmani bekor qilsa (`revokedAt`)
   * uning ochiq sessiyasi keyingi refresh'da o'ladi; `null` qaytsa
   * `auth.service.refresh` 401 beradi.
   */
  async loadActive(deviceId: string): Promise<TsdDeviceContext | null> {
    const row = await this.prisma.client.tsdDevice.findUnique({ where: { id: deviceId } });
    if (!row || row.revokedAt) return null;
    return { id: row.id, accountId: row.accountId, storeId: row.storeId, name: row.name };
  }

  /** Noto'g'ri PIN/kalit urinishi — hisoblagich BAZADA (`PosDeviceService` izohi). */
  async registerFailure(deviceId: string): Promise<void> {
    const row = await this.prisma.client.tsdDevice.findUnique({
      where: { id: deviceId },
      select: { failedAttempts: true },
    });
    if (!row) return;

    const attempts = row.failedAttempts + 1;
    const locked = attempts >= POS_DEVICE_MAX_ATTEMPTS;
    await this.prisma.client.tsdDevice.update({
      where: { id: deviceId },
      data: {
        // Qulflanganda hisoblagich nolga tushadi — qulf muddati tugagach
        // omborchi yana to'liq urinishlarga ega bo'ladi.
        failedAttempts: locked ? 0 : attempts,
        lockedUntil: locked ? new Date(Date.now() + POS_DEVICE_LOCKOUT_MS) : null,
      },
    });
  }

  /**
   * @param appVersion APK versiyasi. `undefined` bo'lsa ustun TEGILMAYDI —
   *   versiya yubormagan klient reyestrni o'chirib yubormasin (K07 naqshi).
   */
  async registerSuccess(deviceId: string, appVersion?: string): Promise<void> {
    await this.prisma.client.tsdDevice.update({
      where: { id: deviceId },
      data: {
        failedAttempts: 0,
        lockedUntil: null,
        lastSeenAt: new Date(),
        ...(appVersion ? { appVersion } : {}),
      },
    });
  }
}

export interface TsdDeviceContext {
  id: string;
  accountId: string;
  storeId: string;
  name: string;
}
