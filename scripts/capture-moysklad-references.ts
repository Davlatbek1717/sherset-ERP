#!/usr/bin/env tsx
/**
 * capture-moysklad-references.ts — Audit Protocol v2.2 Phase 0
 *
 * Avtomat moysklad.uz'ga kiradi va har sahifaning kerakli holatlarini
 * screenshot qiladi. Outputni `docs/moysklad-reference/<module>/states/`
 * ga saqlaydi va `metadata.json`'da DOM dump'larni (dropdown items,
 * column gear items) jamlaydi.
 *
 * Auth: capture'da avtomatik login (`automatedLogin`, .env.local credentiallari,
 * parol hech qachon log qilinmaydi) → sessiya `.auth/moysklad.json` (gitignored)
 * ga saqlanadi va qayta ishlatiladi. Captcha/2FA chiqsa — `--login` bilan
 * qo'lda headed login (`interactiveLogin`) zaxira yo'l.
 *
 * Usage:
 *   pnpm capture-moysklad <module>             — bitta sahifa LIST holatlari (12 state → states/)
 *   pnpm capture-moysklad <module> --detail    — sahifaning EDIT/DETAIL formasi (10 state → detail/):
 *                                                edit-default + 4 toolbar dropdown + 5 tab. «Сохранение
 *                                                изменений» modal'ni har snapshot'dan oldin yopadi (eski
 *                                                visual-captures/03-module buzuq edit-capture'ning tuzatmasi).
 *   pnpm capture-moysklad:login                — captcha/2FA bo'lsa qo'lda login → sessiya saqlash
 *   pnpm capture-moysklad --all                — barcha sahifa (list)
 *   pnpm capture-moysklad <module> --check     — fresh ekanligini tekshir
 *   pnpm capture-moysklad <module> --refresh   — qayta capture
 *
 * Required env (`.env.local`):
 *   MOYSKLAD_URL="https://online.moysklad.uz"   (app domeni — app.moysklad.uz EMAS)
 *   MOYSKLAD_EMAIL / MOYSKLAD_PASSWORD          (avtomatik login uchun)
 */

import { mkdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { type Browser, type BrowserContext, type Page, chromium } from 'playwright';
import {
  DETAIL_DROPDOWNS,
  DETAIL_STATES,
  DETAIL_TABS,
  type DetailStateKey,
  MODULES,
  type Metadata,
  type ModuleConfig,
  STATES,
  type StateKey,
  classifyFreshness,
} from './capture-moysklad-lib.js';

const AUTH_FILE = join(process.cwd(), '.auth', 'moysklad.json');

interface CaptureOptions {
  module: string;
  outDir: string;
  refresh: boolean;
  check: boolean;
}

/**
 * Headed brauzer ochadi, foydalanuvchi qo'lda login qiladi (2FA/captcha o'zi),
 * keyin sessiyani .auth/moysklad.json ga saqlaydi. Parol kiritmaydi.
 */
async function interactiveLogin(): Promise<void> {
  const url = process.env.MOYSKLAD_URL;
  if (!url) throw new Error('MOYSKLAD_URL .env.local da kerak');
  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  await page.goto(url);
  console.log('\n>>> Brauzerda moysklad.uz ga kiring (login + parol + 2FA).');
  console.log('>>> List sahifasi ochilgach, shu terminalda ENTER bosing...\n');
  await new Promise<void>((resolve) => {
    process.stdin.once('data', () => resolve());
  });
  await mkdir(join(process.cwd(), '.auth'), { recursive: true });
  await ctx.storageState({ path: AUTH_FILE });
  console.log(`✓ Sessiya saqlandi → ${AUTH_FILE}`);
  await browser.close();
}

/**
 * Avtomatik login: .env.local credentiallari bilan kiradi (Spring Security
 * j_username/j_password formasi, online.moysklad.uz/) va sessiyani
 * .auth/moysklad.json ga saqlaydi. Captcha chiqsa interactiveLogin'ga yo'naltiradi.
 */
async function automatedLogin(): Promise<void> {
  const url = process.env.MOYSKLAD_URL;
  const user = process.env.MOYSKLAD_EMAIL;
  const pwd = process.env.MOYSKLAD_PASSWORD;
  if (!url || !user || !pwd) {
    throw new Error('MOYSKLAD_URL / MOYSKLAD_EMAIL / MOYSKLAD_PASSWORD .env.local da kerak');
  }
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForTimeout(1500);
    if (await page.$('[class*=captcha], img[src*=captcha], iframe[src*=recaptcha]')) {
      throw new Error("Captcha aniqlandi — `pnpm capture-moysklad:login` (qo'lda) ishlating");
    }
    await page.fill('input[name="j_username"]', user);
    await page.fill('input[name="j_password"]', pwd);
    await page.click('button:has-text("Войти")');
    await page.waitForURL('**/app/**', { timeout: 30_000 });
    await mkdir(join(process.cwd(), '.auth'), { recursive: true });
    await ctx.storageState({ path: AUTH_FILE });
    console.log(`✓ Avtomatik login OK → ${AUTH_FILE}`);
  } finally {
    await browser.close();
  }
}

