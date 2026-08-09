import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Faza Q14 — `/settings/api-tokens` sahifasi (Faza 24 DEFER-3).
 *
 * Faza 24 `ApiTokenGuard` da scope majburlashni yoqdi, lekin
 * `api-token.controller.ts` dagi «UI: /settings/api-tokens (admin-only)»
 * kommenti yolg'on edi: `apps/web` da bunday sahifa YO'Q edi, token va
 * scope faqat to'g'ridan-to'g'ri API orqali berilardi. Natijada mavjud
 * tokenlarning hammasi `scopes: []` — ya'ni TO'LIQ KIRISH.
 *
 * Bu test statik-kontrakt uslubida (repo naqshi: `pos-debt-payment-wiring`)
 * sahifa haqiqatan uch amalni ham backend endpointlariga simlaganini va
 * ikkita XAVFSIZLIK invariantini qulflaydi:
 *   1. plaintext token FAQAT yaratish javobidan ko'rsatiladi (ro'yxatdan
 *      emas — server uni umuman qaytarmaydi);
 *   2. bo'sh scope ro'yxati = to'liq kirish, va bu UI'da OSHKORA
 *      ogohlantirish bilan ko'rsatiladi (jim qolmaydi).
 */

const WEB_SRC = join(__dirname, '..');
const PAGE_FILE = join(WEB_SRC, 'app', '(app)', 'settings', 'api-tokens', 'page.tsx');
const SIDEBAR = readFileSync(join(WEB_SRC, 'components', 'settings-sidebar.tsx'), 'utf8');

describe('/settings/api-tokens — sahifa mavjudligi', () => {
  it('App Router sahifasi bor', () => {
    expect(existsSync(PAGE_FILE), `sahifa yo'q: ${PAGE_FILE}`).toBe(true);
  });

  it('sozlamalar yon-menyusidan yetib boriladi (o`lik funksiya emas)', () => {
    expect(SIDEBAR).toContain("href: '/settings/api-tokens'");
  });
});

describe('/settings/api-tokens — backend kontrakti', () => {
  const src = () => readFileSync(PAGE_FILE, 'utf8');

  it('ro`yxat: GET /admin/api-tokens', () => {
    expect(src()).toMatch(/api\.get<[^>]*>\(\s*['"`]\/admin\/api-tokens['"`]/);
  });

  it('scope reyestri serverdan olinadi (qo`lda ro`yxat EMAS)', () => {
    expect(src()).toMatch(/['"`]\/admin\/api-tokens\/scopes['"`]/);
  });

  it('yaratish: POST /admin/api-tokens', () => {
    expect(src()).toMatch(/api\.post<[^>]*>\(\s*['"`]\/admin\/api-tokens['"`]/);
  });

  it('bekor qilish: DELETE /admin/api-tokens/:id', () => {
    expect(src()).toMatch(/api\.delete\(\s*[`'"]\/admin\/api-tokens\/\$\{/);
  });

  it('bekor qilish tasdiqlash bilan (destruktiv amal naqshi)', () => {
    expect(src()).toMatch(/runDestructive/);
  });
});

describe('/settings/api-tokens — xavfsizlik invariantlari', () => {
  const src = () => readFileSync(PAGE_FILE, 'utf8');

  it('plaintext token faqat YARATISH javobidan ko`rsatiladi', () => {
    const s = src();
    // Bir martalik ko'rsatish uchun alohida holat + dialog.
    expect(s).toMatch(/createdToken|created_token/);
    // Ro'yxat qatorida token maydoni umuman bo'lmasligi kerak.
    expect(s).not.toMatch(/row\.token\b/);
    expect(s).not.toMatch(/tokenHash/);
  });

  it('bo`sh scope = TO`LIQ KIRISH — oshkora ogohlantirish bor', () => {
    const s = src();
    expect(s).toMatch(/full_access/);
    // Ogohlantirish scope ro'yxati bo'sh bo'lgan holatga bog'langan.
    expect(s).toMatch(/scopes\.length\s*===\s*0/);
  });

  it('scope checkbox-matritsasi read/write ni alohida beradi', () => {
    const s = src();
    expect(s).toMatch(/:read/);
    expect(s).toMatch(/:write/);
  });

  it('UI matnlari i18n orqali (Kirill harflar yo`q)', () => {
    const s = src()
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    expect(s).not.toMatch(/[Ѐ-ӿ]/);
    expect(s).toMatch(/useTranslations\(/);
  });
});
