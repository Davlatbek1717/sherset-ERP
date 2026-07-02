#!/usr/bin/env tsx
/**
 * audit-module.ts — `pnpm audit:module <name>` composite parity-audit CLI (Q1.2).
 *
 * Collapses the manual ~7-8h per-page audit loop into one command:
 *   1. CAPTURE   moysklad reference (reuse if present; --refresh-capture to force)
 *   2. OUR SIDE  dump our dropdown items — live (Playwright, default) or static
 *   3. DIFF      moysklad vs ours -> docs/audits/<m>/todo.json
 *   4. TYPECHECK pnpm typecheck (skip with --skip-typecheck)
 *   5. SMOKE     pnpm smoke <m>  (skip-tolerant; --skip-smoke)
 *
 * Exit code is non-zero on any dropdown delta or hard gate failure, so the
 * command doubles as a CI/pre-merge check. On exact parity (live-sourced) it
 * writes docs/audits/<m>-list.audit.md so `pnpm progress` counts the page.
 *
 * Usage:
 *   pnpm audit:module counterparties
 *   pnpm audit:module customer-orders --web-url http://localhost:3100
 *   pnpm audit:module products --static            # no browser, parse source
 *   pnpm audit:module demands --skip-smoke --skip-typecheck
 *   pnpm audit:module --list                        # print known modules
 *
 * Env (.env.local, already injected by the npm script):
 *   MOYSKLAD_URL / MOYSKLAD_EMAIL / MOYSKLAD_PASSWORD   (capture stage)
 * Web app must be running for live capture (pnpm dev) — admin@demo.local/admin123.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Browser, type Page, chromium } from 'playwright';
import {
  type DropdownDiff,
  type Item,
  buildTodo,
  diffDropdown,
  parseStaticOurs,
  verdict,
} from './audit-module-lib.js';
import { type DropdownRef, OUR_MODULES, listAuditModules } from './audit-module-registry.js';

const ROOT = process.cwd();
const WEB_URL_DEFAULT = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const WEB_EMAIL = process.env.SMOKE_EMAIL ?? 'admin@demo.local';
const WEB_PASSWORD = process.env.SMOKE_PASSWORD ?? 'admin123';

/** Russian toolbar-button text by dropdown kind (mirrors the moysklad capture). */
const TRIGGER_TEXT: Record<DropdownRef['kind'], string> = {
  bulk: 'Изменить',
  print: 'Печать',
};

interface Cli {
  module: string;
  webUrl: string;
  staticOnly: boolean;
  refreshCapture: boolean;
  skipCapture: boolean;
  skipTypecheck: boolean;
  skipSmoke: boolean;
}

// CLI reporter helpers (scripts/ run as standalone tools, console is the UI).
const log = (...a: unknown[]) => console.info(...a);
const warn = (...a: unknown[]) => console.warn(...a);

function parseArgs(argv: string[]): Cli {
  const flag = (name: string) => argv.includes(name);
  const val = (name: string): string | undefined => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  // First bare token that isn't the value of --web-url.
  const webUrlVal = val('--web-url');
  const module = argv.find((a) => !a.startsWith('--') && a !== webUrlVal);
  if (!module) {
    log(
      'Usage: pnpm audit:module <module> [--static] [--web-url URL] [--skip-typecheck] [--skip-smoke]',
    );
    log('Known modules:', listAuditModules().join(', '));
    process.exit(1);
  }
  return {
    module,
    webUrl: webUrlVal ?? WEB_URL_DEFAULT,
    staticOnly: flag('--static'),
    refreshCapture: flag('--refresh-capture'),
    skipCapture: flag('--skip-capture'),
    skipTypecheck: flag('--skip-typecheck'),
    skipSmoke: flag('--skip-smoke'),
  };
}

// ---- Stage 1: moysklad capture ------------------------------------------

interface CapturedDropItem {
  label?: string;
  disabled?: boolean;
}

/** Path to a module's captured moysklad metadata.json. */
function metadataPath(module: string): string {
  return join(ROOT, 'docs', 'moysklad-reference', module, 'states', 'metadata.json');
}

/** Ensure the moysklad reference exists; (re)capture via `pnpm capture-moysklad`. */
function ensureCapture(cli: Cli): boolean {
  const mp = metadataPath(cli.module);
  const present = existsSync(mp);
  if (present && !cli.refreshCapture) {
    log(`  ✓ reusing capture: ${mp}`);
    return true;
  }
  if (cli.skipCapture) {
    warn(`  ⚠ no capture at ${mp} and --skip-capture set — cannot compare`);
    return false;
  }
  log(`  → capturing moysklad reference (pnpm capture-moysklad ${cli.module})…`);
  const args = ['capture-moysklad', cli.module, ...(cli.refreshCapture ? ['--refresh'] : [])];
  const r = spawnSync('pnpm', args, { cwd: ROOT, stdio: 'inherit', shell: true });
  if (r.status !== 0) warn(`  ⚠ capture exited ${r.status} — check moysklad creds / route`);
  return existsSync(mp);
}

