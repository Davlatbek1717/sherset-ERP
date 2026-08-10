import type { Prisma } from '@moysklad/db';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
// Kassa TZ §9 — the audit-event shapes live with the rest of the cashier
// journal so every writer agrees on the payload.
import { planOutOfScheduleAuditEvent } from '../retail-sale/cashier-audit.js';
import {
  type CreateSmenaInput,
  CreateSmenaSchema,
  type OpenSessionFromSmenaInput,
  OpenSessionFromSmenaSchema,
  type UpdateSmenaInput,
  UpdateSmenaSchema,
} from './smena.schema.js';

/**
 * Berilgan instant Toshkent devor-vaqtida (UTC+5) startTime..endTime ichidami.
 *
 * NEGA epoch + qat'iy +5 soat: epoch TZ-agnostik, shuning uchun devor-vaqtni
 * olish uchun FAQAT kerakli offsetni qo'shish kifoya. Eski formuladagi
 * `- now.getTimezoneOffset()` a'zosi natijani host mintaqasiga bog'lab
 * qo'ygan edi: UTC+5 hostda +10 soat chiqib, kunduzgi 14:00 → 19:00 deb
 * o'qilardi («vaqtdan tashqari» yolg'oni, tunda esa teskarisi). `now`
 * parametri testlanish uchun — default hozirgi vaqt.
 */
export function isWithinShift(startTime: string, endTime: string, now: Date = new Date()): boolean {
  const local = new Date(now.getTime() + 5 * 60 * 60000); // Toshkent = UTC+5
  const hh = local.getUTCHours().toString().padStart(2, '0');
  const mm = local.getUTCMinutes().toString().padStart(2, '0');
  const current = `${hh}:${mm}`;

  if (startTime <= endTime) {
    return current >= startTime && current < endTime;
  }
  // overnight shift (e.g. 22:00–06:00)
  return current >= startTime || current < endTime;
}

