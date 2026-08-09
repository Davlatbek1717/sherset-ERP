import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LIFECYCLE_STAGE, ONBOARDING_ITEM, PROBATION_STATE } from './onboarding.js';
import { OnboardingService } from './onboarding.service.js';

/**
 * MK02 — ishga qabul tomoni (sinov muddati), TZ §6.3.
 *
 * Bu yerdagi testlar aynan **chetlab o'tish yo'llarini** qulflaydi: qo'lda
 * soxta belgilash · ro'yxatsiz «o'tdi» · eskirgan ekran holatiga ishonib qaror
 * qabul qilish · «o'tmadi» orqali bo'shatish ro'yxatini aylanib o'tish.
 */

const ALL_MANUAL_DONE = {
  [ONBOARDING_ITEM.workplaceReady]: { doneAt: '2026-08-01T00:00:00.000Z', byId: 'm1' },
  [ONBOARDING_ITEM.documentsSigned]: { doneAt: '2026-08-01T00:00:00.000Z', byId: 'm1' },
};

function makeDeps() {
  const prisma = {
    client: {
      employee: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
      kpiProfile: { findMany: vi.fn() },
      employeeOffboarding: { findFirst: vi.fn() },
      employeeOnboarding: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        upsert: vi.fn(),
        update: vi.fn(),
      },
    },
  };
  return { prisma };
}

/** Hamma avtomatik band yopiq bo'lgan xodim. */
function readyEmployee(over: Record<string, unknown> = {}) {
  return {
    id: 'e1',
    archived: false,
    passwordHash: 'bcrypt$xxx',
    hrRoles: ['seller'],
    telegramChatId: '12345',
    positionId: 'p1',
    ...over,
  };
}

