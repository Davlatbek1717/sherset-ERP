/**
 * E2E (Phase-2 QA, Faza MK25): M2 to'lqini — menejer nazorat ekranlari
 * (MK15–MK22) + omborchi/skaner oqimi. Real brauzer.
 *
 * MK14 spec'i «ekran ochiladimi» savolini allaqachon so'ragan. Bu spec undan
 * nariga o'tadi va aynan M2 shartnomalarini so'raydi:
 *
 *   ▸ **MK15** — panel raqami ICHKI HISOBOT raqamiga TENGmi (bir sonni ikki
 *     manbadan olib qiyoslash), va «hisoblanmadi» katagi `0 сум` bo'lib
 *     chizilmaydimi (NULL ≠ 0 shartnomasi ekranda ham amal qiladimi);
 *   ▸ **MK16/17/18/19/20/21** — ekranlar konsol-xatosiz, xom i18n kalitisiz va
 *     4xx/5xx so'rovsiz ishlaydimi;
 *   ▸ **авторизация** — token'siz `manager/money-map` yopiqmi;
 *   ▸ **MK24 baseline** — telefon kengligida (390×844) gorizontal toshib
 *     ketish bormi. MK24 (mobil rejim) HALI QURILMAGAN, shuning uchun bu
 *     test **o'lchov** sifatida yoziladi: natija MK24 uchun boshlang'ich
 *     holat. Yiqilmaydi — `mk25-mobile-overflow.json` ga yozadi.
 *
 * Ma'lumot: lokal `climart_adopt` @ 5432 (admin@demo.local / admin123).
 */
import { writeFileSync } from 'node:fs';
import { type APIRequestContext, type Page, expect, test } from '@playwright/test';

const API = 'http://localhost:4000/api/v1';
const OWNER = { email: 'admin@demo.local', password: 'admin123' };

/** react-query mount'dan keyin bir necha so'rov ketadi. */
const SETTLE_MS = 2500;

/** M2 to'lqini ekranlari — har biri qaysi fazadan kelgani bilan. */
const M2_PAGES = [
  { route: '/menejer/pul-manzarasi', phase: 'MK15' },
  { route: '/menejer/undirish', phase: 'MK16' },
  { route: '/menejer/mijoz-taqsimoti', phase: 'MK17' },
  { route: '/menejer/xato-narx', phase: 'MK18' },
  { route: '/menejer/brifing', phase: 'MK19' },
  { route: '/menejer/izoh-shablonlari', phase: 'MK20' },
  { route: '/menejer/qarorlar', phase: 'MK21' },
  { route: '/menejer/plan', phase: 'MK37' },
  { route: '/omborchi', phase: 'omborchi' },
  { route: '/scan', phase: 'skaner' },
] as const;

/**
 * `formatMoney` ning aynan nusxasi (`packages/design-system/src/lib/format.ts`).
 * Ataylab qayta yozilgan: test ekranda KO'RINGAN matnni mustaqil hisoblangan
 * kutilma bilan solishtirishi kerak — bir xil funksiyani import qilsa,
 * formatlash bug'i ikkala tomonda barobar «to'g'ri» bo'lib qolardi.
 */
function expectedMoney(minor: string, currency = 'UZS'): string {
  const bi = BigInt(minor);
  const negative = bi < 0n;
  const abs = negative ? -bi : bi;
  const frac = (abs % 100n).toString().padStart(2, '0');
  const display = currency === 'UZS' ? 'сум' : currency;
  return `${negative ? '-' : ''}${(abs / 100n).toLocaleString('ru-RU')},${frac} ${display}`;
}

/** Ko'rinmas ajratgichlarni (NBSP/thin space) oddiy probelga keltiradi. */
const norm = (s: string) => s.replace(/[   ]/g, ' ').trim();

async function login(page: Page, who = OWNER) {
  await page.goto('/login');
  await page.fill('[data-test-id="login-email"]', who.email);
  await page.fill('[data-test-id="login-password"]', who.password);
  await page.click('[data-test-id="login-submit"]');
  await page.waitForURL('/');
}

async function apiToken(request: APIRequestContext): Promise<string> {
  const r = await request.post(`${API}/auth/login`, { data: OWNER });
  expect(r.ok(), `login ${r.status()}`).toBeTruthy();
  return (await r.json()).accessToken as string;
}

