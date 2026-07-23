// Live verify — owner 2026-07-19 (second report): every validation failure
// lands on ITS OWN field (red + plain text), and the login is FREE-FORM.
// Matrix: empty lastName · duplicate ФИО · bad email · taken email · bad
// phone · empty login · 51-char login · taken login — each flags its field;
// then FREE logins (cyrillic, spaces, @, mixed) all SAVE, and one of them
// actually LOGS IN. Cleanup deletes every employee this run created.
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:3100';
const API = process.env.API || 'http://localhost:4000/api/v1';
const results = [];
let failed = 0;
const ok = (name, cond, extra = '') => {
  if (!cond) failed++;
  const line = `${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`;
  results.push(line);
  console.log(line);
};

const adminToken = async () =>
  (
    await (
      await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@demo.local', password: 'admin123' }),
      })
    ).json()
  ).accessToken;

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 }, locale: 'ru-RU' });
const page = await ctx.newPage();
page.setDefaultTimeout(30000);
const createdIds = [];

// Field-error reader: the FieldRow renders the message in a destructive div
// right under the input — grab it via the input's parent block.
const fieldError = (testId) =>
  page.evaluate((tid) => {
    const input = document.querySelector(`[data-testid="${tid}"]`);
    const holder = input?.closest('div');
    const err = holder?.querySelector('.text-\\[var\\(--ms-text-destructive\\)\\]');
    return err?.textContent?.trim() || null;
  }, testId);

async function openNewCard() {
  await page.goto(`${BASE}/settings/employees/new`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="employee-last-name"]', { timeout: 30000 });
  await page.waitForTimeout(800);
}

async function fillBase(lastName) {
  await page.fill('[data-testid="employee-last-name"]', lastName);
  const dep = page.locator('[data-testid="employee-department"]');
  if (await dep.count()) await dep.selectOption({ index: 1 }).catch(() => {});
}

