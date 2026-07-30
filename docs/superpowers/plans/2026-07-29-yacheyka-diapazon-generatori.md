# Yacheyka diapazon-generatori — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ombor kartochkasidan yuzlab yacheykani bitta amal bilan yaratish — shablon + diapazonlar bo'yicha, oldindan ko'rish bilan.

**Architecture:** Backend retseptni nomlarga yoyadi (`cell-range.util.ts` — sof funksiya). Oldindan ko'rish alohida endpoint EMAS: bir xil `POST :id/cells/bulk` endpointi `dryRun: true` bilan yozuv qadamini o'tkazib yuboradi, shuning uchun ko'rsatilgan son va haqiqiy natija ajralib qola olmaydi. FE faqat retsept yuboradi.

**Tech Stack:** NestJS + Zod + Prisma (BE) · Next.js + React Query + `@moysklad/ui` (FE) · Vitest.

**Spec:** [`docs/superpowers/specs/2026-07-29-yacheyka-diapazon-generatori-design.md`](../specs/2026-07-29-yacheyka-diapazon-generatori-design.md)

## Global Constraints

- Yoyish mantig'i **faqat** `cell-range.util.ts` da. FE hech qachon nomlarni o'zi hosil qilmaydi.
- Chegara: bitta amalda **5000** yacheyka (`CELL_RANGE_MAX`).
- Yacheyka nomi ≤ **255** belgi (`StoreCell.name` = `VarChar(255)`).
- Aylanish tartibi: `variables` dagi **birinchi** o'zgaruvchi eng sekin aylanadi.
- Mavjud nomlar **o'tkazib yuboriladi** (idempotent), hech qachon yangilanmaydi.
- `createCell` (bittalab yaratish) **o'zgarmaydi**.
- Ruxsat: `@RequirePermission({ entity: 'store', action: 'update' })`.
- Barcha yangi i18n kalitlari **ru va uz** ikkalasiga ham qo'shiladi (`pages.stores.address_storage.range_*`).
- Har task oxirida: `npx tsc --noEmit -p apps/api/tsconfig.json` (yoki web) **0 xato** bo'lishi shart.

## File Structure

| Fayl | Holat | Mas'uliyat |
|---|---|---|
| `apps/api/src/modules/store/cell-range.util.ts` | Create | Retsept → nomlar. Sof, DBsiz, framework-siz |
| `apps/api/src/modules/store/cell-range.util.test.ts` | Create | Yoyish matematikasi |
| `apps/api/src/modules/store/store-address.schema.ts` | Modify | `BulkCreateCellsSchema` |
| `apps/api/src/modules/store/store-address.schema.test.ts` | Modify | Zod validatsiyasi |
| `apps/api/src/modules/store/store-address.service.ts` | Modify | `bulkCreateCells()` |
| `apps/api/src/modules/store/store.controller.ts` | Modify | `POST :id/cells/bulk` |
| `apps/web/src/components/stores/cell-range-modal.tsx` | Create | FE oynasi |
| `apps/web/src/components/stores/address-storage-section.tsx` | Modify | Tugma + oynani ulash |
| `apps/web/src/messages/{ru,uz}.json` | Modify | `range_*` kalitlari |

---

### Task 1: Yoyish utili (sof funksiya)

**Files:**
- Create: `apps/api/src/modules/store/cell-range.util.ts`
- Test: `apps/api/src/modules/store/cell-range.util.test.ts`

**Interfaces:**
- Consumes: hech nima (birinchi task).
- Produces: `CELL_RANGE_MAX`, `CellRangeError`, `CellRangeSpec`, `CellRangeVariable`, `ExpandedCell`, `expandCellRange(spec: CellRangeSpec): ExpandedCell[]`.

- [ ] **Step 1: Failing testni yoz**

