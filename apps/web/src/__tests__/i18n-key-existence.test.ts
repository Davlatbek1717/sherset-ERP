import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * i18n key-existence gate (permanent CI regression guard).
 *
 * next-intl does NOT typecheck translation keys — a `t('missing.key')` compiles
 * fine and silently renders the literal key path at runtime. This test closes
 * that bug-class: it scans every `t()` call in the web source tree, resolves
 * the hook → namespace, and asserts the key exists in BOTH ru.json and uz.json.
 *
 * Only STATIC string-literal keys are checked. Dynamic keys (template literals,
 * variables, ternaries) cannot be resolved statically and are counted + skipped
 * (surfaced in the test output so the coverage gap is never silent).
 *
 * 🔴 2026-08-12 (FAZA P8) — SCAN ROOT KENGAYTIRILDI: `app/(app)` → butun `src`.
 * Ilgari faqat route daraxti skanerlanardi, ya'ni `components/**` (POS
 * dialoglari shu yerda!), `app/kassa-kirish`, `hooks/**` va `lib/**` dagi har
 * qanday `t('yo'q.kalit')` gate'dan JIM o'tardi va ekranda kalit yo'li
 * ko'rinardi (xotira: `i18n-gate-blind-to-components`). O'lchov: eski qamrov
 * 444 fayl / 13040 kalit, yangisi 756 fayl / 15469 kalit — ya'ni **2429 kalit
 * hech qachon tekshirilmagan edi** (baxtga, hammasi mavjud bo'lib chiqdi).
 */

const SRC = join(__dirname, '..');
/** Skan ildizi — butun `src`. Har `.ts`/`.tsx` fayl kiradi (testlar ham:
 *  testdagi `t('kalit')` ham xuddi shu shartnomaga bo'ysunadi). */
const SCAN_DIR = SRC;
const RU = JSON.parse(readFileSync(join(SRC, 'messages', 'ru.json'), 'utf8'));
const UZ = JSON.parse(readFileSync(join(SRC, 'messages', 'uz.json'), 'utf8'));

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

function resolve(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, k) => {
    if (acc && typeof acc === 'object' && k in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[k];
    }
    return undefined;
  }, obj);
}

interface Ref {
  file: string;
  hook: string;
  fullKey: string;
}

/** Remove block + line comments so t-calls quoted inside comments are not scanned.
 *  `//` is only treated as a comment when not preceded by `:` (protects URLs). */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, (_m, p1) => p1);
}

/** Extract (hook var → namespace) then every static t-call key in one file.
 *  Conservative: a var bound to >1 namespace in the same file (e.g. `t` reused
 *  across components) is AMBIGUOUS — its calls are skipped, not misattributed. */
function extractRefs(file: string): { refs: Ref[]; dynamic: number; ambiguous: number } {
  const src = stripComments(readFileSync(file, 'utf8'));
  // var -> set of namespaces.  `const tX = useTranslations('ns')`  /  no-arg = root ('')
  const nsByVar: Record<string, Set<string>> = {};
  for (const m of src.matchAll(
    /const\s+(\w+)\s*=\s*useTranslations\(\s*(?:['"]([^'"]+)['"])?\s*\)/g,
  )) {
    const varName = m[1];
    if (!varName) continue;
    if (!nsByVar[varName]) nsByVar[varName] = new Set();
    nsByVar[varName].add(m[2] ?? '');
  }
  const names = Object.keys(nsByVar);
  if (names.length === 0) return { refs: [], dynamic: 0, ambiguous: 0 };

  const refs: Ref[] = [];
  let dynamic = 0;
  let ambiguous = 0;
  const callRe = new RegExp(`\\b(${names.join('|')})\\(\\s*(['"\`])?`, 'g');
  for (const m of src.matchAll(callRe)) {
    const hook = m[1];
    if (!hook) continue;
    const namespaces = nsByVar[hook];
    if (!namespaces || namespaces.size > 1) {
      ambiguous++; // var reused for multiple namespaces — cannot resolve statically
      continue;
    }
    const quote = m[2];
    if (quote === "'" || quote === '"') {
      const start = m.index + m[0].length;
      const end = src.indexOf(quote, start);
      if (end === -1) continue;
      const key = src.slice(start, end);
      if (key.includes('${') || key.includes('\\')) {
        dynamic++;
        continue;
      }
      const ns = [...namespaces][0] ?? '';
      refs.push({ file, hook, fullKey: ns ? `${ns}.${key}` : key });
    } else {
      dynamic++; // backtick / non-literal first arg
    }
  }
  return { refs, dynamic, ambiguous };
}