try {
  // login as admin once
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('[data-test-id="login-email"]', 'admin@demo.local');
  await page.fill('[data-test-id="login-password"]', 'admin123');
  await page.click('button[type=submit]');
  await page.waitForURL((u) => !String(u).includes('/login'), { timeout: 30000 });

  // ── 1. empty Фамилия → its own field ──
  await openNewCard();
  await page.click('[data-testid="employee-save"]');
  await page.waitForTimeout(600);
  ok('empty Фамилия → error on the lastName field', !!(await fieldError('employee-last-name')));

  // ── 2. duplicate ФИО (create the clashing employee as a fixture first) ──
  {
    const tok = await adminToken();
    const made = await (
      await fetch(`${API}/hr/employees`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
        body: JSON.stringify({ name: 'Dup Test Xodim' }),
      })
    ).json();
    if (made?.id) createdIds.push(made.id);
  }
  await openNewCard();
  await fillBase('Dup Test Xodim');
  await page.click('[data-testid="employee-save"]');
  await page.waitForTimeout(1500);
  const nameErr = await fieldError('employee-last-name');
  ok('duplicate ФИО → error on the lastName field', !!nameErr, JSON.stringify(nameErr));
  await page.screenshot({ path: 'tasdiq-field-1-name-taken.png' });

  // ── 3. bad email format ──
  await openNewCard();
  await fillBase('Matritsa Test');
  await page.fill('[data-testid="employee-email"]', 'notanemail');
  await page.click('[data-testid="employee-save"]');
  await page.waitForTimeout(600);
  ok('bad email → error on the email field', !!(await fieldError('employee-email')));

  // ── 4. taken email ──
  await page.fill('[data-testid="employee-email"]', 'admin@demo.local');
  await page.click('[data-testid="employee-save"]');
  await page.waitForTimeout(1500);
  const emailErr = await fieldError('employee-email');
  ok('taken email → error on the email field', !!emailErr, JSON.stringify(emailErr));
  await page.screenshot({ path: 'tasdiq-field-2-email-taken.png' });

  // ── 5. bad phone ──
  await openNewCard();
  await fillBase('Matritsa Test');
  await page.fill('[data-testid="employee-phone"]', 'abc');
  await page.click('[data-testid="employee-save"]');
  await page.waitForTimeout(600);
  ok('bad phone → error on the phone field', !!(await fieldError('employee-phone')));

  // ── 6. password without login → login field required ──
  await openNewCard();
  await fillBase('Matritsa Test');
  await page.fill('[data-testid="employee-new-password"]', 'parol123');
  await page.click('[data-testid="employee-save"]');
  await page.waitForTimeout(600);
  ok(
    'password w/o login → error on the login field',
    !!(await fieldError('employee-new-username')),
  );

  // ── 7. 51-char login → too-long on the login field ──
  await page.fill('[data-testid="employee-new-username"]', 'x'.repeat(51));
  await page.click('[data-testid="employee-save"]');
  await page.waitForTimeout(600);
  const longErr = await fieldError('employee-new-username');
  ok('51-char login → error on the login field', !!longErr, JSON.stringify(longErr));

  // ── 8. FREE-FORM logins all save (cyrillic, spaces, @, mixed) ──
  const freeLogins = [
    ['Erkin Bir', 'омборчи ака'],
    ['Erkin Ikki', 'boymurod@climart_santex_group'],
    ['Erkin Uch', 'Логин-2026 @klimart'],
  ];
  for (const [last, login] of freeLogins) {
    await openNewCard();
    await fillBase(last);
    await page.fill('[data-testid="employee-new-username"]', login);
    await page.fill('[data-testid="employee-new-password"]', 'parol123');
    await page.click('[data-testid="employee-save"]');
    await page.waitForURL(/\/settings\/employees\/[0-9a-f-]{36}/, { timeout: 20000 });
    const eid = page.url().match(/employees\/([0-9a-f-]{36})/)?.[1];
    if (eid) createdIds.push(eid);
    ok(`free login «${login}» SAVES`, !!eid);
  }
  await page.screenshot({ path: 'tasdiq-field-3-free-login-saved.png' });

  // ── 9. taken login → login field (pre-check) ──
  await openNewCard();
  await fillBase('Erkin Tort');
  await page.fill('[data-testid="employee-new-username"]', 'омборчи ака');
  await page.fill('[data-testid="employee-new-password"]', 'parol123');
  await page.click('[data-testid="employee-save"]');
  await page.waitForTimeout(1500);
  const takenErr = await fieldError('employee-new-username');
  ok('taken login → error on the login field', !!takenErr, JSON.stringify(takenErr));
  await page.screenshot({ path: 'tasdiq-field-4-login-taken.png' });

  // ── 9b. login held by an ARCHIVED employee → archive-flavoured message ──
  // (owner's prod scenario: «Удалить сотрудника» is a soft archive that keeps
  // the login occupied in the partial unique index — re-creating the employee
  // died on an invisible twin with a cryptic «Noyob qiymat xatosi».)
  {
    const tok = await adminToken();
    const fx = await (
      await fetch(`${API}/hr/employees`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
        body: JSON.stringify({ name: 'Arxiv Fixture' }),
      })
    ).json();
    createdIds.push(fx.id);
    await fetch(`${API}/hr/employees/${fx.id}/set-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
      body: JSON.stringify({ username: 'arxivdagi login', password: 'parol123' }),
    });
    // the card's «Удалить сотрудника» route = DELETE :id = SOFT archive
    await fetch(`${API}/hr/employees/${fx.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tok}` },
    });
  }
  await openNewCard();
  await fillBase('Erkin Besh');
  await page.fill('[data-testid="employee-new-username"]', 'arxivdagi login');
  await page.fill('[data-testid="employee-new-password"]', 'parol123');
  await page.click('[data-testid="employee-save"]');
  await page.waitForTimeout(1800);
  const archErr = await fieldError('employee-new-username');
  ok(
    'login held by an ARCHIVED employee → archive-naming error on the login field',
    !!archErr && /архив|arxiv/i.test(archErr || ''),
    JSON.stringify(archErr),
  );
  await page.screenshot({ path: 'tasdiq-field-5-login-archived.png' });

  // ── 10. the cyrillic-with-space login actually LOGS IN ──
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p2 = await ctx2.newPage();
  await p2.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await p2.fill('[data-test-id="login-email"]', 'омборчи ака');
  await p2.fill('[data-test-id="login-password"]', 'parol123');
  await p2.click('button[type=submit]');
  await p2.waitForURL((u) => !String(u).includes('/login'), { timeout: 30000 });
  ok('cyrillic free login LOGS IN', !p2.url().includes('/login'), p2.url());
  await ctx2.close();
} catch (e) {
  ok('EXCEPTION', false, String(e).slice(0, 300));
  await page.screenshot({ path: 'tasdiq-field-error.png' }).catch(() => {});
} finally {
  // cleanup: HARD-delete (bulk-delete) — DELETE :id is a soft archive that
  // would keep usernames/emails occupied and poison the next run.
  try {
    const tok = await adminToken();
    for (const archived of [false, true]) {
      const list = await (
        await fetch(`${API}/hr/employees?limit=100${archived ? '&archived=true' : ''}`, {
          headers: { Authorization: `Bearer ${tok}` },
        })
      ).json();
      for (const r of list.rows ?? []) {
        if (/^(Erkin|Dup Test|Matritsa|Arxiv Fixture|Omborchi Test)/.test(r.name)) {
          createdIds.push(r.id);
        }
      }
    }
    const ids = [...new Set(createdIds)];
    if (ids.length) {
      const res = await (
        await fetch(`${API}/hr/employees/bulk-delete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
          body: JSON.stringify({ ids }),
        })
      ).json();
      console.log(`cleanup: hard-deleted ${res.succeeded?.length ?? 0}/${ids.length}`);
    }
  } catch (e) {
    console.log(`cleanup failed: ${String(e).slice(0, 120)}`);
  }
  console.log(
    `\n=== field-errors + free-login — ${results.filter((r) => r.startsWith('PASS')).length}/${results.length} PASS ===`,
  );
  await browser.close();
  process.exit(failed ? 1 : 0);
}
