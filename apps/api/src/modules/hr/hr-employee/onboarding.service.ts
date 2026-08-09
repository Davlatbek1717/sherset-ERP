import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import {
  ONBOARDING_ITEM,
  type OnboardingAutoFacts,
  type OnboardingItemStatus,
  type OnboardingManualState,
  canMarkOnboardingManually,
  hasResolvableKpiProfile,
  isProbationOutcome,
  lifecycleStage,
  onboardingItemDef,
  onboardingProgress,
  probationStatus,
} from './onboarding.js';

/**
 * Ishga qabul jarayoni — sinov muddati (menejer TZ 4M.4, §6.3).
 *
 * `OffboardingService` ning ko'zgusi: u yerda ro'yxat **arxivlashni** to'sadi,
 * bu yerda ro'yxat **«sinovdan o'tdi»** ni to'sadi. Qoidalar sof modulda
 * (`onboarding.ts`) — bu yerda Prisma-I/O.
 *
 * ⚠️ **Menejer navbati** (`ManagerWorkItem`, TZ §5) hali yo'q — u alohida
 * fazada (MK06) quriladi. Shu sababdan «baholash kuni navbatga element
 * tushadi» talabi hozircha `listDue()` bilan qoplangan: menejer ekrani
 * sinovda turganlarni va kechikkanlarni SHU YERDAN oladi. MK06 kelganda
 * element yaratish o'sha dvigatelga ko'chiriladi — `listDue` esa qoladi
 * (navbatning o'zi ham shu ma'lumotga tayanadi).
 */
