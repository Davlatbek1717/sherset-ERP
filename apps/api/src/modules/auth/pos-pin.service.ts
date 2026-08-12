import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { PrismaService } from '../../prisma/prisma.service.js';
import { POS_PIN_MAX_ATTEMPTS, isValidPosPin } from './kiosk-policy.js';
import { posPinLookupHash, resolvePosPinPepper } from './pos-pin-lookup.js';

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

  /**
   * `posPinLookup` uchun HMAC kaliti. Boot'da hal qilinadi: prod'da sir yo'q
   * bo'lsa API ko'tarilmaydi — jim ishlab, keyin hamma PIN'ni yaroqsiz
   * qilishdan ko'ra baland ovozda yiqilgan yaxshi.
   */
  private readonly pepper: string;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) config: ConfigService,
  ) {
    this.pepper = resolvePosPinPepper(config.get<string>('POS_PIN_PEPPER'), process.env.NODE_ENV);
  }

  /** PIN o'rnatish yoki almashtirish. */
  async setPin(accountId: string, employeeId: string, pin: string): Promise<{ ok: true }> {
    if (!isValidPosPin(pin)) {
      throw new BadRequestException('PIN 4 raqamdan iborat bo`lishi kerak');
    }
    const employee = await this.prisma.client.employee.findFirst({
      where: { id: employeeId, accountId },
      select: { id: true },
    });
    if (!employee) throw new BadRequestException('Xodim topilmadi');

    try {
      await this.prisma.client.employee.update({
        where: { id: employeeId },
        data: {
          posPinHash: await argon2.hash(pin),
          // Ikkala ustun BIRGA yoziladi. Biri yozilib ikkinchisi qolsa kirish
          // jimgina ishlamay qolardi: lookup topmaydi yoki xesh mos kelmaydi.
          posPinLookup: posPinLookupHash(pin, this.pepper),
        },
      });
    } catch (err) {
      // Unique(account_id, pos_pin_lookup) — bu PIN allaqachon boshqa xodimda.
      // Faqat SHU xatoni tarjima qilamiz; qolganini yutib yuborish haqiqiy
      // nosozlikni yashirardi.
      if ((err as { code?: string }).code === 'P2002') {
        throw new BadRequestException('Bu PIN band — boshqa PIN tanlang');
      }
      throw err;
    }
    this.attempts.delete(employeeId);
    return { ok: true };
  }

  /** PIN'ni olib tashlash — kirish ham, idle-qulf ham o'chadi. */
  async clearPin(accountId: string, employeeId: string): Promise<{ ok: true }> {
    const employee = await this.prisma.client.employee.findFirst({
      where: { id: employeeId, accountId },
      select: { id: true },
    });
    if (!employee) throw new BadRequestException('Xodim topilmadi');

    await this.prisma.client.employee.update({
      where: { id: employeeId },
      data: { posPinHash: null, posPinLookup: null },
    });
    this.attempts.delete(employeeId);
    return { ok: true };
  }

  /**
   * PIN bo'yicha xodimni topish va TASDIQLASH — PIN-only kirish (kassa .exe).
   *
   * 🔴 `accountId` MAJBURIY. Unique cheklov `[accountId, posPinLookup]` — ya'ni
   * bir xil PIN ikki xil akkauntda bo'lishi MUMKIN, pepper esa global, demak
   * ularning `posPinLookup` qiymati aynan bir xil. Akkaunt filtrisiz
   * `findFirst` tartibsiz begona qatorni qaytarib, haqiqiy kassirni O'Z
   * qurilmasidan bloklardi (5 urinishdan keyin qurilma 15 daqiqaga qulflanadi)
   * — hujumchisiz, faqat ikki ijarachi bir xil PIN tanlagani uchun.
   * Qurilma yozuvi akkauntni allaqachon biladi — chaqiruvchi shuni uzatadi.
   *
   * Ikki bosqich (sxema shartnomasi, `schema.prisma` `posPinLookup` izohi):
   * lookup (HMAC) TOPADI — indeks bo'yicha O(1); `posPinHash` (argon2)
   * TASDIQLAYDI. Argon2'siz butun kirish bitta tuzsiz keyed-hash'ga tayanardi
   * va HMAC to'qnashuvi noto'g'ri odamni kiritardi.
   */
  async findByPin(accountId: string, pin: string): Promise<{ employeeId: string } | null> {
    const row = await this.prisma.client.employee.findFirst({
      where: { accountId, posPinLookup: posPinLookupHash(pin, this.pepper), archived: false },
      select: { id: true, posPinHash: true },
    });
    if (!row?.posPinHash) return null;

    const valid = await argon2.verify(row.posPinHash, pin).catch(() => false);
    return valid ? { employeeId: row.id } : null;
  }

  /**
   * PIN bo'yicha xodimni AKKAUNTSIZ topish — qurilmasiz kirish (2026-08-11).
   *
   * `findByPin` akkauntni qurilmadan olardi. Juftlash olib tashlangach akkauntni
   * ko'rsatadigan narsa qolmadi, shuning uchun qidiruv global.
   *
   * 🔴 IKKI XIL MOSLIK = RAD ETISH. Unique cheklov `[accountId, posPinLookup]` —
   * ya'ni ikki ijarachida bir xil PIN bo'lishi MUMKIN va pepper global, demak
   * ularning lookup qiymati aynan bir xil chiqadi. `findFirst` tartibsiz birini
   * qaytarib, BEGONA odamni kiritib yuborardi. Noaniqlikda kiritmaymiz.
   */
  async findByPinAnyAccount(pin: string): Promise<{ employeeId: string } | null> {
    const rows = await this.prisma.client.employee.findMany({
      where: { posPinLookup: posPinLookupHash(pin, this.pepper), archived: false },
      select: { id: true, posPinHash: true },
      take: 2,
    });
    if (rows.length !== 1) return null;

    const row = rows[0];
    if (!row?.posPinHash) return null;
    const valid = await argon2.verify(row.posPinHash, pin).catch(() => false);
    return valid ? { employeeId: row.id } : null;
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
