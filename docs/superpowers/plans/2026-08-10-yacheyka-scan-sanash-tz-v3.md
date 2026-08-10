# «Scan» va «Sanash» — TZ v3 ni sherset ERP'ga moslash — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ombor kartochkasidagi «Адресное хранение» bo'limining ikki oynasini (`Scan` — yacheyka↔mahsulot bog'lash, `Sanash` — yacheyka qoldig'ini yozish) egasining 2026-08-10 TZ v3 matniga to'liq moslashtirish: bulk sanash **qo'shuvchi** bo'ladi, Scan'da **«chiqarib qo'shish»** qaytariladi va qaror **yacheyka bo'yicha eslab qolinadi**, skanlar **navbatga** tushadi, yacheyka amallari omborchi uchun **`storecell`** ruxsati bilan ochiladi.

**Architecture:** Uch qatlam. (1) **Server** — yangi `storecell` ruxsat obyekti (view/update) yacheyka-ma'lumot endpointlarini `store.update` dan ajratadi; `PUT cells/:cellId/stock` ga `mode: 'set' | 'add'` qo'shiladi, `add` rejimida delta **serverda** hisoblanadi (o'qib-yozish poygasi yo'q) va avto-«Оприходование» faqat qo'shilgan miqdorga yoziladi. (2) **Umumiy FE qatlami** — `useScanQueue` (skanlarni ketma-ket qayta ishlaydigan promise-zanjir) ikkala oynada ishlatiladi. (3) **Ikki oyna** — `cell-scan-bind-modal.tsx` (yacheyka bo'yicha eslab qolinadigan qaror + staged «chiqarish» + nomli tugmalar + beep) va `cell-count-modal.tsx` (bitta qimirlamaydigan son-maydon, qatorda «hozirgi → bo'ladi», saqlashdan oldin butun jadval validatsiyasi).

**Tech Stack:** NestJS/Fastify + Prisma (`apps/api`) · Zod sxemalar · Next.js 15 App Router + React 19 (`apps/web`) · `@moysklad/ui` (Modal/Button/Input/Checkbox) · next-intl (`uz`+`ru`) · Vitest + Testing Library (`happy-dom`, `data-test-id`) · Biome.

---

## Global Constraints

Har vazifaning talablariga quyidagilar **avtomat** kiradi:

- **Model:** Opus (CLAUDE.md §0) — subagentlarga ham `model` uzatilmaydi.
- **Sessiya hajmi:** 1 flagship vazifa (+1 mayda) → commit → sessiya yopiladi. Taqsimot pastda «Sessiya xaritasi» da.
- **Git:** faqat aniq yo'llar bilan `git add <fayl>`; `git add -A` / `git add .` / `commit -a` **TAQIQ** (hook bloklaydi). Commitdan keyin **doim** `git show --stat HEAD` bilan tarkib tekshiriladi (lint-staged begona fayl qo'shishi mumkin).
- **Commit xabari:** commitlint — subject **kichik harf** bilan boshlanadi (`feat(ombor): …`), `MK…`/`T1…` kabi bosh harfli prefiks RAD ETILADI. Ko'p qatorli xabar uchun `git commit -F <fayl>`.
- **i18n:** har yangi matn kaliti **ikkala** faylga (`apps/web/src/messages/uz.json` va `ru.json`) qo'shiladi; komponentda hardcoded matn yo'q, faqat `t('key')`.
- **Testlar:** TDD — avval RED (jonli yugurtirilib, xabari rejaga/hisobotga yoziladi), keyin implementatsiya, keyin GREEN.
- **Mavjud test fayli ustidan `Write` QILMA** — faqat `Edit` (ikki sessiyada testlar jimgina o'chgan).
- **Gate (har commitdan oldin):**
  ```bash
  pnpm typecheck
  pnpm lint:product
  pnpm i18n:gate
  pnpm --filter @moysklad/api exec vitest run
  pnpm --filter @moysklad/web exec vitest run
  ```
- **Halol yorliq:** bu reja **Phase-1** (kod + unit) ishi. Hech bir vazifa «done/production-ready/verified» deb belgilanmaydi — real skaner/telefon bilan tekshiruv **T6** (Phase-2 QA) da. Commit xabarida «browser-smoke YO'Q» ochiq yoziladi.

---

## Mavjud holat ↔ TZ farqi (grounding — 2026-08-10 da o'lchangan)

| TZ bandi | Hozirgi kod | Holat |
|---|---|---|
| §1.1 skanlar ro'yxatga yig'iladi, «Saqlash» yozadi | `pending[]` + `save()` — bor | ✅ |
| §1.1 ✕ qatorni chiqaradi (server chaqirig'isiz) | bor | ✅ |
| §1.3 o'rtada boshqa yacheyka — har qator o'z yacheykasini saqlaydi | `PendingRow.cell` — bor | ✅ |
| §1.2 «chiqarib qo'shish» (almashtirish) | **YO'Q** — 2026-07-21 da olib tashlangan (`cell-scan-bind-modal.tsx:309-316`) | ❌ T4 |
| §1.2 tugmalarda mahsulot NOMI («Olma +2») | tugmalar umumiy matn, nom faqat izohda | ❌ T4 |
| §1.2 qaror **har yacheyka uchun bir marta** | har skanda qayta so'raladi | ❌ T4 |
| §1.4 «Bu mahsulot allaqachon ro'yxatda» (sariq) | staged dublikat yashil «bog'langan» beradi | ❌ T4 |
| §1.5/§3 xatolarda **beep** | Scan oynasida `beep()` umuman chaqirilmaydi | ❌ T4 |
| §3 skanlar **navbatga** tushadi | `resolve()` parallel ishga tushadi — poyga bor | ❌ T3 |
| §2.1 oddiy rejim MUTLAQ + avto-hujjat | `PUT cells/:id/stock` true-up + Enter/Loss — bor | ✅ |
| §2.2.3 bulk **QO'SHILADI** (26+100=126) | bulk ham MUTLAQ yozadi (100 bo'lib qoladi) | ❌ T2+T5 |
| §2.2.2 qatorda «hozirgi: N» | qatorda faqat nom | ❌ T5 |
| §2 «doim bitta son-maydon, joyidan qimirlamaydi» | ikki alohida maydon (oddiy/bulk) o'rin almashadi | ❌ T5 |
| §2.2.4 saqlashdan oldin **hamma qator** tekshiriladi, muammoli yacheyka **aytiladi** | tugma jim `disabled` bo'ladi, sabab aytilmaydi | ❌ T5 |
| §2.2.2 bo'sh qator → umumiy son ishlaydi | qo'shilganda snapshot olinadi, keyin umumiy son o'zgarsa qator eskiradi | ❌ T5 |
| §2.3 son-maydon wedge-guard | `wedgeGuard` — bor | ✅ |
| §3 ruxsat = «omborchi roli yetadi» | `store.update` talab qilinadi; `storekeeper` shablonida faqat `store.view` ⇒ **omborchi oynani umuman ishlata olmaydi** | ❌ T1 |
| §3 chiqarish (unbind) = `store.update` — omborchida YO'Q | endpoint allaqachon `store.update`, lekin UI tugmasi umuman yo'q ⇒ ruxsat darvozasi ham yo'q | ❌ T1+T4 |
| — | ikkala oyna uchun **birorta ham test yo'q** (701 + 931 qator) | ❌ T3–T5 |

**Egasining uch qarori (2026-08-10, shu reja uchun so'ralgan):**
1. Bulk = **QO'SHILADI**, delta **serverda** hisoblanadi.
2. «Chiqarib qo'shish» **qaytariladi** (2026-07-21 qarorining bekor qilinishi — ataylab).
3. Ruxsat = yangi **`storecell`** obyekti (`store.update` kengaytirilmaydi).

---

## Fayl xaritasi

**Server (`apps/api`)**

| Fayl | Mas'uliyat / o'zgarish |
|---|---|
| `src/modules/store/store.controller.ts` | **5** yacheyka-ma'lumot marshruti `store` → `storecell`; `DELETE …/products/:productId` (chiqarish) ataylab `store.update` da **qoladi** (TZ §3) |
| `src/modules/permissions/permissions.types.ts` | `PermissionEntity` union + `PERMISSION_ENTITIES` runtime ro'yxatiga `'storecell'` |
| `src/modules/permissions/permissions.service.ts` | seed matritsasi ro'yxatiga `'storecell'` |
| `src/modules/permissions/permissions.controller.ts` | UI `ENTITIES` ro'yxatiga `'storecell'` |
| `src/modules/permissions/roles.controller.ts` | rol matritsasi ro'yxatiga `'storecell'` |
| `src/modules/permissions/role-templates.ts` | `storekeeper` + `warehouse_manager` shablonlariga `storecell` grantlari |
| `src/modules/store/store-address.schema.ts` | `SetCellStockSchema` ga `mode: 'set' \| 'add'` |
| `src/modules/store/store-address.service.ts` | `setCellStock` — `add` rejimida delta = kiritilgan son, yakuniy qiymat = eski + kiritilgan |
| `src/modules/store/store-cell-permission.test.ts` | **YANGI** — controller metadata + rol shabloni qulfi |
| `src/modules/store/store-address-count-mode.behaviour.test.ts` | **YANGI** — `set` vs `add` semantikasi + hujjat miqdori |

**Frontend (`apps/web`)**

| Fayl | Mas'uliyat / o'zgarish |
|---|---|
| `src/components/stores/use-scan-queue.ts` | **YANGI** — skan navbati (promise-zanjir), ikkala oyna uchun |
| `src/components/stores/use-scan-queue.test.ts` | **YANGI** — ketma-ketlik qulfi |
| `src/components/stores/cell-scan-bind-modal.tsx` | yacheyka-qarori xotirasi, staged «chiqarish», nomli tugmalar, sariq «ro'yxatda bor», beep, navbat |
| `src/components/stores/cell-scan-bind-modal.test.tsx` | **YANGI** — 5 xulq testi |
| `src/components/stores/cell-count-modal.tsx` | bitta barqaror son-maydon, `mode:'add'` bulk, qatorda «hozirgi → bo'ladi», to'liq validatsiya, navbat |
| `src/components/stores/cell-count-modal.test.tsx` | **YANGI** — 5 xulq testi |
| `src/messages/uz.json`, `src/messages/ru.json` | 7 yangi kalit + 1 kalit matni yangilanadi |

**Hujjat**

| Fayl | O'zgarish |
|---|---|
| `docs/superpowers/specs/2026-08-10-yacheyka-scan-sanash-tz-v3.md` | **YANGI** — egasining TZ matni repo'ga (T6) |
| `NEXT.md` | hand-off qatorlari (har sessiya oxirida) |

---

## Sessiya xaritasi (CLAUDE.md §0.3 — 1 flagship / sessiya)

| Sessiya | Vazifalar | Nega birga |
|---|---|---|
| S1 | **T1 + T2** | ikkalasi ham server, bitta gate, bitta migratsiyasiz commit |
| S2 | **T3 + T4** | navbat Scan oynasida darhol ishlatiladi |
| S3 | **T5** | eng katta UI qayta-qurilishi — yolg'iz |
| S4 | **T6** | TZ hujjati + real skaner Phase-2 QA (egasi bilan) |

---

## Task 1: `storecell` ruxsat obyekti — omborchi yacheyka amallarini ochadi

**Files:**
- Modify: `apps/api/src/modules/permissions/permissions.types.ts` (union ~40-qator, `PERMISSION_ENTITIES` ~170-qator)
- Modify: `apps/api/src/modules/permissions/permissions.service.ts:267` atrofidagi ro'yxat
- Modify: `apps/api/src/modules/permissions/permissions.controller.ts:21` atrofidagi `ENTITIES`
- Modify: `apps/api/src/modules/permissions/roles.controller.ts:243` atrofidagi ro'yxat
- Modify: `apps/api/src/modules/permissions/role-templates.ts` (`storekeeper` ~358-380, `warehouse_manager` ~266-290)
- Modify: `apps/api/src/modules/store/store.controller.ts:155-225`
- Test: `apps/api/src/modules/store/store-cell-permission.test.ts` (yangi)

**Interfaces:**
- Consumes: `PERMISSION_META`, `RequiredPermission` (`permissions/require-permission.decorator.ts`), `resolveTemplateMatrix(slug)` (`permissions/role-templates.ts`).
- Produces: `PermissionEntity` unioniga `'storecell'` qiymati — T2 va keyingi hamma yacheyka endpointi shuni ishlatadi.

**⚠️ Ikki tuzoq (xotiradan, qayta bosilmasin):**
1. `PermissionEntity` union **izohida nuqtali vergul (`;`) YOZMA** — `permissions-seed-sync.test.ts` unionni birinchi `;` gacha o'qiydi, aks holda slug'lar jimgina tushib qoladi.
2. Yangi entity DB'da **avtomatik paydo bo'lmaydi** — eski seed qilingan bazada qatorlar yo'q (administrator ham 403 oladi). Bu **ops-qadam**, T1 oxirida yozilgan.

- [ ] **Step 1: RED testni yoz**

`apps/api/src/modules/store/store-cell-permission.test.ts`:

```ts
import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import {
  PERMISSION_META,
  type RequiredPermission,
} from '../permissions/require-permission.decorator.js';
import { resolveTemplateMatrix } from '../permissions/role-templates.js';
import { StoreController } from './store.controller.js';

/**
 * TZ v3 §3 — «bog'lash/sanash = storecell (omborchi roli yetadi)».
 *
 * Muammo (2026-08-10 da o'lchandi): yacheyka amallari `store.update` talab
 * qilardi, `storekeeper` shablonida esa faqat `store.view` bor edi ⇒ omborchi
 * «Scan»/«Sanash» oynalarini umuman ishlata olmasdi, ammo hech narsa
 * yiqilmasdi (403 faqat jonli klikda ko'rinardi).
 *
 * Bu test ikki tomonni birga qulflaydi: (a) marshrutlar AYNAN `storecell`
 * talab qiladi, (b) omborchi shablonida shu ruxsat bor va (c) ombor
 * kartochkasining O'ZINI tahrirlash omborchiga ochilmagan.
 */
function permOf(method: keyof StoreController): RequiredPermission | undefined {
  const handler = (StoreController.prototype as Record<string, unknown>)[method as string];
  return Reflect.getMetadata(PERMISSION_META, handler as object) as RequiredPermission | undefined;
}

const scopeOf = (slug: 'storekeeper' | 'warehouse_manager', entity: string, action: string) =>
  resolveTemplateMatrix(slug).find((c) => c.entity === entity && c.action === action)?.scope ?? 'NO';

describe('TZ v3 §3 — yacheyka amallari `storecell` ruxsatida', () => {
  const READ: Array<keyof StoreController> = ['cellStock', 'cellProducts'];
  const WRITE: Array<keyof StoreController> = [
    'setCellStock',
    'assignCellProducts',
    'bindCellProductIfEmpty',
  ];

  for (const m of READ) {
    it(`${m} — storecell.view`, () => {
      expect(permOf(m)).toEqual({ entity: 'storecell', action: 'view' });
    });
  }

  for (const m of WRITE) {
    it(`${m} — storecell.update`, () => {
      expect(permOf(m)).toEqual({ entity: 'storecell', action: 'update' });
    });
  }

  it('omborchi yacheyka amallarini bajara oladi', () => {
    expect(scopeOf('storekeeper', 'storecell', 'view')).toBe('ALL');
    expect(scopeOf('storekeeper', 'storecell', 'update')).toBe('ALL');
  });

  it('omborchi ombor KARTOCHKASINI tahrirlay olmaydi (chegara saqlanadi)', () => {
    expect(scopeOf('storekeeper', 'store', 'update')).toBe('NO');
  });

  /**
   * TZ §3 ning ATAYLAB qilingan assimetriyasi: bog'lash/sanash omborchiga
   * ochiq, lekin BOG'LASHNI CHIQARIB TASHLASH (Scan'dagi «chiqarib qo'shish»)
   * — `store.update`, ya'ni omborchida YO'Q. Bu qator o'zgarsa, destruktiv
   * amal jimgina omborchiga ochilib ketadi.
   */
  it('chiqarish (unbind) `store.update` da QOLADI — omborchida yo`q', () => {
    expect(permOf('unassignCellProduct')).toEqual({ entity: 'store', action: 'update' });
    expect(scopeOf('storekeeper', 'store', 'update')).toBe('NO');
  });

  it('ombor menejerida ham storecell bor', () => {
    expect(scopeOf('warehouse_manager', 'storecell', 'update')).toBe('ALL');
  });

  it('zona/yacheyka KONFIGURATSIYASI store.update da qoladi (omborchiga emas)', () => {
    expect(permOf('createZone')).toEqual({ entity: 'store', action: 'update' });
    expect(permOf('updateCell')).toEqual({ entity: 'store', action: 'update' });
  });
});
```

> Eslatma: oxirgi testdagi `updateCell` — `@Patch(':id/cells/:cellId')` metodining nomi. Agar u boshqacha nomlangan bo'lsa (`store.controller.ts:281`), metod nomini o'sha fayldan aynan ko'chir.

- [ ] **Step 2: RED — yiqilishini ko'r**

```bash
pnpm --filter @moysklad/api exec vitest run src/modules/store/store-cell-permission.test.ts
```
Kutilgan: **FAIL** — `expected { entity: 'store', action: 'view' } to equal { entity: 'storecell', … }` va `scopeOf('storekeeper','storecell','view')` = `'NO'`.

- [ ] **Step 3: `storecell` ni ruxsat modeliga qo'sh**

`permissions.types.ts` — unionda `| 'store'` dan keyin (izohsiz, `;` xavfi yo'q):

```ts
  | 'store'
  | 'storecell'
