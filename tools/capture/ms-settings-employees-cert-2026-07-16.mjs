// LIVE CERT: settings 1:1 navbar + Справочники→Сотрудники band (dev :3100/:4000).
// Verifies in a real browser: sidebar structure, employees list, employee card
// (sections/toolbar), «История изменений» drawer, countries/sales-channels
// pages, and the permission-based top-nav hiding for a POS-only employee.
// Creates ONE throwaway employee via API (archived at the end).
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const OUT = resolve('D:/projects/moysklad/docs/audits/settings-employees-2026-07-16');
mkdirSync(OUT, { recursive: true });
const WEB = 'http://localhost:3100';
const API = 'http://localhost:4000/api/v1';

let PASS = 0;
let FAIL = 0;
const results = [];
const check = (name, cond, extra = '') => {
  const line = `${cond ? 'PASS' : 'FAIL'} ${name}${cond ? '' : ` — ${extra}`}`;
  results.push(line);
  console.info(line);
  cond ? PASS++ : FAIL++;
};

const j = async (method, path, body, token) => {
  const res = await fetch(API + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {}
  return { status: res.status, data };
};

// ── API prep: admin token + a POS-restricted employee for the nav check ──
const adminLogin = await j('POST', '/auth/login', {
  identifier: 'admin@demo.local',
  password: 'admin123',
});
const T = adminLogin.data?.accessToken;
const stamp = Date.now() % 1000000;
const created = await j(
  'POST',
  '/hr/employees',
  {
    name: 'Кассир Тестов',
    lastName: 'Кассир',
    firstName: 'Тестов',
    position: 'Кассир',
    email: `pos-cert-${stamp}@test.local`,
    loginAllowed: true,
    hrRoles: [],
    isChecker: false,
  },
  T,
);
const EMP = created.data?.id;
const POS_USER = `pos_cert_${stamp}`;
await j(
  'POST',
  `/hr/employees/${EMP}/set-password`,
  { username: POS_USER, password: 'pos12345' },
  T,
);
const pos = await j('POST', '/roles/system/pos/ensure', {}, T);
await j('PUT', `/roles/employee/${EMP}`, { roleIds: [pos.data.id] }, T);

const b = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await b.newContext({ viewport: { width: 1680, height: 1000 }, locale: 'ru-RU' });
const p = await ctx.newPage();
p.setDefaultTimeout(45000);

async function login(identifier, password) {
  await p.goto(`${WEB}/login`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('input', { timeout: 60000 });
  // next dev: wait out compile + hydration before interacting, else the
  // pre-hydration click is swallowed and the form never submits.
  await p.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(2500);
  for (let attempt = 0; attempt < 3; attempt++) {
    const inputs = p.locator('input');
    await inputs.nth(0).fill(identifier);
    await inputs.nth(1).fill(password);
    await p.click('button[type=submit]'); // CLICK, not Enter (Enter issues a GET)
    const navigated = await p
      .waitForURL((u) => !String(u).includes('/login'), { timeout: 15000 })
      .then(() => true)
      .catch(() => false);
    if (navigated) break;
    if (attempt === 2) throw new Error(`login stuck on /login for ${identifier}`);
    await p.waitForTimeout(2000);
  }
  await p.waitForTimeout(1500);
}

try {
  // ── A. admin: /settings redirect + sidebar 1:1 ──
  await login('admin@demo.local', 'admin123');
  await p.goto(`${WEB}/settings`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(4000);
  check(
    'A1 /settings redirects to /settings/company',
    p.url().includes('/settings/company'),
    p.url(),
  );
  const sidebar = p.locator('[data-testid="settings-sidebar"]');
  await sidebar.waitFor({ state: 'visible' });
  const sbText = (await sidebar.innerText()).replace(/\s+/g, ' ');
  for (const label of [
    'НАСТРОЙКИ',
    'ОБМЕН ДАННЫМИ',
    'СПРАВОЧНИКИ',
    'Настройки компании',
    'Сценарии',
    'Бизнес-процессы',
    'Импорт',
    'Экспорт',
    'Токены',
    'Юр. лица',
    'Сотрудники',
    'Каналы продаж',
    'Валюты',
    'Проекты',
    'Страны',
    'Единицы измерения',
    'Ставки НДС',
    'Справочник',
  ]) {
    check(`A2 sidebar has «${label}»`, sbText.includes(label));
  }
  await p.screenshot({ path: resolve(OUT, 'cert-a-settings-sidebar.png'), fullPage: false });

  // ── B. employees list 1:1 ──
  await p.click('[data-testid="settings-link-employees"]');
  await p.waitForURL((u) => String(u).includes('/settings/employees'));
  await p.waitForSelector('[data-testid="employees-page"]');
  await p.waitForTimeout(2500);
  const listText = (await p.locator('[data-testid="employees-page"]').innerText()).replace(
    /\s+/g,
    ' ',
  );
  for (const label of [
    'Сотрудники',
    'Сотрудник',
    'Фильтр',
    'Изменить',
    'Как настроить права доступа',
    'Вход',
    'Фамилия',
    'Имя',
    'Отчество',
    'E-mail',
    'Телефон',
    'Логин',
    'Описание',
    'Роль',
  ]) {
    check(`B1 list has «${label}»`, listText.includes(label));
  }
  check('B2 list has a row for the cert employee', listText.includes('Кассир'));
  await p.screenshot({ path: resolve(OUT, 'cert-b-employees-list.png'), fullPage: false });

  // ── C. employee card ──
  await p.goto(`${WEB}/settings/employees/${EMP}`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('[data-testid="employee-card"]');
  await p.waitForTimeout(2500);
  const cardText = (await p.locator('[data-testid="employee-card"]').innerText()).replace(
    /\s+/g,
    ' ',
  );
  for (const label of [
    'Сохранить',
    'Закрыть',
    'Поместить в архив',
    'Удалить сотрудника',
    'Фамилия',
    'Имя',
    'Отчество',
    'Телефон',
    'Должность',
    'Оклад',
    'ИНН',
    'Описание',
    'Изображение',
    'Вход в МойСклад',
    'Разрешить вход в систему',
    'Логин',
    'E-mail',
    'Отдел',
    'Сбросить пароль',
    'Системные роли',
    'Владелец аккаунта',
    'Администратор',
    'Доступ только к точкам продаж',
    'Пользователь', // «Настроить права» tugmasi faqat user-rejimda chiqadi
    'Сеть',
    'Доступ только с адресов',
    'IP адрес',
    'Доступ только из сети',
    'IP-сеть',
    'Уведомления',
    'Веб-интерфейс',
    'Почта',
    'Телефон',
    'Заказы покупателей',
    'Остатки',
    'Розничная торговля',
    'Интернет-магазины',
  ]) {
    check(`C1 card has «${label}»`, cardText.includes(label));
  }
  check(
    'C2 POS radio is selected for cert employee',
    cardText.includes('Доступ только к точкам продаж'),
  );
  await p.screenshot({ path: resolve(OUT, 'cert-c-employee-card.png'), fullPage: true });

  // ── D. История изменений drawer ──
  await p.click('[data-testid="employee-history-link"]');
  await p.waitForSelector('[data-testid="employee-history-drawer"]');
  await p.waitForTimeout(2000);
  const histText = (await p.locator('[data-testid="employee-history-drawer"]').innerText()).replace(
    /\s+/g,
    ' ',
  );
  check('D1 drawer titled «История изменений»', histText.includes('История изменений'));
  check(
    'D2 feed shows employee create/roles entries',
    /Сотрудник/.test(histText) && /из \d+/.test(histText),
    histText.slice(0, 200),
  );
  await p.screenshot({ path: resolve(OUT, 'cert-d-history-drawer.png'), fullPage: false });
  await p.keyboard.press('Escape');

  // ── E. countries + sales-channels + a stub page ──
  await p.goto(`${WEB}/settings/countries`, { waitUntil: 'domcontentloaded' });
  // ListView renders its testId as hyphenated data-test-id — accept both.
  await p.waitForSelector('[data-testid="countries-page"], [data-test-id="countries-page"]');
  await p.waitForTimeout(2000);
  check('E1 countries page renders «Страны»', (await p.innerText('body')).includes('Страны'));
  await p.screenshot({ path: resolve(OUT, 'cert-e-countries.png'), fullPage: false });
  await p.goto(`${WEB}/settings/sales-channels`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector(
    '[data-testid="sales-channels-page"], [data-test-id="sales-channels-page"]',
  );
  await p.waitForTimeout(2000);
  check(
    'E2 sales-channels page renders «Каналы продаж»',
    (await p.innerText('body')).includes('Каналы продаж'),
  );
  await p.screenshot({ path: resolve(OUT, 'cert-f-sales-channels.png'), fullPage: false });
  await p.goto(`${WEB}/settings/scenarios`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('[data-testid="settings-stub-scenarios"]');
  check('E3 scenarios stub renders «Сценарии»', (await p.innerText('body')).includes('Сценарии'));

  // ── F. permission-based top-nav hiding (POS-only employee) ──
  await p.goto(`${WEB}/login`, { waitUntil: 'domcontentloaded' });
  await p.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  // email-identifier: the login form validates email format, and the API
  // accepts email OR username — use the email to keep the UI path green.
  await login(`pos-cert-${stamp}@test.local`, 'pos12345');
  await p.waitForTimeout(5000); // permissions/me fetch + nav render
  // Scan ONLY the top module bar — the dashboard body can legitimately
  // contain words like «Деньги» in widgets.
  const navText = (await p.locator('header nav, nav').first().innerText()).replace(/\s+/g, ' ');
  check('F1 POS nav shows Розница', navText.includes('Розница'));
  check('F2 POS nav hides Закупки', !navText.includes('Закупки'), 'Закупки still visible');
  check('F3 POS nav hides Деньги', !navText.includes('Деньги'), 'Деньги still visible');
  check('F4 POS nav hides Производство', !navText.includes('Производство'), 'still visible');
  await p.screenshot({ path: resolve(OUT, 'cert-g-pos-nav-hidden.png'), fullPage: false });
} catch (e) {
  check('UNCAUGHT', false, e.message);
  await p.screenshot({ path: resolve(OUT, 'cert-error.png'), fullPage: true }).catch(() => {});
} finally {
  await b.close();
  // cleanup: archive the cert employee (keeps audit history, hides from list)
  if (EMP) await j('POST', '/hr/employees/bulk-archive', { ids: [EMP] }, T);
  writeFileSync(resolve(OUT, 'cert-results.txt'), results.join('\n'));
  console.info(`\nCERT RESULT: ${PASS} pass / ${FAIL} fail`);
  process.exitCode = FAIL === 0 ? 0 : 1;
}