`apps/api/src/modules/store/cell-range.util.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { CELL_RANGE_MAX, CellRangeError, expandCellRange } from './cell-range.util.js';

const num = (key: string, from: number, to: number, pad?: number) =>
  ({ key, kind: 'number', from, to, ...(pad === undefined ? {} : { pad }) }) as const;
const letter = (key: string, from: string, to: string) =>
  ({ key, kind: 'letter', from, to }) as const;

describe('expandCellRange', () => {
  it('bitta raqamli o\'zgaruvchi', () => {
    const r = expandCellRange({ template: 'A-{n}', variables: [num('n', 1, 3)], zoneFrom: null });
    expect(r.map((c) => c.name)).toEqual(['A-1', 'A-2', 'A-3']);
    expect(r.every((c) => c.zoneName === null)).toBe(true);
  });

  it('pad nol bilan to\'ldiradi', () => {
    const r = expandCellRange({ template: '{n}', variables: [num('n', 9, 10, 3)], zoneFrom: null });
    expect(r.map((c) => c.name)).toEqual(['009', '010']);
  });

  it('harf diapazoni', () => {
    const r = expandCellRange({ template: '{s}', variables: [letter('s', 'A', 'D')], zoneFrom: null });
    expect(r.map((c) => c.name)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('BIRINCHI o\'zgaruvchi eng SEKIN aylanadi', () => {
    const r = expandCellRange({
      template: '{a}-{b}',
      variables: [num('a', 1, 2), num('b', 1, 3)],
      zoneFrom: null,
    });
    expect(r.map((c) => c.name)).toEqual(['1-1', '1-2', '1-3', '2-1', '2-2', '2-3']);
  });

  it('uch o\'zgaruvchi — to\'liq dekart ko\'paytmasi', () => {
    const r = expandCellRange({
      template: '{a}-{b}-{c}',
      variables: [num('a', 1, 2, 2), letter('b', 'A', 'B'), num('c', 1, 2)],
      zoneFrom: null,
    });
    expect(r.map((c) => c.name)).toEqual([
      '01-A-1', '01-A-2', '01-B-1', '01-B-2',
      '02-A-1', '02-A-2', '02-B-1', '02-B-2',
    ]);
  });

  it('zoneFrom → zona nomi o\'sha o\'zgaruvchi qiymati', () => {
    const r = expandCellRange({
      template: '{a}-{b}',
      variables: [num('a', 1, 2, 2), num('b', 1, 2)],
      zoneFrom: 'a',
    });
    expect(r.map((c) => c.zoneName)).toEqual(['01', '01', '02', '02']);
  });

  it('e\'lon qilinmagan {x} → xato', () => {
    expect(() =>
      expandCellRange({ template: '{a}-{x}', variables: [num('a', 1, 2)], zoneFrom: null }),
    ).toThrow(CellRangeError);
  });

  it('ishlatilmagan o\'zgaruvchi → xato', () => {
    expect(() =>
      expandCellRange({
        template: '{a}',
        variables: [num('a', 1, 2), num('b', 1, 2)],
        zoneFrom: null,
      }),
    ).toThrow(CellRangeError);
  });

  it('takroriy key → xato', () => {
    expect(() =>
      expandCellRange({
        template: '{a}',
        variables: [num('a', 1, 2), num('a', 3, 4)],
        zoneFrom: null,
      }),
    ).toThrow(CellRangeError);
  });

  it('from > to → xato', () => {
    expect(() =>
      expandCellRange({ template: '{a}', variables: [num('a', 5, 1)], zoneFrom: null }),
    ).toThrow(CellRangeError);
    expect(() =>
      expandCellRange({ template: '{a}', variables: [letter('a', 'E', 'B')], zoneFrom: null }),
    ).toThrow(CellRangeError);
  });

  it('A–Z dan tashqari harf → xato', () => {
    expect(() =>
      expandCellRange({ template: '{a}', variables: [letter('a', 'a', 'z')], zoneFrom: null }),
    ).not.toThrow(); // kichik harf katta harfga keltiriladi
    expect(() =>
      expandCellRange({ template: '{a}', variables: [letter('a', 'AB', 'AC')], zoneFrom: null }),
    ).toThrow(CellRangeError);
  });

  it('bo\'sh variables → xato', () => {
    expect(() => expandCellRange({ template: 'A', variables: [], zoneFrom: null })).toThrow(
      CellRangeError,
    );
  });

  it('zoneFrom mavjud bo\'lmagan keyga ishora qilsa → xato', () => {
    expect(() =>
      expandCellRange({ template: '{a}', variables: [num('a', 1, 2)], zoneFrom: 'yoq' }),
    ).toThrow(CellRangeError);
  });

  it('5000 chegarasi: 5000 o\'tadi, 5001 xato', () => {
    expect(
      expandCellRange({ template: '{a}', variables: [num('a', 1, CELL_RANGE_MAX)], zoneFrom: null }),
    ).toHaveLength(CELL_RANGE_MAX);
    expect(() =>
      expandCellRange({
        template: '{a}',
        variables: [num('a', 1, CELL_RANGE_MAX + 1)],
        zoneFrom: null,
      }),
    ).toThrow(/5000/);
  });

  it('255 belgidan uzun nom → xato', () => {
    expect(() =>
      expandCellRange({ template: `${'x'.repeat(255)}{a}`, variables: [num('a', 1, 1)], zoneFrom: null }),
    ).toThrow(CellRangeError);
  });

  it('pad chegaradan tashqari → xato', () => {
    expect(() =>
      expandCellRange({ template: '{a}', variables: [num('a', 1, 2, 7)], zoneFrom: null }),
    ).toThrow(CellRangeError);
  });
});
```

- [ ] **Step 2: Testni yugurtir — YIQILISHI kerak**

Run: `cd apps/api && npx vitest run src/modules/store/cell-range.util.test.ts`
Expected: FAIL — `Failed to resolve import "./cell-range.util.js"`.

- [ ] **Step 3: Utilni yoz**

`apps/api/src/modules/store/cell-range.util.ts`:

```ts
/**
 * Yacheyka diapazon-generatori — retseptni nomlar ro'yxatiga yoyadi.
 *
 * SOF funksiya: DB ham, NestJS ham yo'q. Butun yoyish mantig'i FAQAT shu yerda —
 * FE hech qachon nomlarni o'zi hosil qilmaydi, aks holda oldindan ko'rish va
 * haqiqiy yaratish ajralib ketardi (bu loyihada qayta-qayta chiqqan bug-klass).
 */

/** Bitta amalda yaratsa bo'ladigan maksimal yacheyka soni. */
export const CELL_RANGE_MAX = 5000;

/** Yacheyka nomi uchun DB chegarasi (`StoreCell.name` = VarChar(255)). */
const MAX_NAME_LEN = 255;

/** Foydalanuvchi xatosi — servis buni 400 ga aylantiradi. */
export class CellRangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CellRangeError';
  }
}

export interface CellRangeNumberVariable {
  key: string;
  kind: 'number';
  from: number;
  to: number;
  /** Nol bilan to'ldirish uzunligi (0–6). 0/undefined ⇒ to'ldirilmaydi. */
  pad?: number;
}

export interface CellRangeLetterVariable {
  key: string;
  kind: 'letter';
  /** Bitta harf A–Z (kichik harf ham qabul qilinadi). */
  from: string;
  to: string;
}

export type CellRangeVariable = CellRangeNumberVariable | CellRangeLetterVariable;

export interface CellRangeSpec {
  /** Masalan `{qator}-{stellaj}-{polka}`. */
  template: string;
  variables: CellRangeVariable[];
  /** Qaysi o'zgaruvchi zona nomi bo'ladi; null ⇒ zonasiz. */
  zoneFrom: string | null;
}

export interface ExpandedCell {
  name: string;
  zoneName: string | null;
}

const PLACEHOLDER = /\{([^{}]+)\}/g;

/** Bitta o'zgaruvchining barcha qiymatlari, tartib bo'yicha. */
function valuesOf(v: CellRangeVariable): string[] {
  if (v.kind === 'number') {
    if (!Number.isInteger(v.from) || !Number.isInteger(v.to)) {
      throw new CellRangeError(`«${v.key}»: chegaralar butun son bo'lishi kerak`);
    }
    if (v.from < 0) throw new CellRangeError(`«${v.key}»: manfiy son bo'lmaydi`);
    if (v.from > v.to) {
      throw new CellRangeError(`«${v.key}»: boshlanish (${v.from}) tugashdan (${v.to}) katta`);
    }
    const pad = v.pad ?? 0;
    if (!Number.isInteger(pad) || pad < 0 || pad > 6) {
      throw new CellRangeError(`«${v.key}»: nol-to'ldirish 0 dan 6 gacha bo'lishi kerak`);
    }
    const out: string[] = [];
    for (let i = v.from; i <= v.to; i++) out.push(String(i).padStart(pad, '0'));
    return out;
  }

  const from = String(v.from).toUpperCase();
  const to = String(v.to).toUpperCase();
  if (from.length !== 1 || to.length !== 1) {
    throw new CellRangeError(`«${v.key}»: harf diapazoni bitta harfdan iborat bo'lishi kerak`);
  }
  const a = 'A'.charCodeAt(0);
  const z = 'Z'.charCodeAt(0);
  const f = from.charCodeAt(0);
  const t = to.charCodeAt(0);
  if (f < a || f > z || t < a || t > z) {
    throw new CellRangeError(`«${v.key}»: faqat A–Z harflari`);
  }
  if (f > t) throw new CellRangeError(`«${v.key}»: boshlanish (${from}) tugashdan (${to}) katta`);
  const out: string[] = [];
  for (let c = f; c <= t; c++) out.push(String.fromCharCode(c));
  return out;
}

