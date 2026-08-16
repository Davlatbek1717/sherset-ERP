import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB = join(__dirname, '..');
const layout = readFileSync(join(WEB, 'app', '(app)', 'layout.tsx'), 'utf8');
// PIN-qulf 2026-08-16 da olib tashlandi; lockout yo'nalishi (5 xato → to'liq
// chiqish) endi FAQAT kassir-almashtirish ekranida qoldi.
const switchScreen = readFileSync(
  join(WEB, 'components', 'pos', 'cashier-select-screen.tsx'),
  'utf8',
);

/**
 * Kassir chiqqanda email-login emas, PIN ekrani ochilishi kerak — aks holda
 * u parolni bilmaydi va kassa ishlamay qoladi.
 *
 * ⚠️ Kassa qurilmasida chiqishning UCH yo'li bor, uchalasi ham shu qoidaga
 * bo'ysunishi shart:
 *   1. kiosk qobig'idagi «Chiqish» tugmasi (ataylab kassir bosadi);
 *   2. kassir almashtirishda 5 xato → majburiy chiqish
 *      (`cashier-select-screen.tsx`; ilgari bu PIN-QULFDA ham bor edi, qulf
 *      2026-08-16 da butunlay olib tashlandi);
 *   3. sessiya o'lgach layout'ning avto-yo'naltirishi.
 * Biri unutilsa kassa jimgina parol so'raydigan ekranda qotib qoladi.
 */
describe('kiosk chiqish yo`nalishi — layout', () => {
  it('layout /kassa-kirish ga yo`naltirishni biladi', () => {
    expect(layout).toContain('/kassa-kirish');
  });

  it('qurilma juftlanganini tekshiradi (juftlanmagan holda /login qoladi)', () => {
    expect(layout).toContain('readPosDevice');
  });

  it('🔴 Electron qobig`i ham kassa ish o`rni sanaladi (2026-08-13)', () => {
    // Juftlash 2026-08-11 da olib tashlangan: yangi o'rnatmalarda qurilma
    // kaliti YO'Q, `readPosDevice()` null. Faqat qurilmaga qaralsa .exe
    // ichida sessiya o'lganda ham, «Chiqish»da ham kassir PAROL ekranini
    // ko'rardi («webdagi sahifa chiqyapti» shikoyati). Ikkala joyda ham
    // (avto-yo'naltirish + logout tugmasi) qobiq sharti bo'lishi shart.
    const hits = layout.match(/readPosDevice\(\) \|\| isShersetShell\(\)/g) ?? [];
    expect(hits.length, 'layoutda qobiq-sharti 2 joyda bo`lishi kerak').toBeGreaterThanOrEqual(2);
  });

  it('/login zaxira yo`li YO`QOLMAYDI (juftlanmagan brauzer uchun)', () => {
    expect(layout).toContain('/login?redirect=');
  });

  it('kiosk qobig`ida chiqish tugmasi bor va logout chaqiradi', () => {
    const branch = layout.slice(
      layout.indexOf('isKioskUser(auth.user)'),
      layout.indexOf('<AppShell'),
    );
    expect(branch).toContain('logout(');
    expect(branch).toContain('/kassa-kirish');
  });
});

describe('kiosk chiqish yo`nalishi — kassir almashtirishdagi lockout', () => {
  it('5 xatodan keyingi chiqish ham PIN ekraniga qaytaradi', () => {
    expect(switchScreen).toContain('readPosDevice');
    expect(switchScreen).toContain('/kassa-kirish');
  });

  it('lockout yo`nalishi ham qobiqni kassa ish o`rni deb biladi (2026-08-13)', () => {
    expect(switchScreen).toContain('readPosDevice() || isShersetShell()');
  });

  it('juftlanmagan brauzerda /login qoladi', () => {
    expect(switchScreen).toContain("'/login'");
  });

  it('yo`nalish SHARTLI — hech qachon so`zsiz /login emas', () => {
    expect(switchScreen).not.toMatch(/window\.location\.href\s*=\s*'\/login'/);
  });
});
