import { chromium } from 'playwright';
const SHOT = 'C:/Users/user/AppData/Local/Temp/claude/d--projects-moysklad/958b8445-da00-441f-947b-982164be069b/scratchpad';
const b = await chromium.launch({ headless: true, channel: 'chrome' });
const ctx = await b.newContext({ viewport: { width: 1680, height: 1050 }, locale: 'ru-RU' });
const p = await ctx.newPage();
p.setDefaultTimeout(60000);
let bearer = null;
p.on('request', (r) => { const a = r.headers().authorization; if (a && /^Bearer/.test(a)) bearer = a; });
const consoleErrors = [];
p.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });
const out = {};
try {
  await p.goto('http://localhost:3120/login?redirect=%2Fsupplies', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('[data-test-id="login-password"]');
  await p.locator('[data-test-id="login-email"]').fill('admin@demo.local');
  await p.locator('[data-test-id="login-password"]').fill('admin123');
  await p.locator('[data-test-id="login-password"]').press('Enter');
  await p.waitForTimeout(3000);
  if (/\/login/.test(p.url())) {
    await p.locator('button:has-text("Войти"), button:has-text("Kirish")').first().click().catch(() => {});
  }
  await p.waitForURL(/localhost:3120\/(supplies)?/, { timeout: 90000 }).catch(() => {});
  if (!/\/supplies/.test(p.url())) await p.goto('http://localhost:3120/supplies', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('[data-test-id="filter-toggle"]', { timeout: 90000 });
  await p.waitForTimeout(3000);

  // ---- #4 Фильтр button: closed = white, open = pressed grey
  const btnStyle = () => p.evaluate(() => {
    const el = document.querySelector('[data-test-id="filter-toggle"]');
    const cs = getComputedStyle(el);
    return { bg: cs.backgroundColor, border: cs.borderColor, expanded: el.getAttribute('aria-expanded') };
  });
  // Panel may load open (persisted). Normalize: ensure OPEN first, sample with
  // mouse parked away (no hover contamination); then close, sample; reopen.
  const parkMouse = () => p.mouse.move(20, 700);
  const ensureExpanded = async (want) => {
    const cur = await p.evaluate(() => document.querySelector('[data-test-id="filter-toggle"]').getAttribute('aria-expanded'));
    if (cur !== String(want)) { await p.locator('[data-test-id="filter-toggle"]').click(); await p.waitForTimeout(900); }
    await parkMouse(); await p.waitForTimeout(400);
  };
  await ensureExpanded(true);
  out.filterBtnOpen = await btnStyle();
  await p.screenshot({ path: SHOT + '/cert-1-filter-open.png' });
  await ensureExpanded(false);
  out.filterBtnClosed = await btnStyle();
  await p.screenshot({ path: SHOT + '/cert-1b-filter-closed.png' });
  await ensureExpanded(true);

  // ---- #2 gear dropdown: all fields visible, no inner scroll
  await p.locator('[data-test-id="inline-filter-settings"]').click();
  await p.waitForTimeout(800);
  out.gear = await p.evaluate(() => {
    const items = [...document.querySelectorAll('[data-test-id^="inline-filter-field-toggle-"]')];
    const pop = items[0]?.parentElement;
    if (!pop) return { error: 'popover not found' };
    return {
      itemCount: items.length,
      scrollHeight: pop.scrollHeight,
      clientHeight: pop.clientHeight,
      scrolls: pop.scrollHeight > pop.clientHeight + 1,
    };
  });
  await p.screenshot({ path: SHOT + '/cert-2-gear-dropdown.png' });
  await p.keyboard.press('Escape');
  await p.waitForTimeout(400);

  // ---- #1 bookmark → central modal
  await p.locator('[data-test-id="inline-filter-bookmark"]').click();
  await p.waitForTimeout(900);
  out.modal = await p.evaluate(() => {
    const m = document.querySelector('[data-testid="saved-filter-save-modal"]');
    if (!m) return { visible: false };
    const title = m.querySelector('h2, [id^="radix-"]')?.textContent?.trim();
    const label = m.querySelector('label')?.textContent?.trim();
    const submit = m.querySelector('[data-test-id="saved-filter-save-submit"]');
    const cs = submit ? getComputedStyle(submit) : null;
    const buttons = [...m.querySelectorAll('button')].map((x) => x.textContent.trim()).filter(Boolean);
    const cr = m.getBoundingClientRect();
    return {
      visible: true, title, label, buttons,
      submitBg: cs ? cs.backgroundImage || cs.backgroundColor : null,
      centered: Math.abs(cr.left + cr.width / 2 - window.innerWidth / 2) < 40,
    };
  });
  await p.screenshot({ path: SHOT + '/cert-3-save-modal.png' });
  // save one filter end-to-end
  await p.locator('[data-test-id="saved-filter-name-input"]').fill('cert-zakladka');
  await p.locator('[data-test-id="saved-filter-save-submit"]').click();
  await p.waitForTimeout(1500);
  out.pillAfterSave = await p.evaluate(() =>
    [...document.querySelectorAll('[data-test-id^="saved-filter-pill-"]')].map((x) => x.textContent.trim()).some((t) => t.includes('cert-zakladka')),
  );
  out.modalClosedAfterSave = await p.evaluate(() => !document.querySelector('[data-testid="saved-filter-save-modal"]'));

  // ---- #3 Создать dropdown
  out.createBtnNoSelection = await p.evaluate(() => {
    const dd = document.querySelector('[data-test-id="supply-create-doc-dropdown"]');
    // trigger button lives outside; find by text
    const btns = [...document.querySelectorAll('button')].filter((x) => /Создать|Yaratish/.test(x.textContent) && x.closest('[data-test-id="supplies-page"], body'));
    const trig = btns.find((x) => x.disabled !== undefined && (x.textContent.trim() === 'Создать' || x.textContent.trim() === 'Yaratish'));
    return trig ? { found: true, disabled: trig.disabled } : { found: false, texts: btns.map((x) => x.textContent.trim()).slice(0, 6) };
  });
  // select first row
  const rowCb = p.locator('table tbody tr input[type="checkbox"], table tbody tr [role="checkbox"]').first();
  await rowCb.click();
  await p.waitForTimeout(800);
  const createTrig = p.locator('button', { hasText: /^(Создать|Yaratish)$/ }).first();
  out.createBtnAfterSelect = { disabled: await createTrig.isDisabled() };
  await createTrig.click();
  await p.waitForTimeout(800);
  out.createMenuItems = await p.evaluate(() =>
    [...document.querySelectorAll('[data-test-id^="supply-create-"]')].map((x) => x.textContent.trim()),
  );
  await p.screenshot({ path: SHOT + '/cert-4-create-menu.png' });
  await p.keyboard.press('Escape');

  out.toolbarOrder = await p.evaluate(() => {
    const texts = [...document.querySelectorAll('button')].map((x) => x.textContent.trim());
    const seq = ['Изменить', 'Статус', 'Создать', 'Печать'].map((l) => texts.findIndex((t) => t === l || t.startsWith(l)));
    return seq;
  });
  out.bearer = bearer ? 'captured' : 'missing';
  out.consoleErrors = consoleErrors.slice(0, 5);
  out.consoleErrorCount = consoleErrors.length;
} catch (e) {
  out.error = String(e).slice(0, 500);
  await p.screenshot({ path: SHOT + '/cert-error.png' }).catch(() => {});
}
console.log(JSON.stringify(out, null, 2));
if (bearer) console.log('BEARER=' + bearer);
await b.close();
