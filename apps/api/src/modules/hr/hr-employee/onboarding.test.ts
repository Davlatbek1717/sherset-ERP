import { describe, expect, it } from 'vitest';
import { ITEM_KIND } from './offboarding.js';
import {
  EVALUATION_WARN_DAYS,
  LIFECYCLE_STAGE,
  ONBOARDING_ITEM,
  ONBOARDING_ITEMS,
  type OnboardingAutoFacts,
  PROBATION_STATE,
  canMarkOnboardingManually,
  dateLabel,
  hasResolvableKpiProfile,
  lifecycleStage,
  onboardingItemDef,
  onboardingProgress,
  probationStatus,
} from './onboarding.js';

/** Hamma avtomatik band YOPILGAN holat — testlar shundan chetlanadi. */
const READY: OnboardingAutoFacts = {
  hasPassword: true,
  roleCount: 2,
  hasKpiProfile: true,
  telegramChatId: '12345',
};

const ALL_MANUAL = {
  [ONBOARDING_ITEM.workplaceReady]: { doneAt: new Date(2026, 7, 6), byId: 'm1' },
  [ONBOARDING_ITEM.documentsSigned]: { doneAt: new Date(2026, 7, 6), byId: 'm1' },
};

/** `@db.Date` ko'rinishi — UTC yarim tun yorlig'i. */
const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
/** Toshkent kunining o'rtasi — yorliq hisobini instant chalg'itmasligi shart. */
const at = (iso: string, hhmm = '12:00') => new Date(`${iso}T${hhmm}:00.000+05:00`);

describe('ro`yxat tarkibi — offboarding naqshi', () => {
  it('oltita band', () => {
    expect(ONBOARDING_ITEMS).toHaveLength(6);
  });

  it('tizim biladigan bandlar AUTO', () => {
    // Parol, rollar, KPI profili, Telegram — hammasini tizim ko'radi,
    // demak ularni odamdan SO'RAMAYMIZ.
    for (const k of [
      ONBOARDING_ITEM.credentialsIssued,
      ONBOARDING_ITEM.rolesAssigned,
      ONBOARDING_ITEM.kpiProfileAssigned,
      ONBOARDING_ITEM.telegramBound,
    ]) {
      expect(onboardingItemDef(k)?.kind).toBe(ITEM_KIND.auto);
    }
  });

  it('jismoniy narsalar QO`LDA', () => {
    expect(onboardingItemDef(ONBOARDING_ITEM.workplaceReady)?.kind).toBe(ITEM_KIND.manual);
    expect(onboardingItemDef(ONBOARDING_ITEM.documentsSigned)?.kind).toBe(ITEM_KIND.manual);
  });

  it('Telegram YAGONA ixtiyoriy band', () => {
    // Har xodimga Telegram shart emas (omborchi telefonsiz ishlaydi) —
    // qolgan hammasi bloklovchi.
    const optional = ONBOARDING_ITEMS.filter((i) => !i.blocking).map((i) => i.key);
    expect(optional).toEqual([ONBOARDING_ITEM.telegramBound]);
  });

  it('noma`lum kalit → null', () => {
    expect(onboardingItemDef('yoq-bunday')).toBeNull();
  });
});

describe('canMarkOnboardingManually — qo`lda soxta belgilash rad etiladi', () => {
  it('AUTO bandni qo`lda belgilab bo`lmaydi', () => {
    // MK02 test-3. Aks holda odam «rollar berildi» deb belgilardi,
    // xodim esa ruxsatsiz qolaverardi va birinchi ish kuni yo'qolardi.
    expect(canMarkOnboardingManually(ONBOARDING_ITEM.credentialsIssued)).toBe(false);
    expect(canMarkOnboardingManually(ONBOARDING_ITEM.rolesAssigned)).toBe(false);
    expect(canMarkOnboardingManually(ONBOARDING_ITEM.kpiProfileAssigned)).toBe(false);
    expect(canMarkOnboardingManually(ONBOARDING_ITEM.telegramBound)).toBe(false);
  });

  it('QO`LDA bandni belgilash mumkin', () => {
    expect(canMarkOnboardingManually(ONBOARDING_ITEM.workplaceReady)).toBe(true);
    expect(canMarkOnboardingManually(ONBOARDING_ITEM.documentsSigned)).toBe(true);
  });

  it('noma`lum kalit rad etiladi', () => {
    expect(canMarkOnboardingManually('yoq-bunday')).toBe(false);
  });
});