describe('OnboardingService', () => {
  let deps: ReturnType<typeof makeDeps>;
  let service: OnboardingService;

  beforeEach(() => {
    deps = makeDeps();
    service = new OnboardingService(deps.prisma as never);
    deps.prisma.client.employee.findFirst.mockResolvedValue(readyEmployee() as never);
    deps.prisma.client.kpiProfile.findMany.mockResolvedValue([
      { employeeId: null, positionId: 'p1' },
    ] as never);
    deps.prisma.client.employeeOffboarding.findFirst.mockResolvedValue(null as never);
    deps.prisma.client.employeeOnboarding.findFirst.mockResolvedValue({
      id: 'on1',
      probationStartsOn: new Date('2026-08-01T00:00:00.000Z'),
      probationEndsOn: new Date('2026-09-01T00:00:00.000Z'),
      evaluationOn: null,
      outcome: null,
      outcomeAt: null,
      outcomeNote: null,
      startedAt: new Date('2026-08-01T00:00:00.000Z'),
      startedBy: null,
      decidedBy: null,
      items: ALL_MANUAL_DONE,
    } as never);
  });

  // ── status ────────────────────────────────────────────────────────────────

  describe('status', () => {
    it('natija belgilanmagan xodim SINOVDA (MK02 test-2)', async () => {
      const s = await service.status('acc1', 'e1');
      expect(s.started).toBe(true);
      expect(s.outcome).toBeNull();
      expect(s.lifecycleStage).toBe(LIFECYCLE_STAGE.probation);
      expect(s.state).toBe(PROBATION_STATE.inProbation);
    });

    it('sinov jarayoni yo`q xodim FAOL — backfill yo`q', async () => {
      // Butun mavjud jamoa bir kechada «sinovda» bo'lib qolmasligi kerak.
      deps.prisma.client.employeeOnboarding.findFirst.mockResolvedValue(null as never);
      const s = await service.status('acc1', 'e1');
      expect(s.started).toBe(false);
      expect(s.lifecycleStage).toBe(LIFECYCLE_STAGE.active);
      expect(s.state).toBe(PROBATION_STATE.none);
      // Auto bandlar baribir hisoblanadi (qatorsiz ham ma'lumot sifati ko'rinadi).
      expect(s.items.find((i) => i.key === ONBOARDING_ITEM.rolesAssigned)?.done).toBe(true);
      // Qo'lda bandlar tasdiqlanmagan ⇒ «o'tdi» yopilmaydi.
      expect(s.canPass).toBe(false);
    });

    it('mavjud bo`lmagan xodim → NotFound', async () => {
      deps.prisma.client.employee.findFirst.mockResolvedValue(null as never);
      await expect(service.status('acc1', 'yoq')).rejects.toThrow(/topilmadi/i);
    });

    it('bo`shatish boshlangan bo`lsa hayot sikli BO`SHATISH', async () => {
      deps.prisma.client.employeeOffboarding.findFirst.mockResolvedValue({
        id: 'off1',
        completedAt: null,
      } as never);
      const s = await service.status('acc1', 'e1');
      expect(s.lifecycleStage).toBe(LIFECYCLE_STAGE.offboarding);
    });
  });

  // ── start ─────────────────────────────────────────────────────────────────

  describe('start — sinov muddatini belgilash', () => {
    it('sanalarni yozadi', async () => {
      await service.start('acc1', 'm1', 'e1', {
        probationStartsOn: '2026-08-01',
        probationEndsOn: '2026-09-01',
        evaluationOn: '2026-08-28',
      });
      const arg = deps.prisma.client.employeeOnboarding.upsert.mock.calls[0]?.[0] as {
        create: { probationEndsOn: Date; evaluationOn: Date };
      };
      expect(arg.create.probationEndsOn.toISOString()).toBe('2026-09-01T00:00:00.000Z');
      expect(arg.create.evaluationOn.toISOString()).toBe('2026-08-28T00:00:00.000Z');
    });

    it('tugash sanasi boshlanishdan OLDIN bo`lsa rad etiladi', async () => {
      await expect(
        service.start('acc1', 'm1', 'e1', {
          probationStartsOn: '2026-09-01',
          probationEndsOn: '2026-08-01',
        }),
      ).rejects.toThrow(/muddat/i);
      expect(deps.prisma.client.employeeOnboarding.upsert).not.toHaveBeenCalled();
    });

    it('baholash sanasi sinov boshlanishidan oldin bo`lsa rad etiladi', async () => {
      await expect(
        service.start('acc1', 'm1', 'e1', {
          probationStartsOn: '2026-09-01',
          probationEndsOn: '2026-10-01',
          evaluationOn: '2026-08-01',
        }),
      ).rejects.toThrow(/baholash/i);
    });

    it('takroriy chaqiruvda tasdiqlangan bandlar TOZALANMAYDI', async () => {
      // Aks holda «sanani tuzatdim» degan bir bosish butun ishni qaytadan
      // boshlatib yuborardi.
      await service.start('acc1', 'm1', 'e1', { probationEndsOn: '2026-09-15' });
      const arg = deps.prisma.client.employeeOnboarding.upsert.mock.calls[0]?.[0] as {
        update: Record<string, unknown>;
      };
      expect(arg.update).not.toHaveProperty('items');
    });

    it('berilmagan sana TEGILMAYDI — qisman tana qiymatni o`chirmaydi', async () => {
      // Faqat `probationEndsOn` yuborilsa, oldin qo'yilgan boshlanish va
      // baholash sanalari NULL ga aylanib ketmasligi kerak.
      await service.start('acc1', 'm1', 'e1', { probationEndsOn: '2026-09-15' });
      const arg = deps.prisma.client.employeeOnboarding.upsert.mock.calls[0]?.[0] as {
        update: Record<string, unknown>;
      };
      expect(Object.keys(arg.update)).toEqual(['probationEndsOn']);
    });

    it('sanani OSHKORA null bilan tozalash mumkin', async () => {
      await service.start('acc1', 'm1', 'e1', { evaluationOn: null });
      const arg = deps.prisma.client.employeeOnboarding.upsert.mock.calls[0]?.[0] as {
        update: Record<string, unknown>;
      };
      expect(arg.update).toEqual({ evaluationOn: null });
    });

    it('yolg`iz kelgan tugash sanasi BAZADAGI boshlanish bilan solishtiriladi', async () => {
      // Faqat kelgan maydonlarni o'zaro solishtirish teshik qoldirardi.
      deps.prisma.client.employeeOnboarding.findFirst.mockResolvedValue({
        id: 'on1',
        outcome: null,
        probationStartsOn: new Date('2026-09-01T00:00:00.000Z'),
        probationEndsOn: null,
        evaluationOn: null,
        items: {},
      } as never);
      await expect(
        service.start('acc1', 'm1', 'e1', { probationEndsOn: '2026-08-01' }),
      ).rejects.toThrow(/muddat/i);
      expect(deps.prisma.client.employeeOnboarding.upsert).not.toHaveBeenCalled();
    });

    it('natija belgilangach muddatni o`zgartirib bo`lmaydi', async () => {
      deps.prisma.client.employeeOnboarding.findFirst.mockResolvedValue({
        id: 'on1',
        outcome: 'passed',
        items: ALL_MANUAL_DONE,
      } as never);
      await expect(
        service.start('acc1', 'm1', 'e1', { probationEndsOn: '2026-12-01' }),
      ).rejects.toThrow(/natija/i);
    });

    it('arxivlangan xodimga sinov muddati belgilanmaydi', async () => {
      deps.prisma.client.employee.findFirst.mockResolvedValue(
        readyEmployee({ archived: true }) as never,
      );
      await expect(
        service.start('acc1', 'm1', 'e1', { probationEndsOn: '2026-09-01' }),
      ).rejects.toThrow(/arxiv/i);
    });
  });

  // ── markItem ──────────────────────────────────────────────────────────────

  describe('markItem — qo`lda soxta belgilash (MK02 test-3)', () => {
    it('AUTO bandni qo`lda belgilash RAD etiladi', async () => {
      await expect(
        service.markItem('acc1', 'm1', 'e1', { key: ONBOARDING_ITEM.rolesAssigned }),
      ).rejects.toThrow(/qo`lda|qo'lda/);
      expect(deps.prisma.client.employeeOnboarding.update).not.toHaveBeenCalled();
    });

    it('noma`lum band rad etiladi', async () => {
      await expect(service.markItem('acc1', 'm1', 'e1', { key: 'yoq' })).rejects.toThrow(
        /noma`lum|noma'lum/i,
      );
    });

    it('QO`LDA band belgilanadi', async () => {
      deps.prisma.client.employeeOnboarding.findFirst.mockResolvedValue({
        id: 'on1',
        outcome: null,
        items: {},
      } as never);
      await service.markItem('acc1', 'm1', 'e1', { key: ONBOARDING_ITEM.workplaceReady });
      const arg = deps.prisma.client.employeeOnboarding.update.mock.calls[0]?.[0] as {
        data: { items: Record<string, { byId: string }> };
      };
      expect(arg.data.items[ONBOARDING_ITEM.workplaceReady]?.byId).toBe('m1');
    });

    it('jarayon boshlanmagan bo`lsa → NotFound', async () => {
      deps.prisma.client.employeeOnboarding.findFirst.mockResolvedValue(null as never);
      await expect(
        service.markItem('acc1', 'm1', 'e1', { key: ONBOARDING_ITEM.workplaceReady }),
      ).rejects.toThrow(/boshlanmagan/i);
    });

    it('natija belgilangach band o`zgartirilmaydi', async () => {
      deps.prisma.client.employeeOnboarding.findFirst.mockResolvedValue({
        id: 'on1',
        outcome: 'passed',
        items: {},
      } as never);
      await expect(
        service.markItem('acc1', 'm1', 'e1', { key: ONBOARDING_ITEM.workplaceReady }),
      ).rejects.toThrow(/natija/i);
    });
  });

  // ── setOutcome ────────────────────────────────────────────────────────────

  describe('setOutcome — sinov natijasi', () => {
    it('ro`yxat bajarilmagan bo`lsa «o`tdi» RAD etiladi va sabab ko`rsatiladi', async () => {
      deps.prisma.client.employee.findFirst.mockResolvedValue(
        readyEmployee({ hrRoles: [] }) as never,
      );
      await expect(service.setOutcome('acc1', 'm1', 'e1', { result: 'passed' })).rejects.toThrow(
        /Rollar berilgan/,
      );
      expect(deps.prisma.client.employeeOnboarding.update).not.toHaveBeenCalled();
    });

    it('«o`tdi» faktlarni QAYTA o`qiydi — eskirgan ekranga ishonilmaydi', async () => {
      // Menejer ekranni ochib turgan payt rol olib qo'yilishi mumkin.
      await service.setOutcome('acc1', 'm1', 'e1', { result: 'passed' });
      expect(deps.prisma.client.employee.findFirst).toHaveBeenCalled();
      expect(deps.prisma.client.kpiProfile.findMany).toHaveBeenCalled();
    });

    it('ro`yxat to`liq bo`lsa «o`tdi» yoziladi', async () => {
      await service.setOutcome('acc1', 'm1', 'e1', { result: 'passed', note: 'yaxshi' });
      const arg = deps.prisma.client.employeeOnboarding.update.mock.calls[0]?.[0] as {
        data: { outcome: string; outcomeById: string; outcomeNote: string; outcomeAt: Date };
      };
      expect(arg.data.outcome).toBe('passed');
      expect(arg.data.outcomeById).toBe('m1');
      expect(arg.data.outcomeNote).toBe('yaxshi');
      expect(arg.data.outcomeAt).toBeInstanceOf(Date);
    });

    it('«o`tmadi» ro`yxat bajarilmagan bo`lsa ham qabul qilinadi', async () => {
      // Hujjati imzolanmagan odamni bo'shatish uchun avval hujjatini
      // imzolatish talab qilinsa — ro'yxat qopqonga aylanardi.
      deps.prisma.client.employee.findFirst.mockResolvedValue(
        readyEmployee({ hrRoles: [], passwordHash: '' }) as never,
      );
      await service.setOutcome('acc1', 'm1', 'e1', { result: 'failed', note: 'kelmadi' });
      const arg = deps.prisma.client.employeeOnboarding.update.mock.calls[0]?.[0] as {
        data: { outcome: string };
      };
      expect(arg.data.outcome).toBe('failed');
    });

    it('«o`tmadi» xodimni ARXIVLAMAYDI — bo`shatish ro`yxati chetlab o`tilmaydi', async () => {
      // Yozuvdan KEYINGI o'qish yangi holatni ko'radi (mock jonli emas —
      // qo'lda simulyatsiya qilinadi).
      deps.prisma.client.employeeOnboarding.update.mockImplementation(async () => {
        deps.prisma.client.employeeOnboarding.findFirst.mockResolvedValue({
          id: 'on1',
          outcome: 'failed',
          outcomeAt: new Date('2026-08-10T00:00:00.000Z'),
          items: ALL_MANUAL_DONE,
        } as never);
        return {} as never;
      });
      const s = await service.setOutcome('acc1', 'm1', 'e1', { result: 'failed' });
      expect(deps.prisma.client.employee.update).not.toHaveBeenCalled();
      expect(s.lifecycleStage).toBe(LIFECYCLE_STAGE.probationFailed);
    });

    it('noma`lum natija rad etiladi', async () => {
      await expect(service.setOutcome('acc1', 'm1', 'e1', { result: 'balki' })).rejects.toThrow(
        /natija/i,
      );
    });

    it('takroriy BIR XIL natija idempotent', async () => {
      deps.prisma.client.employeeOnboarding.findFirst.mockResolvedValue({
        id: 'on1',
        outcome: 'passed',
        outcomeAt: new Date('2026-08-05T00:00:00.000Z'),
        items: ALL_MANUAL_DONE,
      } as never);
      const s = await service.setOutcome('acc1', 'm1', 'e1', { result: 'passed' });
      expect(deps.prisma.client.employeeOnboarding.update).not.toHaveBeenCalled();
      expect(s.outcome).toBe('passed');
    });

    it('natijani BOSHQASIGA jimgina almashtirib bo`lmaydi', async () => {
      deps.prisma.client.employeeOnboarding.findFirst.mockResolvedValue({
        id: 'on1',
        outcome: 'failed',
        items: ALL_MANUAL_DONE,
      } as never);
      await expect(service.setOutcome('acc1', 'm1', 'e1', { result: 'passed' })).rejects.toThrow(
        /natija/i,
      );
    });

    it('jarayon boshlanmagan bo`lsa → NotFound', async () => {
      deps.prisma.client.employeeOnboarding.findFirst.mockResolvedValue(null as never);
      await expect(service.setOutcome('acc1', 'm1', 'e1', { result: 'passed' })).rejects.toThrow(
        /boshlanmagan/i,
      );
    });
  });

  // ── listDue ───────────────────────────────────────────────────────────────

  describe('listDue — sinovda turganlar navbati (MK02 test-1)', () => {
    beforeEach(() => {
      deps.prisma.client.employee.findMany.mockResolvedValue([
        readyEmployee({ id: 'e1' }),
        readyEmployee({ id: 'e2', hrRoles: [] }),
      ] as never);
    });

    it('baholash sanasi yaqinlashganda OGOHLANTIRISH chiqadi', async () => {
      const now = new Date('2026-08-10T12:00:00.000+05:00');
      deps.prisma.client.employeeOnboarding.findMany.mockResolvedValue([
        {
          id: 'on1',
          employeeId: 'e1',
          probationEndsOn: new Date('2026-08-14T00:00:00.000Z'),
          evaluationOn: null,
          outcome: null,
          startedAt: now,
          employee: { id: 'e1', name: 'Ali' },
        },
        {
          id: 'on2',
          employeeId: 'e2',
          probationEndsOn: new Date('2026-12-01T00:00:00.000Z'),
          evaluationOn: null,
          outcome: null,
          startedAt: now,
          employee: { id: 'e2', name: 'Vali' },
        },
      ] as never);

      const res = await service.listDue('acc1', now);
      expect(res.total).toBe(2);
      expect(res.warnCount).toBe(1);
      const ali = res.items.find((i) => i.employee.id === 'e1');
      expect(ali?.warn).toBe(true);
      expect(ali?.daysLeft).toBe(4);
      expect(res.items.find((i) => i.employee.id === 'e2')?.warn).toBe(false);
    });

    it('faqat natijasi BELGILANMAGAN qatorlar so`raladi', async () => {
      deps.prisma.client.employeeOnboarding.findMany.mockResolvedValue([] as never);
      await service.listDue('acc1', new Date('2026-08-10T12:00:00.000+05:00'));
      const arg = deps.prisma.client.employeeOnboarding.findMany.mock.calls[0]?.[0] as {
        where: { accountId: string; outcome: null };
      };
      expect(arg.where.accountId).toBe('acc1');
      expect(arg.where.outcome).toBeNull();
    });

    it('qolgan bloklovchi bandlar ro`yxatda ko`rinadi', async () => {
      const now = new Date('2026-08-10T12:00:00.000+05:00');
      deps.prisma.client.employeeOnboarding.findMany.mockResolvedValue([
        {
          id: 'on2',
          employeeId: 'e2',
          probationEndsOn: new Date('2026-08-14T00:00:00.000Z'),
          evaluationOn: null,
          outcome: null,
          startedAt: now,
          items: ALL_MANUAL_DONE,
          employee: { id: 'e2', name: 'Vali' },
        },
      ] as never);
      const res = await service.listDue('acc1', now);
      expect(res.items[0]?.blockers.map((b) => b.key)).toEqual([ONBOARDING_ITEM.rolesAssigned]);
      expect(res.items[0]?.canPass).toBe(false);
    });

    it('bo`sh navbat — qo`shimcha so`rov qilinmaydi', async () => {
      deps.prisma.client.employeeOnboarding.findMany.mockResolvedValue([] as never);
      const res = await service.listDue('acc1', new Date('2026-08-10T12:00:00.000+05:00'));
      expect(res.items).toEqual([]);
      expect(res.warnCount).toBe(0);
      expect(deps.prisma.client.employee.findMany).not.toHaveBeenCalled();
    });
  });
});
