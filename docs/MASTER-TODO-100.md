# MASTER-TODO — 100% gacha to'liq ro'yxat

> **Yozilgan:** 2026-07-27 · **Branch:** `climart-adoption` · **HEAD:** `79b1ff7`
> **Manba:** taxmin EMAS — shu kuni jonli o'lchov (typecheck · 2 to'liq Vitest suite · biome · git · fayl-hisob).
> **Maqsad:** shu fayldagi **157 band** bajarilsa loyiha **100%** bo'ladi (ta'rif §0).
> *(116 → 136 → 150 → 157: uch completeness-tekshiruvdan o'tgan — revizion tarixga qarang.)*
>
> **Ishlatish qoidasi:** har `davom et` sessiyasi shu fayldan **keyingi ochiq bandni** oladi (blok tartibida),
> bajaradi, `[ ]` → `[x]` qiladi va «Bajarildi» ustuniga commit-hash + sana yozadi. `NEXT.md` — sessiya hand-off'i;
> bu fayl — **to'liq scope reestri**. Ikkalasi sinxron turadi.

---

## §0. «100%» ta'rifi (halol chegara)

Loyihaning 4-fazali modeli (`docs/audits/_PHASE2-100-PLAN.md` §0) bo'yicha 100% =

| Faza | Nima | Hozir |
|---|---|---|
| **Phase-1** | Har sahifa strukturaviy to'g'ri (maydon/label/xulq/wiring moysklad bilan mos) | 🟠 `main`'da 63/69; bu branch'da qayta tekshirilmagan |
| **Phase-2** | Runtime correctness — real brauzer + adversarial QA (pul/konkurensiya/edge) | 🔴 bu branch'da 0 |
| **Phase-3** | Vizual pixel-1:1 (o'lcham/rang/shrift/joylashuv) + staging | 🔴 ~5% (1 sahifa) |
| **Phase-4** | Production — monitoring/backup/CI/gradual rollout | 🔴 boshlanmagan |
| **Gate** | typecheck 0 · biome 0 · Vitest 0 fail · e2e yashil | 🔴 133 fail · 601 biome error |

**«Tugadi» deyish sharti** (`CLAUDE.md` §1): har band uchun dalil (test/commit/browser-smoke) ko'rsatilishi shart.
Dalilsiz «done» TAQIQLANGAN.

---

## §0.1. Boshlang'ich holat — o'lchangan raqamlar (2026-07-27)

| O'lcham | Qiymat |
|---|---|
| Kod (TS/TSX, generated'siz) | ~429 000 qator (api 165k · web 244k · packages 20k) |
| Prisma model / migratsiya | 208 / 167 (schema 9 604 qator) |
| Backend modul / controller / endpoint | 115 / 154 / 1 214 |
| Frontend sahifa | 325 (69 `[id]` · 60 `/new` · 78 settings) |
| Test fayl / test | 475 / 6 512 |
| **typecheck** | ✅ **0 xato** (9/9 paket) |
| **API Vitest** | 🔴 **4012 pass / 62 fail** (15 fayl) |
| **Web Vitest** | 🔴 **2364 pass / 71 fail** (29 fayl) |
| **biome check .** | 🔴 **601 error / 1853 warning** |
| i18n kalit | ru 7 641 · uz 7 642 (1 farq) |
| E2E spec | 7 (325 sahifaga) |
| moysklad capture korpusi | 🔴 **0 fayl** (`docs/moysklad-reference/` bo'sh) |

**Umumiy tayyorlik: ~55%** *(tekshiruv №3 dan keyin tuzatildi — hisobotlar kutubxonasi 16/200+ hisobga olindi)*

---

## §0.1b. Ijro jurnali

| Sana | Commit | Bandlar | Natija |
|---|---|---|---|
| 2026-07-28 | `a430879` | **117a · 117b** | Zaiflik **78 → 30** (prod 74 → **22**). Direct bump + 12 tranzitiv override, hammasi bir major ichida |
| 2026-07-28 | `925f512` | **144** | 4 xato-chegarasi + 21 guard test. Oq-ekran bug-class'i yopildi |
| 2026-07-28 | `c60f1fe` | **138 · 139 · 142 · 30** | «KEEP» to'plamidan yo'qolgan 3 sahifa + nav + BE `dayOffset` tiklandi; tiklash paytida **yangi 500-bug** topilib yamaldi (`?dayOffset=1e15` → RangeError) + 8 guard test; ru↔uz **7646 = 7646** |
| 2026-07-28 | `83c3d5e` | **19 · 20** | Qarz entity'lari 3 seed-ro'yxatiga; `scopeFromTemplate` + 2 Qarz rol shabloni. **2 real bug:** `seedSystemRoles` `overrides`ni e'tiborsiz qoldirardi · HR guard testi async imzoga moslanmagani uchun **HR RBAC umuman tekshirilmay turgan edi** |
| 2026-07-28 | `61323d6` | **1** | org-account guard literal→invariant, fetcher-tanasi skani. **Xavfsizlik teshigi yo'q edi** — dastlabki «money-critical» bahom noto'g'ri. Mutatsiya: 4/4 tutiladi |
| 2026-07-28 | `42a72c3` | **2** | O'lik «Sklad» maydoni **saqlashni buzardi** (GPS jadval jimgina yo'qolardi) — olib tashlandi; allowlist + 8 literal-marshrut pin |
| 2026-07-28 | `(3+4)` | **3 · 4** | Ikkalasi ham **stale-registry** klassi bo'lib chiqdi (snapshot-import). #3 da o'rniga **CSV eksport valyuta bug'i** topilib tuzatildi (USD faktura «сум» bo'lib eksport bo'lardi); #4 da registr manbadan chiqariladigan qilindi |
| 2026-07-28 | `(11+28)` | **11 · 28** | #11 eskirgan dalil edi — `094872d` da allaqachon yopilgan (44/44 pass), kod bilan qayta tasdiqlandi. #28: mahsulot kodi biome **19 → 0 error**, `scripts/check-lint.mjs` gate + pre-push. Asosiy nuqson — `pnpm lint` doim qizil bo'lgani uchun gate emasligi edi. Mutatsiya 2/2 |
| 2026-07-28 | `(12)` | **12** | Xom-element qarzi **31 → 0**, guard baseline'dan **chiqarildi** (endi 1 ta bloklangan fayl qoldi). Web suite **26 → 25 fail** — qolganining hammasi `label-grounding` (#35 bloki). Yo'l-yo'lakay: 3 filtr sahifasining vizual chetga chiqishi, native-kalendar → o'z kalendarimiz, va 1 ta a11y regressiyasi (label→div) tuzatildi |

**Regressiya nazorati:** har commit'dan keyin ikkala to'liq suite yugurtirildi. api **62 fail** va web **71 fail** — ish boshidagi baseline bilan **aynan bir xil** (web'da `+21` yangi o'tgan = qo'shilgan guard). typecheck **9/9** har safar.

---

## §0.2. Bloklar xaritasi

| Blok | Bandlar | Sessiya | Bog'liqlik |
|---|---|---|---|
| [0 — Qarzlarni yopish](#blok-0--qarzlarni-yopish-majburiy-birinchi) | 1–34 | 8–10 | — |
| [1 — Adoption tugatish](#blok-1--adoptionni-haqiqatda-tugatish) | 35–40 | 10–14 | Blok 0 · Sizdan A |
| [2 — Phase-2 runtime QA](#blok-2--phase-2-runtime-qa-bu-branch-uchun-noldan) | 41–50 | 12–16 | Blok 1 |
| [3 — Funksional bo'shliqlar](#blok-3--funksional-boshliqlar) | 51–74 | 25–30 | Blok 0 |
| [4 — HR to'liq](#blok-4--hr-toliq-spec-2-out) | 75–82 | 10–12 | — |
| [5 — yangibolim](#blok-5--yangibolim-moysklad--telegram-tizimi) | 83–89 | 8–10 | Sizdan E |
| [6 — Vizual pixel 1:1](#blok-6--vizual-pixel-11) | 90–98 | 60–75 | Sizdan A |
| [7 — Test qamrovi](#blok-7--test-qamrovi) | 99–104 | 10–12 | Blok 0 |
| [8 — Production-ready](#blok-8--production-ready-phase-34) | 105–116 | 12–15 | Blok 2 |
| [9 — Platforma gigienasi + xavfsizlik](#blok-9--platforma-gigienasi-xavfsizlik-yoqolgan-funksiya) | 117–136 | 12–16 | — |
| [10 — Yo'qolgan route + xato-bardoshlilik](#blok-10--yoqolgan-routelar-xato-bardoshlilik-doc-drift) | 137–150 | 10–14 | — |
| [11 — Loyihaning o'z rejasidan qolgan scope](#blok-11--loyihaning-oz-rejasidan-qolgan-scope) | 151–157 | 65–90 | — |
| **JAMI** | **157 band** | **~242–315 sessiya** | |

**Boshlash tartibi (qat'iy):** ~~`117a/b → 144 → 138 → 139`~~ ✅ **BAJARILDI 2026-07-28** →
**keyingi: `1` (org-account money-critical) → `19` → `20` → `2` → `3`** → `117c`/`154` (Nest+Fastify major) →
`118`/`137` (drop qarori) → qolgan Blok 0 → `35` (capture — sizga bog'liq) → Blok 1 → Blok 2 →
parallel Blok 3/4 va Blok 6 → Blok 7/8/9/10.

---

# BLOK 0 — QARZLARNI YOPISH (MAJBURIY BIRINCHI)

> **Nega birinchi:** 133 test qizil bo'lgani uchun regressiya-himoya qatlami **o'chgan**. Bu blok tugamaguncha
> yozilgan har qanday yangi kod himoyasiz — buzilsa hech kim aytmaydi (testlar allaqachon qizil).
>
> **Sabab-tahlil:** bu faillar tasodifiy emas — climart forkini qabul qilishda Sherset'ning **parity-lock**
> testlari sinib qolgan. Ular climart sahifalari Sherset audit qilgan sahifalar EMASligini ko'rsatadi.

## Qism 0.1 — Web 71 fail (29 fayl)

| # | ☐ | Ish | Dalil (test nomi / fayl) | Og'irlik | Bajarildi |
|---|---|---|---|---|---|
| 1 | [x] | ✅ **`org-account` scope — TEKSHIRILDI: xavfsizlik teshigi YO'Q, guard-test drifti edi** | ⚠️ **Dastlabki baho («money-critical, pul boshqa yuridik shaxsga ketishi mumkin») NOTO'G'RI edi** — u test NOMIGA asoslangan edi. Verifikatsiya: 6 sahifaning **hammasi** `organizationId`ni to'g'ri uzatadi; BE hard guard `assertOrgAccountMatchesOrg` **11 doc-servisda ulangan** va testi **16/16 yashil**. Test 2 ta mo'rt literal ustida yiqilardi: (a) `invoices-out/[id]` `/bank-accounts` ishlatadi — bu BE'ning **rasmiy aliasi** (`reference.controller.ts:181`, «same shape … so pages can pick by intuitive name») va u ham `organizationId` bo'yicha filtrlaydi; (b) 5 sahifa `x.name \|\| x.accountNumber \|\| ''` yozadi (namunada `x.accountNumber \|\| x.name`) — ikkalasi ham «hech qachon bo'sh emas» invariantini bajaradi, va moysklad bu kontrolni **nom** bilan belgilaydi (jonli «Сум» dropdown — `PARITY-STATUS.md`). **Fix:** guard butun-fayl skanidan **`organizationAccountFetcher` tanasi ichida** tekshirishga o'tkazildi + invariant (scoped endpoint · organizationId · eski literal yo'q · name-fallback) literal o'rniga. **Mutatsiya-test bilan tasdiqlandi: original o'tadi, 4/4 buzilish tutiladi** (jumladan scoping'ni olib tashlash = asl money-bug) | 🔴→🟢 | 2026-07-28 |
| 2 | [x] | ✅ **FE→BE 4 buzilish — 3 tasi REAL (HIGH), 1 tasi soxta ijobiy** | 🔴 **REAL:** `hr/employees/_components/employee-modal.tsx` «Sklad» (omborchi) maydoni `/sklad-keepers` GET/PUT/DELETE chaqirardi, lekin `sklad-keeper` BE moduli adoption'da **DROP qilingan** → uchala chaqiruv jimgina 404. **Bu o'lik maydondan ham yomonroq edi:** `api.put` himoyalanmagan va `hrScheduleApi.setConfig/replaceWeek` dan OLDIN turardi → foydalanuvchi ombor tanlasa (1) xodim SAQLANARDI, (2) PUT 404 tashlardi, (3) **GPS ish joyi + haftalik jadval hech qachon yozilmasdi — jimgina yo'qolardi**, (4) modal xato bilan ochiq qolardi → dublikat yaratish xavfi. **Fix:** `SkladSelect` komponenti + `skladNo` form-maydoni + 3 chaqiruv + `keepersData` query olib tashlandi (feature moduli bilan birga qaytadi — #118/#137). 🟢 **SOXTA IJOBIY:** `settings/employees:164` `api.post('/hr/employees/${action}')` — uchala literal (`bulk-archive`/`bulk-restore`/`bulk-delete`) BE'da **bor**; static matcher `${action}`ni param sifatida ko'radi. Allowlist'ga qo'shildi (avvaldan 2 xuddi shunday yozuv bor edi) **+ teshikni yopish uchun 8 ta literal-marshrut pin testi** qo'shildi, aks holda allowlist ko'r nuqtaga aylanardi. `api-contract.test.ts` **1 → 9/9 test** | 🔴→🟢 | 2026-07-28 |
| 3 | [x] | ✅ **Tekshirildi: detail maydonlari ATAYLAB yo'q; o'rniga REAL CSV-bug topilib tuzatildi** | Test `value={formatMoney(paidBig)}` talab qilardi — bu bog'lanish **bu repo tarixida hech qachon bo'lmagan** (`git log -S` bo'sh); test «Sherset snapshot» importi bilan **boshqa repodan** kelgan (shallow history). Uni qondirish uchun maydon qurish **parity REGRESSIYASI** bo'lardi: sahifaning o'zida grounded izoh bor — «moysklad does NOT show a «Не оплачено»/«Оплачено» pill in the doc editor header (payment status lives only in the LIST «Оплачено» column)», va `fields.payed_sum` haqiqatan faqat LIST sahifalarida ulangan. **Buning o'rniga qiymat haqiqatan render bo'ladigan joyda REAL bug topildi:** `invoices-out` list'ining 3 pul ustuni CSV `cellText`da `formatMoney(x)` ni **yalang'och** chaqirardi → eksportda har qatorga default «сум» qo'shilardi (**USD hisob-fakturasi «1 000,00 сум» bo'lib eksport bo'lardi**) va CSV ekrandagi suffiksiz katak bilan ziddiyatda edi; `invoices-in` buni allaqachon to'g'ri qilgan. 3 ustun (`sumMinor`/`payedSumMinor`/`shippedSumMinor`) `r.currency` + `displayAs:'none'` ga o'tkazildi. Test invariantga qayta yozildi (list: currency-aware + xom minor yo'q · detail: xom `paidBig` yo'q · grounding izohi o'chmasin) — **4 → 17 test**, izohlarni strip qiladi (birinchi yugurishda o'z hujjatida yiqilgan edi). **Mutatsiya-tekshiruv: original green, 4/4 buzilish tutiladi** | 🔴→🟢 | 2026-07-28 |
| 4 | [x] | ✅ **Tekshirildi: FE to'g'ri, registr eskirgan edi — endi manbadan chiqariladi** | Test FE `sumMinor`/`rewardSumMinor`/`payedSumMinor` yuboradi deb **qo'lda yozilgan** edi. Haqiqatda `commission-reports` sortable ustunlari: `name·moment·agent·sum·commission·otherServices·commitentSum·payed` — va **sakkizalasi ham BE enum'ida BOR** (`DataTable`: `sortField ?? key`). Ya'ni ustun bosilganda 400 bo'lmasdi; bu yana **snapshot-import stale-registry klassi** (#3 bilan bir xil, boshqa checkout'ning kalitlari). Qo'lda ro'yxat drift qilganda **soxta buzilish** ko'rsatib, **haqiqiy buzilishni yashiradi**. **Fix:** FE kalitlari endi sahifa manbasidan **DERIVE** qilinadi (`sortable: true` oynasi → `sortField ?? key`), faqat (sahifa→BE sxema) juftligi curated qoladi → registr chirimaydi, yangi sortable ustun avtomat tekshiriladi. +2 non-vacuous tekshiruv. **3 → 6 test**; mutatsiya: **3/3 tutiladi** (BE'da yo'q kalit · BE'da yo'q sortField · barcha sort o'chirilgan «bo'sh yashil» holati) | 🟠→🟢 | 2026-07-28 |
| 5 | [x] | ✅ **Tekshirildi: rollout TO'G'RI, test refaktorni kuzatmagan** | `products/[id]` sahifasida 0 ta `<MoneyInput>` — chunki pul tahriri `components/products/product-price-editor.tsx` ga **ajratilgan** va u yerda **aynan 3 ta** bor (buyPrice·minPrice·salePrices), xom `<Input>` yo'q. Fayl-bo'yicha skan «rollout regressiya qildi» deb ko'rsatardi. **Fix:** `alsoScan` maydoni qo'shildi — hisob endi **kompozitsiyani** kuzatadi (sahifa + delegat komponent); `bannedRaw` esa sahifa-lokal state uchun sahifadagicha qoladi. **Yon topilma:** shu fayldagi «invoices balance display» bloki #3 dagi FANTOM `remainingMinor` ni talab qilardi — olib tashlandi, uning **omon qolgan yarmi** (xom minor taqiqi) #3 faylига ko'chirildi, invariantga bitta egа qolsin. Mutatsiya: **2/2 tutiladi** | 🟠→🟢 | 2026-07-28 |
| 6 | [x] | ✅ **REAL GAP — «Прибыль» qatori qo'shildi** | Blok 0 dagi ilk **haqiqiy yetishmovchilik**: `DocumentTotalsPanel` `profitMinor` propini boshidan qo'llab-quvvatlagan («Demand only — moysklad shows Прибыль for sales»), BE `costSumMinor` qaytaradi, `detail_totals.profit` kaliti ru+uz'da bor — sahifa shunchaki **ikkalasini ulamagan**, natijada qator hech qachon render bo'lmagan. Ulandi: `costSumBig` → `profitMinor = cost>0 ? saved−cost : undefined`. **Draft-gate ataylab**: `costSumMinor` faqat POST'da to'ladi (FIFO/o'rtacha), draft'da 0 — gate'siz `sum−0` **to'liq daromadni foyda deb ko'rsatardi**. **Saqlangan** summa bilan juftlandi (jonli editor totali emas — saqlanmagan tahrirlar bilan aralashsa hech bir holatga tegishli bo'lmagan foyda chiqardi). Test bitta identifikator (`sumBig`) o'rniga **shaklga** moslandi + draft-gate uchun non-vacuous tekshiruv. Mutatsiya: **3/3 tutiladi** | 🟠→🟢 | 2026-07-28 |
| 7 | [x] | ✅ **Tekshirildi: chip BOR va kuchliroq — test eski naqshni qulflagan** | Test `pillsSlot` + `detail-header-unpaid` badge'ini (faqat to'lanmagan holatda) va `isPaid` identifikatorini kutardi. Header o'shandan beri umumiy `DocumentHeader`ga birlashtirilgan va u **UCHALA holatda** bitta pill chiqaradi (`paymentLabel`+`paymentTone`, `data-test-id="doc-header-payment"`) — komponentning o'z izohi: «moysklad shows the pill in ALL THREE states, not just while unpaid». `pillsSlot`ni demands ham, invoices-out sibling'i ham ishlatmaydi. Ya'ni eski test **mavjud va to'liqroq** funksiyani «yo'q» deb ko'rsatardi. Joriy kontraktga qayta yozildi (shakl bo'yicha: saqlangan summa bilan taqqoslash · 3 tone · header pill'ni haqiqatan render qilishi · i18n kalitlari — hardcode emas). **1 → 5 test** | 🟠→🟢 | 2026-07-28 |
| 8 | [x] | ✅ **2 REAL fix + 3 eskirgan assertion** | 🔴 **REAL (create↔edit nomuvofiqligi):** `cash-out/new` va `payments-out/new` da «Статья расходов» **erkin matn `<Input>`** edi, holbuki EDIT formalari (`[id]`) allaqachon `/expense-items` **katalogidan picker** ishlatadi. Ya'ni foydalanuvchi yaratishda ixtiyoriy matn yozardi → list'ning «Статья расходов» filtri (katalog qiymatlariga mos keladi) uni **hech qachon topa olmasdi** — testning o'z hujjati buni «dead-filter tuzog'i» deb ataydi. `payments-out/new` izohi «no master dictionary» degan — **noto'g'ri**, katalog bor (`settings/expense-items`). Ikkala create-forma edit-formaga aynan moslandi (fetcher + `openPicker` + `CatalogPicker`), eskirgan izohlar tuzatildi, keraksiz `Input` importi tozalandi. 🟢 **ESKIRGAN (3):** `payments-in`/`payments-out` `disabled={!filterValues.organizationId}` — single-select filtr shakli, sahifalar esa **MultiCombobox**ga refaktor qilingan («moysklad parity», purchase-orders gold standard) → joriy gate `!organizations[0]?.id`, ayni invariant. `invoices-in` esa `pickerOpen === 'agent'` **modallarini** talab qilardi — sahifada `pickerOpen` **umuman qolmagan**, hammasi MultiCombobox; eski assertion refaktor ataylab olib tashlagan shaklni qaytarishni, ya'ni parity regressiyasini talab qilardi → teskarisiga (non-vacuous «eski shakl yo'qligini» tekshirish) aylantirildi. **🟡 Hujjatlangan cheklov:** hisob-fetcher `organizations[0]` ga scope qiladi — bir necha org tanlansa faqat birinchisining hisoblari chiqadi; kengaytirish BE o'zgarishini talab qiladi (`/organization-accounts` bitta `organizationId` oladi). Test buni **jimgina yashil qilmay**, aniq qulflab qo'ydi. 4 fayl **40/40 test** | 🟡→🟢 | 2026-07-28 |
| 9 | [x] | ✅ **Yetishmayotgan audit-label qo'shildi** | `supply.service.ts:1809` `logAudit(…, 'create:paymentout', …)` yozadi, lekin `audit.action_create_paymentout` kaliti yo'q edi → History tabida **xom slug** ko'rinardi (ru va uz'da ham). Egizak `action_create_cashout` allaqachon bor edi. Qo'shildi: ru «Создан исходящий платёж» · uz «Chiquvchi to'lov yaratildi». Test slug'larni **BE manbasidan derive qiladi**, ya'ni bu drift-klass avtomat tutiladi. **15/15 test** | 🟡→🟢 | 2026-07-28 |
| 10 | [x] | ✅ **3 haqiqiy drift birlashtirildi + 3 eskirgan registr yozuvi** | 🔴 **REAL:** (a) loyalty tone-xaritalari **IKKI joyda** deklaratsiya qilingan edi — `loyalty-operations/page.tsx` va `counterparty-activity-widget.tsx` (bayt-ma-bayt bir xil, hali ajralmagan, lekin ayni widget list bilan yonma-yon badge chiqaradi → bir tomonlama rang o'zgarishi ko'rinardi); (b) `debts/page.tsx` da **2 ta** lokal helper (`OUTCOME_TONE` + `statusTone`). Uchalasi `lib/domain-status-tone.ts` ga ko'chirildi: `LOYALTY_TYPE_TONE`/`LOYALTY_STATUS_TONE`/`DEBT_CALL_OUTCOME_TONE`/`DEBT_STATUS_TONE` + helperlar. `DEBT_STATUS_TONE` ataylab alohida: qarzda `unpaid` — **ochiq qarzning normal holati** (neutral), hujjatdagidek destructive emas. 🟢 **ESKIRGAN:** `hr/page.tsx` `hrMessageStatusTone` talab qilinardi — Telegram-xabarlar paneli HR Faza-5 da `/hr/messages` ga **ko'chgan** va u yerda helper to'g'ri ishlatiladi → registr qayta yo'naltirildi. `invoices-in/[id]`+`invoices-out/[id]` `INVOICE_STATE_TONE` uzatishi talab qilinardi — ikkala detail ham state-badge **render qilmaydi** (`status=""` + grounded izoh; invoices-out esa akkaunt custom statuslarini ko'rsatadi) → override **LIST** sahifalarida ulangan, yetim emas; detail yozuvlari olib tashlandi (aks holda moysklad ko'rsatmaydigan badge qo'shish kerak bo'lardi). **107/107 test**  **(2-tur, 2026-07-28):** parallel sessiya `f0dd781` bilan `hr/drivers/live` sahifasini commit qildi va u YANGI lokal `STATUS_TONE` kiritdi — guard darhol qizil bo'ldi. Commit qilingan kod umumiy bo'lgani uchun (§6 faqat tugallanmagan ishni himoya qiladi) u ham birlashtirildi: `DRIVER_STATUS_TONE` + `driverStatusTone`. `unknown` ataylab `info` — tasniflanmagan ping harakat talab qilmaydi. **75/75** | 🟡→🟢 | 2026-07-28 |
| 11 | [x] | ✅ **BAJARILDI** (`094872d` — «4 eskirgan guard» ichida, TODO'da belgilanmay qolgan edi) | `header-conventions.test.ts` endi **44/44 pass**. Hal yo'li: `products/[id]` `PAIRING_EXEMPT`ga o'tkazildi, chunki u `products/new` bilan **aynan bir qobiqni** ishlatadi — kod bilan tasdiqlandi: ikkalasi ham `<DetailToolbar>` + `<ProductFormShell>` + `<ProductFormLeftCards>`, ikkalasida ham `<DetailHeader>`/`<DocumentHeader>` **yo'q**. Istisno guardni **o'ldirmaydi**: 2b testi qarama-qarshi tomonni pin qiladi (`toContain('<DetailToolbar')` **va** `not.toMatch(/<(DetailHeader\|DocumentHeader)/)`) — ya'ni qobiq shakli o'zgarsa guard yig'laydi. ⚠️ Moysklad'da mahsulot muharririda title-band yo'qligi **vizual jihatdan qayta tasdiqlanmagan** (#35 capture korpusi bo'sh) — kod-darajadagi da'vo tasdiq, vizual da'vo emas | 🟡 | 2026-07-28 |
| 12 | [x] | ✅ **BAJARILDI — guard yashil (31 → 0), baseline'dan chiqarildi** | 31 xom sayt DS primitivlariga o'tkazildi: `textarea` 3 → `Textarea` · `select` 5 → `NativeSelect` · `input` text/number 6 → `Input` · `input[type=date]` 5 → `DatePicker` · `checkbox` 7 → `Checkbox` · `radio` 11 → `RadioGroup`. **Yo'l-yo'lakay topilgan 3 narsa:** (1) demands/invoices-in/serial-numbers filtr maydonlari qo'lda yozilgan `h-7` ni tashladi — audit qilingan sibling (cash-in) `InlineFilterPanel.Field` ichida yalang'och `<Input>` beradi, ya'ni **o'sha 3 sahifa vizual chetga chiqqan** edi; (2) task-create/detail «Срок» maydonlari brauzerning **native** kalendarini ochardi (`showPicker()` hack bilan) — `DatePicker` `trigger` propi o'sha overlay idiomani to'g'ridan-to'g'ri ifodalaydi, endi **o'z** kalendarimiz ochiladi (moysklad shuni ko'rsatadi); (3) DatePicker trigger'i `<button>` bo'lgani uchun product-select-modal'dagi caption `<label>` boshqarilmaydigan bo'lib qoldi → sibling naqshiga (`<div>`+`<span>`+`ariaLabel`) o'tkazildi. **DS o'zgarishi:** `RadioOption.testId` qo'shildi (`price-rate-dialog.test.tsx` radio input'ida `toBeChecked()` tekshiradi). **Istisno:** `product-form-left-cards` 3 radiosi `EXEMPT_RADIO`ga — hujjatlangan «interleaved value-control» klassining sibling variantı (`ml-auto` `<Input>` label'ning **yonida**, va 1- va 2-variant **orasida** shartli xato `<p>`) — `options` massivi bunga slot bermaydi. Uch sayt esa (currency-rate-modal · price-rate-dialog · position-discount-menu) **konvertatsiya qilindi**, chunki ularning boshqaruvi label **ichida** va `RadioOption.label` — ReactNode | 🟠 | 2026-07-28 |
| 13 | [x] | ✅ **5 ta bulk-dropdown — gate ITEM darajasiga ko'chgan edi** | Adoption overlay'i (`a52c3c7`) trigger'dan `!hasSelection` ni **ataylab** olib tashlagan va gate'ni **itemlarga** ko'chirgan: moysklad «Изменить» ni 0-tanlovda ham ochadi, har amalni kulrang qilib. Kod izohi buni yozadi (`assortment/bulk-actions-dropdown.tsx:479-481`), va `customer-orders` testi allaqachon yangi shaklga o'tkazilgan (o'tayapti). Overlay komponentlarni almashtirgan, lekin bu 5 spec'ga tegmagan. **Qayta yozildi, o'chirilmadi:** asl bug (bo'sh tanlov bilan bulk-mutatsiya) endi gate turgan joyda tutiladi — har komponentning **aynan** selection-gated itemlari `data-disabled` bo'yicha tekshiriladi; `mass-edit` ataylab istisno (0-tanlovda «barcha qatorlar»ga tushadi). **Mutatsiya bilan tasdiqlandi**: item-gate olib tashlansa test qizil. **55/55** | 🟡→🟢 | 2026-07-28 |
| 14 | [x] | ✅ **4 DS kontrakti — hammasi eskirgan, biri esa TUZATILGAN BUG'ni talab qilardi** | (a) `Textarea` `text-[12px]` qulflangan — bugun `Textarea` ham, `Input` ham `text-[13px]`, ya'ni himoyalanayotgan xossa (control oilasidan ajralmaslik) **buzilmagan**; literal o'rniga **sibling parity** tekshiriladi (o'lcham qayta sozlansa ham eskirmaydi). (b) `PeriodPicker` `from`/`to` trigger'larini o'qirdi — komponent endi ikkala uch berilganda **yig'iladi** (bitta label + ◀▶); test avval ochadi, asl assertion (kun-oy tartibi, native mm/dd/yyyy emas) **so'zma-so'z** saqlandi **+ yig'ilgan rejimga yangi qamrov** (avval 0 edi). (c) 🔴 `InlineFilterPanel` «Найти» `onApply`siz **disabled** bo'lishini talab qilardi — komponent izohi: «It must NEVER be disabled … that made the button look **broken on ~every list (the reported bug)**». Ya'ni guard aynan tuzatilgan bug'ni qaytarishni so'rardi → teskarisiga aylantirildi + handler'siz bosish xavfsizligi qulflandi. **50/50** | 🟡→🟢 | 2026-07-28 |
| 15 | [x] | ✅ **Param nomi hech qachon iste'mol qilinmagan** | Test `?available=1` ni qulflagan; bu nomni repo'da **hech kim o'qimaydi**. Yagona iste'molchi — `purchase-orders/new/page.tsx:161` — `availability` ni o'qiydi («с учётом доступно» → /supply-shortfall bazasi), komponent esa aynan `?availability=1` yuboradi. Ya'ni guard **jimgina e'tiborsiz qoldiriladigan** parametrni talab qilardi. Literal o'rniga **URL parse** qilinadi (yana qayta nomlashdan omon qoladi), asl bug esa saqlanadi: «с учётом доступно» item shortfall bayrog'i bilan yetib borishi shart. **6/6** | 🟡→🟢 | 2026-07-28 |
| 16 | [x] | 🟡 **OCHIQ MAHSULOT QARORI sifatida qulflandi (majburlanmadi)** | Test «Показатели» toolbar'i **inline forma** ochishini talab qilardi (`AdjustmentCreateForm`/`ReconciliationActForm`). Bugun widget **navigatsiya** qiladi va `metrics-create-forms.tsx` **YETIM** — uni hech kim import qilmaydi. Tekshirdim va **rewire qilmadim**: акт сверки yarmi **ilgarilab ketgan** — u endi `AktSverkaCard` (`counterparties/[id]/page.tsx:951` → `/counterparty-statements`, xlsx, ochiq `/akt/:token`), ~7 commitlik faol ish; yetim formani qayta ulash **jo'natilgan feature'ni dublikat qilardi**. Adoption qoidasi («KEEP: counterparties + debts») qaysi shakl yutishini aytmaydi → **foydalanuvchi qarori**. Guard bugungi bir ma'noli kontraktga qaratildi (korrektirovka amali kontragentni `?agentId` bilan olib borishi — aks holda forma bo'sh ochiladi) **+ «DECISION MARKER» testi**: kimdir yetim formani ulasa qizil bo'ladi, ya'ni qaror jimgina chirimaydi. **6/6** | 🟡 qaror kutmoqda | 2026-07-28 |
| 17 | [x] | ✅ **Skaner matcher'ni label'dan ajratmasdi (guard eskirgan EMAS)** | ⚠️ Muhim farq: bu guard **yashil** holda kelgan (`b6af20c`, 2-iyul) va **25 kun keyin** `79b1ff7` (приёмка ishi) kirill **regex** qo'shganda qizil bo'lgan — ya'ni u o'z ishini qilgan. Lekin foydalanuvchi ko'radigan **leak yo'q**: `/sotil|розничн|retail|продаж/i.test(t.name)` — bu **server ma'lumotini** moslaydi (seed'dagi «Розничная цена») va hech qachon render qilinmaydi; uni tarjima qilish **moslikni buzardi**. Skaner qatorli va sintaksisdan bexabar edi → `stripRegexMatchers` qo'shildi: faqat `.test(`/`.exec(` yoki String-matcher argumenti sifatida **iste'mol qilinadigan** regex literal bo'shatiladi. **3 ta non-vacuous test**: kirill string literal, matcher bo'lmagan regex, va matcher bilan **bir qatordagi** label hali ham tutiladi (teshik ochilmasin). **6/6** | 🟠→🟢 | 2026-07-28 |
| 18 | [ ] | 🟠 **`label-grounding` 25 fail — `docs/moysklad-reference/` BO'SH** | 0 fayl tracked; `progress.json.moysklad_reference.captured_modules = 0`. Yiqilgan: 02/03-module invoicein·invoiceout·purchaseorder·supply·salesreturn·purchasereturn·customerorder · 06-module move·enter·loss·inventory·internalorder·stock-report · 07-module cashin·cashout·paymentout · 08-module retailshift · 10-module processing·processingplan·processingprocess·productiontask · 04-module uom · 00-module project · internalorder(detail) · counterparties(detail) | **#35 ga bog'liq** | |

## Qism 0.2 — API 62 fail (15 fayl)

| # | ☐ | Ish | Dalil | Og'irlik | Bajarildi |
|---|---|---|---|---|---|
| 19 | [x] | ✅ **4 debt entity 3 ro'yxatga qo'shildi** | `packages/db/prisma/seed.ts` · `permissions.service.ts seedSystemRoles` · `scripts/topup-role-permissions.ts` — union 80 ta, ro'yxatlar 76 ta edi. `permissions-seed-sync.test.ts` **7/7** | 🔴→🟢 | 2026-07-28 |
| 20 | [x] | ✅ **`scopeFromTemplate` + 2 Qarz rol shabloni tiklandi; HR guard testi yangilandi** | **(a)** `permissions.types.ts`ga `QarzOperatori`+`QarzKassiri` (TZ §6 override'lari) va `scopeFromTemplate()` → `debt-permissions.test.ts` **13/13**. **(b) 🔴 Qo'shish paytida REAL BUG topildi:** `seedSystemRoles` faqat `tpl.defaults[action]` o'qirdi, **`overrides`ni e'tiborsiz qoldirardi** → yangi Qarz rollari NOTO'G'RI seed bo'lardi (operator screenshot to'lovini kirita olmasdi; kassirga hisobot ochiq qolardi). `scopeFromTemplate`ga o'tkazildi. **(c)** `hr-permission.guard.test.ts` 11/11 yiqilardi: guard 2026-07-16 da **async** bo'lgan (core-RBAC admin `/hr/employees`ga kirishi uchun `resolveScope` kerak), test eski **sync** imzoga yozilgan edi → HR avtorizatsiya guard'i **umuman tekshirilmay turgan edi**. Test await + `PermissionsService` stub'iga o'tkazildi **+ 3 yangi test** o'sha fallback tarmog'iga: **14/14** | 🔴→🟢 | 2026-07-28 |
| 21 | [x] | ✅ **Mock servisning haqiqiy chaqiruviga moslandi + 2 yangi qulf** | `facture-{in,out}` mock'larida `findMany` yo'q edi, hujjat-raqam seeder'i esa uni chaqiradi → **13 test** «findMany is not a function» bilan o'lardi, ya'ni mock kamchiligi servis buzilishi sifatida ko'rsatilardi. Mock haqiqiy chaqiruvga (`{where:{accountId},select:{name:true}}`) modellashtirildi. Yon topilma: 2 assertion eski **prefiksli** nom formatini (`СФ-YYYY-NNNNN`) kutardi — generator moysklad-parity «plain 5-digit, no prefix» ga o'tgan; ikkala servisning JSDoc'i ham hali eski formatni yozgan edi → tuzatildi. **+2 yangi test**: legacy prefiksli nomdan keyin ketma-ketlik davom etishi (`СФ-2026-00007` → `00008`) — raqam qayta ishlatilmasligi qulflandi. **21/21** | 🟠→🟢 | 2026-07-28 |
| 22 | [x] | ✅ **`findMany: vi.fn()` bo'sh stub edi** | `prepayment` va `prepayment-return` mock'larida `findMany` `undefined` qaytarardi → seeder'ning `for (const r of rows)` «rows is not iterable» tashlardi va **balans · cap · valyuta-qulfi · audit-log** testlari assertion'ga yetmasdan o'lardi. Ikkalasi ham haqiqiy chaqiruvga modellashtirildi (account-scoped, name-only) — endi generatsiya qilingan «Номер» ham haqiqatan mashq qilinadi. **32/32** | 🟠→🟢 | 2026-07-28 |
| 23 | [x] | ✅ **Clone FK'ni yo'qotmasdi — mock yo'q edi** | `paymentOut.findMany` mock'da yo'q → `clone()` **birorta allokatsiyani nusxalashdan OLDIN** yiqilardi, ya'ni 3 ta FK-nusxa assertion'i o'zi tekshirayotgan narsaga aloqasiz sababdan qizil edi. Mock qo'shildi. **3/3** | 🟠→🟢 | 2026-07-28 |
| 24 | [x] | ✅ **`variant.findMany` mock'da yo'q + izoh-oynasi tor edi** | `maxProductCode` «Код» ketma-ketligini **IKKALA** jadvaldan seed qiladi (moysklad'da mahsulot va uning modifikatsiyalari bitta ketma-ketlikda: Скоч маляр 00001 → variantlari 00002/00003) — mock'da faqat `product` bor edi → create() «Cannot read properties of undefined» tashlardi va VAT/audit/owner testlari aloqasiz sababdan qizil edi. Ikkinchisi: `ProductPackSchema[\s\S]{0,200}tasnifCode` — **belgi-oynasi**; maydon o'z joyida, lekin ustiga qo'shilgan izohlar uni 200 belgidan chiqarib yuborgan → oyna o'rniga **z.object blokini** skanlaydigan qilindi. **107/107** | 🟠→🟢 | 2026-07-28 |
| 25 | [x] | ✅ **4 class-lock — hammasi eskirgan detektor, kod sog'lom** | (a) **PositionTable «3-dp»**: bloklangan `Math.round(...*1000)` aslida `lineMeasure` — **og'irlik/hajm** (g/ml × Кол-во, 3 xona display), pul emas; pul yo'li to'g'ri `computePositionTotal`da. Ban pul yo'liga qaratildi. (b) **internal-order groupId**: stamp BOR, lekin **kuchliroq** shaklda (`data.groupId ?? creatorGroupId` — foydalanuvchi tanlagan guruh ustun); mavjud `COALESCE_STAMP` mexanizmi `parsed.` ga qotirilgan edi → ikkala qabul qiluvchini oladi. (c) **enter TOCTOU `toBe(3)`**: enter'da **4** claim bor — 4-chisi version bilan himoyalangan **qo'shimcha** guard; qotirilgan son «himoya qo'shildi»ni qizil qiladi → qoida kuchaytirildi: **har claim tekshirilgan bo'lsin** (claims soni == guards soni), 3 o'tish esa yuqorida alohida qulflangan. (d) **commission-report tz**: `tashkentRangeBounds(q.momentFrom, q.momentTo)` — parametr `q`, test `filter` kutgan → back-reference bilan shaklga moslandi. **268/268** | 🟠→🟢 | 2026-07-28 |
| 26 | [x] | ✅ **Detektor nafaqaga chiqqan shaklga bog'langan edi** | Floor 31 talab qilardi, skan 11 topardi. Sabab: detektor `startsWith: prefix` + padStart juftligini qidiradi, flot esa moysklad'ning **prefiksiz** «Номер» iga ko'chgan (seeder oxirgi raqamlardan max oladi). O'lchov: `padStart(5)` ishlatuvchi **37** servis, `allocateDocumentNumber` chaqiruvchi ham **37** — ya'ni invariant to'liq bajarilgan va flot 31→37 **o'sgan**. Detektor bardoshli yarmiga (5-xonali to'ldirish = generator shakli) qayta bog'landi; `analitika/order.service.ts` — hujjatda allaqachon yozilgan istisno (count()+1 + P2002 retry). **3/3** | 🟡→🟢 | 2026-07-28 |

## Qism 0.3 — Gate'lar

| # | ☐ | Ish | Dalil | Bajarildi |
|---|---|---|---|---|
| 27 | [x] | ✅ **BAJARILDI — mahsulot kodi 59 → 19 → 0 (#28 da yopildi); tooling 532 = ATAYLAB qoldirildi** | **Yakuniy holat (2026-07-28):** mahsulot kodi **0 error**, `scripts/check-lint.mjs` gate bilan qulflandi. **Tooling 532 error / 247 fayl o'lchandi va qoldirildi** — 326 tasi sof mexanik (`format` 208 + `organizeImports` 118), qolgani esa bir-martalik graveyard skriptlarda (`cert-*`, `verify-*-smoke`, sanali codemod'lar). Ularni tuzatish 247-fayllik diff beradi, `git blame`ni ko'mib tashlaydi va **nol qiymat** qo'shadi — #128/#129 da hal qilinadi. **LEKIN tooling ichidan 1 REAL NUQSON topilib tuzatildi:** `tools/scripts/schema-gap-report.mjs` da 6 ta takror obyekt kaliti bor edi; ulardan **`Webhook`** haqiqiy zarar keltirardi — keyingi ta'rif g'olib bo'lib `meta: '_skip'` **yo'qolgan**, natijada gap-hisoboti `Webhook.meta` ni «xaritalanmagan maydon» deb **noto'g'ri sanardi** (qolgan 5 tasi zararsiz takror — keyingi ta'rif oldingisining barcha kalitlarini o'z ichiga olardi). Qamrovni o'lchaydigan asbobning o'zi yolg'on ko'rsatayotgan edi. **Eskirgan da'volar:** band matnidagi `useButtonType 21` va `noDelete 3` — allaqachon yopilgan | 🔴→✅ | 2026-07-28 |
| ~~27-eski~~ | | *(oldingi qism-holat matni, tarix uchun)* | «601 error» bitta son emas ekan: **mahsulot kodi** (`apps/*/src` + `packages/*/src`, 2055 fayl) = **59**, **tooling/graveyard** (`scripts/` · `tools/` · `apps/api/scripts`, 360 fayl) = **530** (88%). Mahsulot kodi ustida ishlandi. 🔴 **Eng qimmatlisi — 21 ta `useButtonType`:** bu loyihada **allaqachon kuygan** bug-klass (NEXT.md BUG3: «double-create on all 10 /new pages — DetailToolbar Save `type` defaulted to submit inside `<form>`»). 7 tasi `pos/payment-dialog.tsx` da — POS to'lov oynasi, pul yuzasi (bugun `<form>` yo'q, lekin forma ichiga qo'yilsa 7 tasi ham submit bo'lardi). Hammasiga `type="button"`. Yana: `noUselessSwitchCase` olib tashlandi; format xatolari `--write` bilan. 🔒 **`observability.ts` `noDelete` — «tuzatilmadi», ataylab `biome-ignore`:** u Sentry'ga ketishdan oldin `authorization`/`cookie` header'larini **xavfsizlik uchun** o'chiradi; `undefined` berish kalitni **qoldirardi** (Sentry uni serializatsiya qiladi, va header nomi so'rov autentifikatsiyalanganini oshkor qiladi) — `delete` bu yerda to'g'ri operator, perf-smell emas. **Qolgan 19:** 9 `noArrayIndexKey` (statik skeleton/breadcrumb massivlarida index-key **aslida to'g'ri** — «tuzatish» churn bo'lardi) · 3 non-null · 2 template · 2 a11y focusable · 1 optional-chain · 1 redundant-role. **Tooling 530** = graveyard skriptlar (#128/#129 bilan birga hal qilinadi) | 🔴→🟠 | 2026-07-28 |
| 28 | [x] | ✅ **BAJARILDI — mahsulot kodi 19 → 0 error + gate qo'yildi** | **Asosiy nuqson band matnida emas edi:** `pnpm lint` = `biome check .` — u `scripts/`+`tools/` ni ham qamraydi (~530 error, hech kim tuzatmaydi), ya'ni **doim qizil → umuman gate emas**; mahsulot kodidagi son 19 dan 190 ga chiqsa ham hech kim sezmasdi (aynan #29 yopgan «133 jimgina qizil test» klassi). **Yechim: `scripts/check-lint.mjs`** — biome'ni faqat yuboriladigan kodga (`apps/{api,web}/src`, `packages/*/src`) qamrab **0 error** talab qiladi, `pnpm lint:product` + pre-push (`CHECK_LINT=0` escape). **Qarorlar (har biri yozilgan):** 3 ta **FIX** (`useOptionalChain` · `noUnusedTemplateLiteral` · `noUnusedVariables` — ishlatilmagan `T` tip-parametri) · 16 ta **`biome-ignore` + sabab saytning o'zida** — ARIA `progressbar`/`separator` fokuslanmasligi **shart** (biome ularni widget deb o'ylaydi), `role="list"` esa **ataylab** (Safari/VoiceOver `list-style:none` da list-semantikani o'chiradi, Tailwind preflight aynan shuni qo'yadi — «fix» qilish a11y'ni **buzardi**), `<output>` — **form**-elementi, toast emas, `delete process.env.X` — env tozalashning yagona to'g'ri usuli (`= undefined` «undefined» **satrini** yozadi), 9 ta index-key esa identifikatori **yo'q** ro'yxatlarda (placeholder, parse qilingan markdown, `ReactNode` label). Qoidani global downgrade qilish **rad etildi** — u qayta-tartiblanadigan/stateful ro'yxatlarni ham o'chirardi. **Warning siyosati:** `useSortedClasses` (295) — **nursery**, autofix bir xil specificity'dagi utility'lar kaskadini ag'daradi → block qilmaydi; `noNonNullAssertion` (120) — churn; `noConsoleLog` (46) — **o'lchandi: hammasi CLI kirish nuqtalarida** (`apps/api/src/scripts/*`, `packages/workflows/src/cli/*`), server/UI runtime'ida **0** → gate raw sonni emas, **shu invariantni** pin qiladi. ⚠️ Bandda yozilgan `useButtonType 21`/`noDelete 3` raqamlari eskirgan — ular #27 da yopilgan. **Mutatsiya testi: 2/2** (yangi `useOptionalChain` va CLI-tashqarisidagi `console.log` — ikkalasi ham bloklandi) | | 2026-07-28 |
| 29 | [x] | ✅ **Pre-push'ga GUARD GATE qo'shildi (baseline bilan)** | Ildiz sabab: pre-push faqat `typecheck` yugurtirardi va hook izohi «test suite pre-push'da YO'Q (juda sekin) — qo'lda enforce qilinadi» deb yozardi. O'sha halollik tizimi **ishlamadi**: 133 guard bir vaqtda qizil topildi, va suite keng qizil bo'lganda **har yangi buzilish shovqinda yashirinadi** (aynan shunday «Sklad» saqlash bug'i va yetishmayotgan debt-ruxsatlari omon qolgan). Yechim: to'liq suite (~10 daq) emas, **manba-skan guard'lari** — sof fayl o'qish, jsdom yo'q — **~18s / ~370 assertion**, va faqat **yashil bo'lgan** guard yiqilsa bloklaydi. Ma'lum-qizil fayllar `scripts/guard-baseline.json` da **sabab + TODO ref bilan** (mute emas, ko'rinadigan qarz reyestri); baseline yozuvi yashil bo'lsa skript uni **o'chirishni talab qiladi** — ro'yxat faqat qisqara oladi. `CHECK_GUARDS=0` — WIP uchun. **Mutatsiya bilan tasdiqlandi va shu jarayonda drift-lock'ning TESHIGI topildi:** inline `{moving:'success',…}[d.status]` xaritasi uchala mavjud naqshdan ham o'tib ketardi (hech narsa nomlanmagan, hech narsa deklaratsiya qilinmagan) → `BAN_INLINE_MAP` qo'shildi (≥2 tone-qiymatli kalit + darhol indekslash; oddiy label obyektlariga tegmaydi) + 3 non-vacuous holat. Endi **ikkala mutatsiya ham** push'ni bloklaydi | 🔴→🟢 | 2026-07-28 |
| 30 | [x] | ✅ i18n ru↔uz parity — **7644 = 7644** | ⚠️ **Bu shunchaki hisob farqi emas, REAL BUG edi:** `pages.debts.pay_account` faqat `uz.json`da bor edi, lekin `components/debts/call-outcome-modal.tsx:287` uni ishlatadi → **RU foydalanuvchi xom kalit ko'rardi**. Qo'shildi: `"🏦 Расчётный счёт"` (qo'shni `pay_cash`/`pay_click` uslubida) | 2026-07-28 |

## Qism 0.4 — Hujjat drift

| # | ☐ | Ish | Dalil | Bajarildi |
|---|---|---|---|---|
| 31 | [x] | ✅ **NEXT.md hand-off yozildi** | `2026-07-28a` entry (sana-harf kolliziyasi tekshirildi — 07-28 band emas edi). Sessiya boshidagi **o'lchangan** holat, yakuniy holat, «qizil test ≠ buzuq kod» asosiy topilmasi, yo'l-yo'lakay topilgan 7 real bug, #29 tizimli tuzatish, ⛔ sizdan kutilayotgan 5 qaror, va §6 bo'yicha parallel sessiya ishi (haydovchi-tracking) qayd etildi. Keyingi sessiya endi arzon boshlanadi | 2026-07-28 |
| 32 | [x] | ✅ **PARITY-STATUS.md ga branch-banner** | Hujjat `main`ni tasvirlaydi (2026-06-15). Tarixni **o'chirmadim** — u `main`ning haqiqiy yo'li; o'rniga yuqoriga banner: adoption FE'ni ustiga qo'ygan («HAR Продажи FE fayli farq qiladi» — NEXT.md 2026-07-23l), shuning uchun «63/67 audit» va «7 cohort» **shu branch'ga tegishli emas**, ularni **yuqori chegara** deb o'qish kerak + `main` ↔ `climart-adoption` yonma-yon jadval (o'lchangan) | 2026-07-28 |
| 33 | [x] | ✅ **`progress.json` endi branch-caveat chiqaradi (hisoblanadigan, qo'lda emas)** | Muammo: `phase2: 100%` audit-hujjat mavjudligidan hisoblanadi, hujjatlar esa **main sahifalarini** tasvirlaydi → bu branch'da chalg'ituvchi. Raqamni qo'lda o'zgartirmadim (fayl «qo'lda inflyatsiya yo'q» deb ogohlantiradi) — generatorga **ikki FAKT signali** qo'shildi: branch nomi va capture korpusi bo'sh-yo'qligi. `branch != main` bo'lsa `audit_pct_caveat` chiqadi. **Worktree gotcha:** bu checkout worktree, `.git` — papka emas, **fayl** (`gitdir:` ko'rsatkichi); ko'r-ko'rona `.git/HEAD` o'qish `unknown` berardi → ikkala holat qo'llab-quvvatlandi (tasdiqlandi: `branch: climart-adoption`) | 2026-07-28 |
| 34 | [x] | ✅ **Mavzu qolmadi — siz allaqachon yangilagansiz** | Tekshirdim: `qabullar-amallar-royxati.txt` da `QO'SHILYAPTI`/`HOZIR YO'Q` belgilari **yo'q**, fayl endi «RETURN (hisobot formati)» bo'limi bilan tugaydi. Bundan tashqari fayl **untracked** — sizning ishchi hujjatingiz, shuning uchun unga tegilmadi | 2026-07-28 |

**Blok 0 hajmi: ~8–10 sessiya**

---

# BLOK 1 — ADOPTION'NI HAQIQATDA TUGATISH

> Adoption «runtime-verified» deb belgilangan (login + 4 sahifa render), lekin **struktur parity qayta
> tekshirilmagan**. NEXT.md o'zi yozadi: «HAR Продажи FE fayli farq qiladi; VPS TO'LIQROQ (demands 1775>1445,
> sales-returns/new 1732>1151)». Ya'ni `main`'dagi 63 detail audit **bu sahifalarga tegishli emas**.

| # | ☐ | Ish | Izoh / dalil | Bajarildi |
|---|---|---|---|---|
| 35 | [ ] | 🔴 **`docs/moysklad-reference/` capture korpusini tiklash** — 22 modul (list + detail) | Hozir 0 fayl (`git ls-files` = 0; main'da atigi 2). **⛔ Foydalanuvchi kerak: moysklad.uz login.** Busiz #18 (25 test), §4 label-grounding intizomi va Blok 6 ning hammasi ishlamaydi | |
| 36 | [ ] | 6 audit qilinmagan detail sahifa | `contracts/[id]` · `debts/[id]` · `factures-in/[id]` · `factures-out/[id]` · `settings/employees/[id]` · `analitika/sozlamalar/rollar/[id]` → 63/69 dan 69/69 | |
| 37 | [ ] | **Phase-1 cohort-audit'ni climart sahifalari uchun qayta yugurtirish** | `scripts/wf-cohort-detail-audit.js` bilan A–L cohortlar. Eng katta band — climart FE fayllarining hammasi Sherset'nikidan farq qiladi | |
| 38 | [ ] | Qarz/SMS/Telegram ekotizimini ruxsat tizimiga to'liq ulash | `lib/access-sections.ts` + `lib/module-permissions.ts` + `PermissionEntity` (#19/#20 ning FE tomoni) | |
| 39 | [ ] | Lokal DB `climart_adopt`@5432 ni migration-tracked qilish | Hozir `db push` bilan sozlangan; `pg_trgm` YO'Q → 4 trgm GIN indeks o'tkazib yuborilgan (xotira: `climart-adopt-local-db-untracked.md`) | |
| 40 | [ ] | Ikki DB kelishuvi — `moysklad_dev`@5433 (Sherset test/QA) vs `climart_adopt`@5432 (adoption) | Yagona qilish yoki chegarani hujjatlash | |

**Blok 1 hajmi: ~10–14 sessiya**

---

# BLOK 2 — PHASE-2 RUNTIME QA (BU BRANCH UCHUN NOLDAN)

> Stack: `pnpm dev` (web :3100 · api :4000) + DB + Playwright MCP. Har cohort: A-battery (API-adversarial) +
> B-battery (real brauzer). Topilgan har bug **shu sessiyada** tuzatiladi (issiq kontekst) + guard test qo'shiladi.

| # | ☐ | Cohort | Sahifalar | Bajarildi |
|---|---|---|---|---|
| 41 | [ ] | **A — Hujjat-detail (13)** | customer-orders · demands · supplies · cash-in · cash-out · moves · payments-in · payments-out · invoices-in · invoices-out · sales-returns · purchase-returns · purchase-orders | |
| 42 | [ ] | **B — Katalog (8)** | counterparties · products · projects · stores · uoms · variants · bundles · services | |
| 43 | [ ] | **C — Ombor + internal (4)** | enters · losses · inventories · internal-orders | |
| 44 | [ ] | **D — Ishlab chiqarish (7)** | processings · processing-orders · productions · production/boms · processes · stages · work-orders | |
| 45 | [ ] | **E — Pul/qaytarish (3)** | prepayments · prepayment-returns · counterparty-adjustments | |
| 46 | [ ] | **F — Chakana (4)** | retail/sales · retail/sessions · retail/z-report · POS registr | |
| 47 | [ ] | **G — CRM (4)** | opportunities · pipelines · contact-persons · tasks | |
| 48 | [ ] | **H — Qarz ekotizimi (yangi, Sherset-kept)** | debts + 7 subroute · akt-sverka Excel (2 varaq) · debt-notify Telegram · SMS shablon | |
| 49 | [ ] | **I — HR davomat yadrosi (6 faza)** | `/hr` dashboard · schedules · departments/positions · employees · monitoring + `[id]` OSM xarita · davomat-notify. **Hech biri browser-QA qilinmagan** (hammasi «Phase-1, browser-smoke YO'Q») | |
| 50 | [ ] | **J — Приёмка to'liq (166 amal)** | Hozirgi fokus bo'limi — 161 mavjud + 5 yangi commit qilingan, hech biri runtime-tasdiqlanmagan | |

**Blok 2 hajmi: ~12–16 sessiya**

---

# BLOK 3 — FUNKSIONAL BO'SHLIQLAR

## Qism 3.1 — Stub sahifalar (6 ta haqiqiy stub)

| # | ☐ | Sahifa | Nima kerak | Qiymat | Bajarildi |
|---|---|---|---|---|---|
| 51 | [ ] | `settings/import` | Excel/CSV import — barcha entity uchun (hozir faqat counterparties + приёмка) | ⭐⭐⭐ | |
| 52 | [ ] | `settings/export` | Excel/CSV eksport — barcha ro'yxat | ⭐⭐⭐ | |
| 53 | [ ] | `settings/tokens` | API token CRUD (`ApiToken` model bor) | ⭐⭐ | |
| 54 | [ ] | `settings/business-processes` | Biznes-jarayon konstruktori | ⭐ | |
| 55 | [ ] | `settings/scenarios` | Сценарии — avtomatlashtirish qoidalari | ⭐ | |
| 56 | [ ] | `settings/delete-account` | Hisobni o'chirish oqimi | ⭐ | |

> Hozir hammasi `pages.settings_stub` + `<EmptyState>` «WIP».

## Qism 3.2 — List-toolbar parity (19/56 → 56/56)

| # | ☐ | Ish | Bajarildi |
|---|---|---|---|
| 57 | [ ] | **38 ro'yxat sahifasiga moysklad toolbar'i.** Hozir bor (19): assortment · counterparties · currencies · customer-orders · demands · enters · inventories · losses · moves · projects · purchase-returns · sales-returns · stores · supplies · uoms (+4 shared reuse).<br>**Yo'q (38):** bundles · calls · cash-in · cash-out · commission-reports · consignments · contact-persons · contracts · counterparty-adjustments · debts · discounts · factures-in · factures-out · internal-orders · invoices-in · invoices-out · loyalty-operations · opportunities · payments-in · payments-out · payrolls · pipelines · prepayment-returns · prepayments · price-lists · price-types · processing-orders · processings · product-folders · productions · products · purchase-orders · serial-numbers · service-requests · services · tasks · tracking-codes · variants | |

## Qism 3.3 — Grounding-gated (⛔ foydalanuvchi capture beradi)

| # | ☐ | Item | Nima kerak | Bajarildi |
|---|---|---|---|---|
| 58 | [ ] | DS `formatMoney` `/100` hardcode → non-2-decimal valyuta hech qayerda ko'rsatilmaydi (JPY kassa) | non-UZS retail kassa capture; DS-wide ish | |
| 59 | [ ] | internal-orders «Целевой склад»→«Склад»? · «План. дата приёмки»? | toza Внутренний-заказ edit-form capture (mavjudi buzuq: `<title>Корзина</title>`) | |
| 60 | [ ] | boms cost-split — «Оплата труда» / «Затраты на производство» | production modul capture (umuman yo'q) | |
| 61 | [ ] | retail drawer «От кого» / «Основание» maydonlari | BE kolonka + `retaildrawercashin` capture | |
| 62 | [ ] | z-report `cashReturnsMinor` / `cardReturnsMinor` ajratib ko'rsatish (fetch qilinadi, render qilinmaydi) | yopiq smena Z-отчёт capture | |
| 63 | [ ] | Приёмка 162–166 tasdiqlash — себест. единицы · себестоимость · Импорт · Маркировка · РНПТ | browser-QA (#50 bilan birga) | |

## Qism 3.4 — Feature-gap va DEFER backlog

| # | ☐ | Ish | Manba | Bajarildi |
|---|---|---|---|---|
| 64 | [ ] | `inventories` — «Дополнить из остатков» + «Дополнить из номенклатуры» | Cohort-B feature-gap; stock-balance integratsiya | |
| 65 | [ ] | **Multi-bin Phase 2** — yacheyka bo'yicha **miqdor** (hozir faqat manzil) | Stock/FIFO'ga tegadi; NEXT.md 2026-07-03 | |
| 66 | [ ] | **`resolveShift` GPS-consumer refactor** — `ping-ingest` · `autocheckout-cron` · `monthly-report` hali eski `EmployeeWorkSchedule` o'qiydi | HR Faza-3 DEFER; nomli jadvalli xodimlarda kech/smena noto'g'ri | |
| 67 | [ ] | Bildirishnoma markazi UI (`Notification` model bor, sahifa yo'q) | — | |
| 68 | [ ] | `opportunities` reopen-control · `tasks` formatDate shared-helper · `opportunities/board` fmtDate NaN-guard | Cohort G DEFER | |
| 69 | [ ] | `bank-account` bankLocation/correspondentAccount maydonlari + currency-change guard (BE) + tax-rate 409-conflict FE map | Cohort K DEFER | |
| 70 | [ ] | Xodim kartasi: permissions/salary subroutes · multi-branch multi-select · foto yuklash · ism/familiya split · mamlakat-kodi · bonus quick-modal · attendance-stats ikonka | Cohort I + HR spec §5.4 DEFER | |
| 71 | [ ] | **`qty=0` qabul qilish** — loyiha bo'ylab ~13 schema klassi (qaror + sweep) | Stock+internal DEFER; ⛔ mahsulot qarori kerak | |
| 72 | [ ] | `agentAccount↔agent` link BE guard · org-account currency↔doc currency match · demand clone revalidation | org-account DEFER | |
| 73 | [ ] | List-page «Сумма от/до» filterlarini MoneyInput'ga (~25 sahifa) | MoneyInput rollout qoldig'i | |
| 74 | [ ] | **Navigation graph audit — 0%** (hech qachon qilinmagan) | `docs/nav-map.html` bor, audit yo'q | |

**Blok 3 hajmi: ~25–30 sessiya**

---

# BLOK 4 — HR TO'LIQ (spec §2 «OUT»)

> Davomat-yadrosi MVP 6/6 tugagan (`docs/superpowers/specs/2026-07-24-hr-timepay-attendance-core-design.md`).
> Quyidagilar o'sha spec'ning «OUT» ro'yxati — har biri alohida spec/faza talab qiladi.

| # | ☐ | Faza | Izoh | Bajarildi |
|---|---|---|---|---|
| 75 | [ ] | **Jarimalar (tiered)** | Bosqichli jarima; hozir faqat `auto_late` config-gated | |
| 76 | [ ] | **Ish-haqi tarif + hisoblash dvigateli** | `HrSalaryConfig` model bor | |
| 77 | [ ] | **Ish-haqi to'lovlari jurnali** | | |
| 78 | [ ] | **Hisobotlar** — oylik statistika + Excel/PDF eksport | | |
| 79 | [ ] | **Qo'shimcha-ish arizalari** — approve/reject oqimi | | |
| 80 | [ ] | **Bayramlar** kalendari (davomat hisobiga ta'sir) | | |
| 81 | [ ] | **Kiosk / Terminal / PIN** rejimi | | |
| 82 | [ ] | **Punch-photo** — schema kolonka + PWA kamera | | |

**Blok 4 hajmi: ~10–12 sessiya**

---

# BLOK 5 — `yangibolim` (MoySklad ↔ Telegram tizimi)

> ⛔ **Avval qaror:** bu modul haqiqatan kerakmi yoki mavjud HR/Telegram bilan ustma-ust tushadimi?
> Manba tizim: `moy.biznesjon.uz` — FastAPI + React, 14 sahifa · 17 router · 14 xizmat · 13 model · 209 test · ~25k qator.
> Spec'lar tayyor: `yangibolim/spec/{00-MASTER,01-backend-core-domain,02-backend-integration-finance,03-frontend-operational,04-frontend-finance-config-shell}.md`

| # | ☐ | Ish | Bajarildi |
|---|---|---|---|
| 83 | [ ] | Backend core domain port (spec 01) — NestJS + Prisma'ga | |
| 84 | [ ] | Backend integration + finance port (spec 02) | |
| 85 | [ ] | Frontend operational port (spec 03) | |
| 86 | [ ] | Frontend finance/config/shell port (spec 04) | |
| 87 | [ ] | WebSocket real-time qatlami | |
| 88 | [ ] | APScheduler cron'larini NestJS scheduler'ga ko'chirish | |
| 89 | [ ] | «To'rt ko'z» vazifa tasdiqlash oqimi + avtomat bonus/jarima | |

**Blok 5 hajmi: ~8–10 sessiya**

---

# BLOK 6 — VIZUAL PIXEL 1:1

> **Loyihaning e'lon qilingan asosiy maqsadi** — «o'lcham/rang/shrift/joylashuv/filter/tugma/modal/xulq moysklad
> bilan farqsiz». Hozir **1 sahifa** tugagan (customer-order `/new`, ~90%). Bu blok qolgan ishning ~40%i.
> ⛔ Butunlay `#35` (capture korpusi) ga bog'liq.

| # | ☐ | Ish | Hajm | Bajarildi |
|---|---|---|---|---|
| 90 | [ ] | **Design-token bazasini moysklad'dan to'liq ekstraksiya** — rang · shrift · zichlik · border · radius · soya · z-index · spacing shkalasi | 1 poydevor sessiya | |
| 91 | [ ] | customer-order `/new` paketini **60 ta `/new` formaga** yoyish | ~15 sessiya | |
| 92 | [ ] | **69 detail sahifa** pixel-parity | ~18 sessiya | |
| 93 | [ ] | **70 list sahifa** pixel-parity (#57 toolbar bilan birga) | ~15 sessiya | |
| 94 | [ ] | **100+ modal** pixel-parity (hozir ~8 modul tekshirilgan) | ~8 sessiya | |
| 95 | [ ] | **78 settings sahifa** pixel-parity | ~10 sessiya | |
| 96 | [ ] | Print/PDF formalarini moysklad shabloniga | ~4 sessiya | |
| 97 | [ ] | Bosh sahifa + dashboard widget'lari | ~2 sessiya | |
| 98 | [ ] | Har sahifaga overlay-diff sertifikatsiya (sub-piksel) | doimiy | |

**Blok 6 hajmi: ~60–75 sessiya**

> **💡 Scope qarori (sizniki):** agar «pixel 1:1» o'rniga «funksional 1:1 + zamonaviy toza dizayn» qabul qilinsa,
> bu blok ~60–75 dan **~15–20 sessiyaga** tushadi va jami loyiha **~95–120 sessiya** bo'ladi.

---

# BLOK 7 — TEST QAMROVI

| # | ☐ | Ish | Hozir | Bajarildi |
|---|---|---|---|---|
| 99 | [ ] | E2E spec — har cohort uchun kamida 1 ta | 7 spec / 325 sahifa (~5%) | |
| 100 | [ ] | Visual-regression snapshot — har pixel-parity qilingan sahifaga | 1 spec | |
| 101 | [ ] | FE→BE contract test'ni to'liq qilish (#2 bilan) | 1 test, qizil | |
| 102 | [ ] | Load / performance test (1214 endpoint) | yo'q | |
| 103 | [ ] | Money-invariant property test'lari — COGS · balans · valyuta · tiyin | qisman | |
| 104 | [ ] | Optimistic-lock + concurrency jonli battery'ni CI'ga ulash | qo'lda script (`verify-optimistic-lock-smoke.mjs`) | |

**Blok 7 hajmi: ~10–12 sessiya**

---

# BLOK 8 — PRODUCTION-READY (Phase 3/4 — hech qachon boshlanmagan)

| # | ☐ | Ish | Izoh | Bajarildi |
|---|---|---|---|---|
| 105 | [ ] | **CI/CD** — GitHub Actions: typecheck + biome + Vitest + build har PR'da | Hozir hammasi qo'lda; faqat Husky pre-push typecheck | |
| 106 | [ ] | **Staging muhit** (Phase 3) — prod nusxasi bilan | | |
| 107 | [ ] | **Monitoring** — Sentry/error tracking + APM + uptime | | |
| 108 | [ ] | Strukturaviy log + agregatsiya | `observability.ts` bazaviy | |
| 109 | [ ] | **DB backup avtomatlashtirish** + restore mashqi | Hozir qo'lda `pg_dump` | |
| 110 | [ ] | Deploy skriptini mustahkamlash | Ma'lum gotcha: `git fetch`siz `reset --hard origin/main` eski keshlangan ref'ga tushadi | |
| 111 | [ ] | **Xavfsizlik auditi** — RLS · RBAC · JWT/refresh · rate-limit · secret rotatsiya · webhook signature | | |
| 112 | [ ] | **Ma'lumot migratsiya strategiyasi** — real MoySklad → Sherset | Production'da 4477 mahsulot bor, **0 kontragent** (⛔ sizdan ma'lumot kerak) | |
| 113 | [ ] | Yuklama testi + DB indeks optimizatsiyasi | 4 `pg_trgm` GIN indeks hali qo'llanmagan (#39) | |
| 114 | [ ] | **Runbook** — incident · rollback · migration · restore protsedurasi | | |
| 115 | [ ] | Foydalanuvchi hujjati + o'quv materiali | `TIZIM-QOLLANMA.md` faqat analitika bo'limini qoplaydi | |
| 116 | [ ] | Phase-4 gradual rollout — feature-flag + kanareyka | | |

**Blok 8 hajmi: ~12–15 sessiya**

---

# BLOK 9 — PLATFORMA GIGIENASI, XAVFSIZLIK, YO'QOLGAN FUNKSIYA

> **Bu blok 2026-07-27 completeness-tekshiruvida qo'shildi** — birinchi 116 bandli ro'yxatda bular yo'q edi.
> Sabab: ro'yxat ilova-funksiyasiga qaraган, platforma/infra/repo qatlami tekshirilmagan edi.

## Qism 9.1 — Xavfsizlik (🔴 eng shoshilinch band shu blokda)

| # | ☐ | Ish | Dalil | Og'irlik | Bajarildi |
|---|---|---|---|---|---|
| 117a | [x] | ✅ **Direct dependency bump'lar (major o'zgarmagan)** | `next` 15.1→15.5.21 (web+marketing: **Middleware/Proxy bypass** + DoS) · `next-intl` 4.9.1→4.9.2 · `ws` 8.18→8.21 · `postcss` 8.5.0→8.5.18 · `nodemailer` 8.0.6→8.0.9 · `turbo` 2.3.3→2.9.14. Natija **78 → 55** (prod 74 → 45) | 🔴 | 2026-07-28 |
| 117b | [x] | ✅ **Tranzitiv `pnpm.overrides`** | `brace-expansion@{1,2,5}` · `fast-uri@{2,3}` · `js-yaml@4` · `lodash@4` · `postcss@8` · `sharp@0` · `ws@8` · `@opentelemetry/core@2` · `@babel/core@7` — hammasi **bir xil major ichida** (API buzilmaydi). Natija **55 → 30** (prod 45 → **22**) | 🔴 | 2026-07-28 |
| 117c | [x] | ✅ **Nest 10→11 + Fastify 4→5 — auth-bypass CVE'lari YOPILDI** | 13 paket ko'tarildi: `@nestjs/*` 10.4→11.1.28 (common·core·platform-fastify·websockets·platform-ws) · jwt 10→11 · passport 10→11 · config 3→4 · event-emitter 2→3 · `fastify` 4→5.10 · `@fastify/{cookie,cors,helmet}` 9/11→11/11/13 · `find-my-way@9` override. **Upgrade'dan OLDIN** breaking-change'lar kodda qidirildi: Nest 11 ning eng kattasi — wildcard marshrut (`'*'`→`'*path'`) — bizda **umuman yo'q**; peer-deps tekshirildi (nestjs-pino/schedule/config/event-emitter hammasi `^11` ni qo'llaydi); lockfile zaxiralandi. **Butun major upgrade'dan atigi 1 ta typecheck xatosi** chiqdi (`@nestjs/jwt` v11 `expiresIn` ni `number \| ms.StringValue` ga qattiqlashtirgan). **Yalang'och cast qo'ymadim** — `JWT_ACCESS_TTL` env'dan keladi, cast typo'ni o'tkazib yuborardi va noto'g'ri token-umri **jimgina** paydo bo'lardi (xavfsizlikka aloqador) → boot-vaqtida ms-format validatsiyasi, xato bo'lsa **baland ovozda** yiqiladi. **Natija:** zaiflik **30 → 14**, prod **22 → 6 → 5**; `@fastify/middie` middleware-bypass, Nest Fastify URL-encoding/HEAD/trailing-slash bypass — **hammasi ketdi**. **Verifikatsiya:** api Vitest **4103/4103 test green** · typecheck 9/9 · **JONLI BOOT:** «Nest application successfully started», `:4000` listening, Nest/Fastify xatosi **0**; `GET /api/v1/health` → **200** `{status:ok}`; `GET /api/v1/products` → **401** (ya'ni auth-guard zanjiri butun — aynan CVE'lar buzmoqchi bo'lgan narsa) | 🔴→🟢 | 2026-07-28 |
| 118 | [ ] | 🔴 **QAROR: 6 bo'lim DROP qilingan — qaytariladimi?** | Bu branch'da YO'Q: `sotuv` · `omborchi` · `restock-tasks` · `replenishment` · `cell` · `sklad-keeper`. `main`'da bu **jonli production feature** edi: Приёмка post → omborchiga avtomat joylashtirish topshirig'i + QR-checklist + notification + printerli keeper (2 ta, 4477/4477 mahsulotda loc bor) | 🔴 Funksional regressiya yoki rasmiy bekor qilish | |
| 119 | [ ] | Webhook/integratsiya jonli sinovi | 1214 endpointdan qaysilari haqiqatan tashqi tizim bilan sinalgan: Payme · Click · EDO · Marking (Честный знак) · 1C · marketplace · bank API | 🟠 | |
| 120 | [ ] | `moysklad-sync` + `moysklad-compat` jonli MS API sinovi | Production'da import faqat fayl-eksportdan bo'lgan, **0 kontragent** kelgan | 🟠 | |

## Qism 9.2 — Buzuq/eskirgan infratuzilma

| # | ☐ | Ish | Dalil | Bajarildi |
|---|---|---|---|---|
| 121 | [ ] | **Buzuq skriptlar** — `pnpm codegen:prisma` / `pnpm codegen:zod` | `packages/codegen` **YO'Q** (`--filter @moysklad/codegen` hech narsaga tushmaydi) | |
| 122 | [ ] | **`CLAUDE.md` §5 loyiha xaritasi eskirgan** — 3 stale yozuv | `desktop/` YO'Q · `tools/print-agent` YO'Q · `packages/codegen` YO'Q (xaritada uchalasi ham bor deb yozilgan) | |
| 123 | [ ] | **Print agent yo'qolgan** (`tools/print-agent`) | `print-template` moduli + `lib/print-agent.ts` bor, **Windows agent (.ps1/.bat) yo'q** → VPS'da chop etish oqimi qanday yopiladi? | |
| 124 | [ ] | `apps/marketing` — alohida marketing sayti | Holati / deploy / kontent aniqlanmagan; typecheck'da qatnashadi | |
| 125 | [ ] | `packages/workflows` — FSM + data-model validatori CI'ga ulanmagan | `pnpm validate:all` mavjud, hech qayerda avtomat chaqirilmaydi | |
| 126 | [ ] | `docs/perf/db-tuning.sql` qo'llanganmi? `PERFORMANCE-REPORT.md` yangilanmagan | 4 `pg_trgm` GIN indeks ham hali yo'q (#39) | |

## Qism 9.3 — Repo gigienasi

| # | ☐ | Ish | Dalil | Bajarildi |
|---|---|---|---|---|
| 127 | [ ] | Repo axlatini tozalash / arxivlash | `moysklad_backup/` **26 MB** · `audit/` **8.3 MB** · `scratchpad/` · root'da `timepay1-3.mp4` + `*.xlsx` + `SAYT-PROMPT.txt` + `qabullar-amallar-royxati.txt` (ikkalasi untracked) | |
| 128 | [ ] | ~20 Python codemod skript graveyard | `tools/*.py` — apply-* · wire-* · fix-* · audit-* : tozalash yoki «bir-martalik» deb hujjatlash | |
| 129 | [ ] | `scripts/` graveyard | `cert-*.mjs` · `ground-*.mjs` · `verify-*` bir-martalik sertifikatsiya skriptlari | |
| 130 | [ ] | **ADR yozish** — adoption/climart qarori uchun | 6 ADR bor (`docs/adr/0001..0006`), climart-adoption strategiyasi hujjatlanmagan | |

## Qism 9.4 — To'ldirilmagan mahsulot qatlamlari

| # | ☐ | Ish | Dalil | Bajarildi |
|---|---|---|---|---|
| 131 | [ ] | **a11y tizimli audit** | `useButtonType` 21 biome error · `tools/audit-aria.py` + `aria-snapshot.spec.ts` bor, lekin tizimli o'tish yo'q | |
| 132 | [ ] | Onboarding + Help kontenti | `OnboardingProgress` + `HelpArticle` model bor · `getting-started` + `help/purchases` sahifa bor — **kontent to'ldirilganmi?** | |
| 133 | [ ] | Email shablonlari + `EmailConfig` jonli sinov | `EmailLog` model bor; jonli yuborish tasdiqlanmagan | |
| 134 | [ ] | **Multi-tenant qarori** — SaaS'mi yoki single-tenant? | `Account` model + RLS + `subscription` sahifa bor, lekin sahifa «self-hosted install has no billing» deb yozilgan. `ADR-0003 multi-tenancy` bilan solishtirilsin | |
| 135 | [ ] | Til qamrovi — faqat `ru` + `uz`. `en` kerakmi? | `apps/web/src/messages/` da 2 fayl | |
| 136 | [ ] | `korzina` (savat/trash) to'liqligi | Soft-delete → restore oqimi barcha entity'ni qoplaydimi | |

**Blok 9 hajmi: ~12–16 sessiya**

---

# BLOK 10 — YO'QOLGAN ROUTE'LAR, XATO-BARDOSHLILIK, DOC-DRIFT

> **Bu blok ikkinchi completeness-tekshiruvida qo'shildi (2026-07-27).** Sabab: Blok 9 ni qo'shganda 2 ta
> yo'qolgan feature'ni **tasodifan** topdim → shundan keyin `main` ↔ `climart-adoption` route-diff'ini **tizimli**
> chiqardim va **19 ta yo'qolgan route** aniqlandi (deklaratsiya qilingan 6 ta drop emas).

## Qism 10.1 — 🔴 Adoption'da YO'QOLGAN 19 route (tizimli diff natijasi)

`git ls-tree main` ↔ `find` diff: **main 310 route · branch 325 route · 19 yo'qolgan · 33 yangi**

### (a) Deklaratsiya qilingan drop (NEXT.md'da yozilgan — #118 qarori kutmoqda)

| # | ☐ | Route | Bajarildi |
|---|---|---|---|
| 137 | [ ] | `sotuv` · `omborchi` · `restock-tasks` + `[id]` · `replenishment` · `cell` + `[code]` — 7 route | |

### (b) 🔴 DEKLARATSIYA QILINMAGAN — tasodifan yo'qolgan (adoption bug)

| # | ☐ | Route | Nega muhim | Bajarildi |
|---|---|---|---|---|
| 138 | [x] | ✅ **`settings/sms` + `settings/sms/templates` TIKLANDI** | 2 sahifa + `lib/sms-segments.ts` util + **settings-sidebar'dagi 2 nav yozuvi** (ular ham yo'qolgan edi) + `pages.settings_sidebar.{sms,sms_templates}` kalitlari ru+uz. BE (17 fayl) allaqachon joyida edi, faqat kirish nuqtalari yo'q edi | 2026-07-28 |
| 139 | [x] | ✅ **`debts/calls/tomorrow` TIKLANDI** | Sahifa + `debts/page.tsx` tab havolasi + `pages.debts.{tab_calls_tomorrow,empty_calls_tomorrow}` ru+uz. **BE ham yamalgan** (#142 tasdig'i): `dayOffsetIso()` helper + `todayCalls(dayOffset)` + controller `?dayOffset=` — bular ham yo'qolgan edi. Pagination `showPageNumbers`/`onPage` proplari bu branch DS'ida yo'q → qo'shni `debts/page.tsx` uslubiga moslandi | 2026-07-28 |
| 139b | [ ] | 🟠 **Follow-up: `todayCalls` xulq-farqlari ATAYLAB ko'chirilmadi** | Main'da yana 2 farq bor va ular **mavjud `/debts/calls` xulqini o'zgartiradi** → QA'siz kiritilmadi: (1) `includeOverdue` default `true`→`false`; (2) «qo'ng'iroq QILINGANLAR ro'yxatdan chiqadi» filtri (`lastCallAt >= nextContactAt`, main'da 2026-07-27 talabi). Qaysi xulq to'g'ri — foydalanuvchi qarori | |
| 140 | [ ] | `settings/smena` + `/[id]` + `/new` · `settings/shift-schedules` | Smena/ish-grafigi sozlamalari (4 route) — HR davomat bilan bog'liq bo'lishi mumkin | |
| 141 | [ ] | `settings/sklad-keepers` · `stores/cell-labels` · `reports/warehouse-ops` · `scan/[id]` | Ombor operatsion qatlami (4 route) — #137 bilan bir oilada, lekin alohida qaror kerak | |
| 142 | [ ] | **Yo'qolgan route'lar uchun BE endpoint yetimmi?** — har biri uchun tekshirish: backend moduli qoldi, controller ochiqmi, xavfsizmi | | |

## Qism 10.2 — 🟠 33 yangi climart route — hech qachon audit qilinmagan

| # | ☐ | Ish | Ro'yxat | Bajarildi |
|---|---|---|---|---|
| 143 | [ ] | **33 climart route'ni Phase-1 audit'ga kiritish** (hozir hech biri `progress.json` `audited` ro'yxatida yo'q) | `bulk-edit` · `commission-reports/new` · `commission-reports/new-in` · `hr/departments` · `hr/monitoring` + `[employeeId]` · `hr/positions` + `[id]/employees` · `hr/schedules` · `hr/settings/notify` · `scan` · `settings/all` · `settings/business-processes` · `settings/commission-report-statuses` · `settings/company` · `settings/countries` · `settings/delete-account` · `settings/demand-statuses` · `settings/employees` + `[id]` + `new` · `settings/export` · `settings/import` · `settings/invoice-out-statuses` · `settings/purchase-return-statuses` · `settings/sales-channels` · `settings/sales-return-statuses` · `settings/scenarios` · `settings/supply-statuses` · `settings/tokens` · `specialoffers` · `stores/new` · `subscription` | |

## Qism 10.3 — 🔴 Xato-bardoshlilik (butun ilovada YO'Q)

| # | ☐ | Ish | Dalil | Og'irlik | Bajarildi |
|---|---|---|---|---|---|
| 144 | [x] | ✅ **Xato-chegaralari QO'SHILDI** | 4 yangi fayl: `(app)/error.tsx` (i18n, reset + «Bosh sahifa» + `error.digest`) · `(app)/not-found.tsx` · `app/not-found.tsx` · `app/global-error.tsx` (provider'siz — `NEXT_LOCALE` cookie'dan til, `GLOBAL_ERROR_STRINGS` mirror). **Guard:** `__tests__/error-boundaries.test.ts` **21 test** — mavjudlik + `data-test-id` + `'use client'` + `reset()` + html/body + «useTranslations ishlatilmasin» + **mirror↔ru/uz verbatim sync** + 7 kalit ru+uz'da bor. i18n kalitlari (`errors.crash_*`) allaqachon mavjud edi — faqat komponentlar yozilmagan ekan | 🔴 | 2026-07-28 |
| 145 | [ ] | 404 / 500 / offline sahifalari + Next.js `error` segment boundary'lari (kamida har top-level bo'limga) | | 🟠 | |
| 146 | [ ] | Client-side xato reporteri (#107 Sentry bilan bog'liq) — hozir crash jimgina yo'qoladi | | 🟠 | |

## Qism 10.4 — Sifat o'lchash va doc-drift

| # | ☐ | Ish | Dalil | Bajarildi |
|---|---|---|---|---|
| 147 | [ ] | **Test coverage o'lchash sozlanmagan** | `vitest.config.*` da `coverage` yo'q — 6 512 test bor, lekin **qancha kod qoplanganini hech kim bilmaydi** | |
| 148 | [ ] | **`RESUME.md` — uchinchi ziddiyatli entry-point hujjati** | 1 122 qator, **2026-04-20 «Sprint 3 COMPLETE» holatida muzlagan**: web port **3000** (aslida 3100), «Sprint 4.3» tugadi deydi. `NEXT.md` + `CLAUDE.md` + `RESUME.md` uchtasi bir-biriga zid → birlashtirish yoki arxivlash | |
| 149 | [ ] | **`progress.json` + `NEXT.md` `settings/print-templates` editor sahifasini mavjud deb hisoblaydi** — u **ikkala branch'da ham YO'Q** | «detail_pages 63/64» hisoblagichi shu «64-sahifa»ga tayanadi. Boshqa repodan (`d:/projects/moysklad`) kelgan stale da'vo | |
| 150 | [ ] | **`payment-gateway` (Payme + Click) — UI umuman yo'q** | Backend to'liq: `payme.protocol.ts` · `click.protocol.ts` · `PaymentGatewayConfig` + `PaymentGatewayTx` model + controller. Frontend'da **0 ta sahifa** | |

**Blok 10 hajmi: ~10–14 sessiya**

---

# BLOK 11 — LOYIHANING O'Z REJASIDAN QOLGAN SCOPE

> **Uchinchi completeness-tekshiruvda qo'shildi (2026-07-27).** Manba: `docs/MASTER-PLAN-1TO1.md` (468 qator,
> 2026-07-02 dan beri yangilanmagan) — loyihaning **asl 100% rejasi**. Undagi Sprint 18–33 dan bir nechtasi
> hech qachon tugallanmagan va oldingi 150 bandda **umuman aks etmagan**.

| # | ☐ | Ish | Dalil | Hajm | Bajarildi |
|---|---|---|---|---|---|
| 151 | [ ] | 🔴 **HISOBOTLAR KUTUBXONASI — 16 / 200+** | `MASTER-PLAN-1TO1.md` Sprint 18: «moysklad'da 200+ hisobot bor. Hozir 5 ta» → 8 ta qo'shilgan, hozir jami **16 sahifa**. 30+ kategoriya sanab o'tilgan: Sotuv (11) · Xarid (6) · Pul (7) · Ombor (7) · CRM (5) · Production (4) · Retail (5) · Moliyaviy (3)…<br>**Loyihaning o'z bahosi: «Jami 60–80 sprint kuni = 3–4 oy»** | 🔴 **Blok 6 dan keyingi eng katta scope** | |
| 152 | [ ] | **`moysklad-compat` router — 8 / 76 slug** | Sprint 25 maqsadi «76 slug»; hozir modulda **8 ta endpoint**. MS JSON API moslik qatlami → tashqi integratsiyalar shunga tayanadi | 🟠 | |
| 153 | [ ] | 🔴 **Seed qamrovi — 208 modeldan ~17 tasi** | `packages/db/prisma/seed.ts` faqat ~17 model yozadi. **Shuning uchun Phase-2 cohortlarida «demo-bo'sh» sahifalar bor** — QA qilish uchun avval qo'lda yozuv yaratish kerak bo'ladi. To'liq seed = QA tezligini bir necha barobar oshiradi | 🟠 QA bloklovchi | |
| 154 | [x] | ✅ **Nest 10→11 + Fastify 4→5 bajarildi** — batafsil #117c da. Prisma 5→6 qoldi (alohida, CVE emas) | 🟠→🟢 | 2026-07-28 |
| 155 | [ ] | **6 rejalashtirish hujjati muzlagan va bir-biriga zid** | `MASTER-PLAN-1TO1.md` · `MOYSKLAD-PARITY-ROADMAP.md` · `COVERAGE-TRACKER.md` · `USER-ACTIONS.md` · `DISCOVERY-PLAN-C.md` · `PROJECT-PLAN.md` — **hammasi 2026-07-02 da to'xtagan** (branch yaratilgan kun). MASTER-PLAN «~60% UI parity, 2026-04-29» deydi. → shu `MASTER-TODO-100.md` ga konsolidatsiya qilib, eskilarini arxivlash | 🟡 | |
| 156 | [ ] | Onboarding wizard to'liqligi (Sprint 23) | `OnboardingProgress` model + `getting-started` + `stock-training` sahifa bor; wizard oqimi yopilganmi — tekshirilmagan. *(Sprint 22 «Help drawer + tooltip + shortcut» ✅ BAJARILGAN: `help-drawer.tsx` · `help-button.tsx` · `command-palette.tsx` · `use-keyboard-nav.ts`)* | 🟡 | |
| 157 | [ ] | `pnpm-workspace.yaml` `tests/*` e'lon qiladi — papka **YO'Q** | Konfiguratsiya yolg'oni; tozalash yoki papkani yaratish | 🟢 | |

**Blok 11 hajmi: ~65–90 sessiya** *(shundan #151 yolg'iz ~55–75)*

> ### ✅ Tekshirildi va MUAMMO YO'Q (uchinchi pass'ning ijobiy natijalari)
> - **`.env` git'ga commit qilinmagan** — `.gitignore:32` da, tarixda ham yo'q. **Sir sizishi YO'Q** ✅
> - Husky 3 hook faol (`pre-commit` · `pre-push` · `commit-msg`) ✅
> - Turbo pipeline to'liq: `dev · serve · build · typecheck · lint · test · test:e2e · test:visual · db:migrate · db:seed` ✅
> - `.env.example` + `.env.local.example` + `deploy/.env.production.example` mavjud ✅
> - Next 15 + React 19 — zamonaviy ✅
> - Sprint 17 (7 ta foundation fix) · Sprint 19 (Production) · Sprint 20 (Service Desk) · Sprint 22 (Help/shortcut) — bajarilgan ✅

---

# ⛔ FOYDALANUVCHIDAN KERAK (blocker'lar)

| Kod | ☐ | Nima | Nimani bloklaydi |
|---|---|---|---|
| **A** | [ ] | **moysklad.uz akkauntiga kirish** (capture olish uchun) | #18 (25 test) · #35 · #58–62 · **butun Blok 6** |
| **B** | [ ] | Toza capture'lar: Внутренний-заказ edit-form · production modul · non-UZS retail kassa · yopiq smena Z-отчёт | #58 · #59 · #60 · #61 · #62 |
| **C** | [ ] | Mahsulot qarorlari: `qty=0` ruxsatmi? · multi-bin miqdor kerakmi? · Сценарии/Бизнес-процессы qay darajada? | #71 · #65 · #54 · #55 |
| **D** | [ ] | Real kontragent ma'lumoti (production'da 0 ta) | #112 |
| **E** | [ ] | `yangibolim` moduli kerakmi yoki HR bilan ustma-ust tushadimi? | **butun Blok 5** (8–10 sessiya) |
| **F** | [ ] | **Scope qarori:** pixel-1:1 majburiymi yoki «funksional 1:1 + toza dizayn» yetarlimi? | Blok 6 hajmini 60–75 → 15–20 sessiyaga tushiradi |
| **G** | [ ] | **Drop qarori:** `sotuv` · `omborchi` · `restock-tasks` · `replenishment` · `cell` · `sklad-keeper` qaytariladimi? (main'da jonli production feature edi) | #118 · #123 |
| **H** | [ ] | Multi-tenant SaaS'mi yoki single-tenant self-hosted? | #134 · `subscription` sahifa · ADR-0003 |
| **I** | [ ] | `en` tili kerakmi? | #135 |

---

# 📊 YAKUNIY HISOB

| Blok | Bandlar | Sessiya | Holat |
|---|---|---|---|
| 0 — Qarzlarni yopish | 1–34 (34) | 8–10 | 🔴 |
| 1 — Adoption tugatish | 35–40 (6) | 10–14 | 🔴 |
| 2 — Phase-2 runtime QA | 41–50 (10) | 12–16 | 🟠 |
| 3 — Funksional bo'shliqlar | 51–74 (24) | 25–30 | 🟡 |
| 4 — HR to'liq | 75–82 (8) | 10–12 | 🟡 |
| 5 — yangibolim | 83–89 (7) | 8–10 | ⚪ |
| 6 — Vizual pixel 1:1 | 90–98 (9) | 60–75 | 🔴 |
| 7 — Test qamrovi | 99–104 (6) | 10–12 | 🟠 |
| 8 — Production-ready | 105–116 (12) | 12–15 | 🔴 |
| 9 — Platforma gigienasi + xavfsizlik | 117–136 (20) | 12–16 | 🔴 |
| 10 — Yo'qolgan route + xato-bardoshlilik | 137–150 (14) | 10–14 | 🔴 |
| 11 — Loyihaning o'z rejasidan qolgan scope | 151–157 (7) | 65–90 | 🔴 |
| **JAMI** | **157 band** | **~242–315 sessiya** | **~55% tayyor** |

## Qatlamlar bo'yicha hozirgi holat

| Qatlam | Tayyor |
|---|---|
| Ma'lumot modeli + backend API | ~90% |
| Frontend sahifalar mavjudligi | ~93% |
| Funksional to'g'rilik (ERP sifatida ishlaydi) | ~85% |
| moysklad 1:1 struktura (Phase-1) | ~70% |
| Runtime QA (Phase-2) | ~30% |
| Vizual pixel-1:1 (Phase-3) | ~5% |
| List-toolbar parity | 34% |
| E2E qamrov | ~5% |
| Production-readiness (Phase-4) | ~45% |

**Ikki o'lchov:** «ishlaydigan ERP sifatida» → **~80%** · «moysklad bilan pixel 1:1» → **~55%** · umumiy **~65%**.

---

> **Sinxronlash qoidasi:** har sessiya yakunida (1) shu faylda band `[x]` + commit-hash · (2) `NEXT.md`ga
> hand-off entry · (3) `MEMORY.md`ga 1 qatorli pointer. Uchtasi mos kelmasa — drift, keyingi sessiya to'g'rilaydi.

---

## Revizion tarix

| Sana | O'zgarish |
|---|---|
| 2026-07-27 | Birinchi versiya — 116 band (Blok 0–8) |
| 2026-07-27 | **Completeness-tekshiruv №3** → **Blok 11 qo'shildi (151–157, 7 band)**. Manba: `docs/MASTER-PLAN-1TO1.md` — loyihaning asl 100% rejasi (2026-07-02 dan muzlagan). Topilgan: 🔴 **hisobotlar kutubxonasi 16/200+** (loyihaning o'z bahosi 60–80 sprint kuni) · `moysklad-compat` 8/76 slug · **seed 17/208 model** (QA bloklovchi) · Prisma 5→6 / Nest 10→11 upgrade · 6 muzlagan reja hujjati · onboarding wizard. **Tayyorlik bahosi 65% → 55%** ga tuzatildi (hisobotlar scope'i hisobga olinganda). Ijobiy: `.env` commit qilinmagan, sir sizishi yo'q. |
| 2026-07-27 | **Completeness-tekshiruv №2** → **Blok 10 qo'shildi (137–150, 14 band)**. `main` ↔ `climart-adoption` **tizimli route-diff**: 310 vs 325 route → **19 yo'qolgan** (6 deklaratsiya qilingan drop emas — `settings/sms`, `settings/sms/templates`, `debts/calls/tomorrow` = «KEEP» ekotizimidan tasodifan yo'qolgan) · **33 yangi climart route hech qachon audit qilinmagan** · **0 ta error boundary** (325 sahifaga) · coverage o'lchanmaydi · `RESUME.md` uchinchi ziddiyatli entry-point · `payment-gateway` UI'siz. |
| 2026-07-27 | **Completeness-tekshiruv №1** → **Blok 9 qo'shildi (117–136, 20 band)** + blocker G/H/I. Topilgan bo'shliqlar: 78 dependency zaifligi (3 CRITICAL) · 6 bo'lim DROP qilingani hujjatlanmagan · 3 buzuq/eskirgan infra yozuvi · repo gigienasi · a11y · onboarding/help kontenti · multi-tenant qarori. Sabab: birinchi ro'yxat faqat ilova-funksiyasiga qaragan, platforma/infra/repo qatlami tekshirilmagan edi. |