```

O'sha faylning `PERMISSION_ENTITIES` runtime ro'yxatida ham `'store',` dan keyin:

```ts
  'store',
  'storecell',
```

Xuddi shu qo'shimchani yana uch joyga (har birida `'store',` dan keyin):
`permissions.service.ts` seed ro'yxati · `permissions.controller.ts` `ENTITIES` · `roles.controller.ts` ro'yxati.

- [ ] **Step 4: rol shablonlariga grant qo'sh**

`role-templates.ts` — `storekeeper.grants` ichida `grant(['store'], { view: 'ALL' }),` qatoridan keyin:

```ts
      grant(['store'], { view: 'ALL' }),
      // TZ v3 §3: yacheyka amallari (bog'lash/sanash) omborchining asosiy ishi —
      // ombor kartochkasini tahrirlash huquqini bermasdan ochiladi.
      grant(['storecell'], { view: 'ALL', update: 'ALL' }),
```

`warehouse_manager.grants` ichida `grant(['store', 'cashdesk'], { view: 'ALL' }),` dan keyin:

```ts
      grant(['storecell'], { view: 'ALL', update: 'ALL' }),
```

- [ ] **Step 5: controller marshrutlarini o'tkaz**

`store.controller.ts` — quyidagi olti dekoratorni almashtir (qolganlari **tegilmaydi**):

```ts
  @Get(':id/cells/:cellId/stock')
  @RequirePermission({ entity: 'storecell', action: 'view' })
  …
  @Put(':id/cells/:cellId/stock')
  @RequirePermission({ entity: 'storecell', action: 'update' })
  …
  @Get(':id/cells/:cellId/products')
  @RequirePermission({ entity: 'storecell', action: 'view' })
  …
  @Post(':id/cells/:cellId/products')
  @RequirePermission({ entity: 'storecell', action: 'update' })
  …
  @Post(':id/cells/:cellId/products/:productId/bind-if-empty')
  @RequirePermission({ entity: 'storecell', action: 'update' })