@Injectable()
export class OnboardingService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Tizim biladigan faktlar — HAR SO'ROVDA qayta o'qiladi.
   *
   * Snapshot saqlanmaydi: bir marta «rollar berildi» deb yozib qo'yish keyin
   * olib qo'yilgan rolni ko'rinmas qilardi.
   */
  private async loadEmployeeContext(accountId: string, employeeId: string) {
    const [emp, profiles, offboarding] = await Promise.all([
      this.prisma.client.employee.findFirst({
        where: { id: employeeId, accountId },
        select: {
          id: true,
          archived: true,
          passwordHash: true,
          hrRoles: true,
          telegramChatId: true,
          positionId: true,
        },
      }),
      this.prisma.client.kpiProfile.findMany({
        where: { accountId, archived: false },
        select: { employeeId: true, positionId: true },
      }),
      this.prisma.client.employeeOffboarding.findFirst({
        where: { employeeId, accountId },
        select: { id: true, completedAt: true },
      }),
    ]);
    if (!emp) throw new NotFoundException('Xodim topilmadi');
    return {
      emp,
      facts: toFacts(emp, profiles),
      // Boshlangan-u yakunlanmagan bo'shatish — hayot siklida SINOVDAN ustun.
      offboardingStarted: offboarding !== null && offboarding.completedAt === null,
    };
  }

  /** Joriy holat — sinov muddati, ro'yxat va hayot sikli bosqichi. */
  async status(accountId: string, employeeId: string, now: Date = new Date()) {
    const [{ emp, facts, offboardingStarted }, row] = await Promise.all([
      this.loadEmployeeContext(accountId, employeeId),
      this.prisma.client.employeeOnboarding.findFirst({
        where: { employeeId, accountId },
        select: ROW_SELECT,
      }),
    ]);
    return this.buildStatus({ emp, facts, offboardingStarted, row, now });
  }

  private buildStatus(input: {
    emp: { archived: boolean };
    facts: OnboardingAutoFacts;
    offboardingStarted: boolean;
    row: OnboardingRow | null;
    now: Date;
  }) {
    const { emp, facts, offboardingStarted, row, now } = input;
    const progress = onboardingProgress(facts, toManual(row?.items));
    const probation = probationStatus(
      {
        probationEndsOn: row?.probationEndsOn ?? null,
        evaluationOn: row?.evaluationOn ?? null,
        outcome: row?.outcome ?? null,
      },
      now,
    );

    return {
      started: row !== null,
      id: row?.id ?? null,
      probationStartsOn: row?.probationStartsOn ?? null,
      probationEndsOn: row?.probationEndsOn ?? null,
      evaluationOn: row?.evaluationOn ?? null,
      outcome: row?.outcome ?? null,
      outcomeAt: row?.outcomeAt ?? null,
      outcomeNote: row?.outcomeNote ?? null,
      decidedBy: row?.decidedBy ?? null,
      startedAt: row?.startedAt ?? null,
      startedBy: row?.startedBy ?? null,
      lifecycleStage: lifecycleStage({
        archived: emp.archived,
        offboardingStarted,
        onboardingStarted: row !== null,
        probationOutcome: row?.outcome ?? null,
      }),
      ...probation,
      ...progress,
    };
  }

  /**
   * Sinov muddatini belgilash (yoki tuzatish).
   *
   * Offboarding'dan farqi: sanalar KEYIN ham tuzatilishi mumkin (muddat
   * uzaytiriladi — bu hayotiy holat). Lekin natija belgilangach — yo'q:
   * «o'tdi» deb yopilgan sinovning sanasini keyin surish qaror izini
   * buzardi.
   */
  async start(accountId: string, actorId: string, employeeId: string, raw: unknown) {
    const body = (raw ?? {}) as {
      probationStartsOn?: unknown;
      probationEndsOn?: unknown;
      evaluationOn?: unknown;
    };
    const emp = await this.prisma.client.employee.findFirst({
      where: { id: employeeId, accountId },
      select: { id: true, archived: true },
    });
    if (!emp) throw new NotFoundException('Xodim topilmadi');
    if (emp.archived) throw new BadRequestException('Xodim arxivlangan');

    const startsOn = parseDate(body.probationStartsOn, 'Sinov boshlanish sanasi');
    const endsOn = parseDate(body.probationEndsOn, 'Sinov tugash sanasi');
    const evaluationOn = parseDate(body.evaluationOn, 'Baholash sanasi');

    const existing = await this.prisma.client.employeeOnboarding.findFirst({
      where: { employeeId, accountId },
      select: {
        id: true,
        outcome: true,
        probationStartsOn: true,
        probationEndsOn: true,
        evaluationOn: true,
      },
    });
    if (existing?.outcome) {
      throw new BadRequestException('Sinov natijasi belgilangan — muddatni o`zgartirib bo`lmaydi');
    }

    // ⚠️ Faqat TANADA KELGAN kalitlar yangilanadi. Hamma sanani ko'r-ko'rona
    // yozish qisman tanani ma'lumot o'chirgichga aylantirardi: «tugash
    // sanasini tuzatdim» degan bir so'rov boshlanish va baholash sanalarini
    // jimgina NULL qilib qo'yardi. Oshkora `null` — hamon tozalash.
    const patch: {
      probationStartsOn?: Date | null;
      probationEndsOn?: Date | null;
      evaluationOn?: Date | null;
    } = {};
    if ('probationStartsOn' in body) patch.probationStartsOn = startsOn;
    if ('probationEndsOn' in body) patch.probationEndsOn = endsOn;
    if ('evaluationOn' in body) patch.evaluationOn = evaluationOn;

    // ⚠️ Tekshiruv QO'SHILGAN holat ustida: faqat kelgan maydonlarni o'zaro
    // solishtirish teshik qoldirardi — bazada 01.09 boshlanish turganda
    // «tugash = 01.08» yolg'iz kelsa hech narsa e'tiroz bildirmasdi.
    const merged = {
      startsOn: 'probationStartsOn' in body ? startsOn : (existing?.probationStartsOn ?? null),
      endsOn: 'probationEndsOn' in body ? endsOn : (existing?.probationEndsOn ?? null),
      evaluationOn: 'evaluationOn' in body ? evaluationOn : (existing?.evaluationOn ?? null),
    };
    if (merged.startsOn && merged.endsOn && merged.endsOn < merged.startsOn) {
      throw new BadRequestException('Sinov muddati boshlanishdan oldin tugay olmaydi');
    }
    if (merged.startsOn && merged.evaluationOn && merged.evaluationOn < merged.startsOn) {
      throw new BadRequestException('Baholash sanasi sinov boshlanishidan oldin bo`la olmaydi');
    }

    await this.prisma.client.employeeOnboarding.upsert({
      where: { employeeId },
      create: { accountId, employeeId, startedById: actorId, ...patch },
      // ⚠️ `items` ATAYLAB yo'q: takroriy «boshlash» tasdiqlangan bandlarni
      // tozalasa, bir sana tuzatish butun ishni qaytadan boshlatib yubordi.
      update: patch,
    });
    return this.status(accountId, employeeId);
  }

  /**
   * Qo'lda tasdiqlanadigan bandni belgilash.
   *
   * ⚠️ `auto` band rad etiladi — «rollar berildi» deb belgilash rol bermaydi,
   * va xodim birinchi ish kunida ruxsatsiz qolardi (MK02 test-3).
   */
  async markItem(accountId: string, actorId: string, employeeId: string, raw: unknown) {
    const body = (raw ?? {}) as { key?: unknown; done?: unknown };
    const key = String(body.key ?? '');
    const def = onboardingItemDef(key);
    if (!def) throw new BadRequestException(`Noma'lum band: ${key}`);
    if (!canMarkOnboardingManually(key)) {
      throw new BadRequestException(
        `«${def.label}» ni qo\`lda belgilab bo\`lmaydi — tizim o'zi tekshiradi`,
      );
    }

    const row = await this.prisma.client.employeeOnboarding.findFirst({
      where: { employeeId, accountId },
      select: { id: true, items: true, outcome: true },
    });
    if (!row) throw new NotFoundException('Sinov jarayoni boshlanmagan');
    if (row.outcome) throw new BadRequestException('Sinov natijasi allaqachon belgilangan');

    const manual = toManual(row.items);
    if (body.done === false) delete manual[key];
    else manual[key] = { doneAt: new Date(), byId: actorId };

    await this.prisma.client.employeeOnboarding.update({
      where: { id: row.id },
      data: { items: manual as unknown as object },
    });
    return this.status(accountId, employeeId);
  }

  /**
   * Sinov natijasi — «o'tdi» yoki «o'tmadi».
   *
   * ⚠️ Faktlar ayni shu yerda QAYTA o'qiladi: menejer ekranni ochib turgan
   * paytda rol olib qo'yilishi mumkin, va o'sha eskirgan ekrandagi «hammasi
   * tayyor» ko'rinishiga ishonib «o'tdi» yozish — ruxsatsiz xodimni doimiy
   * shtatga o'tkazardi.
   *
   * ⚠️ «O'tmadi» xodimni ARXIVLAMAYDI. Arxivlash yagona yo'l bilan —
   * bo'shatish ro'yxati orqali bo'ladi (`OffboardingService`), aks holda
   * ochiq smena va topshirilmagan naqd tekshiruvi chetlab o'tilardi.
   */
  async setOutcome(accountId: string, actorId: string, employeeId: string, raw: unknown) {
    const body = (raw ?? {}) as { result?: unknown; note?: unknown };
    if (!isProbationOutcome(body.result)) {
      throw new BadRequestException("Noma'lum sinov natijasi: 'passed' yoki 'failed' kutiladi");
    }
    const result = body.result;

    const [ctx, row] = await Promise.all([
      this.loadEmployeeContext(accountId, employeeId),
      this.prisma.client.employeeOnboarding.findFirst({
        where: { employeeId, accountId },
        select: { id: true, items: true, outcome: true },
      }),
    ]);
    if (!row) throw new NotFoundException('Sinov jarayoni boshlanmagan');
    if (row.outcome) {
      // Bir xil natija — idempotent; boshqasi — jimgina almashtirishga yo'l yo'q.
      if (row.outcome === result) return this.status(accountId, employeeId);
      throw new BadRequestException(
        `Sinov natijasi allaqachon «${row.outcome}» — o'zgartirib bo'lmaydi`,
      );
    }

    if (result === 'passed') {
      const progress = onboardingProgress(ctx.facts, toManual(row.items));
      if (!progress.canPass) {
        throw new BadRequestException(
          `Bajarilmagan bandlar: ${progress.blockers
            .map((b) => (b.detail ? `${b.label} (${b.detail})` : b.label))
            .join(' · ')}`,
        );
      }
    }

    await this.prisma.client.employeeOnboarding.update({
      where: { id: row.id },
      data: {
        outcome: result,
        outcomeAt: new Date(),
        outcomeById: actorId,
        outcomeNote: typeof body.note === 'string' ? body.note.trim() || null : null,
      },
    });
    return this.status(accountId, employeeId);
  }

  /**
   * Sinovda turganlar — menejer navbati (TZ §6.3 «baholash sanasi»).
   *
   * Faktlar BATCH o'qiladi (ikki so'rov), sahifa boshiga N+1 emas: navbat
   * menejer bosh ekranida turadi va har ochilishda o'nlab so'rov yuborishi
   * mumkin emas edi.
   */
  async listDue(accountId: string, now: Date = new Date()) {
    const rows = await this.prisma.client.employeeOnboarding.findMany({
      where: { accountId, outcome: null },
      orderBy: [{ evaluationOn: 'asc' }, { probationEndsOn: 'asc' }],
      select: {
        id: true,
        employeeId: true,
        probationStartsOn: true,
        probationEndsOn: true,
        evaluationOn: true,
        startedAt: true,
        items: true,
        employee: { select: { id: true, name: true } },
      },
    });
    if (rows.length === 0) return { items: [], total: 0, warnCount: 0 };

    const ids = rows.map((r) => r.employeeId);
    const [employees, profiles] = await Promise.all([
      this.prisma.client.employee.findMany({
        where: { accountId, id: { in: ids } },
        select: {
          id: true,
          archived: true,
          passwordHash: true,
          hrRoles: true,
          telegramChatId: true,
          positionId: true,
        },
      }),
      this.prisma.client.kpiProfile.findMany({
        where: { accountId, archived: false },
        select: { employeeId: true, positionId: true },
      }),
    ]);
    const byId = new Map(employees.map((e) => [e.id, e]));

    const items = rows.map((r) => {
      const emp = byId.get(r.employeeId);
      // Xodim topilmasa (poyga: o'chirilgan) — ro'yxat yiqilmaydi, band
      // ochiq ko'rinadi va qator baribir menejerga ko'rinib turadi.
      const facts: OnboardingAutoFacts = emp
        ? toFacts(emp, profiles)
        : { hasPassword: false, roleCount: 0, hasKpiProfile: false, telegramChatId: null };
      const progress = onboardingProgress(facts, toManual(r.items));
      const probation = probationStatus(
        { probationEndsOn: r.probationEndsOn, evaluationOn: r.evaluationOn, outcome: null },
        now,
      );
      return {
        id: r.id,
        employee: r.employee,
        probationStartsOn: r.probationStartsOn,
        probationEndsOn: r.probationEndsOn,
        startedAt: r.startedAt,
        state: probation.state,
        evaluationDate: probation.evaluationDate,
        daysLeft: probation.daysLeft,
        warn: probation.warn,
        doneCount: progress.doneCount,
        total: progress.total,
        canPass: progress.canPass,
        blockers: progress.blockers.map((b: OnboardingItemStatus) => ({
          key: b.key,
          label: b.label,
          detail: b.detail,
        })),
      };
    });

    return { items, total: items.length, warnCount: items.filter((i) => i.warn).length };
  }
}

