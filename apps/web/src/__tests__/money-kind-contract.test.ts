import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * FE↔BE contract lock for `MoneyOperation.documentKind` (08k bug-class).
 *
 * Found by the 2026-06-11 Conv-3 browser smoke: the /money page assumed
 * kind slugs (`cashin`/`cashout`/`paymentin`/`paymentout`) that NO ledger
 * writer ever stored — the real writers are cash-in/cash-out services
 * (`cash_in`/`cash_out`) and retail-sale (`retailsale`). Result: every row
 * link was `undefined/<id>`, the kind cell rendered the raw i18n key path,
 * and the kind filter always produced an empty list. Gate-invisible: the
 * key-existence test skips dynamic keys, and tc can't see across the
 * HTTP boundary.
 *
 * This test reads BOTH sources and pins:
 *   writers' literals ⊆ BE filter enum == FE KIND_ROUTES keys ⊆ i18n keys.
 */

const WEB_SRC = join(__dirname, '..');
const REPO = join(WEB_SRC, '..', '..', '..');
const read = (p: string) => readFileSync(p, 'utf8');

// 1. The de-facto writer literals (every service that creates ledger rows).
const WRITER_FILES = [
  'apps/api/src/modules/cash-in/cash-in.service.ts',
  'apps/api/src/modules/cash-out/cash-out.service.ts',
  'apps/api/src/modules/retail-sale/retail-sale.service.ts',
];

function writerKinds(): Set<string> {
  const kinds = new Set<string>();
  for (const f of WRITER_FILES) {
    for (const m of read(join(REPO, f)).matchAll(/documentKind:\s*'([^']+)'/g)) {
      kinds.add(m[1] as string);
    }
  }
  return kinds;
}

// 2. The BE list-filter enum.
function filterEnum(): Set<string> {
  const src = read(join(REPO, 'apps/api/src/modules/money/money-operation.schema.ts'));
  const m = src.match(/documentKind:\s*z\.enum\(\[([^\]]+)\]\)/);
  expect(m, 'documentKind z.enum not found in money-operation.schema.ts').toBeTruthy();
  const body = m?.[1] ?? '';
  return new Set(Array.from(body.matchAll(/'([^']+)'/g), (x) => x[1] as string));
}

// 3. The FE page's route map keys.
function feKindRoutes(): Set<string> {
  const src = read(join(WEB_SRC, 'app', '(app)', 'money', 'page.tsx'));
  const m = src.match(/const KIND_ROUTES[^=]*=\s*\{([^}]+)\}/);
  expect(m, 'KIND_ROUTES not found in money/page.tsx').toBeTruthy();
  const body = m?.[1] ?? '';
  return new Set(Array.from(body.matchAll(/^\s*(\w+):/gm), (x) => x[1] as string));
}

// 4. The i18n kind labels.
function i18nKinds(locale: string): Set<string> {
  const messages = JSON.parse(read(join(WEB_SRC, 'messages', `${locale}.json`)));
  return new Set(Object.keys(messages.pages.money.kinds));
}

describe('money documentKind FE↔BE contract', () => {
  const writers = writerKinds();
  const beEnum = filterEnum();
  const feRoutes = feKindRoutes();

  it('finds the writer literals (scan is not vacuous)', () => {
    expect(writers.size).toBeGreaterThanOrEqual(3);
  });

  it('every written kind is filterable (writers ⊆ BE enum)', () => {
    for (const k of writers)
      expect(beEnum, `writer kind '${k}' missing from filter enum`).toContain(k);
  });

  it('the BE enum and FE KIND_ROUTES agree exactly (no undefined row links)', () => {
    expect([...feRoutes].sort()).toEqual([...beEnum].sort());
  });

  it('every ledger kind has a label in BOTH locales (no raw key-path cells)', () => {
    for (const locale of ['ru', 'uz']) {
      const keys = i18nKinds(locale);
      for (const k of writers)
        expect(keys, `pages.money.kinds.${k} missing in ${locale}`).toContain(k);
    }
  });
});