```

**`@Delete(':id/cells/:cellId/products/:productId')` TEGILMAYDI** — TZ §3 bo'yicha
bog'lashni chiqarib tashlash `store.update` da qoladi (destruktiv amal omborchiga
ochilmaydi). Ya'ni beshta marshrut ko'chadi, oltinchisi ataylab joyida qoladi.

- [ ] **Step 6: GREEN + qo'shni qulflar**

```bash
pnpm --filter @moysklad/api exec vitest run src/modules/store/store-cell-permission.test.ts
pnpm --filter @moysklad/api exec vitest run src/modules/permissions
pnpm --filter @moysklad/api exec vitest run src/app-boot.test.ts
```
Kutilgan: hammasi **PASS**. Agar `permissions-seed-sync.test.ts` yiqilsa — 3-4 ro'yxatdan biri unutilgan.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/permissions/permissions.types.ts \
        apps/api/src/modules/permissions/permissions.service.ts \
        apps/api/src/modules/permissions/permissions.controller.ts \
        apps/api/src/modules/permissions/roles.controller.ts \
        apps/api/src/modules/permissions/role-templates.ts \
        apps/api/src/modules/store/store.controller.ts \
        apps/api/src/modules/store/store-cell-permission.test.ts
git commit -m "feat(ombor): yacheyka amallari uchun storecell ruxsati (omborchi roli yetadi)"
git show --stat HEAD
```

- [ ] **Step 8: OPS-qadam (kod emas — hisobotga yoz, egasi bilan yugurtiriladi)**

Yangi entity uchun DB'da ruxsat qatorlari yo'q. Lokal va prodda:

```bash
cd apps/api && npx tsx src/scripts/topup-role-permissions.ts
```
Yugurtirilmaguncha **hech kim** (administrator ham) yacheyka amallarini bajara olmaydi. Buni sessiya hisobotida **ochiq** yoz.

---

## Task 2: `PUT cells/:cellId/stock` — `mode: 'set' | 'add'` (bulk sanash qo'shuvchi bo'ladi)

**Files:**
- Modify: `apps/api/src/modules/store/store-address.schema.ts:79-86`
- Modify: `apps/api/src/modules/store/store-address.service.ts:420-528` (`setCellStock`)
- Test: `apps/api/src/modules/store/store-address-count-mode.behaviour.test.ts` (yangi)

**Interfaces:**
- Consumes: T1 dagi `storecell` ruxsati (marshrut o'zgarmaydi).
- Produces: `PUT /admin/stores/:id/cells/:cellId/stock` tanasi `{ assortmentId, qty, mode? }`; `mode` berilmasa **`'set'`** (mutlaq — eski xulq, oddiy rejim shunda qoladi). Javob: `{ cellId, assortmentId, qty, previousQty, mode, stockDoc }` — `qty` **yakuniy** qoldiq. T5 shu shartnomani ishlatadi.

- [ ] **Step 1: RED testni yoz**

`apps/api/src/modules/store/store-address-count-mode.behaviour.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { StoreAddressService } from './store-address.service.js';

/**
 * TZ v3 §2.1 vs §2.2.3 — sanashning IKKI semantikasi bitta endpointda:
 *
 *   · oddiy rejim (`mode:'set'`, default) — MUTLAQ: yacheyka qoldig'i aynan
 *     kiritilgan songa tenglashtiriladi (inventarizatsiya);
 *   · «Umumiy sanash» (`mode:'add'`) — QO'SHILADI: 26 + 100 = 126, avto-
 *     «Оприходование» AYNAN qo'shilgan miqdorga (100) yoziladi, 126 ga emas.
 *
 * Delta serverda hisoblanadi (FE «hozirgi» ni o'qib mutlaq qiymat yubormaydi) —
 * ikki omborchi bir vaqtda sanaganda yo'qolgan-yangilanish bo'lmasin.
 */
interface Captured {
  enters: Array<{ quantity: string; cellId: string | undefined }>;
  losses: Array<{ quantity: string; cellId: string | undefined }>;
}

function makeService(currentQty: number | null) {
  const captured: Captured = { enters: [], losses: [] };
  const client = {
    store: { findFirst: vi.fn(async () => ({ id: 'store-1' })) },
    storeCell: { findFirst: vi.fn(async () => ({ id: 'cell-1', name: '01-01-01-01' })) },
    product: { findFirst: vi.fn(async () => ({ id: 'prod-1', buyPrice: 1000n })) },
    organization: { findFirst: vi.fn(async () => ({ id: 'org-1' })) },
    stockByCell: {
      findFirst: vi.fn(async () => (currentQty === null ? null : { qty: currentQty })),
      upsert: vi.fn(async () => undefined),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
  };
  const enters = {
    create: vi.fn(async (_a: string, _u: string, doc: { positions: Array<Record<string, unknown>> }) => {
      const p = doc.positions[0] as { quantity: string; cellId?: string };
      captured.enters.push({ quantity: p.quantity, cellId: p.cellId });
      return { name: 'ENT-1' };
    }),
  };
  const losses = {
    create: vi.fn(async (_a: string, _u: string, doc: { positions: Array<Record<string, unknown>> }) => {
      const p = doc.positions[0] as { quantity: string; cellId?: string };
      captured.losses.push({ quantity: p.quantity, cellId: p.cellId });
      return { name: 'LOS-1' };
    }),
  };
  const svc = new StoreAddressService(
    { client } as never,
    enters as never,
    losses as never,
  );
  return { svc, captured, client };
}

const CALL = { assortmentId: '11111111-1111-4111-8111-111111111111' };

describe('setCellStock — sanash semantikasi', () => {
  it('mode berilmasa MUTLAQ yozadi (eski xulq saqlanadi)', async () => {
    const { svc, captured } = makeService(26);
    const res = await svc.setCellStock('acc-1', 'store-1', 'cell-1', { ...CALL, qty: '100' }, 'user-1');
    // 26 → 100: farq 74 ta kirim
    expect(captured.enters).toEqual([{ quantity: '74', cellId: 'cell-1' }]);
    expect(res.qty).toBe('100');
    expect(res.previousQty).toBe('26');
  });

  it("mode:'add' — QO'SHADI va hujjat AYNAN qo'shilgan miqdorga yoziladi", async () => {
    const { svc, captured } = makeService(26);
    const res = await svc.setCellStock(
      'acc-1',
      'store-1',
      'cell-1',
      { ...CALL, qty: '100', mode: 'add' },
      'user-1',
    );
    expect(captured.enters).toEqual([{ quantity: '100', cellId: 'cell-1' }]);
    expect(res.qty).toBe('126');
    expect(res.previousQty).toBe('26');
  });

  it("mode:'add' bo'sh yacheykada ham ishlaydi (0 + 100 = 100)", async () => {
    const { svc, captured } = makeService(null);
    const res = await svc.setCellStock(
      'acc-1',
      'store-1',
      'cell-1',
      { ...CALL, qty: '100', mode: 'add' },
      'user-1',
    );
    expect(captured.enters).toEqual([{ quantity: '100', cellId: 'cell-1' }]);
    expect(res.qty).toBe('100');
  });

  it("mode:'set' kamaytirsa Списание yoziladi (kirim emas)", async () => {
    const { svc, captured } = makeService(26);
    await svc.setCellStock('acc-1', 'store-1', 'cell-1', { ...CALL, qty: '10' }, 'user-1');
    expect(captured.losses).toEqual([{ quantity: '16', cellId: 'cell-1' }]);
    expect(captured.enters).toEqual([]);
  });

  it("mode:'add' + qty 0 — hech qanday hujjat yozilmaydi", async () => {
    const { svc, captured } = makeService(26);
    const res = await svc.setCellStock(
      'acc-1',
      'store-1',
      'cell-1',
      { ...CALL, qty: '0', mode: 'add' },
      'user-1',
    );
    expect(captured.enters).toEqual([]);
    expect(captured.losses).toEqual([]);
    expect(res.qty).toBe('26');
  });
});
```

- [ ] **Step 2: RED — yiqilishini ko'r**

```bash
pnpm --filter @moysklad/api exec vitest run src/modules/store/store-address-count-mode.behaviour.test.ts
```
Kutilgan: `mode:'add'` testlari **FAIL** (`expected '126' to be '100'`-tipidagi xabar) va `previousQty` — `undefined`.

- [ ] **Step 3: sxemaga `mode` qo'sh**

`store-address.schema.ts`:

```ts
export const SetCellStockSchema = z.object({
  assortmentId: uuid,
  qty: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,6})?$/, 'qty must be a non-negative decimal (≤6 dp)'),
  /**
   * TZ v3: `set` (default) — sanoq MUTLAQ, yacheyka qoldig'i aynan `qty` ga
   * tenglashadi (oddiy rejim / inventarizatsiya). `add` — «Umumiy sanash»:
   * `qty` mavjud qoldiqqa QO'SHILADI va avto-hujjat aynan `qty` ga yoziladi.
   * Default ataylab `set` — eski chaqiruvchilar xulqi o'zgarmaydi.
   */
  mode: z.enum(['set', 'add']).default('set'),
});
```

- [ ] **Step 4: servisda delta hisobini ikki rejimga bo'l**

`store-address.service.ts` → `setCellStock` ichida, `const { assortmentId, qty } = …` qatorini almashtir:

```ts
    const { assortmentId, qty, mode } = this.parse(SetCellStockSchema, raw);
```

`oldQty`/`delta` bloki:

```ts
    const oldQty = Number(before?.qty ?? 0);
    // TZ v3: `add` — kiritilgan son AYNAN delta (qo'shiladi); `set` — mutlaq
    // sanoq, delta = farq. Yakuniy qoldiq ikkalasida ham `finalQty`.
    const delta = mode === 'add' ? Number(qty) : Number(qty) - oldQty;
    const finalQty = oldQty + delta;
```

Degenerat (hujjatsiz) yo'lda `Number(qty)` ni `finalQty` ga almashtir:

```ts
      if (finalQty === 0) {
        await this.prisma.client.stockByCell.deleteMany({ … });
      } else {
        await this.prisma.client.stockByCell.upsert({
          where: { … },
          create: { accountId, storeId, cellId, assortmentKind: 'product', assortmentId, qty: String(finalQty) },
          update: { qty: String(finalQty) },
        });
      }
```

Qaytish qiymati:

```ts
    return {
      cellId,
      assortmentId,
      qty: String(finalQty),
      previousQty: String(oldQty),
      mode,
      stockDoc,
    };
```

`delta > 0` / `delta < 0` shoxlari **o'zgarmaydi** — ular allaqachon `delta` bilan ishlaydi, ya'ni `add` rejimida hujjat aynan qo'shilgan miqdorga yoziladi.

- [ ] **Step 5: GREEN**

```bash
pnpm --filter @moysklad/api exec vitest run src/modules/store
```
Kutilgan: yangi fayl **PASS**, mavjud `store-address-*.behaviour.test.ts` va `store-address.schema.test.ts` ham yashil.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/store/store-address.schema.ts \
        apps/api/src/modules/store/store-address.service.ts \
        apps/api/src/modules/store/store-address-count-mode.behaviour.test.ts
git commit -m "feat(ombor): sanash endpointiga add rejimi (umumiy sanash qo'shadi)"
git show --stat HEAD
```

---

## Task 3: `useScanQueue` — skanlar ketma-ket qayta ishlanadi

**Files:**
- Create: `apps/web/src/components/stores/use-scan-queue.ts`
- Test: `apps/web/src/components/stores/use-scan-queue.test.ts`

**Interfaces:**
- Produces: `useScanQueue(handler: (code: string) => Promise<void> | void): (code: string) => Promise<void>` — qaytgan `enqueue` funksiyasi barqaror (`useCallback` bilan, `[]` bog'liqlik), ya'ni kamera hook'ini qayta ishga tushirmaydi. T4 va T5 shuni `resolve` o'rniga chaqiradi.

- [ ] **Step 1: RED testni yoz**

`apps/web/src/components/stores/use-scan-queue.test.ts`:

```ts
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useScanQueue } from './use-scan-queue';

