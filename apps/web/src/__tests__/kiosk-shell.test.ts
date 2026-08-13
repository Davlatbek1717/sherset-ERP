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

  it('🔴 Electron qobig`ida TO`LIQ foydalanuvchi ham kiosk ko`rinishini oladi (2026-08-13)', () => {
    // Egasi .exe da PIN bilan kirganda ERP navbar'li WEB ko'rinish ochilgan:
    // PIN har qanday xodimniki bo'lishi mumkin, `uiMode` esa roldan keladi —
    // rol kiosk bo'lmasa qobiq ichida butun ERP ochilardi. Qobiq (kassa
    // qurilmasi) ichida esa HAR DOIM kassa ilovasi ko'rinishi kerak.
    // Server ruxsatlari o'zgarmaydi — bu faqat ko'rinish (KioskGuard alohida).
    expect(layout).toMatch(/isKioskUser\(auth\.user\)\s*\|\|\s*isShersetShell\(\)/);
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
    // 🔴 NIYAT KENGAYDI (2026-08-13): juftlash 2026-08-11 da olib tashlangan,
    // yangi o'rnatmalarda qurilma kaliti YO'Q — `readPosDevice()` null. Shart
    // faqat qurilmaga qaralsa .exe ichida lockout kassirni PAROL ekraniga
    // tashlardi. Endi Electron qobig'i ham kassa ish o'rni deb sanaladi.
    expect(lock).toContain("readPosDevice() || isShersetShell() ? '/kassa-kirish' : '/login'");
  });

  it('PIN o`rnatilmagan bo`lsa qulf ISHLAMAYDI', () => {
    // Aks holda kassir o'z ekranidan chiqa olmaydigan holatga tushardi.
    expect(lock).toContain("api\n      .get<{ hasPin: boolean }>('/auth/pos-pin')");
    expect(lock).toMatch(/if \(!hasPin \|\| locked\) return;/);
  });

  it('faqat raqam qabul qilinadi, uzunligi 4 bilan cheklangan', () => {
    expect(lock).toContain("replace(/\\D/g, '')");
    expect(lock).toContain('maxLength={4}');
  });
});

/**
 * 🔴 PIN UZUNLIGI — AYNAN 4, TO'RT JOYDA BIR XIL (2026-08-12).
 *
 * Egasi jonli qurilmada 5-raqamni bosdi va u kiritildi, keyin 6-raqam ham.
 * Sabab: butun zanjir 4–6 ga qurilgan edi va kirish sahifasi `MAX_PIN = 6`
 * uzatardi.
 *
 * NEGA TO'RTALASI BIRGA QULFLANADI: bittasi qolib ketsa shartnoma jimgina
 * ikkiga bo'linadi — masalan admin modali 6 raqamli PIN qo'yishga ruxsat
 * bersa, kassir uni kirish ekranida (4 ta doira) HECH QACHON kirita olmaydi
 * va hisob o'lik qoladi. Hech bir typecheck/biome buni tutmaydi: to'rttasi
 * ham mustaqil literal.
 */
describe('PIN uzunligi — zanjir bo`ylab AYNAN 4', () => {
  const kassaKirish = readFileSync(join(WEB, 'app', 'kassa-kirish', 'page.tsx'), 'utf8');
  const pinModal = readFileSync(
    join(WEB, 'app', '(app)', 'settings', 'employees', '_components', 'pos-pin-modal.tsx'),
    'utf8',
  );

  it('server RE aynan 4 raqam (4–6 EMAS)', () => {
    expect(policy).toMatch(/POS_PIN_RE\s*=\s*\/\^\\d\{4\}\$\//);
  });

  it('kirish sahifasi klaviaturaga 4 uzatadi', () => {
    expect(kassaKirish).toMatch(/PIN_LENGTH\s*=\s*4/);
    expect(kassaKirish).not.toMatch(/maxLength=\{6\}/);
  });

  it('admin PIN qo`yish modali 4 dan uzunini qabul qilmaydi', () => {
    expect(pinModal).toMatch(/PIN_RE\s*=\s*\/\^\\d\{4\}\$\//);
    expect(pinModal).toContain('slice(0, 4)');
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
