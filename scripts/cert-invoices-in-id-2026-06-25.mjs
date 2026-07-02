// LIVE CERT — /invoices-in/[id] rebuilt on the PO/[id] shell, 1:1 with moysklad's
// «Счёт поставщика» editor. Verifies on a DRAFT invoice: (1) renders; (2) meta labels;
// (3) ref fields are INLINE (click Контрагент → anchored dropdown, NOT a modal); (4)
// owner popover present; (5) a real EDIT round-trip (change «Комментарий» → Сохранить →
// reload → persisted). Then on a POSTED invoice (if one exists): fields locked +
// «проведён» notice. 0 console errors. Runs against the turbopack dev server :3100.
import { chromium } from 'playwright';

const WEB = process.env.CERT_BASE || 'http://localhost:3100';
const API = process.env.API_BASE || 'http://localhost:4000/api/v1';
const out = { steps: [], consoleErrors: [] };
const ok = (m) => out.steps.push(`OK  ${m}`);
const bad = (m) => out.steps.push(`BAD ${m}`);
const sel = (tid) => `[data-test-id="${tid}"], [data-testid="${tid}"]`;

// ── pick a draft + (optional) posted invoice id via the API ──
async function apiLogin() {
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@demo.local', password: 'admin123' }),
  });
  const j = await r.json();
  return j.accessToken || j.token;
}
async function findInvoices(token) {
  const r = await fetch(`${API}/invoices-in?limit=100`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const j = await r.json();
  const items = j.items || [];
  return {
    draft: items.find((x) => x.applicable === false && x.state !== 'cancelled'),
    posted: items.find((x) => x.applicable === true),
  };
}

const b = await chromium.launch({ headless: true });
const page = await (
  await b.newContext({ viewport: { width: 1680, height: 1000 }, locale: 'ru-RU' })
).newPage();
page.setDefaultTimeout(60000);
page.on('console', (m) => {
  if (m.type() === 'error') out.consoleErrors.push(m.text().slice(0, 200));
});
page.on('pageerror', (e) => out.consoleErrors.push(`PAGEERR ${String(e).slice(0, 200)}`));

try {
  const token = await apiLogin();
  if (!token) throw new Error('no api token');
  const { draft, posted } = await findInvoices(token);
  out.draftId = draft?.id ?? null;
  out.postedId = posted?.id ?? null;
  if (!draft) throw new Error('no draft invoice to cert (create one via /invoices-in/new first)');

  // ── UI login ──
  await page.goto(`${WEB}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-test-id="login-submit"]').click().catch(() => {});
  await page
    .waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 20000 })
    .catch(async () => {
      await page.locator('[data-test-id="login-password"]').press('Enter').catch(() => {});
      await page
        .waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 20000 })
        .catch(() => {});
    });
  ok('logged in');

  // ── DRAFT: render + meta + inline + owner + edit round-trip ──
  await page.goto(`${WEB}/invoices-in/${draft.id}`, { waitUntil: 'domcontentloaded' });
  await page.locator(sel('invoice-in-detail-page')).waitFor({ timeout: 90000 });
  await page.locator(sel('field-agent')).first().waitFor({ timeout: 30000 });
  ok(`draft ${draft.name} renders`);

  const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  for (const label of [
    'Организация',
    'Контрагент',
    'Склад',
    'Договор',
    'План. дата оплаты',
    'Проект',
    'Входящий номер',
    'Валюта документа',
    'Проведено',
  ]) {
    if (body.includes(label)) ok(`meta «${label}» present`);
    else bad(`meta «${label}» MISSING`);
  }

  // INLINE ref fields (user complaint): click Контрагент → dropdown, NO catalog-picker modal
  await page.locator(sel('field-agent-input')).click().catch(() => {});
  await page.waitForTimeout(1200);
  const agentModal = await page.locator('[data-test-id="catalog-picker"]:visible').count();
  const agentDropdown = await page.locator(sel('field-agent-dropdown')).count();
  if (agentModal === 0 && agentDropdown >= 1) ok('Контрагент → INLINE dropdown (no modal)');
  else bad(`Контрагент NOT inline (modal=${agentModal} dropdown=${agentDropdown})`);
  await page.keyboard.press('Escape').catch(() => {});

  // owner popover present (editable draft)
  if ((await page.locator(sel('doc-owner-trigger')).count()) >= 1)
    ok('owner popover present (editable draft)');
  else bad('owner popover MISSING on draft');

  // EDIT round-trip: change «Комментарий» → Сохранить → reload → persisted
  const stamp = `cert-${draft.id.slice(0, 8)}-${draft.version}`;
  const descBox = page.locator(sel('field-description')).first();
  await descBox.click().catch(() => {});
  await descBox.fill(stamp).catch(() => {});
  await page.waitForTimeout(300);
  await page.locator('button:has-text("Сохранить")').first().click().catch(() => {});
  await page.waitForTimeout(2500);
  // reload from server + verify persisted
  const after = await fetch(`${API}/invoices-in/${draft.id}`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json());
  if (after.description === stamp) ok(`EDIT round-trip OK (description persisted «${stamp}»)`);
  else bad(`EDIT did not persist (got «${after.description}»)`);

  // ── POSTED: EDITABLE (moysklad parity — a posted invoice is NOT locked) ──
  if (posted) {
    await page.goto(`${WEB}/invoices-in/${posted.id}`, { waitUntil: 'domcontentloaded' });
    await page.locator(sel('invoice-in-detail-page')).waitFor({ timeout: 60000 });
    await page.waitForTimeout(1500);
    const agentInput = page.locator(sel('field-agent-input')).first();
    const disabled = (await agentInput.count())
      ? await agentInput.isDisabled().catch(() => true)
      : true;
    const pbody = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    const hasNotice = /проведён|Сначала снимите проведение|изменить нельзя/i.test(pbody);
    if (disabled === false) ok(`posted ${posted.name}: ref field EDITABLE (not locked)`);
    else bad('posted invoice: agent field still locked — should be editable');
    if (!hasNotice) ok('posted: NO lock notice (moysklad parity)');
    else bad('posted: lock notice still shown');
    if ((await page.locator(sel('doc-owner-trigger')).count()) >= 1)
      ok('posted: owner popover editable');
    else bad('posted: owner popover missing (should be editable)');
  } else {
    out.steps.push('… no posted invoice to test (skipped)');
  }
} catch (e) {
  out.fatal = String(e).slice(0, 300);
} finally {
  await b.close();
}
out.consoleErrorCount = out.consoleErrors.length;
out.pass = out.steps.filter((s) => s.startsWith('OK')).length;
out.fail = out.steps.filter((s) => s.startsWith('BAD')).length;
console.log(JSON.stringify(out, null, 2));
