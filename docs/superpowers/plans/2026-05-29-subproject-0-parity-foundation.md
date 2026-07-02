# Sub-loyiha 0 — Parity Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Inline execution** tanlandi — Task 2/3 jonli moysklad login (2FA mumkin) + foydalanuvchi hamkorligini talab qiladi, subagent'da bajarib bo'lmaydi.

**Goal:** `MOYSKLAD-PARITY-AUDIT-PROTOCOL.md v2.2` Phase 0 reference pipeline'ini ishlaydigan holatga keltirish (storageState auth → 12-holat capture → metadata), customer-orders'da pilot bilan isbotlash, va butun 56 sahifa uchun haqiqiy `PARITY-TRACKER.md` + qayta-ishlatiladigan DoD shablonini yaratish.

**Architecture:** Mavjud `scripts/capture-moysklad-references.ts` (v2.1, placeholder selektorlar) tuzatiladi: (1) `.env.local` Node 22 `--env-file` orqali yuklanadi; (2) parol-avtomatlashtirish o'rniga **Playwright `storageState`** — foydalanuvchi bir marta headed brauzerda qo'lda kiradi (2FA/captcha o'zi hal qiladi), sessiya `.auth/moysklad.json` (gitignored) ga saqlanadi, keyingi barcha capture shuni qayta ishlatadi. PNG gitignored, `metadata.json` commit (`.gitignore` allaqachon mos). Pure helper'lar (freshness, module config) unit-test bilan; integratsiya (real capture) expected-output smoke bilan tasdiqlanadi.

**Tech Stack:** TypeScript, tsx, Playwright 1.59 (chromium), Node 22, Vitest (pure helper testlari uchun).

---

## Fayl tuzilishi

- **Modify:** `scripts/capture-moysklad-references.ts` — storageState auth, env-file, real selektorlar, pure helper'larni eksport
- **Modify:** `package.json:27` — `capture-moysklad` skriptiga `--env-file=.env.local` + yangi `capture-moysklad:login` skript
- **Create:** `scripts/capture-moysklad-references.test.ts` — pure helper unit testlari (Vitest)
- **Create:** `.auth/.gitkeep` + `.gitignore` ga `.auth/` — saqlanган sessiya (gitignored)
- **Create:** `docs/PARITY-TRACKER.md` — 56 sahifa × faza × commit (o'lchangan baseline)
- **Create:** `docs/superpowers/templates/page-audit-DoD.md` — qayta-ishlatiladigan tugadi-checklist
- **Create:** `docs/superpowers/templates/audit-module-skeleton.md` — `audit-<module>.md` skeleti
- **Output (gitignored):** `docs/moysklad-reference/customer-orders/states/*.png`
- **Output (commit):** `docs/moysklad-reference/customer-orders/states/metadata.json`

---

## Task 1: Capture harness'ni ishlaydigan qilish (env + deps + brauzer + Playwright smoke)

**Files:**
- Modify: `package.json` (scripts bo'limi)
- Create: `.auth/.gitkeep`
- Modify: `.gitignore`

- [ ] **Step 1: `.auth/` katalogini gitignore qilish**

`.gitignore` oxiriga qo'shish:

```
# Playwright saqlangan moysklad sessiyasi (hech qachon commit qilinmaydi)
.auth/
```

- [ ] **Step 2: `.auth/.gitkeep` yaratish**

```
# Playwright storageState shu yerda saqlanadi (.gitignore bilan himoyalangan)
```

(Faylga yuqoridagi bitta qator yoziladi — katalog mavjud bo'lishi uchun.)

- [ ] **Step 3: package.json skriptlarini yangilash**

`package.json` `scripts` ichida `capture-moysklad` qatorini almashtirish va yangi `:login` qo'shish:

```json
"capture-moysklad": "tsx --env-file=.env.local scripts/capture-moysklad-references.ts",
"capture-moysklad:login": "tsx --env-file=.env.local scripts/capture-moysklad-references.ts --login",
```

- [ ] **Step 4: Playwright import + chromium binary smoke**

Run:
```bash
node -e "require('playwright')" 2>&1 || echo "PLAYWRIGHT_IMPORT_FAIL"
pnpm exec playwright install chromium
```
Expected: `require('playwright')` xatosiz (PLAYWRIGHT_IMPORT_FAIL chiqmaydi); chromium binary o'rnatilgan/mavjud ("is already installed" yoki yuklab oladi).

Agar `PLAYWRIGHT_IMPORT_FAIL` chiqsa: `pnpm add -D -w playwright@1.59.1` qo'shing va qayta urinib ko'ring.

- [ ] **Step 5: Headless brauzer haqiqatan ishga tushishini tekshirish (Windows smoke)**

Run:
```bash
node --input-type=module -e "import('playwright').then(async({chromium})=>{const b=await chromium.launch({headless:true});const p=await b.newContext().then(c=>c.newPage());await p.setContent('<h1>ok</h1>');console.log('LAUNCH_OK');await b.close();})"
```
Expected: `LAUNCH_OK` chiqadi (Playwright chromium Windows'da ishga tushadi).

- [ ] **Step 6: Commit**

```bash
git add .gitignore .auth/.gitkeep package.json
GIT_AUTHOR_NAME="Ozodbek" GIT_AUTHOR_EMAIL="ozodbekmirgasimov@gmail.com" \
GIT_COMMITTER_NAME="Ozodbek" GIT_COMMITTER_EMAIL="ozodbekmirgasimov@gmail.com" \
git commit -m "chore(capture): make moysklad reference harness runnable (env-file, .auth gitignore, browser smoke)" -- .gitignore .auth/.gitkeep package.json
```

---

## Task 2: storageState auth — parolsiz, foydalanuvchi-boshqaruvli login

**Maqsad:** Parolni avtomatlashtirmaslik (2FA/captcha + xavfsizlik). Foydalanuvchi headed brauzerda bir marta kiradi → sessiya saqlanadi → capture shuni qayta ishlatadi.

**Files:**
- Modify: `scripts/capture-moysklad-references.ts`
- Create: `scripts/capture-moysklad-references.test.ts`

- [ ] **Step 1: Pure helper'larni eksport qilish (test uchun)**

`capture-moysklad-references.ts` da `STATES`, `MODULES`, `checkFreshness` allaqachon bor. `checkFreshness`'ni test qilish uchun uni soatdan ajratib, pure qism qo'shamiz. Faylga eksport qo'shish (mavjud funksiyalar yonida):

```ts
/** Pure: PNG fayl mtime'iga qarab holatni tasniflaydi (test uchun ajratilgan). */
export function classifyFreshness(
  ageDaysByState: Record<string, number | null>,
  maxAgeDays = 30,
): { fresh: string[]; stale: string[]; missing: string[] } {
  const fresh: string[] = [];
  const stale: string[] = [];
  const missing: string[] = [];
  for (const [state, ageDays] of Object.entries(ageDaysByState)) {
    if (ageDays === null) missing.push(state);
    else if (ageDays > maxAgeDays) stale.push(state);
    else fresh.push(state);
  }
  return { fresh, stale, missing };
}

export { STATES, MODULES };
```

Va `checkFreshness`'ni shu helper orqali ishlashga o'tkazish (DRY):

```ts
async function checkFreshness(outDir: string) {
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
```

- [ ] **Step 2: classifyFreshness uchun failing test yozish**

`scripts/capture-moysklad-references.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { classifyFreshness, STATES } from './capture-moysklad-references.js';

describe('classifyFreshness', () => {
  it('null age → missing', () => {
    const r = classifyFreshness({ '01-default': null });
    expect(r.missing).toEqual(['01-default']);
    expect(r.fresh).toEqual([]);
  });

  it('age <= maxAge → fresh', () => {
    const r = classifyFreshness({ '01-default': 5 }, 30);
    expect(r.fresh).toEqual(['01-default']);
  });

  it('age > maxAge → stale', () => {
    const r = classifyFreshness({ '01-default': 45 }, 30);
    expect(r.stale).toEqual(['01-default']);
  });

  it('mixed bucket', () => {
    const r = classifyFreshness({ a: null, b: 5, c: 45 }, 30);
    expect(r).toEqual({ missing: ['a'], fresh: ['b'], stale: ['c'] });
  });

  it('STATES has the 12 protocol states', () => {
    expect(STATES.length).toBe(12);
  });
});
```

- [ ] **Step 3: Testni ishga tushirib, fail bo'lishini tasdiqlash**

Run:
```bash
pnpm exec vitest run scripts/capture-moysklad-references.test.ts
```
Expected: FAIL — `classifyFreshness is not exported` / import xatosi (Step 1 hali to'liq qo'llanmagan bo'lsa) yoki test topilmadi.

- [ ] **Step 4: Step 1 dagi eksportlarni qo'llab, testni yashil qilish**

Step 1 dagi kodni faylга kiriting (agar hali kiritilmagan bo'lsa). Qayta ishga tushiring:
```bash
pnpm exec vitest run scripts/capture-moysklad-references.test.ts
```
Expected: PASS — 5 test yashil.

- [ ] **Step 5: `--login` rejimi va storageState'ni script'ga qo'shish**

`login()` funksiyasini almashtirish va auth-fayl konstantasini qo'shish. Faylning yuqorisiga (importlardan keyin):

```ts
const AUTH_FILE = join(process.cwd(), '.auth', 'moysklad.json');
```

Yangi interaktiv login funksiyasi (parol AVTOMATLASHTIRILMAYDI — foydalanuvchi qo'lda kiradi):

```ts
/** Headed brauzer ochadi, foydalanuvchi qo'lda login qiladi (2FA/captcha o'zi),
 *  keyin sessiyani .auth/moysklad.json ga saqlaydi. */
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
```

- [ ] **Step 6: `captureModule`'ni storageState ishlatishga o'tkazish**

`captureModule` ichidagi `newContext` chaqirig'ini almashtirish va eski `login(page)` chaqiruvini olib tashlash:

```ts
  const ctx = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    storageState: AUTH_FILE,
  });
  const page = await ctx.newPage();
  // ... metadata ...
  try {
    await navigateToModule(page, cfg);   // login() OLIB TASHLANADI — storageState session beradi
```

Eski `async function login(page)` funksiyasini butunlay o'chirish.

- [ ] **Step 7: `main()`'ga `--login` shoxini qo'shish**

`main()` boshida (modules hisoblashdan oldin):

```ts
  if (args.includes('--login')) {
    await interactiveLogin();
    return;
  }
```

- [ ] **Step 8: typecheck + test darvozasi**

Run:
```bash
pnpm exec tsc --noEmit -p scripts/tsconfig.json 2>/dev/null || pnpm exec tsc --noEmit scripts/capture-moysklad-references.ts --moduleResolution node --module esnext --target es2022 --skipLibCheck
pnpm exec vitest run scripts/capture-moysklad-references.test.ts
```
Expected: typecheck 0 xato; 5 test yashil. (Agar `scripts/tsconfig.json` yo'q bo'lsa — ikkinchi buyruq ishlaydi.)

- [ ] **Step 9: Commit**

```bash
git add scripts/capture-moysklad-references.ts scripts/capture-moysklad-references.test.ts
GIT_AUTHOR_NAME="Ozodbek" GIT_AUTHOR_EMAIL="ozodbekmirgasimov@gmail.com" \
GIT_COMMITTER_NAME="Ozodbek" GIT_COMMITTER_EMAIL="ozodbekmirgasimov@gmail.com" \
git commit -m "feat(capture): storageState auth (no password automation) + freshness helper + tests" -- scripts/capture-moysklad-references.ts scripts/capture-moysklad-references.test.ts
```

---

## Task 3: Pilot — customer-orders'ni boshidan oxirigacha capture qilish

**Maqsad:** Pipeline'ni real moysklad.uz'da isbotlash. Selektorlar real DOM'ga qarab tuzatiladi (placeholder'lar bartaraf etiladi).

**Files:**
- Modify: `scripts/capture-moysklad-references.ts` (selektorlar — real DOM'ga qarab)
- Output: `docs/moysklad-reference/customer-orders/states/*.png` (gitignored) + `metadata.json` (commit)

- [ ] **Step 1: Foydalanuvchi real credential/sessiyani ta'minlaydi**

Foydalanuvchidan: (a) `.env.local` da `MOYSKLAD_URL` to'g'ri (`https://app.moysklad.uz`); keyin (b) `pnpm capture-moysklad:login` ishga tushirilib, headed brauzerda moysklad'ga kiriladi va ENTER bosiladi.

Run:
```bash
pnpm capture-moysklad:login
```
Expected: `.auth/moysklad.json` yaratiladi (`✓ Sessiya saqlandi`).

- [ ] **Step 2: customer-orders capture'ni birinchi marta ishga tushirish (diagnostika)**

Run:
```bash
pnpm capture-moysklad customer-orders
```
Expected (birinchi urinishda EHTIMOL qisman): `01-default.png` yaratiladi. Ba'zi state'lar `.catch(()=>undefined)` tufayli bo'sh/noto'g'ri bo'lishi mumkin (placeholder selektorlar). Hosil bo'lgan PNG'larni va `metadata.json`'dagi `domDump.items` bo'sh massivlarni ko'rib chiqing.

- [ ] **Step 3: Real selektorlarni aniqlash (headed inspeksiya)**

Run:
```bash
pnpm exec playwright open "https://app.moysklad.uz/app/#customerorder"
```
(yoki `.auth` bilan: kontekst yuklanadi). moysklad list sahifasida quyidagilarni aniqlang va `scripts/capture-moysklad-references.ts`'da mos joylarni yangilang:
- Filter tugma matni (`Фильтр`?) → `02-filter-applied` bloki
- `Изменить` / `Создать` / `Печать` tugma matnlari va menu DOM (`[role=menu] [role=menuitem]` to'g'rimi?)
- Column gear selektori (`thead ...`) → `06-column-gear`
- Qator checkbox selektori → `MODULES['customer-orders'].firstRowSelector`
- Search input `placeholder` matni → `10-empty-state`

Har topilgan selektorni kodga yozing (placeholder izohlarni real selektor bilan almashtiring).

- [ ] **Step 4: customer-orders'ni qayta capture qilib, 12 holatni tasdiqlash**

Run:
```bash
pnpm capture-moysklad customer-orders --refresh
ls docs/moysklad-reference/customer-orders/states/
```
Expected: 12 ta `*.png` fayl + `metadata.json`. `metadata.json`'da `03-edit-dropdown`, `04-create-dropdown`, `05-print-dropdown`, `06-column-gear` uchun `domDump.items` **bo'sh emas** (real menu item'lar yozilgan).

- [ ] **Step 5: PNG gitignore + metadata commit tekshiruvi**

Run:
```bash
git status --short docs/moysklad-reference/customer-orders/
git check-ignore docs/moysklad-reference/customer-orders/states/01-default.png
```
Expected: `metadata.json` `??` (untracked, commit qilinadi); `01-default.png` `check-ignore` tomonidan qaytariladi (ignored). Agar PNG ignored bo'lmasa — `.gitignore` 108-qatorini tekshiring.

- [ ] **Step 6: Commit (faqat script + metadata)**

```bash
git add scripts/capture-moysklad-references.ts docs/moysklad-reference/customer-orders/states/metadata.json
GIT_AUTHOR_NAME="Ozodbek" GIT_AUTHOR_EMAIL="ozodbekmirgasimov@gmail.com" \
GIT_COMMITTER_NAME="Ozodbek" GIT_COMMITTER_EMAIL="ozodbekmirgasimov@gmail.com" \
git commit -m "feat(capture): real moysklad selectors + customer-orders pilot reference (12-state metadata)" -- scripts/capture-moysklad-references.ts docs/moysklad-reference/customer-orders/states/metadata.json
```

---

## Task 4: `PARITY-TRACKER.md` — o'lchangan haqiqiy holat

**Files:**
- Create: `docs/PARITY-TRACKER.md`

- [ ] **Step 1: Tracker'ni yaratish (baseline = o'lchangan, taxmin emas)**

`docs/PARITY-TRACKER.md`:

```markdown
# Parity Tracker — moysklad 1:1 (Protocol v2.2)

> Manba: `MOYSKLAD-PARITY-AUDIT-PROTOCOL.md` + `2026-05-29-full-parity-professional-design.md`.
> Belgilar: ✅ tugadi (DoD §2 to'liq) · 🚧 ishlanyapti · ⏳ boshlanmagan · N/A UI yo'q.
> Faza ustunlari: P0 reference · P1 structural · P2 interactive · P3 stateful · P4 ref-diff.
> **Qoida:** sahifa ✅ faqat 5 faza + gates + audit-<module>.md + commit bo'lganda.

Baseline 2026-05-29 (o'lchangan): reference library=0, audit-md=0, DoD-yopilgan=0.

## Phase A — Sales
| # | Sahifa | P0 | P1 | P2 | P3 | P4 | DoD | Commit |
|---|--------|----|----|----|----|----|-----|--------|
| A1 | customer-orders | 🚧 | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | — |
| A2 | demands | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | — |
| A3 | invoices-out | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | — |
| A4 | sales-returns | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | — |

## Phase B — Money
| # | Sahifa | P0 | P1 | P2 | P3 | P4 | DoD | Commit |
|---|--------|----|----|----|----|----|-----|--------|
| B1 | payments-in | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | — |
| B2 | payments-out | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | — |
| B3 | cash-in | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | — |
| B4 | cash-out | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | — |
| B5 | bank-import | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | — |
| B6 | counterparty-adjustments | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | — |
| B7 | prepayments | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | — |

## Phase C — Purchase
| # | Sahifa | P0 | P1 | P2 | P3 | P4 | DoD | Commit |
|---|--------|----|----|----|----|----|-----|--------|
| C1 | purchase-orders | ⏳ | 🚧 | ⏳ | ⏳ | ⏳ | ⏳ | — |
| C2 | supplies | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | — |
| C3 | invoices-in | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | — |
| C4 | purchase-returns | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | — |
| C5 | factures-in | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | — |
| C6 | factures-out | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | — |

## Phase D — Master data
| # | Sahifa | P0 | P1 | P2 | P3 | P4 | DoD | Commit |
|---|--------|----|----|----|----|----|-----|--------|
| D1 | counterparties | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | — |
| D2 | products | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | — |
| D3 | product-folders | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | — |
| D4 | services | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | — |
| D5 | bundles | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | — |
| D6 | variants | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | — |

## Phase E — Warehouse
| # | Sahifa | P0 | P1 | P2 | P3 | P4 | DoD | Commit |
|---|--------|----|----|----|----|----|-----|--------|
| E1 | moves | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | — |
| E2 | losses | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | — |
| E3 | enters | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | — |
| E4 | inventory | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | — |
| E5 | internal-orders | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | — |
| E6 | price-lists | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | — |

## Phase F — CRM (UI bor)
| # | Sahifa | P0 | P1 | P2 | P3 | P4 | DoD | Commit |
|---|--------|----|----|----|----|----|-----|--------|
| F1 | pipelines | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | — |
| F2 | opportunities | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | — |
| F3 | calls | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | — |
| F4 | tasks | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | — |
| F5 | contact-persons | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | — |
| F6 | contracts | N/A | N/A | N/A | N/A | N/A | N/A | UI yo'q |
| F7 | projects | N/A | N/A | N/A | N/A | N/A | N/A | UI yo'q |

## Phase G — Retail (UI yo'q)
| # | Sahifa | DoD | Izoh |
|---|--------|-----|------|
| G1 | retail-sales | N/A | UI yo'q (backend bor) |
| G2 | cashier-sessions | N/A | UI yo'q |
| G3 | online-orders | N/A | UI yo'q |

## Phase H — Production
| # | Sahifa | P0 | P1 | P2 | P3 | P4 | DoD | Commit |
|---|--------|----|----|----|----|----|-----|--------|
| H1 | bom | N/A | N/A | N/A | N/A | N/A | N/A | UI tekshirilsin (memory: yo'q) |
| H2 | work-orders | N/A | N/A | N/A | N/A | N/A | N/A | UI tekshirilsin (memory: yo'q) |
| H3 | processing-orders | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | — |
| H4 | processings | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | — |

## Phase I — Settings (~19)
| # | Sahifa | DoD | Commit |
|---|--------|-----|--------|
| I1..I19 | (organizations/stores/cash-desks/bank-accounts/users/audit-log/price-types/exchange-rates/currencies/mxik/attributes/print-templates/uoms/tax-rates/expense-items/custom-entities/regions/email/webhooks) | ⏳ | — |
| I20 | task-types | 🚧 | TaskType audit qisman; DoD qayta tekshirilsin |

## Phase J — Reports (UI bor ~12)
| # | Sahifa | DoD | Commit |
|---|--------|-----|--------|
| J2/J4/J5..J14 (UI bor) | profitability/cash-flow/abc/sales-by-channel/sales-by-hour/average-basket/aging/inventory-variance/slow-movers/returns-ratio/counterparty-balance/purchase-management | ⏳ | — |
| J1 dashboard, J3 turnover | N/A | UI yo'q |

## Phase K — Other (UI bor)
| # | Sahifa | DoD | Commit |
|---|--------|-----|--------|
| K | tracking-codes / discounts / payrolls (UI bor) | ⏳ | — |
| K | loyalty / publications / notifications / help / api-integrations | N/A | UI yo'q |

## Scope chetida (alohida ish)
- HR moduli, Analitika moduli — moysklad 56 sahifasiga kirmaydi (custom spec, reference yo'q).
- UI'siz sahifalar (G, F6/F7, H1/H2, J1/J3, K-no-ui) — kerak bo'lsa alohida "UI qurish" sub-loyihasi.
```

- [ ] **Step 2: Commit**

```bash
git add docs/PARITY-TRACKER.md
GIT_AUTHOR_NAME="Ozodbek" GIT_AUTHOR_EMAIL="ozodbekmirgasimov@gmail.com" \
GIT_COMMITTER_NAME="Ozodbek" GIT_COMMITTER_EMAIL="ozodbekmirgasimov@gmail.com" \
git commit -m "docs(tracker): measured parity baseline — 56 pages x 5 phases, honest N/A marking" -- docs/PARITY-TRACKER.md
```

---

## Task 5: Definition-of-Done + audit-skeleton shablonlari

**Files:**
- Create: `docs/superpowers/templates/page-audit-DoD.md`
- Create: `docs/superpowers/templates/audit-module-skeleton.md`

- [ ] **Step 1: DoD checklist shablonini yaratish**

`docs/superpowers/templates/page-audit-DoD.md`:

```markdown
# Page Audit — Definition of Done (har sahifa uchun nusxa oling)

Sahifa: `<module>` · Sana: `YYYY-MM-DD` · Commit: `<hash>`

## A. Reference (Phase 0)
- [ ] `pnpm capture-moysklad <module> --check` yashil (12 holat fresh)
- [ ] `metadata.json` commit qilingan

## B. Audit deliverable
- [ ] `docs/audit-<module>.md` — structural + interactive + stateful delta + yechim

## C. 4-faza
- [ ] P1 Structural (top-bar, filter, table, detail, modal — har element joyida)
- [ ] P2 Interactive (dropdown item match, sort ▲▼, resize, gear, silent-no-op yo'q, affordance, single-source-of-truth, sortable=API enum)
- [ ] P3 Stateful (S1-S13: default/empty/loading/error/filter/sel-0/1/many/saved-filter/pagination/sort/col-hidden/mobile)
- [ ] P4 Reference side-by-side (Playwright screenshot vs moysklad, element-by-element)

## D. Kod darvozalari
- [ ] api typecheck 0 · web typecheck 0
- [ ] tests green (yangi logika → yangi test)
- [ ] biome 0/0 (tegilgan fayllar)
- [ ] RU qoldiq yo'q: `git grep -i "Печать\|Изменить\|Сохранить\|Найти\|Очистить"`
- [ ] husky pre-commit + commit-msg · Ozodbek identity

## E. Tracker
- [ ] `PARITY-TRACKER.md` da sahifa ✅ + commit + sana

**Qoida:** Audit ALL → Fix ALL → Verify ALL → Claim ONCE. "Tugadi" faqat hammasi ☑️.
```

- [ ] **Step 2: audit-<module>.md skeletini yaratish**

`docs/superpowers/templates/audit-module-skeleton.md`:

```markdown
# audit-<module>.md — <Module> 1:1 audit

**Sana:** YYYY-MM-DD · **Reference:** moysklad-reference/<module>/states/ · **DoD:** templates/page-audit-DoD.md

## Phase 1 — Structural delta
| # | Element | moysklad | bizda | delta | yechim | holat |
|---|---------|----------|-------|-------|--------|-------|
| 1 | | | | | | ⏳ |

## Phase 2 — Interactive delta (silent-no-op + dropdown items + sort/resize/gear)
| # | Element | kutilgan xulq | bizdagi xulq | delta | yechim | holat |
|---|---------|---------------|--------------|-------|--------|-------|
| 1 | | | | | | ⏳ |

## Phase 3 — Stateful (S1-S13)
| State | moysklad | bizda | delta | yechim | holat |
|-------|----------|-------|-------|--------|-------|
| S1 default | | | | | ⏳ |

## Phase 4 — Reference side-by-side
- [ ] Element-by-element diff yozildi

## Xulosa
- Topilgan delta: N · Yopilgan: N · Commit: <hash>
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/templates/page-audit-DoD.md docs/superpowers/templates/audit-module-skeleton.md
GIT_AUTHOR_NAME="Ozodbek" GIT_AUTHOR_EMAIL="ozodbekmirgasimov@gmail.com" \
GIT_COMMITTER_NAME="Ozodbek" GIT_COMMITTER_EMAIL="ozodbekmirgasimov@gmail.com" \
git commit -m "docs(templates): reusable per-page DoD checklist + audit-module skeleton" -- docs/superpowers/templates/page-audit-DoD.md docs/superpowers/templates/audit-module-skeleton.md
```

---

## Sub-loyiha 0 yakuni (tugadi mezoni)

- [ ] `pnpm capture-moysklad:login` + `pnpm capture-moysklad customer-orders` ishlaydi (12 PNG + metadata)
- [ ] `scripts/capture-moysklad-references.test.ts` 5 test yashil
- [ ] `docs/moysklad-reference/customer-orders/states/metadata.json` commit (real dropdown items bilan)
- [ ] `docs/PARITY-TRACKER.md` commit (o'lchangan baseline)
- [ ] DoD + audit skeleton shablonlari commit
- [ ] 5 commit, husky-gated, Ozodbek identity

**Keyingi:** Sub-loyiha 1 — A1 customer-orders to'liq 4-faza audit (bu poydevor ustida `writing-plans` bilan alohida reja yoki to'g'ridan protokol bo'yicha ijro).
```
