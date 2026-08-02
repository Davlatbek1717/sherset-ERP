import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * POS to'lov TANASI (body) bo'yicha FE↔BE shartnomasi.
 *
 * `api-contract.test.ts` YO'L va METODni tekshiradi — bu yerda esa MAYDONLAR.
 * Farq muhim, chunki 2026-08-02 da prodda topilgan xato aynan maydonlarda edi:
 * `/sotuv` to'lov oynasi `terminalAmountMinor` va `debtAmountMinor` yuborardi,
 * `PostRetailSaleSchema` esa ularni bilmasdi. **Zod ortiqcha kalitlarni
 * jimgina tashlab yuboradi** (strict emas) — shuning uchun 400 «yo'q maydon»
 * emas, «to'lov yetarli emas» bo'lib kelardi: server terminal orqali to'langan
 * summani UMUMAN ko'rmasdi. Kassir terminal bilan to'lagan mijozning chekini
 * rasmiylashtira olmasdi.
 *
 * Buni na typecheck (ikki paket orasida tip aloqasi yo'q), na unit-testlar
 * (mock'lar o'z tanasini o'zi yasaydi) tutadi. Faqat shunday skaner tutadi.
 */

const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');
const POS_PAGE = join(REPO_ROOT, 'apps', 'web', 'src', 'app', '(app)', 'sotuv', 'page.tsx');
const POST_SCHEMA = join(
  REPO_ROOT,
  'apps',
  'api',
  'src',
  'modules',
  'retail-sale',
  'retail-sale.schema.ts',
);

/** `api.post(\`/retail-sales/${x}/post\`, { … })` chaqiruvidagi kalitlar. */
function feKeys(): string[] {
  const src = readFileSync(POS_PAGE, 'utf8');
  const at = src.indexOf('/post`');
  expect(at, 'POS sahifasida `/retail-sales/:id/post` chaqiruvi topilmadi').toBeGreaterThan(-1);
  const open = src.indexOf('{', at);
  // Object literalning yopilishini qavs hisoblab topamiz (regex ichma-ich
  // qavslarni uddalay olmaydi).
  let depth = 0;
  let end = open;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  const body = src.slice(open, end);
  // `key:` ko'rinishidagi TOP-DARAJA kalitlar (ichma-ich obyekt yo'q bu yerda).
  // `flatMap` + guard: `noUncheckedIndexedAccess` ostida `m[1]` — `string|undefined`,
  // shuning uchun `map` `(string|undefined)[]` beradi va `string[]` ga sig'maydi.
  return [
    ...new Set(
      [...body.matchAll(/(?:^|[\s{,(])([a-zA-Z_][\w]*)\s*:/g)].flatMap((m) => (m[1] ? [m[1]] : [])),
    ),
  ];
}

/** `PostRetailSaleSchema = z.object({ … })` da e'lon qilingan kalitlar. */
function apiKeys(): string[] {
  const src = readFileSync(POST_SCHEMA, 'utf8');
  const at = src.indexOf('export const PostRetailSaleSchema');
  expect(at, 'PostRetailSaleSchema topilmadi').toBeGreaterThan(-1);
  const open = src.indexOf('z.object({', at) + 'z.object('.length;
  let depth = 0;
  let end = open;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  const body = src
    .slice(open, end)
    // Izohlar ichidagi `so'z:` kalit deb sanalmasin.
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
  return [
    ...new Set(
      [...body.matchAll(/(?:^|\n)\s{2}([a-zA-Z_][\w]*)\s*:/g)].flatMap((m) => (m[1] ? [m[1]] : [])),
    ),
  ];
}

describe('POS to`lov shartnomasi — FE yuborgan har maydonni API biladi', () => {
  const fe = feKeys();
  const api = apiKeys();

  it('skaner ikkala tomonni ham o`qiyapti (bo`sh ro`yxat yashil test bermasin)', () => {
    expect(fe.length).toBeGreaterThan(2);
    expect(api.length).toBeGreaterThan(2);
  });

  it('FE yuboradigan maydonlar API sxemasida BOR', () => {
    // Yo'q maydon = Zod uni jimgina tashlaydi = pul ko'rinmay qoladi.
    const unknown = fe.filter((k) => !api.includes(k));
    expect(unknown, `API bilmaydigan maydon(lar): ${unknown.join(', ')}`).toEqual([]);
  });

  it('to`rtala to`lov turi ham ikkala tomonda bor', () => {
    for (const k of [
      'cashAmountMinor',
      'cardAmountMinor',
      'terminalAmountMinor',
      'debtAmountMinor',
    ]) {
      expect(api, `API sxemasida ${k} yo'q`).toContain(k);
      expect(fe, `POS sahifasi ${k} yubormayapti`).toContain(k);
    }
  });
});