const ROW_SELECT = {
  id: true,
  probationStartsOn: true,
  probationEndsOn: true,
  evaluationOn: true,
  outcome: true,
  outcomeAt: true,
  outcomeNote: true,
  items: true,
  startedAt: true,
  startedBy: { select: { id: true, name: true } },
  decidedBy: { select: { id: true, name: true } },
} as const;

interface OnboardingRow {
  id: string;
  probationStartsOn: Date | null;
  probationEndsOn: Date | null;
  evaluationOn: Date | null;
  outcome: string | null;
  outcomeAt: Date | null;
  outcomeNote: string | null;
  items: unknown;
  startedAt: Date;
  startedBy: { id: string; name: string } | null;
  decidedBy: { id: string; name: string } | null;
}

function toFacts(
  emp: {
    id: string;
    passwordHash: string;
    hrRoles: string[];
    telegramChatId: string | null;
    positionId: string | null;
  },
  profiles: ReadonlyArray<{ employeeId: string | null; positionId: string | null }>,
): OnboardingAutoFacts {
  return {
    // Bo'sh satr — sxemadagi default (`@default("")`), ya'ni parol YO'Q.
    hasPassword: emp.passwordHash.length > 0,
    roleCount: emp.hrRoles.length,
    hasKpiProfile: hasResolvableKpiProfile(profiles, { id: emp.id, positionId: emp.positionId }),
    telegramChatId: emp.telegramChatId ?? null,
  };
}

