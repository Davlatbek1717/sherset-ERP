import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guards the Phase-2 RU-locale leak on the catalog create pages.
 *
 * bundles/new, services/new and variants/new passed hardcoded Latin-uz strings
 * to <DetailHeader> (titlePrefix="Komplekt", stateLabel="Yangi",
 * customTitle="Yangi komplekt", …). customTitle is the rendered page heading
 * and stateLabel the rendered state badge, so in the RU locale they leaked
 * Uzbek. The no-hardcoded i18n gate never caught it: it only scans document
 * forms and only flags Cyrillic. These three header props must be i18n
 * expressions (`{t(...)}` / `{tCommon(...)}`), never string literals.
 */
const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');
const WEB_APP = join(REPO_ROOT, 'apps', 'web', 'src', 'app', '(app)');

// products/new dropped 2026-06-19: its 2-column rebuild (flagship 1) replaced
// <DetailHeader> with moysklad's full-width «* Наименование товара» title input
// — there is no DetailHeader on that page anymore, so the prop guard no longer
// applies. The remaining three still use <DetailHeader> and stay guarded.
const CATALOG_NEW_PAGES = [
  'bundles/new/page.tsx',
  'services/new/page.tsx',
  'variants/new/page.tsx',
];

const HEADER_PROPS = ['titlePrefix', 'stateLabel', 'customTitle'] as const;

describe('catalog /new DetailHeader props are i18n expressions, not Latin-uz literals', () => {
  for (const rel of CATALOG_NEW_PAGES) {
    const src = readFileSync(join(WEB_APP, rel), 'utf8');
    for (const prop of HEADER_PROPS) {
      it(`${rel}: ${prop} uses an i18n expression, not a string literal`, () => {
        // A string literal (prop="..." / prop='...') is a hardcoded leak;
        // the value must be an {expression} resolving a translation.
        const literal = new RegExp(`${prop}\\s*=\\s*["']`);
        expect(
          literal.test(src),
          `${rel} hardcodes ${prop} as a string literal — pass {t(...)} so the RU locale renders Russian`,
        ).toBe(false);
        // And the prop must actually be present + bound to an expression.
        const expression = new RegExp(`${prop}\\s*=\\s*\\{`);
        expect(expression.test(src), `${rel} is missing an {expression} for ${prop}`).toBe(true);
      });
    }
  }
});
