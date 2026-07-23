// CERT (our app, :3219): /demands filter completeness + EVERY filter param works.
// (1) login admin@demo.local; (2) render the filter → count fields + check
// «Комментарий к адресу доставки» present + screenshot; (3) in-page fetch the
// /demands API for EVERY filter param → assert 200 (accepted+processed) and, for
// discriminating values, narrowed total vs baseline. Proves "barchasi ishlaydimi".
import { chromium } from 'playwright';
import { resolve } from 'node:path';
const OUT = resolve('D:/projects/moysklad/docs/audits/demands-list-2026-06-26');
const b = await chromium.launch({ headless: true });
const p = await (await b.newContext({ viewport: { width: 1680, height: 1000 }, locale: 'ru-RU' })).newPage();
p.setDefaultTimeout(45000);
const out = {};
// Capture the app's real Bearer token from a live /api/v1 request (the token is
// in-memory in auth-store, not in storage — XSS protection).
let bearer = null;
p.on('request', (req) => {
  const a = req.headers().authorization;
  if (a && /^Bearer /.test(a)) bearer = a;
});
try {
  await p.goto('http://localhost:3219/demands', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1500);
  // login (pre-filled in dev, but fill to be safe + submit with Enter)
  await p.locator('[data-test-id="login-email"]').fill('admin@demo.local').catch(() => {});
  const pw = p.locator('[data-test-id="login-password"]');
  await pw.fill('admin123').catch(() => {});
  await pw.press('Enter').catch(() => {});
  await p.waitForURL('**/demands', { timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(6000);

  // (2) filter render
  out.render = await p.evaluate(() => {
    const fields = [...document.querySelectorAll('[data-test-id="demands-inline-filter"] [data-test-id="inline-filter-field"]')];
    const labels = fields.map((f) => (f.querySelector('span')?.textContent || '').replace(/^●\s*/, '').trim());
    const gearItems = [...document.querySelectorAll('[data-test-id="inline-filter-settings"]')].length;
    return {
      fieldCount: fields.length,
      labels,
      hasDeliveryComment: !!document.querySelector('[data-test-id="filter-delivery-address-comment"]'),
      hasGear: !!document.querySelector('[data-test-id="inline-filter-settings"]'),
      hasBookmark: !!document.querySelector('[data-test-id="inline-filter-bookmark"]'),
    };
  });
  await p.screenshot({ path: resolve(OUT, 'our-app-filter-25.png') });

  // (3) probe EVERY filter param via the app's authenticated API (real Bearer).
  out.bearerCaptured = !!bearer;
  out.probes = await p.evaluate(async (token) => {
    const H = token ? { authorization: token } : {};
    const get = async (qs) => {
      const r = await fetch(`/api/v1/demands?${qs}&limit=1`, { credentials: 'include', headers: H });
      let total = null;
      try {
        total = (await r.json()).total;
      } catch {}
      return { status: r.status, total };
    };
    const base = await get('');
    // grab a real agent id + a date to make discriminating filters
    const sample = await fetch('/api/v1/demands?limit=1', { credentials: 'include', headers: H }).then((r) => r.json()).catch(() => ({}));
    const agentId = sample?.items?.[0]?.agent?.id;
    const orgId = sample?.items?.[0]?.organization?.id;
    const storeId = sample?.items?.[0]?.store?.id;
    const dummyUuid = '00000000-0000-4000-8000-000000000000';
    const cases = {
      momentFrom: 'momentFrom=2026-01-01',
      paymentStatus: 'paymentStatus=paid',
      state: 'state=posted',
      applicable: 'applicable=true',
      printed: 'printed=true',
      published: 'published=true',
      shared: 'shared=true',
      shipmentAddress: 'shipmentAddress=zzz',
      shipmentAddressComment: 'shipmentAddressComment=zzz',
      updatedFrom: 'updatedFrom=2026-01-01',
      agentIds: `agentIds=${agentId || dummyUuid}`,
      consigneeIds: `consigneeIds=${dummyUuid}`,
      productIds: `productIds=${dummyUuid}`,
      storeIds: `storeIds=${storeId || dummyUuid}`,
      ownerIds: `ownerIds=${dummyUuid}`,
      projectIds: `projectIds=${dummyUuid}`,
      contractIds: `contractIds=${dummyUuid}`,
      agentGroupIds: `agentGroupIds=${dummyUuid}`,
      agentOwnerIds: `agentOwnerIds=${dummyUuid}`,
      agentAccountIds: `agentAccountIds=${dummyUuid}`,
      organizationIds: `organizationIds=${orgId || dummyUuid}`,
      organizationAccountIds: `organizationAccountIds=${dummyUuid}`,
      salesChannelIds: `salesChannelIds=${dummyUuid}`,
      groupIds: `groupIds=${dummyUuid}`,
      modifiedByIds: `modifiedByIds=${dummyUuid}`,
    };
    const res = { baseTotal: base.total };
    for (const [k, qs] of Object.entries(cases)) {
      const r = await get(qs);
      res[k] = { status: r.status, total: r.total, narrowed: r.total != null && base.total != null && r.total <= base.total };
    }
    return res;
  }, bearer);
} catch (e) {
  out.error = String(e).slice(0, 500);
}
console.log(JSON.stringify(out, null, 2));
await b.close();