/** JSON → qo'lda tasdiqlar; buzuq qiymat bo'sh holat (jarayon to'xtamasin). */
function toManual(items: unknown): OnboardingManualState {
  if (items === null || typeof items !== 'object') return {};
  const out: OnboardingManualState = {};
  for (const [k, v] of Object.entries(items as Record<string, unknown>)) {
    if (v === null || typeof v !== 'object') continue;
    const raw = (v as { doneAt?: unknown }).doneAt;
    const d = typeof raw === 'string' || raw instanceof Date ? new Date(raw) : null;
    if (!d || Number.isNaN(d.getTime())) continue;
    out[k] = { doneAt: d, byId: String((v as { byId?: unknown }).byId ?? '') || null };
  }
  return out;
}

/**
 * `YYYY-MM-DD` → DATE ustuni uchun UTC yarim tun yorlig'i.
 *
 * Xom `new Date(str)` bilan bo'lmaydi: `'2026-09-01'` UTC yarim tun beradi-yu,
 * `'2026-09-01T00:00:00'` mahalliy yarim tunni beradi va Toshkentda kun bir
 * kunga orqaga siljib ketardi.
 */
function parseDate(v: unknown, what: string): Date | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v !== 'string') throw new BadRequestException(`${what} noto'g'ri`);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (!m) throw new BadRequestException(`${what} noto'g'ri: ${v}`);
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) throw new BadRequestException(`${what} noto'g'ri: ${v}`);
  return d;
}

export { ONBOARDING_ITEM };