/**
 * Retseptni yoyadi. Tartib: BIRINCHI o'zgaruvchi eng sekin aylanadi
 * (`01-A-1, 01-A-2, 01-B-1 …`) — inson kutgan tartib.
 */
export function expandCellRange(spec: CellRangeSpec): ExpandedCell[] {
  if (spec.variables.length === 0) {
    throw new CellRangeError("Kamida bitta o'zgaruvchi kerak");
  }

  const keys = spec.variables.map((v) => v.key);
  const dup = keys.find((k, i) => keys.indexOf(k) !== i);
  if (dup) throw new CellRangeError(`«${dup}» o'zgaruvchisi ikki marta e'lon qilingan`);

  const used = new Set<string>();
  for (const m of spec.template.matchAll(PLACEHOLDER)) used.add(m[1]);

  for (const u of used) {
    if (!keys.includes(u)) throw new CellRangeError(`«${u}» uchun diapazon berilmagan`);
  }
  for (const k of keys) {
    if (!used.has(k)) throw new CellRangeError(`«${k}» o'zgaruvchisi shablonda ishlatilmagan`);
  }
  if (spec.zoneFrom !== null && !keys.includes(spec.zoneFrom)) {
    throw new CellRangeError(`Zona uchun «${spec.zoneFrom}» o'zgaruvchisi topilmadi`);
  }

  const lists = spec.variables.map(valuesOf);
  let total = 1;
  for (const l of lists) total *= l.length;
  if (total > CELL_RANGE_MAX) {
    throw new CellRangeError(`${total} ta yacheyka chiqadi, chegara ${CELL_RANGE_MAX}`);
  }

  const out: ExpandedCell[] = [];
  for (let i = 0; i < total; i++) {
    let rem = i;
    const picked: Record<string, string> = {};
    // Oxirgi o'zgaruvchi eng tez ⇒ birinchisi eng sekin.
    for (let v = lists.length - 1; v >= 0; v--) {
      const list = lists[v];
      picked[spec.variables[v].key] = list[rem % list.length];
      rem = Math.floor(rem / list.length);
    }
    const name = spec.template.replace(PLACEHOLDER, (_, k: string) => picked[k]);
    if (name.length > MAX_NAME_LEN) {
      throw new CellRangeError(`Nom ${MAX_NAME_LEN} belgidan uzun: «${name.slice(0, 40)}…»`);
    }
    out.push({ name, zoneName: spec.zoneFrom ? picked[spec.zoneFrom] : null });
  }
  return out;
}
```

- [ ] **Step 4: Testni yugurtir — O'TISHI kerak**

Run: `cd apps/api && npx vitest run src/modules/store/cell-range.util.test.ts`
Expected: PASS (17 test).

- [ ] **Step 5: Mutatsiya bilan tekshir (test vakkum emasligini isbotla)**

`cell-range.util.ts` da tartibni ataylab buz — `for (let v = lists.length - 1; v >= 0; v--)` ni `for (let v = 0; v < lists.length; v++)` ga o'zgartir. Testni yugurtir: **«BIRINCHI o'zgaruvchi eng SEKIN aylanadi»** va **«uch o'zgaruvchi»** testlari yiqilishi shart. Keyin `git checkout -- apps/api/src/modules/store/cell-range.util.ts` bilan qaytar va testlar yana yashil ekanini tasdiqla.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/store/cell-range.util.ts apps/api/src/modules/store/cell-range.util.test.ts
git commit -m "feat(ombor): yacheyka diapazon yoyish utili (sof, 17 test)"
```

---

### Task 2: Zod sxemasi

**Files:**
- Modify: `apps/api/src/modules/store/store-address.schema.ts`
- Test: `apps/api/src/modules/store/store-address.schema.test.ts`

**Interfaces:**
- Consumes: Task 1 dan `CELL_RANGE_MAX`.
- Produces: `BulkCreateCellsSchema`, `BulkCreateCellsInput` (maydonlari: `template: string`, `variables: CellRangeVariable[]`, `zoneFrom: string | null`, `dryRun: boolean`).

