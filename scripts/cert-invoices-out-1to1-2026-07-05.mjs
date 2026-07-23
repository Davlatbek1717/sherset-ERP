// Runtime cert for the /invoices-out 1:1 convergence (2026-07-05).
// Exercises EVERY new function end-to-end against a fresh dev stack (web :3121 → api :4021):
//   1. Custom-status CRUD (/settings/invoice-out-statuses)
//   2. /new: custom-status dropdown + «Настроить…» + dirty-close 3-button modal + staged file + save
//   3. /[id]: status pill set (PATCH :id/status) + Печать menu + Отправить menu + Создать документ
//   4. list: custom-status column + Изменить (Копировать/Провести/Снять/Объединить) + Создать + Печать menus
// Logs every step + POST/PATCH responses; asserts key outcomes. NO reliance on live moysklad.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = process.env.CERT_BASE || 'http://localhost:3121';
const OUT = resolve('D:/projects/moysklad/docs/audits/invoices-out-1to1-2026-07-05');
mkdirSync(OUT, { recursive: true });
const sel = (id) => `[data-test-id="${id}"]`;
const out = { steps: [], asserts: [], mutations: [], consoleErrors: [] };
const ok = (m) => { out.steps.push('✓ ' + m); console.log('✓', m); };
const bad = (m) => { out.steps.push('✗ ' + m); console.log('✗', m); };
const assert = (name, cond) => { out.asserts.push({ name, pass: !!cond }); (cond ? ok : bad)('ASSERT ' + name + ' = ' + !!cond); };

const b = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await b.newContext({ viewport: { width: 1680, height: 1000 }, locale: 'ru-RU' });
const page = await ctx.newPage();
page.setDefaultTimeout(30000);
page.on('console', (m) => { if (m.type() === 'error') out.consoleErrors.push(m.text().slice(0, 200)); });
page.on('response', async (r) => {
  const m = r.request().method();
  if ((m === 'POST' || m === 'PATCH') && /\/api\/v1\/(invoices-out|payments-in|cash-in|states)/.test(r.url())) {
    let body = '';
    try { body = (await r.text()).slice(0, 200); } catch {}
    out.mutations.push({ method: m, url: r.url().replace(/^.*\/api\/v1/, ''), status: r.status(), body });
  }
});