/**
 * TZ v3 §3: «Tez ketma-ket skanlar navbatga tushadi va TARTIBDA qayta
 * ishlanadi — birortasi yo'qolmaydi.»
 *
 * Bugungi kod har skanni darhol `void resolve(code)` bilan uchiradi: ikki
 * skan orasida `await api.get(...)` bor, ya'ni ikkinchi skan birinchisining
 * o'rtasida holatni o'qiydi (eskirgan `pending`/`cell` bilan) va natija skan
 * tartibiga bog'liq bo'lmay qoladi. Bu test navbatni qulflaydi.
 */
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('useScanQueue', () => {
  it('ikkinchi skan birinchisi tugamaguncha BOSHLANMAYDI', async () => {
    const started: string[] = [];
    const finished: string[] = [];
    const gates = new Map<string, ReturnType<typeof deferred>>();

    const { result } = renderHook(() =>
      useScanQueue(async (code: string) => {
        started.push(code);
        const g = deferred();
        gates.set(code, g);
        await g.promise;
        finished.push(code);
      }),
    );

    act(() => {
      void result.current('A');
      void result.current('B');
    });

    expect(started).toEqual(['A']); // B hali navbatda

    await act(async () => {
      gates.get('A')?.resolve();
      await Promise.resolve();
    });

    expect(started).toEqual(['A', 'B']);
    expect(finished).toEqual(['A']);

    await act(async () => {
      gates.get('B')?.resolve();
      await Promise.resolve();
    });

    expect(finished).toEqual(['A', 'B']);
  });

  it('bir skan yiqilsa navbat TO`XTAMAYDI (keyingisi baribir ishlaydi)', async () => {
    const done: string[] = [];
    const { result } = renderHook(() =>
      useScanQueue(async (code: string) => {
        if (code === 'BAD') throw new Error('resolve failed');
        done.push(code);
      }),
    );

    await act(async () => {
      void result.current('BAD');
      await result.current('GOOD');
    });

    expect(done).toEqual(['GOOD']);
  });

  it('enqueue havolasi qayta render`da O`ZGARMAYDI (kamera qayta ishga tushmaydi)', () => {
    const { result, rerender } = renderHook(({ n }) => useScanQueue(async () => void n), {
      initialProps: { n: 1 },
    });
    const first = result.current;
    rerender({ n: 2 });
    expect(result.current).toBe(first);
  });
});
```

- [ ] **Step 2: RED — yiqilishini ko'r**

```bash
pnpm --filter @moysklad/web exec vitest run src/components/stores/use-scan-queue.test.ts
```
Kutilgan: **FAIL** — `Cannot find module './use-scan-queue'`.

- [ ] **Step 3: hookni yoz**

`apps/web/src/components/stores/use-scan-queue.ts`:

```ts
'use client';

/**
 * useScanQueue — skanlarni KETMA-KET qayta ishlaydigan navbat (TZ v3 §3).
 *
 * Skaner tugmasi bosib turilganda kodlar 100ms oralig'ida keladi, har biri
 * esa `await api.get(...)` qiladi. Navbatsiz ikkinchi skan birinchisining
 * o'rtasida ishga tushadi va eskirgan holatni (staged ro'yxat, joriy
 * yacheyka) o'qiydi — natija skan tartibiga bog'liq bo'lmay qoladi.
 *
 * Navbat — oddiy promise-zanjir: har chaqiruv oldingisi tugagach boshlanadi.
 * Bir skanning xatosi zanjirni UZMAYDI (`.catch` bilan yutiladi) — keyingi
 * skan baribir ishlanadi va o'z xabarini o'zi ko'rsatadi.
 */

import { useCallback, useEffect, useRef } from 'react';

export function useScanQueue(handler: (code: string) => Promise<void> | void) {
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  const chainRef = useRef<Promise<void>>(Promise.resolve());

  return useCallback((code: string) => {
    const next = chainRef.current
      .catch(() => undefined)
      .then(() => handlerRef.current(code));
    chainRef.current = next.catch(() => undefined);
    return next;
  }, []);
}
```

- [ ] **Step 4: GREEN**

```bash
pnpm --filter @moysklad/web exec vitest run src/components/stores/use-scan-queue.test.ts
```
Kutilgan: **3 passed**.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/stores/use-scan-queue.ts \
        apps/web/src/components/stores/use-scan-queue.test.ts
git commit -m "feat(ombor): skan navbati hooki (ketma-ket qayta ishlash)"
```

---

## Task 4: «Scan» oynasi — TZ §1 ga to'liq moslash

**Files:**
- Modify: `apps/web/src/components/stores/cell-scan-bind-modal.tsx`
- Modify: `apps/web/src/messages/uz.json`, `apps/web/src/messages/ru.json`
- Test: `apps/web/src/components/stores/cell-scan-bind-modal.test.tsx` (yangi)

**Interfaces:**
- Consumes: `useScanQueue` (T3), `beep` (`@/lib/beep`), `api.post` / `api.delete` (`@/lib/api-client`), `usePermissions()` (`@/hooks/use-permissions` — `matrix` qaytaradi), `storecell` ruxsati (T1).
- Produces: yangi ichki shakl —
  ```ts
  type CellDecision = { mode: 'together' | 'replace'; evict: Array<{ id: string; name: string }> };
  interface PendingRow { key: string; product: { id: string; name: string }; cell: { id: string; name: string } }
  ```
  Qaror **yacheyka bo'yicha** `Map<cellId, CellDecision>` da saqlanadi; chiqarish `evict` ro'yxatidan **bir marta** bajariladi.

- [ ] **Step 1: i18n kalitlarini qo'sh (uz + ru)**

`apps/web/src/messages/uz.json` → `pages.stores.address_storage` ichiga:

```json
      "scan_add_together_named": "«{name}» bilan birga qo'shish",
      "scan_replace_named": "«{name}»ni chiqarib, hozirgisini qo'shish",
      "scan_already_staged": "Bu mahsulot allaqachon ro'yxatda",
```

`apps/web/src/messages/ru.json` → xuddi shu joyga:

```json
      "scan_add_together_named": "Добавить вместе с «{name}»",
      "scan_replace_named": "Убрать «{name}» и добавить текущий",
      "scan_already_staged": "Этот товар уже в списке",
```

Mavjud `scan_replace`, `scan_staged_replace`, `scan_row_replaces` kalitlari **allaqachon bor** — o'chirilmaydi, shu vazifada qayta ishlatiladi.

- [ ] **Step 2: RED testni yoz**

`apps/web/src/components/stores/cell-scan-bind-modal.test.tsx`:

```tsx
import { renderWithProviders, screen, waitFor } from '@/test-utils';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CellScanBindModal } from './cell-scan-bind-modal';

/**
 * TZ v3 §1 — «Scan» oynasi (yacheyka ↔ mahsulot bog'lash).
 *
 * Bu oynada bugungacha BIRORTA test yo'q edi (701 qator). To'rt xulq
 * qulflanadi:
 *   §1.2 band yacheyka tugmalarida mahsulot NOMI turadi;
 *   §1.2 «chiqarib qo'shish» — chiqarish ham faqat «Saqlash» paytida
 *        (avval DELETE, keyin POST);
 *   §1.2 qaror HAR YACHEYKA UCHUN BIR MARTA so'raladi;
 *   §1.4 staged dublikat — sariq «ro'yxatda bor», server chaqirig'i yo'q.
 */
vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));
vi.mock('@/lib/beep', () => ({ beep: vi.fn() }));
vi.mock('@/components/stores/use-barcode-camera', () => ({
  useBarcodeCamera: () => ({
    videoRef: { current: null },
    cameraOn: false,
    cameraError: null,
    diag: null,
    startCamera: vi.fn(),
    stopCamera: vi.fn(),
  }),
}));
// TZ §3: chiqarish huquqi (`store.update`) — default holatda BOR (administrator).
// Step 9 dagi test uni bir holat uchun 'NO' ga tushiradi.
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: vi.fn(() => ({ matrix: { store: { update: 'ALL' } } })),
}));

const { api } = await import('@/lib/api-client');

const CELLS = [
  { id: 'cell-A', name: '01-01-01-01', barcode: 'CELLA' },
  { id: 'cell-B', name: '01-01-01-02', barcode: 'CELLB' },
];

/** `/products?search=…` → bitta aniq mahsulot; cells/:id/products → band tarkib. */
function mockApi({ occupants }: { occupants: Array<{ id: string; name: string }> }) {
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url.startsWith('/products?search=')) {
      const code = decodeURIComponent(url.split('search=')[1]?.split('&')[0] ?? '');
      return {
        items: [{ id: `prod-${code}`, name: `Tovar ${code}`, code, article: null, barcodes: [code], packBarcodes: [] }],
      } as never;
    }
    if (url.includes('/products')) return { items: occupants } as never;
    return { cells: [] } as never;
  });
  vi.mocked(api.post).mockResolvedValue({} as never);
  vi.mocked(api.delete).mockResolvedValue({} as never);
}

function open() {
  renderWithProviders(
    <CellScanBindModal
      open
      onOpenChange={vi.fn()}
      storeId="store-1"
      cells={CELLS}
      initialCell={null}
      onBound={vi.fn()}
    />,
  );
}

async function scan(code: string) {
  const input = screen.getByTestId('cell-scan-input');
  await userEvent.type(input, `${code}{Enter}`);
}

beforeEach(() => {
  vi.mocked(api.get).mockReset();
  vi.mocked(api.post).mockReset();
  vi.mocked(api.delete).mockReset();
});

describe('CellScanBindModal — TZ v3 §1', () => {
  it('§1.2 band yacheyka tugmalarida mavjud mahsulot NOMI turadi', async () => {
    mockApi({ occupants: [{ id: 'prod-old', name: 'Olma' }] });
    open();
    await scan('CELLA');
    await scan('X1');

    await waitFor(() => expect(screen.getByTestId('cell-scan-conflict')).toBeInTheDocument());
    expect(screen.getByTestId('cell-scan-add-together')).toHaveTextContent('Olma');
    expect(screen.getByTestId('cell-scan-replace')).toHaveTextContent('Olma');
  });

  it('§1.2 ikkitadan ko`p egallovchi — «Olma +1» ko`rinishida', async () => {
    mockApi({ occupants: [{ id: 'p1', name: 'Olma' }, { id: 'p2', name: 'Anor' }] });
    open();
    await scan('CELLA');
    await scan('X1');

    await waitFor(() => expect(screen.getByTestId('cell-scan-conflict')).toBeInTheDocument());
    expect(screen.getByTestId('cell-scan-replace')).toHaveTextContent('Olma +1');
  });

  it('§1.2 «chiqarib qo`shish» — saqlashda AVVAL delete, KEYIN post', async () => {
    mockApi({ occupants: [{ id: 'prod-old', name: 'Olma' }] });
    open();
    await scan('CELLA');
    await scan('X1');
    await waitFor(() => expect(screen.getByTestId('cell-scan-conflict')).toBeInTheDocument());

    await userEvent.click(screen.getByTestId('cell-scan-replace'));
    // Skan paytida SERVERGA hech narsa yozilmaydi.
    expect(api.delete).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();

    const order: string[] = [];
    vi.mocked(api.delete).mockImplementation(async (u: string) => {
      order.push(`DELETE ${u}`);
      return {} as never;
    });
    vi.mocked(api.post).mockImplementation(async (u: string) => {
      order.push(`POST ${u}`);
      return {} as never;
    });

    await userEvent.click(screen.getByTestId('cell-scan-save'));

    await waitFor(() => expect(order).toHaveLength(2));
    expect(order[0]).toBe('DELETE /admin/stores/store-1/cells/cell-A/products/prod-old');
    expect(order[1]).toBe('POST /admin/stores/store-1/cells/cell-A/products');
  });

  it('§1.2 qaror HAR YACHEYKA UCHUN BIR MARTA — ikkinchi skan so`ramaydi', async () => {
    mockApi({ occupants: [{ id: 'prod-old', name: 'Olma' }] });
    open();
    await scan('CELLA');
    await scan('X1');
    await waitFor(() => expect(screen.getByTestId('cell-scan-conflict')).toBeInTheDocument());
    await userEvent.click(screen.getByTestId('cell-scan-add-together'));

    await scan('X2');

    // Dialog qayta OCHILMAYDI, ikkinchi qator ro'yxatga jimgina tushadi.
    await waitFor(() =>
      expect(screen.getByTestId('cell-scan-log').querySelectorAll('li')).toHaveLength(2),
    );
    expect(screen.queryByTestId('cell-scan-conflict-msg')).not.toBeInTheDocument();
  });

  it('§1.4 staged dublikat — sariq «ro`yxatda bor», qator qo`shilmaydi', async () => {
    mockApi({ occupants: [] });
    open();
    await scan('CELLA');
    await scan('X1');
    await waitFor(() =>
      expect(screen.getByTestId('cell-scan-log').querySelectorAll('li')).toHaveLength(1),
    );

    await scan('X1');

    await waitFor(() =>
      expect(screen.getByTestId('cell-scan-status')).toHaveTextContent('allaqachon ro'),
    );
    expect(screen.getByTestId('cell-scan-log').querySelectorAll('li')).toHaveLength(1);
  });
});
```

- [ ] **Step 3: RED — yiqilishini ko'r**

```bash
pnpm --filter @moysklad/web exec vitest run src/components/stores/cell-scan-bind-modal.test.tsx
```
Kutilgan: **6 failed** — `cell-scan-replace` test-id yo'q, tugmalarda nom yo'q, ikkinchi skanda dialog qayta ochiladi, `@/hooks/use-permissions` mocki hali ishlatilmaydi.

- [ ] **Step 4: qaror xotirasi + «evict» ni komponentga kirit**

`cell-scan-bind-modal.tsx` — state qo'shimchalari (`const [pending, …]` yonига):

```tsx
  /** TZ v3 §1.2: band yacheyka savoli HAR YACHEYKA UCHUN BIR MARTA so'raladi —
   *  javob shu yerda yashaydi. `evict` — qaror qabul qilingan lahzadagi SERVER
   *  tarkibi: «chiqarib qo'shish» saqlashda AYNAN shularni oladi (bu sessiyada
   *  staged qilingan qatorlar hech qachon chiqarilmaydi). */
  const [decisions, setDecisions] = useState<
    Map<string, { mode: 'together' | 'replace'; evict: Array<{ id: string; name: string }> }>
  >(new Map());
```

`useEffect(() => { if (!open) return; … })` reset blokiga: `setDecisions(new Map());`

- [ ] **Step 5: `resolve()` ni TZ §1.2/§1.4 ga moslash**

`resolve` ichidagi «band yacheyka» blokini almashtir:

```tsx
        const bound = await api
          .get<{ items: Array<{ id: string; name: string }> }>(
            `/admin/stores/${storeId}/cells/${cell.id}/products`,
          )
          .catch(() => null);
        const serverItems = bound?.items ?? [];
        const stagedHere = pending.filter((r) => r.cell.id === cell.id);

        // §1.4: shu mahsulot ALLAQACHON RO'YXATDA (staged) — sariq, takror yo'q.
        if (stagedHere.some((r) => r.product.id === product.id)) {
          beep();
          setMessage({ kind: 'warn', text: t('scan_already_staged') });
          return;
        }
        // §1.4: serverda allaqachon bog'langan — yashil, qo'shilmaydi.
        if (serverItems.some((x) => x.id === product.id)) {
          setLastProduct(product.name);
          flashTheCard('product');
          setMessage({ kind: 'ok', text: t('scan_already_bound') });
          return;
        }

        const decided = decisions.get(cell.id);
        if (decided) {
          // §1.2: qaror eslab qolingan — so'roqsiz davom etadi.
          stage(product, cell);
          return;
        }
        if (serverItems.length > 0) {
          setConflict({ product, existing: serverItems });
          return;
        }
        // Bo'sh yacheyka: birinchi qaror ham kerak emas, lekin keyingi
        // skanlar uchun «together» deb muhrlanadi (dialog hech qachon
        // sababsiz chiqmasin).
        setDecisions((m) => new Map(m).set(cell.id, { mode: 'together', evict: [] }));
        stage(product, cell);
```

`beep` importini qo'sh: `import { beep } from '@/lib/beep';`

Xato shoxlarining har biriga `beep()` qo'sh (TZ §3 «xatolar qizil + beep»): `scan_not_found`, `scan_multiple`, `scan_no_cell_yet`, `scan_cell_other_store`, `catch` bloki.

`resolve` ning `useCallback` bog'liqliklariga `decisions` qo'sh.

- [ ] **Step 6: uch tugmali dialog (nomlar bilan)**

`addTogether` yonida:

```tsx
  /** Dialog tugmalari uchun qisqa nom: «Olma» yoki «Olma +2». */
  const conflictLabel = conflict
    ? conflict.existing.length > 1
      ? `${conflict.existing[0]?.name ?? ''} +${conflict.existing.length - 1}`
      : (conflict.existing[0]?.name ?? '')
    : '';

  const decide = useCallback(
    (mode: 'together' | 'replace') => {
      if (!conflict || !cell) return;
      setDecisions((m) =>
        new Map(m).set(cell.id, { mode, evict: mode === 'replace' ? conflict.existing : [] }),
      );
      stage(conflict.product, cell);
      if (mode === 'replace') setMessage({ kind: 'ok', text: t('scan_staged_replace') });
      setConflict(null);
      rearm();
    },
    [conflict, cell, stage, rearm, t],
  );
```

Dialog `footer` ni almashtir (eski `addTogether` tugmasi o'rniga):

```tsx
            <Button
              type="button"
              variant="success"
              size="sm"
              onClick={() => decide('together')}
              data-test-id="cell-scan-add-together"
            >
              {t('scan_add_together_named', { name: conflictLabel })}
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => decide('replace')}
              data-test-id="cell-scan-replace"
            >
              {t('scan_replace_named', { name: conflictLabel })}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setConflict(null);
                rearm();
              }}
              data-test-id="cell-scan-conflict-cancel"
            >
              {t('scan_cancel')}
            </Button>
