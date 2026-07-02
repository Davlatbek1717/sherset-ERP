import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * FE↔BE contract lock — ABC analysis report (2026-06-10).
 *
 * Bug-class (POS-register-crash sibling, 08k): the page declared an imagined
 * response wrapper `{filter, totals, classes}` while the API returns
 * `{from, to, totalRevenueMinor, summary, rows}` — `data.classes` was ALWAYS
 * undefined, so `/reports/abc-analysis` white-screened on every load once the
 * query resolved (`Cannot read properties of undefined (reading 'map')`).
 * tc/biome/unit never render the page, so the crash was gate-invisible; the
 * Convention-6 browser render-sweep caught it.
 *
 * This guard reads BOTH sources and fails if either side drifts again.
 */

const PAGE = join(__dirname, '..', 'app', '(app)', 'reports', 'abc-analysis', 'page.tsx');

// Resolve the api service relative to the repo root (web tests run from apps/web).
const apiServicePath = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'apps',
  'api',
  'src',
  'modules',
  'report',
  'abc-analysis.service.ts',
);

describe('ABC report FE↔BE contract', () => {
  const page = readFileSync(PAGE, 'utf8');
  const api = readFileSync(apiServicePath, 'utf8');

  it('the API response wrapper still carries summary/rows/totalRevenueMinor', () => {
    const wrapper = api.slice(
      api.indexOf('interface AbcResponse'),
      api.indexOf('}\n', api.indexOf('interface AbcResponse')),
    );
    for (const field of ['from:', 'to:', 'totalRevenueMinor:', 'rows:', 'summary:']) {
      expect(wrapper, `API AbcResponse must keep "${field}"`).toContain(field);
    }
  });

  it('the page binds data.summary (NOT the imagined data.classes)', () => {
    expect(page).toContain('data.summary.map');
    // a real BINDING (data.classes.<member> / data.classes[...]), not the
    // doc-comment mention of the old bug
    expect(page, 'data.classes was never sent by the API — the white-screen bug').not.toMatch(
      /data\.classes[.[]/,
    );
    expect(page).not.toMatch(/data\.totals[.[]/);
  });

  it('the page row/summary field names match the API row/summary field names', () => {
    for (const field of ['cumulativeShare', 'classGroup', 'revenueMinor', 'itemCount']) {
      expect(page).toContain(field);
      expect(api).toContain(field);
    }
  });
});

/**
 * Same drift class on the AGING report (found by the follow-up sweep of all
 * 16 report consumers): the page imagined `{filter, buckets, totals}` while
 * the API returns `{side, asOf, bucketLabels, totalsByBucket, rows, currency,
 * mixedCurrency}` — `data.buckets`/`data.totals` were always undefined.
 */
describe('Aging report FE↔BE contract', () => {
  const agingPage = readFileSync(
    join(__dirname, '..', 'app', '(app)', 'reports', 'aging', 'page.tsx'),
    'utf8',
  );
  const agingApi = readFileSync(
    join(
      __dirname,
      '..',
      '..',
      '..',
      '..',
      'apps',
      'api',
      'src',
      'modules',
      'report',
      'aging.service.ts',
    ),
    'utf8',
  );

  it('the API still returns totalsByBucket/bucketLabels/rows', () => {
    for (const field of ['totalsByBucket', 'bucketLabels', 'rows: cpRows']) {
      expect(agingApi, `API aging response must keep "${field}"`).toContain(field);
    }
  });

  it('the page binds totalsByBucket (NOT the imagined buckets/totals wrapper)', () => {
    expect(agingPage).toContain('data?.totalsByBucket');
    expect(agingPage, 'data.buckets was never sent by the API').not.toMatch(/data\.buckets[.[]/);
    expect(agingPage, 'data.totals was never sent by the API').not.toMatch(/data\.totals[.[]/);
  });
});
