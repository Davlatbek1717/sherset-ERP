import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import ru from '../messages/ru.json';
import uz from '../messages/uz.json';

/**
 * Kiosk qobiq + PIN-qulf drift-lock (kassa TZ §3.1, §3.2).
 *
 * Bu yerda qulflanadigan narsalar buzilsa **jimgina** buziladi:
 *   1. kiosk foydalanuvchi ERP menyusini KO'RMASLIGI (layout ertaroq qaytadi);
 *   2. qulf chegarasi server bilan BIR XIL (5 daqiqa) — ikki joyda ikki
 *      raqam bo'lsa, ekran qulflanmay turib server sessiyani yopib qo'yardi;
 *   3. qulf **savatni saqlashi** (qayta login EMAS) — aks holda kassir
 *      mijoz oldida hammasini qaytadan terardi;
 *   4. 5 xatodan keyin TO'LIQ chiqish.
 *
 * ⚠️ Eslatma: menyuni yashirish — QULAYLIK, xavfsizlik emas. Haqiqiy cheklov
 * serverdagi `KioskGuard` da (`apps/api/.../kiosk.guard.ts`).
 */

const WEB = join(__dirname, '..');
const API_POLICY = join(
  WEB,
  '..',
  '..',
  '..',
  'apps',
  'api',
  'src',
  'modules',
  'auth',
  'kiosk-policy.ts',
);

type Bundle = { pages: Record<string, Record<string, string>> };

const layout = readFileSync(join(WEB, 'app', '(app)', 'layout.tsx'), 'utf8');
const lock = readFileSync(join(WEB, 'components', 'pos', 'pos-pin-lock.tsx'), 'utf8');
const loginPage = readFileSync(join(WEB, 'app', 'login', 'page.tsx'), 'utf8');
const store = readFileSync(join(WEB, 'lib', 'auth-store.ts'), 'utf8');
const policy = readFileSync(API_POLICY, 'utf8');

describe('kiosk qobiq — ERP menyusi RENDER QILINMAYDI', () => {
  it('layout kiosk foydalanuvchi uchun ERTAROQ qaytadi', () => {
    expect(layout).toContain('isKioskUser(auth.user)');
    // Qaytish `AppShell` dan OLDIN bo'lishi shart — aks holda menyu
    // baribir qurilardi.
    const kioskAt = layout.indexOf('isKioskUser(auth.user)');
    const shellAt = layout.indexOf('<AppShell');
    expect(kioskAt).toBeGreaterThan(0);
    expect(kioskAt).toBeLessThan(shellAt);
  });

  it('kiosk shoxida navigatsiya komponentlari YO`Q', () => {
    // Kiosk bloki `AppShell` gacha bo'lgan qismda; unda menyu bo'lmasin.
    const branch = layout.slice(
      layout.indexOf('isKioskUser(auth.user)'),
      layout.indexOf('<AppShell'),
    );
    for (const forbidden of [
      'AppShell',
      'MobileNavSheet',
      'CommandPalette',
      'SubNav',
      'UserMenu',
    ]) {
      expect(branch, `kiosk shoxida ${forbidden} bo'lmasligi kerak`).not.toContain(forbidden);
    }
    expect(branch).toContain('PosPinLock');
  });

  it('`isKioskUser` maydon yo`q bo`lsa false (eski token full qoladi)', () => {
    expect(store).toContain("user?.uiMode === 'kiosk'");
  });

  it('login kiosk kassirni to`g`ridan-to`g`ri POS`ga yuboradi', () => {
    expect(loginPage).toContain("isKioskUser(user) ? '/sotuv'");
  });
});

describe('PIN-qulf', () => {
  it('harakatsizlik chegarasi SERVER bilan bir xil (5 daqiqa)', () => {
    // Server: `POS_LOCK_IDLE_MINUTES = 5`. Ikki joyda ikki raqam bo'lsa,
    // ekran qulflanmay turib server sessiyani yopib qo'yardi.
    expect(policy).toMatch(/POS_LOCK_IDLE_MINUTES\s*=\s*5/);
    expect(lock).toMatch(/IDLE_MS\s*=\s*5\s*\*\s*60\s*\*\s*1000/);
  });

  it('qulf OVERLAY — savat saqlanadi (qayta login EMAS)', () => {
    // `fixed inset-0` = ustki qatlam; POS holati ostida turaveradi.
    expect(lock).toContain('fixed inset-0');
    // Muvaffaqiyatli PIN'da faqat qulf yopiladi, sahifa qayta yuklanmaydi.
    expect(lock).toContain('setLocked(false)');
  });

  it('5 xatodan keyin TO`LIQ chiqish', () => {
    expect(lock).toContain('lockout');
    expect(lock).toContain('logout()');
    // Yo'nalish 2026-08-11 (F1) da SHARTLI qilindi: juftlangan kassada
    // `/kassa-kirish` (kassir parolni bilmaydi), juftlanmagan brauzerda
    // `/login`. Ilgari bu yerda so'zsiz `/login` qulflangan edi — batafsil
    // qo'riqchi: `kiosk-logout-redirect.test.ts`.
    expect(lock).toContain('window.location.href = dest');
    expect(lock).toContain("readPosDevice() ? '/kassa-kirish' : '/login'");
  });

  it('PIN o`rnatilmagan bo`lsa qulf ISHLAMAYDI', () => {
    // Aks holda kassir o'z ekranidan chiqa olmaydigan holatga tushardi.
    expect(lock).toContain("api\n      .get<{ hasPin: boolean }>('/auth/pos-pin')");
    expect(lock).toMatch(/if \(!hasPin \|\| locked\) return;/);
  });

  it('faqat raqam qabul qilinadi, uzunligi 6 bilan cheklangan', () => {
    expect(lock).toContain("replace(/\\D/g, '')");
    expect(lock).toContain('maxLength={6}');
  });
});

describe('i18n', () => {
  const keys = ['title', 'hint', 'unlock', 'wrong', 'wrong_remaining'];

  it.each([
    ['ru', ru],
    ['uz', uz],
  ])('%s: qulf ekranining hamma kaliti bor', (_locale, bundle) => {
    const ns = (bundle as unknown as Bundle).pages.posLock;
    expect(ns).toBeDefined();
    const missing = keys.filter((k) => !ns?.[k]);
    expect(missing).toEqual([]);
  });

  it('«savat saqlangan» xabari ikkala tilda ham bor', () => {
    // Kassir vahima qilmasin — bu xabar qulfning qabul qilinishini hal qiladi.
    const r = (ru as unknown as Bundle).pages.posLock;
    const u = (uz as unknown as Bundle).pages.posLock;
    expect((r?.hint ?? '').toLowerCase()).toContain('корзина');
    expect((u?.hint ?? '').toLowerCase()).toContain('savat');
  });
});
