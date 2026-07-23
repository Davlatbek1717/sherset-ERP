# VPS «moysklad» fork → Sherset: Продажи bo'limini port qilish — REJA + FARQ-TAHLILI

> **Maqsad:** VPS `/var/www/moysklad` (Biznesjon-Official/moysklad fork) ning **Продажи** bo'limi funksiyasini
> Sherset'ga olib kirish (foydalanuvchi qarori 2026-07-23: **VPS versiyasi almashtirsin**, backend+DB bilan).
> **Status:** QISM 0 — recon + farq-tahlil ✅ (bu sessiya). Port = keyingi sessiyalar (worktree-izolyatsiya).

## 0. Kontekst (grounded)

- VPS `/var/www/moysklad` va lokal `Sherset` — **bir loyihaning (moysklad-clone) ikki ajralib ketgan (diverged) fork'i**, alohida git-repo (`Biznesjon-Official/moysklad` vs Sherset'da remote yo'q). VPS bugun ham faol (763c9d90, 2026-07-23 12:39).
- **SSH kirish o'rnatildi:** `ssh climart` (kalit `~/.ssh/climart_v.pub` root@45.67.216.61'da; `~/.ssh/config`'da `Host climart`). Parolsiz. **Server FAQAT o'qiladi** (kod olish; DB/boshqa loyihalarga tegilmaydi). VPS `git archive` = **~3 GB** (katta committed fayllar) → to'liq emas, **maqsadli yo'llar** bilan olinadi.
- Foydalanuvchi qarori: **(1)** VPS wholesale almashtirsin · **(2)** Продажи'dan boshlab · **(3)** kerak bo'lsa backend+DB ham.

## 1. Farq-tahlil (Продажи FE — VPS vs Sherset)

Har fayl VPS'dan `git archive HEAD -- <path>` bilan olindi (scratchpad), `diff` bilan solishtirildi.

| Sahifa | VPS qator | Sherset qator | Farq qator | Baho |
|---|---|---|---|---|
| customer-orders/page | 2297 | 2248 | ~355 | ~85% umumiy — **yaqin** |
| customer-orders/[id] | 2390 | 2210 | ~324 | yaqin |
| customer-orders/new | 2005 | 1788 | ~371 | yaqin |
| demands/page | 1775 | 1445 | 1798 | **deyarli to'liq qayta yozilgan**, VPS kattaroq |
| sales-returns/new | 1732 | 1151 | 1451 | VPS ancha kattaroq |
| retail/page | 704 | **5** (stub) | 703 | VPS to'liq · Sherset stub (sotuv/ ga ko'chirilgan?) |

**Umumiy naqsh:** **VPS Продажи to'liqroq** (demands/sales-returns/retail'da ancha kattaroq; commission-reports'da VPS-only `new`+`new-in` sahifalar). Bu foydalanuvchi tanlovini tasdiqlaydi. **HAR bir Продажи FE fayli farq qiladi** (struktura bir xil, kontent divergent).

**Shared-infra ham divergent (VPS'nikiga almashtirilmaydi — boshqa bo'limlar tayanadi):**
- `apps/web/src/lib/api-client.ts` — VPS 177 / **Sherset 247** qator (Sherset kattaroq). → VPS sahifalari Sherset api-client'iga **moslashtiriladi**.
- `apps/api/src/modules/customer-order` — modul strukturasi **bir xil** (controller/service/schema/schema.test/module). → fayl-bo'yicha reconcile.
- DB sxema: VPS `schema.prisma` 8939 / **Sherset 9356** qator (Sherset kattaroq). → sxema **wholesale almashtirilMAYDI**; Продажи-modellariga kerakli maydonlar **qo'shiladi/reconcile** qilinadi.

## 2. Muhandislik strategiyasi (nega fayl-nusxa emas)

VPS sahifasi o'z bog'liqliklariga (api-client metodlari, design-system komponentlari, i18n kalitlari, Prisma modellari, lib helperlari) tayanadi. Sherset'da bular **boshqacha va kattaroq**. Shuning uchun har sahifa uchun:
1. VPS FE + API modulini olib kel (maqsadli `git archive`).
2. Sherset shared-infra'siga **moslashtir** (import/chaqiruvlarni Sherset ekvivalentlariga, tiplarni reconcile).
3. Kerakli API endpoint / Prisma maydonlarини **qo'sh** (Sherset qo'shimchalarини **o'chirmasdan**).
4. **Gate:** `pnpm typecheck` 0 · `biome` 0 · i18n key-existence ru+uz · web build — **har klasterda**.

**Izolyatsiya (MAJBURIY, §6.5):** port **worktree'da** qilinadi — parallel sessiya `main`'da (demand ustida) ishlayapti; Продажи ularning yo'llari bilan kesishadi. Worktree buzilgan build'ni izolyatsiyalaydi; tayyor bo'lganda branch orqali merge.

## 3. Klaster tartibi (eng yaqindan eng og'irga — har biri 1 sessiya)

Har klaster = FE (page + [id] + new) + API modul + kerakli sxema + gate + worktree-branch.

1. **customer-orders** (eng yaqin, ~355/fayl) — port-protsedurasini o'rnatadi, eng past risk. **Birinchi.**
2. **invoices-out** (yaqin) + **factures-out**.
3. **commission-reports** (+ VPS-only `new`/`new-in`) + **consignments**.
4. **demands** (deyarli qayta yozilgan; ⚠️ parallel sessiya faol shu ustida — koordinatsiya/keyinga).
5. **sales-returns** (VPS kattaroq; ⚠️ Sherset bu sessiyada 1:1 qildi — VPS almashtiradi, foydalanuvchi tasdiqladi).
6. **retail** (retail/ · retail/sales · retail/sessions · retail/z-report; Sherset stub → to'liq VPS; sotuv/ bilan reconcile).

> **HALOL yorliq:** har klaster «Phase-1: portlangan + typecheck/build o'tdi» — **runtime browser-cert alohida** (VPS yonida solishtirish).

## 4. Xavflar
- **DB sxema to'qnashuvi** — Продажи modellari (CustomerOrder, Demand, SalesReturn, RetailSale…) VPS'da boshqa maydonlarga ega bo'lishi mumkin; migration Sherset'ning mavjud migratsiyalari bilan mos kelishi shart (yangi migration, drop EMAS).
- **Shared-komponent divergensiyasi** — VPS sahifasi Sherset'da yo'q design-system komponentini chaqirsa → komponent ham port yoki Sherset ekvivalentiga moslash.
- **Parallel sessiya** — demands/sales-returns'da faol; klaster 4/5 koordinatsiya talab qiladi.

## 5. Keyingi qadam
Klaster 1 (**customer-orders**) — worktree ochib, VPS FE+API modulини olib, Sherset'ga moslashtir, typecheck 0 gacha, branch'ga commit. Reference: VPS kodi `git archive HEAD -- 'apps/.../customer-orders' 'apps/api/src/modules/customer-order'` (scratchpad'da namunalar bor).