```

> `variant="destructive"` `@moysklad/ui` Button'da mavjudligini tekshir (`packages/design-system/src/button.tsx`); bo'lmasa `variant="danger"` yoki mavjud qizil variantni ol — **yangi variant yaratma**.

Endi ishlatilmaydigan `addTogether` ni o'chir (biome «unused» beradi).

- [ ] **Step 7: `save()` — yacheyka bo'yicha guruh, avval DELETE keyin POST**

```tsx
  const save = useCallback(async () => {
    if (pending.length === 0 || saving) return;
    setSaving(true);
    const rows = [...pending].reverse(); // skan tartibi
    // §1.3: har guruh o'z yacheykasiga yoziladi.
    const byCell = new Map<string, typeof rows>();
    for (const r of rows) {
      const list = byCell.get(r.cell.id) ?? [];
      list.push(r);
      byCell.set(r.cell.id, list);
    }
    let done = 0;
    try {
      for (const [cellId, cellRows] of byCell) {
        // §1.2: «chiqarib qo'shish» — AVVAL eski chiqariladi (bir marta,
        // qaror qabul qilingan lahzadagi ro'yxat bo'yicha), KEYIN yangilari
        // yoziladi.
        const decision = decisions.get(cellId);
        if (decision?.mode === 'replace') {
          for (const victim of decision.evict) {
            await api.delete(`/admin/stores/${storeId}/cells/${cellId}/products/${victim.id}`);
          }
        }
        for (const r of cellRows) {
          await api.post(`/admin/stores/${storeId}/cells/${cellId}/products`, {
            productIds: [r.product.id],
          });
          done += 1;
          setPending((p) => p.filter((x) => x.key !== r.key));
        }
      }
      setMessage({ kind: 'ok', text: t('scan_saved_n', { count: done }) });
      toast.success(t('scan_saved_n', { count: done }));
    } catch (e) {
      beep();
      setMessage({
        kind: 'err',
        text: t('scan_save_failed', { msg: e instanceof Error ? e.message : String(e) }),
      });
    }
    if (done > 0) onBound();
    setSaving(false);
    rearm();
  }, [pending, saving, storeId, onBound, t, rearm, toast, decisions]);
```

- [ ] **Step 8: staged qatorda «almashtiradi» belgisi**

`pending.map(...)` ichidagi `<li>` ga, `→ {row.cell.name}` dan keyin:

```tsx
                  {decisions.get(row.cell.id)?.mode === 'replace' && (
                    <span
                      className="shrink-0 rounded bg-[var(--ms-error-50,#fdf0ef)] px-1.5 py-0.5 text-[11px] text-[var(--ms-text-destructive)]"
                      data-test-id={`cell-scan-row-replaces-${row.key}`}
                    >
                      {t('scan_row_replaces')}
                    </span>
                  )}
```

- [ ] **Step 9: «chiqarib qo'shish» ni ruxsat bilan darvozala**

TZ §3: chiqarish = `store.update`, ya'ni **omborchida yo'q** (T1). Tugma unga
ko'rinmasin — aks holda u qarorni tanlaydi, ro'yxatni to'ldiradi va faqat
«Saqlash» da 403 oladi (butun mehnat kuyadi).

Import: `import { usePermissions } from '@/hooks/use-permissions';`

Komponent tepasida:

```tsx
  // TZ §3: bog'lash/sanash — `storecell`, lekin CHIQARISH — `store.update`.
  // Matritsa hali kelmagan bo'lsa fail-open (fayl konvensiyasi) — server
  // baribir yakuniy qaror qiluvchi.
  const { matrix } = usePermissions();
  const canEvict = matrix ? matrix.store?.update !== 'NO' : true;
```

Dialog `footer` idagi «chiqarib qo'shish» tugmasini shu bayroq bilan o'ra:

```tsx
            {canEvict && (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => decide('replace')}
                data-test-id="cell-scan-replace"
              >
                {t('scan_replace_named', { name: conflictLabel })}
              </Button>
            )}
```

Testga (`cell-scan-bind-modal.test.tsx`) yana bitta holat qo'sh (mock Step 2 da
allaqachon fayl tepasida turibdi):

```tsx
  it('§3 chiqarish huquqi yo`q foydalanuvchida «chiqarib qo`shish» KO`RINMAYDI', async () => {
    const { usePermissions } = await import('@/hooks/use-permissions');
    vi.mocked(usePermissions).mockReturnValueOnce({
      matrix: { store: { update: 'NO' } },
    } as never);

    mockApi({ occupants: [{ id: 'prod-old', name: 'Olma' }] });
    open();
    await scan('CELLA');
    await scan('X1');

    await waitFor(() => expect(screen.getByTestId('cell-scan-conflict')).toBeInTheDocument());
    expect(screen.getByTestId('cell-scan-add-together')).toBeInTheDocument();
    expect(screen.queryByTestId('cell-scan-replace')).not.toBeInTheDocument();
  });
```

> `mockReturnValueOnce` bitta render uchun ishlaydi; agar komponent bir necha
> marta render bo'lsa `mockReturnValue` ni ishlat va testdan keyin
> `mockReturnValue({ matrix: { store: { update: 'ALL' } } } as never)` bilan
> tiklab qo'y.

- [ ] **Step 10: skan navbatini ulash**

Import: `import { useScanQueue } from '@/components/stores/use-scan-queue';`

`resolveRef` blokidan keyin:

```tsx
  // TZ v3 §3: skanlar navbatga tushadi — hech biri yo'qolmaydi.
  const enqueue = useScanQueue((code: string) => resolveRef.current(code));
```

Uch chaqiruv joyini almashtir:
- input `onKeyDown` da `void resolve(v)` → `void enqueue(v)`;
- `onCameraDecoded` da `void resolveRef.current(raw)` → `void enqueue(raw)` (`enqueue` barqaror, kamera qayta ishga tushmaydi);
- document-level wedge tutqichida `void resolveRef.current(v)` → `void enqueue(v)`.

`onCameraDecoded` ning `useCallback` bog'liqligiga `[enqueue]` yoz.

- [ ] **Step 11: GREEN + gate**

```bash
pnpm --filter @moysklad/web exec vitest run src/components/stores/cell-scan-bind-modal.test.tsx
pnpm typecheck && pnpm lint:product && pnpm i18n:gate
```
Kutilgan: **6 passed**, gate yashil.

- [ ] **Step 12: Commit**

```bash
git add apps/web/src/components/stores/cell-scan-bind-modal.tsx \
        apps/web/src/components/stores/cell-scan-bind-modal.test.tsx \
        apps/web/src/messages/uz.json apps/web/src/messages/ru.json
git commit -m "feat(ombor): scan oynasi tz v3 — chiqarib qo'shish, yacheyka qarori, navbat"
git show --stat HEAD
```

---

## Task 5: «Sanash» oynasi — TZ §2 ga to'liq moslash

**Files:**
- Modify: `apps/web/src/components/stores/cell-count-modal.tsx`
- Modify: `apps/web/src/messages/uz.json`, `apps/web/src/messages/ru.json`
- Test: `apps/web/src/components/stores/cell-count-modal.test.tsx` (yangi)

**Interfaces:**
- Consumes: T2 dagi `PUT …/stock` `{ assortmentId, qty, mode }` shartnomasi; `useScanQueue` (T3).
- Produces: `bulkRows` elementi endi `currentQty: string` ni ham olib yuradi (§2.2.2 «hozirgi: N»).

- [ ] **Step 1: i18n (uz + ru)**

`uz.json` → `pages.stores.address_storage`:

```json
      "count_bulk_current": "hozirgi",
      "count_bulk_becomes": "bo'ladi",
      "count_bulk_row_invalid": "«{cell}» yacheykada miqdor bo'sh yoki noto'g'ri — hech narsa saqlanmadi",
      "count_bulk_hint": "Yacheykalarni ketma-ket skanerlang — «Saqlash» da har biriga shu miqdor QO'SHILADI (qatorda tahrirlash mumkin)."
```

`ru.json`:

```json
      "count_bulk_current": "сейчас",
      "count_bulk_becomes": "станет",
      "count_bulk_row_invalid": "В ячейке «{cell}» количество пустое или неверное — ничего не сохранено",
      "count_bulk_hint": "Сканируйте ячейки подряд — при сохранении к каждой ПРИБАВИТСЯ это количество (можно поправить в строке)."
```

> `count_bulk_hint` — **mavjud kalit**, faqat matni yangilanadi (bulk endi qo'shadi).

- [ ] **Step 2: RED testni yoz**

`apps/web/src/components/stores/cell-count-modal.test.tsx`:

```tsx
import { renderWithProviders, screen, waitFor, within } from '@/test-utils';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CellCountModal } from './cell-count-modal';

/**
 * TZ v3 §2 — «Sanash» oynasi.
 *
 *   §2.1 oddiy rejim — MUTLAQ (`mode:'set'`);
 *   §2.2.3 «Umumiy sanash» — QO'SHILADI (`mode:'add'`), qatorda «hozirgi → bo'ladi»;
 *   §2.2.2 bo'sh qator umumiy sondan to'ldiriladi (saqlash lahzasida);
 *   §2.2.4 birorta qator yaroqsiz bo'lsa — HECH NARSA yozilmaydi va qaysi
 *          yacheyka ekani AYTILADI (yarim-partiya yo'q).
 */
vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));
vi.mock('@/lib/beep', () => ({ beep: vi.fn() }));
vi.mock('@/components/stores/use-barcode-camera', () => ({
  useBarcodeCamera: () => ({
    videoRef: { current: null },
    cameraOn: false,
    cameraError: null,
    diag: null,
    startCamera: vi.fn(),
    stopCamera: vi.fn(),
  }),
}));

const { api } = await import('@/lib/api-client');

const CELLS = [
  { id: 'cell-A', name: '01-01-01-01', barcode: 'CELLA' },
  { id: 'cell-B', name: '01-01-01-02', barcode: 'CELLB' },
];

/** Har yacheykada bitta mahsulot; qoldiq — `stock` xaritasidan. */
function mockStock(stock: Record<string, number>) {
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    const m = url.match(/cells\/(cell-[AB])\/stock/);
    if (m) {
      const cellId = m[1] as string;
      return {
        items: [
          {
            assortmentKind: 'product',
            assortmentId: `prod-${cellId}`,
            name: `Tovar ${cellId}`,
            code: null,
            barcode: null,
            description: null,
            mainImageId: null,
            qty: String(stock[cellId] ?? 0),
          },
        ],
      } as never;
    }
    return { items: [] } as never;
  });
  vi.mocked(api.put).mockResolvedValue({} as never);
}