- [ ] **Step 1: Failing testni yoz**

`store-address.schema.test.ts` oxiriga qo'sh:

```ts
describe('BulkCreateCellsSchema', () => {
  const ok = {
    template: '{a}-{b}',
    variables: [
      { key: 'a', kind: 'number', from: 1, to: 5, pad: 2 },
      { key: 'b', kind: 'letter', from: 'A', to: 'C' },
    ],
    zoneFrom: 'a',
  };

  it('to\'g\'ri retseptni qabul qiladi, dryRun default false', () => {
    const r = BulkCreateCellsSchema.safeParse(ok);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.dryRun).toBe(false);
  });

  it('dryRun uzatilsa saqlanadi', () => {
    const r = BulkCreateCellsSchema.safeParse({ ...ok, dryRun: true });
    expect(r.success && r.data.dryRun).toBe(true);
  });

  it('zoneFrom null bo\'lishi mumkin', () => {
    expect(BulkCreateCellsSchema.safeParse({ ...ok, zoneFrom: null }).success).toBe(true);
  });

  it('bo\'sh shablon rad etiladi', () => {
    expect(BulkCreateCellsSchema.safeParse({ ...ok, template: '' }).success).toBe(false);
  });

  it('noma\'lum kind rad etiladi', () => {
    const bad = { ...ok, variables: [{ key: 'a', kind: 'roman', from: 1, to: 3 }] };
    expect(BulkCreateCellsSchema.safeParse(bad).success).toBe(false);
  });

  it('variables bo\'sh massiv rad etiladi', () => {
    expect(BulkCreateCellsSchema.safeParse({ ...ok, variables: [] }).success).toBe(false);
  });

  it('o\'zgaruvchilar soni 6 tadan oshsa rad etiladi', () => {
    const many = Array.from({ length: 7 }, (_, i) => ({
      key: `k${i}`, kind: 'number' as const, from: 1, to: 2,
    }));
    expect(BulkCreateCellsSchema.safeParse({ ...ok, variables: many }).success).toBe(false);
  });
});
```

Fayl boshidagi importga `BulkCreateCellsSchema` ni qo'sh.

- [ ] **Step 2: Testni yugurtir — YIQILISHI kerak**

Run: `cd apps/api && npx vitest run src/modules/store/store-address.schema.test.ts`
Expected: FAIL — `BulkCreateCellsSchema is not exported`.

- [ ] **Step 3: Sxemani yoz**

`store-address.schema.ts` oxiriga qo'sh:

```ts
// ---- Ommaviy yaratish (diapazon generatori) ----

/** Bitta shablon o'zgaruvchisi. Yoyish qoidalari — `cell-range.util.ts`. */
const rangeVariable = z.discriminatedUnion('kind', [
  z.object({
    key: z.string().trim().min(1).max(40),
    kind: z.literal('number'),
    from: z.coerce.number().int().min(0),
    to: z.coerce.number().int().min(0),
    pad: z.coerce.number().int().min(0).max(6).optional(),
  }),
  z.object({
    key: z.string().trim().min(1).max(40),
    kind: z.literal('letter'),
    from: z.string().trim().length(1),
    to: z.string().trim().length(1),
  }),
]);

export const BulkCreateCellsSchema = z.object({
  template: z.string().trim().min(1, 'Shablon boʻsh boʻlmasligi kerak').max(255),
  // 6 tadan ortiq o'zgaruvchi amalda uchramaydi va dekart ko'paytmasini
  // portlatadi — chegara qo'yiladi (yoyish o'zi ham 5000 da to'xtaydi).
  variables: z.array(rangeVariable).min(1).max(6),
  zoneFrom: z.string().trim().min(1).max(40).nullable(),
  /** true ⇒ hech narsa yozilmaydi, faqat sanoq qaytadi. */
  dryRun: z.boolean().default(false),
});
export type BulkCreateCellsInput = z.infer<typeof BulkCreateCellsSchema>;
```

- [ ] **Step 4: Testni yugurtir — O'TISHI kerak**

Run: `cd apps/api && npx vitest run src/modules/store/store-address.schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit -p apps/api/tsconfig.json
git add apps/api/src/modules/store/store-address.schema.ts apps/api/src/modules/store/store-address.schema.test.ts
git commit -m "feat(ombor): BulkCreateCellsSchema — diapazon retsepti validatsiyasi"
```

---

### Task 3: Servis + endpoint

**Files:**
- Modify: `apps/api/src/modules/store/store-address.service.ts`
- Modify: `apps/api/src/modules/store/store.controller.ts`

**Interfaces:**
- Consumes: Task 1 `expandCellRange`, `CellRangeError`; Task 2 `BulkCreateCellsSchema`.
- Produces: `StoreAddressService.bulkCreateCells(accountId: string, storeId: string, raw: unknown): Promise<BulkCellsResult>` bilan
  `interface BulkCellsResult { total: number; toCreate: number; existing: number; zonesToCreate: string[]; sample: string[]; created: number; zonesCreated: number }`.
  `dryRun: true` da `created` va `zonesCreated` **0** bo'ladi.

- [ ] **Step 1: Servis metodini yoz**

`store-address.service.ts` — importlarga qo'sh:

```ts
import { type CellRangeSpec, CellRangeError, expandCellRange } from './cell-range.util.js';
import { BulkCreateCellsSchema } from './store-address.schema.js';
```

`createCell` metodidan keyin qo'sh:

