import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * O'LIK MARSHRUT HAVOLASI GUARD (2026-07-30).
 *
 * Bug-class: ro'yxat sahifasi qatorni `/x/${id}` ga bog'laydi, lekin `/x/[id]`
 * marshruti umuman yaratilmagan → foydalanuvchi hujjatni YARATA oladi, keyin
 * uni OCHA olmaydi (Next.js 404). Hech bir gate buni tutmasdi: typecheck
 * satrni tekshirmaydi, i18n faqat kalitni, biome esa marshrutni bilmaydi.
 *
 * Topilgan yo'l bilan: butun `(app)` daraxti skanlanadi, `href=`/`router.push`
 * dagi ichki yo'llar mavjud marshrutlarga (statik + dinamik) solishtiriladi.
 *
 * Bu test YANGI o'lik havola qo'shilishini bloklaydi. Hozir ma'lum bo'lgan
 * buzuqlar KNOWN ro'yxatida — har biri alohida sahifa qurishni talab qiladi
 * (arzon «manzil noto'g'ri» turi 2026-07-30 da allaqachon tuzatildi).
 * Sahifa qurilganda uni ro'yxatdan O'CHIRING.
 */

const APP = join(__dirname, '..', 'app', '(app)');

interface Routes {
  static: Set<string>;
  dynamic: string[][];
}

function collectRoutes(dir: string, prefix = '', out: Routes = { static: new Set(), dynamic: [] }) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory() || e.name.startsWith('_')) continue;
    const full = join(dir, e.name);
    const seg = e.name.startsWith('(') ? '' : `/${e.name}`;
    const path = prefix + seg;
    if (existsSync(join(full, 'page.tsx'))) {
      if (path.includes('[')) out.dynamic.push(path.split('/').filter(Boolean));
      else out.static.add(path || '/');
    }
    collectRoutes(full, path, out);
  }
  return out;
}

function collectPages(dir: string, prefix = '', out: Array<{ href: string; file: string }> = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory() || e.name.startsWith('_')) continue;
    const full = join(dir, e.name);
    const seg = e.name.startsWith('(') ? '' : `/${e.name}`;
    const path = prefix + seg;
    if (existsSync(join(full, 'page.tsx')))
      out.push({ href: path || '/', file: join(full, 'page.tsx') });
    collectPages(full, path, out);
  }
  return out;
}

const ROUTES = collectRoutes(APP);

function resolves(pathTpl: string): boolean {
  const segs = pathTpl.split('/').filter(Boolean);
  if (!segs.length) return true;
  if (ROUTES.static.has(`/${segs.join('/')}`)) return true;
  for (const d of ROUTES.dynamic) {
    if (d.length !== segs.length) continue;
    let ok = true;
    for (let i = 0; i < d.length; i++) {
      const ds = d[i];
      if (ds === undefined) continue;
      if (ds.startsWith('[')) continue;
      if (ds !== segs[i]) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

// `href={`/x/${id}`}` → `/x/` ni ushlaymiz, `${` dan keyingisi kesiladi.
const LINK =
  /(?:href=\{?`|router\.push\(`|href="|href='|router\.push\('|router\.push\(")(\/[^`"'\s{}]*)/g;

/** Skanerdan tashqarida: API yo'llari emas, chinakam sahifa navigatsiyasi. */
const SKIP_PREFIX = /^\/(api|login|print|p)\b/;

function scan(): Array<{ page: string; link: string }> {
  const bad: Array<{ page: string; link: string }> = [];
  for (const p of collectPages(APP)) {
    const src = readFileSync(p.file, 'utf8');
    const seen = new Set<string>();
    for (const m of src.matchAll(LINK)) {
      const raw = m[1];
      if (!raw) continue;
      // `href={`/x/${id}`}` da regex `/x/$` gacha oladi (`{` sinfdan tashqarida).
      // Oxirgi `$` ni tashlab, `/` bilan tugasa dinamik segment deb qaraymiz.
      let tpl = raw.replace(/\$$/, '').replace(/\/$/, '/[id]');
      tpl = (tpl.split('?')[0] ?? '').split('#')[0] ?? '';
      if (!tpl.startsWith('/') || tpl.startsWith('//')) continue;
      if (SKIP_PREFIX.test(tpl)) continue;
      if (seen.has(tpl)) continue;
      seen.add(tpl);
      if (!resolves(tpl)) bad.push({ page: p.href, link: tpl });
    }
  }
  return bad;
}

/**
 * Ma'lum buzuqlar — HAR BIRI yangi sahifa qurishni talab qiladi.
 * Sahifa qurilgach shu qatorni o'chiring (test o'zi buni majburlaydi emas,
 * lekin ro'yxat qisqargani ish bajarilganini ko'rsatadi).
 */
const KNOWN_BROKEN = new Set([
  '/bulk-edit -> /[id]',
  '/calls -> /calls/[id]',
  '/commission-reports -> /[id]',
  '/consignments -> /consignments/[id]',
  '/help/purchases -> /help/purchases/first-purchase-order',
  '/hr/positions -> /hr/positions/[id]',
  '/payments -> /[id]',
  '/picking-waves -> /picking-waves/[id]',
  '/service-requests -> /service-requests/[id]',
  '/service-requests -> /service-requests/new',
  '/settings/webhooks -> /settings/webhooks/[id]',
]);

describe('internal links point at routes that exist', () => {
  it('adds no NEW dead route link', () => {
    const found = scan().map((b) => `${b.page} -> ${b.link}`);
    const fresh = found.filter((f) => !KNOWN_BROKEN.has(f));
    expect(fresh, `Yangi o'lik havola:\n${fresh.join('\n')}`).toEqual([]);
  });

  it('the scanner is non-vacuous — it still sees the known-broken links', () => {
    // Agar skaner buzilsa (regex/marshrut yig'ish), bu test tushadi va
    // «0 o'lik havola» degan yolg'on xotirjamlikni oldini oladi.
    const found = new Set(scan().map((b) => `${b.page} -> ${b.link}`));
    const stillSeen = [...KNOWN_BROKEN].filter((k) => found.has(k));
    expect(stillSeen.length).toBeGreaterThan(5);
  });

  it('the sales-channel create link resolves (2026-07-30 fix stays fixed)', () => {
    // 4 ta pul-hujjati formasi `/sales-channels/new` ga bog'langan edi — yo'q marshrut.
    expect(resolves('/ecommerce/channels/new')).toBe(true);
    expect(resolves('/sales-channels/new')).toBe(false);
    for (const p of ['cash-in/new', 'cash-out/new', 'payments-in/new', 'payments-out/new']) {
      const src = readFileSync(join(APP, ...p.split('/'), 'page.tsx'), 'utf8');
      expect(src, p).not.toMatch(/router\.push\('\/sales-channels\/new'\)/);
    }
  });
});
