import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * POS xarajat/inkassatsiya ulanish qulfi (kassa TZ §8.2 / §8.3).
 *
 * Uch jim buzilish shu yerda qulflanadi — uchalasini ham typecheck,
 * biome va odatiy testlar o'tkazib yuboradi:
 *
 * 1. **`CASH_OVERDRAWN` jim qolishi.** Server yashiqdagidan ko'p chiqishni
 *    TO'XTATMAYDI (Q10) va faqat audit hodisasi yozadi. FE uni ko'rsatmasa,
 *    farq faqat smena YOPILGANDA chiqadi va sababi unutilgan bo'ladi.
 * 2. **Chalkash hujjat.** Turga tegishli bo'lmagan maydon yuborilsa server
 *    rad etadi — lekin kassir buni tugmani bosgandan keyin ko'radi.
 * 3. **RKO havolasining yo'li.** `window.open('/print/...')` oddiy satr:
 *    yo'l noto'g'ri bo'lsa 404 ochiladi va hech bir gate shikoyat qilmaydi.
 */
const WEB_SRC = join(__dirname, '..');
const DIALOG = readFileSync(join(WEB_SRC, 'components', 'pos', 'cash-out-dialog.tsx'), 'utf8');
const POS_PAGE = readFileSync(join(WEB_SRC, 'app', '(app)', 'sotuv', 'page.tsx'), 'utf8');

describe('POS xarajat/inkassatsiya — ulanish', () => {
  it('CASH_OVERDRAWN kassirga KO`RSATILADI', () => {
    expect(POS_PAGE).toContain('CASH_OVERDRAWN');
    // Faqat eslatib qo'yish emas — xato toni bilan.
    expect(POS_PAGE).toMatch(/CASH_OVERDRAWN[\s\S]{0,200}?toast\.error/);
  });

  it('faqat o`z turiga tegishli maydon yuboriladi (chalkash hujjat yo`q)', () => {
    expect(DIALOG).toMatch(/expenseItemId:\s*kind === 'expense' \? expenseItemId : null/);
    expect(DIALOG).toMatch(/recipientId:\s*kind === 'collection' \? recipientId : null/);
  });

  it('modda/qabul qiluvchisiz tugma bloklanadi (server rad etishidan OLDIN)', () => {
    expect(DIALOG).toMatch(
      /canConfirm =[\s\S]{0,160}?kind === 'expense' \? !!expenseItemId : !!recipientId/,
    );
  });

  it('hujjat joriy SMENAGA yoziladi', () => {
    expect(DIALOG).toMatch(/cashier-sessions\/\$\{sessionId\}\/cash-out/);
    expect(POS_PAGE).toMatch(/<CashOutDialog[\s\S]{0,400}?sessionId=\{session\.id\}/);
  });

  it('RKO cheki ochiladi va route MAVJUD', () => {
    expect(POS_PAGE).toMatch(/\/print\/cash-out\/\$\{doc\.id\}/);
    const routeFile = join(WEB_SRC, 'app', 'print', 'cash-out', '[docId]', 'page.tsx');
    expect(existsSync(routeFile), `route yo'q: ${routeFile}`).toBe(true);
  });

  it('qabul qiluvchilar TOR endpointdan olinadi (/hr/employees EMAS)', () => {
    // `/hr/employees` oylik va telefonni qaytaradi — kiosk terminalida
    // uni ochish butun xodimlar oyligini oshkor qilardi.
    expect(DIALOG).toContain('/cashier-sessions/cash-out-recipients');
    expect(DIALOG).not.toContain('/hr/employees');
  });
});