describe('onboardingProgress — auto bandlar HAR SAFAR qayta tekshiriladi', () => {
  it('hammasi tayyor bo`lsa sinovni yopish mumkin', () => {
    const p = onboardingProgress(READY, ALL_MANUAL);
    expect(p.canPass).toBe(true);
    expect(p.blockers).toHaveLength(0);
    expect(p.doneCount).toBe(6);
    expect(p.total).toBe(6);
  });

  it('parol berilmagan bo`lsa band ochiq va sinov yopilmaydi', () => {
    const p = onboardingProgress({ ...READY, hasPassword: false }, ALL_MANUAL);
    expect(p.canPass).toBe(false);
    expect(p.blockers.map((b) => b.key)).toEqual([ONBOARDING_ITEM.credentialsIssued]);
  });

  it('rol berilmagan bo`lsa detal soni bilan ko`rsatiladi', () => {
    const p = onboardingProgress({ ...READY, roleCount: 0 }, ALL_MANUAL);
    expect(p.canPass).toBe(false);
    const item = p.items.find((i) => i.key === ONBOARDING_ITEM.rolesAssigned);
    expect(item?.done).toBe(false);
    expect(item?.detail).toBe('rol berilmagan');
  });

  it('KPI profili yo`q bo`lsa sinov yopilmaydi', () => {
    // Profilsiz xodimning kunlik KPI'si hisoblanmaydi — uni «baholadim»
    // deyish mumkin emas, chunki baholaydigan raqam yo'q.
    const p = onboardingProgress({ ...READY, hasKpiProfile: false }, ALL_MANUAL);
    expect(p.canPass).toBe(false);
    expect(p.blockers.map((b) => b.key)).toContain(ONBOARDING_ITEM.kpiProfileAssigned);
  });

  it('Telegram ulanmagan bo`lsa band ochiq, lekin BLOKLAMAYDI', () => {
    const p = onboardingProgress({ ...READY, telegramChatId: null }, ALL_MANUAL);
    expect(p.items.find((i) => i.key === ONBOARDING_ITEM.telegramBound)?.done).toBe(false);
    expect(p.canPass).toBe(true);
    expect(p.doneCount).toBe(5);
  });

  it('qo`lda band tasdiqlanmagan bo`lsa sinov yopilmaydi', () => {
    const p = onboardingProgress(READY, {});
    expect(p.canPass).toBe(false);
    expect(p.blockers.map((b) => b.key)).toEqual([
      ONBOARDING_ITEM.workplaceReady,
      ONBOARDING_ITEM.documentsSigned,
    ]);
  });

  it('auto band bir marta yopilib keyin ochilsa QAYTA ochiq ko`rinadi', () => {
    // Rol olib qo'yilsa — «bir marta bajarilgan» deb yozilgan snapshot
    // buni yashirardi.
    const before = onboardingProgress(READY, ALL_MANUAL);
    expect(before.canPass).toBe(true);
    const after = onboardingProgress({ ...READY, roleCount: 0 }, ALL_MANUAL);
    expect(after.canPass).toBe(false);
  });
});

describe('hasResolvableKpiProfile — xodim → lavozim → sukut', () => {
  const emp = { id: 'e1', positionId: 'p1' };

  it('individual profil topiladi', () => {
    expect(hasResolvableKpiProfile([{ employeeId: 'e1', positionId: null }], emp)).toBe(true);
  });

  it('lavozim profili topiladi', () => {
    expect(hasResolvableKpiProfile([{ employeeId: null, positionId: 'p1' }], emp)).toBe(true);
  });

  it('sukut profil (lavozimsiz) hammaga yaraydi', () => {
    expect(hasResolvableKpiProfile([{ employeeId: null, positionId: null }], emp)).toBe(true);
  });

  it('BOSHQA xodimning yoki BOSHQA lavozimning profili sanalmaydi', () => {
    expect(
      hasResolvableKpiProfile(
        [
          { employeeId: 'e2', positionId: null },
          { employeeId: null, positionId: 'p2' },
        ],
        emp,
      ),
    ).toBe(false);
  });

  it('lavozimsiz xodim faqat sukut profil bilan yopiladi', () => {
    const noPos = { id: 'e9', positionId: null };
    expect(hasResolvableKpiProfile([{ employeeId: null, positionId: 'p1' }], noPos)).toBe(false);
    expect(hasResolvableKpiProfile([{ employeeId: null, positionId: null }], noPos)).toBe(true);
  });

  it('profil umuman yo`q → false', () => {
    expect(hasResolvableKpiProfile([], emp)).toBe(false);
  });
});

describe('dateLabel — Toshkent kalendar kuni, instant EMAS', () => {
  it('kechqurun 23:00 (Toshkent) hamon O`SHA kun', () => {
    // Xom UTC bilan hisoblansa 18:00 UTC → keyingi kun chiqib, ogohlantirish
    // bir kun oldin otilardi.
    expect(dateLabel(at('2026-08-10', '23:00')).toISOString()).toBe('2026-08-10T00:00:00.000Z');
  });

  it('ertalab 00:30 (Toshkent) yangi kun', () => {
    expect(dateLabel(at('2026-08-11', '00:30')).toISOString()).toBe('2026-08-11T00:00:00.000Z');
  });
});