function open() {
  renderWithProviders(
    <CellCountModal
      open
      onOpenChange={vi.fn()}
      storeId="store-1"
      cells={CELLS}
      onSaved={vi.fn()}
    />,
  );
}

const scan = async (code: string) =>
  userEvent.type(screen.getByTestId('cell-count-input'), `${code}{Enter}`);

beforeEach(() => {
  vi.mocked(api.get).mockReset();
  vi.mocked(api.put).mockReset();
});

describe('CellCountModal — TZ v3 §2', () => {
  it('§2.1 oddiy rejim MUTLAQ yozadi (mode: set)', async () => {
    mockStock({ 'cell-A': 26 });
    open();
    await scan('CELLA');
    await waitFor(() => expect(screen.getByTestId('cell-count-qty')).toBeEnabled());

    await userEvent.type(screen.getByTestId('cell-count-qty'), '30');
    await userEvent.click(screen.getByTestId('cell-count-save'));

    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.put).mock.calls[0]?.[1]).toEqual({
      assortmentId: 'prod-cell-A',
      qty: '30',
      mode: 'set',
    });
  });

  it('§2.2.2 bulk qatorda «hozirgi» va natija ko`rinadi', async () => {
    mockStock({ 'cell-A': 26 });
    open();
    await userEvent.click(screen.getByTestId('cell-count-bulk-toggle'));
    await userEvent.type(screen.getByTestId('cell-count-qty'), '100');
    await scan('CELLA');

    const row = await screen.findByTestId('cell-count-bulk-row-cell-A');
    expect(within(row).getByTestId('cell-count-bulk-current-cell-A')).toHaveTextContent('26');
    expect(within(row).getByTestId('cell-count-bulk-becomes-cell-A')).toHaveTextContent('126');
  });

  it('§2.2.3 bulk saqlash QO`SHADI (mode: add) — har yacheykaga o`z soni', async () => {
    mockStock({ 'cell-A': 26, 'cell-B': 5 });
    open();
    await userEvent.click(screen.getByTestId('cell-count-bulk-toggle'));
    await userEvent.type(screen.getByTestId('cell-count-qty'), '100');
    await scan('CELLA');
    await screen.findByTestId('cell-count-bulk-row-cell-A');
    await scan('CELLB');
    await screen.findByTestId('cell-count-bulk-row-cell-B');

    // B qatoriga alohida 50
    const bQty = screen.getByTestId('cell-count-bulk-qty-cell-B');
    await userEvent.clear(bQty);
    await userEvent.type(bQty, '50');

    await userEvent.click(screen.getByTestId('cell-count-save'));

    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(2));
    const bodies = vi.mocked(api.put).mock.calls.map((c) => c[1]);
    expect(bodies).toContainEqual({ assortmentId: 'prod-cell-A', qty: '100', mode: 'add' });
    expect(bodies).toContainEqual({ assortmentId: 'prod-cell-B', qty: '50', mode: 'add' });
  });

  it('§2.2.2 bo`sh qator UMUMIY sondan to`ldiriladi (saqlash lahzasida)', async () => {
    mockStock({ 'cell-A': 26 });
    open();
    await userEvent.click(screen.getByTestId('cell-count-bulk-toggle'));
    await scan('CELLA'); // umumiy son hali kiritilmagan — qator bo'sh qty bilan tushadi
    await screen.findByTestId('cell-count-bulk-row-cell-A');

    await userEvent.type(screen.getByTestId('cell-count-qty'), '70');
    await userEvent.click(screen.getByTestId('cell-count-save'));

    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.put).mock.calls[0]?.[1]).toEqual({
      assortmentId: 'prod-cell-A',
      qty: '70',
      mode: 'add',
    });
  });

  it('§2.2.4 yaroqsiz qator — HECH NARSA yozilmaydi, yacheyka nomi aytiladi', async () => {
    mockStock({ 'cell-A': 26, 'cell-B': 5 });
    open();
    await userEvent.click(screen.getByTestId('cell-count-bulk-toggle'));
    await userEvent.type(screen.getByTestId('cell-count-qty'), '100');
    await scan('CELLA');
    await screen.findByTestId('cell-count-bulk-row-cell-A');
    await scan('CELLB');
    await screen.findByTestId('cell-count-bulk-row-cell-B');

    const aQty = screen.getByTestId('cell-count-bulk-qty-cell-A');
    await userEvent.clear(aQty);
    await userEvent.type(aQty, 'abc');

    await userEvent.click(screen.getByTestId('cell-count-save'));

    expect(api.put).not.toHaveBeenCalled();
    expect(screen.getByTestId('cell-count-status')).toHaveTextContent('01-01-01-01');
  });
});
```

- [ ] **Step 3: RED — yiqilishini ko'r**

```bash
pnpm --filter @moysklad/web exec vitest run src/components/stores/cell-count-modal.test.tsx
```
Kutilgan: **5 failed** — `mode` yuborilmaydi, `cell-count-bulk-row-*` test-id yo'q, bulk'da `cell-count-qty` maydoni umuman render bo'lmaydi.

- [ ] **Step 4: bitta barqaror son-maydon**

`cell-count-modal.tsx` — TZ §2: «tepada checkbox va uning yonida **doim bitta** son-maydon». Ikkala maydonni bitta bloqqa yig':

1. Hozirgi `{!bulkMode && ( <label …> …count_qty_label… </label> )}` blokini **o'chir**.
2. Hozirgi `{bulkMode && ( … <label> count_bulk_qty </label> … )}` ichidagi **son-maydonni** ham o'chir (jadval va hint qoladi).
3. Checkbox `<label>` idan **oldin** yagona maydonni qo'y:

```tsx
        {/* TZ v3 §2: bitta son-maydon — rejim almashganda ham JOYIDAN
            QIMIRLAMAYDI, faqat yorlig'i va nishoni almashadi. */}
        <label className="flex items-center justify-between gap-3">
          <span className="text-[13px] text-[var(--ms-text-primary)]">
            {bulkMode ? t('count_bulk_qty') : t('count_qty_label')}
          </span>
          <Input
            ref={qtyRef}
            inputMode="decimal"
            value={bulkMode ? bulkQty : qty}
            invalid={bulkMode ? bulkQty !== '' && !bulkQtyValid : qtyMissing}
            onChange={(e) => {
              if (bulkMode) {
                setBulkQtyClean(e.target.value);
                return;
              }
              setQtyMissing(false);
              setQty(e.target.value);
            }}
            onKeyDown={wedgeGuard(
              'qty',
              (v) => {
                if (bulkMode) {
                  setBulkQtyClean(v);
                  return;
                }
                setQtyMissing(false);
                setQty(v);
              },
              () => void save(),
            )}
            placeholder={bulkMode ? '50' : selectedId ? '' : t('count_select_first')}
            className="h-9 w-40 text-right tabular-nums"
            data-test-id="cell-count-qty"
          />
        </label>
```

- [ ] **Step 5: `bulkRows` ga `currentQty` + qatorda «hozirgi → bo'ladi»**

`bulkRows` tipiga `currentQty: string` qo'sh; `bulkAdd` da:

```tsx
      setBulkRows((rows) => [
        {
          key: `${target.id}-${p.assortmentId}`,
          cell: target,
          product: { id: p.assortmentId, name: p.name },
          qty: bulkQtyRef.current,
          currentQty: String(p.qty ?? '0'),
        },
        ...rows.filter((r) => r.key !== `${target.id}-${p.assortmentId}`),
      ]);
```

Jadval qatorini almashtir (`bulkRows.map`):

```tsx
                {bulkRows.map((r) => {
                  const typed = r.qty.trim() || bulkQty.trim();
                  const becomes = qtyValidRe.test(typed)
                    ? fmtQty(Number(r.currentQty) + Number(typed))
                    : '—';
                  return (
                    <li
                      key={r.key}
                      className="flex items-center gap-2 px-2.5 py-1.5"
                      data-test-id={`cell-count-bulk-row-${r.cell.id}`}
                    >
                      <span className="shrink-0 rounded bg-[var(--ms-bg-muted)] px-1.5 py-0.5 font-medium text-[12px] text-[var(--ms-text-muted)] tabular-nums">
                        {r.cell.name}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[13px]">{r.product.name}</span>
                      {/* §2.2.2: qo'shiladigan son qayerga tushishi ko'rinib tursin. */}
                      <span className="shrink-0 text-[11px] text-[var(--ms-text-muted)] tabular-nums">
                        {t('count_bulk_current')}:{' '}
                        <span data-test-id={`cell-count-bulk-current-${r.cell.id}`}>
                          {fmtQty(Number(r.currentQty) || 0)}
                        </span>{' '}
                        → {t('count_bulk_becomes')}:{' '}
                        <span data-test-id={`cell-count-bulk-becomes-${r.cell.id}`}>{becomes}</span>
                      </span>
                      <Input
                        inputMode="decimal"
                        value={r.qty}
                        invalid={r.qty !== '' && !qtyValidRe.test(r.qty.trim())}
                        onChange={(e) =>
                          setBulkRows((rows) =>
                            rows.map((x) => (x.key === r.key ? { ...x, qty: e.target.value } : x)),
                          )
                        }
                        onKeyDown={wedgeGuard(`row-${r.key}`, (v) =>
                          setBulkRows((rows) =>
                            rows.map((x) => (x.key === r.key ? { ...x, qty: v } : x)),
                          ),
                        )}
                        className="h-8 w-24 shrink-0 text-right tabular-nums"
                        data-test-id={`cell-count-bulk-qty-${r.cell.id}`}
                      />
                      <button
                        type="button"
                        onClick={() => setBulkRows((rows) => rows.filter((x) => x.key !== r.key))}
                        className="shrink-0 rounded px-1 text-[14px] text-[var(--ms-text-muted)] hover:bg-[var(--ms-bg-hover)] hover:text-[var(--ms-text-destructive)]"
                        aria-label={t('scan_cancel')}
                        data-test-id={`cell-count-bulk-remove-${r.cell.id}`}
                      >
                        ✕
                      </button>
                    </li>
                  );
                })}
