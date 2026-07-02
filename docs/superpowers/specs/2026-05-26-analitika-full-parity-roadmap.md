# Analitika moduli — to'liq referens-parity yo'l xaritasi

**Sana:** 2026-05-26
**Referens:** `D:\projects-desktop\projects\KONTRAGENTLAR` (haqiqiy Alibobo Next.js loyihasi — `TIZIM-QOLLANMA.md` shu yerdan)
**Sabab:** 2026-05-25 implementatsiya sayoz edi (men brainstorming'da "tabs/havola" tanlovlarini olganman, lekin bu strict 1:1'ga zid edi). Foydalanuvchi "bir ga bir bo'lmagan" deb to'g'ri flagladi.

> **CLAUDE.md parity-audit protokoli:** Har sahifa rebuild oldidan referens A-F audit yoziladi va tasdiqlanadi. "Tugadi" hech qachon audit holatisiz aytilmaydi.

---

## Audit: referens vs hozirgi implementatsiya

| # | Referens sahifa | Hozirgi | Holat |
|---|---|---|---|
| 1 | `/` Dashboard | `/analitika` (sayoz KPI) | 🟡 |
| 2 | `inventory/` (bosh panel sahifa) | tab | 🔴 |
| 3 | `inventory/count` + count-modal | tab | 🔴 |
| 4 | `inventory/cycle` (ABC cycle counting) | **yo'q** | 🔴 |
| 5 | `inventory/approvals` | tab | 🔴 |
| 6 | `inventory/reports` (PDF/XLSX/snapshot) | tab (CSV bor) | 🔴 |
| 7 | `items/` (stats+toolbar+group-tree+table) | sodda mahsulot | 🔴 |
| 8 | `orders/` + `[id]` | bor | 🟡 |
| 9 | **`partners/` + `[id]/analysis` + order builder** | sayoz (faqat stats) | 🔴 **flagged** |
| 10 | `settings/` + password-form | yo'q | 🔴 |
| 11 | `settings/admin` (multi-tab) | yo'q | 🔴 |
| 12 | `settings/audit` | yo'q (havola qilingan) | 🔴 |
| 13 | `settings/reason-codes` (alohida) | sozlamalar ichida | 🟡 |
| 14 | `settings/roles` + permission matrix | yo'q | 🔴 |
| 15 | `staff/*` (xodimlar to'liq) | yo'q (HR'ga havola) | 🔴 |
| 16 | `sync/` (REGOS sinxron) | yo'q | 🔴 |

---

## Sub-project tartibi (har biri o'z spec + plan + audit bilan)

| # | Sub-project | Tavsif | Davomiylik |
|---|---|---|---|
| **P-K** | **Kontragentlar** (hozir) | partners list to'liq (kod/fullname/guruh/maqom/STIR/mobil/pagination/filter) + analysis (stats+sana+per-supplier order builder) | 2-3 sessiya |
| P-I | Inventerizatsiya bo'lish | tabni 4 alohida sahifa qilish (count/cycle/approvals/reports), count-modal | 2 sessiya |
| P-IC | Cycle counting | ABC-driven cycle scheduling (yangi feature) | 2 sessiya |
| P-IR | Reports kengaytirish | PDF/XLSX/snapshot | 1 sessiya |
| P-IT | Items chuqurlashtirish | stats+toolbar+group-tree (treeview) | 2 sessiya |
| P-O | Orders solishtirish + tuzatish | referens vs hozirgi delta | 1 sessiya |
| P-S | Sozlamalar to'liq | password + admin multi-tab + audit + reason-codes alohida + roles+matrix | 3 sessiya |
| P-X | Staff (xodimlar) Analitika ichida | list + tabs + [id] + new + me | 2 sessiya |
| P-Sy | REGOS sync sahifasi | hech bo'lmasa UI placeholder + tugma | 1 sessiya |
| P-D | Dashboard chuqurlashtirish | referens vs hozirgi delta | 1 sessiya |

**Jami eshamol:** ~17 sessiya / 4-6 hafta sodda ko'rinishda. Har sub-project oxirida live smoke (Playwright qaytganda) + memory yangilash.

---

## Har sub-project workflow (audit protokoliga rioya)

1. **Audit hujjati** — `docs/superpowers/specs/2026-MM-DD-analitika-<sub>-audit.md`: referens fayl/komponent ro'yxati, hozirgi vs referens jadval, delta (qo'shiladi/o'zgaradi/o'chiriladi).
2. **Plan** — `docs/superpowers/plans/2026-MM-DD-analitika-<sub>-plan.md`: bite-sized vazifalar, har biri haqiqiy kod bilan.
3. **Foydalanuvchi tasdig'i** — audit + plan ko'rilib, scope va semantika tasdiqlanadi.
4. **Ijro** — har task: typecheck + biome + test + commit.
5. **Smoke** — backend curl + (Playwright qaytganda) brauzer.
6. **Memory yangilash** — `project-state.md`.

---

## P-K: Kontragentlar (birinchi sub-project)

### Referens fayllar (rebuild manbai)
- `src/app/(dashboard)/partners/page.tsx` (wrapper)
- `src/app/(dashboard)/partners/partners-view.tsx` (183 satr — search+group+deleted+pagination)
- `src/app/(dashboard)/partners/partners-table.tsx` (211 satr — kod/name+fullname/guruh/maqom/STIR/telefon/actions, mobile-card+desktop-table)
- `src/app/(dashboard)/partners/[id]/analysis/page.tsx`
- `src/app/(dashboard)/partners/[id]/analysis/analysis-view.tsx`
- `src/app/(dashboard)/partners/[id]/analysis/filter-panel.tsx` (sana oralig'i)
- `src/app/(dashboard)/partners/[id]/analysis/stats-cards.tsx`
- `src/app/(dashboard)/partners/[id]/analysis/products-table.tsx` (**per-supplier order builder — qty input + pastdagi panel**)
- `src/hooks/use-partners.ts`, `src/hooks/use-analysis.ts`
- `src/app/api/partners/route.ts`, `src/app/api/partners/[id]/analysis/route.ts`

### Moysklad'da kerakli o'zgarishlar
**Backend (`apps/api/src/modules/analitika/`)**
- `analysis.service.listCounterparties` ni kengaytirish: `code`, `legalTitle` (fullname), `groupId+groupName` (Group join), `inn` (`uzData.inn`), `legalStatus` (companyType→Natural/Juridical), `archived` (deleted), pagination (page+pageSize). Guruh ro'yxati alohida (filter dropdown uchun).
- `analysis.analyze`'ga sana filtri allaqachon bor (from/to), lekin `products` (per-supplier mahsulotlar ro'yxati + qoldiq + narx) qo'shish.
- `order.service.create` ni `counterpartyId` bilan ishlatish allaqachon bor (schema'da optional) — UI uzatishi kerak.

**Frontend (`apps/web/src/app/(app)/analitika/kontragentlar/`)**
- `page.tsx` rebuild (referens partners-view bo'yicha)
- yangi `kontragentlar-table.tsx` (mobile-card + desktop-table, dropdown actions)
- `[id]/page.tsx` rebuild (stats-cards + filter-panel + products-table)
- yangi komponentlar: `stats-cards.tsx`, `filter-panel.tsx`, `products-table.tsx`

**i18n** — yangi kalitlar (kod, fullname, guruh, maqom, STIR, harakatlar, mobile labels, Jismoniy/Yuridik, sana filtri, products table headers, savat paneli).

### Quality gate'lar
- typecheck + biome + 6+ yangi unit test (kengaytirilgan listCounterparties, products endpoint, mobile/desktop responsive rendering tests opsional)
- backend API curl smoke (list pagination + group filter + analysis with products)
- Playwright qaytganda — list filter+pagination+mobile+detail+per-supplier order builder click oqimi

---

## Eslatma

Bu yo'l xaritasi yashayotgan hujjat. Har sub-project tugaganida tasdiqlanadi (✅) va keyingisi boshlangan paytda audit hujjati linkka qo'shiladi.