describe('probationStatus — baholash sanasi ogohlantirishi (MK02 test-1)', () => {
  const base = { probationEndsOn: null, evaluationOn: null, outcome: null };

  it('sana yo`q → ogohlantirish yo`q', () => {
    const s = probationStatus(base, at('2026-08-10'));
    expect(s.state).toBe(PROBATION_STATE.none);
    expect(s.daysLeft).toBeNull();
    expect(s.warn).toBe(false);
  });

  it('baholash sanasi berilmasa sinov tugash sanasi ishlatiladi', () => {
    // TZ §6.3: baholash — sinov muddati tugagan kuni.
    const s = probationStatus({ ...base, probationEndsOn: d('2026-09-01') }, at('2026-08-10'));
    expect(s.evaluationDate?.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(s.daysLeft).toBe(22);
    expect(s.state).toBe(PROBATION_STATE.inProbation);
    expect(s.warn).toBe(false);
  });

  it('alohida baholash sanasi tugash sanasidan USTUN', () => {
    const s = probationStatus(
      { ...base, probationEndsOn: d('2026-09-01'), evaluationOn: d('2026-08-25') },
      at('2026-08-10'),
    );
    expect(s.evaluationDate?.toISOString()).toBe('2026-08-25T00:00:00.000Z');
    expect(s.daysLeft).toBe(15);
  });

  it(`N kun (${EVALUATION_WARN_DAYS}) qolganda OGOHLANTIRISH chiqadi`, () => {
    const s = probationStatus({ ...base, evaluationOn: d('2026-08-17') }, at('2026-08-10'));
    expect(s.daysLeft).toBe(EVALUATION_WARN_DAYS);
    expect(s.state).toBe(PROBATION_STATE.dueSoon);
    expect(s.warn).toBe(true);
  });

  it('N+1 kun qolganda hali ogohlantirish YO`Q — chegara aniq', () => {
    const s = probationStatus({ ...base, evaluationOn: d('2026-08-18') }, at('2026-08-10'));
    expect(s.daysLeft).toBe(EVALUATION_WARN_DAYS + 1);
    expect(s.state).toBe(PROBATION_STATE.inProbation);
    expect(s.warn).toBe(false);
  });

  it('bugun baholash kuni', () => {
    const s = probationStatus({ ...base, evaluationOn: d('2026-08-10') }, at('2026-08-10'));
    expect(s.daysLeft).toBe(0);
    expect(s.state).toBe(PROBATION_STATE.due);
    expect(s.warn).toBe(true);
  });

  it('sana o`tib ketgan, natija belgilanmagan → KECHIKKAN', () => {
    // Bu eng muhim holat: «unutildi» — xodim muddatsiz sinovda qolib ketardi.
    const s = probationStatus({ ...base, evaluationOn: d('2026-08-01') }, at('2026-08-10'));
    expect(s.daysLeft).toBe(-9);
    expect(s.state).toBe(PROBATION_STATE.overdue);
    expect(s.warn).toBe(true);
  });

  it('natija belgilangach ogohlantirish TO`XTAYDI', () => {
    const passed = probationStatus(
      { ...base, evaluationOn: d('2026-08-01'), outcome: 'passed' },
      at('2026-08-10'),
    );
    expect(passed.state).toBe(PROBATION_STATE.passed);
    expect(passed.warn).toBe(false);

    const failed = probationStatus(
      { ...base, evaluationOn: d('2026-08-01'), outcome: 'failed' },
      at('2026-08-10'),
    );
    expect(failed.state).toBe(PROBATION_STATE.failed);
    expect(failed.warn).toBe(false);
  });
});

describe('lifecycleStage — hayot sikli (TZ §6.3)', () => {
  const base = {
    archived: false,
    offboardingStarted: false,
    onboardingStarted: false,
    probationOutcome: null as string | null,
  };

  it('sinov jarayoni yo`q xodim FAOL', () => {
    // Backfill yo'q: eski xodimlarda onboarding qatori yo'q va ular
    // «sinovda» bo'lib qolib ketmasligi kerak.
    expect(lifecycleStage(base)).toBe(LIFECYCLE_STAGE.active);
  });

  it('natija belgilanmagan xodim SINOVDA qoladi (MK02 test-2)', () => {
    expect(lifecycleStage({ ...base, onboardingStarted: true })).toBe(LIFECYCLE_STAGE.probation);
  });

  it('sinovdan o`tgan xodim FAOL', () => {
    expect(lifecycleStage({ ...base, onboardingStarted: true, probationOutcome: 'passed' })).toBe(
      LIFECYCLE_STAGE.active,
    );
  });

  it('sinovdan O`TMAGAN xodim avtomatik arxivlanmaydi — alohida holat', () => {
    // «O'tmadi» bo'shatish ro'yxatini CHETLAB O'TMAYDI: ochiq smena va
    // topshirilmagan naqd baribir yopilishi kerak.
    expect(lifecycleStage({ ...base, onboardingStarted: true, probationOutcome: 'failed' })).toBe(
      LIFECYCLE_STAGE.probationFailed,
    );
  });

  it('bo`shatish boshlangan bo`lsa u USTUN', () => {
    expect(
      lifecycleStage({
        ...base,
        onboardingStarted: true,
        probationOutcome: 'failed',
        offboardingStarted: true,
      }),
    ).toBe(LIFECYCLE_STAGE.offboarding);
  });

  it('arxivlangan hammasidan ustun', () => {
    expect(lifecycleStage({ ...base, archived: true, offboardingStarted: true })).toBe(
      LIFECYCLE_STAGE.archived,
    );
  });
});