/** .auth/moysklad.json bo'lmasa avtomatik login qiladi (idempotent). */
async function ensureSession(): Promise<void> {
  try {
    await stat(AUTH_FILE);
  } catch {
    console.log("Sessiya yo'q — avtomatik login...");
    await automatedLogin();
  }
}

/** True when the current page is the moysklad login screen (an EXPIRED session
 *  silently redirects here — the root of the 2026-06-11 "captured the login
 *  page" bug). Detects by document title and the Spring Security login form. */
async function isLoginPage(page: Page): Promise<boolean> {
  const title = (await page.title().catch(() => '')) || '';
  if (/Вход в МойСклад|Проверка логина/i.test(title)) return true;
  return (
    (await page
      .locator('input[name="j_username"], input[name="j_password"]')
      .count()
      .catch(() => 0)) > 0
  );
}

/**
 * Launches an authenticated browser context, AUTO-RECOVERING from an expired
 * session. `ensureSession()` only logs in when the auth FILE is missing — it
 * cannot tell that a present-but-stale session has been invalidated server-side,
 * so the script used to silently screenshot the login page (no rows / no create
 * form). Here we probe the app root: if it's the login screen, we re-run
 * `automatedLogin()` (refreshing the storageState file) and relaunch the context
 * once. A second login-page hit means captcha/2FA — bail with an actionable
 * message pointing at the interactive `--login` flow.
 */
async function launchAuthed(): Promise<{
  browser: Browser;
  ctx: BrowserContext;
  page: Page;
}> {
  await ensureSession();
  for (let attempt = 0; attempt < 2; attempt++) {
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      storageState: AUTH_FILE,
    });
    const page = await ctx.newPage();
    await page
      .goto(`${process.env.MOYSKLAD_URL}/app/`, {
        waitUntil: 'domcontentloaded',
        timeout: 45_000,
      })
      .catch(() => undefined);
    await page.waitForTimeout(2_500);
    if (!(await isLoginPage(page))) return { browser, ctx, page };
    await browser.close();
    if (attempt === 0) {
      console.log('  ⚠ saved session expired — re-authenticating…');
      await automatedLogin();
    } else {
      throw new Error(
        'session still on the login page after re-auth — run `pnpm capture-moysklad:login` (captcha/2FA needs a manual login)',
      );
    }
  }
  throw new Error('unreachable');
}

