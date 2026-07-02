# Full Parity → Professional Level — Design Spec

**Sana:** 2026-05-29
**Maqsad:** moysklad.uz bilan 1:1 parity'ni `MOYSKLAD-PARITY-AUDIT-PROTOCOL.md v2.2` darajasida, 56+ sahifa bo'yicha, professional (chala emas) holatga yetkazish.
**Status:** Design — approved (3/3 bo'lim), spec review kutilmoqda.

---

## 0. Nega bu spec kerak (measure-first baseline)

2026-05-29 da fayl-tizimi dalili bilan o'lchandi (taxmin emas):

| Protokol talabi | Holat | Dalil |
|---|---|---|
| Capture script (`pnpm capture-moysklad`) | ✅ bor | `scripts/capture-moysklad-references.ts`, package.json:27 |
| Phase 0 reference library (`<module>/states/*.png` + `metadata.json`) | ❌ **0** | `find … -name states` = 0; `metadata.json` = 0 |
| Per-page delta (`docs/audit-<module>.md`) | ❌ **0** | git tarixida hech qachon commit qilinmagan |
| Roadmap "Done" markeri | ⚠️ **2** | faqat C1 purchase-orders + I20 task-types ✅; 84 ⏳ pending |
| To'liq 4-faza yopilgan sahifa | ❌ **0/56** | purchase-orders ham hozir qayta-audit qilinyapti (uncommitted `audit-po-*.md`) |

**Mavjud, lekin protokol formatida emas:** `visual-captures/NN-module/<entity>/dom/*.html` — eski (2026-05-20) DOM dump'lar (dropdown item'lar, edit-tab'lar, picker). Bular yordamchi, lekin Phase 4 side-by-side uchun yetarli emas.

**Roadmap vs Memory ziddiyati:** autonom A-K pass (2026-05-25) = **filter-panel parity sweep** (~36 sahifa list-filter), protokolning to'liq 4-fazasi EMAS. Roadmap markerlari hech qachon yangilanmagan.

**Xulosa:** Protokol v2.2 boshlangan, lekin tugamagan. Eng katta yo'qolgan bo'g'in: (1) reference library generatsiya qilinmagan, (2) per-page audit deliverable yo'q, (3) jarayon kuzatilmagan.

---

## 1. Dekompozitsiya

Ish bitta spec'ga sig'maydi → sub-loyihalarga ajratiladi.

### Sub-loyiha 0 — Poydevor (BIRINCHI; blokerlarni ochadi)
1. `capture-moysklad-references.ts` ni hozirgi moysklad.uz'ga qarshi tuzatish/tekshirish.
2. Credential: `.env.local` (gitignored) — `MOYSKLAD_URL/EMAIL/PASSWORD`, foydalanuvchi to'ldiradi.
3. Protokol-mos output: `docs/moysklad-reference/<module>/states/01..12-*.png` + `metadata.json` (PNG gitignore, metadata commit).
4. **Pilot:** customer-orders'ni boshidan oxirigacha capture — pipeline ishlashini isbotlash (1 sahifa end-to-end).
5. Roadmap → haqiqiy tracker: `docs/PARITY-TRACKER.md` — har sahifa × har faza holati (o'lchangan).
6. Qayta ishlatiladigan **Definition of Done** checklist shabloni (§2).

### Sub-loyiha 1..N — Har sahifa chuqur audit (depth-first)
- Tartib (yuqori-traffic): A1 customer-orders → A2 demands → A3 invoices-out → A4 sales-returns → B (money 7) → C (purchase 5) → D (master 6) → E (warehouse 6) → F (CRM, UI bor) → H (production, UI bor) → I (settings ~19) → J (reports, UI bor) → K (other, UI bor).
- Har sahifa = protokolning to'liq 8 qadami + `audit-<module>.md` + commit + tracker yangilash.
- Har sahifa alohida spec OLMAYDI — protokol + `audit-<module>.md` mini-spec vazifasini bajaradi.

### Resurs modeli
- **To'liq Opus** (foydalanuvchi qarori). Audit + fix + verify hammasi asosiy context'da.
- Sahifalar **ketma-ket** (parallel emas) — shared component (`InlineFilterPanel`, `DataTable`, `ListView`, `Modal`) va i18n (`uz.json`/`ru.json`) two-writer xavfi.

---

## 2. Definition of Done (har sahifa — qattiq darvoza)

Sahifa faqat **HAMMASI** yashil bo'lganda "tugadi":

**A. Reference (Phase 0)**
- [ ] `moysklad-reference/<module>/states/` kerakli holatlar + `metadata.json` commit.

**B. Audit deliverable**
- [ ] `docs/audit-<module>.md` — delta ro'yxati (structural + interactive + stateful) + har delta yechimi.

**C. 4-faza yashil**
- [ ] Phase 1 Structural — har element bor, to'g'ri joyda (top-bar, filter panel, table, detail, modal).
- [ ] Phase 2 Interactive — dropdown item'lar moysklad bilan match; header sort ▲▼; resize; gear ⚙; **silent no-op yo'q** (onClick yoki disabled+tooltip); affordance; single source of truth; sortable header API enum'da ham bor.
- [ ] Phase 3 Stateful — S1–S13 (default/empty/loading/error/filter/selection-0/1/many/saved-filter/pagination/sort/column-hidden/mobile).
- [ ] Phase 4 Reference side-by-side — Playwright screenshot vs moysklad, element-by-element diff.

**D. Kod darvozalari**
- [ ] `pnpm --filter @moysklad/api typecheck` 0
- [ ] `pnpm --filter @moysklad/web typecheck` 0
- [ ] tests green (yangi logika → yangi test)
- [ ] biome 0/0 (tegilgan fayllar; pre-existing warning qayd)
- [ ] RU qoldiq yo'q (`git grep -i "Печать\|Изменить\|Сохранить\|Найти\|Очистить"`)
- [ ] Husky pre-commit + commit-msg; Ozodbek identity

**E. Tracker**
- [ ] `PARITY-TRACKER.md` da sahifa ✅ + commit hash + sana.

**Qoida:** iteratsiya yo'q — bitta sahifa uchun **Audit ALL → Fix ALL → Verify ALL → Claim ONCE**. "Tugadi" faqat 4-faza + side-by-side tasdiqlangach.

---

## 3. Scope chegaralari (silent cap yo'q — ochiq qayd)

### ✅ Scope ichida — web UI'si bor moysklad sahifalari (~56)
- A Sales (4) · B Money (7) · C Purchase (6) · D Master (6) · E Warehouse (6) · F CRM (UI bor: F1-F5) · H Production (UI bor qismlari) · I Settings (~19) · J Reports (UI bor ~12) · K Other (UI bor qismlari).
- Har document sahifaning **3 ko'rinishi**: list + detail + new/edit.
- **Print/PDF fidelity** (ЗАКАЗ va h.k.) — detail "Chop etish" qismi sifatida har hujjat sahifasiga kiradi.

### ⚠️ Scope chetida — ochiq qayd qilinadi
- **UI'si yo'q backend-only:** G Retail (3), F6 contracts, F7 projects, H1 bom / H2 work-orders (memory: web page yo'q), ba'zi J reports (J1 dashboard, J3 turnover). Tracker'da "UI yo'q → N/A yoki yangi-qurish" deb belgilanadi. Kerak bo'lsa alohida sub-loyiha (UI qurish).
- **HR moduli** va **Analitika moduli:** moysklad'ning 56 sahifasiga kirmaydi (custom spec). Moysklad visual 1:1 protokoli ular uchun qo'llanilmaydi (reference yo'q). Umumiy sifat darvozalaridan o'tgan. Alohida fidelity kerak bo'lsa — alohida ish.

### Taxminiy hajm
~56 sahifa × 3-4 soat = ~150-200 soat real ish. Depth-first → har sahifa tugagach foydalanuvchiga ko'rsatiladi.

---

## 4. Texnik xavflar (oldindan qayd)

1. **Capture script eskirgan (2026-05-20).** moysklad.uz DOM o'zgargan bo'lishi mumkin → selektorlar sinishi mumkin. Mitigatsiya: Sub-loyiha 0 pilot 1 sahifada to'liq sinaladi, keyin --all.
2. **moysklad connection-limit (seat).** Capture session foydalanuvchi seat'ini band qiladi → «Превышен лимит подключений». Mitigatsiya: capture tugashi bilan session yopiladi; foydalanuvchi capture vaqtida moysklad'dan chiqib turadi.
3. **Credential xavfsizligi.** `.env.local` gitignored; parol hech qachon commit/log qilinmaydi.
4. **Shared component ripple.** Bitta `InlineFilterPanel`/`DataTable` o'zgarishi 16+ sahifaga ta'sir → har shared o'zgarishdan keyin regress smoke (avval yopilgan sahifalar buzilmasin).
5. **PNG hajmi.** Reference PNG gitignored; faqat metadata.json commit (protokol 4.1.D).

---

## 5. Deliverable'lar (umumiy)

- `docs/PARITY-TRACKER.md` — jonli holat jadvali (har sahifa × faza × commit).
- Har sahifa: `docs/audit-<module>.md` + `moysklad-reference/<module>/states/metadata.json` + kod commit(lar).
- Sub-loyiha 0 oxirida: ishlaydigan `pnpm capture-moysklad <module>` + customer-orders pilot reference + DoD shablon.

---

## 6. Keyingi qadam

Spec review (foydalanuvchi) → `writing-plans` skill bilan **Sub-loyiha 0 (Poydevor)** uchun aniq implementation plan.
