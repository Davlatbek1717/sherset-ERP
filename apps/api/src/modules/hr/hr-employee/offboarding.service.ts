import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { TokenService } from '../../auth/token.service.js';
import { PermissionsService } from '../../permissions/permissions.service.js';
import {
  type AutoFacts,
  type ManualState,
  OFFBOARDING_ITEM,
  canMarkManually,
  itemDef,
  offboardingProgress,
} from './offboarding.js';

/**
 * Xodimni bo'shatish jarayoni (menejer TZ 4M.4 — «hayot sikli»).
 *
 * Bo'shatish `archived: true` bayrog'i EMAS, **ro'yxat**: u tugamaguncha xodim
 * arxivlanmaydi. Tekshirildi — arxivlashning o'zi login va refresh'ni yopadi
 * (`auth.service` `archived` ni ko'radi), lekin quyidagilar ochiq qolardi:
 * Telegram bog'lami · ochiq kassa smenasi · qabul qilinmagan KPI kunlari ·
 * topshirilmagan naqd va jihoz.
 *
 * Qoidalar sof modulda (`offboarding.ts`, 21 test) — bu yerda Prisma-I/O.
 */
@Injectable()
export class OffboardingService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    // AUTH-05 — arxivlash bilan bir tranzaksiyada sessiyalarni uzish uchun.
    // Modul ikkalasini OSHKORA import qiladi (AuthModule + PermissionsModule).
    @Inject(TokenService) private readonly tokens: TokenService,
    @Inject(PermissionsService) private readonly permissions: PermissionsService,
  ) {}

  /**
   * Tizim biladigan faktlar — HAR SO'ROVDA qayta o'qiladi.
   *
   * Snapshot saqlanmaydi: bir marta «smena yopilgan» deb yozib qo'yish keyin
   * qayta ochilgan smenani ko'rinmas qilardi.
   */
  private async autoFacts(accountId: string, employeeId: string): Promise<AutoFacts> {
    const [emp, openShiftCount, pendingKpiDays] = await Promise.all([
      this.prisma.client.employee.findFirst({
        where: { id: employeeId, accountId },
        select: { telegramChatId: true, hrRoles: true },
      }),
      this.prisma.client.cashierSession.count({
        where: { accountId, cashierId: employeeId, state: 'open' },
      }),
      // «Qabul kutayotgan» va «eskirgan» — ikkalasi ham oylikni bloklaydi,
      // shuning uchun ikkalasi ham yopilishi kerak.
      this.prisma.client.employeeDailyKpi.count({
        where: { accountId, employeeId, state: { in: ['pending', 'stale', 'computed'] } },
      }),
    ]);
    if (!emp) throw new NotFoundException('Xodim topilmadi');
    return {
      telegramChatId: emp.telegramChatId ?? null,
      openShiftCount,
      pendingKpiDays,
      roleCount: emp.hrRoles.length,
    };
  }

  /** Joriy holat — ro'yxat va qolgan to'siqlar. */
  async status(accountId: string, employeeId: string) {
    const row = await this.prisma.client.employeeOffboarding.findFirst({
      where: { employeeId, accountId },
      select: {
        id: true,
        lastWorkingDay: true,
        reason: true,
        items: true,
        startedAt: true,
        completedAt: true,
        startedBy: { select: { id: true, name: true } },
      },
    });
    const facts = await this.autoFacts(accountId, employeeId);
    const manual = toManual(row?.items);
    const progress = offboardingProgress(facts, manual);

    return {
      started: row !== null,
      id: row?.id ?? null,
      lastWorkingDay: row?.lastWorkingDay ?? null,
      reason: row?.reason ?? null,
      startedAt: row?.startedAt ?? null,
      startedBy: row?.startedBy ?? null,
      completedAt: row?.completedAt ?? null,
      ...progress,
    };
  }

  /** Jarayonni boshlash (yoki mavjudini qaytarish — idempotent). */
  async start(accountId: string, actorId: string, employeeId: string, raw: unknown) {
    const body = (raw ?? {}) as { lastWorkingDay?: unknown; reason?: unknown };
    const emp = await this.prisma.client.employee.findFirst({
      where: { id: employeeId, accountId },
      select: { id: true, archived: true },
    });
    if (!emp) throw new NotFoundException('Xodim topilmadi');
    if (emp.archived) throw new BadRequestException('Xodim allaqachon arxivlangan');
    if (employeeId === actorId) {
      // O'zini bo'shatish — o'zini qulflash bilan bir xil xato klassi.
      throw new BadRequestException("O'zingizni bo'shata olmaysiz");
    }

    const lastWorkingDay =
      typeof body.lastWorkingDay === 'string' && body.lastWorkingDay
        ? new Date(body.lastWorkingDay)
        : null;

    await this.prisma.client.employeeOffboarding.upsert({
      where: { employeeId },
      create: {
        accountId,
        employeeId,
        startedById: actorId,
        lastWorkingDay:
          lastWorkingDay && !Number.isNaN(lastWorkingDay.getTime()) ? lastWorkingDay : null,
        reason: typeof body.reason === 'string' ? body.reason.trim() || null : null,
      },
      // Takroriy «boshlash» bosilsa ro'yxat TOZALANMAYDI: allaqachon
      // tasdiqlangan bandlar yo'qolsa, ish qaytadan boshlanardi.
      update: {},
    });
    return this.status(accountId, employeeId);
  }

  /**
   * Qo'lda tasdiqlanadigan bandni belgilash.
   *
   * ⚠️ `auto` band rad etiladi — ro'yxat o'zini o'zi aldash vositasiga
   * aylanmasligi kerak: «Telegram uzildi» deb belgilash bog'lamni uzmaydi.
   */
  async markItem(accountId: string, actorId: string, employeeId: string, raw: unknown) {
    const body = (raw ?? {}) as { key?: unknown; done?: unknown };
    const key = String(body.key ?? '');
    const def = itemDef(key);
    if (!def) throw new BadRequestException(`Noma'lum band: ${key}`);
    if (!canMarkManually(key)) {
      throw new BadRequestException(
        `«${def.label}» ni qo'lda belgilab bo'lmaydi — tizim o'zi tekshiradi`,
      );
    }

    const row = await this.prisma.client.employeeOffboarding.findFirst({
      where: { employeeId, accountId },
      select: { id: true, items: true, completedAt: true },
    });
    if (!row) throw new NotFoundException('Bo`shatish jarayoni boshlanmagan');
    if (row.completedAt) throw new BadRequestException('Jarayon allaqachon yakunlangan');

    const manual = toManual(row.items);
    if (body.done === false) delete manual[key];
    else manual[key] = { doneAt: new Date(), byId: actorId };

    await this.prisma.client.employeeOffboarding.update({
      where: { id: row.id },
      data: { items: manual as unknown as object },
    });
    return this.status(accountId, employeeId);
  }

  /**
   * Yakunlash — ro'yxat to'liq bo'lsagina xodim ARXIVLANADI.
   *
   * ⚠️ Faktlar ayni shu yerda QAYTA o'qiladi: menejer ekranni ochib turgan
   * paytda kassir yangi smena ochishi mumkin, va o'sha eskirgan ekrandagi
   * «hammasi tayyor» ko'rinishiga ishonib arxivlash — ochiq smenani
   * egasiz qoldirardi.
   */
  async complete(accountId: string, employeeId: string) {
    const row = await this.prisma.client.employeeOffboarding.findFirst({
      where: { employeeId, accountId },
      select: { id: true, items: true, completedAt: true },
    });
    if (!row) throw new NotFoundException('Bo`shatish jarayoni boshlanmagan');
    if (row.completedAt) return this.status(accountId, employeeId);

    const facts = await this.autoFacts(accountId, employeeId);
    const progress = offboardingProgress(facts, toManual(row.items));
    if (!progress.canArchive) {
      throw new BadRequestException(
        `Bajarilmagan bandlar: ${progress.blockers
          .map((b) => (b.detail ? `${b.label} (${b.detail})` : b.label))
          .join(' · ')}`,
      );
    }

    // Arxivlash va yakunlash BIRGA: xodim arxivlangan-u jarayon ochiq
    // qolsa, ro'yxat «bajarilmagan» bo'lib turaverardi va menejer ekranini
    // abadiy to'ldirardi.
    //
    // AUTH-05 — SHU tranzaksiyada kirish huquqi ham uziladi:
    //  · refresh-tokenlar bekor (aks holda `revokedAt=null` bo'lib turardi va
    //    faqat keyingi `refresh` urinishida `archived` ushlanardi);
    //  · `HrEmployeePermission` qatorlari o'chiriladi — bo'shatish ro'yxati
    //    ularni umuman SANAMAYDI (faqat `hrRoles`), ya'ni sahifa-ruxsatlari
    //    arxivlangan xodimda ochiq qolardi (qayta tiklansa darhol tirilardi);
    //  · `hrRoles` bo'shatiladi — ro'yxat buni talab qiladi, lekin tekshiruv
    //    bilan arxivlash orasida rol berilishi mumkin (TOCTOU).
    // Amaldagi access-JWT (15 daq) baribir tugashini kutadi — bu qarz
    // `AUTH-05` izohida qayd etilgan (deny-list/qisqa TTL alohida ish).
    await this.prisma.client.$transaction(async (tx) => {
      await tx.employee.update({
        where: { id: employeeId },
        data: { archived: true, hrRoles: [], version: { increment: 1 } },
      });
      await tx.employeeOffboarding.update({
        where: { id: row.id },
        data: { completedAt: new Date() },
      });
      await tx.hrEmployeePermission.deleteMany({ where: { accountId, employeeId } });
      await this.tokens.revokeAllForEmployee(employeeId, tx);
    });
    // Kesh tranzaksiya COMMIT bo'lgach tozalanadi: erta tozalash rollback'da
    // eski (ruxsatli) holatni qayta keshlab qo'yish xavfini tug'diradi.
    this.permissions.invalidate(employeeId);
    return this.status(accountId, employeeId);
  }

  /** Tugallanmagan bo'shatishlar — menejer ekrani. */
  async listOpen(accountId: string) {
    const rows = await this.prisma.client.employeeOffboarding.findMany({
      where: { accountId, completedAt: null },
      orderBy: { startedAt: 'asc' },
      select: {
        id: true,
        employeeId: true,
        lastWorkingDay: true,
        startedAt: true,
        items: true,
        employee: { select: { id: true, name: true } },
      },
    });
    const out = [];
    for (const r of rows) {
      const facts = await this.autoFacts(accountId, r.employeeId);
      const p = offboardingProgress(facts, toManual(r.items));
      out.push({
        id: r.id,
        employee: r.employee,
        lastWorkingDay: r.lastWorkingDay,
        startedAt: r.startedAt,
        doneCount: p.doneCount,
        total: p.total,
        canArchive: p.canArchive,
        blockers: p.blockers.map((b) => ({ key: b.key, label: b.label, detail: b.detail })),
      });
    }
    return { items: out, total: out.length };
  }
}

/** JSON → qo'lda tasdiqlar; buzuq qiymat bo'sh holat (jarayon to'xtamasin). */
function toManual(items: unknown): ManualState {
  if (items === null || typeof items !== 'object') return {};
  const out: ManualState = {};
  for (const [k, v] of Object.entries(items as Record<string, unknown>)) {
    if (v === null || typeof v !== 'object') continue;
    const raw = (v as { doneAt?: unknown; byId?: unknown }).doneAt;
    const d = typeof raw === 'string' || raw instanceof Date ? new Date(raw) : null;
    if (!d || Number.isNaN(d.getTime())) continue;
    out[k] = { doneAt: d, byId: String((v as { byId?: unknown }).byId ?? '') || null };
  }
  return out;
}

export { OFFBOARDING_ITEM };
