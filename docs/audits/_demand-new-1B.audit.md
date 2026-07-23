# Demand `/new` — QISM 1B (funksional mos) audit — **QISMAN** (position-economics)

> **Sub-project:** «Отгрузки» to'liq 1:1 · **QISM 1B** (yaratish sahifasi — funksional mos) · **QISMAN**.
> **Status:** ✅ **position-economics browser-VERIFIED** (live smoke `:3100`). 1B ning 5 bandidan **2 tasi
> bajarildi**, 1 tasi **DEFER** (blocked), 2 tasi keyingi sessiyaga.
> Fayl: `apps/web/src/app/(app)/demands/new/page.tsx` (yagona o'zgargan fayl).

## Bajarilgan (1B bandlari — 2/5)

### ✅ «Прибыль» qatori (totals)
moysklad sotuv-totals'да «Прибыль» ko'rsatadi («Кол-во» EMAS). `DocumentTotalsPanel`'да `profitMinor`
prop allaqachon mavjud → `profitMinor={0n}` uzatildi, `quantity` prop olib tashlandi. **Halol asos:**
yangi otgruzka DOIM qoralama; COGS faqat o'tkazishда (FIFO consume) ma'lum bo'ladi → qoralamada foyda =
0,00 — bu aynan moysklad create-formasi ko'rsatgani (capture `demand-03-new`: «Прибыль 0,00»). Real foyda
detail (`[id]`) sahifasида posted holatда hisoblanadi (o'zgarmadi).

### ✅ «Остаток» (Qoldiq) kolonka — JONLI
moysklad pozitsiya jadvalida «Остаток» = joriy ombor qoldig'i (Кол-во'dan keyin). `PositionTable` `stock`
kolonkani qo'llaydi. demand/new allaqachon jonli stock-query (`stockMap`, storeId+assortmentId bo'yicha)
tutgan (avval nom-katak ostidagi hint uchun) → endi u **`rowsWithStock` memo** orqali har qatorga
merge qilinadi (derived, state mutatsiyasiz — qoldiq jonli qoladi) va `{key:'stock'}` kolonka Кол-во'dan
keyin qo'shildi. Nom-katak soddalashtirildi (hint olib tashlandi — Остаток endi alohida kolonka, 1:1).

## DEFER / keyingi (halol)
- **«Себест. единицы» (costPerUnit) — DEFER (blocked).** Ikki sabab: (1) `/products` API `buyPrice`'ni
  **QASDDAN strip qiladi** (`product.service.ts:155` — biznes qarori); (2) demand COGS faqat o'tkazishда
  FIFO orqali ma'lum → qoralamада birlik-себест yo'q. Ustun har doim bo'sh bo'lardi → qo'shilmadi.
- **«Ячейка» (bin) kolonka — keyingi sessiya (BE).** `DemandPosition` prisma modelида `cell` ustun YO'Q →
  schema + migration + BE kerak (§MULTI-AGENT WIRING protokoli: markaziy schema commit alohida). DS `cell`
  kolonkani qo'llaydi, FE arzon — lekin BE persist bo'lmaguncha wire qilinmaydi.
- **«Грузоотправитель» blok-sarlavha** (shipping 10 maydonni guruhlash) — FE-only, keyingi sessiya (1B).
- **Custom-attributes editor create'да** (detail parity) — FE, keyingi sessiya (1B).

## Gate
- typecheck web = 0 ✅ · biome `demands/new` = 0 ✅ · i18n `position_cols.stock` ru+uz mavjud ✅
- demand testlar 15/15 PASS (regress yo'q) ✅ · DocumentTotalsPanel profitMinor prod'да mavjud (DS test yo'q)
- ⚠️ pre-existing (aloqasiz): `labels/print` no-hardcoded · `label-grounding` ENOENT (capture yo'q, migratsiya)

## Browser-cert (Playwright MCP, uz-locale)
`:3100/demands/new` → **jonli smoke:** (1) bo'sh totals «Прибыль: 0,00» (Кол-во YO'Q) ✅;
(2) UzKabel VVG 2x2.5 qo'shildi → pozitsiya qatorида **«Qoldiq: 140»** (real ombor qoldig'i, jonli) ✅ +
Narx 770 000 / NDS 12 / Summa 770 000. Kolonkalar: Nomi·Miqdor·**Qoldiq**·Narx·NDS·Skidka·Summa — moysklad
`demand-03-new` bilan mos (qolgan Маркировка=QISM4, Себест=defer). Artefakt: `demands-live-2026-07-23/
our-new-1B-{empty,withpos}.png` (gitignored).

**HALOL yorliq:** QISM 1B position-economics = **vizual+runtime verified**; 1B TO'LIQ EMAS (Грузоотправитель /
custom-attrs / bin qoldi). «100% 1:1» YO'Q — u faqat QISM 5 QA'dan keyin.
