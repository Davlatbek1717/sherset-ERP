import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../../prisma/prisma.service.js';
import { POS_PIN_MAX_ATTEMPTS, isValidPosPin } from './kiosk-policy.js';

/**
 * POS PIN-qulf (kassa TZ §3.2).
 *
 * NEGA QAYTA LOGIN EMAS: 5 daqiqa harakatsizlikdan keyin ekran qulflanadi va
 * PIN bilan qaytiladi. To'liq chiqish savatni yo'qotardi — kassir mijoz
 * oldida hamma narsani qaytadan terishga majbur bo'lardi va qulfni
 * o'chirishga urinardi.
 *
 * NEGA UMUMAN KERAK: «erkin kassir» modelida (Q4/Q8/Q10/Q11 — narx, qarz,
 * xarajat, qaytarish erkin) asosiy xavf — **kassir hisobidan boshqa odamning
 * sotuvi**. Audit jurnali kim qilganini yozadi, lekin hisob egasi ochiq
 * qolgan bo'lsa jurnal noto'g'ri odamni ko'rsatadi.
 *
 * Xesh `argon2` bilan — loyihadagi parol xeshi bilan bir xil (`auth.service`).
 * TZ'da `bcrypt` yozilgan edi; bu yerda mavjud kutubxona ishlatildi, chunki
 * ikkinchi xesh kutubxonasini olib kirish yutuqsiz xarajat.
 */
@Injectable()
export class PosPinService {
  private readonly logger = new Logger(PosPinService.name);

  /**
   * Ketma-ket noto'g'ri urinishlar — xotirada (jarayon bo'yicha).
   *
   * Bazaga yozilmaydi: qulf **sessiya davomiyligidagi** himoya, doimiy
   * hisob bloki emas (uning uchun `failedLoginAttempts` bor). Server qayta
   * ishga tushsa hisoblagich nolga tushadi — bu qabul qilingan murosaga:
   * doimiylik uchun har urinishda DB yozish kassa tezligiga tegardi.
   */
  private readonly attempts = new Map<string, number>();

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** PIN o'rnatish yoki almashtirish. */
  async setPin(accountId: string, employeeId: string, pin: string): Promise<{ ok: true }> {
    if (!isValidPosPin(pin)) {
      throw new BadRequestException('PIN 4–6 raqamdan iborat bo`lishi kerak');
    }
    const employee = await this.prisma.client.employee.findFirst({
      where: { id: employeeId, accountId },
      select: { id: true },
    });
    if (!employee) throw new BadRequestException('Xodim topilmadi');

    await this.prisma.client.employee.update({
      where: { id: employeeId },
      data: { posPinHash: await argon2.hash(pin) },
    });
    this.attempts.delete(employeeId);
    return { ok: true };
  }

  /** PIN o'rnatilganmi — FE qulfni ko'rsatish/ko'rsatmaslikni shundan biladi. */
  async hasPin(accountId: string, employeeId: string): Promise<{ hasPin: boolean }> {
    const row = await this.prisma.client.employee.findFirst({
      where: { id: employeeId, accountId },
      select: { posPinHash: true },
    });
    return { hasPin: !!row?.posPinHash };
  }

  /**
   * Qulfni ochish. Noto'g'ri PIN `POS_PIN_MAX_ATTEMPTS` marta ketma-ket
   * kiritilsa — `lockout: true` qaytadi va FE **to'liq chiqaradi**
   * (+ menejerga xabar; xabar yuborish 4M.5 ogohlantirish navbatiga ulanadi).
   */
  async verifyPin(
    accountId: string,
    employeeId: string,
    pin: string,
  ): Promise<{ ok: true; remaining: null }> {
    const row = await this.prisma.client.employee.findFirst({
      where: { id: employeeId, accountId },
      select: { posPinHash: true },
    });
    if (!row?.posPinHash) {
      throw new BadRequestException('PIN o`rnatilmagan');
    }

    const valid = await argon2.verify(row.posPinHash, pin).catch(() => false);
    if (valid) {
      this.attempts.delete(employeeId);
      return { ok: true, remaining: null };
    }

    const used = (this.attempts.get(employeeId) ?? 0) + 1;
    this.attempts.set(employeeId, used);
    const remaining = POS_PIN_MAX_ATTEMPTS - used;

    if (remaining <= 0) {
      this.attempts.delete(employeeId);
      this.logger.warn(`POS PIN: ${employeeId} — ${POS_PIN_MAX_ATTEMPTS} xato, sessiya yopiladi`);
      // 401 = FE uchun «to'liq chiqar» signali (403 «ruxsat yo'q» degani
      // bo'lardi va FE qulf ekranida qolib ketardi).
      throw new UnauthorizedException({
        message: 'Ko`p marta xato — tizimdan chiqarildingiz',
        lockout: true,
      });
    }

    throw new UnauthorizedException({ message: 'PIN noto`g`ri', remaining });
  }
}
