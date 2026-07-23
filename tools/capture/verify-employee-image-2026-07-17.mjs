// LIVE VERIFY: employee card «Изображение» — upload / raw stream / list
// avatar flag / audit / remove, then the browser flow (FileDrop upload →
// thumbnail + filename + ⊗ remove). Dev :3100/:4000. Creates ONE employee
// and deletes it at the end.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const OUT = resolve('D:/projects/moysklad/docs/audits/settings-employees-2026-07-16');
mkdirSync(OUT, { recursive: true });
const WEB = 'http://localhost:3100';
const API = 'http://localhost:4000/api/v1';

// 1×1 red PNG
const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

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

const admin = await j('POST', '/auth/login', {
  identifier: 'admin@demo.local',
  password: 'admin123',
});
const T = admin.data?.accessToken;
const stamp = Date.now() % 1000000;

const emp = await j(
  'POST',
  '/hr/employees',
  {
    name: 'Расм Тест',
    lastName: 'Расм',
    firstName: 'Тест',
    email: `img-${stamp}@test.local`,
    hrRoles: [],
    isChecker: false,
  },
  T,
);
const EMP = emp.data?.id;
check('setup: employee created', !!EMP);

// ── A. API flow ──
const up = await j(
  'PUT',
  `/hr/employees/${EMP}/image`,
  { filename: 'avatar.png', mime: 'image/png', dataBase64: `data:image/png;base64,${PNG_B64}` },
  T,
);
check(
  'A1 upload 20x',
  up.status < 300,
  `got ${up.status} ${JSON.stringify(up.data)?.slice(0, 120)}`,
);

const rawRes = await fetch(`${API}/hr/employees/${EMP}/image/raw`, {
  headers: { authorization: `Bearer ${T}` },
});
const rawBytes = Buffer.from(await rawRes.arrayBuffer());
check(
  'A2 raw stream = png bytes + mime',
  rawRes.status === 200 &&
    rawRes.headers.get('content-type') === 'image/png' &&
    rawBytes.equals(Buffer.from(PNG_B64, 'base64')),
  `status ${rawRes.status} ct ${rawRes.headers.get('content-type')} len ${rawBytes.length}`,
);

const detail = await j('GET', `/hr/employees/${EMP}`, null, T);
check(
  'A3 card shape has hasImage+imageName',
  detail.data?.hasImage === true && detail.data?.imageName === 'avatar.png',
  JSON.stringify({ h: detail.data?.hasImage, n: detail.data?.imageName }),
);

const list = await j('GET', `/hr/employees?search=img-${stamp}`, null, T);
check('A4 list row hasImage=true', list.data?.rows?.[0]?.hasImage === true);

const feed = await j('GET', `/admin/audit-logs?aboutEmployee=${EMP}&limit=20`, null, T);
check(
  'A5 audit diff image: null → avatar.png',
  (feed.data?.items ?? []).some(
    (i) => i.fieldChanges?.image && i.fieldChanges.image.after === 'avatar.png',
  ),
);

// ── B. browser flow ──
const b = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await b.newContext({ viewport: { width: 1680, height: 1000 }, locale: 'ru-RU' });
const p = await ctx.newPage();
p.setDefaultTimeout(45000);
try {
  await p.goto(`${WEB}/login`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('input');
  await p.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(2500);
  for (let a = 0; a < 3; a++) {
    await p.locator('input').nth(0).fill('admin@demo.local');
    await p.locator('input').nth(1).fill('admin123');
    await p.click('button[type=submit]');
    const ok = await p
      .waitForURL((u) => !String(u).includes('/login'), { timeout: 15000 })
      .then(() => true)
      .catch(() => false);
    if (ok) break;
    await p.waitForTimeout(2000);
  }

  // card shows the already-uploaded photo (thumbnail + filename + ⊗)
  await p.goto(`${WEB}/settings/employees/${EMP}`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('[data-testid="employee-image-block"]');
  const thumb = p.locator('[data-testid="employee-image-block"] img');
  check('B1 card shows photo thumbnail', await thumb.isVisible());
  check(
    'B2 filename link shown',
    (await p.locator('[data-testid="employee-image-block"] a').innerText()).includes('avatar.png'),
  );
  await p.screenshot({ path: resolve(OUT, 'verify-employee-image-card.png'), fullPage: false });

  // list avatar column shows the real photo
  await p.goto(`${WEB}/settings/employees`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('[data-testid="employees-page"]');
  await p.waitForTimeout(2500);
  const rowImg = p.locator(`[data-test-id="employee-row-${EMP}"] img`).first();
  check('B3 list avatar renders the photo', await rowImg.isVisible().catch(() => false));

  // ⊗ remove → FileDrop returns
  await p.goto(`${WEB}/settings/employees/${EMP}`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('[data-testid="employee-image-remove"]');
  await p.click('[data-testid="employee-image-remove"]');
  await p.waitForSelector('[data-testid="employee-image-drop"]', { timeout: 15000 });
  check('B4 ⊗ removes photo → upload drop returns', true);

  // upload through the FileDrop's hidden input
  const pngPath = resolve(OUT, '_tmp-avatar.png');
  writeFileSync(pngPath, Buffer.from(PNG_B64, 'base64'));
  await p.locator('[data-testid="employee-image-drop"] input[type=file]').setInputFiles(pngPath);
  await p.waitForSelector('[data-testid="employee-image-block"]', { timeout: 15000 });
  check('B5 FileDrop upload → thumbnail appears', true);

  const raw2 = await j('GET', `/hr/employees/${EMP}`, null, T);
  check('B6 re-uploaded photo persisted server-side', raw2.data?.hasImage === true);
} catch (e) {
  check('UNCAUGHT browser', false, e.message);
} finally {
  await b.close();
  if (EMP) await j('POST', '/hr/employees/bulk-delete', { ids: [EMP] }, T);
  writeFileSync(resolve(OUT, 'verify-employee-image-results.txt'), results.join('\n'));
  console.info(`\nVERIFY RESULT: ${PASS} pass / ${FAIL} fail`);
  process.exitCode = FAIL === 0 ? 0 : 1;
}