```

> Diqqat: test-id'lar endi **yacheyka nomi emas, `cell.id`** bo'yicha — barqaror va nomdagi bo'shliqlarga bog'liq emas.

- [ ] **Step 6: validatsiya + saqlash semantikasi**

`bulkRowsValid` ni almashtir (bo'sh qator umumiy sondan to'ldiriladi):

```tsx
  /** §2.2.2: qatorning o'z soni bo'sh bo'lsa — UMUMIY son ishlaydi (saqlash
   *  lahzasida, ya'ni umumiy sonni keyin kiritsangiz ham qatorlar tirik). */
  const effectiveRowQty = useCallback(
    (row: { qty: string }) => (row.qty.trim() || bulkQty.trim()),
    [bulkQty],
  );
  const invalidBulkRow = bulkRows.find((r) => !qtyValidRe.test(effectiveRowQty(r)));
  const bulkRowsValid = bulkRows.length > 0 && !invalidBulkRow;
```

`save()` ning bulk shoxini almashtir:

```tsx
    if (bulkMode) {
      // §2.2.4: saqlashdan OLDIN hamma qator tekshiriladi — birortasi
      // yaroqsiz bo'lsa hech narsa yozilmaydi va MUAMMOLI YACHEYKA aytiladi.
      if (invalidBulkRow) {
        beep();
        setMessage({
          kind: 'err',
          text: t('count_bulk_row_invalid', { cell: invalidBulkRow.cell.name }),
        });
        return;
      }
      setSaving(true);
      let done = 0;
      try {
        for (const r of [...bulkRows].reverse()) {
          // §2.2.3: bulk QO'SHADI — delta serverda hisoblanadi.
          await api.put(`/admin/stores/${storeId}/cells/${r.cell.id}/stock`, {
            assortmentId: r.product.id,
            qty: effectiveRowQty(r),
            mode: 'add',
          });
          done += 1;
          setBulkRows((rows) => rows.filter((x) => x.key !== r.key));
        }
        toast.success(tCommonSaved);
        onSaved();
        onOpenChange(false);
      } catch (e) {
        beep();
        setMessage({
          kind: 'err',
          text: t('scan_save_failed', { msg: e instanceof Error ? e.message : String(e) }),
        });
        setSaving(false);
        if (done > 0) onSaved();
      }
      return;
    }
```

Oddiy rejim `api.put` chaqirig'iga `mode: 'set'` qo'sh:

```tsx
      await api.put(`/admin/stores/${storeId}/cells/${cell.id}/stock`, {
        assortmentId: selectedId,
        qty: qty.trim(),
        mode: 'set',
      });
```

`canSave` ni yangila: `const canSave = bulkMode ? bulkRows.length > 0 && !saving : qtyValid && !saving;`
(TZ §2.2.4 — tugma **jim o'lik** bo'lmaydi, bosilganda sababni aytadi).

`save` va `canSave` ning bog'liqlik ro'yxatlariga `invalidBulkRow`, `effectiveRowQty` ni qo'sh.

- [ ] **Step 7: skan navbatini ulash**

Import `useScanQueue`; `resolveRef` dan keyin `const enqueue = useScanQueue((code: string) => resolveRef.current(code));`
Input `onKeyDown` va `onCameraDecoded` ni `enqueue` ga o'tkaz (T4 Step 9 bilan bir xil).

- [ ] **Step 8: GREEN + gate**

```bash
pnpm --filter @moysklad/web exec vitest run src/components/stores/cell-count-modal.test.tsx
pnpm typecheck && pnpm lint:product && pnpm i18n:gate
pnpm --filter @moysklad/web exec vitest run
```
Kutilgan: **5 passed**, butun web suite regressiyasiz.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/components/stores/cell-count-modal.tsx \
        apps/web/src/components/stores/cell-count-modal.test.tsx \
        apps/web/src/messages/uz.json apps/web/src/messages/ru.json
git commit -m "feat(ombor): umumiy sanash qo'shuvchi bo'ldi + qatorda hozirgi/bo'ladi"
git show --stat HEAD
```

---

## Task 6: TZ hujjati + Phase-2 QA (real skaner) — egasi bilan

**Files:**
- Create: `docs/superpowers/specs/2026-08-10-yacheyka-scan-sanash-tz-v3.md`
- Modify: `NEXT.md` (hand-off)

- [ ] **Step 1: TZ matnini repo'ga qo'y**

Egasining 2026-08-10 dagi TZ matnini (§0–§4, bu chatdagi to'liq matn) yangi faylga **o'zgartirmasdan** ko'chir. Tepasiga bir blok qo'sh:

```markdown
> Manba: egasi, 2026-08-10. Bu fayl — TALAB matni (o'zgartirilmaydi).
> Bajarilish rejasi: `docs/superpowers/plans/2026-08-10-yacheyka-scan-sanash-tz-v3.md`.
> Egasi tasdiqlagan 3 og'ish: bulk delta SERVERDA hisoblanadi · «chiqarib qo'shish»
> 2026-07-21 qarorini bekor qiladi · ruxsat `store.cell_ops` emas, `storecell` obyekti.
```

- [ ] **Step 2: hujjatni commit qil**

```bash
git add docs/superpowers/specs/2026-08-10-yacheyka-scan-sanash-tz-v3.md
git commit -m "docs(ombor): scan/sanash tz v3 matni repoga"
```

- [ ] **Step 3: OPS — ruxsat qatorlarini to'ldir (T1 Step 8)**

Lokal:
```bash
cd apps/api && npx tsx src/scripts/topup-role-permissions.ts
```
Prodda — deploy sessiyasida, `/deploy` skilida.

- [ ] **Step 4: `/qa-cohort` — real skaner bilan TZ §4 checklisti**

`pnpm dev` (api :4000 + web :3100) va **real USB skaner + telefon kamerasi** bilan TZ §4 ni bandma-band yugurtir. Har band uchun **kuzatilgan natijani** yoz (skrinshot yoki matn). Aniq tekshiriladiganlar:

- [ ] Scan: yacheyka + 3 mahsulot → 3 qator → «Saqlash» → mahsulot kartalarida «Ячейка» to'g'ri.
- [ ] Scan: ✕ bosilgan mahsulot saqlanmaydi.
- [ ] Scan: band yacheyka → tugmalarda mavjud mahsulot nomi; «chiqarib qo'shish» — eski chiqib, yangi kiradi.
- [ ] Scan: qaror bir marta so'raladi (2-mahsulot so'roqsiz tushadi).
- [ ] Scan: 2 xil yacheyka aralash → har mahsulot o'z yacheykasiga.
- [ ] Sanash (oddiy): son kiritmay 2-yacheyka → qizil + beep.
- [ ] Umumiy sanash: 5 yacheyka + umumiy 100 → **qoldiq +100** bo'ldi (mutlaq 100 EMAS), «hozirgi» to'g'ri.
- [ ] Umumiy sanash: bitta qatorga 50 → o'shaniki +50, qolganlari +100.
- [ ] Umumiy sanash: bir qator bo'sh son bilan → xabar yacheyka nomini aytdi, **hech narsa yozilmadi**.
- [ ] Omborchi (storekeeper) akkaunti bilan ikkala oyna **403 bermasdan** ishladi.
- [ ] Omborchida band-yacheyka dialogida **«chiqarib qo'shish» tugmasi YO'Q** (faqat «birga qo'shish» + «bekor»); administratorda esa bor.
- [ ] Telefon kamerasi bilan yuqoridagilar takror.
- [ ] Skaner son-maydonga otganda (wedge-guard) — kod maydonda qolmadi.

- [ ] **Step 5: natijani yozib qo'y**

`NEXT.md` ga sana+harf yorlig'i bilan hand-off: nima yashil, nima qizil, qaysi bandi tekshirilmagan. Topilgan buglar **issiq-kontekstda** darhol tuzatiladi (Phase-2 qoidasi). Faqat shu qadamdan keyin sahifalar **«Phase-2 verified»** deb belgilanadi.

---

## Xavflar va ochiq savollar (bajaruvchiga)

1. **Ikki marta qo'shish xavfi (§2.2.3).** `mode:'add'` idempotent EMAS: bir yacheykani ikki sessiyada sanasa, ikki marta qo'shiladi. Yumshatish — qatordagi «hozirgi → bo'ladi» ko'rsatkichi (T5). Agar QA'da bu real muammo bo'lsa, keyingi faza: sanoq sessiyasini `InventoryCount` hujjatiga bog'lash.
2. **`variant="destructive"`** `@moysklad/ui` Button'da bor-yo'qligini T4 Step 6 da tekshir — yo'q bo'lsa mavjud qizil variantni ol, yangi variant **yaratma**.
2a. **Ruxsat assimetriyasi (TZ §3, ataylab).** Omborchi bog'lay/sanay oladi, lekin **chiqara olmaydi** — unga band-yacheyka dialogida faqat ikki tugma ko'rinadi. Ya'ni omborchi band yacheykadagi xato bog'lashni o'zi tuzata olmaydi: u administratorga murojaat qiladi. QA'da (T6) bu «bug» emas — TZ shunday. Agar egasi buni noqulay desa, keyingi faza: `storecell.delete` amali.
3. **`updateCell` metod nomi** T1 testida `store.controller.ts:281` dagi haqiqiy nom bilan mos bo'lishi shart.
4. **Ops skripti — HAQIQIY yo'l:** `apps/api/src/scripts/topup-role-permissions.ts` (reja avval `scripts/…` deb yozgan edi — XATO, T1 da tuzatildi). Unda ikki pass bor: PASS 1 eski `isSystem` rollarni, **PASS 2** esa `templateSlug` li shablon rollarini (omborchi shu yerda) davolaydi; PASS 2 faqat `TOPUP_ENTITIES` allow-listidagi entity'ni ko'radi va mavjud qatorlarni O'ZGARTIRMAYDI. Yugurtirilmaguncha **hech kim** (administrator ham) yacheyka amallarini bajara olmaydi.
5. **Parallel sessiya:** bu reja `apps/api/src/modules/permissions/*` ga tegadi — boshqa sessiya rol/ruxsat ustida ishlayotgan bo'lsa, T1 ni **worktree izolyatsiyasida** bajar (CLAUDE.md §6.5).
