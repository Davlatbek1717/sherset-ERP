// Re-ground cashin («Приходный ордер») + paymentout («Исходящий платёж») — the first run
// hit the SPA still loading («Загрузка…»). Longer post-login warmup + per-list waits.
// READ-ONLY: navigation + Escape only. Creds from .env.local, never printed.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = 'D:/projects/moysklad';
const OUT = resolve(REPO, 'docs/audits/cash-money-forms-2026-06-26/moysklad');
mkdirSync(OUT, { recursive: true });
const env = {};
for (const line of readFileSync(resolve(REPO, '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^(MOYSKLAD_[A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
}
const SITE = env.MOYSKLAD_URL || 'https://online.moysklad.uz';
const EMAIL = env.MOYSKLAD_EMAIL;
const PASSWORD = env.MOYSKLAD_PASS || env.MOYSKLAD_PASSWORD;
if (!EMAIL || !PASSWORD) {
  console.error('NO creds');
  process.exit(2);
}

const b = await chromium.launch({ headless: true });
const ctx = await b.newContext({ viewport: { width: 1680, height: 1000 }, locale: 'ru-RU' });
const p = await ctx.newPage();
p.setDefaultTimeout(45000);
p.setDefaultNavigationTimeout(120000);
const out = { site: SITE, forms: {} };
const shot = (f, clip) =>
  p.screenshot(clip ? { path: resolve(OUT, f), clip } : { path: resolve(OUT, f) }).catch(() => {});

const metaLabels = () =>
  p.evaluate(() => {
    const labels = [];
    for (const el of document.querySelectorAll('td, div, span, label')) {
      const r = el.getBoundingClientRect();
      if (r.top < 110 || r.top > 660 || r.height > 40 || r.width < 24) continue;
      const t = (el.textContent || '').trim();
      if (!t || t.length > 42 || el.children.length > 1) continue;
      if (/^[А-ЯA-Z][а-яёa-z.,()\/ -]+\*?$/.test(t) && t.length >= 3)
        labels.push({ t, x: Math.round(r.left), y: Math.round(r.top) });
    }
    const seen = new Set();
    return labels
      .filter((l) => (seen.has(l.t) ? false : seen.add(l.t)))
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .slice(0, 60);
  });

const headerHints = () =>
  p.evaluate(() => {
    const body = document.body.innerText || '';
    return {
      hasValuta: /Валюта/.test(body),
      hasVhodNomer: /Входящий номер/.test(body),
      hasNaznachenie: /Назначение платежа/.test(body),
      hasOsnovanie: /Основание/.test(body),
      hasStatyaRashod: /Статья расходов/.test(body),
      hasStatyaDohod: /Статья доходов/.test(body),
      hasStatus: /Статус/.test(body),
      hasProvedeno: /Проведен/.test(body),
      hasVklNds: /Включая НДС/.test(body),
      hasKassa: /Касса/.test(body),
      hasSchetOrg: /Счёт организации|Счет организации/.test(body),
      hasSchetKontr: /Счёт контрагента|Счет контрагента/.test(body),
      hasProekt: /Проект/.test(body),
      hasDogovor: /Договор/.test(body),
      hasKanal: /Канал продаж/.test(body),
      hasDataNachisl: /Дата начисления/.test(body),
      hasBezZakr: /Без закрывающих/.test(body),
      hasKomment: /Комментарий/.test(body),
      hasOplachDocs: /Оплаченные документы/.test(body),
    };
  });

async function groundForm(key, route, editMatch, idx) {
  const base = p.url().split('#')[0];
  const info = { route, editHref: null };
  await p.goto(`${base}#${route}`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(16000); // list needs longer; SPA was «Загрузка…» before
  await shot(`${idx}0-${key}-list.png`);
  info.editHref = await p.evaluate((m) => {
    const a = document.querySelector(`a[href*="${m}"]`);
    return a ? a.getAttribute('href') : null;
  }, editMatch);
  if (info.editHref) {
    const url = info.editHref.startsWith('#') ? `${base}${info.editHref}` : info.editHref;
    await p.goto(url, { waitUntil: 'domcontentloaded' });
    await p
      .locator(':text-is("Сохранить") >> visible=true')
      .first()
      .waitFor({ timeout: 40000 })
      .catch(() => {});
    await p.waitForTimeout(6000);
    info.editorOpened = (await p.locator(':text-is("Сохранить") >> visible=true').count()) > 0;
    await shot(`${idx}1-${key}-editor-full.png`);
    await shot(`${idx}2-${key}-editor-meta.png`, { x: 0, y: 110, width: 1340, height: 540 });
    info.metaFields = await metaLabels();
    info.headerHints = await headerHints();
  } else {
    info.note = 'no existing doc — list may be empty';
  }
  out.forms[key] = info;
}

try {
  await p.goto(SITE, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(5000);
  const pass = p.locator('input[type="password"]').first();
  const login = p
    .locator('input:not([type="password"]):not([type="hidden"]):not([type="checkbox"]):not([type="submit"])')
    .first();
  await login.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
  await login.fill(EMAIL).catch(() => {});
  await pass.fill(PASSWORD).catch(() => {});
  for (const s of ['button:has-text("Войти")', 'button[type="submit"]']) {
    const el = p.locator(s).first();
    if ((await el.count()) && (await el.isVisible().catch(() => false))) {
      await el.click().catch(() => {});
      break;
    }
  }
  await p.waitForTimeout(14000);
  await p.keyboard.press('Enter').catch(() => {});
  await p.waitForTimeout(6000);
  out.loggedInUrl = p.url();
  // WARMUP: load a known-good module first so the SPA is fully booted.
  await p.goto(`${p.url().split('#')[0]}#cashout`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(12000);

  await groundForm('cashin', 'cashin', 'cashin/edit', 1);
  await groundForm('paymentout', 'paymentout', 'paymentout/edit', 2);
} catch (e) {
  out.error = String(e).slice(0, 400);
}

writeFileSync(resolve(OUT, 'cashin-paymentout-reground.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await b.close();
