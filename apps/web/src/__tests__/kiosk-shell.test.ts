import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import ru from '../messages/ru.json';
import uz from '../messages/uz.json';

/**
 * Kiosk qobiq drift-lock (kassa TZ §3.1).
 *
 * Bu yerda qulflanadigan narsa buzilsa **jimgina** buziladi: kiosk
 * foydalanuvchi ERP menyusini KO'RMASLIGI (layout `AppShell` dan ertaroq
 * qaytadi) va PIN uzunligi butun zanjir bo'ylab AYNAN 4 qolishi.
 *
 * 🔴 EKRAN QULFI YO'Q (egasi, 2026-08-16): «bir marta kirgandan keyin yana
 * pinkod so'raydi, ekran qulf bo'lib qoladi — o'shani to'liq olib tashla,
 * ekran qulf kerak emas umuman». `PosPinLock` (5 daqiqalik harakatsizlik →
 * PIN overlay) butunlay o'chirildi; quyidagi qo'riqchi uning qaytib
 * kelmasligini tekshiradi. PIN endi FAQAT ikki joyda: kassaga kirish
 * (`/kassa-kirish`) va ATAYLAB kassir almashtirish (`CashierSelectScreen`).
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
  });

  it('`isKioskUser` maydon yo`q bo`lsa false (eski token full qoladi)', () => {
    expect(store).toContain("user?.uiMode === 'kiosk'");
  });

  it('login kiosk kassirni to`g`ridan-to`g`ri POS`ga yuboradi', () => {
    expect(loginPage).toContain("isKioskUser(user) ? '/sotuv'");
  });
});

describe('🔴 EKRAN QULFI OLIB TASHLANDI (egasi, 2026-08-16)', () => {
  it('layout hech qanday PIN-qulf overlay`ini render QILMAYDI', () => {
    // Ilgari bu yerda `<PosPinLock />` turardi va 5 daqiqadan keyin butun
    // ekranni PIN so'rovi bilan yopardi. Egasi uni butunlay bekor qildi.
    expect(layout).not.toContain('PosPinLock');
    expect(layout).not.toContain('pos-pin-lock');
  });

  it('`pos-pin-lock.tsx` fayli MAVJUD EMAS', () => {
    // Fayl qolib, faqat chaqiruv o'chirilsa — keyingi sessiya uni «tasodifan
    // uzilgan» deb qayta ulab qo'yishi mumkin edi.
    expect(existsSync(join(WEB, 'components', 'pos', 'pos-pin-lock.tsx'))).toBe(false);
  });

  it('serverda ham harakatsizlik chegarasi qolmadi', () => {
    // `POS_LOCK_IDLE_MINUTES` faqat shu qulf uchun bor edi; hech bir server
    // mantig'i uni o'qimasdi (sessiyani yopadigan cron yo'q).
    expect(policy).not.toMatch(/export const POS_LOCK_IDLE_MINUTES/);
  });

  it('PIN qolgan IKKI joyda ishlaydi — kirish va ATAYLAB almashtirish', () => {
    // Qulfni olib tashlash PIN mexanizmini o'ldirmasligi kerak: kassaga
    // kirish va kassir almashtirish hamon PIN bilan.
    const sotuv = readFileSync(join(WEB, 'app', '(app)', 'sotuv', 'page.tsx'), 'utf8');
    expect(sotuv).toContain('CashierSelectScreen');
    expect(policy).toMatch(/POS_PIN_RE\s*=/);
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

  it('F8: kassir-tanlash ekrani ham klaviaturaga 4 uzatadi', () => {
    // Zanjirning beshinchi halqasi — switch-PIN ham AYNAN 4 (`POS_PIN_RE`).
    const selectScreen = readFileSync(
      join(WEB, 'components', 'pos', 'cashier-select-screen.tsx'),
      'utf8',
    );
    expect(selectScreen).toMatch(/PIN_LENGTH\s*=\s*4/);
    expect(selectScreen).toContain('maxLength={PIN_LENGTH}');
  });
});

describe('i18n', () => {
  // Qulf ekrani ketdi, lekin `pages.posLock` namespace'i QOLADI: xato-PIN
  // xabarlarini kassir-almashtirish ekrani ham shu yerdan oladi (bitta kalit,
  // ikki nuqtada bir xil matn). Qolgani (`title`/`hint`/`unlock`) o'chirildi.
  const keys = ['wrong', 'wrong_remaining'];

  it.each([
    ['ru', ru],
    ['uz', uz],
  ])('%s: PIN-xato kalitlari bor (kassir almashtirish ishlatadi)', (_locale, bundle) => {
    const ns = (bundle as unknown as Bundle).pages.posLock;
    expect(ns).toBeDefined();
    expect(keys.filter((k) => !ns?.[k])).toEqual([]);
  });

  it.each([
    ['ru', ru],
    ['uz', uz],
  ])('%s: qulf ekranining kalitlari OLIB TASHLANGAN', (_locale, bundle) => {
    const ns = (bundle as unknown as Bundle).pages.posLock;
    for (const dead of ['title', 'hint', 'unlock']) expect(ns?.[dead]).toBeUndefined();
  });
});