```ts
  /**
   * «Diapazon bo'yicha yaratish» — retseptni yoyib, YETISHMAYOTGAN yacheykalarni
   * yaratadi. Mavjud nomlar o'tkazib yuboriladi (idempotent: generator ombor
   * kengayganda qayta ishlatiladi).
   *
   * `dryRun: true` da yozuv qadami o'tkazib yuboriladi, qolgan hamma hisob AYNAN
   * bir xil bajariladi — shuning uchun oldindan ko'rish haqiqiy natijadan farq
   * qila olmaydi.
   */
  async bulkCreateCells(accountId: string, storeId: string, raw: unknown) {
    await this.assertStore(accountId, storeId);
    const input = this.parse(BulkCreateCellsSchema, raw);

    let expanded: ReturnType<typeof expandCellRange>;
    try {
      expanded = expandCellRange(input satisfies CellRangeSpec);
    } catch (e) {
      if (e instanceof CellRangeError) throw new BadRequestException(e.message);
      throw e;
    }

    const names = expanded.map((c) => c.name);
    const existingRows = await this.prisma.client.storeCell.findMany({
      where: { accountId, storeId, name: { in: names } },
      select: { name: true },
    });
    const existing = new Set(existingRows.map((r) => r.name));
    const missing = expanded.filter((c) => !existing.has(c.name));

    const neededZones = [...new Set(missing.map((c) => c.zoneName).filter((z): z is string => !!z))];
    const existingZones = await this.prisma.client.storeZone.findMany({
      where: { accountId, storeId, name: { in: neededZones } },
      select: { name: true },
    });
    const haveZone = new Set(existingZones.map((z) => z.name));
    const zonesToCreate = neededZones.filter((z) => !haveZone.has(z));

    const base = {
      total: expanded.length,
      toCreate: missing.length,
      existing: existing.size,
      zonesToCreate,
      sample: missing.slice(0, 10).map((c) => c.name),
    };
    if (input.dryRun) return { ...base, created: 0, zonesCreated: 0 };

    return this.prisma.client.$transaction(async (tx) => {
      // Zonalar: `createZone()` bu yerda ISHLATILMAYDI — u `this.prisma.client`
      // ga bog'langan (tranzaksiyaga moslashmagan), ya'ni uni chaqirish zonalarni
      // tranzaksiyadan tashqarida yozardi va yaratish yiqilganda yetim qoldirardi.
      if (zonesToCreate.length > 0) {
        await tx.storeZone.createMany({
          data: zonesToCreate.map((name) => ({ accountId, storeId, name })),
          skipDuplicates: true,
        });
      }
      const zoneRows = await tx.storeZone.findMany({
        where: { accountId, storeId, name: { in: neededZones } },
        select: { id: true, name: true },
      });
      const zoneIdByName = new Map(zoneRows.map((z) => [z.name, z.id]));

      const res = await tx.storeCell.createMany({
        data: missing.map((c) => ({
          accountId,
          storeId,
          name: c.name,
          zoneId: c.zoneName ? (zoneIdByName.get(c.zoneName) ?? null) : null,
        })),
        // Parallel sessiya o'sha nomni yaratib qo'ysa ham yiqilmaymiz —
        // DB darajasidagi @@unique([storeId, name]) ga tayanamiz.
        skipDuplicates: true,
      });

      return { ...base, created: res.count, zonesCreated: zonesToCreate.length };
    });
  }
```

- [ ] **Step 2: Endpointni qo'sh**

`store.controller.ts` — `createCell` handleridan keyin:

```ts
  /** «Diapazon bo'yicha yaratish» — dryRun:true faqat sanoq qaytaradi. */
  @Post(':id/cells/bulk')
  @RequirePermission({ entity: 'store', action: 'update' })
  async bulkCreateCells(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.addr.bulkCreateCells(user.accountId, id, body);
  }
```