async function apiGet<T>(request: APIRequestContext, token: string, path: string): Promise<T> {
  const r = await request.get(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(r.ok(), `${path} → ${r.status()}`).toBeTruthy();
  return (await r.json()) as T;
}

interface PageProbe {
  consoleErrors: string[];
  badResponses: string[];
  rawKeys: string[];
}

async function probe(page: Page, route: string): Promise<PageProbe> {
  const consoleErrors: string[] = [];
  const badResponses: string[] = [];

  const onConsole = (msg: { type: () => string; text: () => string }) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  };
  const onResponse = (res: { status: () => number; url: () => string }) => {
    const s = res.status();
    if (s >= 400 && s !== 401 && res.url().includes('/api/')) {
      badResponses.push(`${s} ${res.url()}`);
    }
  };

  page.on('console', onConsole);
  page.on('response', onResponse);
  await page.goto(route, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(SETTLE_MS);

  const bodyText = (await page.locator('body').innerText()) ?? '';
  const rawKeys = [...bodyText.matchAll(/\b(?:pages|common|fields)\.[a-zA-Z0-9_.]+/g)].map(
    (m) => m[0],
  );

  page.off('console', onConsole);
  page.off('response', onResponse);
  return { consoleErrors, badResponses, rawKeys };
}

// ─────────────────────────────────────────────────────────────────────────────
// MK15 — pul manzarasi: ekran raqami = ichki hisobot raqami
// ─────────────────────────────────────────────────────────────────────────────

interface MoneyMapBlockDto {
  key: string;
  amountMinor: string | null;
  quality: string;
  source: string;
}
interface MoneyMapDto {
  blocks: MoneyMapBlockDto[];
  summary: { netMinor: string | null; currency: string; quality: string };
}

test.describe('MK25 · MK15 — pul manzarasi raqamlari ichki hisobotga mos', () => {
  test('panel bloklari kassa/kontragent hisobotlari bilan bir xil sonni ko’rsatadi', async ({
    page,
    request,
  }) => {
    const token = await apiToken(request);

    // ── Uch mustaqil manba ────────────────────────────────────────────────
    const map = await apiGet<MoneyMapDto>(request, token, '/manager/money-map');
    const cashDesks = await apiGet<{ items: { balanceMinor: string | null }[] }>(
      request,
      token,
      '/admin/cash-desks',
    );
    const cpBalance = await apiGet<{
      summaries: { totalDebtMinor: string; totalCreditMinor: string };
    }>(request, token, '/reports/counterparty-balance');

    const block = (k: string) => {
      const b = map.blocks.find((x) => x.key === k);
      if (!b) throw new Error(`money-map javobida '${k}' bloki yo'q`);
      return b;
    };

    // ── 1. API qatlami: panel ≠ ikkinchi haqiqat ─────────────────────────
    const cashSum = cashDesks.items.reduce(
      (acc, d) => acc + BigInt(d.balanceMinor ?? '0'),
      0n,
    );
    expect(
      block('cash').amountMinor,
      'kassa bloki `admin/cash-desks` yig’indisidan farq qiladi',
    ).toBe(cashSum.toString());
    expect(
      block('customer_debt').amountMinor,
      'mijoz qarzi bloki kontragent-saldo hisobotidan farq qiladi',
    ).toBe(cpBalance.summaries.totalDebtMinor);
    expect(
      block('supplier_debt').amountMinor,
      'ta’minotchi qarzi bloki kontragent-saldo hisobotidan farq qiladi',
    ).toBe(cpBalance.summaries.totalCreditMinor);

    // ── 2. Ekran qatlami: o'sha son brauzerda ham shu ────────────────────
    await login(page);
    await page.goto('/menejer/pul-manzarasi', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-test-id="mm-block-cash"]')).toBeVisible({ timeout: 20_000 });

    for (const b of map.blocks) {
      const cell = page.locator(`[data-test-id="mm-amount-${b.key}"]`);
      await expect(cell, `«${b.key}» bloki ekranda yo’q`).toBeVisible();
      const shown = norm(await cell.innerText());

      if (b.amountMinor === null) {
        // NULL ≠ 0: o'lchanmagan blok `—`, hech qachon «0,00 сум» emas.
        expect(shown, `o’lchanmagan «${b.key}» bloki raqam bo’lib chizildi: «${shown}»`).toBe('—');
      } else {
        expect(shown, `«${b.key}» bloki ekranda boshqa son ko’rsatyapti`).toBe(
          norm(expectedMoney(b.amountMinor, map.summary.currency)),
        );
      }
    }

    // ── 3. Sof qoldiq: yarim yig'indi berilmaydi ─────────────────────────
    const netShown = norm(await page.locator('[data-test-id="mm-net"]').innerText());
    if (map.summary.netMinor === null) {
      expect(
        netShown,
        'blok o’lchanmagan bo’lsa ham sof qoldiq son bo’lib chizildi (yarim yig’indi)',
      ).toBe('—');
    } else {
      expect(netShown).toBe(norm(expectedMoney(map.summary.netMinor, map.summary.currency)));
    }

    await page.screenshot({ path: 'test-results/mk25/mm_desktop.png', fullPage: true });
  });

  test('token’siz `manager/money-map` yopiq (авторизация)', async ({ request }) => {
    const r = await request.get(`${API}/manager/money-map`);
    expect([401, 403], `token’siz so’rov ${r.status()} qaytardi`).toContain(r.status());
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// M2 ekranlari — konsol / API / i18n
// ─────────────────────────────────────────────────────────────────────────────

test.describe('MK25 · M2 ekranlari sog’lomligi', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('har M2 ekrani konsol-xatosiz, 4xx/5xx-siz va xom i18n kalitisiz ochiladi', async ({
    page,
  }) => {
    // 10 ta route × (dev-server ilk kompilyatsiyasi + settle) — standart 30s
    // yetmaydi va test mahsulot bug'i sababli emas, vaqt tugagani uchun
    // yiqilardi (yolg'on qizil).
    test.setTimeout(300_000);
    const failures: string[] = [];

    for (const { route, phase } of M2_PAGES) {
      const r = await probe(page, route);
      if (r.consoleErrors.length > 0) {
        failures.push(`${phase} ${route} — konsol: ${r.consoleErrors.slice(0, 3).join(' | ')}`);
      }
      if (r.badResponses.length > 0) {
        failures.push(`${phase} ${route} — API: ${r.badResponses.slice(0, 3).join(' | ')}`);
      }
      if (r.rawKeys.length > 0) {
        failures.push(`${phase} ${route} — xom i18n: ${[...new Set(r.rawKeys)].join(', ')}`);
      }
      await page.screenshot({
        path: `test-results/mk25/${route.replace(/\//g, '_')}.png`,
        fullPage: true,
      });
    }

    expect(failures, failures.join('\n')).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Omborchi / skaner oqimi — telefon kengligida, FUNKSIONAL
// ─────────────────────────────────────────────────────────────────────────────

test.describe('MK25 · skaner oqimi (390×844)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page);
  });

  test('shtrix-kod bo’yicha qidiruv tovar kartasiga olib boradi', async ({ page, request }) => {
    test.setTimeout(120_000);
    const token = await apiToken(request);
    // Kodni JONLI bazadan olamiz — qotib qolgan fikstura seed o'zgarsa yolg'on
    // qizil berardi.
    const products = await apiGet<{ items: { id: string; code: string; barcodes: string[] }[] }>(
      request,
      token,
      '/products?limit=50',
    );
    const withBarcode = products.items.find((p) => (p.barcodes?.length ?? 0) > 0);
    test.skip(!withBarcode, 'Bazada shtrix-kodli tovar yo’q');
    const barcode = withBarcode?.barcodes[0] as string;

    await page.goto('/scan', { waitUntil: 'domcontentloaded' });
    await page.locator('[data-test-id="scan-input"]').fill(barcode);
    await page.locator('[data-test-id="scan-find"]').click();

    // Bitta aniq moslik → to'g'ridan-to'g'ri tovar kartasi.
    await page.waitForURL(new RegExp(`/products/${withBarcode?.id}`), { timeout: 20_000 });
    await page.screenshot({ path: 'test-results/mk25/scan_hit_mobile.png', fullPage: true });
  });

  test('mavjud bo’lmagan kod «topilmadi» beradi — jim qolmaydi', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/scan', { waitUntil: 'domcontentloaded' });
    await page.locator('[data-test-id="scan-input"]').fill('YO-Q-KOD-MK25-000');
    await page.locator('[data-test-id="scan-find"]').click();

    // Soxta muvaffaqiyat ham, jim ekran ham bo'lmasligi kerak.
    await expect(page.locator('[data-test-id="scan-not-found"]')).toBeVisible({ timeout: 20_000 });
    expect(page.url()).toContain('/scan');
    await page.screenshot({ path: 'test-results/mk25/scan_notfound_mobile.png', fullPage: true });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MK24 baseline — telefon kengligi (MK24 hali qurilmagan; bu O'LCHOV)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('MK25 · mobil kenglik baseline (MK24 uchun boshlang’ich holat)', () => {
  test('390×844 da qaysi ekranlar gorizontal toshadi — o’lchanadi', async ({ page }) => {
    test.setTimeout(300_000);
    await login(page);
    await page.setViewportSize({ width: 390, height: 844 });

    const measured: { route: string; phase: string; scrollWidth: number; overflowBy: number }[] =
      [];

    for (const { route, phase } of M2_PAGES) {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(SETTLE_MS);
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      measured.push({ route, phase, scrollWidth, overflowBy: scrollWidth - clientWidth });
      await page.screenshot({
        path: `test-results/mk25/mobile${route.replace(/\//g, '_')}.png`,
        fullPage: true,
      });
    }

    writeFileSync(
      'test-results/mk25/mk25-mobile-overflow.json',
      JSON.stringify(measured, null, 2),
      'utf8',
    );
    // eslint-disable-next-line no-console
    console.log('MK24 baseline:', JSON.stringify(measured));

    // MK24 qurilmagan ⇒ bu test hukm chiqarmaydi, faqat o'lchaydi.
    expect(measured.length).toBe(M2_PAGES.length);
  });
});
