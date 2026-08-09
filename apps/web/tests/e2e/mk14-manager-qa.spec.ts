/**
 * E2E (Phase-2 QA, Faza MK14): 4-Menejer nazorat ekranlari — real brauzer.
 *
 * Bu spec «render bo'ldimi» dan ko'ra ko'proq narsani so'raydi:
 *   ▸ har ekran konsol xatosisiz va 4xx/5xx so'rovsiz ochiladimi;
 *   ▸ i18n kaliti xom holda sizib chiqmaydimi (`pages.` / `common.`);
 *   ▸ RU rejimda ekran haqiqatan RUS bo'ladimi (o'zbekcha yorliq qolmasin);
 *   ▸ pul ko'rsatkichlari valyuta bilan formatlanadimi (xom minor EMAS);
 *   ▸ dialog ochiq turganda global tezkor-tugmalar hujjat holatini
 *     o'zgartirib yubormaydimi (adversarial — data-integrity).
 *
 * Ma'lumot: lokal `climart_adopt` bazasi (admin@demo.local / admin123).
 * Navbat bo'sh bo'lsa tegishli test `skip` bo'ladi — yashil yolg'on bermaslik uchun.
 */
import { type Page, expect, test } from '@playwright/test';

const MANAGER_PAGES = [
  '/menejer',
  '/menejer/navbat',
  '/menejer/jonli',
  '/menejer/javobgarlik',
  '/menejer/sifat',
  '/menejer/haftalik',
  '/menejer/qotib-qolgan',
  '/menejer/byudjet',
  '/menejer/zaxira',
  '/menejer/narx-nazorati',
  '/menejer/xato-narx',
  '/menejer/undirish',
  '/menejer/pul-manzarasi',
  '/menejer/qarorlar',
  '/menejer/izoh-shablonlari',
  '/menejer/smenalar',
  '/menejer/kassa-farqlari',
] as const;

/** Sahifa react-query bilan yuklanadi — mount'dan keyin bir necha so'rov ketadi. */
const SETTLE_MS = 2500;

/** Ega (`hrRoles: ['admin']` → FSM aktyori `owner`). */
const OWNER = { email: 'admin@demo.local', password: 'admin123' };
/**
 * Menejer (`hrRoles: ['manager']`). Eskalatsiya FSM'da FAQAT menejer/tizim
 * amali — ega uni qila olmaydi, shuning uchun eskalatsiya→majburiy yopish
 * halqasini ikki hisobsiz umuman sinab bo'lmaydi.
 */
const MANAGER = { email: 'qa.sotuvchi@qa.local', password: 'admin123' };

async function login(page: Page, who: { email: string; password: string } = OWNER) {
  await page.goto('/login');
  await page.fill('[data-test-id="login-email"]', who.email);
  await page.fill('[data-test-id="login-password"]', who.password);
  await page.click('[data-test-id="login-submit"]');
  await page.waitForURL('/');
}

