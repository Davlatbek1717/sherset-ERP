# SESSION-CHECKLIST — drift prevention

> **Yangi sessiya yakunida MAJBURIY o'tiladi.** NEXT.md ni yangilashdan oldin.
>
> Sessiya boshlanganda foydalanuvchi `davom et` desa, Claude bu hujjatni ham
> avtomat o'qiydi va har checklist itemi bo'yicha verify qiladi.

---

## 🛡️ Har sessiya yakunida — majburiy gates

### 1. Yangi backend endpoint qo'shildi?
- [ ] **Live smoke test** real DB'da: `pnpm smoke <module>` ishga tushir → ALL GREEN
- [ ] **Adversarial QA** — yangi `pnpm smoke` adversarial pack avtomat ishlatadi (empty/invalid/missing UUID)
- [ ] **Tenant boundary** alohida tekshiruv: boshqa account ID bilan POST → access denied bo'lishi shart
- [ ] **Concurrency** (last-write-wins): ikki parallel POST same ID — ikkisi succeeded, deadlock yo'q
- [ ] Agar API ishlamayotgan bo'lsa: `pnpm --filter @moysklad/api dev` ishga tushir, keyin smoke
- [ ] Agar smoke FAIL → commit qilinmaydi. Sabab tuzatib qaytadan smoke

### 2. Yangi frontend dropdown/modal qo'shildi?
- [ ] **moysklad metadata.json** bilan **byte-by-byte solishtir** (item count, label, disabled state, order)
- [ ] **Onclick handler real backend chaqiradimi?** (fake `/clone`, fake `/mass-edit` taqiqlangan — `disabled` qilish kerak)
- [ ] **Bo'sh patch / no selection** → button disabled bo'lishi shart

### 3. Bug topildi?
- [ ] **Bug-class sweep**: "shu pattern qayerda yana takrorlanadi?" — grep + read peer modules
- [ ] **Fix barcha topilgan instances** (bittasi emas)
- [ ] **Memory'da bug-class deb belgilash** + topilgan locations

### 4. Progress raqami yangilanadi?
- [ ] `find apps/web/src -name "bulk-actions-dropdown.tsx"` — real count (NB: page-local `app/**/_components/` ones, e.g. employees, are missed by a `src/components`-only search)
- [ ] Inflatsiya yo'q: shared/inline ham hisoblansa, ALOHIDA ko'rsatish
- [ ] "X/56" naqshini har xil sifat darajalariga ajratish (dedicated / shared / inline)

### 5. Sessiya scope tor doirada qoldi? — **HARD GUARD**
- [ ] **Avtomat tekshiruv**: `pnpm progress` ishga tushir. Agar `detail_pages.audited_pct < 20` VA `list_pages.phase2_pct > 25` → keyingi sessiya MAJBURIY detail/modal/navigation
- [ ] **3-sessiya naqshi**: `git log --since="3 days ago" --pretty=format:'%s' | head -20` — agar bitta naqsh (`list-page audit`, `mass-edit wire`, va h.k.) 3+ sessiya'da yetakchi bo'lsa → **DRIFT signal**
- [ ] **Istisno**: foydalanuvchi aniq aytsa (`list page davom et`, `audit boshqa modul`) — scope guard chetlab o'tiladi
- [ ] **Drift bo'lsa**: NEXT.md "Aniq keyingi vazifa" bo'limini detail/modal/navigation'ga o'zgartir

### 6. Halol qaydlar memory'ga
- [ ] Bajarilgan ish (faktik commit hash'lar)
- [ ] Skip qilingan ish (sabab bilan)
- [ ] Topilgan bug + sweep coverage
- [ ] Sessiya'ning **drift signals** (inflatsiya, skip, takror)
- [ ] Keyingi sessiya uchun **aniq vazifa + risk** ko'rsatish

---

## 🔴 Anti-pattern'lar (qaytarmaslik kerak)

| Anti-pattern | Misol | Tuzatish |
|---|---|---|
| **Mirror-verified ≠ live verified** | "5 mass-edit endpoint qo'shildi, gates yashil" — lekin real DB'da test yo'q | Har endpoint uchun `bash /tmp/smoke-*.sh` |
| **Bug topib bittasini tuzatish** | counterparty clone-404 — products audit'da ataylab takrorlanmaslik, lekin counterparty'da hamon qoldi | grep peer files + fix all |
| **"X/56" inflation** | NEXT.md "26/56" — haqiqiy 12 dedicated + 4 shared = ~16 | Sifat darajalariga ajratish |
| **Skip detail/modal/navigation** | 8 sessiya list-page'larda — detail page'lar 0% | Har 3-sessiya'da bittasi detail/modal'ga |
| **Workflow agent'lar fail bo'lsa, qaytadan urinish** | 4 ta agent session limit'ga uchradi, qayta-qayta urinish | Sequential fallback'ga o'tish |
| **"Happy path ishlaydi" → "production-ready"** | typecheck yashil + unit test yashil = production-ready emas | Phase 2 (Adversarial) majburiy |

---

## 📊 Joriy taraqqiyot (sifat darajalariga ajratilgan)

| Daraja | Coverage | Misol |
|---|---|---|
| **Dedicated dropdown component** | 12/56 = **21%** | (`progress.json` source-of-truth) assortment · counterparties · currencies · customer-orders · demands · enters · inventories · losses · moves · projects · supplies · uoms — *employees has a page-local dropdown the automated find misses (real ≈13); products covered by shared assortment* |
| **Shared dropdown** (assortment) | +3 page reusing | products, services, bundles → 1 shared |
| **Inline page-level dropdown** | +1 (purchase-orders) | inline `BulkActionDropdown` (eski naqsh) |
| **Hech narsa qilinmagan list page** | ~40/56 = **71%** | task-types, projects-list, va h.k. |
| **Detail page audit** | 11/63 = **17%** | seed-bor hujjat 6/6 + 5 katalog (counterparties·products·projects·stores·uoms) |
| **Modal audit** | 0/many = **0%** | TEGILMAGAN |
| **Navigation graph** | 0% | TEGILMAGAN |
| **Adversarial QA coverage** | 17/23 mass-edit endpoint | 6 untested mass-edit (low seed data) |
| **Live smoke coverage** | 13/23 mass-edit endpoint | 10 untested (seed empty, kelajakda) |

**HALOL maqsadga nisbatan:** ~20-25% (sirt darajasi yaxshi qoplangan, ichkari/funksional/navigation hali boshlanmagan).

---

## 🎯 Sessiya boshlash protokoli (Claude bajaradi)

Foydalanuvchi `davom et` desa:
1. `NEXT.md` o'qish
2. **Bu hujjatni** o'qish (SESSION-CHECKLIST.md)
3. Eng oxirgi `session-*.md` o'qish
4. Foydalanuvchiga **3-5 qator** qisqacha: "Joriy holat: X. Boshlayman: Y. Drift risk: Z"
5. Ish boshlash + **har checklist itemini bajarish**
6. Sessiya yakunida: bu hujjat checklist'idan o'tib, NEXT.md ni yangilash

---

> **Bu hujjat sessiya bo'yicha o'zgartirilmaydi.** Checklist barqaror.
> Foydalanuvchi yangi qoidalar qo'shsa, faqat u o'zgartiradi.