/** Read moysklad's captured items for one dropdown reference state. */
function readMoyskladItems(module: string, state: DropdownRef['referenceState']): Item[] {
  const mp = metadataPath(module);
  if (!existsSync(mp)) return [];
  try {
    const meta = JSON.parse(readFileSync(mp, 'utf-8')) as {
      states?: Record<string, { domDump?: { items?: CapturedDropItem[] } }>;
    };
    const items = meta.states?.[state]?.domDump?.items ?? [];
    return items
      .filter((i) => typeof i.label === 'string' && i.label.trim().length > 0)
      .map((i) => ({ label: i.label as string, disabled: Boolean(i.disabled) }));
  } catch (e) {
    warn(`  ⚠ failed to parse ${mp}: ${e instanceof Error ? e.message : String(e)}`);
    return [];
  }
}

// ---- Stage 2: our-side dropdown dump -------------------------------------

type OurSource = 'live' | 'static';

interface OurDump {
  source: OurSource;
  byKind: Record<string, Item[]>;
}

/** Parse our dropdown items from the component source (fallback / --static). */
function dumpOurStatic(cli: Cli): OurDump {
  const ru = JSON.parse(
    readFileSync(join(ROOT, 'apps/web/src/messages/ru.json'), 'utf-8'),
  ) as Record<string, unknown>;
  const byKind: Record<string, Item[]> = {};
  for (const d of OUR_MODULES[cli.module].dropdowns) {
    const abs = join(ROOT, d.componentPath);
    const src = existsSync(abs) ? readFileSync(abs, 'utf-8') : '';
    byKind[d.kind] = src ? parseStaticOurs(src, ru) : [];
  }
  return { source: 'static', byKind };
}

/** True if the web server answers at all (avoids a silent empty live diff). */
async function webReachable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return res.status < 500;
  } catch {
    return false;
  }
}