⚠️ Marshrut tartibi: `:id/cells/bulk` `:id/cells` dan **keyin** turishi mumkin (ular turli HTTP yo'llar, to'qnashuv yo'q), lekin `:id/cells/:cellId` **dan oldin** bo'lishi shart — aks holda `bulk` `cellId` deb o'qilardi. `:id/cells/:cellId` `@Patch`/`@Delete` bo'lgani uchun `@Post` bilan to'qnashmaydi; shunga qaramay yuqoriroqqa qo'yiladi.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p apps/api/tsconfig.json`
Expected: 0 xato.

- [ ] **Step 4: Jonli tekshiruv skripti**

`apps/api/zz-range.ts` yarat (commit QILINMAYDI, oxirida o'chiriladi):

```ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module.js';
import { StoreAddressService } from './src/modules/store/store-address.service.js';
import { PrismaService } from './src/prisma/prisma.service.js';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const prisma = app.get(PrismaService).client;
  const addr = app.get(StoreAddressService);
  const store = await prisma.store.findFirst({ select: { id: true, accountId: true } });
  if (!store) throw new Error('ombor yo\'q');
  const spec = {
    template: 'T{a}-{b}',
    variables: [
      { key: 'a', kind: 'number', from: 1, to: 3, pad: 2 },
      { key: 'b', kind: 'letter', from: 'A', to: 'C' },
    ],
    zoneFrom: 'a',
  };
  try {
    const dry = await addr.bulkCreateCells(store.accountId, store.id, { ...spec, dryRun: true });
    console.log('dryRun :', JSON.stringify(dry));
    const real = await addr.bulkCreateCells(store.accountId, store.id, { ...spec, dryRun: false });
    console.log('yaratish:', JSON.stringify(real));
    console.log('  toCreate === created ?', dry.toCreate === real.created ? '✓' : '✗ FARQ BOR');
    const again = await addr.bulkCreateCells(store.accountId, store.id, { ...spec, dryRun: false });
    console.log('qayta   :', JSON.stringify(again));
    console.log('  idempotent ?', again.created === 0 ? '✓' : '✗');
  } finally {
    await prisma.storeCell.deleteMany({ where: { name: { startsWith: 'T0' } } });
    await prisma.storeZone.deleteMany({ where: { name: { in: ['01', '02', '03'] } } });
    console.log('(tozalandi)');
    await app.close();
  }
}
main().catch((e) => { console.log('XATO:', e.message); process.exitCode = 1; });
```

Run: `cd apps/api && node --env-file=../../.env --import ./node_modules/tsx/dist/loader.mjs zz-range.ts`
Expected: `dryRun.toCreate === yaratish.created` (9), qayta yugurtirishda `created: 0`, `zonesCreated: 3`.

- [ ] **Step 5: Skriptni o'chir va commit**

```bash
rm -f apps/api/zz-range.ts
npx tsc --noEmit -p apps/api/tsconfig.json
node scripts/check-lint.mjs
git add apps/api/src/modules/store/store-address.service.ts apps/api/src/modules/store/store.controller.ts
git commit -m "feat(ombor): POST :id/cells/bulk — diapazon bo'yicha ommaviy yaratish + dryRun"
```

---

### Task 4: FE oynasi

**Files:**
- Create: `apps/web/src/components/stores/cell-range-modal.tsx`
- Modify: `apps/web/src/components/stores/address-storage-section.tsx`
- Modify: `apps/web/src/messages/ru.json`, `apps/web/src/messages/uz.json`

**Interfaces:**
- Consumes: Task 3 endpointi `POST /admin/stores/:storeId/cells/bulk` va uning javob shakli.
- Produces: `<CellRangeModal open storeId onClose onCreated />`.

- [ ] **Step 1: i18n kalitlarini qo'sh**

`apps/web/src/messages/uz.json` → `pages.stores.address_storage` obyektiga:

```json
"range_button": "Diapazon bo'yicha",
"range_title": "Yacheykalarni diapazon bo'yicha yaratish",
"range_template": "Shablon",
"range_template_hint": "Har {nom} pastda o'z diapazonini oladi",
"range_kind_number": "raqam",
"range_kind_letter": "harf",
"range_from": "dan",
"range_to": "gacha",
"range_pad": "nol bilan",
"range_zone": "Zona",
"range_zone_none": "zonasiz",
"range_preview": "Oldindan ko'rish",
"range_total": "Jami",
"range_new": "yangi",
"range_existing": "mavjud",
"range_zones_to_create": "Yaratiladigan zonalar",
"range_create": "{count} ta yacheyka yaratish",
"range_nothing": "Yangi yacheyka yo'q",
"range_done": "{created} ta yaratildi, {skipped} ta o'tkazildi"
```

`ru.json` ga xuddi shu kalitlar ruscha qiymat bilan:
`"range_button": "По диапазону"`, `"range_title": "Создание ячеек по диапазону"`,
`"range_template": "Шаблон"`, `"range_template_hint": "Каждый {имя} получит свой диапазон ниже"`,
`"range_kind_number": "число"`, `"range_kind_letter": "буква"`, `"range_from": "от"`,
`"range_to": "до"`, `"range_pad": "нулями"`, `"range_zone": "Зона"`,
`"range_zone_none": "без зоны"`, `"range_preview": "Предпросмотр"`, `"range_total": "Всего"`,
`"range_new": "новых"`, `"range_existing": "существует"`,
`"range_zones_to_create": "Будут созданы зоны"`, `"range_create": "Создать {count} ячеек"`,
`"range_nothing": "Новых ячеек нет"`, `"range_done": "Создано {created}, пропущено {skipped}"`.

- [ ] **Step 2: i18n gate'ni yugurtir**

Run: `pnpm i18n:gate`
Expected: PASS (ru va uz kalitlari mos).

- [ ] **Step 3: Oynani yoz**

`apps/web/src/components/stores/cell-range-modal.tsx`:

```tsx
'use client';

/**
 * «Diapazon bo'yicha yaratish» — shablon + har o'zgaruvchi uchun diapazon.
 *
 * Nomlarni FE hosil QILMAYDI: oldindan ko'rish ham, yaratish ham bitta
 * `POST :id/cells/bulk` endpointiga boradi (`dryRun` farqi bilan), shuning
 * uchun ko'rsatilgan son haqiqiy natijadan ajralib qola olmaydi.
 */

import { api } from '@/lib/api-client';
import { Button, Input, Modal, NativeSelect, useToast } from '@moysklad/ui';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';

interface RangeVar {
  key: string;
  kind: 'number' | 'letter';
  from: string;
  to: string;
  pad: string;
}
interface BulkResult {
  total: number;
  toCreate: number;
  existing: number;
  zonesToCreate: string[];
  sample: string[];
  created: number;
  zonesCreated: number;
}

const PLACEHOLDER = /\{([^{}]+)\}/g;