@Injectable()
export class SmenaService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private readonly INCLUDE = {
    schedule: true,
    organization: { select: { id: true, name: true } },
    employees: { include: { employee: { select: { id: true, name: true } } } },
  } as const;

  async list(accountId: string) {
    return this.prisma.client.smena.findMany({
      where: { accountId, archived: false },
      include: this.INCLUDE,
      orderBy: { name: 'asc' },
    });
  }

  async findById(accountId: string, id: string) {
    const row = await this.prisma.client.smena.findFirst({
      where: { id, accountId },
      include: this.INCLUDE,
    });
    if (!row) throw new NotFoundException('Smena topilmadi');
    return row;
  }

  async create(accountId: string, raw: unknown) {
    const data = CreateSmenaSchema.parse(raw) as CreateSmenaInput;
    const { employeeIds, ...rest } = data;
    return this.prisma.client.smena.create({
      data: {
        accountId,
        ...rest,
        employees: {
          create: employeeIds.map((employeeId) => ({ employeeId })),
        },
      },
      include: this.INCLUDE,
    });
  }

  async update(accountId: string, id: string, raw: unknown) {
    await this.findById(accountId, id);
    const data = UpdateSmenaSchema.parse(raw) as UpdateSmenaInput;
    const { employeeIds, ...rest } = data;

    return this.prisma.client.$transaction(async (tx) => {
      if (employeeIds !== undefined) {
        await tx.smenaEmployee.deleteMany({ where: { smenaId: id } });
        await tx.smenaEmployee.createMany({
          data: employeeIds.map((employeeId) => ({ smenaId: id, employeeId })),
        });
      }
      return tx.smena.update({
        where: { id },
        data: rest,
        include: this.INCLUDE,
      });
    });
  }

  async remove(accountId: string, id: string) {
    await this.findById(accountId, id);
    await this.prisma.client.smena.update({ where: { id }, data: { archived: true } });
    return { ok: true };
  }

  /** Joriy xodimning faol smenasin topadi va vaqt ichida ekanini tekshiradi */
  async mine(accountId: string, employeeId: string) {
    const assignments = await this.prisma.client.smenaEmployee.findMany({
      where: { employeeId, smena: { accountId, archived: false } },
      include: {
        smena: {
          include: {
            schedule: true,
            organization: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (assignments.length === 0) return { smena: null, withinShift: false };

    // Xodimning birinchi (yagona) smenasini olish
    const smena = assignments[0]!.smena;
    const withinShift = isWithinShift(smena.schedule.startTime, smena.schedule.endTime);

    return { smena, withinShift };
  }

  /** Smena asosida CashierSession ochish */
  async openSessionFromSmena(accountId: string, cashierId: string, raw: unknown) {
    const input = OpenSessionFromSmenaSchema.parse(raw) as OpenSessionFromSmenaInput;

    const smena = await this.prisma.client.smena.findFirst({
      where: { id: input.smenaId, accountId, archived: false },
      include: { schedule: true },
    });
    if (!smena) throw new NotFoundException('Smena topilmadi');

    // Kassir shu smenaga BIRIKTIRILGAN bo'lishi shart. Aks holda istalgan
    // smena id'sini yuborib (masalan, vaqti hozirga to'g'ri keladigan begona
    // smenani tanlab) out-of-shift nazoratini butunlay chetlab o'tish mumkin
    // edi — sabab yozdirish majburiyati ishlamay qolardi.
    const membership = await this.prisma.client.smenaEmployee.findFirst({
      where: { smenaId: smena.id, employeeId: cashierId },
      // Jadval kompozit kalitli (`@@id([smenaId, employeeId])`) — `id` yo'q.
      select: { smenaId: true },
    });
    if (!membership) throw new BadRequestException('Siz bu smenaga biriktirilmagansiz');

    const withinShift = isWithinShift(smena.schedule.startTime, smena.schedule.endTime);
    if (!withinShift && !input.outOfShiftReason) {
      throw new BadRequestException('Smena vaqtidan tashqari — sabab yozish shart');
    }

    // Allaqachon ochiq sessiya bormi?
    const existing = await this.prisma.client.cashierSession.findFirst({
      where: { accountId, cashierId, state: 'open' },
    });
    if (existing) throw new BadRequestException('Allaqachon ochiq smena mavjud');

    // ── Kassa/ombor: climart sxemasi bilan ko'prik ────────────────────────────
    // Sherset'ning asl sxemasida `CashierSession` da `cashDeskId`/`storeId`
    // YO'Q edi, climart versiyasida esa ular MAJBURIY. /sotuv sahifasi ularni
    // yubormaydi (u faqat `smenaId` beradi) va sahifani 1:1 saqlash uchun
    // so'rovni o'zgartirmadik — shuning uchun server aniqlaydi:
    //   ombor — kassirning «Значения по умолчанию» dagi `defaultStoreId`,
    //           bo'lmasa hisobning eng eski arxivlanmagan ombori;
    //   kassa — hisobning eng eski arxivlanmagan kassasi (sxemada «asosiy
    //           kassa» tushunchasi umuman yo'q — bu ochiq qaror, egasi
    //           smenaga aniq kassa biriktirishni xohlashi mumkin).
    // Ikkalasi ham topilmasa smenani ochib bo'lmaydi — jim noto'g'ri kassaga
    // yozishdan ko'ra ochiq xato beramiz.
    // `UserSettings` xodim bo'yicha kalitlangan (`accountId` maydoni yo'q) —
    // ijara xavfsizligi quyida omborni `accountId` bilan tekshirish orqali.
    const userSettings = await this.prisma.client.userSettings.findUnique({
      where: { employeeId: cashierId },
      select: { defaultStoreId: true },
    });
    const store = userSettings?.defaultStoreId
      ? await this.prisma.client.store.findFirst({
          where: { id: userSettings.defaultStoreId, accountId, archived: false },
          select: { id: true },
        })
      : await this.prisma.client.store.findFirst({
          where: { accountId, archived: false },
          orderBy: { createdAt: 'asc' },
          select: { id: true },
        });
    if (!store) throw new BadRequestException('Ombor topilmadi — avval ombor yarating');

    const cashDesk = await this.prisma.client.cashDesk.findFirst({
      where: { accountId, archived: false },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!cashDesk) throw new BadRequestException('Kassa topilmadi — avval kassa yarating');

    // Kassa TZ §9 — smena vaqtdan TASHQARI ochilsa, sabab bilan birga audit
    // jurnaliga tushadi. Sabab `CashierSession` da ham saqlanadi, lekin u —
    // sessiyaning joriy holati; jurnal esa menejer «kim qancha marta vaqtdan
    // tashqari ochadi» deb so'raganda javob beradigan yagona manba (3-bo'lim).
    // Sessiya yaratish va hodisa yozish bitta tranzaksiyada: izsiz ochilgan
    // smena bo'lishi mumkin emas.
    //
    // try/catch NEGA kerak: yuqoridagi pre-check (139-qator atrofidagi
    // findFirst) parallel ikki ochilish poygasida ikkinchisini ushlamaydi —
    // ikkalasi ham «ochiq sessiya yo'q» ko'radi. Yakuniy hakam DB'dagi
    // partial-unique indeks (`cashier_sessions_open_per_cashier_idx`,
    // WHERE state='open'): u ikkinchisini P2002 bilan uradi. Xom P2002
    // mijozga 500 bo'lib chiqardi — asosiy `open()` naqshi bo'yicha 409
    // (ConflictException) ga o'giramiz.
    try {
      return await this.prisma.client.$transaction(async (tx) => {
        const session = await tx.cashierSession.create({
          data: {
            accountId,
            cashierId,
            cashDeskId: cashDesk.id,
            storeId: store.id,
            organizationId: smena.organizationId,
            smenaId: smena.id,
            outOfShiftReason: input.outOfShiftReason ?? null,
            // Sxema endi asosiy naqsh bo'yicha string beradi (manfiy rad
            // etilgan) — BigInt'ga bu yerda o'giriladi.
            openingCashMinor: BigInt(input.openingCashMinor),
            state: 'open',
          },
          include: {
            organization: { select: { id: true, name: true } },
          },
        });

        if (!withinShift && input.outOfShiftReason) {
          const event = planOutOfScheduleAuditEvent(session.id, {
            smenaId: smena.id,
            smenaName: smena.name,
            reason: input.outOfShiftReason,
          });
          await tx.cashierAuditEvent.create({
            data: {
              accountId,
              sessionId: session.id,
              employeeId: cashierId,
              type: event.type,
              docId: event.docId,
              payload: event.payload as Prisma.InputJsonValue,
            },
          });
        }

        return session;
      });
    } catch (e) {
      if (
        typeof e === 'object' &&
        e !== null &&
        'code' in e &&
        (e as { code: string }).code === 'P2002'
      ) {
        throw new ConflictException(
          'Allaqachon ochiq smena mavjud (parallel ochilish aniqlandi). Avval uni yoping.',
        );
      }
      throw e;
    }
  }
}