/** Drive our app with Playwright and dump each dropdown's items live. */
async function dumpOurLive(cli: Cli): Promise<OurDump> {
  const audit = OUR_MODULES[cli.module];
  const byKind: Record<string, Item[]> = {};
  const browser: Browser = await chromium.launch({ headless: true });
  try {
    const origin = new URL(cli.webUrl).origin;
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    // Force RU locale so labels match the moysklad (RU) reference.
    await ctx.addCookies([{ name: 'NEXT_LOCALE', value: 'ru', url: origin }]);
    const page = await ctx.newPage();

    // Login.
    await page.goto(`${cli.webUrl}/login`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.fill('[data-test-id="login-email"]', WEB_EMAIL);
    await page.fill('[data-test-id="login-password"]', WEB_PASSWORD);
    await page.click('[data-test-id="login-submit"]');
    await page.waitForURL(`${cli.webUrl}/`, { timeout: 20_000 }).catch(() => undefined);

    // Navigate to the list and wait for the first data row (or give up quietly).
    await page.goto(`${cli.webUrl}${audit.route}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    // Wait for the data to actually paint. The first hit on a Turbopack dev
    // server recompiles the route, which can outrun a short row wait, so wait
    // generously for a real row AND for the «Изменить» toolbar button before
    // touching any dropdown — otherwise the bulk trigger is still disabled and
    // the menu never opens (false "missing everything" diff).
    await page
      .locator(`tr[data-test-id^="${audit.rowTestIdPrefix}"]`)
      .first()
      .waitFor({ timeout: 30_000 })
      .catch(() => undefined);
    await page
      .locator('button:visible, [role="button"]:visible', { hasText: TRIGGER_TEXT.bulk })
      .first()
      .waitFor({ timeout: 15_000 })
      .catch(() => undefined);
    await page.waitForTimeout(1_000);

    for (const d of audit.dropdowns) {
      byKind[d.kind] = await openAndDump(page, audit.rowTestIdPrefix, d);
    }
  } finally {
    await browser.close();
  }
  return { source: 'live', byKind };
}

/** Select the first data row so selection-gated bulk menus enable their items. */
async function selectFirstRow(page: Page, rowTestIdPrefix: string): Promise<void> {
  const row = page.locator(`tr[data-test-id^="${rowTestIdPrefix}"]`).first();
  if ((await row.count()) === 0) return;
  // DataTable selection is a leading checkbox cell (data-test-id="select-row-<key>").
  for (const sel of [
    '[data-test-id^="select-row-"]',
    'input[type="checkbox"]',
    '[role="checkbox"]',
  ]) {
    const box = row.locator(sel).first();
    if ((await box.count()) > 0) {
      await box.click({ timeout: 4_000 }).catch(() => undefined);
      return;
    }
  }
  await row
    .locator('td')
    .first()
    .click({ timeout: 4_000 })
    .catch(() => undefined);
}

/**
 * Open one dropdown and read its menu items. Our DropdownMenu wraps Radix and
 * portals the menu to document root, so items are `[role=menuitem]` carrying
 * Radix's `data-disabled` (and `aria-disabled`) when disabled. The trigger is
 * the toolbar Button: open it by its RU text (Изменить / Печать), mirroring the
 * moysklad capture; for ListView-rendered lists a `<slot>-trigger` test-id also
 * works. Bulk menus are selection-gated, so a row is selected first.
 */
async function openAndDump(page: Page, rowTestIdPrefix: string, d: DropdownRef): Promise<Item[]> {
  // The bulk («Изменить») menu is selection-gated — its items only populate
  // once a row is checked — so select the first row before opening it. The
  // print menu is dumped WITHOUT a selection, mirroring how the moysklad
  // reference capture dumps S5 (print) in the unselected state, so the two
  // sides are compared apples-to-apples.
  if (d.kind === 'bulk') await selectFirstRow(page, rowTestIdPrefix);

  const opened = await openMenu(page, d);
  if (!opened) {
    warn(`    ⚠ ${d.kind}: could not open dropdown (trigger not found)`);
    return [];
  }
  await page
    .locator('[role="menu"]')
    .first()
    .waitFor({ timeout: 4_000 })
    .catch(() => undefined);

  const items = await page
    .$$eval('[role="menuitem"]', (els) =>
      els.map((e) => ({
        label: (e.textContent ?? '').trim(),
        disabled:
          e.getAttribute('aria-disabled') === 'true' ||
          e.hasAttribute('data-disabled') ||
          (e as HTMLButtonElement).disabled === true,
      })),
    )
    .catch(() => [] as Item[]);

  await page.keyboard.press('Escape').catch(() => undefined);
  await page.waitForTimeout(150);
  return items.filter((i) => i.label.length > 0);
}

/** Click the dropdown's trigger. ListView `<slot>-trigger` test-id first, then RU text. */
async function openMenu(page: Page, d: DropdownRef): Promise<boolean> {
  const triggerById = page.locator(`[data-test-id="${d.triggerTestId}"]`).first();
  if ((await triggerById.count()) > 0 && (await triggerById.isVisible().catch(() => false))) {
    // Only a real trigger (button) is clickable while closed; the dedicated
    // components put the test-id on the portaled menu, which is absent here.
    await triggerById.click({ timeout: 6_000 }).catch(() => undefined);
    if ((await page.locator('[role="menu"]').count()) > 0) return true;
  }
  const byText = page
    .locator('button:visible, [role="button"]:visible', { hasText: TRIGGER_TEXT[d.kind] })
    .first();
  if ((await byText.count()) === 0) return false;
  await byText.click({ timeout: 6_000 }).catch(() => undefined);
  return (await page.locator('[role="menu"]').count()) > 0;
}

// ---- Stage 4 + 5: gates --------------------------------------------------

function runGate(label: string, cmd: string, args: string[]): boolean {
  log(`\n── ${label} (${cmd} ${args.join(' ')}) ──`);
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', shell: true });
  return r.status === 0;
}

// ---- Main ----------------------------------------------------------------

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes('--list') || argv.length === 0) {
    log(`Known audit modules:\n  ${listAuditModules().join('\n  ')}`);
    process.exit(argv.length === 0 ? 1 : 0);
  }
  const cli = parseArgs(argv);
  const audit = OUR_MODULES[cli.module];
  if (!audit) {
    warn(`Unknown module: ${cli.module}`);
    log('Known modules:', listAuditModules().join(', '));
    process.exit(1);
  }

  log(`\n=== audit:module ${cli.module} ===`);
  const outDir = join(ROOT, 'docs', 'audits', cli.module);
  mkdirSync(outDir, { recursive: true });

  // Stage 1 — capture.
  log('\n[1/5] moysklad capture');
  const haveCapture = ensureCapture(cli);

  // Stage 2 — our side.
  log('\n[2/5] our dropdown dump');
  let ours: OurDump;
  if (cli.staticOnly) {
    log('  → static parse (--static)');
    ours = dumpOurStatic(cli);
  } else if (await webReachable(cli.webUrl)) {
    log(`  → live capture @ ${cli.webUrl}`);
    ours = await dumpOurLive(cli);
  } else {
    warn(`  ⚠ web server unreachable at ${cli.webUrl} — start it with \`pnpm dev\`.`);
    warn('  ↳ falling back to STATIC source parse (verify live before claiming parity)');
    ours = dumpOurStatic(cli);
  }
  writeFileSync(
    join(outDir, 'ours-dropdowns.json'),
    JSON.stringify({ source: ours.source, byKind: ours.byKind }, null, 2),
  );

  // Stage 3 — diff.
  log('\n[3/5] diff (moysklad ↔ ours)');
  const perDropdown: Record<string, DropdownDiff> = {};
  for (const d of audit.dropdowns) {
    const ms = haveCapture ? readMoyskladItems(cli.module, d.referenceState) : [];
    const our = ours.byKind[d.kind] ?? [];
    perDropdown[d.kind] = diffDropdown(ms, our);
  }
  const todo = buildTodo(perDropdown);
  const v = verdict(todo);
  writeFileSync(
    join(outDir, 'todo.json'),
    JSON.stringify({ module: cli.module, source: ours.source, verdict: v, ...todo }, null, 2),
  );
  reportDiff(ours.source, todo, v);

  // Stage 4 — typecheck.
  let typecheckOk = true;
  if (cli.skipTypecheck) {
    log('\n[4/5] typecheck — skipped (--skip-typecheck)');
  } else {
    typecheckOk = runGate('[4/5] typecheck', 'pnpm', ['typecheck']);
  }

  // Stage 5 — smoke (only modules with a mass-edit endpoint).
  let smokeOk = true;
  if (cli.skipSmoke) {
    log('\n[5/5] smoke — skipped (--skip-smoke)');
  } else if (!audit.hasMassEditSmoke) {
    log('\n[5/5] smoke — n/a (module has no mass-edit endpoint)');
  } else {
    smokeOk = runGate('[5/5] smoke', 'pnpm', ['smoke', cli.module]);
  }

  // Verdict + audit-marker file.
  const exact = v === 'exact';
  if (exact && ours.source === 'live' && typecheckOk) {
    writeAuditMarker(cli.module, todo);
    log(`\n✅ ${cli.module}: EXACT dropdown parity (live-verified).`);
  } else if (exact && ours.source === 'static') {
    log(
      `\n🟡 ${cli.module}: exact via STATIC parse — verify live (pnpm dev) before claiming parity.`,
    );
  } else if (!exact) {
    log(`\n❌ ${cli.module}: ${todoSummary(todo)} → see docs/audits/${cli.module}/todo.json`);
  }

  process.exit(!typecheckOk || !smokeOk || !exact ? 1 : 0);
}

function todoSummary(todo: ReturnType<typeof buildTodo>): string {
  const { missing, extra, disabledMismatch, orderMismatch } = todo.totals;
  return `${missing} missing · ${extra} extra · ${disabledMismatch} disabled-mismatch · ${orderMismatch} order`;
}

function reportDiff(source: OurSource, todo: ReturnType<typeof buildTodo>, v: string): void {
  log(`  source: ${source} · verdict: ${v}`);
  for (const [kind, d] of Object.entries(todo.dropdowns)) {
    log(`  ${kind}: ${d.matched} matched`);
    for (const i of d.missing) log(`    − missing (in moysklad): "${i.label}"`);
    for (const i of d.extra) log(`    + extra (in ours): "${i.label}"`);
    for (const m of d.disabledMismatch)
      log(`    ≠ disabled "${m.label}": moysklad=${m.moysklad} ours=${m.ours}`);
    if (d.orderMismatch) log('    ↕ order differs from moysklad');
  }
}

/** Write docs/audits/<m>-list.audit.md so `pnpm progress` counts the page. */
function writeAuditMarker(module: string, todo: ReturnType<typeof buildTodo>): void {
  const auditsDir = join(ROOT, 'docs', 'audits');
  mkdirSync(auditsDir, { recursive: true });
  const lines = [
    `# ${module} — list toolbar audit`,
    '',
    '> Auto-generated by `pnpm audit:module` on exact, live-verified dropdown parity.',
    '',
    '| dropdown | matched |',
    '|---|---|',
    ...Object.entries(todo.dropdowns).map(([k, d]) => `| ${k} | ${d.matched} |`),
    '',
    `Source-of-truth: \`docs/moysklad-reference/${module}/states/metadata.json\`.`,
    '',
  ];
  writeFileSync(join(auditsDir, `${module}-list.audit.md`), lines.join('\n'));
}

main().catch((err) => {
  warn(err);
  process.exit(1);
});