async function navigateToModule(page: Page, cfg: ModuleConfig): Promise<void> {
  const url = `${process.env.MOYSKLAD_URL}/app/${cfg.route}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  // moysklad is a legacy GWT SPA — `networkidle` never settles (polling).
  // Wait for the visible toolbar to render instead.
  await page
    .locator('[role=button]:visible', { hasText: 'Изменить' })
    .first()
    .waitFor({ timeout: 30_000 })
    .catch(() => undefined);
  await page.waitForTimeout(2500);
}

async function capture(
  page: Page,
  state: StateKey,
  outDir: string,
  metadata: Metadata,
  extra?: Record<string, unknown>,
): Promise<void> {
  const file = `${state}.png`;
  await page.screenshot({ path: join(outDir, file), fullPage: state === '01-default' });
  metadata.states[state] = { file, ...extra };
}

/** Visible GWT toolbar `[role=button]` by text (skips duplicate hidden ones). */
function toolbar(page: Page, label: string) {
  return page.locator('[role=button]:visible', { hasText: label }).first();
}

/**
 * First-data-row checkbox locator. Prefers the module-specific
 * `cfg.firstRowSelector` (moysklad GWT lists are div-based `.list-row`, not
 * `<table><tbody>`), falling back to the generic table selector for any
 * module whose list still renders a real table.
 */
function firstRowCheckbox(page: Page, cfg: ModuleConfig) {
  const primary = page.locator(cfg.firstRowSelector).first();
  const fallback = page.locator('tbody tr:visible input[type=checkbox]').first();
  return { primary, fallback };
}

/**
 * Selects the first data row (needed because moysklad's catalog "Изменить"
 * toolbar button is disabled — and its menu therefore empty — until at least
 * one row is checked). Tries the module selector first, then the generic
 * table selector. Returns true if a checkbox was actually checked.
 */
async function selectFirstRow(page: Page, cfg: ModuleConfig): Promise<boolean> {
  const { primary, fallback } = firstRowCheckbox(page, cfg);
  for (const box of [primary, fallback]) {
    try {
      if ((await box.count()) === 0) continue;
      await box.check({ timeout: 8_000 });
      await page.waitForTimeout(400);
      return true;
    } catch {
      // try next selector
    }
  }
  return false;
}

/** Unchecks the first data row (best-effort cleanup after a selection state). */
async function deselectFirstRow(page: Page, cfg: ModuleConfig): Promise<void> {
  const { primary, fallback } = firstRowCheckbox(page, cfg);
  for (const box of [primary, fallback]) {
    await box.uncheck({ timeout: 4_000 }).catch(() => undefined);
  }
}

/** GWT popup menu item labels (+disabled) after a dropdown is opened. */
async function dumpMenu(page: Page): Promise<{ label: string | undefined; disabled: boolean }[]> {
  return page
    .$$eval('.gwt-MenuItem:visible, .gwt-PopupPanel [role=button]:visible', (els) =>
      els.map((e) => ({
        label: e.textContent?.trim(),
        disabled:
          e.getAttribute('aria-disabled') === 'true' || (e.className || '').includes('disabled'),
      })),
    )
    .catch(() => []);
}

/**
 * Har holatni alohida o'rab oladi — bittasi yiqilsa qolganlari davom etadi
 * (moysklad GWT UI mo'rt; "crash-proof" capture protokol uchun muhim).
 */
async function safeState(name: string, metadata: Metadata, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`  ⚠ ${name}: ${msg.slice(0, 80)}`);
    metadata.states[name] = { file: `${name}.png`, notes: `capture failed: ${msg.slice(0, 120)}` };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Detail / edit-form capture (`--detail`). Produces clean edit-page references
// under docs/moysklad-reference/<module>/detail/, replacing the broken
// 2026-04-30 visual-captures/03-module/* set. Root-cause fix: dismiss the
// «Сохранение изменений» save-modal before every snapshot (see demands audit).
// ─────────────────────────────────────────────────────────────────────────

/**
 * Dismisses moysklad's «Сохранение изменений» (unsaved-changes) save-modal when
 * present. During capture we never save: click «Отмена» to STAY on the current
 * form (falling back to «Не сохранять» to discard, then Escape). The old edit
 * captures snapshotted exactly this modal over the trash list — this guard is
 * the fix. Returns true if a modal was found and dismissed.
 */
async function dismissSaveModal(page: Page): Promise<boolean> {
  const modal = page
    .locator('.gwt-DialogBox:visible, [role=dialog]:visible')
    .filter({ hasText: 'Сохранение изменений' })
    .first();
  if ((await modal.count().catch(() => 0)) === 0) return false;
  for (const label of ['Отмена', 'Не сохранять']) {
    const btn = modal
      .locator(`[role=button]:has-text("${label}"), button:has-text("${label}")`)
      .first();
    if ((await btn.count().catch(() => 0)) > 0) {
      await btn.click({ timeout: 4_000 }).catch(() => undefined);
      await page.waitForTimeout(400);
      return true;
    }
  }
  await page.keyboard.press('Escape').catch(() => undefined);
  await page.waitForTimeout(300);
  return true;
}

/**
 * Opens the first list document's edit form. Document lists render rows as
 * `<a href="#<route>/edit?id=…">` anchors (the leading <tr> is a subscription
 * banner and rows carry no stable `.list-row` class), so clicking the first
 * edit-link anchor is the reliable open mechanism. CATALOG lists
 * (counterparties/products/projects/employees) instead render a GWT cell-table
 * (`table.b-document-table tbody tr`) with NO edit-anchor — clicking any
 * non-checkbox text cell opens the card (the whole row is clickable). Both
 * verified via live diagnostics 2026-06-01 (#demand anchors, #company cells).
 * Confirms success by waiting for the edit toolbar's «Закрыть» button.
 */
async function openFirstRow(page: Page, cfg: ModuleConfig): Promise<boolean> {
  const editHref = `a[href*="${cfg.route}/edit"]`;
  // List-row anchors can render a beat after the toolbar — wait for one to
  // exist before clicking (otherwise a fast openFirstRow races an empty list).
  await page
    .locator(editHref)
    .first()
    .waitFor({ timeout: 15_000 })
    .catch(() => undefined);
  const candidates = [
    page.locator(`${editHref}:visible`).first(),
    page.locator(editHref).first(),
    // Catalog cell-table: first non-empty (non-checkbox) row cell. MUST precede
    // the generic `tbody tr td a` fallback — on catalog lists that generic
    // selector matches the «Выбрать тариф» upgrade-banner link (a stray <a> in a
    // tbody cell) and navigating it breaks the page (verified live 2026-06-01).
    page
      .locator('table.b-document-table tbody tr td', { hasText: /\S/ })
      .first(),
    page.locator('tbody tr:visible td a:visible').first(),
  ];
  for (const link of candidates) {
    if ((await link.count().catch(() => 0)) === 0) continue;
    await link.click({ timeout: 8_000 }).catch(() => undefined);
    const opened = await toolbar(page, 'Закрыть')
      .waitFor({ timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    if (opened) {
      // Some docs open in the new table design behind a blocking modal — switch
      // to classic so the reference matches our clone (and other doc captures).
      await dismissDesignModal(page);
      // The action dropdowns (Печать renders last) can lag behind «Закрыть» on
      // slower docs — wait for the full toolbar before the dropdown loop runs.
      await toolbar(page, 'Печать')
        .waitFor({ timeout: 15_000 })
        .catch(() => undefined);
      await page.waitForTimeout(2_000);
      return true;
    }
  }
  return false;
}

/**
 * Empty-account fallback for the detail capture: when the list holds no existing
 * documents to open, click the toolbar «+ Создать» control to open a BLANK new-
 * document form. The create form renders every field label — the §4 DOM-role
 * ground truth — even on an account with zero documents, which is the only way
 * to ground edit-form labels for doc types the (paid) account hasn't been
 * populated with (verified 2026-06-11: the paid online.moysklad.uz tenant is
 * data-empty for production / internal-order / retail docs). Matches the create
 * button by the configured `createLabel` first, then by its leading «+» (the
 * sole «+ …» toolbar button on a moysklad list) so it still works if the exact
 * label drifted. Returns true once a form opened (confirmed by «Закрыть»).
 */
async function openCreateForm(page: Page, cfg: ModuleConfig): Promise<boolean> {
  const candidates = [
    page.locator('[role=button]:visible', { hasText: cfg.createLabel }).first(),
    page.locator('[role=button]:visible', { hasText: /^\s*\+\s*\S/ }).first(),
    page.getByText(cfg.createLabel, { exact: false }).first(),
  ];
  for (const btn of candidates) {
    if ((await btn.count().catch(() => 0)) === 0) continue;
    await btn.click({ timeout: 8_000 }).catch(() => undefined);
    const opened = await toolbar(page, 'Закрыть')
      .waitFor({ timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    if (opened) {
      await dismissDesignModal(page);
      // The action dropdowns can lag the «Закрыть» button on a fresh form.
      await toolbar(page, 'Сохранить')
        .waitFor({ timeout: 12_000 })
        .catch(() => undefined);
      await page.waitForTimeout(2_000);
      return true;
    }
  }
  return false;
}

/**
 * moysklad is rolling out a new table design; some document types (e.g.
 * Приёмка/supply) open the edit form with a blocking «Попробуйте новый дизайн»
 * modal whose backdrop intercepts every toolbar click. Switch to «Старый
 * дизайн» so the capture matches the classic layout our clone mirrors (and the
 * demand reference). The form is unmodified at this point, so the modal's
 * "save first" warning is moot; any stray save-prompt is cancelled.
 */
async function dismissDesignModal(page: Page): Promise<boolean> {
  // The prompt is a React component (not a GWT dialog / [role=dialog]) and its
  // «Старый дизайн» control is a plain text node, not a button role — so target
  // by exact text. Verified live (2026-06-01): this switches Приёмка from the
  // new design (tabs «Позиции»…) back to classic (tabs «Главная» + «Связанные
  // документы»), matching the demand reference and our clone.
  if (
    (await page
      .getByText('Попробуйте новый дизайн', { exact: false })
      .count()
      .catch(() => 0)) === 0
  ) {
    return false;
  }
  const old = page.getByText('Старый дизайн', { exact: true }).first();
  if ((await old.count().catch(() => 0)) === 0) return false;
  await old.click({ timeout: 5_000 }).catch(() => undefined);
  await page.waitForTimeout(2_000);
  await dismissSaveModal(page);
  await toolbar(page, 'Закрыть')
    .waitFor({ timeout: 15_000 })
    .catch(() => undefined);
  await page.waitForTimeout(1_500);
  return true;
}

/**
 * Closes any open GWT popup menu. moysklad's `.gwt-PopupPanel` dropdown menus
 * frequently ignore Escape, so this also clicks a neutral empty page margin.
 * Left open, a menu's overlay intercepts the next toolbar-trigger click and
 * occludes the tab strip — the live cause of the «Создать документ» /
 * «Отправить» click timeouts and "tab not found" misses (verified 2026-06-01).
 */
async function closePopups(page: Page): Promise<void> {
  for (let i = 0; i < 3; i++) {
    if (
      (await page
        .locator('.gwt-PopupPanel:visible')
        .count()
        .catch(() => 0)) === 0
    )
      return;
    await page.keyboard.press('Escape').catch(() => undefined);
    await page.mouse.click(1600, 300).catch(() => undefined); // inert page margin
    await page.waitForTimeout(350);
  }
}

/** Screenshot + optional full-DOM dump + metadata entry for one detail state. */
async function captureDetailState(
  page: Page,
  state: DetailStateKey,
  outDir: string,
  metadata: Metadata,
  opts: { dom?: boolean; extra?: Record<string, unknown> } = {},
): Promise<void> {
  const file = `${state}.png`;
  await page.screenshot({ path: join(outDir, file), fullPage: state === 'edit-default' });
  const extra: Record<string, unknown> = { ...(opts.extra ?? {}) };
  if (opts.dom) {
    const domFile = `${state}.html`;
    await writeFile(join(outDir, domFile), await page.content(), 'utf8');
    extra.domFile = domFile;
  }
  metadata.states[state] = { file, ...extra };
}

/**
 * Clicks an edit-form tab by its RU label using real GWT/ARIA tab roles only.
 * Returns false when this document exposes no such TAB — important because
 * moysklad renders «Файлы»/«Задачи» as inline sections (not tabs) and has no
 * «События» tab, so those states are skipped rather than capturing a misleading
 * duplicate of the active tab (verified live: only «Главная» + «Связанные
 * документы» are real `[role=tab]`s).
 */
async function clickDetailTab(page: Page, label: string): Promise<boolean> {
  const tab = page
    .locator('[role=tab]:visible, .gwt-TabBarItem:visible, .gwt-TabLayoutPanelTab:visible', {
      hasText: label,
    })
    .first();
  if ((await tab.count().catch(() => 0)) === 0) return false;
  await tab.click({ timeout: 8_000 }).catch(() => undefined);
  return true;
}

async function captureDetail(opts: CaptureOptions): Promise<void> {
  const cfg = MODULES[opts.module];
  if (!cfg) throw new Error(`Unknown module: ${opts.module} — add to MODULES map`);

  await mkdir(opts.outDir, { recursive: true });
  const { browser, page } = await launchAuthed();

  const metadata: Metadata = {
    capturedAt: new Date().toISOString(),
    module: opts.module,
    moyskladUrl: process.env.MOYSKLAD_URL || '',
    states: {},
  };

  try {
    await navigateToModule(page, cfg);
    let opened = await openFirstRow(page, cfg);
    let viaCreate = false;
    if (!opened) {
      // Empty list → open the blank «+ Создать» form, which still renders every
      // field label for §4 grounding. RE-NAVIGATE first: on an empty list,
      // openFirstRow's generic fallback can click a stray cell / upgrade-banner
      // link and navigate away — a fresh list reset restores the create button
      // (verified 2026-06-11: internalorder create form only opened after reset).
      await navigateToModule(page, cfg);
      opened = await openCreateForm(page, cfg);
      viaCreate = opened;
    }
    if (!opened) {
      throw new Error(
        'could not open a document from the list (no existing row AND no «+ Создать» form / «Закрыть» toolbar appeared)',
      );
    }
    metadata.viaCreateForm = viaCreate;
    await dismissSaveModal(page);
    console.log(
      viaCreate ? '  ✓ blank create form opened (empty-list fallback)' : '  ✓ edit form opened',
    );

    // edit-default — base form snapshot + full DOM (the audit ground truth).
    await safeState('edit-default', metadata, async () => {
      await dismissSaveModal(page);
      await captureDetailState(page, 'edit-default', opts.outDir, metadata, { dom: true });
    });

    // Toolbar dropdowns — expand each, dump its menu items (the corrupt part of
    // the old captures), screenshot, then close.
    for (const { state, label } of DETAIL_DROPDOWNS) {
      await safeState(state, metadata, async () => {
        await dismissSaveModal(page);
        await closePopups(page); // prior menu's overlay would intercept this click
        await toolbar(page, label).click({ timeout: 12_000 });
        await page.waitForTimeout(800);
        const items = await dumpMenu(page);
        await captureDetailState(page, state, opts.outDir, metadata, {
          extra: { domDump: { items } },
        });
        await closePopups(page);
      });
    }

    // Tabs — switch to each, capture screenshot + DOM. Skips tabs this doc-type
    // does not expose (safeState records the miss without aborting the run).
    for (const { state, label } of DETAIL_TABS) {
      await safeState(state, metadata, async () => {
        await dismissSaveModal(page);
        await closePopups(page); // a lingering menu overlay hides the tab strip
        const found = await clickDetailTab(page, label);
        if (!found) throw new Error(`tab not found: ${label}`);
        await page.waitForTimeout(1_200);
        await dismissSaveModal(page);
        await captureDetailState(page, state, opts.outDir, metadata, { dom: true });
      });
    }

    await writeFile(
      join(opts.outDir, 'detail-metadata.json'),
      JSON.stringify(metadata, null, 2),
      'utf8',
    );
  } finally {
    await browser.close();
  }
}

async function captureModule(opts: CaptureOptions): Promise<void> {
  const cfg = MODULES[opts.module];
  if (!cfg) throw new Error(`Unknown module: ${opts.module} — add to MODULES map`);

  await mkdir(opts.outDir, { recursive: true });
  const { browser, page } = await launchAuthed();

  const metadata: Metadata = {
    capturedAt: new Date().toISOString(),
    module: opts.module,
    moyskladUrl: process.env.MOYSKLAD_URL || '',
    states: {},
  };

  try {
    await navigateToModule(page, cfg);

    // S1 — default (eng muhim reference: to'liq list ko'rinishi)
    await safeState('01-default', metadata, () =>
      capture(page, '01-default', opts.outDir, metadata),
    );

    // S2 — filter panel ochilgan
    await safeState('02-filter-applied', metadata, async () => {
      await toolbar(page, 'Фильтр').click();
      await page.waitForTimeout(1200);
      await capture(page, '02-filter-applied', opts.outDir, metadata);
      await toolbar(page, 'Фильтр')
        .click()
        .catch(() => undefined); // yopish
      await page.waitForTimeout(400);
    });

    // S3 — Изменить dropdown + menu items DOM.
    // moysklad's catalog "Изменить" is disabled (empty menu) until a row is
    // selected, so check the first row first, then open the dropdown, then
    // clean up the selection. `selected` is recorded so a stale empty dump is
    // distinguishable from a genuinely empty menu.
    await safeState('03-edit-dropdown', metadata, async () => {
      const selected = await selectFirstRow(page, cfg);
      await toolbar(page, 'Изменить').click();
      await page.waitForTimeout(800);
      const items = await dumpMenu(page);
      await capture(page, '03-edit-dropdown', opts.outDir, metadata, {
        domDump: { items, rowSelected: selected },
      });
      await page.keyboard.press('Escape');
      await deselectFirstRow(page, cfg);
    });

    // S4 — create: customer-orders'da "+ Заказ" to'g'ridan yangi formaga o'tadi
    // (dropdown emas) → list capture'da ochilmaydi (navigatsiya list'ni yopadi).
    metadata.states['04-create-dropdown'] = {
      file: '04-create-dropdown.png',
      notes:
        'create is a direct navigation in moysklad (no dropdown on list) — captured in new-form audit',
    };

    // S5 — Печать dropdown + menu items DOM
    await safeState('05-print-dropdown', metadata, async () => {
      await toolbar(page, 'Печать').click();
      await page.waitForTimeout(800);
      const items = await dumpMenu(page);
      await capture(page, '05-print-dropdown', opts.outDir, metadata, { domDump: { items } });
      await page.keyboard.press('Escape');
    });

    // S6 — Столбцы (column settings) panel + items DOM
    await safeState('06-column-gear', metadata, async () => {
      await toolbar(page, 'Столбцы').click();
      await page.waitForTimeout(800);
      const items = await dumpMenu(page);
      await capture(page, '06-column-gear', opts.outDir, metadata, { domDump: { items } });
      await page.keyboard.press('Escape');
    });

    // S7 — row hover
    await safeState('07-row-hover', metadata, async () => {
      await page.hover('tbody tr:visible >> nth=0');
      await capture(page, '07-row-hover', opts.outDir, metadata);
    });

    // S8 — selection 1 (GWT checkbox in first data row)
    await safeState('08-selection-1', metadata, async () => {
      const selected = await selectFirstRow(page, cfg);
      if (!selected) throw new Error('no selectable row checkbox found');
      await capture(page, '08-selection-1', opts.outDir, metadata);
      await deselectFirstRow(page, cfg);
    });

    // S9 — selection many. Prefer the module's `.list-row` checkboxes, fall
    // back to a generic table; checks up to 5 rows for the "N selected" state.
    await safeState('09-selection-many', metadata, async () => {
      const listRows = page.locator(`${cfg.firstRowSelector.split(':first-of-type')[0]}`);
      const boxes =
        (await listRows.count()) > 0
          ? listRows.locator('input[type=checkbox]')
          : page.locator('tbody tr:visible input[type=checkbox]');
      const n = Math.min(await boxes.count(), 5);
      for (let i = 0; i < n; i++)
        await boxes
          .nth(i)
          .check()
          .catch(() => undefined);
      await page.waitForTimeout(400);
      await capture(page, '09-selection-many', opts.outDir, metadata);
      for (let i = 0; i < n; i++)
        await boxes
          .nth(i)
          .uncheck()
          .catch(() => undefined);
    });

    // S10 — empty state (search impossible string)
    await safeState('10-empty-state', metadata, async () => {
      const search = page.locator('input[type=text]:visible').last();
      await search.fill('zzzzzzzzqqq');
      await page.waitForTimeout(2000);
      await capture(page, '10-empty-state', opts.outDir, metadata);
      await search.fill('');
      await page.waitForTimeout(800);
    });

    // S11 — pagination (footer)
    await safeState('11-pagination', metadata, async () => {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(600);
      await capture(page, '11-pagination', opts.outDir, metadata);
    });

    // S12 — mobile viewport
    await safeState('12-mobile', metadata, async () => {
      await page.setViewportSize({ width: 768, height: 1024 });
      await page.waitForTimeout(800);
      await capture(page, '12-mobile', opts.outDir, metadata);
    });

    await writeFile(join(opts.outDir, 'metadata.json'), JSON.stringify(metadata, null, 2), 'utf8');
  } finally {
    await browser.close();
  }
}

async function checkFreshness(
  outDir: string,
): Promise<{ fresh: string[]; stale: string[]; missing: string[] }> {
  const now = Date.now();
  const ageMap: Record<string, number | null> = {};
  for (const s of STATES) {
    try {
      const st = await stat(join(outDir, `${s}.png`));
      ageMap[s] = (now - st.mtimeMs) / (1000 * 60 * 60 * 24);
    } catch {
      ageMap[s] = null;
    }
  }
  return classifyFreshness(ageMap);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes('--login')) {
    await interactiveLogin();
    return;
  }

  const moduleArg = args.find((a) => !a.startsWith('--'));
  const isCheck = args.includes('--check');
  const isRefresh = args.includes('--refresh');
  const isAll = args.includes('--all');
  const isMissing = args.includes('--missing');
  const isDetail = args.includes('--detail');

  const modules = isAll
    ? Object.keys(MODULES)
    : moduleArg
      ? [moduleArg]
      : (() => {
          console.error('Usage: pnpm capture-moysklad <module> | --all | --login');
          console.error('Modules:', Object.keys(MODULES).join(', '));
          process.exit(1);
        })();

  for (const m of modules) {
    if (isDetail) {
      const outDir = join(process.cwd(), 'docs', 'moysklad-reference', m, 'detail');
      console.log(`Capturing DETAIL (edit-form) references for ${m} → ${outDir}`);
      await captureDetail({ module: m, outDir, refresh: isRefresh, check: isCheck });
      console.log(`✓ ${m} (detail) — states: ${DETAIL_STATES.length}`);
      continue;
    }

    const outDir = join(process.cwd(), 'docs', 'moysklad-reference', m, 'states');

    if (isCheck) {
      const { fresh, stale, missing } = await checkFreshness(outDir);
      console.log(`Module: ${m}`);
      console.log(`  fresh: ${fresh.length}/${STATES.length}`);
      console.log(`  stale (>30d): ${stale.length}: ${stale.join(', ')}`);
      console.log(`  missing: ${missing.length}: ${missing.join(', ')}`);
      if (stale.length + missing.length > 0) {
        console.log(`  → Run: pnpm capture-moysklad ${m} --refresh`);
        process.exitCode = 1;
      }
      continue;
    }

    if (isMissing) {
      const { missing } = await checkFreshness(outDir);
      if (missing.length === 0) {
        console.log(`Module ${m}: all references present, skip`);
        continue;
      }
    }

    console.log(`Capturing references for ${m} → ${outDir}`);
    await captureModule({ module: m, outDir, refresh: isRefresh, check: isCheck });
    console.log(`✓ ${m}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