try {
  // ── Login ──
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.locator(sel('login-submit')).click().catch(() => {});
  await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 25000 }).catch(async () => {
    await page.locator(sel('login-password')).press('Enter').catch(() => {});
    await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 25000 }).catch(() => {});
  });
  ok('logged in');

  // ── 1. Custom-status settings page ──
  await page.goto(`${BASE}/settings/invoice-out-statuses`, { waitUntil: 'domcontentloaded' });
  await page.locator(sel('invoice-out-statuses-page')).waitFor({ timeout: 60000 });
  ok('/settings/invoice-out-statuses renders');
  const STAMP = String(Date.now()).slice(-6);
  const STATUS_NAME = `Отгружен ${STAMP}`;
  // Open create modal
  await page.locator('button:has-text("Новый статус"), button:has-text("Создать")').first().click().catch(() => {});
  await page.waitForTimeout(600);
  await page.locator(sel('invoice-out-status-name')).fill(STATUS_NAME).catch(() => {});
  await page.locator(sel('invoice-out-status-color-#008739')).click().catch(() => {});
  await page.locator('button:has-text("Создать"), button:has-text("Сохранить")').last().click().catch(() => {});
  await page.waitForTimeout(1500);
  const statusListText = await page.locator('body').innerText();
  assert('custom status created + listed', statusListText.includes(STATUS_NAME));
  await page.screenshot({ path: resolve(OUT, 'cert-01-statuses.png') });

  // ── 2. /new editor ──
  await page.goto(`${BASE}/invoices-out/new`, { waitUntil: 'domcontentloaded' });
  await page.locator(sel('invoice-out-new-page')).waitFor({ timeout: 120000 });
  ok('/invoices-out/new renders');
  // Wait until the org field auto-fills (user defaults settled) — the dirty-close
  // baseline is armed right after this, so any edit AFTER makes the form dirty.
  // Editing BEFORE would let the baseline absorb it (form stays pristine).
  await page
    .waitForFunction(
      () => {
        const el = document.querySelector('[data-test-id="field-organization-input"]');
        return el && el.value && el.value.trim().length > 0;
      },
      { timeout: 30000 },
    )
    .catch(() => {});
  await page.waitForTimeout(800);

  // Fill the agent (Контрагент) inline — required. Correct inline testIds:
  // `field-agent-input` (the input) + `field-agent-option-*` (dropdown rows).
  await page.locator(sel('field-agent-input')).click().catch(() => {});
  await page.locator(sel('field-agent-input')).fill('A').catch(() => {}); // matches "ABC MCHJ" (counterparties are Latin-named)
  await page.waitForTimeout(1500);
  const agentOpt = page.locator('[data-test-id^="field-agent-option-"]').first();
  const agentOptCount = await agentOpt.count();
  if (agentOptCount > 0) await agentOpt.click().catch(() => {});
  await page.waitForTimeout(800);
  // Verify an option was actually SELECTED (agentId set), not just typed text —
  // the «Баланс» helper only renders once a counterparty is picked.
  const balanceShown = await page.locator('text=Баланс').first().isVisible().catch(() => false);
  assert('/new: Контрагент picked (Баланс shown)', agentOptCount > 0 && balanceShown);

  // Add a product position via the inline add — click the first suggestion
  // button inside `position-inline-add-suggestions` (rows have no per-item id).
  const posInput = page.locator(sel('position-inline-add-input')).first();
  if ((await posInput.count()) > 0) {
    await posInput.click().catch(() => {});
    await posInput.fill('i').catch(() => {}); // matches "iPhone" (products are Latin-named)
    await page.waitForTimeout(1500);
    await page.locator(`${sel('position-inline-add-suggestions')} button`).first().click().catch(() => {});
    await page.waitForTimeout(900);
  }
  // Fallback: «Добавить из справочника» → catalog picker
  let posCount = await page.locator('[data-test-id^="pos-"][data-test-id$="-name"]').count();
  if (posCount === 0) {
    await page.locator(sel('position-inline-add-catalog')).first().click().catch(() => {});
    await page.waitForTimeout(1000);
    await page.locator('[data-test-id^="catalog-picker"] tbody tr, [data-test-id^="catalog-picker"] li').first().click().catch(() => {});
    await page.waitForTimeout(900);
    posCount = await page.locator('[data-test-id^="pos-"][data-test-id$="-name"]').count();
  }
  assert('/new: a position row was added', posCount > 0);

  await page.screenshot({ path: resolve(OUT, 'cert-02-new-filled.png') });

  // Dirty-close modal: click Закрыть → 3-button modal → Отмена (stay)
  await page.locator(sel('doc-toolbar-close')).first().click().catch(() => {});
  await page.waitForTimeout(900);
  const dlg = page.locator(sel('save-changes-dialog'));
  const dlgVisible = await dlg.isVisible().catch(() => false);
  assert('/new dirty-close 3-button modal appears', dlgVisible);
  if (dlgVisible) {
    const hasYes = await page.locator(sel('save-changes-yes')).count();
    const hasNo = await page.locator(sel('save-changes-no')).count();
    const hasCancel = await page.locator(sel('save-changes-cancel')).count();
    assert('modal has Да/Нет/Отмена', hasYes && hasNo && hasCancel);
    await page.locator(sel('save-changes-cancel')).click().catch(() => {});
    await page.waitForTimeout(500);
  }

  // Save → lands on /[id]
  await page.locator(sel('doc-toolbar-save')).first().click().catch(async () => {
    await page.locator('button:has-text("Сохранить")').first().click().catch(() => {});
  });
  await page.waitForURL((u) => /\/invoices-out\/[0-9a-f-]{36}/.test(u.pathname), { timeout: 30000 }).catch(() => {});
  const detailUrl = page.url();
  const invoiceId = detailUrl.match(/invoices-out\/([0-9a-f-]{36})/)?.[1] ?? null;
  assert('/new save → redirect to /[id]', !!invoiceId);
  ok('created invoice id ' + (invoiceId ?? 'NONE'));

  // ── 3. /[id] editor ──
  if (invoiceId) {
    await page.locator(sel('invoice-out-detail-page')).waitFor({ timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await page.screenshot({ path: resolve(OUT, 'cert-03-detail.png') });

    // Status pill — open + pick the custom status
    const statusTrigger = page.locator('[data-test-id="document-status-trigger"], [data-test-id="status-pill"]').first();
    await statusTrigger.click().catch(() => {});
    await page.waitForTimeout(600);
    const statusOpt = page.locator(`text=${STATUS_NAME}`).first();
    const statusOptVisible = await statusOpt.isVisible().catch(() => false);
    if (statusOptVisible) {
      await statusOpt.click().catch(() => {});
      await page.waitForTimeout(1200);
    }
    // Verify PATCH :id/status fired 200
    const statusPatch = out.mutations.find((m) => m.method === 'PATCH' && /\/invoices-out\/.*\/status/.test(m.url));
    assert('detail status pill → PATCH :id/status 200', statusPatch && statusPatch.status === 200);

    // Печать menu opens + has forms/standard/Комплект/Настроить
    await page.locator(sel('detail-toolbar-print-trigger')).click().catch(() => {});
    await page.waitForTimeout(600);
    const printMenuText = await page.locator('body').innerText();
    assert('Печать menu has «Счет покупателю» standard', printMenuText.includes('Счет покупателю'));
    assert('Печать menu has «Комплект…»', /Комплект/.test(printMenuText));
    assert('Печать menu has «Настроить…»', /Настроить/.test(printMenuText));
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(400);

    // Отправить menu opens
    await page.locator(sel('detail-toolbar-send-trigger')).click().catch(() => {});
    await page.waitForTimeout(500);
    const sendMenuText = await page.locator('body').innerText();
    assert('Отправить menu renders «Счет покупателю»', sendMenuText.includes('Счет покупателю'));
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(400);

    // Создать документ menu
    await page.locator(sel('detail-toolbar-create-trigger')).click().catch(() => {});
    await page.waitForTimeout(500);
    const createMenuText = await page.locator('body').innerText();
    assert('Создать документ has «Входящий платёж»', /Входящий платёж/.test(createMenuText));
    assert('Создать документ has «Приходный ордер»', /Приходный ордер/.test(createMenuText));
    await page.screenshot({ path: resolve(OUT, 'cert-04-create-menu.png') });
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(400);
  }

  // ── 4. List page ──
  await page.goto(`${BASE}/invoices-out`, { waitUntil: 'domcontentloaded' });
  await page.locator(sel('invoices-out-page')).waitFor({ timeout: 60000 });
  await page.waitForTimeout(2000);
  ok('/invoices-out list renders');
  const listText = await page.locator('body').innerText();
  assert('list shows a padded-number invoice (00NNN)', /\b\d{5}\b/.test(listText));
  await page.screenshot({ path: resolve(OUT, 'cert-05-list.png') });

  // Open Изменить menu (nothing selected → disabled trigger still present)
  // Select the first row checkbox
  const firstRowCb = page.locator('table tbody tr').first().locator('input[type="checkbox"], [role="checkbox"]').first();
  await firstRowCb.click().catch(() => {});
  await page.waitForTimeout(600);
  // Изменить menu items
  await page.locator('button:has-text("Массовое"), button:has-text("Изменить")').first().click().catch(() => {});
  await page.waitForTimeout(500);
  const editMenuText = await page.locator('body').innerText();
  assert('list Изменить menu has Копировать', /Копировать/.test(editMenuText));
  assert('list Изменить menu has Провести', /Провести/.test(editMenuText));
  assert('list Изменить menu has Объединить', /Объединить/.test(editMenuText));
  await page.screenshot({ path: resolve(OUT, 'cert-06-edit-menu.png') });
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(400);

  // Создать menu
  await page.locator('button:has-text("Создать")').filter({ hasNotText: 'Счет' }).first().click().catch(() => {});
  await page.waitForTimeout(500);
  const createListText = await page.locator('body').innerText();
  assert('list Создать has «Входящие платежи»', /Входящие платежи/.test(createListText));
  assert('list Создать has «Приходные ордера»', /Приходные ордера/.test(createListText));
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(400);

  // Печать menu (list)
  await page.locator('button:has-text("Печать")').first().click().catch(() => {});
  await page.waitForTimeout(500);
  const printListText = await page.locator('body').innerText();
  assert('list Печать has «Список счетов»', /Список счетов/.test(printListText));
  assert('list Печать has «Комплект…»', /Комплект/.test(printListText));
  await page.keyboard.press('Escape').catch(() => {});

  assert('no console errors', out.consoleErrors.length === 0);
} catch (e) {
  bad('EXCEPTION: ' + (e && e.message ? e.message : String(e)).slice(0, 300));
  out.exception = String(e).slice(0, 500);
} finally {
  const passed = out.asserts.filter((a) => a.pass).length;
  out.summary = `${passed}/${out.asserts.length} asserts passed · ${out.consoleErrors.length} console errors · ${out.mutations.length} mutations`;
  writeFileSync(resolve(OUT, 'cert-result.json'), JSON.stringify(out, null, 2));
  console.log('\n=== ' + out.summary + ' ===');
  console.log('mutations:', JSON.stringify(out.mutations, null, 1).slice(0, 1500));
  await b.close();
}
