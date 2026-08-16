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
// P4 — «allaqachon ochiq smena» xabari ikki yo'lda ham BITTA matn.
import { describeShiftAge, formatOpenShiftConflict } from '../cashier-session/stale-shift.js';
import { planOutOfScheduleAuditEvent } from '../retail-sale/cashier-audit.js';
import {
  type CreateSmenaInput,
  CreateSmenaSchema,
  type OpenSessionFromSmenaInput,
  OpenSessionFromSmenaSchema,
  type SetEmployeeSmenasInput,
  SetEmployeeSmenasSchema,
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

  /**
   * P11 — xodim kartasi uchun: hisobning barcha smenalari + shu xodim
   * biriktirilganlari. Ikkalasi BITTA javobda, chunki karta ekrani
   * «belgilangan/belgilanmagan» ro'yxatini shu juftlikdan chizadi.
   */
  async employeeSmenas(accountId: string, employeeId: string) {
    await this.assertEmployee(accountId, employeeId);
    const items = await this.prisma.client.smena.findMany({
      where: { accountId, archived: false },
      select: {
        id: true,
        name: true,
        schedule: { select: { name: true, startTime: true, endTime: true } },
        organization: { select: { name: true } },
      },
      orderBy: { name: 'asc' },
    });
    const assigned = await this.prisma.client.smenaEmployee.findMany({
      where: { employeeId, smena: { accountId, archived: false } },
      select: { smenaId: true },
    });
    return { items, smenaIds: assigned.map((a) => a.smenaId) };
  }

  /**
   * P11 — xodimning smena biriktirmalarini to'liq almashtirish.
   *
   * `deleteMany` ATAYLAB shu hisobning smenalari bilan cheklangan: aks holda
   * bir hisobdagi admin boshqa ijarachining biriktirmasini o'chirib yuborardi
   * (`smenaEmployee` da `accountId` yo'q — u faqat `smena` orqali keladi).
   */
  async setEmployeeSmenas(accountId: string, employeeId: string, raw: unknown) {
    await this.assertEmployee(accountId, employeeId);
    const { smenaIds } = SetEmployeeSmenasSchema.parse(raw) as SetEmployeeSmenasInput;
    const unique = [...new Set(smenaIds)];

    if (unique.length > 0) {
      const found = await this.prisma.client.smena.findMany({
        where: { id: { in: unique }, accountId, archived: false },
        select: { id: true },
      });
      if (found.length !== unique.length) {
        throw new BadRequestException('Smena topilmadi yoki arxivlangan');
      }
    }

    const accountSmenas = await this.prisma.client.smena.findMany({
      where: { accountId },
      select: { id: true },
    });
    const accountSmenaIds = accountSmenas.map((s) => s.id);

    await this.prisma.client.$transaction(async (tx) => {
      await tx.smenaEmployee.deleteMany({
        where: { employeeId, smenaId: { in: accountSmenaIds } },
      });
      if (unique.length > 0) {
        await tx.smenaEmployee.createMany({
          data: unique.map((smenaId) => ({ smenaId, employeeId })),
          skipDuplicates: true,
        });
      }
    });

    return this.employeeSmenas(accountId, employeeId);
  }

  /** Ijara chegarasi: begona hisobning xodimiga tegib bo'lmaydi. */
  private async assertEmployee(accountId: string, employeeId: string) {
    const employee = await this.prisma.client.employee.findFirst({
      where: { id: employeeId, accountId },
      select: { id: true },
    });
    if (!employee) throw new NotFoundException('Xodim topilmadi');
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
      // Tartib DETERMINISTIK bo'lishi shart: tartibsiz `findMany` bir xil
      // ma'lumotda ham har chaqiruvda boshqa smenani birinchi qaytarishi
      // mumkin edi (P11: endi xodim bir nechta smenada bo'lishi mumkin).
      orderBy: { smena: { name: 'asc' } },
    });

    if (assignments.length === 0) return { smena: null, withinShift: false };

    // Bir nechta smena bo'lsa — HOZIR vaqti kelgani ustun. Aks holda kassir
    // «smena vaqtidan tashqari» sababini yozishga majbur bo'lardi, holbuki
    // uning haqiqiy smenasi ayni damda ochiq (P11 dan oldin ro'yxatdagi
    // birinchi element ko'r-ko'rona olinardi).
    const active = assignments.find((a) =>
      isWithinShift(a.smena.schedule.startTime, a.smena.schedule.endTime),
    );
    const smena = (active ?? assignments[0]!).smena;
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
    // 2026-08-16 (egasi qarori): vaqtdan tashqari SABAB endi MAJBURIY EMAS —
    // «smenani xohlaganda ochib-yopish» so'rovi. Eski majburiylik amalda
    // teskari ishlagan edi: kassirlar yopmay qo'yib, bitta sessiya 14–42
    // soatlab ochiq qolardi va yopishda «oldingi kunlar qo'shilib ketyapti»
    // shikoyati tug'ilardi. §9 kuzatuvi YO'QOLMAYDI: vaqtdan-tashqari ochilish
    // audit-jurnalga sababsiz ham yoziladi (quyida), menejer hisoboti ishlashda
    // davom etadi.

    // Allaqachon ochiq sessiya bormi?
    const existing = await this.prisma.client.cashierSession.findFirst({
      where: { accountId, cashierId, state: 'open' },
    });
    // P4 — bu POS'ning HAQIQIY smena ochish yo'li (`/sotuv` shu yerga
    // yozadi), shuning uchun «unutilgan smena» xabari birinchi navbatda shu
    // yerda ko'rinadi. Ilgari matn shunchaki «Allaqachon ochiq smena mavjud»
    // edi: kassir qaysi smena, qachondan beri ochiqligini bilmasdi va
    // ekranda hech qanday keyingi qadam ko'rsatilmasdi.
    if (existing) {
      throw new BadRequestException(
        formatOpenShiftConflict({
          age: describeShiftAge({
            openedAt: existing.openedAt,
            now: new Date(),
            // Chegara bu yerda o'qilmaydi: xabar YOSHNI baribir aytadi,
            // «juda uzoq» qo'shimchasi esa POS bannerida (server hisoblagan
            // `stale` bilan) ko'rinadi. Ikkinchi baza so'rovi ochilish
            // yo'lini sekinlashtirardi.
            warnHours: null,
          }),
          sessionId: existing.id,
          sessionName: existing.name,
        }),
      );
    }

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
            // 2026-08-16: yashiqdagi boshlang'ich dollar ham shakldan keladi
            // (sentda). Ilgari jim 0 edi — dollar qoldig'i yopishda soxta
            // излишек bo'lib chiqardi.
            openingCashUsdMinor: BigInt(input.openingCashUsdMinor),
            state: 'open',
          },
          include: {
            organization: { select: { id: true, name: true } },
          },
        });

        // Sababli ham, sababsiz ham — vaqtdan-tashqari ochilish JURNALGA
        // tushadi (§9). Sabab ixtiyoriy bo'lgani bilan kuzatuv ixtiyoriy emas.
        if (!withinShift) {
          const event = planOutOfScheduleAuditEvent(session.id, {
            smenaId: smena.id,
            smenaName: smena.name,
            reason: input.outOfShiftReason ?? null,
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