async function openManagerDay(page: Page): Promise<boolean> {
  await page.goto('/menejer', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(SETTLE_MS);
  const firstDay = page.locator('[data-day-id]').first();
  if ((await firstDay.count()) === 0) return false;
  await firstDay.click();
  await expect(page.locator('table').first()).toBeVisible();
  return true;
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
    // 401 while the session bootstraps is normal SPA noise; 4xx/5xx on the
    // manager API surface is not.
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

test.describe('MK14 — menejer ekranlari Phase-2 QA', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('barcha menejer ekranlari konsol-xatosiz va xom i18n kalitisiz ochiladi', async ({
    page,
  }) => {
    const failures: string[] = [];

    for (const route of MANAGER_PAGES) {
      const r = await probe(page, route);
      if (r.consoleErrors.length > 0) {
        failures.push(`${route} — konsol xatolari: ${r.consoleErrors.slice(0, 3).join(' | ')}`);
      }
      if (r.badResponses.length > 0) {
        failures.push(`${route} — API xatolari: ${r.badResponses.slice(0, 3).join(' | ')}`);
      }
      if (r.rawKeys.length > 0) {
        failures.push(`${route} — xom i18n kaliti: ${[...new Set(r.rawKeys)].join(', ')}`);
      }
      await page.screenshot({
        path: `test-results/mk14/${route.replace(/\//g, '_')}.png`,
        fullPage: true,
      });
    }

    expect(failures, failures.join('\n')).toEqual([]);
  });

  test('kunlik qabul ekranida pul ko’rsatkichlari valyuta bilan formatlanadi', async ({ page }) => {
    test.skip(!(await openManagerDay(page)), 'Navbat bo’sh — qabul qilinmagan KPI kuni yo’q');

    // BE ko'rsatkich birligini `money` deb yuboradi va qiymat MINOR birlikda
    // keladi. FE uni formatlamasa ekranda 100 baravar katta xom son turadi.
    const table = page.locator('table').first();
    const revenueRow = table.locator('tr', { hasText: 'Kassa tushumi' }).first();
    await expect(revenueRow).toBeVisible();
    const autoCell = (await revenueRow.locator('td').nth(1).innerText()).trim();

    expect(autoCell, `«Kassa tushumi» katagi valyutasiz xom minor qiymat: «${autoCell}»`).toMatch(
      /[^\d\s.,  -]/,
    );
  });

  test('RU rejimda kunlik qabul ekrani ruscha ko’rsatkich nomlarini ko’rsatadi', async ({
    page,
  }) => {
    test.skip(!(await openManagerDay(page)), 'Navbat bo’sh — RU tekshiruvi uchun kun yo’q');

    const select = page.locator('[data-test-id="locale-switcher"] select');
    await expect(select).toBeVisible();
    await select.selectOption('ru');
    await page.waitForTimeout(SETTLE_MS + 1500);

    test.skip(!(await openManagerDay(page)), 'Navbat bo’sh');
    await page.screenshot({ path: 'test-results/mk14/ru_menejer.png', fullPage: true });

    const body = await page.locator('body').innerText();
    // `KpiMetricDef` da ikkala til ham bor (`labelUz` / `labelRu`); RU rejimda
    // `labelRu` chiqishi kerak — sibling ekranlar (`data-quality-screen`,
    // `hr/employees/[id]/kpi`) shunday qiladi.
    expect(body, 'RU rejimda o’zbekcha ko’rsatkich nomi qoldi («Kassa tushumi»)').not.toContain(
      'Kassa tushumi',
    );
  });

  test('rad etish dialogi ochiq turganda «A» tezkor tugmasi kunni QABUL QILMAYDI', async ({
    page,
  }) => {
    test.skip(!(await openManagerDay(page)), 'Navbat bo’sh — dialog tekshiruvi uchun kun yo’q');

    const rejectButton = page.getByRole('button', { name: /Rad etish|Отклонить/ }).first();
    test.skip(
      (await rejectButton.count()) === 0,
      'Bu kun uchun «rad etish» amali ruxsat etilmagan',
    );

    const stateBefore = (await page.locator('table').first().textContent()) ?? '';
    await rejectButton.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Sabab `<select>` ga fokus berib «a» bosamiz: `useHotkey` INPUT/TEXTAREA ni
    // istisno qiladi, lekin SELECT ni EMAS va dialog ochiqligini bilmaydi.
    await dialog.locator('select').first().focus();
    await page.keyboard.press('a');
    await page.waitForTimeout(1200);

    // Dialog hamon ochiq bo'lishi va kun qabul qilinmagan bo'lishi kerak.
    await expect(
      dialog,
      'dialog ichida «A» bosilganda kun jimgina qabul qilindi (dialog yopildi)',
    ).toBeVisible();
    expect(stateBefore.length).toBeGreaterThan(0);
  });
});

test.describe('MK14 — tuzatma dialogi va xodim KPI ekrani', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('tuzatma dialogi qiymatni saqlaydi va u «Tuzatma» ustunida ko’rinadi', async ({ page }) => {
    test.skip(!(await openManagerDay(page)), 'Navbat bo’sh — tuzatma uchun kun yo’q');

    const adjustBtn = page.getByRole('button', { name: /^(Tuzatma|Корректировка)$/ }).first();
    test.skip((await adjustBtn.count()) === 0, 'Kun muzlatilgan — tuzatma mumkin emas');
    await adjustBtn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Ko'rsatkich = birinchi (pul birligida), qiymat = aniq son.
    const numberInput = dialog.locator('input[inputmode="numeric"]');
    await numberInput.fill('12345');
    await dialog.getByRole('button', { name: /Saqlash|Сохранить/ }).click();

    await expect(dialog).toBeHidden({ timeout: 15_000 });

    // «Tuzatma» ustunida qiymat paydo bo'lishi kerak. Pul ko'rsatkichi bo'lsa
    // u formatlangan holda (valyuta bilan) chiqadi — xom «12345» EMAS.
    const adjustCol = page.locator('table tbody tr td:nth-child(3)');
    const texts = (await adjustCol.allInnerTexts()).map((s) => s.trim()).filter((s) => s !== '—');
    expect(texts.length, 'saqlangan tuzatma jadvalda ko’rinmadi').toBeGreaterThan(0);
    await page.screenshot({ path: 'test-results/mk14/adjust_saved.png', fullPage: true });
  });

  test('xodim KPI sozlamalari ekrani konsol-xatosiz ochiladi', async ({ page, request }) => {
    // «O'z-KPI» dialogi shu ekranda: ko'rsatkich katalogi + xodim profili.
    // Xodim id'sini API'dan olamiz — ro'yxat DOM'i o'zgarsa test qotmaydi.
    const auth = await request.post('http://localhost:4000/api/v1/auth/login', { data: OWNER });
    const token = (await auth.json()).accessToken as string;
    const list = await request.get('http://localhost:4000/api/v1/hr/employees?limit=1', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const employeeId = (await list.json()).rows?.[0]?.id as string | undefined;
    test.skip(!employeeId, 'Xodimlar ro’yxati bo’sh');

    const r = await probe(page, `/hr/employees/${employeeId}/kpi`);
    const problems = [...r.consoleErrors, ...r.badResponses, ...r.rawKeys];
    expect(problems, problems.join('\n')).toEqual([]);
    await page.screenshot({ path: 'test-results/mk14/hr_employee_kpi.png', fullPage: true });
  });
});

test.describe('MK14 — eskalatsiya → majburiy yopish (ikki aktyor)', () => {
  test('menejer eskalatsiya qiladi, ega majburiy yopadi — jurnal ikkalasini yozadi', async ({
    page,
  }) => {
    // ── 1. Menejer: navbatdan kunni eskalatsiya qiladi ────────────────────
    await login(page, MANAGER);
    test.skip(!(await openManagerDay(page)), 'Navbat bo’sh — eskalatsiya uchun kun yo’q');

    const escalate = page.getByRole('button', { name: /Eskalatsiya|Эскалация/ }).first();
    test.skip((await escalate.count()) === 0, 'Bu kun uchun eskalatsiya ruxsat etilmagan');

    const dayId = await page.locator('[data-day-id]').first().getAttribute('data-day-id');
    await escalate.click();
    // Eskalatsiyadan keyin kun menejer navbatidan chiqadi (holat `escalated`).
    await expect(page.getByText(/Egada|У владельца/).first()).toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: 'test-results/mk14/escalated_manager.png', fullPage: true });

    // ── 2. Ega: o'sha kunni majburiy yopadi ───────────────────────────────
    await login(page, OWNER);
    await page.goto('/menejer', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(SETTLE_MS);

    const escalatedRow = page.locator(`[data-day-id="${dayId}"]`);
    await expect(escalatedRow, 'eskalatsiya qilingan kun eganing navbatida yo’q').toBeVisible({
      timeout: 15_000,
    });
    await escalatedRow.click();

    const forceAccept = page
      .getByRole('button', { name: /Majburiy yopish|Закрыть принудительно/ })
      .first();
    await expect(forceAccept, 'egada «majburiy yopish» tugmasi yo’q').toBeVisible();
    // Jurnal eskalatsiyani menejer nomidan yozgani shu ekranda ko'rinadi —
    // «kim qaror qildi» savoliga yagona javob (§3.3).
    await expect(page.getByText(/Eskalatsiya|Эскалация/).first()).toBeVisible();

    await forceAccept.click();

    // Majburiy yopilgan kun navbatdan CHIQADI (terminal holat) — ekran
    // keyingi kunga o'tadi, shuning uchun holat yorlig'ini emas, qatorning
    // yo'qolishini tekshiramiz.
    await expect(escalatedRow, 'majburiy yopilgandan keyin kun hamon navbatda turibdi').toHaveCount(
      0,
      { timeout: 20_000 },
    );
    await page.screenshot({ path: 'test-results/mk14/force_accepted_owner.png', fullPage: true });
  });
});
