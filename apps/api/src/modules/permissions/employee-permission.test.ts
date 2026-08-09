/**
 * MK26 — xodim darajasidagi override qatlami: amaldagi ruxsat + G1 + G2.
 *
 * TZ: docs/superpowers/specs/2026-08-01-menejer-tz-design.md §3.1, §3.3.
 *
 * Bu fayl SOF qatlamni qulflaydi (Prisma yo'q, Nest yo'q, `Date.now()` yo'q) —
 * qaror mantiqi shu yerda, I/O servisda.
 *
 * Nega aynan shu testlar:
 *
 *  - **Override `MAX` EMAS, g'olib.** Rol qatlamiga `maxScope` qo'llansa
 *    «bitta xodimni cheklash» imkonsiz bo'lib qoladi (TZ §3.1 buni ochiq
 *    yozgan). Ya'ni override ko'taradi HAM, tushiradi HAM. Bu — sezgiga zid,
 *    shuning uchun ikki yo'nalish ham alohida testda.
 *  - **G1 ikki xil hujumni to'sadi:** (a) o'zida YO'Q ruxsatni berish,
 *    (b) o'zinikidan YUQORI scope tayinlash. Ikkalasi ham server tomonda
 *    (TZ §3.3: «UI'da yashirish yetarli emas»).
 *  - **G2 manbani ko'rsatadi.** Tushunarsiz ruxsat tizimi noto'g'ri
 *    sozlanadi — manba (`role` / `override` / `none`) xavfsizlik xususiyati.
 */
import { describe, expect, it } from 'vitest';
import {
  type EffectivePermission,
  type OverrideRow,
  type RoleGrant,
  applyOverride,
  checkGrantAllowed,
  explainPermission,
  resolveEffective,
} from './employee-permission.js';
import type { PermissionScope } from './permissions.types.js';

const role = (roleName: string, scope: PermissionScope): RoleGrant => ({ roleName, scope });

const override = (scope: PermissionScope, extra: Partial<OverrideRow> = {}): OverrideRow => ({
  scope,
  grantedAt: '2026-08-01T10:00:00.000Z',
  grantedByName: 'Admin',
  ...extra,
});

describe('MK26 §3.1 — amaldagi ruxsat: rol MAX → xodim override', () => {
  it("override yo'q: rol qatlami MAX(scope) bo'yicha hal qilinadi", () => {
    const eff = resolveEffective([role('Sotuvchi', 'OWN'), role('Savdo menejeri', 'ALL')], null);
    expect(eff.scope).toBe('ALL');
    expect(eff.source).toBe('role');
  });

  it("rol ham yo'q, override ham yo'q: NO (fail-closed) va manba `none`", () => {
    const eff = resolveEffective([], null);
    expect(eff.scope).toBe('NO');
    expect(eff.source).toBe('none');
  });

  it("override KO'TARADI — rol OWN bergan joyda xodimga ALL beriladi", () => {
    const eff = resolveEffective([role('Sotuvchi', 'OWN')], override('ALL'));
    expect(eff.scope).toBe('ALL');
    expect(eff.source).toBe('override');
  });

  it('override TUSHIRADI — rol ALL bergan joyda xodim OWN bilan cheklanadi', () => {
    // ⚠️ Aynan shu holat `maxScope` bilan buzilardi: MAX(ALL, OWN) = ALL, ya'ni
    // cheklash umuman ishlamas edi. TZ §3.1 shuning uchun «u g'olib» deydi.
    const eff = resolveEffective([role('Savdo menejeri', 'ALL')], override('OWN'));
    expect(eff.scope).toBe('OWN');
    expect(eff.source).toBe('override');
  });

  it("override `NO` — to'liq taqiq, roldan qat'i nazar (bo'sh qiymat deb tashlanmaydi)", () => {
    // `NO` — «yozuv yo'q» EMAS, «ataylab taqiqlangan». Sparse saqlashda
    // NO-qatorlar tashlansa bu holat jimgina yo'qoladi.
    const eff = resolveEffective([role('Administrator', 'ALL')], override('NO'));
    expect(eff.scope).toBe('NO');
    expect(eff.source).toBe('override');
  });

  it('`applyOverride` — bitta uch-lik uchun rol natijasini override bilan almashtiradi', () => {
    expect(applyOverride('ALL', null)).toBe('ALL');
    expect(applyOverride('ALL', 'OWN')).toBe('OWN');
    expect(applyOverride('NO', 'ALL')).toBe('ALL');
  });
});

