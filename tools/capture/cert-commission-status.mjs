// CERT (RU locale): the «Статус» custom-status feature on /commission-reports/new
// + the /settings/commission-report-statuses page. Seeds one status via the API
// (deterministic), then drives the browser:
//   A) /settings/commission-report-statuses lists the status + create-modal opens
//   B) /commission-reports/new header «Статус» pill (NOT «Черновик»), the status
//      option + «Настроить» footer, «Проведено» checked, «Промежуточный итог» BOLD,
//      no «Кол-во» totals line.
// Cleans up the seeded status afterwards.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const PORT = process.env.CERT_PORT || '3280';
const API = 'http://localhost:4100/api/v1';
const OUT = resolve('D:/projects/moysklad/docs/audits/commission-reports-new-2026-06-28/cert');
mkdirSync(OUT, { recursive: true });

const j = async (res) => {
  const t = await res.text();
  try {
    return JSON.parse(t);
  } catch {
    return t;
  }
};
// --- API seed: one commissionreportout status ---
const lb = await j(
  await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@demo.local', password: 'admin123' }),
  }),
);
const token = lb?.accessToken || lb?.token || lb?.access_token;
const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
const seeded = await j(
  await fetch(`${API}/states`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ entityType: 'commissionreportout', name: 'Готов к выплате', color: '#008739', position: 0 }),
  }),
);
const seededId = seeded?.id;

const b = await chromium.launch({ headless: true });
const ctx = await b.newContext({ viewport: { width: 1680, height: 1000 } });
await ctx.addCookies([{ name: 'NEXT_LOCALE', value: 'ru', domain: 'localhost', path: '/' }]);
const p = await ctx.newPage();
const errors = [];
p.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text().slice(0, 140));
});
const out = { seededStatus: { status: seeded?.id ? 'created' : 'FAIL', id: seededId?.slice(0, 8) } };

try {
  await p.goto(`http://localhost:${PORT}/login`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2500);
  await p.locator('[data-test-id="login-email"]').fill('admin@demo.local').catch(() => {});
  await p.locator('[data-test-id="login-password"]').fill('admin123').catch(() => {});
  await p.locator('[data-test-id="login-password"]').press('Enter').catch(() => {});
  await p.waitForTimeout(4500);

  // ---- A) settings page ----
  await p.goto(`http://localhost:${PORT}/settings/commission-report-statuses`, {
    waitUntil: 'domcontentloaded',
  });
  await p.waitForTimeout(5000);
  await p.screenshot({ path: resolve(OUT, '03-settings-statuses.png'), fullPage: true });
  const settingsBody = await p.evaluate(() => document.body.innerText);
  out.settings = {
    pageRenders: !!(await p.locator('[data-test-id="commission-report-statuses-page"]').count()),
    listsSeededStatus: /Готов к выплате/.test(settingsBody),
    title: /Статусы отчётов комиссионера/.test(settingsBody),
  };
  // create-modal opens (the «+ Новый статус» button)
  await p.locator('button', { hasText: /Новый статус/ }).first().click().catch(() => {});
  await p.waitForTimeout(800);
  out.settings.createModalOpens = !!(await p.locator('[data-test-id="commission-report-status-modal"]').count());
  await p.keyboard.press('Escape').catch(() => {});
  await p.waitForTimeout(400);

  // ---- B) /commission-reports/new ----
  await p.goto(`http://localhost:${PORT}/commission-reports/new`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(7000);

  // 1) status pill reads «Статус» (NOT «Черновик»)
  const statusTrigger = p.locator('[data-test-id="doc-header-status"]');
  out.statusPill = {
    text: (await statusTrigger.first().textContent().catch(() => ''))?.trim(),
    isStatusPlaceholder: /Статус/.test((await statusTrigger.first().textContent().catch(() => '')) || ''),
    notChernovik: !/Черновик/.test((await statusTrigger.first().textContent().catch(() => '')) || ''),
  };

  // 2) «Проведено» checkbox CHECKED by default
  out.provedenoChecked = await p.evaluate(() => {
    const el = document.querySelector('[data-test-id="doc-header-applicable"]');
    return el ? el.checked : null;
  });

  // 3) «Промежуточный итог» BOLD (font-weight >= 600)
  out.subtotalBold = await p.evaluate(() => {
    const dd = document.querySelector('[data-test-id="totals-subtotal"]');
    const row = dd?.closest('div');
    if (!row) return null;
    const fw = getComputedStyle(row).fontWeight;
    return { fontWeight: fw, bold: Number(fw) >= 600 };
  });

  // 4) NO «Кол-во:» line in the totals panel
  out.noKolvoLine = await p.evaluate(() => {
    const panel = document.querySelector('[data-test-id="doc-totals"]');
    return panel ? !/Кол-во:/.test(panel.textContent || '') : null;
  });

  // 5) open the status popup → the seeded option + «Настроить» footer
  await statusTrigger.first().click().catch(() => {});
  await p.waitForTimeout(700);
  out.statusPopup = {
    opens: !!(await p.locator('[data-test-id="doc-header-status-popup"]').count()),
    hasSeededOption: seededId
      ? !!(await p.locator(`[data-test-id="doc-header-status-option-${seededId}"]`).count())
      : false,
    hasConfigureFooter: !!(await p.locator('[data-test-id="doc-header-status-configure"]').count()),
  };
  await p.screenshot({ path: resolve(OUT, '04-new-status-popup.png'), fullPage: true });

  // pick the seeded status → pill shows its colored name
  if (seededId) {
    await p.locator(`[data-test-id="doc-header-status-option-${seededId}"]`).click().catch(() => {});
    await p.waitForTimeout(600);
    out.afterPick = {
      pillText: (await statusTrigger.first().textContent().catch(() => ''))?.trim(),
    };
  }
  await p.screenshot({ path: resolve(OUT, '05-new-status-picked.png'), fullPage: true });
} catch (e) {
  out.error = String(e).slice(0, 250);
}
out.consoleErrors = errors;

// cleanup the seeded status
if (seededId) await fetch(`${API}/states/${seededId}`, { method: 'DELETE', headers: auth }).catch(() => {});

console.log(JSON.stringify(out, null, 2));
await b.close();