export function CellRangeModal({
  open,
  storeId,
  onClose,
  onCreated,
}: {
  open: boolean;
  storeId: string;
  onClose(): void;
  onCreated(): void;
}) {
  const t = useTranslations('pages.stores.address_storage');
  const tc = useTranslations('common');
  const { toast } = useToast();

  const [template, setTemplate] = useState('{qator}-{stellaj}-{polka}');
  const [vars, setVars] = useState<Record<string, RangeVar>>({});
  const [zoneFrom, setZoneFrom] = useState<string>('');
  const [preview, setPreview] = useState<BulkResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Shablondagi {nom} lar — tartibi bilan, takrorsiz. */
  const keys = useMemo(() => {
    const out: string[] = [];
    for (const m of template.matchAll(PLACEHOLDER)) if (!out.includes(m[1])) out.push(m[1]);
    return out;
  }, [template]);

  // Yangi {nom} paydo bo'lsa — default diapazon; yo'qolgani o'chadi.
  useEffect(() => {
    setVars((prev) => {
      const next: Record<string, RangeVar> = {};
      for (const k of keys) {
        next[k] = prev[k] ?? { key: k, kind: 'number', from: '1', to: '5', pad: '2' };
      }
      return next;
    });
    setZoneFrom((z) => (keys.includes(z) ? z : ''));
  }, [keys]);

  const payload = useMemo(
    () => ({
      template,
      variables: keys.map((k) => {
        const v = vars[k];
        if (!v) return { key: k, kind: 'number' as const, from: 1, to: 1 };
        return v.kind === 'number'
          ? { key: k, kind: 'number' as const, from: Number(v.from), to: Number(v.to), pad: Number(v.pad) }
          : { key: k, kind: 'letter' as const, from: v.from, to: v.to };
      }),
      zoneFrom: zoneFrom || null,
    }),
    [template, keys, vars, zoneFrom],
  );

  // Oldindan ko'rish — 400ms debounce (har harfda so'rov ketmasin).
  useEffect(() => {
    if (!open || keys.length === 0) {
      setPreview(null);
      return;
    }
    const id = setTimeout(() => {
      api
        .post<BulkResult>(`/admin/stores/${storeId}/cells/bulk`, { ...payload, dryRun: true })
        .then((r) => {
          setPreview(r);
          setError(null);
        })
        .catch((e: Error) => {
          setPreview(null);
          setError(e.message);
        });
    }, 400);
    return () => clearTimeout(id);
  }, [open, storeId, payload, keys.length]);

  const createMut = useMutation({
    mutationFn: () =>
      api.post<BulkResult>(`/admin/stores/${storeId}/cells/bulk`, { ...payload, dryRun: false }),
    onSuccess: (r) => {
      toast.success(t('range_done', { created: r.created, skipped: r.existing }));
      onCreated();
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  const setVar = (k: string, patch: Partial<RangeVar>) =>
    setVars((p) => ({ ...p, [k]: { ...p[k], ...patch } }));

  return (
    <Modal open={open} onOpenChange={(v) => !v && onClose()} title={t('range_title')} widthClass="w-[560px]">
      <div className="space-y-4 p-1">
        <label className="block font-medium text-[var(--ms-text-secondary)] text-sm">
          {t('range_template')}
          <Input
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            className="mt-1"
            data-test-id="range-template"
          />
          <span className="mt-1 block text-[var(--ms-text-muted)] text-xs">
            {t('range_template_hint')}
          </span>
        </label>

        <div className="space-y-2">
          {keys.map((k) => {
            const v = vars[k];
            if (!v) return null;
            return (
              <div
                key={k}
                className="flex flex-wrap items-center gap-2 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] p-2"
              >
                <span className="w-24 shrink-0 font-medium text-sm">{k}</span>
                <NativeSelect
                  value={v.kind}
                  onChange={(e) => setVar(k, { kind: e.target.value as 'number' | 'letter' })}
                  selectClassName="h-7 text-[12px]"
                  data-test-id={`range-kind-${k}`}
                >
                  <option value="number">{t('range_kind_number')}</option>
                  <option value="letter">{t('range_kind_letter')}</option>
                </NativeSelect>
                <Input
                  value={v.from}
                  onChange={(e) => setVar(k, { from: e.target.value })}
                  className="h-7 w-16"
                  aria-label={t('range_from')}
                  data-test-id={`range-from-${k}`}
                />
                <span className="text-[var(--ms-text-muted)]">–</span>
                <Input
                  value={v.to}
                  onChange={(e) => setVar(k, { to: e.target.value })}
                  className="h-7 w-16"
                  aria-label={t('range_to')}
                  data-test-id={`range-to-${k}`}
                />
                {v.kind === 'number' && (
                  <>
                    <span className="text-[var(--ms-text-muted)] text-xs">{t('range_pad')}</span>
                    <Input
                      value={v.pad}
                      onChange={(e) => setVar(k, { pad: e.target.value })}
                      className="h-7 w-12"
                      aria-label={t('range_pad')}
                      data-test-id={`range-pad-${k}`}
                    />
                  </>
                )}
              </div>
            );
          })}
        </div>

        <label className="block font-medium text-[var(--ms-text-secondary)] text-sm">
          {t('range_zone')}
          <NativeSelect
            value={zoneFrom}
            onChange={(e) => setZoneFrom(e.target.value)}
            className="mt-1"
            data-test-id="range-zone"
          >
            <option value="">{t('range_zone_none')}</option>
            {keys.map((k) => (
              <option key={k} value={k}>
                {`{${k}}`}
              </option>
            ))}
          </NativeSelect>
        </label>

        <div className="rounded-[var(--ms-radius-default)] bg-[var(--ms-bg-app)] p-2 text-sm">
          <div className="mb-1 font-medium">{t('range_preview')}</div>
          {error ? (
            <p className="text-[var(--ms-text-destructive)] text-xs" data-test-id="range-error">
              {error}
            </p>
          ) : preview ? (
            <>
              <p data-test-id="range-counts">
                {t('range_total')}: {preview.total} · {preview.toCreate} {t('range_new')} ·{' '}
                {preview.existing} {t('range_existing')}
              </p>
              <p className="mt-1 text-[var(--ms-text-muted)] text-xs">{preview.sample.join(', ')}</p>
              {preview.zonesToCreate.length > 0 && (
                <p className="mt-1 text-[var(--ms-text-muted)] text-xs">
                  {t('range_zones_to_create')}: {preview.zonesToCreate.join(', ')}
                </p>
              )}
            </>
          ) : (
            <p className="text-[var(--ms-text-muted)] text-xs">…</p>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {tc('cancel')}
          </Button>
          <Button
            onClick={() => createMut.mutate()}
            loading={createMut.isPending}
            disabled={!preview || preview.toCreate === 0}
            data-test-id="range-create"
          >
            {preview && preview.toCreate > 0
              ? t('range_create', { count: preview.toCreate })
              : t('range_nothing')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 4: Bo'limga ulash**

`address-storage-section.tsx`:

1. Importlarga: `import { CellRangeModal } from '@/components/stores/cell-range-modal';`
2. `const [editing, setEditing] = useState<string | null>(null);` yoniga:
   `const [rangeOpen, setRangeOpen] = useState(false);`
3. Yacheyka jadvali ostidagi `<PlusAddButton label={t('add_cell')} … testId="add-cell" />` ni
   shu bilan o'ra (server rejimida ikkinchi tugma chiqadi):

```tsx
<div className="flex items-center gap-4">
  <PlusAddButton
    label={t('add_cell')}
    onClick={() => setEditing('new-cell')}
    testId="add-cell"
  />
  {serverMode && storeId && (
    <PlusAddButton
      label={t('range_button')}
      onClick={() => setRangeOpen(true)}
      testId="add-cell-range"
    />
  )}
</div>
```

4. `CellLabelPrintOverlay` yonига:

```tsx
{serverMode && storeId && (
  <CellRangeModal
    open={rangeOpen}
    storeId={storeId}
    onClose={() => setRangeOpen(false)}
    onCreated={invalidate}
  />
)}
```

- [ ] **Step 5: Typecheck + guard'lar**

```bash
npx tsc --noEmit -p apps/web/tsconfig.json
cd apps/web && npx vitest run src/__tests__/raw-element-conventions.test.ts src/__tests__/i18n-key-existence.test.ts src/__tests__/i18n-no-hardcoded.test.ts
```
Expected: hammasi PASS. Agar `raw-element-conventions` yiqilsa — oynada xom `<select>`/`<input>` qolgan, DS primitivига o'tkaz.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/stores/cell-range-modal.tsx apps/web/src/components/stores/address-storage-section.tsx apps/web/src/messages/ru.json apps/web/src/messages/uz.json
git commit -m "feat(ombor): diapazon-generatori oynasi — shablon, oldindan ko'rish, zona"
```

---

### Task 5: Uchidan-uchiga tekshiruv va yakuniy gate'lar

**Files:** kod o'zgarmaydi — faqat tekshiruv.

**Interfaces:**
- Consumes: Task 1–4 hammasi.
- Produces: hech nima (verifikatsiya taski).

- [ ] **Step 1: To'liq api suite**

Run: `cd apps/api && npx vitest run`
Expected: 0 fail. Yangi testlar bilan jami oldingi sondan **+24** atrofida oshadi.

- [ ] **Step 2: To'liq web suite**

Run: `cd apps/web && npx vitest run`
Expected: `label-grounding.test.ts` (25 fail, #35 bo'yicha ma'lum qarz) dan **boshqa** yiqilish bo'lmasin.

- [ ] **Step 3: Gate'lar**

```bash
npx tsc --noEmit -p apps/api/tsconfig.json
npx tsc --noEmit -p apps/web/tsconfig.json
node scripts/check-lint.mjs
node scripts/check-guards.mjs
```
Expected: typecheck 0, lint gate `0 errors`, guard gate `OK`.

- [ ] **Step 4: HTTP orqali jonli tekshiruv**

API'ni ko'tar (`cd apps/api && npx tsx src/main.ts`), so'ng:

```bash
SP=/tmp && curl -s -X POST http://localhost:4000/api/v1/auth/login \
  -H "content-type: application/json" \
  -d '{"identifier":"admin@demo.local","password":"admin123"}' -o "$SP/l.json"
# tokenni olib, ombor id'sini top, keyin:
#   dryRun:true  → toCreate ni yozib ol
#   dryRun:false → created dryRun.toCreate ga TENG bo'lishi kerak
#   yana dryRun:false → created 0 bo'lishi kerak (idempotent)
```

Yaratilgan test yacheykalarini oxirida o'chir.

- [ ] **Step 5: NEXT.md hand-off yozuvi**

`NEXT.md` ga yangi sana-harf yozuvi qo'sh (band harflarni avval `grep` bilan tekshir):
nima qilingani, o'lchangan dalil (test sonlari), va **«browser-smoke YO'Q»** ochiq belgisi.

- [ ] **Step 6: Yakuniy commit**

```bash
git add NEXT.md
git commit -m "docs(next): yacheyka diapazon-generatori ✅ (Phase-1, browser-smoke yo'q)"
```

---

## Self-Review

**Spec qamrovi** — spec bo'limlari va ularni bajaradigan tasklar:

| Spec bo'limi | Task |
|---|---|
| Yoyish kontrakti (kind/from/to/pad, tartib, 5000, 255) | Task 1 |
| Zod validatsiyasi | Task 2 |
| `POST :id/cells/bulk`, `dryRun`, zona avtomat yaratish, `skipDuplicates` | Task 3 |
| `createZone` ishlatilmasligi (tranzaksiya) | Task 3, Step 1 izohi |
| FE oyna: shablondan avtomat qatorlar, 400ms debounce, tugmada son | Task 4 |
| i18n ru+uz | Task 4, Step 1–2 |
| Xatolar jadvali | Task 1 (yoyish xatolari) + Task 4 (`range-error` ko'rsatish) |
| Test: `dryRun` = haqiqiy yaratish | Task 3 Step 4 · Task 5 Step 4 |
| Qamrovdan tashqarida (CSV, shtrix-kod, ommaviy o'chirish) | reja ham qamramaydi ✓ |

**Placeholder skani:** «TBD»/«TODO»/«appropriate error handling» yo'q — har qadamda haqiqiy kod bor.

**Tip mosligi:** `BulkCellsResult` maydonlari (`total`, `toCreate`, `existing`, `zonesToCreate`, `sample`, `created`, `zonesCreated`) Task 3 da e'lon qilinib, Task 4 dagi `BulkResult` interfeysi bilan **aynan mos**. `expandCellRange` / `CellRangeError` / `CELL_RANGE_MAX` nomlari Task 1 da e'lon qilinib, Task 2–3 da o'sha nom bilan ishlatiladi. `CellRangeSpec` maydonlari (`template`, `variables`, `zoneFrom`) Zod sxemasi chiqishi bilan mos — shuning uchun Task 3 da `input satisfies CellRangeSpec` ishlaydi (`dryRun` ortiqcha maydon sifatida qoladi, `satisfies` uni to'sib qo'ymaydi).
