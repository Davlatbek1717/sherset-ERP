import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB = join(__dirname, '..');
const layout = readFileSync(join(WEB, 'app', '(app)', 'layout.tsx'), 'utf8');
const lock = readFileSync(join(WEB, 'components', 'pos', 'pos-pin-lock.tsx'), 'utf8');

/**
 * Kassir chiqqanda email-login emas, PIN ekrani ochilishi kerak — aks holda
 * u parolni bilmaydi va kassa ishlamay qoladi.
 *
 * ⚠️ Kassa qurilmasida chiqishning UCH yo'li bor, uchalasi ham shu qoidaga
 * bo'ysunishi shart:
 *   1. kiosk qobig'idagi «Chiqish» tugmasi (ataylab kassir bosadi);
 *   2. PIN-qulfda 5 xato → majburiy chiqish (`pos-pin-lock.tsx`);
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

describe('kiosk chiqish yo`nalishi — PIN-qulf lockout', () => {
  it('5 xatodan keyingi chiqish ham PIN ekraniga qaytaradi', () => {
    expect(lock).toContain('readPosDevice');
    expect(lock).toContain('/kassa-kirish');
  });

  it('juftlanmagan brauzerda /login qoladi', () => {
    expect(lock).toContain("'/login'");
  });

  it('yo`nalish SHARTLI — hech qachon so`zsiz /login emas', () => {
    expect(lock).not.toMatch(/window\.location\.href\s*=\s*'\/login'/);
  });
});
