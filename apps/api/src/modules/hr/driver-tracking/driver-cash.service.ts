import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { CashInService } from '../../cash-in/cash-in.service.js';
import {
  CollectCashSchema,
  DriverCashFilterSchema,
  HandOverCashSchema,
} from './driver-cash.schema.js';

/**
 * Haydovchi naqd topshirig'i (HR TZ §7.2).
 *
 * MODEL: haydovchi mijozdan naqd oladi → pul UNING QO'LIDA (`pending`) →
 * kassirga topshiradi → kassir sanab qabul qiladi (`handed`) va aynan SHU
 * paytda ПКО yaratilib post qilinadi.
 *
 * PUL YAXLITLIGI — asosiy qaror: bu servis kassa qoldig'iga O'ZI TEGMAYDI.
 * `CashInService.create` + `transition('post')` chaqiriladi, ya'ni pul
 * mavjud auditlangan yo'ldan o'tadi (MoneyOperation yozuvi, kontragent
 * balansi, hujjat raqami — hammasi o'sha yerda). Alohida «tezroq» yozuv
 * qilsak, kassa hisoboti bilan ПКО reyestri farq qilib ketardi.
 */
@Injectable()
export class DriverCashService {
  private readonly logger = new Logger(DriverCashService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CashInService) private readonly cashIn: CashInService,
  ) {}

  /** Haydovchi: «mijozdan shuncha naqd oldim». Pul harakati YO'Q. */
  async collect(accountId: string, driverId: string, raw: unknown) {
    const dto = CollectCashSchema.parse(raw);
    const amount = BigInt(dto.amountMinor);
    if (amount <= 0n) throw new BadRequestException("Summa 0 dan katta bo'lishi kerak");

    const emp = await this.prisma.client.employee.findFirst({
      where: { id: driverId, accountId },
      select: { trackingMode: true },
    });
    if (!emp || emp.trackingMode !== 'field') {
      throw new BadRequestException('Xodim haydovchi (field) rejimida emas');
    }

    // Ochiq smena bo'lsa bog'laymiz — smena yig'masi uchun. Smena SHART emas:
    // pul olingani fakt, uni smenasiz e'lon qilib bo'lmasa yozuvsiz qolardi.
    const shift = await this.prisma.client.driverShift.findFirst({
      where: { accountId, driverId, endedAt: null },
      orderBy: { startedAt: 'desc' },
      select: { id: true },
    });

    if (dto.tripId) {
      const trip = await this.prisma.client.driverTrip.findFirst({
        where: { id: dto.tripId, accountId, driverId },
        select: { id: true },
      });
      if (!trip) throw new NotFoundException('Yetkazma topilmadi');
    }

    return this.prisma.client.driverCashHandover.create({
      data: {
        accountId,
        driverId,
        shiftId: shift?.id ?? null,
        tripId: dto.tripId ?? null,
        amountMinor: amount,
        status: 'pending',
        note: dto.note ?? null,
      },
    });
  }

  /**
   * Kassir pulni qabul qiladi → ПКО yaratiladi va post qilinadi.
   *
   * Tartib ATAYLAB shunday: avval holat `pending`dan CAS bilan olinadi, keyin
   * ПКО yaratiladi. Teskarisi bo'lsa (avval ПКО), ikkinchi kassir poygada
   * yutqazganda allaqachon yaratilgan ПКО osilib qolardi — ya'ni kassaga
   * ikki marta pul tushardi.
   */
  async handOver(accountId: string, userId: string, id: string, raw: unknown) {
    const dto = HandOverCashSchema.parse(raw);

    const row = await this.prisma.client.driverCashHandover.findFirst({
      where: { id, accountId },
    });
    if (!row) throw new NotFoundException("Naqd topshirig'i topilmadi");
    if (row.status !== 'pending') {
      throw new BadRequestException(
        `Faqat kutayotgan topshiriq qabul qilinadi (joriy: ${row.status})`,
      );
    }

    // 1-qadam: holatni band qilamiz (CAS + optimistik qulf).
    const claimed = await this.prisma.client.driverCashHandover.updateMany({
      where: { id, accountId, status: 'pending', version: dto.version },
      data: {
        status: 'handed',
        handedAt: new Date(),
        acceptedById: userId,
        version: { increment: 1 },
      },
    });
    if (claimed.count === 0) {
      throw new ConflictException(
        "Topshiriq holati o'zgardi (boshqa kassir qabul qildimi?) — qayta yuklang",
      );
    }

    // 2-qadam: ПКО. Bu yerda xato bo'lsa holatni QAYTARAMIZ, aks holda pul
    // «topshirilgan» ko'rinib, kassaga tushmay qolardi.
    try {
      const created = (await this.cashIn.create(accountId, userId, {
        agentId: dto.agentId,
        organizationId: dto.organizationId,
        cashDeskId: dto.cashDeskId,
        sumMinor: row.amountMinor.toString(),
        currency: row.currency,
        paymentPurpose: `Haydovchi naqd topshirig'i${row.note ? ` — ${row.note}` : ''}`,
      })) as { id: string };

      await this.cashIn.transition(accountId, userId, created.id, 'post');

      return this.prisma.client.driverCashHandover.update({
        where: { id },
        data: { cashInId: created.id },
      });
    } catch (e) {
      await this.prisma.client.driverCashHandover.updateMany({
        where: { id, accountId, status: 'handed' },
        data: { status: 'pending', handedAt: null, acceptedById: null, cashInId: null },
      });
      this.logger.error(
        `handOver[${id}]: ПКО yaratilmadi, holat 'pending'ga qaytarildi: ${
          e instanceof Error ? e.message : e
        }`,
      );
      throw e;
    }
  }

  /** Xato yozuv (pul aslida olinmagan). Faqat kutayotganini bekor qilish mumkin. */
  async cancel(accountId: string, id: string) {
    const res = await this.prisma.client.driverCashHandover.updateMany({
      where: { id, accountId, status: 'pending' },
      data: { status: 'cancelled' },
    });
    if (res.count === 0) {
      throw new ConflictException(
        'Faqat kutayotgan topshiriq bekor qilinadi (topshirilgani ПКО orqali qaytariladi)',
      );
    }
    return this.prisma.client.driverCashHandover.findFirstOrThrow({ where: { id, accountId } });
  }

  async list(accountId: string, raw: unknown) {
    const f = DriverCashFilterSchema.parse(raw);
    return this.prisma.client.driverCashHandover.findMany({
      where: {
        accountId,
        ...(f.driverId ? { driverId: f.driverId } : {}),
        ...(f.status ? { status: f.status } : {}),
      },
      orderBy: { collectedAt: 'desc' },
      take: f.limit,
    });
  }

  /** Haydovchining o'z yozuvlari (telefon ekrani). */
  async listMine(accountId: string, driverId: string) {
    return this.prisma.client.driverCashHandover.findMany({
      where: { accountId, driverId },
      orderBy: { collectedAt: 'desc' },
      take: 50,
    });
  }

  /**
   * Haydovchi boshiga TOPSHIRILMAGAN naqd — «kimda qancha turibdi».
   * Dispecher panelida qizil ko'rinadi (TZ §7.2).
   */
  async outstanding(accountId: string) {
    const rows = await this.prisma.client.driverCashHandover.groupBy({
      by: ['driverId'],
      where: { accountId, status: 'pending' },
      _sum: { amountMinor: true },
      _count: { _all: true },
    });
    if (rows.length === 0) return [];
    const names = await this.prisma.client.employee.findMany({
      where: { accountId, id: { in: rows.map((r) => r.driverId) } },
      select: { id: true, name: true },
    });
    const nameById = new Map(names.map((n) => [n.id, n.name]));
    return rows.map((r) => ({
      driverId: r.driverId,
      driverName: nameById.get(r.driverId) ?? '—',
      pendingCount: r._count._all,
      pendingMinor: (r._sum.amountMinor ?? 0n).toString(),
    }));
  }

  /**
   * Topshirilmagan naqd — VALYUTA kesimida (MK15 «korxona puli qayerda»).
   *
   * `outstanding()` haydovchi bo'yicha guruhlaydi va valyutani umuman
   * ko'rmaydi, ya'ni uning summalarini qo'shish valyutalarni aralashtirardi.
   * Panelga esa aynan valyuta kesimi kerak — konsolidatsiyani u yuqorida,
   * yagona `consolidateToBase` shartnomasi bilan bajaradi.
   *
   * Faqat `pending`: `handed` pul allaqachon kassada (u yerda ikkinchi marta
   * sanalardi), `cancelled` esa umuman olinmagan.
   */
  async outstandingByCurrency(
    accountId: string,
  ): Promise<Array<{ currency: string; amountMinor: bigint }>> {
    const rows = await this.prisma.client.driverCashHandover.groupBy({
      by: ['currency'],
      where: { accountId, status: 'pending' },
      _sum: { amountMinor: true },
    });
    return rows.map((r) => ({
      currency: r.currency,
      amountMinor: r._sum.amountMinor ?? 0n,
    }));
  }
}
