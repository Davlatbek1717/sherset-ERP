import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { isNoteKind, isValidNoteText, summarizeNotes } from './employee-note.js';
import { OffboardingService } from './offboarding.service.js';

/**
 * Xodim kartasi 360° (menejer TZ 4M.4) — bitta odam haqidagi hamma narsa
 * BITTA ekranda.
 *
 * Menejerning haqiqiy savoli «bu odam bilan nima bo'lyapti» — hozir esa
 * javob olti xil joyga tarqalgan: KPI navbati, davomat, smenalar, oylik,
 * bo'shatish holati va (endi) suhbat jurnali. Har birini alohida ochish
 * menejerni to'liq rasmni yig'ishdan voz kechishga majbur qilardi.
 *
 * ⚠️ Bu servis YANGI hisob QILMAYDI — mavjud manbalarni bir joyga yig'adi.
 * Har raqamning egasi o'z modulida qoladi, aks holda bir xil ko'rsatkich
 * ikki joyda ikki xil hisoblanib ketardi.
 */
@Injectable()
export class EmployeeCardService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(OffboardingService) private readonly offboarding: OffboardingService,
  ) {}

  async card(accountId: string, employeeId: string) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const employee = await this.prisma.client.employee.findFirst({
      where: { id: employeeId, accountId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        archived: true,
        hrRoles: true,
        telegramChatId: true,
        createdAt: true,
      },
    });
    if (!employee) throw new NotFoundException('Xodim topilmadi');

    const [notes, kpiCounts, attendance, openShifts, lastShift, corrections] = await Promise.all([
      this.prisma.client.employeeNote.findMany({
        where: { accountId, employeeId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          kind: true,
          text: true,
          createdAt: true,
          voidedAt: true,
          voidReason: true,
          author: { select: { id: true, name: true } },
          voidedBy: { select: { id: true, name: true } },
        },
      }),
      this.prisma.client.employeeDailyKpi.groupBy({
        by: ['state'],
        where: { accountId, employeeId },
        _count: { _all: true },
      }),
      // Joriy oy davomati — kechikishlar naqshi shu yerdan ko'rinadi.
      this.prisma.client.hrAttendance.aggregate({
        where: { accountId, employeeId, deletedAt: null, checkInTime: { gte: monthStart } },
        _count: { _all: true },
        _sum: { lateMinutes: true },
      }),
      this.prisma.client.cashierSession.count({
        where: { accountId, cashierId: employeeId, state: 'open' },
      }),
      this.prisma.client.cashierSession.findFirst({
        where: { accountId, cashierId: employeeId },
        orderBy: { openedAt: 'desc' },
        select: { openedAt: true, closedAt: true, discrepancyMinor: true },
      }),
      // Oylik tuzatmalari (§3.4) — «bu odamning raqami qancha marta
      // qayta ko'rilgan» savoliga javob.
      this.prisma.client.employeeKpiCorrection.aggregate({
        where: { accountId, employeeId },
        _count: { _all: true },
      }),
    ]);

    const byState: Record<string, number> = {};
    for (const g of kpiCounts) byState[g.state] = g._count._all;

    // Bo'shatish holati — «bu odam ketyaptimi» savolining javobi.
    const offboarding = await this.offboarding.status(accountId, employeeId).catch(() => null);

    return {
      employee: {
        id: employee.id,
        name: employee.name,
        email: employee.email,
        phone: employee.phone,
        archived: employee.archived,
        roles: employee.hrRoles,
        telegramBound: employee.telegramChatId !== null,
        hiredAt: employee.createdAt,
      },
      kpi: {
        byState,
        // Oylikni bloklaydigan kunlar — menejerning birinchi savoli.
        pendingTotal: (byState.pending ?? 0) + (byState.stale ?? 0) + (byState.computed ?? 0),
        acceptedTotal: (byState.accepted ?? 0) + (byState.force_accepted ?? 0),
        correctionCount: corrections._count._all,
      },
      attendance: {
        monthDays: attendance._count._all,
        monthLateMinutes: attendance._sum.lateMinutes ?? 0,
      },
      shifts: {
        openCount: openShifts,
        lastOpenedAt: lastShift?.openedAt ?? null,
        lastClosedAt: lastShift?.closedAt ?? null,
        lastDiscrepancyMinor: lastShift?.discrepancyMinor?.toString() ?? null,
      },
      notes: {
        ...summarizeNotes(
          notes.map((n) => ({ kind: n.kind, createdAt: n.createdAt, voidedAt: n.voidedAt })),
          now,
        ),
        items: notes.map((n) => ({
          id: n.id,
          kind: n.kind,
          text: n.text,
          createdAt: n.createdAt,
          author: n.author,
          voidedAt: n.voidedAt,
          voidedBy: n.voidedBy,
          voidReason: n.voidReason,
        })),
      },
      offboarding: offboarding
        ? {
            started: offboarding.started,
            completedAt: offboarding.completedAt,
            doneCount: offboarding.doneCount,
            total: offboarding.total,
            canArchive: offboarding.canArchive,
          }
        : null,
    };
  }

  /**
   * Jurnalga yozuv qo'shish.
   *
   * Matn MAJBURIY: sababsiz «ogohlantirildi» yozuvini uch oydan keyin na
   * menejer, na xodim tushuntira oladi.
   */
  async addNote(accountId: string, authorId: string, employeeId: string, raw: unknown) {
    const body = (raw ?? {}) as { kind?: unknown; text?: unknown };
    const kind = String(body.kind ?? '');
    if (!isNoteKind(kind)) {
      throw new BadRequestException(`Noma'lum tur: ${kind}`);
    }
    if (!isValidNoteText(body.text)) {
      throw new BadRequestException('Matn bo`sh bo`lishi mumkin emas');
    }
    const emp = await this.prisma.client.employee.findFirst({
      where: { id: employeeId, accountId },
      select: { id: true },
    });
    if (!emp) throw new NotFoundException('Xodim topilmadi');

    return this.prisma.client.employeeNote.create({
      data: { accountId, employeeId, authorId, kind, text: body.text.trim() },
      select: { id: true, kind: true, text: true, createdAt: true },
    });
  }

  /**
   * Xato yozuvni BEKOR qilish — o'chirish EMAS.
   *
   * ⚠️ Yozuv jurnalda qoladi va ko'rinadi; faqat hisobga kirmaydi.
   * O'chirib bo'ladigan ogohlantirish — ogohlantirish emas: noqulay
   * yozuvni keyin yo'qotish imkoni jurnalning butun ma'nosini buzardi.
   *
   * Takroriy bekor qilish BIRINCHI vaqtni saqlaydi.
   */
  async voidNote(accountId: string, actorId: string, noteId: string, raw: unknown) {
    const body = (raw ?? {}) as { reason?: unknown };
    const row = await this.prisma.client.employeeNote.findFirst({
      where: { id: noteId, accountId },
      select: { id: true, voidedAt: true },
    });
    if (!row) throw new NotFoundException('Yozuv topilmadi');
    if (row.voidedAt) return { id: row.id, voidedAt: row.voidedAt, changed: false };

    const updated = await this.prisma.client.employeeNote.update({
      where: { id: noteId },
      data: {
        voidedAt: new Date(),
        voidedById: actorId,
        voidReason: typeof body.reason === 'string' ? body.reason.trim() || null : null,
      },
      select: { id: true, voidedAt: true },
    });
    return { ...updated, changed: true };
  }
}