describe('MK26 §3.3 G1 — imtiyoz oshirish taqiqi (server tomonda)', () => {
  it("o'zida YO'Q ruxsatni bera olmaydi (aktor NO)", () => {
    const verdict = checkGrantAllowed({ actorScope: 'NO', requestedScope: 'OWN' });
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toBe('actor_lacks_permission');
  });

  it("o'zidan YUQORI scope tayinlay olmaydi (OWN → ALL)", () => {
    const verdict = checkGrantAllowed({ actorScope: 'OWN', requestedScope: 'ALL' });
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toBe('scope_above_actor');
  });

  it("o'ziga TENG scope tayinlashi mumkin", () => {
    expect(
      checkGrantAllowed({ actorScope: 'OWN_GROUP', requestedScope: 'OWN_GROUP' }).allowed,
    ).toBe(true);
  });

  it("o'zidan PAST scope tayinlashi mumkin", () => {
    expect(checkGrantAllowed({ actorScope: 'ALL', requestedScope: 'OWN' }).allowed).toBe(true);
  });

  it('ruxsatni OLIB TASHLASH (NO) har doim mumkin — cheklash imtiyoz oshirish emas', () => {
    // Aktorning o'zida ruxsat bo'lmasa ham kimningdir ruxsatini TUSHIRISH
    // xavfsizlik jihatidan zararsiz; bloklansa admin o'zi ochib qo'ygan
    // teshikni yopa olmay qolardi.
    expect(checkGrantAllowed({ actorScope: 'NO', requestedScope: 'NO' }).allowed).toBe(true);
  });

  it('super-aktor (egasi) tekshiruvdan ozod — bypass OSHKORA bayroq bilan', () => {
    const verdict = checkGrantAllowed({
      actorScope: 'NO',
      requestedScope: 'ALL',
      actorIsOwner: true,
    });
    expect(verdict.allowed).toBe(true);
    expect(verdict.reason).toBe('owner_bypass');
  });
});

describe('MK26 §3.3 G2 — «nega bu ruxsat bor?»', () => {
  it('roldan kelgan qator qaysi ROL berganini aytadi', () => {
    const eff: EffectivePermission = resolveEffective(
      [role('Sotuvchi', 'OWN'), role('Savdo menejeri', 'ALL')],
      null,
    );
    const line = explainPermission('demand', 'view', eff);
    expect(line.source).toBe('role');
    // MAX'ni qaysi rol bergani — aynan o'sha rol nomi, birinchi rol emas.
    expect(line.roleName).toBe('Savdo menejeri');
    expect(line.grantedAt).toBeNull();
  });

  it('individual berilgan qator sana va kim berganini aytadi', () => {
    const eff = resolveEffective([role('Sotuvchi', 'OWN')], override('ALL'));
    const line = explainPermission('debt', 'update', eff);
    expect(line.source).toBe('override');
    expect(line.grantedAt).toBe('2026-08-01T10:00:00.000Z');
    expect(line.grantedByName).toBe('Admin');
    // Override qatorida rol qatlami nima bergani ham KO'RINADI — admin
    // «tushirsam nima bo'ladi» degan savolga javob topsin.
    expect(line.roleScope).toBe('OWN');
  });

  it('hech qayerdan kelmagan qator `none` — «nomalum» emas', () => {
    const line = explainPermission('payroll', 'delete', resolveEffective([], null));
    expect(line.source).toBe('none');
    expect(line.scope).toBe('NO');
    expect(line.roleName).toBeNull();
  });

  it("teng scope beruvchi ikki rol bo'lsa — determinist tanlov (alifbo bo'yicha)", () => {
    // Aks holda G2 qatori bir so'rovda «Kassir», keyingisida «Buxgalter»
    // ko'rsatib, adminni chalg'itardi (Map tartibi kafolatlanmagan).
    const eff = resolveEffective([role('Kassir', 'ALL'), role('Buxgalter', 'ALL')], null);
    expect(explainPermission('cashin', 'create', eff).roleName).toBe('Buxgalter');
  });
});