const files = walk(SCAN_DIR);
const allRefs: Ref[] = [];
let dynamicTotal = 0;
let ambiguousTotal = 0;
for (const f of files) {
  const { refs, dynamic, ambiguous } = extractRefs(f);
  allRefs.push(...refs);
  dynamicTotal += dynamic;
  ambiguousTotal += ambiguous;
}

describe('i18n key-existence (ru + uz parity)', () => {
  it('scans the whole src tree', () => {
    expect(files.length).toBeGreaterThan(50);
    expect(allRefs.length).toBeGreaterThan(500);
    // biome-ignore lint/suspicious/noConsoleLog: intentional test diagnostics (coverage stats)
    console.log(
      `i18n key-existence: ${files.length} files, ${allRefs.length} static t() keys checked, ${dynamicTotal} dynamic + ${ambiguousTotal} ambiguous-var skipped`,
    );
  });

  /**
   * Qamrov qulfi (P8): skan ildizini kimdir yana `app/(app)` ga toraytirsa,
   * yuqoridagi `>500` sharti HAMON yashil qolardi — ya'ni qamrov jimgina
   * qisqarardi. Shuning uchun route daraxtidan TASHQARIDAGI aniq fayllar
   * ro'yxatda turishi talab qilinadi.
   */
  it('covers files OUTSIDE the (app) route tree (POS dialogs, kassa-kirish, hooks)', () => {
    const scanned = new Set(files.map((f) => f.replace(SRC, '').replace(/\\/g, '/')));
    for (const must of [
      '/components/pos/customer-card-panel.tsx',
      '/components/pos/rasmilashtirish-modal.tsx',
      '/components/pos/debt-payment-dialog.tsx',
      '/components/pos/pin-keypad.tsx',
      '/app/kassa-kirish/page.tsx',
    ]) {
      expect(scanned, `scan root shrank — ${must} is no longer checked`).toContain(must);
    }
  });

  it('every static t() key resolves in BOTH ru.json and uz.json', () => {
    const missing: string[] = [];
    for (const r of allRefs) {
      const inRu = typeof resolve(RU, r.fullKey) === 'string';
      const inUz = typeof resolve(UZ, r.fullKey) === 'string';
      if (!inRu || !inUz) {
        const where = [!inRu && 'ru', !inUz && 'uz'].filter(Boolean).join('+');
        missing.push(`${r.fullKey}  (missing in ${where})  — ${r.file.replace(SRC, 'src')}`);
      }
    }
    expect(
      missing,
      `Missing i18n keys (next-intl renders these as literal key paths):\n${[...new Set(missing)].join('\n')}`,
    ).toEqual([]);
  });

  // The email_template body keys are fetched via `tEmail.raw('body_*')` (raw HTML — t.raw
  // bypasses ICU so the <p> tags aren't parsed as rich-text). t.raw calls are NOT matched by
  // the static scanner above, so guard the whole namespace explicitly here.
  it('email_template namespace fully resolves in BOTH ru.json and uz.json', () => {
    const keys = [
      'email_template.subject_order',
      'email_template.subject_shipment',
      'email_template.subject_invoice',
      'email_template.body_order',
      'email_template.body_shipment',
      'email_template.body_invoice',
    ];
    const missing: string[] = [];
    for (const k of keys) {
      if (typeof resolve(RU, k) !== 'string') missing.push(`${k} (ru)`);
      if (typeof resolve(UZ, k) !== 'string') missing.push(`${k} (uz)`);
    }
    expect(missing, `Missing email_template keys:\n${missing.join('\n')}`).toEqual([]);
  });
});
