# NEXT.md ARXIVI — 2026-06-10 kontekst-slimlash

> Bu fayl NEXT.md'dan 2026-06-10 da VERBATIM ko'chirilgan tarixiy bo'limlar (hech narsa tahrirlanmagan,
> faqat joyi o'zgargan). Sabab: NEXT.md har sessiya boshida o'qiladi — 2648 qator kontekstni shishirardi.
> Jonli holat NEXT.md'da qoladi; bu yerda faqat yakunlangan tarix.

---

## §1 — LIST-AUDIT konveyer L1–L12 to'liq tarixi (NEXT.md 47–197-qatorlar edi)

### ✅ LIST-AUDIT KONVEYER TUGADI (A–L12, 2026-06-05) — FAOL konveyer YO'Q (keyingi track uchun pastdagi «Aniq keyingi vazifa»ga qara)

> Dvigatel: **`scripts/wf-cohort-list-audit.js`** (args = {family, directionFacts, pages[]} — sahifa = `${page}/page.tsx`).
> List-parity o'qi: column-set/labellar (§4 DOM-rol) · filtrlar · sort · bulk-actions · toolbar · empty-state · money/sana
> format · i18n (Cyrillic + Latin-uz). Har run: dvigatel → §4 ground-truth (capture list-grid `<th>`) → fix → gate
> (tc/biome/i18n/vitest) → **Phase-1 halol commit** (`fix(list): cohort … `) + `git push origin main`. **⚠️ commitdan
> oldin audit-agent qoldirgan stray scratch .txt larni tozalash** (capture-dir/messages ichida `git status` tekshir;
> `git add` ni faqat kerakli fayllarga qil — `git add -A` audit junk'ini olib kelishi mumkin, L1'da bo'ldi). Har birlik
> **«Phase-1, browser-smoke YO'Q».** Reja: `docs/audits/_NEXT-PHASE-PLAN.md`. Hisoblagich: `*-list.audit.md` → progress.json.
>
> **LIST-cohort navbati (detail oilalariga mos):**
> - **L1 · Money-docs ✅ TUGADI** (`3773fd11`, `wf_91bf549d-576`): cash-in/out · payments-in/out · prepayments ·
>   prepayment-returns · counterparty-adjustments — 30 confirmed → column-labellar (agent→Контрагент · moment→Время ·
>   sum→Приход/Расход · purpose→Назначение платежа) + balance-list hardcoded-uz menu→shared hook + dead-stub + mass-edit.
>   DEFER: payments 'UZS' hardcode (BE currency gap) · Op.-column extra · prepayment-returns filter-panel.
> - **L2 · Sales lists ✅ TUGADI** (`wf_0152de61-253`, 25 confirmed): customer-orders · demands · invoices-out ·
>   sales-returns — counterparty→«Контрагент» (×4) · date→«Время» · store→«Со склада»/«На склад» (directional) ·
>   invoiced_sum→«Выставлено счетов» · currency-col removed from default-visible (×4) · 'Pos.'→«Позиции» ·
>   sales-returns 'Ha'-badge→`tCommon('yes')`. **DEFER (Phase-2/BE):** demands «Грузополучатель» col (BE list-include
>   + FE); invoices-out «Статус» + sales-returns bulk-action toolbar (FSM-transition wiring, backend support unverified).
> - **L3 · Purchase lists ✅ TUGADI** (`wf_5450f535-0b7`, 31 confirmed): supplies · purchase-orders · invoices-in ·
>   purchase-returns · commission-reports · consignments · factures-in · factures-out — counterparty
>   «Поставщик»/«Покупатель»→«Контрагент» (×6) · date→«Время» · store→«Со склада»/«На склад» (directional) ·
>   'Pos.'→«Позиции» · 'Ha'-badge→`tCommon('yes')` · currency-col off-default (×6) · **supplies = whole-page Latin-uz
>   leak fully i18n'd** (chrome + STATE + SavedFiltersPills + state-col-default). **DEFER (Phase-2/BE):** invoices-in
>   missing cols «На склад»/«План.дата»/«Входящий №»/«Входящая дата» (BE-include); commission-reports/consignments
>   sortable-col vs BE sortBy-enum mismatch; consignments dead row-link (no `/consignments/[id]` route); purchase-returns
>   col-order; factures col-set (uncertain).
> - **L4 · Stock/internal ✅ TUGADI** (`wf_a606f369-20b`, 14 confirmed): moves · enters · losses · inventories ·
>   internal-orders — **cohort-wide grid-header label bug-class** (wrong `fields.*` key, gate-invisible): date
>   «Дата»(moment)→«Время»(time) ×5 · money «Себестоимость»(cost)→«Сумма»(sum) ×4 · store directional (moves
>   source/dest→store_from/store_to · enters→store_to «На склад» · losses/inventories→store_from «Со склада») ·
>   `'Pos.'`→«Позиции» ×4 · internal-orders `'№'`-literal→tFields('number'). **+«Организация» default column added**
>   (enters/losses/inventories — moysklad shows it, data was fetched but never rendered) · **«Причина» removed from
>   default-visible** (enters/losses — not a moysklad grid col, kept for ⚙) · money-cell `'UZS'`→`r.currency`
>   (moves/enters/losses; BE returns it). All §4 DOM-role ground-truthed (sortable grid header `title=`, not grep) +
>   label-grounding guard extended (5 captures + regression-lock). **DEFER (Phase-2/BE):** «Массовое редактирование»
>   bulk wiring (needs BE `/mass-edit` endpoint+modal) · trailing «Отправлено»/«Напечатано»/«Комментарий» cols
>   (BE-include) · inventories «Сумма»-existence + «Тип документа» col · internal-orders column-set realignment
>   (needs «Отгружено» BE field). Gates: tc0·biome0/0·i18n ru+uz·label-grounding·**web Vitest 1319, 0 regress**.
> - **L5 · Production ✅ TUGADI** (`wf_68a1e798-7d2`, 25 confirmed): productions · processings · processing-orders ·
>   production/boms · processes · stages · work-orders — **§4 via clean screenshots `10-module/*/dom/00-clean-default.html`
>   (list `01-default.html`/`dom-default.html` CONTAMINATED = Корзина/Заказы покупателей)**. **productions = degraded older
>   scaffold** (FIXED, mirror siblings): 🔴 dead pagination (nextCursor declared/unused, LIMIT-50 cap) · no bulk bar (BE
>   bulk-delete+bulk-transition exist) · no onRefresh · constant empty-state→filter-aware+richEmpty · dead ownerId param→owner
>   picker + applicable filter · onCreate-reload→createHref+createPosition=start. **Cohort labels** (DOM-grounded): date
>   «Дата»(moment)→«Время»(time) ×3 (productions/processings/processing-orders) · processings cost «База себестоимости…»
>   (cost_basis)→«Себестоимость»(tFields cost) · processings output «Количество выпуска»→«Объём производства» (new col_output_volume,
>   not the shared detail key) · `'№'` literal→tFields('number') ×2 (productions col_name «Номер»→«№») · **+«Организация»**
>   col on processings · **+«Описание»** col on processes (new col_description) · work-orders +«Время»(createdAt)/+«Завершение
>   производства»(plannedEndAt)/+«Комментарий»(description) data-present cols + date `toLocaleDateString`→`formatDateOnly`/`formatDate` ·
>   processing-orders `microqtyToWhole` `Number()/1000`→BigInt-safe digit-walk (precision). stages = clean. Guard:
>   `label-grounding.test.ts` +4 L5 captures +value/wiring locks. **DEFER (Phase-2/BE):** processing-orders title «Заказы на
>   переработку»→«Заказы на производство» (menu-grounded, no dedicated capture → re-capture) · trailing Отправлено/Напечатано/
>   Комментарий cols (BE-include, processings+work-orders) · work-orders Организация col (BE-include) · boms «Оплата труда»+«Затраты
>   на производство» cost-split + Комментарий (BE) · catalog selection/«Изменить» mass-edit (boms/processes/stages, BE) ·
>   processings/processing-orders hardcoded `'UZS'` = BE no-currency-column (NOT the L4 r.currency fix) · productions/stages
>   full column-set (no capture). Gates: tc0·biome0/0·i18n ru+uz·label-grounding 63·**web Vitest 1331, 0 regress**.
> - **L6 · Catalog ✅ TUGADI** (`wf_cabc94da-b58`, 27 confirmed): products(reference, toza) · product-folders(whole-page
>   Latin-uz i18n sweep — Yopish/NDSsiz/otadan/Nomi majburiy/«НДС ←» → 9 yangi key + VAT regex guard) · bundles/services
>   (money `formatMoney(price)`→`displayAs:'none'` [«сум» suffix olib tashlandi] · folder col «Папка»→«Группа» [products-parity]
>   · chrome onRefresh/selectionCount/createPosition="start") · variants(displayAs + stale belowMinimum comment fix + onClear)
>   · **tracking-codes 🔴 HIGH** (dead pagination: BE `take:200`+`total:items.length`, FE `hasNext={false}` → mirror products
>   cursor+real-count [BE schema+service+2 test] + FE wiring + sortable «Создано» col). **DEFER:** mass-edit(BE) · LIMIT
>   number(toza capture yo'q) · empty-state polish · help-route. **Phase-1, browser-smoke YO'Q.**
> - **L7 · CRM ✅ TUGADI** (`wf_e11d6251-8c3`, 25 agents, **15 confirmed / 3 refuted / 0 uncertain**): counterparties(reference,
>   real PNG capture) · contact-persons(no standalone moysklad list — sub-tab, FINDING.md) · opportunities · tasks · pipelines.
>   **counterparties i18n (gate-blind — no-hardcoded gate NEVER scans list pages):** 4 hardcoded Cyrillic gear-headers →
>   `t('col_*')` (mixed-script «STIR / ИНН» → per-locale ru«ИНН»/uz«STIR», form-grounded) + hardcoded Latin-uz `typeLabel`
>   map (leaked Uzbek into RU «Тип контрагента» filter dropdown) → `t('type_*')`, 10 new keys ru+uz. **Date cohort-bug
>   (opportunities+tasks):** local `toLocaleDateString('ru-RU')` helpers (byte-dup of shared `@moysklad/ui` `formatDateOnly`,
>   missing NaN-guard) → shared import; **«Создано»(createdAt) was date-only, all 8 sibling lists show date+time** → shared
>   `formatDate` (planned/due stay date-only; work-orders split precedent). **opportunities money:** amount cell kept «сум»
>   suffix → `displayAs:'none'` (15 multi-currency sibling list-cells use it; cellText keeps suffix for CSV, mirrors moves).
>   **Chrome cohort-drift** (present only on counterparties; 30-40 sibling pages + prior boms/bundles/services audits):
>   `onRefresh`+`createPosition='start'` ×4 (opp/tasks/contact-persons/pipelines) + `selectionCount` ×3 (the bulk pages;
>   pipelines has no bulk → correctly omitted). **richEmpty orphans** (empty_rich_* keys never wired) → heading+cta CTA ×3
>   (opp/tasks/contact-persons; pipelines has no keys). Guard: `label-grounding.test.ts` **+11 L7 wiring locks (70→81)**.
>   **DEFER (Phase-2/BE):** counterparties `/help/counterparties` dead route · all pagination liveness (cursor/total)
>   browser-unverified · per-entity LIMIT (25 vs 100, no moysklad page-size grounding). **Phase-1, browser-smoke YO'Q.**
> - **L8 · E-commerce/pricing ✅ TUGADI** (`wf_bcfd35ce-83f`; engine analyze/verify DEGRADED → premise extra_checks Opus-grounded):
>   ecommerce/channels · ecommerce/orders · discounts · price-lists · price-types. **§4: ALL 5 captures unusable** —
>   saleschannel + pricelist `00-clean-default.html` have the right `<title>` but a CONTAMINATED customer-order-form
>   body; pricetype `<title>=Заказы покупателей`; discounts+online-orders no capture → sibling-parity ONLY, no label
>   churn, no GROUNDING entry. **Topilmalar (intrinsic, 3 fix):** (1) orders `formatSum` `Number(sumMinor)/100`+«uz-UZ»
>   suffix → `formatMoney(…,{displayAs:'none'})` (BigInt-safe + thin-space separator; cellText keeps suffix for CSV) ·
>   (2) orders `receivedAt` raw `toLocaleDateString('uz-UZ')` → shared `formatDate` (date+time, NaN-guard) · (3) channels
>   `lastSyncedAt` raw `toLocaleDateString('uz-UZ')` → shared `formatDate`. discounts/price-lists/price-types CLEAN
>   (no i18n leak; price-types=inline-CRUD settings, price-lists=mature Move-pattern reference). Guard **+3 L8 wiring
>   locks (81→84, REGRESSION-LOCK only, no GROUNDING)**. **DEFER (Phase-2/BE):** discounts dead pagination (BE take:200
>   +total:items.length, low-cardinality → LOW) · all pagination liveness browser-unverified · per-entity LIMIT. Gate:
>   tc0·biome0·i18n ru+uz·label-grounding **84**·**web Vitest 1352 (+3, 0 regress)**. **Phase-1, browser-smoke YO'Q.**
> - **L9 · HR ✅ TUGADI** (`wf_7d22c330-542`): hr/employees · hr/payroll. **moysklad HR parity-scope = «Сотрудники» (employees) ONLY**;
>   payroll = bespoke 6-tab dashboard (no moysklad ref), the rest of hr/* (attendance/telegram/review/my-tasks/messages/reports/tasks)
>   = beyond-moysklad bespoke → out of cohort. **employees = CLEAN** (richer HR column set is the documented intentional redesign;
>   pagination CORRECT — BE `$transaction([findMany,count])` real total, NOT the L6/L8 dead-pagination class; bulk «Изменить» thin-menu
>   moysklad-grounded; i18n fully keyed). **payroll 3 intrinsic fixes (engine declared "clean" → my §1 ground-truth caught them):**
>   (1) **fmtMinor `-0`** — negative sub-1-som (`finalSalaryMinor` when fines>salary) rendered «-0» → drop sign on zero magnitude;
>   (2) **🔴 snapshot-today dead-refresh** — `qc` was never threaded into KpiTab so `snapMut` couldn't invalidate → «Snapshot today»
>   upserted server-side but the KPI table never refetched → thread qc + `onSuccess invalidate(['hr-kpi-daily'])`;
>   (3) **silent-failure** — computeMut/snapMut/removeMut had no `onError` → added `toast.error(action_failed)` (mirrors employees;
>   0 new i18n keys). Guard +3 L9 REGRESSION-LOCK (84→87, no GROUNDING — bespoke, no capture). **DEFER:** payroll date cells use
>   `formatInTimeZone(...,'yyyy-MM-dd')` (ISO, TZ-explicit Asia/Tashkent) vs app-wide `DD.MM.YYYY` — adversarially **REFUTED ×2** (bespoke
>   page, TZ-explicit is safer; any normalization needs a TZ-aware shared `formatDateTz`, not a naive swap). Gate: tc0·biome0·i18n ru+uz
>   (0 new)·label-grounding **87**·web Vitest **1355 (+3, 0 regress)**. **Phase-1, browser-smoke YO'Q.**
> - **L10 · Retail ✅ TUGADI** (`wf_8396e50e-8bc`, 17 agents, **11 confirmed / 1 refuted / 1 uncertain**): retail/sales ·
>   retail/sessions. DEDUP cohort (detail-audited in Cohort E 2026-06-03h) → **list axis ONLY**. **§4: both list HTML captures
>   CONTAMINATED** (`08-module/{retailshift,retaildemand}/dom/01-default.html` = `<title>Корзина</title>`) → clean PNG
>   `screenshots/00-clean-default.png` is the only ground-truth (retaildemand PNG = empty-promo → sales column-set = sibling-parity
>   only). **sessions 3:** (1) **🔴 dead search box WIRED** — `_search` computed-never-threaded + BE had no `search` field
>   (sibling sales threads it); WIRED BE `search`(trim·min1)→service `OR[cashier.name, description]` + FE thread params/queryKey
>   (+2 schema test). **Adversarial:** session `name`(moysklad «№») never set on open()=`''` → search cashier+comment, kept honest
>   «Имя кассира…» placeholder (resolves uncertain placeholder finding — NO «Номер или комментарий», we have no number col) ·
>   (2) **hardcoded Latin-uz `header:'Holat'`→`tCommon('status')`** (gate-blind RU-leak; common.status «Статус»/«Holat», 0 new keys) ·
>   (3) **fetched-but-unrendered «Склад»+«Организация» cols ADDED** (BE include fetches both, moysklad PNG shows both — L4/L5
>   carve-out; existing fields.store/organization, 0 new keys; +organization on SessionRow). **money bug-class (both):** sessions
>   sales-sum+discrepancy + sales sum → `formatMoney(..,{displayAs:'none'})` (sessions uses row.cashDesk.currency; **sales: added
>   currency to retail-sale list include** vs hardcode-UZS) + CSV cellText raw-minor→formatMoney. **sales:** uz typo **«Cheklarlar»
>   (double-plural)→«Cheklar» ×3** (subnav+title+empty; gate-blind Latin). Guard **+5 L10 REGRESSION-LOCK** (92, PNG→no GROUNDING).
>   **DEFER:** opened_at/closed_at «Открыта»→«Дата открытия» (PNG-grounded + collision, but engine immunized as redesign +
>   keys SHARED with audited detail/z-report → §4 defer) · «Касса»vs«Точка продаж» · «Изменить» mass-edit · pagination liveness.
>   Gate: tc0(web+api)·biome0·i18n ru+uz(0 new)·label-grounding **92**·**web Vitest 1360 (+5, 0 regress)**·**api Vitest 2603
>   (+2, was 2601)**. **Phase-1, browser-smoke YO'Q.**
> - **L11 · Settings-finance ✅ TUGADI** (`wf_4725376c-9cd`, 8 cand → **5 confirmed [= 1 defect] / 3 refuted / 0 uncertain**):
>   bank-accounts · cash-desks · expense-items · tax-rates · currencies · exchange-rates · mxik. **§4: hech bir sahifada toza
>   capture YO'Q** (yagona currency capture CONTAMINATED — `<title>Корзина</title>` + «Входящий платёж») → sibling-parity ONLY,
>   label churn yo'q. **5 confirmed = AYNAN BITTA defect** (5 agent scrambled page-attribution): **🔴 tax-rates dead/inert search
>   box WIRED (full-stack, L10-sessions class)** — FE `search=""`+`onSearchChange={() => undefined}` (ListView:440 box render-u
>   no-op) + BE `TaxRateService.list()` schema'dagi `search`'ni `where`ga umuman qo'llamaydi → FE thread (searchInput+useDebounce+
>   params/queryKey+no_results emptyTitle) + BE `where.OR=[comment contains, …(numeric? rate exact)]` (**rate=Decimal, contains
>   EMAS; comment=yagona free-text**). **Placeholder «По ставке…» SAQLANDI (label churn yo'q, §4-clean)** — rate-OR-comment uni
>   halol qiladi (12 → 12% topadi). +2 api test (search accept + service source-scan lock), +1 web wiring lock. **CLEAN (6,
>   critic-vetted + Opus GT):** bank-accounts/cash-desks (real cursor pagination + BigInt-safe formatMoney) · currencies (bespoke
>   inline-CRUD, bulk dropdown wired, onError hammasida) · exchange-rates (read-only CBU sync, success+error) · mxik (real cursor+
>   count, import-only create) · i18n hammasi keyed. Guard **+1 L11 wiring lock (92→93, no GROUNDING — §4 capture yo'q)**. **DEFER:**
>   expense-items+tax-rates BE take:200/FE hasNext={false} dead pagination (low-cardinality → L8-discounts class) · bank-accounts/
>   cash-desks balance cellText raw-minor CSV (ExportButton render qilinmaydi → unreachable dead-code) · pagination/search liveness
>   browser-unverified. **7 audit doc → progress.json list_audits 58.** Gate: tc0(web+api)·biome0·i18n ru+uz(0 yangi)·lg **93**·
>   **web Vitest 1361 (+1)**·**api Vitest 2605 (+2, was 2603)**. **Phase-1, browser-smoke YO'Q.**
> - **L12 · Settings-org ✅ TUGADI — OXIRGI LIST COHORT, A–L12 KONVEYER YOPILDI** (`4893fccc`, `wf_9bba0f00-850`, 13 page,
>   31 cand → **23 confirmed / 8 refuted / 0 uncertain**): publications · users · task-types · uoms · regions · orgs ·
>   webhooks · print-templates · label-templates · custom-entities · stores · projects · attributes. **§4: FAQAT uoms+projects
>   toza** (`dom/00-clean-default.html` real grid `>LABEL<`+`title=` → DOM GROUNDING; root DOM'lar kontaminatsiyalangan).
>   🔴 **publications LIST whole-page Latin-uz leak** (8 header + 27-entry doc-type map + status) → to'liq i18n + `detail_titles`
>   map (detail audit faqat [id]/new i18n qilgan edi). **users** position `tFields('state')`→`col_position` «Должность» + dead
>   search olib tashlandi (BE endpoint yo'q) + lastLogin→formatDate. **task-types** dead search WIRED (BE qo'llab-quvvatlaydi) +
>   name_required + useApiMutation. **uoms** §4 DOM realign (+Тип/Полное наименование, col_name→«Краткое наименование»).
>   **regions/orgs** BE search honesty (OR[name,code] + uzRequisites.inn JSON-path) +2 api test. **webhooks/print-templates/
>   label-templates** dead cursor/sort/archive WIRED. CLEAN: custom-entities/stores/projects/attributes. Guard **+13 (lg 93→106)**.
>   Gate: tc0(web+api)·biome0·i18n ru+uz·lg **106**·**web Vitest 1374 (+13)**·**api Vitest 2607 (+2, was 2605)**. **Phase-1,
>   browser-smoke YO'Q. ➡️ LIST KONVEYER A–L12 BUTUNLAY TUGADI.**

---

## §2 — «Aniq keyingi vazifa» eski sessiya-entry'lari: 2026-06-08n → 2026-05-30 (NEXT.md 413–1995-qatorlar edi)

> **🆕🔬🟢 2026-06-08n — 2 ORPHANED/UNRENDERED History-feed nuqson tuzatildi (08m residual a+b yopildi): counterparty bank-account audit-feed bug-class + Task transition-diff shape.** `davom et` (lokal Opus, ultracode). Session-start audit **GO** (4-agent: 5 commit struktura-halol, **zero DONE-drift**; audit mustaqil tasdiqladi ikkala item ham haqiqatan owed — `delete-bank-account` fix «aging without a cohort trigger» ro'yxatida edi, jim qilinmagan). Stack jonli: web :3100 · api :4000 · db :5433 · Playwright MCP (orphaned mcp-chrome tree — 7 chrome.exe `AppData\Local\ms-playwright` profil-lock'da, kill bilan tozalandi).
> **🟢 ITEM 1 — counterparty bank-account audit'lari counterparty History'dan ORPHANED edi (3-instance bug-class, hujjatlangan 1-qatorli residual EMAS):** counterparty `[id]` sahifa bank hisoblarini **read-only** ko'rsatadi («moysklad'da alohida boshqariladi») va History tab'i = **ota counterparty** feed'i (`auditEntity="Counterparty"` → `GET /audit-logs?entity=Counterparty&entityId=<cpId>`). Uchala nested bank-account endpoint (`POST/PATCH/DELETE /counterparties/:id/bank-accounts`) **hech bir sahifa so'ramaydigan** audit yozardi: **create/update** `entity:'CounterpartyAccount'` (detail sahifasi YO'Q model) · **delete** `entity:'Counterparty'` (to'g'ri) lekin `entityId=bankAccountId` (NOTO'G'RI). 08m faqat delete `entityId`'ni belgilagan — aslida delete bug = **3 instansiyaning bittasi** (bug-class intizomi: «bu bug qaysi pattern misoli, qayerda takrorlanadi?»). Source-check: `apps/`'da **hech narsa `entity='CounterpartyAccount'`'ni o'qimaydi** → write-only orphan. **✅ FIX (08g bundle component-list parent-feed pattern mirror):** uchalasi ota counterparty'ga yoziladi (`entity='Counterparty'`, `entityId=counterpartyId`) + **distinct lokalizatsiyalangan fe'l** + bitta `bankAccount` summary diff (`{before,after}`). Bitta summary tanlandi (granular EMAS): `translateField` noma'lum `fields.<key>`'ni xom field-nomiga degrade qiladi, bank fieldlardan faqat `currency` bor (mfo/swift/correspondentAccount… YO'Q) → granular diff **xom inglizcha field-nom leak qilardi**; bitta `fields.bank_account` key diff'ni leak-free saqlaydi. **i18n (grounded ru+uz):** `action_create_bank_account`=«Банковский счёт добавлен»/«Bank hisobi qo'shildi» · `action_update_bank_account`=«…изменён»/«…o'zgartirildi» · `fields.bank_account`=«Банковский счёт»/«Bank hisobi». 08m **self-maintaining source-scan** 2 yangi slug'ni avtomat talab qiladi — **non-vacuous** tasdiqlandi (scan counterparty.service.ts'dan `create-bank-account`+`update-bank-account`'ni yig'adi). **🔬 LIVE api+db smoke 10/10** (create cp → add/edit/delete bank → 3 row, **har biri `entityId=counterpartyId`**, o'qiladigan before→after summary). **🔬 BROWSER RU:** «Банковский счёт изменён/добавлен» + «Банковский счёт: 20208… · Ipak Yo'li Bank→…Asaka Bank». **UZ:** «Bank hisobi o'zgartirildi/qo'shildi» + «Bank hisobi: …».
> **🟢 ITEM 2 — Task transition diff HECH QANDAY status o'zgarishini ko'rsatmasdi (08m residual b):** `task.service.ts` transition'i `fieldChanges={from:<status>,to:<status>}` — **flat string** yozardi; HistoryTimeline har change'ni `typeof change==='object'` bilan filtrlaydi → flat `from`/`to` tashlanardi → Task transition qatori **headline'ni ko'rsatib, diff'ni YO'Q** (boshqa har FSM hujjat «Статус: X→Y» ko'rsatadi). Yagona flat-shape yozuvchi edi; **26 boshqa servis** (`cash-in.service.ts:499`) `from:{before,after}` ishlatadi. **✅ FIX:** Task transition endi kogort-standart `from:{before,after}` object-shape yozadi (timeline object-guard'idan o'tadi + 08m `translateValue` `states.<entity>` orqali map qiladi) + **`states.task`** (ru+uz) qo'shildi, forma'ning grounded `pages.tasks.statuses` map'ini mirror (open=«Открыта»/«Ochiq» · in_progress=«В работе»/«Jarayonda» · done=«Выполнена»/«Bajarildi» · cancelled=«Отменена»/«Bekor qilindi» — §4, status badge ishlatadigan ayni vocabulary). **🔬 LIVE smoke:** transition → `fieldChanges={from:{before:'open',after:'in_progress'}}` (object-shape isbotlandi). **🔬 BROWSER UZ:** «Holat o'zgardi» + **«Holat: Ochiq→Jarayonda»** (oldin: diff YO'Q). **RU:** «Статус изменён» + **«Статус: Открыта→В работе»** (oldin: diff YO'Q).
> **Guard:** `document-history.test.ts` (**+3**: counterparty bank-account parity-feed regression-lock — 3 fe'l · `entity:'CounterpartyAccount'` YO'Q · `entityId=counterpartyId` not bankAccountId) · `use-audit-labels.test.tsx` (Task cross-entity `translateValue` no-leak + `states` ru⇄uz parity lock — 0 yangi `it()`, loop-iteration). **Gate (TO'LIQ yashil): api tc0 · web tc0 · biome0(6 fayl) · api Vitest 2805(+3, was 2802) · web Vitest 1458(0 regress).** Audit: `_PHASE2-history-orphaned-feeds.audit.md`.
> **🟡 Residual (DEFER):** counterparty bank-account CRUD'ning **FE UI'si YO'Q** (detail jadval read-only — moysklad in-form boshqaradi, bizda hali yo'q). Audit-feed API-path/kelajak-FE/import uchun to'g'ri; in-form editor = alohida feature, audit gap EMAS.
> **➡️ KEYINGI `davom et`:** (a) production owed smoke'lar (S1/S2 stage performer-name — `seed:hr` allPerformers=false kerak · B4 BOM outputQty=0→localized reject · P1 empty process→localized error) · (b) retail **RS4** (non-UZS cash desk seed) · (c) BE-backlog (boms cost-split, work-orders docDate — moysklad-grounding kerak, ko'r-ko'rona EMAS).

> **🆕🔬🟠 2026-06-08m — PHASE-2 BROWSER-QA → 08l RESIDUAL yopildi (transition-DIFF enum-value i18n) + 🟠 IKKINCHI app-wide History action-label LEAK topildi+tuzatildi (`mark-printed` ×9 servis).**
> `davom et` (lokal Opus, ultracode). Session-start audit **GO** (4-agent: 5 commit struktura-halol, zero DONE-drift; faqat 2 doc-staleness — NEXT.md L255 «analitika/staff re-key owed» 08k da bajarilgan + `confirmdialog-from-ui.test.ts` typo `.tsx` — **bu sessiya ikkalasi tuzatildi**). Anti-konfabulyatsiya: live optimistic-lock harness **180/180** AVVAL tasdiqlandi (56 entity). Stack jonli: web :3100 · api :4000 · db :5433 · Playwright MCP (orphaned mcp-chrome tree — 7 chrome.exe `AppData\Local\ms-playwright` profil-lock'da, kill /T bilan tozalandi).
> **🟠 ITEM 1 — transition-DIFF enum-value leak (08l ataylab DEFER qilgan residual):** 08l action **headline**'ini lokalizatsiya qildi (`transition:completed`→«Выполнено») lekin pastdagi **diff**ni qoldirdi. WO ТЗ-2026-00001 History diff hali **xom** ko'rsatardi: `from: in_progress→completed` (xom `from` field-key + xom FSM enum qiymatlar). **Sabab:** **26 servis** transition diff'ni bir xil shaklda yozadi — `fieldChanges={from:{before:<oldState>,after:<newState>}}` (xom enum slug'lar) — `HistoryTimeline` ularni generic `formatValue` bilan, `from` field-key'ini esa map'siz `translateField` bilan render qilardi. **✅ FIX:** (1) `useAuditLabels(entity?)` → yangi `translateValue(field,value,action)`: `transition:*` entry'ning `from` qiymatini **grounded `states.<entity>` lug'ati** (status badge ishlatadigan ayni map; §4 — taxmin YO'Q) orqali map qiladi; `translateField('from')`→`audit.field_from` («Статус»/«Holat»); noma'lum state xom slug'ga degrade (hech qachon yomonroq emas); PascalCase auditEntity→snake `states` kalit deterministik. (2) `HistoryTimeline` (DS) yangi `translateValue` prop — before/after uni ishlatadi, `undefined` qaytsa `formatValue`'ga qaytadi (transition bo'lmagan diff'lar tegilmaydi). (3) ikkala consumer (`document-tabs`+`detail-content-tabs`) `auditEntity` + `translateValue` uzatadi. (4) i18n: **`states.work_order`** (draft/in_progress/completed/cancelled) + **`states.production`** (draft/posted/cancelled) — yagona yetishmagan, live History sahifasi bor `states.<entity>` map'lar, mavjud app-vocabulary'dan grounded; `audit.field_from` ru«Статус»/uz«Holat». (`ServiceRequest` transition yozadi lekin `[id]` detail sahifasi YO'Q → History render qilinmaydi → scope tashqarisi.) **🔬 BROWSER end-to-end:** WO **RU**: «Выполнено»→**Статус: В работе→Выполнено** · «В работе»→**Статус: Черновик→В работе** · WO **UZ**: «Bajarildi»→**Holat: Ishda→Bajarildi** · «Ishda»→**Holat: Qoralama→Ishda**. To'liq mexanizm (field-label + value, 2 lokal) `DocumentTabs` consumer'da tasdiqlandi; `DetailContentTabs` consumer ITEM 2 orqali (mark-printed) tasdiqlandi; cross-entity `states.<entity>` qoplamasi unit-lock (11 entity, ru+uz). **Bonus:** long-tail (customer-order `partially_shipped` headline generic «Статус изменён»ga degrade bo'lsa ham) diff endi aniq lokalizatsiyalangan state'larni ko'rsatadi.
> **🟠 ITEM 2 — `mark-printed`/`unmark-printed`/`delete-bank-account` xom action leak (08l O'TKAZIB YUBORGAN):** ITEM 1'ni browser-verify qilayotib smoke customer-order History'da **`mark-printed`** headline **xom** ko'rindi (3×). 08l action-slug'larni qo'lda sanagan va bularni o'tkazib yuborgan. **Definitive cross-check:** `mark-printed`+`unmark-printed` = **9 servis** (customer-order/demand/invoice-out/payroll/processing/purchase-order/purchase-return/sales-return/supply) **user-visible**; `delete-bank-account` (counterparty) `entity:'Counterparty'` lekin `entityId=bankAccountId` → counterparty History query'ga mos kelmaydi → **orphaned/ko'rinmaydi** (latent BE entityId bug, scope tashqarisi; key baribir qo'shildi). (`cancelled`/`draft`/`unposted` = `processing.service.ts:1308` template-ternary'dan regex false-positive, runtime'da `transition:*`.) **✅ FIX (grounded ru+uz):** `action_mark_printed`=«Напечатано»/«Chop etildi» · `action_unmark_printed`=«Отметка о печати снята»/«Chop belgisi olib tashlandi» · `action_delete_bank_account`=«Банковский счёт удалён»/«Bank hisobi o'chirildi». **🔬 BROWSER:** customer-order History (RU) 3× `mark-printed`→**«Напечатано»**.
> **🛡️ STALENESS BUG-CLASS'NING ASL TUZATISHI — self-maintaining source-scan guard:** 08l leak'i VA bu mark-printed leak'i ikkalasi ham guard BE slug'larni **qo'lda sanagani** + ro'yxat eskirgani uchun o'tib ketdi. `use-audit-labels.test.tsx` endi **source-scan** qo'shadi — test paytida `apps/api/src/modules`'ni yuradi, har audit action literal'ini ajratadi (`logAudit` 3-arg + `auditLog.create` ichidagi `action:`, ternary+template-literal'ni hisobga olib) va har biri ikkala lokal'da lokalizatsiyalanishini tasdiqlaydi. Yangi qo'shilgan key'siz action endi DARHOL CI'ni yiqitadi — qo'lda kuzatuv kerak emas. (Non-vacuous: development paytida scan `mark-printed`'ni key qo'shilmasdan oldin to'g'ri flag qildi.)
> **Guard:** `use-audit-labels.test.tsx` (**+10**, endi 15): translateValue 11-entity×2-lokal no-leak + dedicated-label + undefined/degrade/field-label + `states` ru⇄uz parity + **source-scan** (sanity-floor+ru+uz). `historytimeline-from-ui.test.tsx` (**+3**, endi 24): translateValue before/after wiring/undefined-fallback/action-passthrough. **Gate (TO'LIQ yashil): web tc0 · DS tc0 · biome0(8 fayl) · web Vitest 1458(+13, was 1445) · DS Vitest 118 · api tegilmadi(2802).** Audit: `_PHASE2-history-transition-diff-i18n.audit.md`.
> **🟡 Residual:** ~~(a) `delete-bank-account` audit `entityId=bankAccountId`~~ ✅ **08n da YOPILDI** (entity/entityId bug-class — yuqoridagi 08n entry); ~~(b) Task transition `{from,to}` flat string → diff YO'Q~~ ✅ **08n da YOPILDI** (object-shape + `states.task`).
> **➡️ KEYINGI `davom et`:** (a) production owed smoke'lar (S1/S2 stage performer-name — `seed:hr` allPerformers=false kerak · B4 BOM outputQty=0→localized reject · P1 empty process→localized error) · (b) retail **RS4** (non-UZS cash desk seed) · (c) BE-backlog (boms cost-split, work-orders docDate — moysklad-grounding kerak, ko'r-ko'rona EMAS).

> **🆕🔬🟠 2026-06-08l — PHASE-2 BROWSER-QA (production-config cohort) → 🟠 HIGH app-wide History (Tarix) tab action-label i18n LEAK topildi+tuzatildi.**
> `davom et` (lokal Opus, ultracode). Session-start audit **GO** (3-agent: 5 commit struktura-halol, zero DONE-drift; faqat 1 doc-staleness:
> NEXT.md L535 `price-list` lock gap eski 08g snapshot — bu sessiya tuzatildi). Anti-konfabulyatsiya: live optimistic-lock harness **180/180**
> AVVAL tasdiqlandi. Stack jonli: web :3100 · api :4000 · db :5433 · Playwright MCP (orphaned mcp-chrome tree PID 2128 — `AppData\Local\ms-playwright`'da,
> TEMP'da EMAS — kill /T bilan tozalandi). **Phase-2 smoke'lar tasdiqlandi:** **W3** WO transition→History rows ko'rinadi · **W1** WO sana «Начато»/
> «Завершено» = `27.04.2026 07:46` (date+time ru) · **pagination footer UZ** = «1-1 dan 1» (moysklad-style, QA-backlog #3'ning UZ qarzi yopildi).
> **🟠 BUG (HIGH, gate-ko'rmas — tc/biome/unit hech qachon History tab'ni render qilmaydi):** WO History'da transition qatorlari **xom slug** ko'rsatardi:
> `transition:completed`/`transition:in_progress` (lokalizatsiya YO'Q), `Создано` esa lokalizatsiyalangan. **Sabab:** ikkala History consumer
> (`document-tabs.tsx` + `document-detail/detail-content-tabs.tsx`, **39 detail sahifada**) bir xil `translateAction` nusxasiga ega edi —
> `a.replace(/\./g,'_')` faqat `.` ni normallashtirardi, `:` va `-` ni EMAS, va `audit` namespace faqat `action_{create,update,delete,restore}` ga ega edi.
> Natijada **butun action-vocabulary xom sizardi**: `transition:*` (har posted/transitioned doc), `mass-edit` (20 servis), `clone` (~17), `archived`/
> `restored` (8+8 katalog/CRM), `set:waiting`/`clear:waiting`/`create:cashout` (PO). **✅ FIX:** (1) shared **`useAuditLabels()` hook** (ikkala consumer
> ishlatadi — dedup + ikkalasini birga tuzatadi); `[-.:]`→`_` normallashtirish + `transition:<unknown>` uchun generic **`action_transition`** fallback
> (customer-order long-tail `partially_shipped`/`paid` + kelajak state'lar xom slug EMAS, «Статус изменён»ga degrade); (2) **16 grounded i18n key**
> ru+uz (`action_transition*` + mass_edit/clone/archived/restored/set_waiting/clear_waiting/create_cashout). **§4 grounding:** mavjud app vocabulary'dan
> (`action_demand_post`=«Проведено», `work_orders.statuses.completed`=«Выполнено»/«Bajarildi», `action_customer_order_transition`=«Статус изменён»,
> `bulk_mass_edit`=«Массовое редактирование») — taxmin YO'Q. **🔬 BROWSER end-to-end (2 consumer × 2 action × 2 locale):** WO (DocumentTabs, ru):
> `transition:completed`→**Выполнено**, `transition:in_progress`→**В работе** · demand 06847 (DetailContentTabs, ru): `mass-edit`→**Массовое
> редактирование** · WO uz: **Bajarildi**/**Ishda**/**Yaratildi**. **Guard:** `use-audit-labels.test.tsx` +5 (23 BE slug'ning hammasi ru+uz'da non-raw
> resolve · dedicated label'lar · unknown→generic degrade · ru⇄uz key parity). **Gate: web tc0 · biome0(6 fayl) · web Vitest 1445 (+5, 0 regress, was 1440) ·
> api tegilmadi (2802 turadi).** Audit: `_PHASE2-history-action-i18n.audit.md`. **🟡 Residual (~~DEFER~~ ✅ 08m da YOPILDI):** transition diff hali xom
> `from: in_progress→completed` ko'rsatardi (BE `fieldChanges={from:{before,after}}` + xom FSM enum qiymatlari) — enum-value lokalizatsiyasi alohida
> kattaroq yuza edi → **2026-06-08m da `translateValue`+`states.<entity>` bilan tuzatildi** (yuqoridagi 08m entry'ga qara).
> **➡️ KEYINGI `davom et`:** (a) qolgan production owed smoke'lar (S1/S2 stage performer-name render — `seed:hr` allPerformers=false stage kerak ·
> B4 BOM outputQty=0→localized reject · P1 empty process→localized error) · (b) retail **RS4** (non-UZS cash desk seed) · (c) transition-diff enum-value
> i18n (residual yuqorida) · (d) BE-backlog (boms cost-split, work-orders docDate — moysklad-grounding kerak, ko'r-ko'rona EMAS).

> **🆕🔬🔴 2026-06-08k — PHASE-2 BROWSER-QA (analitika/staff + money-docs + retail) → 🔴 HIGH POS-register CRASH topildi+tuzatildi + retail drawer hardened.**
> `davom et` (lokal Opus, ultracode). Session-start audit **GO** (3-agent: 5 commit struktura-halol, zero DONE-drift; faqat
> 1 doc-staleness — NEXT.md RS1 «owed» deb yozilgan edi, aslida 08d'da verified). Anti-konfabulyatsiya: live optimistic-lock
> harness **180/180** AVVAL tasdiqlandi (56 entity jonli yashil). Stack jonli: web :3100 · api :4000 · db :5433 · Playwright
> MCP (orphaned mcp-chrome profil-lock tozalandi). **4 Phase-2 item drained + 2 fix:**
> **(1) ✅ analitika/staff conflict-dialog (08j owed)** — 409→lokalizatsiya dialog («Запись изменена…», role=dialog, raw leak
> YO'Q)→«Обновить данные»→**`key={data.version}` parent remount re-seed** (forma «OOB-55714»ni ko'rsatdi = fresh server copy,
> stale tahrir tashlandi)→re-save **200** (network: 409·GET·200·GET, v1→v3). Conflict-dialog kogorti endi **3 xil reload
> mexanizmida** browser-verified: `[data]`-effect (roles/customer-order), modal findOne re-seed (hr-employee 08j),
> `key=version` remount (staff, BU sessiya).
> **(2) ✅ money-docs P1/P2/P3** (har biri browser + adversarial runtime): **P1** wholesale prepayment edit-save → **200** (PATCH
> body `cashSumMinor:"0"` emas `null` — adversarial probe: `null`→**400** «Expected string, received null», `'0'`→200 isbotladi
> fix kerakligini); **P2** prepayment-return currency `[disabled] UZS` (read-only source-locked) + BE `.strict()` `currency` PATCH
> → **400** «Unrecognized key 'currency'» (bypass yopiq); **P3** «Остаток к возврату: **3 000,00 сум**» = NET (5000 manba − 2000
> oldingi qaytarish), to'liq 5000 emas + over-refund POST (4000 > 3000) → **400** «Qaytarish summasi ortib ketdi… qolgan 300000».
> Test-zanjiri to'liq tozalandi (unpost→delete, balans tiklandi).
> **(3) 🔴 HIGH FIX — /retail POS register CRASH:** adversarial browsing'da topildi. `/cashier-sessions/current`
> (`findCurrentForCashier`) yagona session-metod edi (list/findOne/open/close'dan farqli) `cashier` include'ni TASHLAB
> ketgan → faqat `cashierId` qaytardi → FE `session.cashier.name` (retail/page.tsx:342) → **client-side TypeError → butun
> /retail register OQ-EKRAN** har ochiq sessiyada. Gate-ko'rmas (TS FE-tip `cashier` borligini da'vo qiladi; Prisma untyped
> include o'tkazib yubordi). **FIX (BE):** `cashier:{select:{id,name}}` include qo'shildi (4 sibling metodni mirror). Browser:
> register endi yuklanadi (header «Admin User · Smoke kassa»). **Guard:** `cashier-session-current-contract.test.ts` (+2,
> source-scan: current() `cashier` include qiladi). 
> **(4) ✅ FIX — POS register drawer hardened** (bug-class follow-through: cohort-E RS2/RS3 fix IKKI drawer'dan BITTASIGA
> qo'llanilgan edi). POS register (retail/page.tsx) drawer'i session-detail sibling'dan farqli: (a) `description` YUBORMASDI
> (RS2 gap) + (b) `BigInt(Math.round(major*100))` ishlatardi (currency-aware EMAS). FIX = sibling'ni mirror:
> `Money.fromMajor(amount, tillCurrency)` + comment maydoni + panel i18n (Latin-uz «Naqd kiritish/Summa/Tasdiqlash/Bekor» →
> grounded ru/uz; drawer_out «Изъятие»→grounded «Выплата», retailshift capture label-grounding test grounds qiladi). Browser:
> Внесение 150.50 + izoh → drawer-in `{sumMinor:"15050",description:"…"}` **201**, session-detail ops list'da ko'rinadi
> (`ВН-2026-00001 · QA Phase-2 browser test · +150,50 сум`). **🟡 Caveat:** «Выплата» toolbar render web-recompile'dan keyin
> (next-intl server message cache; kod+unit-verified, diskda).
> **Gate (TO'LIQ yashil): api tc0 · web tc0 · biome0(changed) · api Vitest 2802(+2) · web Vitest 1440(0 regress).** Audit:
> `_PHASE2-retail-register.audit.md`. **Doc-staleness tuzatildi:** retail QA-backlog RS1✅/RS2✅/RS3✅, RS4 owed.
> **➡️ KEYINGI `davom et`:** (a) **RS4** (non-UZS cash desk seed → drawer currency suffix) · (b) qolgan owed smoke'lar
> (stock/internal IO-1-4, production W3/S1/S2, pagination footer pixel) · (c) BE-backlog (boms cost-split, work-orders docDate —
> moysklad-grounding kerak, ko'r-ko'rona EMAS).

> **🆕🔬🐞 2026-06-08j — PHASE-2 BROWSER-QA (optimistic-lock conflict dialogs) → HIGH design-system bug topildi + tuzatildi (confirm-dialog-in-modal).**
> `davom et` (lokal Opus, ultracode). Session-start audit **GO** (5 commit halol, drift yo'q; audit #1 standing-risk'ni
> **browser-smoke qarzi 10+ sahifa, cohort-trigger yo'q** deb belgiladi → aynan shuni drain qildim). Live harness avval
> tasdiqlandi: **180/180** (56 entity jonli yashil — confabulyatsiya emas). **Stack jonli:** web :3100 · api :4000 · db
> :5433 · Playwright MCP (orphaned mcp-chrome profil-lock ~5 soatlik → kill tree bilan tozalandi). **2 conflict dialog
> BROWSER-VERIFIED:** (1) **`roles`** (config, full-page) — 409→lokalizatsiya dialog→reload→re-hydrate (`[data]`-effect)→200
> (v3→v5, to'liq sikl); (2) **`hr-employee`** (edit **MODAL**, PUT) — bu novel modal-yuza **HIGH bug ochdi.**
> **🐞 BUG (HIGH, gate-ko'rmas — tc/biome/unit/lock-harness hammasi yashil edi, faqat real brauzerda):** ANY Radix
> `Modal` ICHIDAN chaqirilgan `ConfirmDialog`/`useConfirm` (lock conflict-reload YOKI modal-ichi delete) **3 nuqson bilan
> buzilgan edi:** (1) modal ORTIDA yashiringan (`ConfirmDialog` `z-[--ms-z-modal]`=400 = modal bilan bir xil; Radix modal
> body-end'ga portal → ustiga chizadi); (2) ko'rinsa ham **bosib bo'lmaydi** — Radix modal ochiqligida `body{pointer-events:
> none}` qo'yadi, confirm (modal-tashqi body-child) shuni **inherit qiladi** → har klik modal'ga o'tib ketadi
> (`elementsFromPoint`→modal grid; Playwright click timeout "subtree intercepts pointer events"); (3) bosilsa **host modal
> yopiladi** (Radix interact-outside default). Natija: foydalanuvchi faqat modal'ni ko'radi, Save bossa yana yashirin 409 →
> **conflict UI'dan hal qilib bo'lmaydi.** 08d customer-order E2E buni ko'rolmasdi (full-page forma, modal yo'q).
> **✅ FIX (design-system, 4 fayl):** `--ms-z-confirm: 450` token (globals.css + z-indices.ts) · `ConfirmDialog` overlay
> `z-[--ms-z-confirm]` + `pointer-events-auto` (body-lock'ni override) · `Modal` `Dialog.Content onInteractOutside` guard
> (`[data-testid="confirm-dialog"]` target'ga preventDefault → confirm bilan ishlaganda modal ochiq qoladi). **Umumiy fix —
> har modal-ichi confirm/delete app-bo'ylab tuzaldi, faqat lock emas.** **🔬 BROWSER end-to-end (hr-employee modal):**
> 409→dialog ustda+bosiladigan→"Обновить данные"→**modal OCHIQ qoladi**+`findOne` re-seed (stale tashlandi)→fresh Save→**200**
> (v3→v6, har bosqich api'da tasdiqlandi). **Regression:** `roles` (non-modal) fix'dan KEYIN qayta-tekshirildi → ishlaydi
> (`analitika/staff` full-page bir xil pattern bilan qoplanadi; re-key smoke **✅ 08k da verified**). **Guard:** `confirmdialog-from-ui.test.tsx`
> +1 (overlay `z-[--ms-z-confirm]` + `pointer-events-auto` lock; jsdom CSS-half). Modal interact-outside guard jsdom'da
> emas (Radix `detail.originalEvent.target` jsdom'da real-brauzerday emas) → comment + browser-E2E. **Gate: ds tc0 · web tc0 ·
> biome 0 yangi (4 pre-existing nursery class-sort, tegilmagan qatorlar) · web Vitest Modal 19 + ConfirmDialog 21(+1).**
> Audit: `_PHASE2-confirm-dialog-in-modal.audit.md` (+ optimistic-lock audit'ga 08j bo'lim). **Doc-accuracy (audit topdi):**
> NEXT.md 08i «3 formaga ham version thread» → tuzatildi (`/auth/me` FE version YUBORMAYDI, BE bump-only) + L2175 «34/63»
> frozen-snapshot disclaimer qo'shildi. **➡️ KEYINGI `davom et`:** (a) qolgan conflict-dialog browser-smoke (8 full-page yuza —
> representative bilan qoplangan, lekin `staff` re-key + money/stock/production owed smoke'lar) · (b) BE-backlog: boms cost-split
> «Оплата труда»/«Затраты на производство» + work-orders docDate (ikkalasi ham moysklad-grounding kerak — capture yo'q → user
> domen-input yoki capture-pass kerak, ko'r-ko'rona EMAS) · (c) qolgan QA-backlog owed runtime smoke'lar (pagination footer pixel, retail RS2-4).

> **🆕🔒✅ 2026-06-08i — OPTIMISTIC-LOCK EMPLOYEE PAIR (oxirgi DEFER yopildi) → 56 entity, live 180/180 + adversarial.**
> `davom et` (lokal Opus, ultracode). Session-start audit **GO** (5 commit halol, drift yo'q; audit Employee pair'ning
> hali DEFER ekanini — jim qilinmaganini — mustaqil tasdiqladi). **08h'ning yagona DEFER'i** edi: `hr-employee` (HR
> «Сотрудники» modal, **PUT**) + `analitika/staff` («Ходимлар» forma, PATCH) **BIR XIL `Employee` model**ni yozadi →
> mexanik lock NOTO'G'RI bo'lardi, **fokuslangan dizayn** kerak edi. **Dizayn o'qi = «bu maydon edit-formada ko'rinadimi?»:**
> `Employee` qatori auth-bookkeeping maydonlarini ham saqlaydi (`lastLoginAt`/`failedLoginAttempts`/`lockedUntil` har
> login'da · `passwordHash`) — bular edit-forma maydoni EMAS. Agar lock ularni bump qilsa, **har login'dan keyin ochiq
> admin edit-forma 409 berardi** — false-409 falokati (aynan shu sabab DEFER bo'lgan). **Yechim:** edit-forma maydonlari →
> `version` bump; auth-bookkeeping → version'ga TEGINMA. **3 edit-yuza, hammasi bitta `version` ustuniga yaqinlashadi**
> (migration `20260608040000`, additive, default 1): (1) **HR.update (PUT)** = check+increment (`UpdateHrEmployeeSchema.version`
> MAJBURIY) · (2) **staff.update (PATCH, Class A)** = check+increment, versioned header update tx ICHIDA BIRINCHI ishlaydi
> (`Object.keys(data).length` darvozasi olib tashlandi) → stale roleIds-edit ham bump+check, P2025 EmployeeRole rewrite'ni
> rollback qiladi (`role` shaklini mirror) · (3) **updateMe (/auth/me)** = **bump-only** (increment, check YO'Q — core auth
> endpoint kontrakt-barqaror, self-profile low-conflict). **Bump-only (edit-forma-maydon yozuvchilari, lock'ni sog'lom
> saqlash):** softDelete/setArchived (`archived`) + setPassword (`username`) — bular staff-forma maydonlari, shuning uchun
> ularning discrete yozuvchilari bump qiladi (Employee-spetsifik; ko'p entity bunday qilmaydi). **Himoyalanmagan (ataylab):**
> auth.service login/failed/changePassword (passwordHash + counterlar = edit-forma maydoni EMAS) → ZERO version touch.
> **FE:** **2 admin forma** (HR modal + staff) `version` thread + 409→`useConflictReload` lokal dialog (HR modal: findOne
> refetch re-seed; staff: parent `key={data.version}` remount; banner'dan conflict filtrlandi). **/auth/me** FE `version`
> YUBORMAYDI (BE bump-only, version-check YO'Q → kerak emas; arxitektura to'g'ri — 2026-06-08i prozasidagi «3 formaga ham
> thread» nodaqiq edi, 08j session-audit tuzatdi). **🔬 LIVE harness 30 entity = 180/180** (`hr-employee`
> `editMethod:'PUT'` + `analitika-staff`; har biri permission-probe `skipIf` — base-seed'da skip, `seed:hr` bilan ishlaydi).
> **Adversarial (crux, runtime-proven):** fresh login version'ni **bump QILMADI** (false-409 yo'q) · `/auth/me` self-edit
> **bump QILDI** (v1→v2) · o'sha self-edit'dan keyin stale HR PUT(v1) → **409** (3 yuza bitta ustun, bump enforced). **+16
> guard** (api Vitest 2784→**2800**): ikki UpdateSchema version-contract + source-scan lock (`shared/employee-optimistic-lock.test.ts`)
> — locked yuzalar increment QILADI **VA `auth.service` ZERO version bump** (false-409 regression-lock). Harness'da pre-existing
> bom-detection fragility ham tuzatildi (`boms?limit=3`→`200`). **Gate: api tc0 · web tc0 · biome0(changed) · api Vitest 2800(+16) ·
> web Vitest 1439(0 regress).** Audit: `_PHASE2-optimistic-lock.audit.md` → «Employee pair» bo'limi (DEFER → DONE). **🟡
> Browser-smoke OWED** (3 conflict-dialog round-trip — QA-backlog). **🏁 OPTIMISTIC-LOCK = 56 entity; HAR field-edit `update()`
> endi locked (oxirgi DEFER yopildi — bu «complete» ekzustiv 74-servis skan + yopilgan DEFER'ga asoslanadi, enumeratsiyaga emas).**
> **➡️ KEYINGI `davom et`:** (optimistic-lock TO'LIQ tugadi — HAR field-edit `update()` locked; 08g'dagi «price-list residual»
> 08h'da YOPILGAN — `price-list.service.update()` da `version: data.version` filter BOR, tekshirildi). (a) Phase-2 browser-QA
> cohort'lar (pagination footer RU/UZ + optimistic-lock conflict-dialog'lar [endi 10 sahifa: 7 gap-sweep + 3 Employee] +
> money-docs/stock owed smoke'lar, MCP ulansa) · (b) BE-backlog: boms cost-split «Оплата труда»/«Затраты на производство» +
> work-orders docDate column (schema+migration+FE — alohida fokus).

> **🆕🔒✅ 2026-06-08h — OPTIMISTIC-LOCK GAP-SWEEP: «rollout COMPLETE/47» DA'VOSI YOLG'ON edi → 7 ta o'tkazib yuborilgan
> lost-update tuzatildi (endi 54 entity, live 168/168).** `davom et` (lokal Opus, ultracode). Commitlar: BE `95ff5415` + FE
> `5cf10aab`. Session-start audit **GO** (5 commit halol, drift yo'q; audit mustaqil price-list lock gap'ini tasdiqladi, api 2771/
> web 1439 live). **Bug-class:** 08d audit doc'i «47 entity, HAR field-edit `update()` locked, ROLLOUT COMPLETE» degandi — bu
> *enumeratsiyaga* asoslangandi, ekzustiv skan emas. 08g `price-list` residual'ini **bitta misol** sifatida ko'rib, butun bug-class'ni
> tekshirdim: **`async update()` bor 74 servisni skan qildim** → 47 locked, **28 unlocked**. Recon (28 Opus agent, har biri
> `file:line` ground-truth) → **9 GAP / 19 N/A**; har GAP'ni O'ZIM ground-truth qildim (§1, ko'r-ko'rona EMAS). **7 LOCKED**
> (price-list·task·store [header-only] · pipeline·payroll [nested child-array tx] · organization-account·role [config-in-tx]):
> har biri boshqa 47 bilan bir xil mexanizm (`version Int` col + `UpdateSchema.version` MAJBURIY + versioned-where + increment +
> P2025→409). config-in-tx/nested'da versioned header update **DOIM ishlaydi** (permissions-only / stages-only edit ham stale'da
> 409 beradi → butun child-rewrite tx rollback bilan himoyalangan). **🐞 LATENT FIX (payroll):** `update()` tx ICHIDA non-tx client
> bilan `findById` qaytarardi → pre-commit snapshot o'qirdi (stale version + stale lines; harness tutdi) → read'ni tx'dan KEYINGA
> ko'chirdim. **2 DEFER (hujjatlangan, chala EMAS):** hr-employee + analitika/staff = BIR XIL `Employee` model (5 yozuvchi, incl.
> auth `lastLogin` har login'da; 2 FE yuza PUT+PATCH) → muvofiqlashtirilgan dizayn + false-409 verifikatsiya kerak, mexanik lock
> emas; yarim-lock yomonroq. **19 N/A:** edit-forma yo'q/pure-API · inline-CRUD settings modal · out-of-parity bespoke (print-template/
> hr-task-template/help) · singleton/per-user (variance-config/saved-filter). **🔬 LIVE api+db harness 28 entity = 168/168 PASS**
> (`verify-optimistic-lock-smoke.mjs` 21→28; har yangi entity full battery: create→v1·PATCH(v1)→200/v2·stale→409·no-leak·race;
> 168 oldingi 21'ni HAM regress-tasdiqlaydi). **+13 version-contract guard** (api Vitest 2771→**2784**: har UpdateSchema `version`
> MAJBURIYligini lock qiladi). **FE (`5cf10aab`):** 7 sahifa `version: data.version` PATCH body'da + `useConflictReload(detail-qk,
> reHydrate)` (409→lokal dialog, banner'dan filtr) — **§2-verified** (har qk detail useQuery bilan mos; auto-rehydrate sahifalar
> ungated `useEffect([data])` ga ega). **Gate: api tc0·web tc0·biome0(changed)·api Vitest 2784(+13)·web Vitest 1439(0 regress).**
> Migration `20260608030000_optimistic_lock_remaining_entities` (additive, 7 col). Audit: `_PHASE2-optimistic-lock.audit.md` →
> GAP-SWEEP bo'limi (eski «47/complete» da'vosi SUPERSEDED deb belgilandi). **🟡 Browser-smoke OWED** (409 conflict-dialog round-trip,
> 7 sahifa — QA-backlog). **➡️ KEYINGI `davom et`:** (a) **Employee pair lock** (hr-employee + staff, muvofiqlashtirilgan dizayn —
> alohida fokus) · (b) Phase-2 browser-QA cohort'lar (pagination footer RU/UZ + bu 7 lock conflict-dialog + money-docs/stock owed
> smoke'lar, MCP ulansa) · (c) BE-backlog: boms cost-split + work-orders docDate column.

> **🆕✅ 2026-06-08g — EMPTY-HISTORY BUG-CLASS APP-WIDE SWEEP: 3 hujjat + bundle component-list audit-write (live 14/14).**
> `davom et` (lokal Opus, ultracode). Commit `690a507f` (push qilindi). Session-start audit GREEN (5 commit halol, drift yo'q; audit
> mustaqil tasdiqladi: bundle/internal/processing/price-list servislari 0 auditLog yozadi). **Variant fix (08f) shu bug-class'ning
> BITTA misoli edi** → 35 FE `auditEntity` prop'ini BE audit-yozuvchilarga solishtirib **qolgan instansiyalarni** topdim (audit-yozuvchi
> servislar to'plamidan UMUMAN yo'q): **internal-order · processing-order · price-list** (hujjat-History tab) + **bundle component-list**
> (parent Product feed). Hammasi 0 `auditLog` yozardi → History (Tarix) tab DOIM bo'sh (gate-ko'rmas: tc/biome/unit yashil). Schema/
> migration YO'Q (auditLog jadval bor, FE tab'lar allaqachon wired). **Usul:** 3 homojen hujjatni Workflow-EMAS, Agent fan-out (3 Opus
> agent, har biri `prepayment.service` document-pattern'ini mirror; prompt'da «HECH QANDAY git buyrug'i, faqat 3 nomli fayl») → bundle'ni
> o'zim → **§2-verify (har diff'ni o'zim o'qidim, agent hisobotiga ishonmadim)**. **Dizayn:** `logAudit` (exact PascalCase slug):
> create→'create' · update→'update' (versioned tx'dan keyin, **try ichida** — 409/P2025 audit yozmaydi) · softDelete→'delete' ·
> massEditApply→'mass-edit' · transition→'transition:posted/unposted/cancelled' (`{from:{before,after}}`). **NON-TX ataylab** — bu 3
> hujjatda balance/stock side-effect YO'Q (internal-order=transfer-request [stock alohida Move'da] · processing-order=planning-only
> [TODO(v2)] · price-list=publication artifact), shuning uchun prepayment'dan farqli inline `tx.auditLog` kerak emas. **bundle:** userId'ni
> setComponents/removeComponent'ga thread; **entity='Product'** (bundle [id] History feed = parent Product), entityId=bundleId,
> `components {before,after}` (set) / `{removed}` (remove) — quantity Decimal → `.toString()`. **Catalog-cohort DEFER yopildi** (08f
> variant-history audit doc'dagi residual). **🔬 LIVE api+db smoke 14/14** (`scratch/history-audit-smoke.mjs`, gitignored): har hujjat
> create→[create]→update→[update,create]→post→[transition:posted,…]→unpost+delete→[delete,unposted,posted,update,create] (newest-first,
> aniq tartib) · bundle setComponents→Product 'update'(before/after) · removeComponent→'update'(removed). **Guard:** yangi
> `audit-log/document-history.test.ts` (+4) source-scan lock (slug exact-match + logAudit call-count, `catalog-history.test.ts` mirror).
> **Gate: api tc0 · biome0(changed) · api Vitest 2771 (+4, 0 regress, was 2767) · web tegilmadi.** Audit doc:
> `_PHASE2-document-history.audit.md`. **🟡 Residual (DEFER) — ⛔ SUPERSEDED 08h da YOPILGAN:** ~~`price-list.service.update()` da optimistic-lock
> `version` filter YO'Q~~ → 08h gap-sweep'da `price-list` locked (`price-list.service.update()` `version: data.version` filter BOR, tekshirildi;
> 08l session-audit qayta tasdiqladi). Bu 08g snapshot matni — tarixiy, endi to'g'ri emas. **➡️ KEYINGI `davom et`:**
> (a) Phase-2 browser-QA cohort'lar (pagination footer RU/UZ pixel + money-docs/stock/retail owed smoke'lar — MCP ulangan bo'lsa) ·
> (b) BE-backlog: boms cost-split «Оплата труда»/«Затраты на производство» + work-orders docDate column (schema+migration+FE — alohida
> fokus, capture-grounding kerak) · (c) price-list optimistic-lock gap.

> **🆕✅ 2026-06-08f — 2 ITEM BATCH: (1) APP-WIDE pagination i18n leak fix + (2) variant auditLog (runtime 14/14).**
> `davom et` (lokal Opus, ultracode). Session-start audit GREEN (5 commit halol, drift yo'q). Parallel-commit YO'Q (df551178 ustiga
> ikki commit). **ITEM 1 (`7673df4c`) — pagination i18n leak (QA-backlog'dagi #3, 2026-06-08d browser-QA topgan):** ikki yo'nalishli leak —
> default text-pager («Jami/Oldingi/Keyingi») RU UI'ga Latin-uz; moyskladStyle range `«из»` UZ UI'ga (ListView `ofLabel` uzatmasdi).
> **§4-grounded** (moysklad capture: icon-only `<img>` pager + «N-N из total», `«Предыдущая/Следующая»` matni YO'Q) → text-pager parity-gap
> HAM edi. FIX: `PaginationLabelsProvider` (ModalLabelsProvider mirror, `prop ?? context ?? fallback`) + `ListView` doim `moyskladStyle` +
> `layout.tsx` mount + i18n `pagination` ns. **Faqat 1 ta `<Pagination>` call-site (ListView) butun app'da** → markazlashtirilgan fix. +7 guard
> (komponent ListView render proof + provider/aria/source-scan/i18n-parity). web Vitest **1439 (+7)**. Browser-smoke owed → QA-backlog.
> **ITEM 2 (`5a44dc7e`) — variant History audit-write gap (catalog cohort DEFER yopildi):** `variant.service` 0 auditLog yozardi → variant
> detail History tab DOIM bo'sh. product.service mirror: `entity:'Variant'` logAudit (create/update/archive/restore/delete + bulk; `userId`=
> `user.sub`). **BigInt-safe diff** (Variant BigInt col'lar; plain JSON.stringify throw → replacer; diff updated-row key bo'yicha → product
> relation kirmaydi). **Live api+db smoke 14/14** (create→[create]·edit→[update,create] bigint-safe diff·no-op→row YO'Q·archive/restore/delete
> aniq tartib·GET→404). +1 source-scan lock (`catalog-history.test.ts`). api Vitest **2767 (+1)**. **➡️ KEYINGI `davom et`:** (a) Phase-2
> browser-QA cohort'lar (pagination footer RU/UZ pixel + money-docs/stock/retail owed smoke'lar — MCP ulansa) · (b) BE-backlog: boms cost-split
> «Оплата труда»/«Затраты на производство» + work-orders docDate column (schema+migration+FE — alohida fokus) · (c) bundle component-list audit.
> **Gate (ikki item): web tc0 · ds tc0 · api tc0 · biome0(changed) · web Vitest 1439 · api Vitest 2767 · 0 regress.**

> **🆕🐞✅ 2026-06-08e — EDIT-SAVE 400 BUG-CLASS APP-WIDE SWEEP (53 detail sahifa) — 13 straggler tuzatildi, API-runtime verified.**
> `davom et` (lokal Opus, ultracode). **⚠️ PARALLEL SESSIYA:** boshqa sessiya shu paytda Phase-2 browser-QA qildi (commit `721b0292` —
> optimistic-lock conflict-dialog E2E + retail RU + pagination uz-leak DEFER). Men markaziy schema fayllarda ishladim (kesishmaydi); hech
> qanday destructiv git (stash/reset) ishlatmadim. **⚠️ SESSION-LIMIT (12:10 reset)** fan-out o'rtasida urildi → 16 sahifa serial main-loop'da
> auditlandi. **Bug-class:** detail EDIT forma bo'sh optional maydonni `null` yuborib tozalaydi (`X || null`); Update schema = `Create.partial()
> .extend` va `.partial()` faqat `undefined` qo'shadi, `null` EMAS → bare `.optional()` null'ni RAD etadi → **400 "Expected string, received
> null"**, Save jim bloklanadi (gate-ko'rmas: tc/biome/unit yashil). Bu klass avval ham qaytgan (customer-order externalCode 2026-06-08'da
> tuzatilgan edi, lekin AYNI formaning `description`'i o'tkazib yuborilgan). **Usul:** Workflow fan-out (53 sahifaning har birига 1 Opus agent —
> FE null-send × Update-schema nullability × Prisma-column nullability) → 37/53 tugadi, session-limit qolgan 16'ni to'xtatdi → serial audit.
> **HAR sahifa qoplandi (53/53).** Har kandidat o'zim ground-truth (cited file:line o'qildi, agent hisobotiga ishonmadim) + jonli API'da tasdiqlandi.
> **🔴 13 confirmed bug / 3 entity (hammasi tuzatildi `.nullish()`):** **(1) counterparties — 11 maydon** (legalTitle·legalAddress·actualAddress·
> email·phone·fax·code·externalCode·discountCardNumber·description·priceTypeId) — `[id]/page.tsx:201-213` HAR save'da `v.X || null` yuboradi;
> har biri bare `.optional()` edi → bo'sh maydoni bor HAR counterparty'ni tahrirlab-saqlash 400 bo'lardi (ya'ni amalda butun forma ishlamasdi —
> eng og'ir topilma). Prisma ustunlari hammasi nullable, servis null'ni toza qo'llaydi (string→null; priceTypeId null→`disconnect`). **(2)
> customer-orders — description** (`page.tsx:389` doim `description || null`; externalCode oldin tuzatilgan, description qolgan straggler). **(3)
> tracking-codes — cis1162** (`page.tsx:67` `cis1162.trim() || null`; «КИЗ (1162)» tozalansa 400). **Qolgan 50 sahifa = SAFE tasdiqlandi**
> (allaqachon `.nullish()`/`.nullable()` oldingi sweep'lardan · settings Update schema'lari `.nullable().optional()` re-declare · `optionalEmpty()`
> helper = `z.preprocess('' → null, …nullish())` null qabul qiladi · FE `|| undefined` yuboradigan formalar). **🔬 VERIFY (deterministik +
> jonli):** schema-test'lar (counterparty +13, customer-order +1, tracking-code +1 — har maydon `safeParse({version:1,[field]:null}).success`)
> + **jonli api+db battery:** counterparty create→PATCH all-11-null→**200** + GET null persist + priceType disconnect; customer-order desc:null→200;
> tracking-code cis1162:null→200. **Gate: api tc0 · biome0(changed, `--write` 1 uzun test qatori) · api Vitest 2766 (+15, 0 regress, was 2751) ·
> web tegilmadi.** Audit doc: `docs/audits/_PHASE2-edit-save-null.audit.md`. **Residual:** counterparty phone-clear = transform null→undefined
> (eski qiymat qoladi; 400/500 EMAS, pre-existing — o'zgartirilmadi). **➡️ KEYINGI `davom et`:** (a) 12:10 session-reset'dan keyin fan-out qayta
> mavjud · (b) parallel sessiya topgan pagination uz-leak DEFER (design-system `Pagination.tsx`, §4 grounding kerak) · (c) Phase-2 browser-QA
> cohort'lar (money-docs/stock owed smokes) · (d) BE-backlog (boms cost-split, work-orders docDate).

> **🆕🔒✅ 2026-06-08d — OPTIMISTIC-LOCK TIER-2 «RETAIL-SALE» (oxirgi field-edit doc) — BE harness 126/126 — ROLLOUT TUGADI.**
> `davom et` (lokal Opus, ultracode). Commit `b0abc0a1` (push qilindi). **⚠️ SESSION-LIMIT (11:50 Asia/Tashkent reset)** sessiya o'rtasida
> urildi → subagent/Workflow fan-out ishlamadi (recon + audit workflow'lari darhol fail bo'ldi). Shu sababli bu klass **main-loop'da
> KETMA-KET** (recon→design→implement→runtime-verify) qilindi, commit-xavfsiz tartibda (gate-verified core → commit → runtime smoke).
> **Recon kashfiyoti (asosiy):** «~5 qoldi» — bu entity-SONI edi, lock-yuzasi EMAS. 7 entity'ning servis-metod + controller-route'larini o'qib
> chiqib **faqat retail-sale'da draft field-edit `update()` (`@Patch(':id')`)** borligini topdim — lock himoya qiladigan yagona yuza. Qolgan 6
> = **N/A-by-design** (lost-update yuzasi YO'Q): cashier-session + online-order = FSM-only (open/close, accept/reject/convert, POST-only) ·
> commission-report + consignment + facture-in/out = read-only/derived (faqat list/findById/generate*). Ularga column ham, guard ham kerak emas.
> **retail-sale (Class A child-array):** schema.prisma `+version Int` (migration `20260608020000_optimistic_lock_retail_sale`, additive) ·
> `UpdateRetailSaleSchema` MAJBURIY `version: z.number().int().nonnegative()` · `update()` = position `deleteMany` + versioned header update'ni
> BITTA `$transaction`'ga (nested `positions.create`, `version:{increment:1}}`) — **2 nuqsonni birga tuzatdi:** (1) lost-update → stale PATCH endi
> 409; (2) **avvaldan bor KORRUPSIYA** — deleteMany tx'dan TASHQARIDA edi → delete bilan re-create orasida fail bo'lsa chek 0 pozitsiyali qolardi;
> stale-version P2025 endi deleteMany'ni rollback qiladi. `isRecordNotFound→OptimisticLockException('RetailSale')` BIRINCHI catch. **FE = BE-lock-only:**
> `retail/sales/[id]` = read-only POS view (apps/web'da retail-sales uchun HECH QANDAY PATCH yo'q — grep-tasdiq); PATCH POS/e-commerce integratsiyasi
> uchun, lock baribir himoya qiladi; conflict-dialog kerak emas (work-order kabi). **🔬 RUNTIME smoke (jonli api+db) 126/126** (21 locked
> position-doc: 8 SP + 5 stock + 7 production + 1 retail) — retail-sale: create→v1 · PATCH(v1)→200/v2 · stale→**409 OPTIMISTIC_LOCK** · no-leak ·
> **Class A tx-rollback (positions OMON QOLDI=1)** · race. 126/126 oldingi 20'ni HAM qayta-tasdiqlaydi (regress guard). Harness'ga retail-sale
> qo'shildi (ochiq cashier-session resolve qiladi; cancel-cleanup — RetailSale'da DELETE route YO'Q). Gate: tc0(real exit)·biome0(3 source fayl)·
> **api Vitest 2751 (+2 version-contract)**·web tegilmadi (1432). Audit: `_PHASE2-optimistic-lock.audit.md` → retail-sale + ROLLOUT COMPLETE bo'limi.
> **🏁 OPTIMISTIC-LOCK endi 47 entity** (Tier-1 19 + money 7 + SP 8 + stock 5 + production 7 + retail 1). **Field-edit `update()`'i bor HAR entity
> endi locked.** Residual DEFER (loyiha-bo'ylab, o'zgarmas): post-during-edit TOCTOU (transition'lar version bump qilmaydi). **➡️ KEYINGI `davom et`:**
> optimistic-lock TUGADI → (a) Phase-2 browser-QA cohort (MCP ulansa — money-docs/retail/stock/catalog runtime smoke) · (b) BE-backlog (boms
> cost-split «Оплата труда»/«Затраты на производство», work-orders docDate column) · (c) QA-backlog'dagi owed runtime smoke'lar.

> **🆕🔒🏭 2026-06-08c — OPTIMISTIC-LOCK TIER-2 «PRODUCTION» KLASSI (7 entity) — BE harness 120/120 + FE BROWSER (stash-tangle'dan tiklandi).**
> `davom et` davomi (foydalanuvchi: «davom et»). Commit `80f153dd` (push kutilmoqda). Eng GETEROGEN klass. Recon (7 Opus) → 3 shakl:
> **header-only** (production · processing-order · work-order — bitta versioned update, tx YO'Q); **nested child-array** (processing
> materials+products · bom components — nested `{deleteMany,create}` versioned parent update bilan ATOMIK → tx qayta-qurish YO'Q, faqat
> version filter+increment); **config/already-in-tx** (process positions+edges · stage performers — mavjud tx ichida versioned update; bom/
> process/stage = config entity, draft guard YO'Q). processing/processing-order = `.strict()` (version ichkarida); qolgani Create.partial().
> Bir nechtasi P2025'ni allaqachon map qilardi → `isRecordNotFound→OptimisticLockException` BIRINCHI catch qatori (findById'dan keyin miss =
> 409, 404 EMAS). work-order detail = transition-only → FE conflict-dialog YO'Q (BE lock baribir PATCH'ni himoya qiladi); qolgan 6 FE wired.
> 4 schema `z.coerce`→plain `z.number()` (izchillik). **🔬 BE harness 120/120** (20 locked position-doc: 8 SP + 5 stock + 7 production —
> production CORE battery 409+no-leak+race; child-array tx-rollback OMITTED — nested/in-tx ATOMIK, stock/SP'da runtime-isbotlangan). **🔬
> BROWSER (production vakili):** 409→lokal conflict dialog→reload→re-hydrate. **⚠️ INCIDENT (halol):** wiring agent shared-tree'da `git stash`
> ishlatib markaziy schema+client+2 entity'ni chigallashtirdi → §2 verifikatsiya bilan TUTILDI, deterministik tiklandi (checkout+stash pop,
> shared fayllar byte-identik tasdiqlangach), 4 revert bo'lgan test qayta tuzatildi. **DARS:** multi-agent same-tree wiring'da markaziy
> schema'ni AVVAL commit qil (yoki worktree izolyatsiya). Gate: tc0(real exit)·biome0·i18n ru+uz(0 yangi)·**api Vitest 2749(+13 guard)**·web
> 1432(0 regress). Migration `20260608010000_optimistic_lock_production_docs` (7 jadval). Audit: `_PHASE2-optimistic-lock.audit.md` →
> production + incident bo'limlari. **Optimistic-lock endi 46 entity** (Tier-1 19 + money 7 + SP 8 + stock 5 + production 7). **Tier-2 qoldi
> (~5):** retail (retail-sale, cashier-session) · online-order · SP long-tail (commission-report/consignment/factures). **➡️ KEYINGI `davom
> et`:** oxirgi Tier-2 klass (retail/online-order/long-tail — harness config'ga qo'sh) · yoki Phase-2 browser-QA · yoki BE-backlog.

> **🆕🔒🧪 2026-06-08b — REUSABLE VERIFY HARNESS + OPTIMISTIC-LOCK TIER-2 «STOCK» KLASSI (5 entity) — BE harness 78/78 + FE BROWSER.**
> `davom et` davomi (foydalanuvchi: «tezroq lekin sifat tushmasin» → men acceleration reja taklif qildim → «boshla, lekin avval test'ga
> jiddiy qara, xato bo'lmasa keyingisiga o't»). **(1) Qayta-ishlatiladigan verify harness** `scripts/verify-optimistic-lock-smoke.mjs`
> (commit `f6c81488`) — config-driven, har entity `mkCreate/mkPositions` beradi, dvigatel standart battery'ni jonli api+db'da yugurtiradi
> (create→v1 · PATCH(v1)→200/v2 · stale→409 · no-leak · Class A tx-rollback · race). **JIDDIY TEST validatsiya:** 51/51 (8 SP locked +
> move unlocked negative-control) + **MUTATION TEST** (move'ni `expectLocked:true` qilib FAIL chiqishini isbotladim → harness vacuous EMAS,
> yo'q lock'ni TUTADI). Battery o'zi self-validating (har entity HAM 200-fresh HAM 409-stale talab qiladi). **(2) Stock klassi** (commit
> `4e9643f5`): move · enter · loss · inventory · internal-order. SP'dan SODDA: **two-step totals YO'Q** — tx'da deleteMany + BITTA versioned
> update (sumMinor faqat post-time, FSM handler'da stock-delta bilan — lock QILINMAGAN). move = 2-ombor qty-only (hand-rolled z.object);
> enter/loss/inventory = `.partial().extend` (inventory = stocktake count-lines); internal-order = order, ALLAQACHON bitta `$transaction`'da
> (mavjud update#1'ni versionladim + try/catch o'radim; `.strict()`). 4 schema `z.coerce.number()`→plain `z.number()` normallashtirildi
> (26+ entity bilan izchillik). **🔬 BE harness 78/78** (13 locked position-doc: 8 SP + 5 stock). **🔬 BROWSER (move vakili):** 409→lokal
> conflict dialog→reload→re-hydrate. Gate: tc0(real exit)·biome0·i18n ru+uz(0 yangi)·**api Vitest 2736(+10 stock guard)**·web 1432(0 regress).
> Migration `20260608000000_optimistic_lock_stock_docs` (5 jadval). Audit: `_PHASE2-optimistic-lock.audit.md` → harness + stock bo'limlari.
> **Optimistic-lock endi 39 entity** (Tier-1 19 + money 7 + SP 8 + stock 5). **Tier-2 qoldi (~12):** production (7) · retail (2) · online-order ·
> SP long-tail (commission-report/consignment/factures). **➡️ KEYINGI `davom et`:** keyingi klass (production eng katta) — harness config'ga
> qo'sh (avval bitta unlocked'ni negative-control qil) · yoki keng Phase-2 browser-QA · yoki BE-backlog.

> **🆕🔒🔬 2026-06-08 — OPTIMISTIC-LOCK TIER-2 «SALES/PURCHASE POSITION-DOC» KLASSI (8 entity) — BE RUNTIME 48/48 + FE BROWSER-verified.**
> `davom et` (lokal Opus, ultracode; Playwright MCP ULANGAN). Commit `d4741f0e` (push kutilmoqda). Session-start audit (`wf_b1b44d95`, 3-agent;
> 3-chi agent recon bilan pool ulashib osilib qoldi, lekin 2 agent + mening tekshiruvim **GO** — drift YO'Q, web 1432/api 2709 tasdiq).
> **Ikkinchi Tier-2 klassi**: customer-order · demand · invoice-out · invoice-in · supply · purchase-order · sales-return · purchase-return.
> Har biri `<Doc>Position` child + draft field-edit `update()`; hech biri versiyalanmagan edi. **Recon fan-out (8 Opus)** har servisni
> xaritaladi → **homojen klass topildi**: money-doc Class A + **TWO-STEP-TOTALS** burmasi. **Dizayn:** `update()` = BITTA `$transaction` =
> position `deleteMany` (STANDALONE edi — corruption xavfi; invoice-in'da hatto shartsiz commit qilinardi) + versioned **update#1**
> (`where {id,accountId,version}`, `data {...,version:{increment:1}}`, `include positions`) + `computeTotals` + **update#2** (faqat totals,
> version YO'Q — update#1 allaqachon bump qilgan). Stale→P2025→409 + deleteMany ROLLBACK. `version` Update'da MAJBURIY (Create'da yo'q),
> mavjud `.extend`'ga MERGE qilindi (positions override saqlandi). transition/clone/massEdit/cascade-applier LOCK QILINMADI (TOCTOU defer).
> FE: `version: data.version` (loaded query'dan), `onConflict: useConflictReload(qk, () => setForm(null))`, 409 banner'dan filtr.
> **Wiring fan-out (8 Opus)** → markaziy verify (men). **🔬 BE RUNTIME smoke (jonli api+db) 48/48 (8 entity):** create→v1→PATCH(v1)→200/v2→
> stale PATCH(v1 + positions'ni 2'ga qayta yozish)→**409 OPTIMISTIC_LOCK + no-leak + Class A tx-rollback (positions OMON QOLDI)** + race
> (aynan 1×200+1×409). **🔬 BROWSER (Playwright MCP, customer-order vakili):** 409→lokalizatsiyalangan conflict dialog (`role=dialog`, raw
> banner EMAS)→reload→forma server qiymatiga re-hydrate. Qolgan 7 FE forma bir xil greenfield wiring + `if(!form)setForm` pattern (1 vakil bilan
> smoked). **🐞 BONUS (browser-smoke topdi, pre-existing HIGH):** customer-order edit-save `externalCode: null`'da **400** (`Create` schema
> `.optional()` edi, `.nullable()` EMAS — bo'sh «Внешний код» rad etilardi; oldingi `.nullish()` sweep'da o'tkazib yuborilgan yagona sales/purchase
> doc) → `.nullish()`. Browser-verified 400→200. **Gate: tc0(api+web, exit-code to'g'ridan)·biome0(32 fayl, `--write` import-sort tuzatdi)·i18n
> ru+uz(0 yangi)·api Vitest 2726(+17: 16 version-contract + 1 externalCode regress)·web Vitest 1432(0 regress).** Migration
> `20260607230000_optimistic_lock_salespurchase_docs` (8 jadval, additive). Audit doc: `_PHASE2-optimistic-lock.audit.md` → sales/purchase bo'limi.
> **Residual (DEFER):** money-doc bilan bir xil post-during-edit TOCTOU (transition version bump qilmaydi). **Tier-2 qoldi (~17):** stock
> (move/enter/loss/inventory/internal-order — Class A pattern tayyor) · production (7) · retail (2) · online-order · sales/purchase long-tail
> (commission-report/consignment/factures). **➡️ KEYINGI `davom et`:** (a) keyingi Tier-2 klass (stock docs — eng tayyor) · (b) Phase-2 QA cohort
> (MCP bor) · (c) BE-backlog (boms cost-split, work-orders docDate).

> **🆕🔒🔬 2026-06-07d — OPTIMISTIC-LOCK TIER-2 «MONEY-DOC» KLASSI (7 entity) — BE RUNTIME-verified + FE BROWSER-verified (Playwright MCP MAVJUD edi).**
> `davom et` (lokal Opus, ultracode). Session-start audit (`wf_464180bc`, 3-agent) **GO** (5 commit struktura-halol, web 1432/api 2688
> live-tasdiq, drift YO'Q). **Bu sessiyada Playwright MCP ULANGAN edi** → uzoq qarz bo'lgan FE conflict-dialog browser-smoke nihoyat
> bajarildi. Birinchi **Tier-2 klassi**: money-docs = cash-in · cash-out · payment-in · payment-out · prepayment · prepayment-return ·
> counterparty-adjustment. **Recon fan-out (7 Opus)** har servisning `update()`/`transition()`/positions + FE formani xaritaladi →
> **markaziy dizayn** → **wiring fan-out (7 Opus)** → markaziy verify (men, Opus). **Dizayn:** lock FAQAT field-edit `update()`da (FSM
> transition/clone/delete/massEdit/balance-posting'da EMAS — `version` faqat `update()`da, har entity tasdiqlandi). **2 kichik-klass:**
> **Class A** (cash-in/out, payment-in/out — child `operations`): `deleteMany` STANDALONE edi (tx EMAS) → stale-409 operatsiyalarni
> O'CHIRIB qo'yardi (data-corruption) → **fix: `deleteMany`+versioned `update` BITTA `$transaction`'ga** (P2025 → deleteMany rollback).
> **Class B** (prepayment/-return/cpadj — single-sum, deleteMany yo'q): oddiy versioned-where; schema `.strict()` → `version` to'g'ridan
> qo'shildi (prepayment-return currency-omission saqlandi). Update schema `version` MAJBURIY (Create'da yo'q); P2025 → `OptimisticLockException`.
> **FE:** `version: data.version` (loaded query'dan, form-state EMAS) + `onConflict` + banner-filter. **🔬 Browser-smoke 2 ta REAL bug topdi:**
> (1) reload form'ni re-hydrate qilmasdi (money-doc `if(!form)` bir-martalik hydration → invalidate `data.version`ni yangilardi lekin eski
> edit ekranda qolardi, dialog va'dasiga zid) → **fix: `useConflictReload(qk, onReloaded?)` + har forma `() => setForm(null)`** (refetch'dan
> keyin re-hydrate); (2) 3 forma `mutationFn`da `!data` guard yo'q edi (tc xato — oldingi tc-run `| tail` exit-code'ni yashirgan edi). **🔬
> RUNTIME smoke (jonli api+db): 40/40** (6 entity: create→v1→PATCH(v1)→200/v2→PATCH(stale)→**409 OPTIMISTIC_LOCK + stale yozuv O'TMADI** + 5
> RACE → aynan 1×200+1×409) **+ Class A tx-rollback 6/6** (operatsiya bilan stale-409 → operatsiya O'CHMADI = tx rollback). prepayment-return
> (Class B, FK-murakkab create) tc+diff+schema-test bilan struktura-verified. **🔬 BROWSER (Playwright MCP):** payment-in + product —
> 409→lokalizatsiyalangan conflict-dialog (raw banner EMAS)→reload→form server qiymatiga re-hydrate. **Gate: tc0(api+web, exit-code to'g'ridan
> tekshirildi)·biome0(changed)·i18n ru+uz(0 yangi key)·api Vitest 2709(+21 version-contract; 7 eski service/contract test tuzatildi)·web Vitest
> 1432(0 regress).** Migration `20260607200649_optimistic_lock_money_docs` (additive, 7 jadval) + client regen. Audit doc:
> `_PHASE2-optimistic-lock.audit.md` → Tier-2 money-doc bo'limi. **Stack: men `pnpm dev` ni TOZA qayta ishga tushirdim (eski turbo+orphan
> :4000 o'ldirildi, regen uchun) → hozir toza turbo-stack ishlayapti.** **Residual (DEFER, hujjatlangan):** post-during-edit TOCTOU (transition
> `version`ni bump qilmaydi → A'ning draft-edit'i post'dan keyin o'tishi mumkin; pre-existing, kamyob; toza fix = har yozuvda incl. transition
> version-bump = butun rollout'ni moslash). **➡️ KEYINGI `davom et`:** (a) keyingi Tier-2 klass (sales/purchase positions-docs — Class A tx-wrap
> shabloni tayyor; yoki stock/production/retail) · (b) boshqa Phase-2 QA cohort (browser MCP mavjud) · (c) BE-backlog (boms cost-split, work-orders docDate).

> **🆕🔒⚡ 2026-06-07c — OPTIMISTIC-LOCK TIER-1 ROLLOUT (17 entity) — multi-agent acceleration, BE 12/17 RUNTIME-VERIFIED.**
> `davom et` davomi (foydalanuvchi: «ishni tezlashtir, lekin sifat umuman o'zgarmasin — 3 oyna yoki ko'p agent yoki o'zing
> izlan»). **Qaror (chuqur):** sifat = markazlashgan REVIEW (proven pattern + per-item gate + adversarial verify + bitta
> Opus reviewer), KO'P QO'L emas → **IJRO'ni parallellashtir, REVIEW'ni menda saqla**. ⇒ **ko'p-agent workflow fan-out (1
> sessiya) > 3 oyna** (3 oyna review'ni bo'lib sifatga xavf + shared-fayl merge-conflict). **3 workflow:** (1) **recon**
> (50 agent) 49 tahrirlanadigan entity'ni klassifikatsiya → **17 Tier-1 (oddiy CRUD, mexanik-xavfsiz) / 32 Tier-2 (hujjat/
> FSM/positions — Opus dizayn kerak)**, har biri ground-truth caveat bilan · (2) **wiring** (17 Sonnet agent, har entity'ga
> bittadan, proven pattern + o'z caveat'i, faqat kod) · (3) **test-fix** (12 Sonnet agent, version-required'dan buzilgan
> schema-testlarni tuzatish + version-contract guard). **Markaziy verify (Opus):** migration (16 jadval, additive, 1 migration)
> · client regen (api'ni to'xtatib — Windows DLL lock) · tc · biome · to'liq suite · **runtime smoke**. **Caveatlar tutildi +
> tasdiqlandi:** cash-desk (balanceMinor alohida money-path → version faqat settings update'da) · discount (handler P2025'ni
> raw qaytarardi → explicit 409 map) · label-template/publication/sales-channel (where:{id}→{id,accountId,version} fold) ·
> opportunity (transition() alohida → faqat update() lock) · price-type (isDefault clearDefault boshqa qatorlarga → increment
> faqat target'da) · region (version ustun bor edi → faqat logika ulandi). **🔬 RUNTIME SMOKE (jonli api+db) — 12 entity O'TDI**
> (counterparty·cash-desk·discount·region·sales-channel·organization·uom·project·tax-rate·expense-item·price-type·custom-entity):
> create→v1→PATCH(v1)→200 v2→PATCH(STALE)→**409 OPTIMISTIC_LOCK**, **stale yozuv O'TMADI** + 3 entity RACE (parallel)→**aynan
> bitta 200+bitta 409**. Qolgan 5 (contact-person·tracking-code·label-template·publication·opportunity — FK/enum/murakkab create)
> tc + aggregate-grep (17/17 da versioned-where+increment+P2025→409) + label/opportunity deep-read + 17/17 FE version-thread+
> useConflictReload grep bilan tasdiqlandi. **Gate: tc0(api+web)·biome0(changed; 6 pre-existing warning untouched-line)·i18n
> ru+uz(0 yangi key)·api Vitest 2688(+36 contract guard)·web Vitest 1432(0 regress).** Audit doc: yangilandi
> (`_PHASE2-optimistic-lock.audit.md` → Tier-1 ROLLOUT bo'limi). **Holat: Tier-1 BE (19 entity incl product/variant) =
> 12 runtime-verified + 5 struktura-verified; FE conflict-dialog implement+unit-test, pixel browser-smoke QARZ (MCP yo'q).**
> ⚠️ **Stack holati:** men api'ni (`pnpm --filter @moysklad/api dev`) alohida ko'tardim (eski turbo-api'ni DLL uchun
> o'ldirdim) → toza turbo-stack uchun: turbo'ni Ctrl+C + :4000'dagi orphan api'ni kill + `pnpm dev` qayta. **➡️ KEYINGI
> `davom et`:** (a) **Tier-2 optimistic-lock (32 hujjat/FSM entity)** — Opus dizayn per-class (lock field-edit'da, transition'da
> emas) → keyin fan-out · (b) FE conflict-dialog browser-smoke (MCP ulansa) · (c) boshqa Phase-2 QA cohort · (d) BE-backlog.

> **🆕🔒 2026-06-07b — OPTIMISTIC-LOCK (lost-update guard) — catalog cohort, BE RUNTIME-VERIFIED (Phase-2).** `davom et`
> (lokal Opus, ultracode; foydalanuvchi: «o'zing tanla, maqsad — barchasini qilish»). Playwright MCP YO'Q (config'da
> plugin bor, lekin sessiyaga ulanmagan — ToolSearch 0 browser-tool) → brauzer-QA cohort'lar imkonsiz; eng yuqori qiymatli
> **kod-darajasidagi** ish olindi = 2026-06-06e catalog-QA «product edit optimistic-lock yo'q (lost-update)» DEFER'i (oldingi
> sessiya «alohida fokus kerak» degan edi — shu sessiya o'sha fokus). Session-start audit (`wf_6ed59c08-a0c`, 3-agent)
> **GO** (5 commit struktura-halol, web 1423 live-tasdiq, drift YO'Q; faqat eski roadmap-prozada eskirgan 34/63 counter'lar —
> tarixiy, bloker emas). **Stack jonli edi (web3100/api4000/db5433)** → BE'ni runtime tasdiqlash mumkin bo'ldi.
> **🔴 Bug (real, jim, pulga yaqin):** 2 user bir mahsulotni tahrirlasa, oxirgi save eskisini **jim ustiga yozadi**
> (lost-update) — narx/ҚҚС/MXIK/tracking master-data'da data-integrity nuqsoni; tc/lint/unit/Phase-1-strukturaga ko'rinmas
> (runtime concurrency xususiyati). **Dizayn (footgun-siz):** butun `version Int @default(1)` ustun (Region'da allaqachon
> shu niyat bilan bor edi) + `WHERE id AND version` checked-update + `version++`; stale → P2025 → **HTTP 409
> `OPTIMISTIC_LOCK`**. `updatedAt`-asosli RAD ETILDI (PG µs vs JSON ms → har save 409 bo'lardi). **Scope = catalog cohort**
> (flagged joy): Product (product/service/bundle — bitta model, hammasi PATCH /products) + Variant; **mexanizm qayta
> ishlatiladigan** (qolgan ~55 entity'ga rollout mexanik — DEFER, hujjatlandi). **BE:** migration
> `20260607155651_optimistic_lock_product_variant` (additive, deploy bilan) · shared `optimistic-lock.ts`
> (OptimisticLockException 409+code) · Update{Product,Variant}Schema `version` MAJBURIY (bypass yo'q; Create'da yo'q) ·
> repo/service findById→versioned-update-in-tx→P2025→409 · version audit-diff'dan chiqarildi. **FE:** `isOptimisticConflict`
> util · shared hooks `onConflict` (conflict→dialog YOKI conflict-specific toast, hech qachon jim emas) ·
> `useConflictReload(queryKey)` (lokalizatsiyalangan «yangilash?» dialog → invalidate→re-hydrate) · 4 forma version-thread +
> dialog + Alert'dan conflict filtri · i18n conflict_title/body/reload (ru+uz). **RUNTIME SMOKE (jonli API+DB, hammasi
> o'tdi):** product+variant create→version1→PATCH(v1)→200 v2→PATCH(STALE v1)→**409**, **stale yozuv O'TMADI** (name v2'da
> qoldi = haqiqiy lost-update himoyasi)→PATCH(v2)→200→PATCH(version-siz)→400; **CONCURRENCY RACE: 2 parallel PATCH(bir xil
> version)→AYNAN bitta 200+bitta 409, final version=2** (bitta g'olib, double-write yo'q). **Guard:** schema version-contract
> (api +5) · FE util + 2 hook conflict-routing (web +9). **Gate: tc0(api+web)·biome0(changed; 1 pre-existing useTemplate
> warning untouched-line)·i18n ru+uz·web Vitest 1432(+9, 0 regress)·api Vitest 2652(+5, 0 regress).** Audit doc:
> `docs/audits/_PHASE2-optimistic-lock.audit.md`. **Holat: BE optimistic-lock (Product+Variant) = Phase-2 runtime-verified;
> FE conflict-dialog = implement+unit-test, pixel/interaction browser-smoke QARZ (MCP yo'q).** Smoke-skriptlar `/tmp`'da
> (repo'ga kirmadi). **➡️ KEYINGI `davom et`:** (a) optimistic-lock rollout qolgan entity'larga (mexanik, mexanizm tayyor) ·
> (b) boshqa Phase-2 QA cohort (MCP ulanса — money-docs/retail/stock browser smoke) · (c) BE-backlog (boms cost-split,
> work-orders docDate).

> **🆕🐞 2026-06-07 — APP-WIDE BUGS: catalog-QA DEFER ro'yxatini ishladim (1 FIX + 1 not-repro + 1 defer).** `davom et`
> (lokal Opus, ultracode; foydalanuvchi tanladi: «Fix app-wide bugs»). Session-start audit (`wf_caa62660-880`, 3-agent)
> — synthesis API-connection drop'da yiqildi, lekin agent-transkriptlardan tiklandi: **GO** (freshness agent web Vitest
> **1416** live-tasdiqladi = NEXT.md claim, drift YO'Q; commitlar↔NEXT.md mos). Audit doc: `docs/audits/_PHASE2-app-wide-bugs.audit.md`.
> **(a) 🟢 FIXED — ColumnCustomizer `'Ustunlar'`/`'Reset'` i18n leak (32 list-sahifa).** design-system `<ColumnCustomizer>`
> (locale-agnostic) default `label='Ustunlar'`(Latin-uz)+`resetLabel='Reset'`(EN) berardi; **32 sahifaning HECH BIRI label
> uzatmaydi** → har list gear RU'da ham «Ustunlar» ko'rsatardi (gate-blind: no-hardcoded faqat doc-forma skani). **§4
> grounding:** capture'da `>Настроить колонки<` ×2549 element-content + `hideLabel-*` ×1 (faqat shu kontrolda) → moysklad
> **icon-only**, matn = accessible name. Reject: `[по умолчанию]` = hidden `div-viewer` (reset emas). **Fix (3 qatlam, DRY):**
> design-system `label` default olib tashlandi (icon-only) + yangi `ariaLabel` prop (default EN, from-ui test yashil qoladi);
> app wrapper `column-settings.tsx` `<ColumnSettings>` bitta joyda lokalizatsiya (`ariaLabel=t('configure_columns')`,
> `resetLabel=t('columns_reset')`, visible label yo'q); i18n `common.configure_columns`(«Настроить колонки»/«Ustunlarni
> sozlash»)+`common.columns_reset`(«Сбросить»/«Tiklash»); 32 sahifa codemod `ColumnCustomizer`→`ColumnSettings`. **Guard
> (7 test):** ru+uz accessible-name (real message-fayl), icon-only (`textContent===''`), lokal reset, **+ source-scan
> regression-lock** (hech bir app-sahifa raw `<ColumnCustomizer>` import qilmasin). **Verification:** i18n komponent+DOM
> darajada ikki lokalda tasdiq + to'liq regress yashil; pixel-darajada live-browser smoke YO'Q (Playwright MCP shu sessiyada
> yo'q) — past risk (icon-only Button allaqachon qo'llab-quvvatlangan + moysklad parity).
> **(b) ⚠️ NOT REPRODUCIBLE — `/notifications`+`/tasks/badge-count` «500 app-wide».** Iron Law (reproduce-before-fix): O'SHA
> running API process (PID 17884, 2026-06-06 14:21'dan) bilan — direct :4000 VA proxy :3100 ikkalasi **200**; SSE 200;
> noto'g'ri param→**400** (Zod, 500 emas); 30 concurrent→hammasi 200. Permission guard **403** beradi (500 emas); FE poller
> graceful (`?? 0`). Sabab (eng ehtimoliy): `tsx watch` recompile oynalarida (men o'sha QA'da schema-fayl tahrirlardim)
> proxy 5xx → poller tutgan = «likely seed/env» hedge to'g'ri edi. **Kod o'zgarmadi** (non-repro bug'ni «tuzatish» = symptom-fix,
> Iron Law + §2 buzadi). **(c) ⏭️ DEFER — product edit optimistic-lock yo'q (lost-update).** Real, lekin app-wide arxitektura
> qarori (version/409 + FE conflict UX) — bitta entity uchun qilish ~60 entity orasida nomuvofiq; alohida fokuslangan sessiya
> kerak (yarim qilinmadi). **Stray data:** `dup-test-1779968527@demo.local` employee (2026-06-06d sweep artefakti, dev DB).
> **Gate:** tc0(web+ds)·biome 0-error(changed; 4 pre-existing nursery *warning* untouched className'larda)·web Vitest **1423
> (+7, 0 regress)**·ds Vitest 118. **➡️ KEYINGI `davom et`:** boshqa Phase-2 QA cohort (money-docs P1/P2/P3 FE-smoke, retail
> RS1-4, stock/internal IO-1-4, production W3/S1/S2) YOKI (c) optimistic-lock arxitektura YOKI BE-backlog (boms cost-split,
> work-orders docDate).

> **🆕🔬 2026-06-06e — PHASE-2 BROWSER-QA: CATALOG COHORT → 4 runtime bug TUZATILDI (`c67c78e8`).** `davom et` (lokal
> Opus, ultracode; foydalanuvchi tanladi: «Catalog browser QA»). Session-start audit (`wf_9a336d8d-d54`, 3-agent) **GO**
> (5 commit struktura-halol, web 1400/api 2647 live-tasdiq; **1 real gap: oldingi 2026-06-06d sessiya NEXT.md+progress.json
> ni commit qilmasdan qoldirgan** → `1a70492f` da commit qilindi + 2 doc-ref typo tuzatildi). MCP profil-lock yechimi
> ishladi (orphan chrome kill → cookie login; token ~15min TTL → bounce'da re-login). Stack live (3100/4000/5433).
> **6 smoke browser-tekshirildi (F-PUT/F1/F2/F3/F4/F5), 4 REAL runtime bug topildi+tuzatildi — barchasi tc/lint/unit'ga
> ko'rinmas, faqat brauzerda:**
> - **🐞 BUG1 (HIGH) — har product/service/bundle/variant edit save 400.** Edit-forma to'liq obyektni PATCH qiladi va
>   bo'sh optional maydonni `null` yuboradi (clear), lekin `UpdateProductSchema/UpdateVariantSchema = Create.partial()`
>   `.optional()` beradi (null'ni rad etadi), `.nullable()` EMAS. Create ishlaydi (create-forma `undefined` yuboradi). **Fix:
>   `.nullish()`** editable optional maydonlarga (ustunlar nullable; repo allaqachon `if(x!==undefined)`+connect/disconnect
>   bilan null→clear). `minimumBalanceMinor`+variant `name` = NON-nullable ustun → `.optional()` qoldi (tc tutdi). Browser:
>   edit→200, round-trip; bo'sh majburiy nom client-side bloklandi (network yo'q).
> - **🐞 BUG2 — History (Tarix) tab save'dan keyin eskirgan (reload'gача bo'sh).** Save `['product',id]` invalidate qildi,
>   lekin `['audit-logs',…]` EMAS; History query eager-mount → mounted observer stale'da refetch qilmaydi. **Fix:
>   `useApiMutation`+`useSaveMutation` success'da `['audit-logs']` invalidate** (mount qilinmagan query uchun no-op = xavfsiz).
>   Browser: save→yangi History qatori reload'siz chiqadi.
> - **🐞 BUG3 — /new sahifada Save bosilganda hujjat IKKI marta yaratildi** (1 click → 2 POST → 2 bundle). Create-sahifa
>   `<form onSubmit={save}>` + DetailToolbar Save tugma `type` yo'q → HTML default `type="submit"` → 1 click onClick HAM
>   form-submit HAM ishga tushdi. `isSaving` tuta olmaydi (sinxron double-fire). **Fix: DetailToolbar Save/Close `type="button"`**
>   (10 create-sahifa: products/bundles/services/variants + pipelines/contact-persons/opportunities/tasks/counterparties/calls).
>   Browser: 1 click → 1 POST.
> - **🐞 BUG4 — catalog /new sarlavhalari RU-locale'ga Latin-uz sizdiradi.** bundle/service/variant `/new` DetailHeader'ga
>   hardcoded uz (`customTitle="Yangi komplekt"` h.k.) uzatardi (products/new toza edi; no-hardcoded gate Cyrillic-only +
>   doc-forma skani → o'tkazib yuborgan). **Fix: i18n** mavjud `t('new_title')`+`tCommon('new_state')` (0 yangi key). Browser
>   (RU): «Новый комплект»/«Новая услуга»/«Новая модификация».
> **Guard (non-vacuous):** product/variant schema null-accept+reject testlari · 2 mutation-hook audit-logs invalidation
> testi · detail-toolbar `type=button` + form-no-submit testi · catalog-new-header-i18n source-scan. **Gate: tc0(web+api)·
> biome0·api Vitest 2647(+7)·web Vitest 1416(+16)·0 regress.** Audit doc: `docs/audits/_PHASE2-catalog-cohort.audit.md`.
> Test-artefaktlar (3 bundle + 1 variant) tozalandi; product/service restore qilindi; locale uz'ga qaytarildi.
> **➡️ KEYINGI `davom et`:** boshqa Phase-2 QA cohort (money-docs P1/P2/P3 FE-smoke, retail RS1-4, stock/internal IO-1-4)
> YOKI bu sessiya flagga qo'ygan out-of-scope ishlar (pastdagi DEFER ro'yxati): (a) **ColumnCustomizer `'Ustunlar'` default
> → barcha list-sahifada RU-leak** (list-toolbar i18n sweep) · (b) **`/notifications` + `/tasks/badge-count` 500 (app-wide)**
> · (c) product edit optimistic-lock yo'q (lost-update) · YOKI BE-backlog (boms cost-split, work-orders docDate).

> **🆕🚩 2026-06-06d — PHASE-2 FE↔BE HTTP-CONTRACT bug-class sweep (flagship).** `davom et` (lokal Opus, ultracode).
> Session-start audit (`wf_26a17ebc-f0a`, 3-agent) **GO** (5 commit struktura-halol, 0 inflation; progress.json 63/64
> doc-izohli). **Bug-class:** FE api-client string-path ↔ BE NestJS route-dekorator o'rtasida TYPE-bog'lanish YO'Q →
> method/path mismatch tc/lint/unit-testga ko'rinmaydi, faqat runtime'da 404/405 (Phase-1 struktura-audit hech qachon
> ishlatmaydi). Oldingi 2 sessiya bittadan topgan (api.delete content-type 400; api.put-vs-@Patch 404) — bu sessiya
> **deterministik FE↔BE contract-matcher** bilan umumlashtirdi (446 FE write-call × 961 BE route). **Topilma (3-chi, eng
> katta klass): list-sahifa filter-pickerlari O'LIK endpointlarga so'rov yuboradi → brauzerda jim 404 → filter bo'sh.**
> Detail-formalar ishlaydigan referens endpointni ishlatadi; list-filterlar hech qachon brauzerda sinalmagan. **63 sayt,
> 3 sub-klass tuzatildi (`e89bb65e`):** (1) **owner** `/users`→`/employees` (49 sayt; bir xil `{items:[{id,name}]}` shape;
> sof path-swap) · (2) **org-account** `/organizations/:id/accounts`→`/organization-accounts?organizationId=` (7; mapping
> `accountNumber||name`'ga realign — default hisob `accountNumber=null` = `1f5bb451` bo'sh-qator klassi) · (3)
> **agent-account** `/counterparties/:id/accounts`→`/counterparties/:id/bank-accounts` (7; raw-array + client-filter,
> detail-form fetcher mirror). BE filter-paramlar (ownerId/organizationAccountId/agentAccountId) allaqachon har
> list-servisning Prisma where'iga ulangan → filterlar endi **end-to-end** ishlaydi (faqat picker-fetch o'lik edi).
> **Long-tail 7 kandidat = NOISE** (route bor; fake-id'da service-404, routing-404 emas — adversarial verify, response-body
> bilan farqlangan: cashier-sessions/analitika-counts dynamic-action, opportunities/board + hr moysklad-agents literal,
> hr-attendance method, generic bulk-hook dynamic-resource). **Doimiy guard:** `apps/web/src/__tests__/api-contract.test.ts`
> — har statik-resolvable FE `api.*` ni route-jadvaliga solishtiradi, method/path mismatch'da yiqiladi (4-sahifalik
> `catalog-api-method.test.ts` o'rnini bosadi); irreducibly-dynamic call'lar skip + 2 live-verified id/action route
> allow-list; **non-vacuous isbotlangan** (probe dead-route → aniq site-message bilan fail). **Browser-verified (live
> web3100/api4000/db5433):** owner `/users` 404→`/employees` 200 (picker "Admin User"+"first" ko'rsatadi); org-account →
> `/organization-accounts` 200 ("Asosiy hisob" null→name fallback) + organizationId list-query'ga qo'llaniladi
> (`customer-orders?…&organizationId=…` 200). Agent-account endpoint 200 (seed'da counterparty-hisob yo'q → bo'sh,
> xatosiz). 2/3 klass browser-verified (56/63 sayt); agent-account endpoint-verified. Gate: tc0(web)·biome0·**web Vitest
> 1400 (+1 guard, 0 regress)**·BE o'zgarmadi. Audit doc: `docs/audits/_PHASE2-list-filter-picker-404.audit.md`. **➡️
> KEYINGI `davom et`:** qolgan Phase-2 QA cohort'lar (money-docs P1/P2/P3 runtime smoke, retail RS1-4, catalog
> F-PUT/F1-F5) YOKI BE-backlog (boms cost-split «Оплата труда»/«Затраты на производство», work-orders docDate column). MCP
> auth retsepti: profil-lock kill → UI re-login (token ~15min TTL).

> **🆕🔬 2026-06-06c — PHASE-2 BROWSER-QA sessiyasi (foydalanuvchi: «oldingi 2 sessiyadagi ishni to'liq qil»).** `davom et`
> (lokal Opus, ultracode). Session-start audit (`wf_f035bd9b-c3e`, 3-agent) **GO** (5 commit struktura-halol, api 2640/web 1393
> live-tasdiq; 1 real drift: `264cc5ba` print-templates `[id]/new` qo'shib `progress.json` detail `total_target` 63→**64 (98%)**
> ko'tardi — `pnpm progress` `[id]`/`new` dir avtomat sanaydi; NEXT.md `63/63` eskirgan edi → **line-27 halol tuzatildi** [64-sahifa
> = post-konveyer feature, parity-gap EMAS]). **🔓 MCP auth blocker YECHILDI:** oldingi 2 sessiya «/auth/refresh 401» — aslida
> **profil-lock** (orphaned `mcp-chrome-779d01a` chrome process lockfile ushlab turardi) → tree kill → cookie-session bilan
> **Admin User** sifatida kirildi (token ~15min TTL → bounce bo'lsa UI'dan re-login). **➡️ Bu loyihada ENG KO'P Phase-2-verified
> ish bajarilgan sessiya.**
>
> **4 TRACK hammasi browser-verified (live web:3100·api:4000·db:5433):**
> - **T1 org-account (a03405d4):** SCOPE fix tasdiqlandi — picker `organizationId` thread (so'rovda `?organizationId=…`),
>   dropdown org bo'yicha scoped (MCHJ Demo=1 hisob, 15 emas), org o'zgarganda hisob+label tozalanadi, qayta ochilganda yangi
>   org id ishlatiladi (`00000000…010`→`dfa8526d…`). **🐞 YANGI BUG topildi+tuzatildi:** default auto-hisob («Asosiy hisob»)
>   `accountNumber=null` → picker `primary: x.accountNumber` qildi → **har hisob BO'SH qator + tanlanganda literal «null»**
>   (har tenant uchun, 15 forma). Fix `primary: x.accountNumber || x.name` (3 qatlam: FE fetcher + FE [id] hydration + BE detail
>   select `name` qo'shildi) + guard (org-account-scope.test fallback lock). Browser: dropdown «Asosiy hisob», [id] hydration
>   «Asosiy hisob» (oldin bo'sh/null). **Commit `1f5bb451`** (27 fayl: 15 FE+11 BE+test). CounterpartyAccount=non-null number → agent picker TOZA, tegilmadi.
> - **T2 settings/users (18e1e1f0):** real employee catalog list (Oxirgi kirish/Ism/Email/Lavozim/… ustunlar, formatDate),
>   [id] RBAC rol-checkbox'lar; **PUT `/roles/employee/:id` round-trip** browser-verified (Manager qo'shildi→reload persist→
>   revert→Administrator-only API-confirmed; dirty-state Saqlash toggle). **Bug YO'Q.**
> - **T3 print-template editor (264cc5ba):** list+entity-tab+empty-state; create editor (POST 201)→[id] hydration (name/entity/
>   format/enabled/Tavsif/Handlebars hammasi round-trip)→edit (PATCH 200)→list; delete ConfirmDialog (window.confirm EMAS).
>   **🐞🚩 FLAGSHIP BUG topildi+tuzatildi:** UI delete **400** «Body cannot be empty when content-type is set to 'application/json'».
>   Root cause: `api-client.ts` `request()` `Content-Type: application/json` ni DOIM qo'yardi, lekin `api.delete` body'siz →
>   **Next.js rewrite-proxy (undici) body'siz application/json'ni rad etadi** → **brauzerdagi HAR `api.delete` (49 call-site)
>   jim 400 berardi.** Unit-test proxy'dan o'tmaydi, BE-smoke `:4000` to'g'ridan (200) → hech qachon tutilmagan = AYNAN Phase-2
>   QA topadigan klass. Fix: body bo'lganda gina `Content-Type` yubor (GET/DELETE header'siz; POST/PUT/PATCH application/json).
>   Browser: print-template delete endi **200**. Guard `apps/web/src/lib/api-client.test.ts` (6 test, content-type contract). **Commit `b74ac435`.**
> - **T4 catalog History (b853d34b):** bom Tarix tab — bo'sh holat «Hali o'zgarishlar yo'q» (API count=0 bilan mos = to'g'ri),
>   edit→save→BE logAudit `update` (API count=1, userId threaded) → reload Tarix **«● O'zgartirildi · Admin User · 06.06.2026 12:27»**
>   render qildi. process/stage = bir xil shared `DocumentTabs` (`auditEntity="processingprocess"/"processingstage"`, slug-lock
>   test bor) → bom representative-proof. **Bug YO'Q.**
>
> **Gate (oxirgi, mustaqil):** tc0(web+api)·biome0·**web Vitest 1393+6=1399 (api-client guard)**·**api Vitest 2640** (0 regress;
> 3 ta komponent-test FULL-run'da resurs-load ostida flake qildi → izolyatsiyada 33/33 yashil, api-client'ga aloqasiz). 2 commit
> push-ga tayyor. QA-artefaktlar tozalandi (test payment/templatlar o'chirildi). **➡️ KEYINGI `davom et`:** qolgan Phase-2 QA
> cohort'lar (money-docs runtime smoke P1/P2/P3, retail, catalog) YOKI BE-backlog (boms cost-split «Оплата труда»/«Затраты на
> производство», work-orders docDate column). MCP auth retsepti tayyor (profil-lock kill → UI re-login).

> **🆕 2026-06-06b — «BARCHA 4 TRACK ketma-ket» sessiyasi (foydalanuvchi: hammasini professional qil).** `davom et` (lokal
> Opus, ultracode). Session-start audit (`wf_2a05c495-384`, 3-agent) **GO** (5 commit struktura-halol, 63 detail + 71 list disk'da
> tasdiqlandi; faqat doc-staleness: NEXT.md `Cohort audit navbati`da L12 bullet yo'q + stray «k» + stale counter → ✅ tuzatildi
> [L12 bullet + lg106/web1374/api2607 qo'shildi]). **TRACK 1 = Phase-2 QA money-docs → org-account SCOPE bug-class TUZATILDI +
> RUNTIME-VERIFIED.** Map workflow (`wf_37307689-d77`, 27-agent) → 15 FE forma + 11 BE servisda gap tasdiqlandi (hech biri org↔account
> bog'lanishini tekshirmasdi). Fix workflow (`wf_03ec883f-e7e`, 26-agent) → shared `assertOrgAccountMatchesOrg` guard (mine, Opus,
> tested) 11 servis create+update'ga + 15 forma picker org-scope. **Live adversarial smoke 6/6** (yuqorida QA-backlog ✅ entry).
> Gate: tc0·biome0·api 2632(+16)·web 1389(+15) [`a03405d4`]. **TRACK 2 = settings/users** (finding: xodim/rol CRUD allaqachon
> bor → no-duplication; stub'ni `/hr/employees`+`/roles` ga uladim + yetishmagan `GET/PUT /roles/employee/:id` RBAC rol-assignment
> qo'shdim; runtime-verified 7/7; api 2637/web 1389; `18e1e1f0`). **TRACK 3 = print-template editor** (BE CRUD bor edi, faqat FE
> editor yo'q → shared form + new/[id] + list-wiring; BE CRUD live-smoke 5/5; web 1393; `264cc5ba`). **TRACK 4 = catalog History
> audit-write** (boms/processes/stages 0 auditLog → logAudit qo'shildi, bom History live-verified `[delete,update,create]`; INN
> index = asosli QILINMADI [substring→trigram kerak, kichik jadval]; api 2640/web 1393). **➡️ BARCHA 4 TRACK TUGADI.** Owed:
> FE browser-smoke (Track 1 picker + Track 2/3 sahifalar — Playwright MCP profil-lock; BE'lar runtime-verified). **KEYINGI `davom
> et`:** Phase-2 browser-QA (MCP profil tozalansa) YOKI boshqa BE-backlog (boms cost-split, work-orders docDate column).
>
> **🏁 LIST-AUDIT KONVEYER (A–L12) BUTUNLAY TUGADI (2026-06-05, L12 = OXIRGI cohort).** Keyingi `davom et` uchun FAOL
> konveyer YO'Q — quyidagi uchta yo'ldan birini tanla (yoki foydalanuvchi aytadi):
> 1. **Track 1 BE-backlog** — ✅ auditLog-write feature-gap (prepayment/prepayment-return/counterparty-adjustment)
>    BAJARILDI + runtime-verified (`0ce3ba93`, 2026-06-06); ✅ **`/admin/employees` (settings/users) BAJARILDI (2026-06-06b):**
>    finding — xodim CRUD (`/hr/employees`) + rollar boshqaruvi (`/roles`+rollar UI) allaqachon bor edi; settings/users
>    faqat read-only stub (dublikat). **Yangidan qurmadim (no-duplication).** O'rniga: settings/users list+[id] ni bor
>    `/hr/employees`+`/roles` ga uladim (qidiruv + moysklad ustunlar + RBAC rol biriktirish) + yetishmagan bitta bo'g'in =
>    `GET/PUT /roles/employee/:id` (EmployeeRole replace-set, tenant-guard) qo'shdim. Runtime-verified 7/7 (assign/persist/
>    fake-role→400/fake-emp→404). FE browser-smoke owed (MCP profil-lock). ✅ **print-template create/edit editor BAJARILDI
>    (2026-06-06b):** BE CRUD (`POST/GET/PATCH/DELETE /print-templates`) allaqachon to'liq edi (Sprint 11), faqat FE editor
>    yo'q edi (list-only). Qurildi: `_components/print-template-form.tsx` (shared EditForm: entity/format/name/description/
>    bodyHtml[Handlebars]/pageSize/4×margin/isDefault/enabled) + `new/page.tsx` + `[id]/page.tsx` + list createHref+row-link.
>    BE CRUD live-smoke 5/5 (create+margin/body round-trip · PATCH · no-bodyHtml→400 · delete). Wiring-lock test (4). FE
>    browser-smoke owed. ✅ **boms/processes/stages History audit-write BAJARILDI + RUNTIME-VERIFIED (2026-06-06b):** uchala
>    servis 0 auditLog yozardi → History (Tarix) tab DOIM bo'sh edi. `logAudit` (prepayment flagship pattern) qo'shildi —
>    create/update/archive/restore (+bom setComponents, process setStages); entity slug EXACT-match FE auditEntity
>    (`bom`/`processingprocess`/`processingstage`); controller user.sub thread (+bom bulk). **Live smoke:** bom create→
>    update→archive → `GET /audit-logs?entity=bom&entityId=<id>` = `[delete, update, create]` (userId bilan; oldin bo'sh).
>    Wiring-lock test (3, entity-slug + ≥4 logAudit call) + generic `audit.action_*` i18n key (create/update/delete/restore
>    ru+uz). ✅ **organizations INN JSON-path index — QILINMADI (asosli qaror):** qidiruv `uzRequisites->>'inn'` ustida
>    `string_contains` (substring) → B-tree expression index MOS KELMAYDI (substring trigram GIN + `pg_trgm` talab qiladi);
>    organizations jadvali kichik (tenant'da ~1-20 org) → trigram GIN write-overhead beradi, read-foyda yo'q = over-engineering.
>    Index qo'shilmadi (halol qaror, cargo-cult emas). **TRACK 4 TUGADI. BARCHA 4 TRACK TUGADI.**
> 2. **Phase-2 browser-QA** — cohort bo'yicha, LOKAL (DB `moysklad_dev`@5433 + `pnpm dev` + Playwright MCP). QA-backlog pastda.
>    **STACK-UP retsepti tasdiqlandi (2026-06-06):** web `:3100` (turbo, `next dev --turbo`), api `:4000` (`/api/v1`),
>    marketing `:3200`, DB `:5433`; login `admin@demo.local`/`admin123`; **browser auth-refresh MCP-context'da 401 →
>    API-level smoke ishlatildi** (curl + bearer token, History contract'ni to'g'ridan-to'g'ri tekshiradi).
> 3. **Konsolidatsiya hisoboti** — `docs/audits/_LIST-CONVEYOR-COMPLETE.md` (A–L12 yakuniy) ✅ yozildi (2026-06-06).
>
> **🆕 2026-06-06 — «barchasi to'liq professional» sessiyasi (3 track parallel)**: `davom et` (lokal Opus). Session-start
> audit (`wf_8f66d7ef-6f1`, 4-agent) **GO** (5 oxirgi commit struktura-halol; faqat kosmetik staleness: NEXT.md:30 «FAOL
> KONVEYER» heading → ✅ tuzatildi; list_pages 56/57 = eski toolbar-build metric, audit-gap EMAS). Foydalanuvchi: uchala
> track'ni professional qil + «necha foiz?». **Javob (grounded):** Phase-1 audit konveyeri ~100% (detail 63/63 + list 71);
> **to'liq maqsadga ~25-30%** (NEXT.md:1293 «~20-25% sirt», endi list+detail 100% → biroz yuqori; Phase-2 QA 0%, modals
> ~8/100+, nav-graph 0%, staging/rollout 0%). **TRACK 1 flagship BAJARILDI** (auditLog-write, yuqorida ✅, `0ce3ba93`,
> api 2616 +9). **TRACK 2 flagship RUNTIME-VERIFIED** (live API+DB, 13/13 audit-trail + 3/3 adversarial money [over-refund
> cap + currency-lock]) — loyihada BIRINCHI Phase-2-tasdiqlangan item. **TRACK 3** konsolidatsiya doc yozildi.
> **Halol scope:** /admin/employees + print-template editor = katta feature'lar, alohida fokuslangan sessiya kerak (yarim
> qilinmadi — yaxshilab qilish uchun). **➡️ KEYINGISI:** /admin/employees YOKI print-template editor (Track 1) · YOKI
> davom Phase-2 QA money-docs cohort (org-account scope bug-class, stack-up retsepti tayyor) · YOKI boshqa track.
>
> **🆕 2026-06-05 — COHORT L11 (Settings-finance lists) TUGADI → list_audits 51→58**:
> `davom et` (lokal Opus). Session-start audit (3-agent, `wf_dd0d588c-2ae`) **GO** (5 oxirgi commit struktura-halol; test counts
> web 1360/api 2603/lg 92 git-diff bilan tasdiqlandi; L11 oldindan-bajarilmagan; faqat kosmetik staleness — NEXT.md:1541 «47
> (L1–L8)» + :1569 «34/63» frozen-log raqamlari eskirgan, bloker emas). **L11 dvigatel `wf_4725376c-9cd`** (17 agent, 8 candidate →
> **5 confirmed / 3 refuted / 0 uncertain**; premise §4-ni to'liq reproduce qildi: 10 bias + 10 extra-check). **DEDUP: cohort-K
> detail bank-accounts/cash-desks/expense-items/tax-rates qoplagan → LIST o'qi ONLY.** **§4: HECH BIR L11 sahifa uchun toza capture
> YO'Q** — yagona currency capture (`00-module/currency`) CONTAMINATED (`<title>Корзина</title>` + «Входящий платёж» formasi; L8
> saboq: `<title>`/sidebar mos ≠ toza, BODY o'qi) → sibling-parity ONLY, label churn yo'q, GROUNDING entry yo'q. **5 confirmed =
> AYNAN BITTA defect** (5 agent scrambled page-attribution bilan qayta-xabar berdi): **🔴 tax-rates dead/inert search box (full-stack,
> L10-sessions bug-class).** FE `search=""`+`onSearchChange={() => undefined}` (ListView:440 box render qiladi-yu no-op, value `''`ga
> qadalgan) + BE `TaxRateService.list()` schema'dagi `search`'ni `where`ga umuman qo'llamaydi (faqat archived) → wired FE ham bo'sh
> qaytarardi. **FIX (wired end-to-end, expense-items template):** FE searchInput+useDebounce(300)+threaded param/queryKey+no_results
> emptyTitle+hasActiveFilter; BE `where.OR=[{comment contains}, …(Number.isFinite? {rate:num})]` (**`rate`=Decimal, `contains`
> EMAS; comment=yagona free-text** → raqam bo'lsa rate-ga exact, aks holda comment-contains). **Placeholder «По ставке…» SAQLANDI
> (label churn yo'q, §4-clean)** — rate-OR-comment qidiruv uni halol qiladi (12 → 12% topadi; L10 «honest placeholder» tamoyili,
> lekin bu yerda mavjud placeholder allaqachon halol). **Tests:** api `tax-rate.schema.test.ts` +2 (search accept + service
> source-scan: `list()` `filter.search`'ni comment-contains OR rate qo'llashini lock qiladi), web `label-grounding.test.ts` +1 (FE
> wiring lock — search threaded, no-op handler qaytib kelolmaydi). **CLEAN (qolgan 6, critic-vetted + Opus GT):** bank-accounts/
> cash-desks (real cursor pagination `hasNext={!!nextCursor}` + BigInt-safe `formatMoney(BigInt(balanceMinor),currency)`) ·
> currencies (bespoke `<table>` inline-CRUD, `CurrencyBulkActionsDropdown` wired, hamma mutation onError, rate=exchange-rate raw) ·
> exchange-rates (read-only CBU sync, sync success+error branch, rate/nominal raw) · mxik (real cursor+count, import-only create) ·
> i18n hammasi keyed (Latin-uz/Cyrillic leak yo'q — gate-blind bo'lsa ham toza). Guard **+1 L11 wiring lock (92→93, no GROUNDING —
> §4 capture yo'q)**. **DEFER:** expense-items+tax-rates BE take:200/FE hasNext={false} dead pagination (low-cardinality → L8-discounts
> class, eskalatsiya yo'q) · bank-accounts/cash-desks balance cellText raw-minor CSV uchun (lekin ExportButton render qilinmaydi →
> unreachable dead-code) · barcha pagination/search liveness browser-unverified. **7 audit doc → progress.json list_audits 58.** Gate:
> tc0(web+api)·biome0·i18n ru+uz(0 yangi key)·label-grounding **93**·**web Vitest 1361 (+1, 0 regress)**·**api Vitest 2605 (+2, was
> 2603)**. **Phase-1, browser-smoke YO'Q. ➡️ KEYINGISI = L12 (Settings-org lists, OXIRGI).**
>
> **🆕 2026-06-05 — COHORT L10 (Retail lists) TUGADI → list_audits 49→51**:
> `davom et` (lokal Opus). Session-start audit (3-agent, `wf_d1772d68-d81`) **GO** (5 oxirgi commit struktura-halol; counters
> 31→37→42→47→49 git-diff bilan tasdiqlandi; L10 oldindan-bajarilmagan; faqat kosmetik risk: progress.json `phase2_covered:16`/
> `phase2_pct:29` field nomi chalg'ituvchi [FE komponent turini sanaydi, audit qoplamasini emas] — bloker emas). **L10 dvigatel
> `wf_8396e50e-8bc`** (17 agent, **11 confirmed / 1 refuted / 1 uncertain**; premise §4-ni to'liq reproduce qildi: 10 bias-immunize +
> 8 extra-check). **DEDUP: cohort-E detail-audit qilingan → LIST o'qi ONLY.** **§4: ikkala list HTML capture CONTAMINATED**
> (`<title>Корзина</title>`) → toza PNG `00-clean-default.png` (retaildemand = empty-promo → sales = sibling-parity). **sessions 3 fix:**
> (1) **🔴 dead search box WIRED** (`_search` hisoblanardi-lekin-ulanmagan + BE `search` yo'q; sibling sales ulagan) — BE `search`
> (trim·min1)→service `OR[cashier.name, description]` + FE params/queryKey (+2 schema test). **Adversarial GT:** session `name`
> (moysklad «№») `open()` da hech qachon o'rnatilmaydi=`''` → cashier+comment qidiruv, halol «Имя кассира…» placeholder qoldi
> (uncertain placeholder finding-ni hal qildi — «Номер или комментарий» EMAS, bizda raqam kolonkasi yo'q) · (2) **Latin-uz
> `header:'Holat'`→`tCommon('status')`** (gate-blind RU-leak; common.status «Статус»/«Holat», 0 yangi key) · (3) **fetched-but-
> unrendered «Склад»+«Организация» kolonkalar QO'SHILDI** (BE include ikkalasini oladi, moysklad PNG ko'rsatadi — L4/L5 carve-out;
> mavjud fields.store/organization, 0 yangi key; +organization SessionRow'ga). **money bug-class (ikkalasi):** sessions sales-sum+
> discrepancy + sales sum → `displayAs:'none'` (sessions row.cashDesk.currency; **sales: retail-sale list include'ga currency
> qo'shildi**, UZS-hardcode emas) + CSV cellText raw-minor→formatMoney. **sales:** uz typo **«Cheklarlar»(juft-ko'plik)→«Cheklar»
> ×3** (subnav+title+empty; Latin gate-blind). Guard **+5 L10 REGRESSION-LOCK (87→92, PNG→GROUNDING yo'q)**. **DEFER:**
> opened_at/closed_at «Открыта»→«Дата открытия» (PNG-grounded + status-badge collision, lekin engine redesign deb immunize +
> key'lar audited detail/z-report bilan SHARED → §4 defer-on-doubt) · «Касса»vs«Точка продаж» · «Изменить» mass-edit ·
> pagination liveness. **2 audit doc → progress.json list_audits 51.** Gate: tc0(web+api)·biome0·i18n ru+uz(0 yangi)·label-grounding
> **92**·**web Vitest 1360 (+5, 0 regress)**·**api Vitest 2603 (+2, was 2601)**. **Phase-1, browser-smoke YO'Q. ➡️ KEYINGISI = L11.**
>
> **🆕 2026-06-05 — COHORT L9 (HR lists) TUGADI → list_audits 47→49**:
> `davom et` (lokal Opus). Session-start audit (4-agent, `wf_1ca7cf51-70d`) **GO** (5 oxirgi commit struktura-halol — freshness-agent
> test suite'larni JONLI yugurtirib tasdiqladi: web 1352/api 2601/label-grounding 84; faqat kosmetik NEXT.md staleness: muzlatilgan
> snapshot ichidagi `42 (L1–L7)` ×2 [:1462,:1687] → 47/L1–L8 ga tuzatildi; + 2 ta untracked lokal-date-helper residual aniqlandi
> [`opportunities/board:49`, `analitika/kontragentlar/[id]:50`] → DEFER-backlog'ga qo'shildi). **L9 dvigatel `wf_7d22c330-542`**:
> premise A'LO (9 bias + 7 extra-check, §4 bilan to'liq mos), employees diff = **0 finding / 15 mirror**, payroll = 1 LOW (date, REFUTED
> ×2) + critic 1 LOW (fmtMinor). **§4 scope:** moysklad HR = «Сотрудники» (employees) ONLY (`00-module/employee` toza screenshot bilan
> ground-truth; columns Вход/Фамилия/Имя/Отчество/E-mail/Телефон/Логин/Описание — lekin bizning list ATAYIN boyroq HR redesign, parity
> emas); payroll = bespoke 6-tab dashboard (moysklad ref YO'Q); qolgan hr/* (attendance/telegram/review/…) = beyond-moysklad bespoke,
> cohortdan tashqari. **employees = TOZA** (pagination CORRECT — BE `$transaction([findMany,count])` real total, L6/L8 dead-pagination
> klassi EMAS; bulk thin-menu moysklad-grounded; i18n to'liq keyed — audit-only, kod o'zgarmadi). **payroll 3 intrinsic fix (dvigatel
> "unusually clean" dedi → MENING §1 ground-truth pass'im tutdi — buyPrice/products-PUT precedenti):** (1) **fmtMinor `-0`** — manfiy
> sub-1-som (`finalSalaryMinor` jarima>maosh bo'lganda) «-0» chiqardi → `negative && grouped !== '0'` guard; (2) **🔴 snapshot-today
> o'lik-refresh** — `qc` KpiTab'ga uzatilmagan → `snapMut` invalidate qila olmasdi → «Snapshot today» server'da upsert qiladi-yu KPI
> jadval refetch BO'LMAYDI → qc uzatildi + `onSuccess invalidate(['hr-kpi-daily'])`; (3) **silent-failure** — computeMut/snapMut/removeMut
> da `onError` yo'q → `toast.error(action_failed)` qo'shildi (employees mirror; 0 yangi i18n key). **Guard +3 L9 REGRESSION-LOCK
> (84→87, GROUNDING entry YO'Q — bespoke, capture yo'q).** **DEFER:** payroll date `formatInTimeZone(...,'yyyy-MM-dd')` (ISO, TZ-explicit
> Asia/Tashkent) vs app `DD.MM.YYYY` — adversarial **REFUTED ×2** (bespoke, TZ-explicit xavfsizroq; normalize qilish uchun avval TZ-aware
> shared `formatDateTz` kerak, naive swap EMAS). **Gate (mustaqil, YASHIL):** typecheck 0 (web) · biome 0 (changed) · i18n key-existence
> ru+uz ✓ (0 yangi key) · no-hardcoded ✓ · label-grounding **87** ✓ · **web Vitest 1355 pass/1 skip (+3 guard, 0 regress)**. 2 audit doc
> → progress.json **list_audits 49**. **Har birlik Phase-1, browser-smoke YO'Q. ➡️ KEYINGISI = L10 (Retail lists).**
>
> **🆕 2026-06-05 — COHORT L8 (E-commerce/pricing lists) TUGADI → list_audits 42→47**:
> `davom et` (lokal Opus). Session-start audit (4-agent) **GO** (L4–L7 kod o'zgarishlari diff bilan tasdiqlangan, progress.json
> fresh; faqat NEXT.md `Aniq keyingi vazifa` header L7'da qolgan edi → housekeeping `be562611` da tuzatildi, L7 recap qo'shildi).
> **L8 dvigatel `wf_bcfd35ce-83f`**: premise fazasi a'lo (5 ref tuzatildi + 8 bias + 9 konkret extra_check file:line bilan),
> lekin **analyze/verify fazasi DEGRADED** (barcha diff-agent + critic schema'da yiqildi → 0 blind-verified kandidat). Loyiha
> qoidasiga ko'ra har topilma **Opus tomonidan to'g'ridan-to'g'ri ground-truth qilindi** (ko'r-ko'rona qo'llanmadi). **§4 = ALL
> 5 CAPTURE YAROQSIZ:** saleschannel + pricelist `00-clean-default.html` to'g'ri `<title>` ga ega-yu, BODY = kontaminatsiyalangan
> customer-order forma (Контрагент/План.дата отгрузки/Адрес доставки); pricetype `<title>=Заказы покупателей`; discounts+
> online-orders capture YO'Q → **sibling-parity ONLY, label churn yo'q, GROUNDING entry yo'q**. **Topilmalar (3 intrinsic fix,
> cohort bug-class):** (1) **orders money** `formatSum` = `Number(sumMinor)/100`+`toLocaleString('uz-UZ')`+suffix → BigInt-unsafe
> (precision >2^53) + noto'g'ri separator («64,000.00» ≠ moysklad «64 000,00») → `formatMoney(row.sumMinor,row.currency,{displayAs:'none'})`,
> cellText suffix bilan (CSV; moves/opportunities precedent). (2) **orders date** `receivedAt` raw `toLocaleDateString('uz-UZ')` →
> shared `formatDate` (date+time, NaN-guard; «Создано» L7 precedent). (3) **channels date** `lastSyncedAt` raw → shared `formatDate`.
> **CLEAN (fix yo'q):** discounts (i18n toza, settings-list) · price-lists (mature Move-pattern reference, formatDate allaqachon) ·
> price-types (inline-CRUD settings, useDestructiveMutation + onError hammasida, toza i18n). **Guard:** `label-grounding.test.ts`
> **+3 L8 wiring lock (81→84)** — REGRESSION-LOCK only (money/date helper wiring), GROUNDING capture entry YO'Q (§4 kontaminatsiya).
> **DEFER (Phase-2/BE):** discounts dead pagination (BE `discount.service.ts` take:200 + total:items.length + no-cursor, FE
> hasNext={false}; low-cardinality settings entity → LOW emas HIGH, premise tavsiyasi) · barcha pagination liveness browser-
> unverified · per-entity LIMIT (25/50/100, page-size grounding yo'q). **Gate (mustaqil, YASHIL):** typecheck 0 (web) · biome 0/0
> (changed) · i18n key-existence ru+uz ✓ (0 yangi key) · no-hardcoded ✓ · label-grounding **84** ✓ · **web Vitest 1352 pass/1 skip
> (+3 guard, 0 regress)**. 5 audit doc → progress.json **list_audits 47**. **Har birlik Phase-1, browser-smoke YO'Q.
> ➡️ KEYINGISI = L9 (HR lists).**
>
> **🆕 2026-06-05 — COHORT L7 (CRM lists) TUGADI → list_audits 37→42**:
> `davom et` (lokal Opus). Session-start audit (4-agent) **GO** (0 talk-vs-done drift; faqat kosmetik NEXT.md staleness —
> mislabeled-«live» :1621 neutrallashtirildi). **L7 dvigatel `wf_e11d6251-8c3`** (25 agent, **15 confirmed / 3 refuted /
> 0 uncertain**). **§4:** counterparties=reference (real PNG); contact-persons standalone moysklad list YO'Q (sub-tab,
> FINDING.md); opp/tasks/pipelines capture YO'Q → sibling-parity, label-churn yo'q. **Topilmalar:** (1) **counterparties
> i18n gate-blind** (no-hardcoded gate list page'larni skanlamaydi): 4 hardcoded Cyrillic gear-header → `t('col_*')`
> (mixed «STIR / ИНН» → per-locale) + hardcoded Latin-uz `typeLabel` map → `t('type_*')`; +10 key ru+uz. (2) **date
> cohort-bug** opp+tasks local `toLocaleDateString('ru-RU')` → shared `formatDateOnly` (dedup+NaN-guard); «Создано»
> date-only → shared `formatDate` (date+time, 8 sibling parity). (3) opp money «сум» suffix → `displayAs:'none'`.
> (4) **chrome drift** onRefresh+createPosition='start' ×4 + selectionCount ×3 (pipelines no-bulk → omitted). (5) richEmpty
> orphan → heading+cta ×3. **Guard +11 L7 wiring lock (70→81).** **DEFER:** /help/counterparties dead route · pagination
> liveness browser-unverified · per-entity LIMIT. Gate: tc0·biome0·i18n ru+uz·label-grounding **81**·**web Vitest 1349
> (+11, 0 regress)**. 5 audit doc → progress.json **list_audits 42**. **Har birlik Phase-1, browser-smoke YO'Q.
> ➡️ KEYINGISI = L8 (E-commerce/pricing lists).**
>
> **🆕 2026-06-05 — COHORT L6 (Catalog lists) TUGADI → list_audits 31→37**:
> `davom et` (lokal Opus). Session-start audit (4-agent) **GO** (5 list-commit struktura-halol, 0 talk-vs-done drift;
> faqat kosmetik NEXT.md staleness: :30 «CRON ham shu», :1361 «~40 list», deep-historical :1389 «34/63» — birinchi ikkitasi
> tuzatildi, dated-log blok qoldirildi). **L6 dvigatel `wf_cabc94da-b58`** (46 agent, 38 candidate → **27 confirmed / 11
> refuted / 0 uncertain**; dedup → 6 real defect-class). **§4 GROUND-TRUTH = TOZA CATALOG CAPTURE YO'Q** — `04-module/{product,
> productfolder,service,bundle,variant}/dom/00-clean-default.html` + `01-default.html` + `screenshots/00-clean-default.png`
> HAMMASI KONTAMINATSIYALANGAN (Заказы покупателей/Заказы поставщикам/Корзина). Shuning uchun parity baseline = **products-list
> reference + sibling-parity** (capture-grounded EMAS, §4 disciplined). **Topilmalar:** (1) **money-suffix cohort-bug**: bundles/
> services/variants `formatMoney(price)` («64 000,00 сум») → `formatMoney(…,'UZS',{displayAs:'none'})` («64 000,00») — products
> + 35 list-page konvensiyasiga mos (format.ts: list cell suffix-siz); 6 call-site. (2) **folder col label**: bundles/services
> `t('folder')`=«Папка» → **«Группа»** (uz «Papka»→«Guruh») — products-parity (products col «Группа» + «Группа товаров» filter +
> products_new.folder_label hammasi «Группа»). (3) **product-folders WHOLE-PAGE Latin-uz leak** (gate-blind: no-hardcoded Cyrillic-only
> + list page'lar skanlanmaydi): Yopish/Ochish·NDSsiz·(otadan)·«Sub-guruh qo'shish»·Tahrirlash·O'chirish·delete-confirm·«Nomi
> majburiy»·malformed «НДС ←» Label → 9 yangi `pages.product_folders` key (ru+uz) + reused common.edit/delete/field_required/
> action_irreversible; `FolderRow` JSX-component → `useTranslations` ichida chaqirildi. + **VAT regex guard** (`/^\d+$/` Number()'dan
> oldin, products F4-class). (4) **tracking-codes 🔴 HIGH dead pagination**: BE `take:200`+`total:items.length`+no-cursor, FE
> `hasNext={false}`+inert LIMIT=50 → >200 kod erishib bo'lmaydi + total noto'g'ri. Fix = products `product.repository.ts` cursor+count
> pattern: BE schema (+cursor +limit), service (take+1/slice/nextCursor/real count), FE (cursor state+wiring+reset), +2 schema test.
> LIMIT=50 NUMBER saqlandi (§4 defer — toza capture yo'q, faqat inert'lik tuzatildi). (5) **tracking-codes dead sort**: sortKey=
> 'createdAt' lekin createdAt col yo'q + hech bir col sortable emas → sortable «Создано» col qo'shildi (products mirror). (6)
> **variants stale comment**: belowMinimum «SKIPPED/out-of-scope» dedi-yu, aslida to'liq wired (schema+service+UI) → comment
> tuzatildi + onClear'ga setBelowMinimum qo'shildi. **bundles/services chrome** (onRefresh/selectionCount/createPosition="start")
> products-parity qo'shildi. **DEFER (Phase-2/BE):** mass-edit (onMassEdit yo'q, BE `/products/mass-edit` bor) · LIMIT page-size
> NUMBER (products=100/siblings=25/tracking=50, moysklad default toza capture yo'q) · empty-state/orphan empty_rich_* key polish ·
> `onHelp`→`/help/products` o'lik route (products'da ham, propagate qilinmadi) · products folder header literal «Группа» (qiymat
> to'g'ri, i18n-cleanliness nit). **Guard:** `label-grounding.test.ts` +7 (folder=«Группа» value-lock ×2 + displayAs wiring ×3 +
> product-folders no-Latin-uz lock + tracking-codes cursor/createdAt lock; **GROUNDING capture entry YO'Q** — toza capture yo'q).
> **Gate (mustaqil, YASHIL):** typecheck 0 (web+api) · biome 0/0 (changed) · i18n key-existence ru+uz ✓ (9 yangi key) ·
> no-hardcoded ✓ · label-grounding 70 ✓ · **web Vitest 1338 pass/1 skip (+7 guard, 0 regress)** · **api Vitest 2601 pass/2 skip
> (+2 tracking-code test, was 2599)**. 6 audit doc → progress.json **list_audits 37**. **Har birlik Phase-1, browser-smoke YO'Q.
> ➡️ KEYINGISI = L7 (CRM lists).**
>
> **🆕 2026-06-04 — COHORT L5 (Production lists) TUGADI → list_audits 24→31**:
> `davom et` (lokal Opus). Session-start audit (3-agent) **GO** (5 list-commit struktura-halol, 0 talk-vs-done drift;
> faqat kosmetik staleness: progress.json timestamp-only touches, docs/audits scratch fayllar, NEXT.md header «cron faol»
> aslida bloklangan). **L5 dvigatel `wf_68a1e798-7d2`** (41 agent, 32 candidate → 25 confirmed / 6 refuted / 1 uncertain).
> **§4 GROUND-TRUTH = clean PNG screenshots** `10-module/{processing,processingplan,processingprocess,productiontask}/screenshots/00-clean-default.png`
> (men o'zim o'qidim — list `01-default.html`/`dom-default.html` + `productionorder/*` KONTAMINATSIYALANGAN =
> Корзина/Заказы покупателей/Входящие платежи; faqat `dom/00-clean-default.*` real grid'ni ko'rsatadi; processing-orders +
> productions + stages uchun toza capture YO'Q → sibling/family-parity). **🔴 productions = degraded older scaffold**
> (eng katta topilma, FIXED, sibling'lardan mirror): dead pagination (nextCursor e'lon qilingan-yu o'qilmagan, 50-qator cap) ·
> bulk-bar yo'q (BE bulk-delete+bulk-transition bor) · onRefresh yo'q · const empty-state→filter-aware+richEmpty · dead
> ownerId param→owner picker + applicable filter · onCreate-reload→createHref+createPosition=start. **Cohort label bug-class**
> (gate-ko'rinmas): date «Дата»→«Время» ×3 · processings cost «База себестоимости…»→«Себестоимость» · processings output
> «Количество выпуска»→«Объём производства» (yangi col_output_volume, shared detail key MUTATSIYA QILINMADI) · `'№'`
> literal→tFields('number') ×2 (productions «Номер»→«№») · **+«Организация»** col (processings) · **+«Описание»** col
> (processes, yangi col_description — engine TOPMADI, screenshot GT'dan qo'shildi, buyPrice precedent) · work-orders
> +«Время»(createdAt)/+«Завершение производства»(plannedEndAt)/+«Комментарий»(description) data-present col + date
> `toLocaleDateString('uz-UZ')`→`formatDateOnly`/`formatDate` · processing-orders `microqtyToWhole` `Number()/1000`→BigInt-safe
> (precision, intrinsic critic). stages = toza. **Guard:** `label-grounding.test.ts` +4 L5 GROUNDING capture + 2 value-lock +
> L5 wiring-lock (date/№/cost/org/description/formatDate). **DEFER (Phase-2/BE, doc'langan):** processing-orders title
> «Заказы на переработку»→«Заказы на производство» (menu-grounded, dedicated capture YO'Q → re-capture) · trailing
> Отправлено/Напечатано/Комментарий col (BE-include) · work-orders Организация col (BE-include) · boms «Оплата труда»+«Затраты
> на производство» cost-split (BE) · catalog selection/«Изменить» mass-edit (BE) · processings/processing-orders `'UZS'` =
> BE no-currency-column (L4 r.currency fix QO'LLANMAYDI) · productions/stages full column-set (capture yo'q). **Gate (mustaqil,
> YASHIL):** tc0 · biome 0/0 (staged; 47 pre-existing xato boshqa fayllarda, scope tashqarisida) · i18n key-existence ru+uz ✓ ·
> no-hardcoded ✓ · label-grounding 63 ✓ · **web Vitest 1331 pass/1 skip (+12 guard test, 0 regress)**. 7 audit doc →
> progress.json **list_audits 31**. **Har birlik Phase-1, browser-smoke YO'Q.** **➡️ KEYINGISI = L6 (Catalog lists).**
>
> **🆕 2026-06-04 — COHORT L4 (Stock/internal lists) TUGADI → list_audits 19→24**:
> `davom et` (lokal Opus). Session-start audit (3-agent) **GO** (5 commit struktura-halol, 0 talk-vs-done drift; faqat
> kosmetik staleness: NEXT.md:84 cohort-L qatori `⏳`, :1215 stale `34/63` snapshot, `open-list-audit-session.ps1`
> untracked → housekeeping commit `cd487585`da yopildi). **L4 dvigatel `wf_a606f369-20b`** (78 agent, 14 confirmed /
> 1 refuted / 28 «uncertain» — ko'pi verify-DEGRADED, haqiqiy shubha emas). **Premise + diff agentlar mening §4
> DOM-role ground-truth grid-header qatorlarimni AYNAN tasdiqladi** (sortable `header-content title=`, grep-count EMAS;
> task/file side-panel `<th>` + column-config dropdown + `Корзина`-contaminated `dom/01-*.html` bias-immunize qilindi).
> **TOPILMA = cohort-wide grid-header label bug-class** (hech bir gate label QIYMATINI tekshirmaydi): (1) date column
> `tFields('moment')`=«Дата» → `tFields('time')`=«Время» ×5 (L2/L3 sibling'larda allaqachon tuzatilgan klass);
> (2) money column `tFields('cost')`=«Себестоимость» → `tFields('sum')`=«Сумма» ×4 (internal-orders allaqachon to'g'ri;
> DOM-role: «Себестоимость» 0 marta grid-header'da); (3) store directional — moves source/dest→`store_from`/`store_to`
> («Со склада»/«На склад»), enters→`store_to`, losses/inventories→`store_from`; (4) `'Pos.'` Latin literal→`tFields('positions_count')`
> «Позиции» ×4 (Cyrillic-only gate ko'rmaydi). **Struktura:** **+«Организация» default column** (enters/losses/inventories —
> moysklad ko'rsatadi, ma'lumot olinadi-yu render qilinmagan; data-backed, mirror moves) · **«Причина» default-visible'dan
> olib tashlandi** (enters/losses — moysklad grid col emas, ⚙ uchun def saqlandi) · money-cell `'UZS'`→`r.currency`
> (moves/enters/losses; BE include-only list() qaytaradi). **Hammasi existing `fields.*` key — 0 yangi i18n.**
> **label-grounding guard kengaytirildi** (5 L4 capture GROUNDING + date/money/Pos regression-lock). **DEFER (Phase-2/BE):**
> «Массовое редактирование» bulk (BE `/mass-edit` endpoint+modal+keys kerak) · trailing «Отправлено»/«Напечатано»/«Комментарий»
> cols (BE-include) · inventories «Сумма»-existence + «Тип документа» col · internal-orders to'liq column-realignment
> («Отгружено» BE field kerak) · filter «Откуда/Куда» grounding. **Gate (mustaqil, YASHIL):** typecheck 0 · biome 0/0 ·
> i18n key-existence ru+uz ✓ · no-hardcoded ✓ · label-grounding ✓ · **web Vitest 1319 pass/1 skip (+13 guard test, 0 regress)**.
> 5 audit doc → progress.json **list_audits 24**. **Har birlik Phase-1, browser-smoke YO'Q.** **➡️ KEYINGISI = L5 (Production lists).**
>
> **🏁 2026-06-04 — COHORT L (Settings-org) TUGADI → 63/63 — DETAIL-AUDIT KONVEYER (Phase-1) TO'LIQ YOPILDI (A–L)**:
> `davom et` (lokal sessiya; cron `github_repo_access_denied` bilan bloklandi — remote agent GitHub-auth yo'q, foydalanuvchi
> qayta-avtorizatsiya qilishi kerak; lokal push ishlaydi → L'ni o'zim Opus bilan tugatdim). Cohort L = **7 sahifa**
> (NEXT'dagi 6 + `analitika/sozlamalar/rollar` — 63-chi, `role` capture'ga mos). Dvigatel `wf_552a9b24-f53` (89 agent,
> 68 confirmed / 11 refuted / **0 uncertain**; dedup → **10 ta haqiqiy defekt**). Hammasi o'z to'liq o'qishim bilan
> cross-validate qilindi (ground-truth done). **Topilmalar:** (1) **publications [id]+new + label-templates [id]+new
> = BUTUN-SAHIFA hardcoded Uzbek-Latin, ZERO `useTranslations`** (gate-ko'rinmas, no-hardcoded faqat Cyrillic) → to'liq
> i18n (`pages.publications` 34 key + `pages.label_templates` 37 key, ru+uz; `common.*`/`fields.*`/`form.*` reuse). (2)
> publications/new 27 doc-type label, 4 tasi **noto'g'ri transliteratsiya** ('Peremeshchenie'/'Oprixodovanie'/...) →
> har `targetType` → canonical `detail_titles` key (`tDetailTitles`), +4 yangi doc-type (`facture_out/in`,
> `commission_report`, `consignment`). (3) **MED silent-failure:** publications/[id] revoke/rotate/delete + label-templates/[id]
> archive/delete `onError` YO'Q edi (faqat saveMut) → `setError` qo'shildi. (4) organizations [id]+new `throw new Error('Nom
> majburiy')` Latin-uz → `t('name_required')` + /new placeholderlar i18n. (5) **a11y:** label-templates/new + publications/new
> orphan `<label>` (control sibling) → `<span>` (biome `noLabelWithoutControl` error). regions·custom-entities·users·rollar
> = **toza** (premise immunization false-delta traplarni to'g'ri refute qildi: settings sahifalarda positions/totals/FSM
> kutilmaydi; users read-only = BE-gap, bug emas; TARGET_PATH↔TARGET_TYPES drift yo'q). **§4:** organizations capture
> KONTAMINATSIYALANGAN (positions-grid termlari aralash) → org field-labellar churn QILINMADI, faqat error-string.
> publications/label-templates capture YO'Q → faithful translation (taxminiy moysklad termini ixtiro qilinmadi).
> **Gate (hammasi yashil):** typecheck 0 · biome 0/0 (pre-existing a11y+sorted-classes+non-null ham tuzatildi) ·
> i18n-key-existence ru+uz ✓ · no-hardcoded (7 L-route DONE_ROUTES'ga qo'shildi) ✓ · **web Vitest 1306 green (regress yo'q)**.
> 7 audit doc yozildi → `progress.json` **63/63 (100%)**. Commit: shu sessiya. **Har birlik Phase-1, browser-smoke YO'Q.**
> **➡️ KEYINGISI = Phase-2 QA (alohida sessiya):** cohort bo'yicha real-brauzer + adversarial QA (concurrency/timeout/
> data-integrity/edge/authorization) — `QA-backlog (Phase 2)` bo'limiga qarang. **Cron:** foydalanuvchi GitHub'ni qayta-
> avtorizatsiya qilsa (https://claude.ai/code/routines/trig_01WbKLyyZnyYkGJKFx5L6PC7) kelajakdagi `davom et`/QA uchun ishlaydi.
> **⚠️ BE-backlog (Phase-2):** auditLog-write feature (money-docs/variants/online-orders/price-lists — `userId` threading);
> users/[id] edit+role-assignment endpoints (GET `/admin/employees/:id`, roles); label-templates/publications runtime smoke.
>
> **🌙 2026-06-04 — TUNGI AVTONOM NAVBAT (foydalanuvchi uxlayapti; tinimsiz davom et, har birlik gate+commit)**:
> Operator «sifat 1% tushdimi?» deb so'radi → adversarial re-check **capture-grounding bug-class**ni topdi (label
> grep-count/sibling-mirror/paraphrase bilan «grounded» deyilgan, aslida noto'g'ri; hech bir gate label-qiymatni
> tekshirmaydi). Tuzatildi + guard qo'yildi. **INTIZOM (CLAUDE.md §4): har label DOM-rol bilan ground-truth qilinadi
> (grep-count EMAS); capture'da yo'q bo'lsa products-reference termini; ikkilanish → DEFER, taxmin yo'q.**
> **Navbat (ustuvorlik):**
> 1. **Phase C** — `wf-label-grounding-audit.js` qolgan ~15 capture-li sahifada (supplies·sales-returns·purchase-returns·
>    prepayments·prepayment-returns·counterparty-adjustments·products·counterparties·projects·stores·losses·uoms·
>    bundles·services·variants) — confirmed misground'larni o'zim DOM-rol bilan tekshirib tuzataman + `label-grounding.test.ts`
>    GROUNDING-LOCK registry'ni kengaytiraman + commit. (production-config = capture yo'q → skip.)
> 2. **Phase D** — cohort konveyer: **G (CRM: opportunities·pipelines·contact-persons·tasks; opportunities auditEntity
>    slug + a11y biome shu yerda)**, so'ng H·I·J·K·L — har biri cohort-dvigatel + label-grounding intizomi + guard + gate
>    + Phase-1 commit + NEXT.md/progress/MEMORY yangilash.
> **Davomiylik:** har background workflow tugashi meni qayta-uyg'otadi (zanjir); qo'shimcha ScheduleWakeup fallback
> qo'yilgan. Har birlik **Phase-1, browser-smoke YO'Q** deb halol belgilanadi.
> **Bajarilgan commitlar:** `5ee9b314` (label sweep), `38d49c16` (guard 26→38 test), `c4d462d7` (overnight queue),
> `be6a02c8` (Phase C counterparty sweep: supplies/sales-returns/purchase-returns/customer-orders/new + guard +
> purchase-returns doc). Phase C re-audit (`wf_53b099d3-2d0`): 29 correct, 12 cant_verify (capture buzuq/list-only →
> toza detail capture kerak [Phase-2]), 1 confirmed (purchase-returns counterparty, fixed), 1 defer («Причина» —
> moysklad'da bunday field yo'q, structural). **Cohort G (CRM) TUGADI (42/63):** `wf_85fba5eb-9ba` 13 confirmed;
> 2 HIGH data-integrity (opportunities contact-person wipe-on-load, tasks Edit→duplicate) + opportunities slug + a11y +
> Latin-uz i18n sweep + pipelines guard + default funnel stages localized; commits `fb7547fd` (logic) + `ea54c0bc`
> (i18n+docs). 4 audit doc yozildi. DEFER: opportunities reopen-control feature, tasks formatDate shared-helper.
> **Cohort H (E-commerce/pricing) TUGADI (46/63):** `wf_48fd9e45-543` 9 confirmed — channels settings-guard +
> external-clearing, orders uz-typo + formatMoney, price-lists ~13 i18n leaks; discounts toza; commit `371d27d1`;
> 4 audit doc. DEFER: orders+price-lists History BE audit-write feature, price-lists «Внешний код» uncertain.
> **Cohort I (HR) TUGADI (48/63):** `wf_ef7df3c0-a3c` 4 confirmed (LOW) — payroll currency-threading, employee role-aria
> i18n; payroll History TO'G'RI wired; commit `d962bfa2`. **Cohort J (Analytics) TUGADI (51/63):** `wf_0d7f6fc7-956`
> 7 confirmed — money bug-class (`Number(minor)/100`+«so'm»→`formatMoney`), state-label, UTC-date fixes; commit `0842dee9`.
> **Cohort K (Settings-finance) TUGADI (56/63):** `wf_d0f91419-ace` — bank-accounts+cash-desks Latin-uz leak→i18n;
> commit `95a599e0`. **QOLDI: faqat Cohort L (Settings-org):** settings/organizations · regions · publications ·
> custom-entities · label-templates · users — **63/63 uchun oxirgi**. **Davomiylik endi CRON routine'da** (foydalanuvchi
> ruxsat berdi, 110 commit push qilindi `origin/main`ga): cloud cron har ~2 soatda `davom et` ishlatadi → L'ni auditlaydi,
> fix+gate+Phase-1 commit + `git push origin main`, keyin 63/63'da konsolidatsiya hisobotini yozadi. ⚠️ BE-backlog
> (auditLog-write feature): cohort-D money-docs, variants, online-orders, price-lists — `userId` threading + `auditLog.create`
> (cross-cutting, Phase-2). hr/employees permissions/salary · analitika/sozlamalar/rollar · xodimlar HR-role-labels ·
> bank-account missing fields · currency-change guard · tax-rate 409-map ham Phase-2.
>
> **🤖 2026-06-03i — `davom et` UCHUN ANIQ KO'RSATMA (COHORT F: Catalog items → 38/63)**:
> `davom et` → session-start audit (3-agent) **GO** (5 commit struktura-halol, 34/63 disk+progress+NEXT sinxron, 0
> talk-vs-done drift; faqat kosmetik gap: NEXT.md `812`/`1055`/`1341` stale «2026-06-03f»/«32/63» date-labellar [shu
> commitda tuzatildi] + stale «Aniq keyingi vazifa» bloklar yig'ilishi). **COHORT F (38/63, `wf_6efce153-ac6`,
> 28-agent cohort-dvigatel; 19 confirmed / 3 refuted / 0 uncertain)**: bundles · services · variants · tracking-codes —
> products-oilasi katalog ENTITY'lari (hujjat EMAS). Premise reference=`products/[id]`ni tasdiqladi + doc-scaffolding /
> service-stock / variant-inherited / tracking-codes-no-sibling false-delta oilalarini immunize qildi. **Har confirmed
> delta operator (Opus) kod+backend+gold-capture bilan mustaqil tekshirdi (ko'r-ko'rona qo'llanmadi).**
> **🔴 ENG MUHIM — F-PUT (HIGH, MENING GT TOPILMAM, dvigatel ko'rmadi chunki products=reference):** `products/[id]:279`
> `api.put('/products/:id')` yuborardi, lekin NestJS controller faqat `@Patch(':id')` (`@Put` YO'Q, `@All`/override yo'q)
> → **har product Save runtime'da 404** edi. typecheck/lint/unit ko'rmaydi; yagona e2e (`product-crud.spec`)
> create→archive→restore→delete qoplaydi lekin **edit/Save yo'lini HECH QACHON** sinmaydi = klassik «browser-smoke YO'Q»
> runtime tuynuk. Egizak bundles/services allaqachon `api.patch` (xuddi shu endpoint) → PATCH = kontrakt. **Fix: `api.put`
> →`api.patch`** + regression guard `catalog-api-method.test.ts` (source-scan: products/services/bundles/variants
> `/products|/variants/:id` PATCH bo'lishi shart). **FIXLAR:** **(F1 HIGH)** bundles `auditEntity="Bundle"` + services
> `="Service"` → `="Product"`: ikkalasi `PATCH /products/:id`, BE `entity:'Product'` yozadi → History/Tarix tab DOIM bo'sh
> edi (work_order→WorkOrder bug-class; BE log ISHLAYDI = haqiqiy slug-fix). **(F2 HIGH, [id]+/new)** variants buy-price
> maydon label `tCommon('created')` («Создано»/«Yaratilgan» = Yaratilgan-SANA label) → `t('buy_price_label')`
> («Закупочная цена»/«Xarid narxi», products-bilan mos). ⚠️ **Self-correction:** dastlab `tFields('cost')» («Себестоимость»)
> qo'ygandim «capture-grounded» deb — lekin u grep hit promo-banner edi («Маржа и Себестоимость»), field label EMAS;
> products xuddi shu `buyPrice` maydonni «Закупочная цена» deydi → critic to'g'ri edi, follow-up commit'da tuzatildi.
> **(F3 bug-class, 6 sahifa)**
> hardcoded Latin-uz leaklar → i18n: thrown errorlar, `· Kod:`, aria-labellar, placeholderlar (Color/Red ham),
> services zod static→`makeServiceFormSchema(tProduct)` factory (product_new key reuse). **(F4 MED)** bundles
> salePrice/vat/mxik `BigInt()/Number()` oldidan validation guard yo'q edi → xom JS `SyntaxError` → products zod mirror
> regex guard. **(F5 MED, cohort-wide ~60 caller)** shared `useDestructiveMutation` hook Latin-uz default'lari (confirm
> body/2 tugma/2 toast) RU-locale'ga sizardi → `useTranslations('common')` (`action_irreversible` yangi + delete/cancel/
> deleted/action_failed reuse); test uz-locale qiymatlariga moslandi (0 churn behavior). **+11 i18n key (ru+uz)** +
> no-hardcoded gate'ga 4 katalog route. **DEFER (Phase-2/BE):** 🟡 variants History = BE feature-gap (`variant.service`
> 0 audit yozadi; slug `"Variant"` TO'G'RI — o'zgartirilmadi; cohort-D/bom precedent: BE audit-write feature); 🟡 bundle
> component-list changes audit (bundle.service 0 audit). **Gates (mustaqil, YASHIL):** web tc0 · biome0 (1 pre-existing
> warning, meniki emas) · web Vitest **1268 pass/1 skip** (+4 catalog-api-method; 0 regress incl. ~60 hook caller) · i18n
> key-existence ru+uz + no-hardcoded. **HALOL: Phase-1, browser-smoke YO'Q** — F-PUT edit-Save success / F1 History
> rows / F2 «Закупочная цена» label / F3 RU-locale labels / F4 decimal-reject / F5 RU delete-confirm smoke'lari Phase-2 QA.
> Audit doc'lar: `docs/audits/{bundles,services,variants,tracking-codes}-detail.audit.md` + products doc'ga F-PUT note.
> **⭐ KEYINGI = COHORT G (CRM)**: opportunities · pipelines · contact-persons · tasks. ⚠️ **opportunities/[id]
> `auditEntity` `"opportunity"`→`"Opportunity"` slug + pre-existing a11y biome xato SHU COHORTDA birga tuzatiladi**
> (cohort-C'dan deferred). So'ng H (e-commerce/pricing), I (HR)... org-account picker scope (~13) + cohort-D/F History
> BE audit-write feature'lari hali Phase-2 QA kutmoqda.
>
> **🤖 2026-06-03h — `davom et` UCHUN ANIQ KO'RSATMA (COHORT E: Retail → 34/63)**:
> `davom et` → session-start audit (3-agent) **GO** (5 commit struktura-halol incl. Cohort D `b0019d37` P1/P2/P3
> kodda tasdiqlandi, 32/63 sinxron, 0 drift). **Anti-confab: «MEMORY.md 2026-06-03g yo'q» = FALSE ALARM** (audit
> agentlari repo-dir'da ishlaydi, user memory-dir'ni ko'rmaydi — tekshirildi, entry BOR; xuddi 2026-06-03e singari);
> «progress.json generatedAt stale» ham false (timezone — 15:29Z ≈ commit vaqti). Topgan haqiqiy gap: NEXT.md «Joriy
> holat» bo'limining bir nechta `29/63` qatori eskirgan → shu commitda `34/63`ga yangilandi. **COHORT E (34/63,
> `wf_30430cdc-058`, 18-agent)**: retail/sales · retail/sessions — read-only POS sahifalar (sale = chek, session =
> smena+z-report+drawer). Premise mening brief'imni tasdiqladi (retaildemand/retailshift GOLD capture = baseline,
> demands = feature-source; auditEntity=`retail_sale` vacuously-empty = TO'G'RI, slug-fix EMAS). 9 confirmed → 4
> distinct. Har RU label capture + mavjud namespace bilan grounded (TAXMIN qilinmadi). **FIXLAR:** **(RS1 HIGH, ikkala
> sahifa)** ~27 ta hardcoded Latin-uz literal (Sana/Kassa/Ombor/«Sof sotuv»/«Kassa operatsiyalari»/«Naqd kiritish»...) →
> i18n; RU-locale'da uz qolardi = parity break (no-hardcoded gate faqat Cyrillic tutadi → Latin-uz sizib o'tadi).
> Mavjud key'lar reused (`fields.*`, `payment_dialog.*`, `pages.retail` cash terms) + 11 yangi key (ru+uz, capture-
> grounded: «Выручка», «Внесение»/«Изъятие»). **(RS2 MED)** retail/sessions drawer Внесение/Изъятие dialog «Комментарий»
> ni TUSHIRARDI — BE `DrawerCashSchema.description` qabul qiladi + ops-list `o.description` ko'rsatadi, lekin FE input
> yo'q edi → comment Input + `description` payload qo'shildi (FE-only). **(RS3 LOW)** drawer summa `Number(x)*100` float-
> coercion + hardcoded `*100` → `Money.fromMajor(x, tillCurrency).toMinor()` (`@moysklad/money`, string-decimal,
> per-currency scale; `isCurrencyCode` narrow + UZS fallback). **(RS4 LOW)** formatMoney UZS-default ko'rsatardi → till
> currency (`cashDesk.currency`) uzatildi (suffix to'g'ri; scale formatMoney'da /100 fixed = scope tashqarisi).
> **counterparty-adjustments yo'q bu cohortda.** **DEFER (Phase-2):** z-report cashReturns/cardReturns fetched-but-
> unrendered (uncertain — closed-shift capture kerak); «От кого»/«Основание» drawer fields = BE column kerak (feature).
> **Gates (mustaqil, YASHIL):** web tc0 · biome0 (4 fayl) · web Vitest **1264 pass/1 skip** (0 regress; yangi test yo'q
> — display+i18n o'zgarish, Money.fromMajor o'z paketida test qilingan) · i18n key-existence ru+uz (+11 key) +
> no-hardcoded. **HALOL: Phase-1, browser-smoke YO'Q** — RU-locale render / drawer-comment persist / non-UZS-till
> Money.fromMajor smoke'lari Phase-2 QA. Audit doc'lar: `docs/audits/{retail-sales,retail-sessions}-detail.audit.md`.
> **⭐ KEYINGI = COHORT F (Catalog items)**: bundles · services · variants · tracking-codes (cohort-dvigatel bilan).
> So'ng G (CRM — opportunities `auditEntity` `opportunity`→`Opportunity` slug + a11y biome SHU YERDA tuzatiladi), H...
> ⚠️ org-account picker scope (~13, money-critical) + cohort-D History-tab audit-log BE feature hali Phase-2 QA kutmoqda.
>
> **🤖 2026-06-03g — `davom et` UCHUN ANIQ KO'RSATMA (COHORT D: Money / returns → 32/63)**:
> `davom et` → session-start audit (3-agent workflow) **GO** (5 commit struktura-halol, 29/63 disk+progress+NEXT
> sinxron, 0 talk-vs-done drift; topgan kosmetik gap'lar: `NEXT.md:1272` «line 256+» cross-ref noto'g'ri [haqiqiy ~1015],
> `NEXT.md:960` Q2 «2-3 hafta» eskirgan, `progress.json` list_audits semantikasi noaniq — bloker emas; freshness-agent
> `pnpm progress` ni yugurtirib progress.json'ni iflos qildi → HEAD'ga qaytarildi). **COHORT D (32/63, `wf_b388323a-101`,
> 12-agent cohort-dvigatel)**: prepayments · prepayment-returns · counterparty-adjustments. **Premise AVTO-TUZATDI**
> mening brief'imdagi xatoni: men prepayments'ni `payments-in` egizagi + order/invoice allocation grid deb framing
> qildim — NOTO'G'RI; repo hammasini **cash-order / retail-split avlodida** qurgan (sahifa header-kommentlari shuni
> aytadi). 6 confirmed → 4 distinct issue. Har confirmed delta operator (Opus) kod+backend (zod strictness, cap
> aggregate, balance currency-partitioning, Prisma nullability) bilan mustaqil tekshirdi.
> **FIXLAR:** **(P1 HIGH, FE-only, prepayments + prepayment-returns)** detail PATCH retail-split `cash/noCash/qrSumMinor`
> ni `!== '0' ? … : null` deb yuborardi → wholesale (split-siz) hujjatda `null,null,null` → `Update*Schema` (`.strict()`,
> `bigintMinor.optional()` = string|undefined) **null'ni RAD etadi → HAR wholesale Save 400** (jim muvaffaqiyatsiz). →
> `form.cashSumMinor || '0'` (regex'dan o'tadi, service truthiness guard 0n saqlaydi). `/new` allaqachon `undefined`
> yuborgan (to'g'ri). **(P2 MED money-integrity, prepayment-returns)** refund `currency` draft'da erkin tahrirlanadi +
> `/new` `UZS` default (source'dan OLINMAYDI), lekin over-return cap (`assertWithinPrepaymentCap`) **currency-ko'r** (xom
> minor solishtiradi) va `applyDelta` return'ning O'Z currency bucket'iga yozadi → USD-refund UZS-avansga cap'dan o'tadi
> lekin USD bucket'ni kreditlaydi = real over-refund (UZS-bo'lmagan biznesda DEFAULT yo'l). → BE `create` `currency =
> source.currency` (klient qiymatini e'tiborsiz qoldiradi); `currency` `UpdatePrepaymentReturnSchema`'dan olib tashlandi
> (`.strict()` endi o'zgartirishni rad etadi) + update-write'dan; FE detail+/new currency read-only (source'dan meros,
> agent/org kabi). **(P3 LOW, prepayment-returns)** «Остаток к возврату» FULL source sum ko'rsatardi (label'iga zid) →
> BE `findById` `prepaymentRemainingMinor = source − Σ(boshqa applicable returns, o'zini exclude)` (cap aggregate'ni
> qayta ishlatadi, BigInt→string global toJSON) + FE ishlatadi. **counterparty-adjustments = TOZA** (struktura/interaktiv
> delta yo'q; retail-split/currency-vs-source bu sahifaga tegishli emas). **DEFER (documented):** 🟡 **History (Tarix) tab
> DOIM bo'sh — cohort-wide (3 sahifa):** xizmatlar `auditLog.create` YOZMAYDI (cash-in/payment-in egizaklari yozadi →
> haqiqiy money-doc parity-gap, katalog change-history emas); FIX = cross-cutting BE feature: `update`/`transition`/
> `softDelete` (+3 controller) `userId` OLMAYDI → ~9 metod + 3 controller threading + `logAudit` helper (cash-in mirror).
> Katalog change-history'dan YUQORIROQ ustuvor (egizaklar yozadi). 🔴 **org-account scope** (prepayments + prepayment-
> returns = ~13 backlog'dan 2 tasi). **Gates (mustaqil, YASHIL):** web tc0 · api tc0 · biome0 (8 fayl) · web Vitest
> **1264 pass/1 skip** (+2 retail-split source-scan gate) · api Vitest **2599 pass/2 skip** (+9: 3 schema null-contract,
> currency-force, findById-remaining, currency/null-split schema) · i18n key-existence ru+uz + no-hardcoded (0 yangi key).
> **HALOL: Phase-1, browser-smoke YO'Q** — P1 wholesale-save-success / P2 foreign-currency-refund-blocked / P3
> remaining-render runtime smoke'lari Phase-2 QA-backlog'da. Audit doc'lar: `docs/audits/{prepayments,prepayment-returns,
> counterparty-adjustments}-detail.audit.md`.
> **⭐ KEYINGI = COHORT E (Retail)**: retail/sales · retail/sessions (cohort-dvigatel bilan). So'ng F (catalog items:
> bundles·services·variants·tracking-codes), G (CRM — opportunities `auditEntity` slug + a11y biome bu yerda), ...
> ⚠️ Cohort E/... uchun toza capture kerak bo'lsa `08-module`/retail capture'larini tekshir. org-account picker scope
> bug-class (~13 sahifa, money-critical) hali Phase-2 QA kutmoqda; **cohort-D 3 sahifa History-tab audit-log BE feature**
> ham Phase-2/BE-backlog'da (pastga qo'shildi).
>
> **🤖 2026-06-03f — `davom et` UCHUN ANIQ KO'RSATMA (COHORT C: Production-config → 29/63)**:
> `davom et` → session-start audit (3-agent workflow) **GO** (5 commit struktura-halol, 25/63 disk+progress+NEXT sinxron,
> 0 talk-vs-done drift; topgan kosmetik gap'lar: NEXT.md:672 «2026-06-03d»→03f, :916 «11/63» eskirgan — shu commitda
> tuzatildi; list_pages.phase2_pct=29% backing audit doc yo'q masala — note). **COHORT C (29/63, `wf_9c1c1462-736`,
> 24-agent cohort-dvigatel)**: boms · processes · stages · work-orders. ⚠️ **NO production gold capture** → premise
> sibling-parity'ga avto-tuzatdi (config-absence phantomlarni — counterparty/currency/totals/print — bias-immunize bilan
> rad etdi) + intrinsic-critic. **18 candidate → 15 confirmed / 2 refuted (CatalogPicker auto-close) / 1 uncertain (uz
> title)**. Har confirmed delta operator (Opus) kod+backend+i18n bilan mustaqil tekshirdi (ko'r-ko'rona qo'llanmadi).
> **FIXLAR:** **(W3 HIGH)** work-orders `auditEntity="work_order"` ≠ service `entity:'WorkOrder'` (audit-log EXACT-match
> query) → History tab DOIM bo'sh edi → `"WorkOrder"` (BE allaqachon to'g'ri yozadi). **Bug-class (cross-cohort):** xuddi
> shu `tasks` (`"task"`→`"Task"`) ✅ va `opportunities` (`"opportunity"`→`"Opportunity"`) da — tasks TUZATILDI, opportunities
> **Cohort G'ga DEFER** (o'sha sahifada avto-tuzatib bo'lmaydigan a11y biome xatosi scoped-commit'ni bloklaydi).
> **(S1/S2 HIGH)** stages/[id] materialStore + performers reload'da XOM UUID ko'rsatardi (GET faqat FK id yuborardi) →
> BE findById+create include'ga `materialStore{name}` + `performers.employee{name}` qo'shildi, `serializeDetail`
> `{id,name}` qaytaradi, FE NAME ko'rsatadi (PATCH yo'li o'zgarmadi). **(B4 med)** boms outputQty (+ component qty) `0`
> qabul qilinardi (regex va'da bergan «positive»ni bajarmasdan) → BE `.refine(>0)` + FE guard + 2 schema-test;
> work-order completion divide-by-zero kech-fail'i oldini oladi. **(W1/W2 med)** work-orders/[id] sanalar
> `toLocaleDateString('uz-UZ')` → shared `formatDate`/`formatDateOnly` (ru-RU + vaqt) ; backend persist qiladigan
> `description` hech qachon render qilinmasdi → read-only qator qo'shildi. **(P1 med)** processes bo'sh-pozitsiya xatosi
> `t('positions_count',{count:1})` = «Этапов: 1» LABEL'ni banner sifatida tashlardi; pick_stage/stage_name LABEL'lar ham
> → real `err_no_positions`/`err_pick_stage`/`err_stage_name` keys ([id]+/new). **(cohort uz-leak class)** boms/processes/
> stages [id]+/new validation throw + delete aria'dagi hardcoded uz literallar → `tCommon('field_required',{field})`
> (yangi `common.field_required`) + `tCommon('delete')` + `pages.boms.err_*`; i18n-no-hardcoded gate'ga 3 route qo'shildi.
> **Gates (mustaqil yugurtirildi, YASHIL):** web tc0 · api tc0 · biome0 (changed) · web Vitest **1262 pass/1 skip** ·
> api Vitest **2590 pass/2 skip** (+2 yangi) · i18n key-existence ru+uz (+6 key) + no-hardcoded. **HALOL: Phase-1,
> browser-smoke YO'Q** — W3 History / S1/S2 name-render / B4 reject / W1 date / P1 banner runtime smoke'lari Phase-2
> QA-backlog'da (yuqorida «Production-config (4)»). Audit doc'lar: `docs/audits/{boms,processes,stages,work-orders}-detail.audit.md`.
> **⭐ KEYINGI = COHORT D (Money / returns)**: prepayments · prepayment-returns · counterparty-adjustments (cohort-dvigatel
> bilan). So'ng E (retail), F (catalog items)... ⚠️ org-account picker scope bug-class (~13 sahifa, money-critical) hali
> Phase-2 QA kutmoqda (yuqoridagi backlog). Cohort D/... capture kerak bo'lsa avval `06-module` capture'larni qayta ol.
>
> **🤖 2026-06-03e — `davom et` UCHUN ANIQ KO'RSATMA (SESSION-START GAP-CLOSE + COHORT B: Stock+internal → 25/63)**:
> `davom et` → session-start audit (3-agent, 2 marta) **NO-GO**: `progress.json` audited:18 lekin diskda 21 `.audit.md`.
> Sabab: 3 Cohort-A doc (processing-orders/processings/productions) `## Verdict`/`## Gates` header ishlatardi →
> content-gate (`progress-report.ts:149` `## A. Structural`+`## B. Interactive` talab) ularni SANAMASDI. Ular HAQIQATAN
> audit qilingan (`f97d0554` 3 real bug) → **21 halol son**. **GAP-CLOSE (`64154700`)**: 3 doc'ni protokol A/B
> bo'limlariga moslashtirildi (display-bug→A, wiring/action-bug→B; mavjud kontent qayta tashkil, yangi topilma
> O'YLAB topilmadi) + `progress.json`→21 + NEXT.md 6 stale «18/63»→«21/63» + joriy-holat sana. **Anti-confab**:
> «MEMORY.md missing entry» = FALSE ALARM (cohort-flow-wired entry 066d55fb+f97d0554'ni qoplaydi) — qilinmadi.
> **COHORT B (25/63)**: enters · losses · inventories · internal-orders — cohort-dvigatel (`wf_9832a633-948`, 23-agent).
> **🔴 CAPTURE CONTAMINATION TOPILDI**: `06-module/{enter,loss,internalorder}` captures BUZUQ (`<title>Корзина</title>`,
> Заказ-поставщику formani ko'rsatadi — Контрагент ×15, Договор ×11) → faqat `inventory` capture TOZA. 3/4 effektiv
> sibling-parity bo'ldi (premise bias-immunize + refute-default capture-phantom'larni rad etdi — «missing counterparty/
> currency» false-positive YO'Q). **enters + losses = TOZA** (0 delta; reason enum + overhead[enters-only] + qty-cost/
> qty-only doc-correct; buyPrice allaqachon `066d55fb`). **inventories = 1 FEATURE-GAP (defer)**: toza capture «Дополнить
> из остатков»/«Дополнить из номенклатуры» count-sheet population ko'rsatadi, bizda yo'q (stock-balance integ. kerak);
> FSM terminal (post+cancel, unpost YO'Q) TO'G'RI. **internal-orders = 5 FIX**: **(IO-1 HIGH)** moved-progress summary
> `t('moved_progress',{moved:movedSumMinor,total:sumMinor})` XOM MINOR ko'rsatardi (100× + grouping/currency yo'q) →
> `formatMoney` (money-format bug-class, buyPrice singari); **(IO-2 MED)** externalCode read-only edi + PATCH'dan tushardi
> (create'da set, keyin tahrlab bo'lmaydi) → editable + payload (backend `schema:83`+`service:289` qabul qiladi); **(IO-5/6/7
> EditForm uz-leak bug-class)** 3 hardcoded uz literal RU-locale'da chiqardi → i18n: cancel tugma «Bekor qilish»→
> `tTransitions('cancel')`(«Отменить»); moved-table header `Tovar/Buyurtma/Bajarilgan`→`tFields('product')`+yangi
> `moved_col_ordered`/`moved_col_fulfilled` (ru+uz); tooltip `Bajarilgan:`→`moved_progress` key (MovedProgressCell
> modul-darajada → `title` prop). **DEFER (capture buzuq → Phase-2 QA)**: **IO-3** «Целевой склад»→?«Склад» (family-konvensiya
> «Склад» deydi: hamma sibling+parent shunday, «Целевой» = Move-konsepti; lekin internal-order capture = noto'g'ri
> Заказ-поставщик formasi → toza re-capture kerak), **IO-4** planned-date «...поставки»→?«План. дата приёмки» (internal
> order uchun приёмки-vs-поставки noaniq). Har confirmed delta operator (Opus) kod+backend+i18n bilan mustaqil tekshirdi
> (ko'r-ko'rona qo'llanmadi). **Gates**: web tc0 · biome0 · web Vitest **1262 pass/1 skip** (0 regress) · i18n key-existence
> ru+uz (+2 key) + no-hardcoded. **HALOL**: browser-smoke YO'Q — IO-1 money-format + IO-2 externalCode round-trip +
> IO-3/4 label-defer + capture re-grab Phase-2 QA'ga (QA-backlog'ga qo'shildi). Audit doc'lar:
> `docs/audits/{enters,losses,inventories,internal-orders}-detail.audit.md`.
> **⭐ KEYINGI = COHORT C (Production-config)**: production/boms · production/processes · production/stages ·
> production/work-orders (cohort-dvigatel bilan). ⚠️ **work-orders/new `docDate` DocumentEditor'ga bog'langan lekin API
> payload'ga YUBORILMAYDI** (2-session-start audit topdi — doc-date bug-class variant; doc-date-payload.test `plannedStartAt`
> sink'i tufayli yashil qoladi, lekin tanlangan sana JIM yo'qoladi) — shu cohort'da tekshir/fix. So'ng D (money/returns),
> E (retail)... ⚠️ Cohort B/C/... auditlari uchun toza capture kerak bo'lsa — avval `06-module` capture'larni qayta ol.
>
> **🤖 2026-06-03d — `davom et` UCHUN ANIQ KO'RSATMA (Q2 DETAIL: payments-out CAPTURE-GROUNDED SIBLING-PARITY → 18/63 + clone DATA-LOSS fix + DOC-DATE moment BUG-CLASS 5 /new)**:
> `davom et` → session-start audit **GO** (3-agent: 5 commit struktura-halol, 17/63+16/56 tasdiq, 0 drift; topgan
> gap'lar yopildi: `doc-totals.test.ts` case-2 redundant input kuchaytirildi (300n/50n + anti-regress guard) +
> NEXT.md 6 ta stale «16/63»→«17/63 = 27%» joriy-holat qatori; gate'lar mustaqil qayta yugurtirildi yashil).
> **payments-out (18/63, `77195e2d`)**: payments-in egizagiga + **GOLD CAPTURE'ga** (`07-module/paymentout`:
> detail+edit+4 dropdown+5 tab+3 field-modal) qarshi capture-grounded adversarial workflow
> (`scripts/wf-payments-out-sibling-parity-audit.js`, `wf_94f8524c-a93`, 24-agent: 4 gather lens || → dedup 20 →
> blind direction-aware verify; brief PO «biased-brief» xatosiga qarshi qattiqlashtirildi). Operator (Opus) har
> confirmed delta'ni Prisma+service+/new+reference-endpoint bilan mustaqil qayta-tekshirdi → 2 ta agent-xatosini
> tuzatdi (pastda). **Xulosa: payments-out = yaxshi-mirror egizak** — payments-in fix'lari (Контрагent label, inline
> Задачи, allocation i18n) allaqachon meros olingan, payments-in uslubidagi qarz YO'Q.
> **🔴 FIXED — F20 clone DATA-LOSS (payment-out-specific)**: `clone()` op-map faqat `invoiceInId` ko'chirardi →
> purchase-order (avans) allocation'li to'lovni klonlasa, targetKind='purchaseorder' lekin purchaseOrderId=null
> bo'lgan target-siz/schema-buzuq qator hosil bo'lardi (avans allocation JIM YO'QOLADI). create()'ning targetKind-aware
> FK map'iga moslandi. **+ test** (`payment-out.service.test.ts`, 3 case: PO-advance/invoice-in/mixed; vi.fn Prisma
> mock — loyiha service-test konvensiyasi). PaymentOutOperation polimorf; PaymentIn ops single-FK → out-specific.
> **🔴 FIXED — DOC-DATE moment BUG-CLASS (5 /new, foydalanuvchi Q1: «fix all + test»)**: doc /new sahifa `docDate`
> control'i interaktiv, lekin create payload `moment`'ni TUSHIRARDI → operator tanlagan sana JIM tashlanadi, hujjat
> server-now() bilan sanalanadi (period/ledger buzilishi). ~16 egizak to'g'ri yuboradi. `moment: docDate ? new
> Date(docDate).toISOString() : undefined` qo'shildi: **cash-in · cash-out · inventories · payments-in · payments-out**.
> **+ bug-class guard test** (`__tests__/doc-date-payload.test.ts`: har `docDate`-control'li doc /new sahifa sanani
> `moment`/`plannedStartAt` deb yuborishini source-scan bilan tekshiradi — i18n-gate uslubida, butun sinfni qaytadan
> kirib kelishdan himoyalaydi). **⚠️ work-orders ATAYIN CHIQARILDI** (operator tuzatishi): uning `moment` maydoni YO'Q
> (`plannedStartAt`/`plannedEndAt` ishlatadi), `docDate` control'i dekorativ — `moment` qo'shish no-op bo'lardi;
> alohida masala (defer). Grep 6 nomzod topdi, backend-tekshiruv 5 ta haqiqiy.
> **🔑 ANTI-BIAS WIN'lar (operator)**: (1) **currency** — workflow «set-at-creation-never-editable» (PO trap) dedi,
> lekin payments-out/new HAM currency selector ko'rsatmaydi → симметрик «multi-currency UI'da yo'q» defer (payments-in
> kabi), PO bug-class EMAS — fix qilinmadi. (2) workflow `posted_at`(«Дата проведения»)ни moysklad «Дата начисления»
> deb noto'g'ri tenglashtirdi — `posted_at` BIZNING read-only system-timestamp (capture'da 0 marta); haqiqiy moysklad
> sana = doc `moment`. (3) **«Склад» yo'qligi TO'G'RI** — 46-store-picker capture stray list-filter artefakti.
> **DEFERRED**: **«Статья расходов» (expenseItem)** — out-specific REQUIRED maydon, end-to-end ulanmagan (column +
> ExpenseItem katalog BOR, lekin Create/Update schema+service+/new+detail PATCH tushiradi) → backend kerak ·
> **shared money-doc parity** (money-doc-wide pass'da: inline «Статус ▾» F13 web-only, «Создать документ» facture-in
> F12 backend-endpoint-bor, «Печать» «Список заказов» F10, «Отправить» email F11, purpose/comment Input→textarea
> F6/F7 — hammasi payments-in bilan simmetrik, egizaklarda birga qilinsin) · **backend-feature** (currency F2/
> sales-channel F4/VAT F5) · **🔴 org-account picker SCOPE bug-class — foydalanuvchi Q2: «Phase-2 QA sweep + capture»ga
> deferred** (pastdagi QA-backlog'ga qo'shildi).
> **Gates**: web tc0 · biome 0 (8 fayl) · web **1262 pass/1 skip** (edi 1235; +27 doc-date gate, 0 regress) · api tc0 ·
> api **2588 pass/2 skip** (+3 clone test, 0 regress) · i18n key-existence ru+uz + no-hardcoded (web vitest ichida,
> 0 yangi key). **HALOL**: browser-smoke YO'Q (payments-out demo-bo'sh) — F20 unit-test + create() mirror; doc-date =
> peer-mirror one-liner + source-scan gate; «create-with-date → persisted» live smoke + org-account scope verifikatsiya
> Phase-2 QA'ga. Audit doc: `docs/audits/payments-out-detail.audit.md`.
> **⭐ KEYINGI VARIANTLARI** (birinchisi tavsiya): (1) **Q2 detail davomi** — keyingi tabiiy nishon: prepayments /
> prepayment-returns (money-doc oilasi, capture bor: 07-module/prepayment·prepaymentreturn) yoki internal-orders /
> enters / losses (capture bor) — sibling-parity; (2) **money-doc-wide UI parity pass** (status-dropdown F13 +
> create-doc facture F12 + print/email — payments-in/out + cash-in/out birga, web-only + 1 backend-endpoint bor);
> (3) **org-account scope bug-class Phase-2 QA sweep** (~13 sahifa, capture + browser; QA-backlog'da) · «Статья
> расходов» backend feature; (4) list/nav audit (0%).
>
> **🤖 2026-06-03c — `davom et` UCHUN ANIQ KO'RSATMA (Q2 DETAIL: purchase-orders CAPTURE-GROUNDED SIBLING-PARITY → 17/63 + TOTALS VAT BUG-CLASS FIX 9 sahifa)**:
> `davom et` → session-start audit **GO** (3-agent: 5 commit struktura-halol, 16/63+16/56 tasdiq, 0 drift). **purchase-orders
> (17/63, `c6bf7673`)**: customer-orders egizagiga + **REAL moysklad DETAIL capture'ga** (`02-module/purchaseorder`: edit-form
> + 4 toolbar dropdown + status + tab'lar — CO audit'da capture YO'Q edi, bu yerda BOR) qarshi capture-grounded adversarial
> workflow (`scripts/wf-purchase-orders-sibling-parity-audit.js`, `wf_49ec851a-c8f`, 25-agent: 4 gather lens || → dedup 21 →
> blind direction-aware verify). Operator (Opus) har confirmed delta'ni backend bilan mustaqil qayta-tekshirdi.
> **🔴 F20 — TOTALS VAT BUG-CLASS (HIGH, 9 sahifa)**: totals sidebar `subtotal = vatIncluded ? sum-vat : sum` / `total =
> vatIncluded ? sum : sum+vat` edi. Backend computeTotals sumMinor=GROSS + vatSumMinor=VAT ni IKKALA mode'da saqlaydi →
> default `vatIncluded=false` da subtotal gross ko'rsatadi + total NDS ni IKKI marta qo'shadi (net + 2×VAT). 9 hujjat-detail
> sahifada bir xil edi (customer-orders ham — birinchi audit o'tkazib yuborgan). → bitta test qilingan helper
> `lib/doc-totals.ts` (`{subtotal: sum-vat, total: sum}`, hamma mode to'g'ri) ga chiqarildi, 9 sahifa ishlatadi,
> `doc-totals.test.ts` 5 case. **Foydalanuvchi qarori: 9 sahifani ham tuzat + test** (Q1). customer-orders qayta ochildi.
> **purchase-orders parity fixes** (egizak + capture mirror): **«Валюта» selector** (YO'Q edi; backend persist qiladi + /new
> set qiladi → multi-currency PO yaratiladi-yu hech ko'rsatilmaydi/tahrirlanmaydi; draft-only) · **«План. дата приёмки»** label
> (edi «...отгрузки» — PO tovar QABUL qiladi; yangi `detail_form.delivery_planned_receipt` ru+uz) · **received_sum formatMoney**
> (edi xom minor "150000000") · **«Ожидание»** → persistent `data.waiting` (edi sum'dan to'qilgan) + noto'g'ri tooltip
> o'chirildi · qty/discount xom string (precision) · «Договор» picker agentId-scope · disabled «Проверить комплектацию» tugma ·
> «Внешний код» pozitsiya ostiga (maxLength=50) · **print/purchase-order/[id] sahifa + onPrintList** · **email onSendEmail +
> SendEmailDialog** (PurchaseOrder email-whitelisted). **Foydalanuvchi qarori: ikkala yangi surface ham** (Q2).
> **DEFERRED** (audit doc): related-docs populate (backend endpoint kerak) · org-account picker scope (shared bug-class —
> customer-orders detail ham) · posted-doc editability (F4) · shared-toolbar «Открыть в API»/«Изменить» menu order ·
> create-menu/status exhaustiveness (capture). **1 yangi i18n key** (`detail_form.delivery_planned_receipt`); qolgani mavjud
> keylar (currency/check_bundle/external_code · form.currency_* · email subject_order/body_order · doc_title.purchase_order
> allaqachon singular+to'g'ri).
> **Gates**: web tc0 · biome 0 (12 fayl) · web **1235 pass/1 skip** (edi 1230; +5 doc-totals.test, 0 regress) · i18n
> key-existence ru+uz green. **HALOL**: browser-smoke YO'Q (PO demo-bo'sh) — F20 helper-darajada unit-test + backend storage
> semantikasiga qarshi tasdiq, lekin ikkala vatIncluded mode'da real render (pozitsiyalar bilan) shipping'dan oldin tavsiya
> (9 sahifa, customer-orders ham); PO print STIR satri yo'q (findById uzRequisites include qilmaydi). Audit doc:
> `docs/audits/purchase-orders-detail.audit.md`.
> **🩹 SESSION-START GAP-CLOSE**: (1) quyidagi 2026-06-03 entry'ning «invoices-out vs invoices-in» tavsiyasi allaqachon
> `c6be3247`'da bajarilgan → o'sha satr ✅-belgilandi (top entry ustun). (2) `productions` first-tab + F20 org-account scope +
> related-docs populate QA-backlog deferred ro'yxatiga qo'shildi.
> **⭐ KEYINGI VARIANTLARI** (birinchisi tavsiya): (1) **Q2 detail davomi** — retail-*/processing* katalog detail yoki
> counterparties/opportunities/products S17 CRM o'ng widget (capture kerak); (2) **F20 org-account scope bug-class** (PO +
> customer-orders detail, `/bank-accounts?organizationId=` endpoint) + related-docs populate endpoint (`GET
> /purchase-orders/:id/related`); (3) **productions first-tab** (capture kerak) + invoice-in print; (4) list/nav audit (0%).
>
> **🤖 2026-06-03b — `davom et` UCHUN ANIQ KO'RSATMA (Q2 DETAIL: invoices-out SIBLING-PARITY → 16/63 + «Главная» FIRST-TAB BUG-CLASS SWEEP 9 sahifa)**:
> `davom et` → session-start audit **GO** (3-agent: 5 commit struktura-halol, 15/63+16/56 tasdiq, 0 drift). Audit
> topgan cosmetic gap'lar avval yopildi (`e2577534`, doc-only): projects/stores audit archive-row DEFER→FIXED
> (`c2aa5722` allaqachon `common.archive`→«Поместить в архив» qilgan, ikki audit doc stale qolgan edi — sahifalar
> `tCommon('archive')` ishlatadi @132/220) + NEXT.md snapshot sarlavha 2026-06-02M→2026-06-03. (Synthesizer'ning
> `print_entity.CashIn` "undefined" da'vosi = FALSE ALARM: haqiqiy kalitlar lowercase `cashin`/`cashout` + PascalCase
> `attribute_entity.CashIn`, ikkalasi ham ru+uz'da bor; casing-konvensiya aralashtirilgan.)
> **invoices-out (16/63, `c6be3247`)**: sibling-parity vs audit qilingan invoices-in egizak (Счёт oilasi) +
> **adversarial workflow** (`scripts/wf-invoices-out-sibling-parity-audit.js`, `wf_0405b09c-30e`: diff-agent +
> first-tab bug-class agent || → har candidate delta **blind direction-aware verify**). Field-by-field diff: deyarli
> hamma divergensiya = TO'G'RI in↔out mirror (counterparty=customer, payment-in, customer-order link, sales_channel,
> email/print wiring, FSM derived states, sell-price). **2 real delta + 1 shared first-tab bug — hammasi FIXED**:
> **(D1, HIGH)** «План. дата оплаты» (paymentPlannedMoment) invoices-out'da READ-ONLY edi + PATCH'dan tushib qolgan,
> egizak invoices-in'da editable. **invoice-out backend allaqachon qabul+persist qiladi** (schema `.partial()` +
> service update path 340-344) VA invoices-out/**new** uni SET qilishga ruxsat beradi → yaratishda qo'yasan, lekin
> keyin HECH QACHON tahrirlab bo'lmaydi (ichki ziddiyat). → editable `<Input type=date>` form'ga bog'landi + payload'ga
> qo'shildi (invoices-in mirror). Blind-verify **confirmed (high)**. **(D2, LOW)** «Запросить оплату» header tugma
> invoices-out'da non-payable state'da rendered-disabled, invoices-in'da yashirin → egizakka moslandi (`!isPaid &&
> canCreatePayment &&`). **(S3, «Главная» BUG-CLASS)** `<DetailContentTabs>` birinchi tab default = «Позиции», lekin
> moysklad goods-hujjat uchun **«Главная»** ko'rsatadi — **REAL CAPTURE bilan ISBOTLANGAN** (`demands`/`supplies`
> `detail/edit-tab-main.html` = «Главная»+«Товары», «Позиции» YO'Q). `positionsLabel={tDetailTabs('main')}` **9 goods
> sahifaga** sweep qilindi: invoices-out, invoices-in, enters, losses, purchase-orders, internal-orders, inventories,
> processing-orders, processings (`scripts/wf-glavnaya-firsttab-sweep.js`, 8-agent || codemod).
> **🔑 OVER-REACH GUARD ISHLADI — `productions` DEFERRED**: blind bug-class agent topdi — uning birinchi tab'i goods
> jadval EMAS (bola processing-orders RO'YXATI + posted card) → «Позиции» noto'g'ri, lekin «Главная» ham aniq
> to'g'ri emas; production-detail capture kerak (ataylab tegilmadi). **invoices-in audit S9 «ambiguous» YOPILDI** →
> «Главная». **0 yangi i18n key** (`fields.payment_planned` + `detail_tabs.main` bor); 9 yangi `tDetailTabs('main')`
> call-site → key-existence 8017→**8026**.
> **Gates**: web tc0 · biome 0 (9 fayl) · i18n key-existence **8026** ru+uz + no-hardcoded · web **1230 pass/1 skip**
> (0 regress; DetailContentTabs default «Позиции» component-test o'zgarmadi, e2e demands/customer-orders'ni test-id
> bilan tekshiradi). **HALOL**: browser-smoke YO'Q (invoices-out demo-bo'sh; paymentPlanned = isbotlangan invoices-in
> field'ining typed mirror'i, bir xil endpoint+schema+service; «Главная» = sibling'larda isbotlangan value-only key).
> Audit doc: `docs/audits/invoices-out-detail.audit.md` + invoices-in S9 yopildi.
> **⭐ KEYINGI VARIANTLARI** (birinchisi tavsiya): (1) **Q2 detail davomi sibling-parity** — keyingi tabiiy nishon:
> **purchase-orders vs customer-orders** (egizak, allaqachon «Главная» oldi — qolgan dimensiyalar) yoki retail-*/
> processing* katalog detail; (2) **productions first-tab + counterparties/opportunities/products S17 CRM o'ng widget**
> (capture kerak); (3) list/nav audit (0%); (4) follow-up: invoices-out detail-header capture (D2 show-disabled vs
> hide tasdiq) + invoice-in print sahifa + return create-menu capture.
>
> **🤖 2026-06-03 — `davom et` UCHUN ANIQ KO'RSATMA (SESSION-START GAP-CLOSE + Q2 DETAIL AUDIT: sales-returns + purchase-returns SIBLING-PARITY → 15/63)**:
> `davom et` → session-start audit **GO** (3-agent: 5 commit struktura-halol, 13/63 detail + 16/56 list raqamlari tasdiq,
> #20/Задачи/Создать sweeplari grep-isbotlangan, 0 «talk-vs-done» drift). Audit topgan cosmetic gap'lar avval yopildi
> (`af984720`): **(1) #20 deferred-tail Latin PKO/RKO qoldig'i** — sweep-8 (`df9017da`) Cyrillic ПКО/РКО→«Kirim/Chiqim
> order» qildi, lekin grep gate Cyrillic-only edi → 6 ta Latin «PKO»/«RKO» uz.json'da qoldi (detail_titles.cash_in/out
> «Kassa kirim (PKO)» — egizagi 3484-satr allaqachon «(Kirim order)» edi · print_entity.cashin/out · attribute_entity.
> CashIn/Out) → hammasi «Kirim order»/«Chiqim order»ga (RU anchor ПКО/РКО tegilmadi); #20 «0 deferred» da'vosi endi haqiqiy.
> **(2) NEXT.md staleness**: backlog #15 ✅ marker yo'q edi (9d4dd1d3 yopgan) + sana sarlavhalar 2026-06-01→2026-06-02M.
> **i18n workstream TO'LIQ yopilgani uchun Q2 detail audit davom etdi (13→15/63) sibling-parity bilan.**
> **🔴 sibling-parity audit workflow** (`scripts/wf-returns-sibling-parity-audit.js`, `wf_a6f943b0-216`, 8-agent):
> har return modulni audit qilingan egizagiga qarab field-by-field diff qildi + har real_delta/uncertain'ni **blind
> verifier** mustaqil qayta-aniqladi (direction-aware).
> **sales-returns (14/63, vs demands)** — 2 confirmed delta tuzatildi: **S1** Tab-1 «Позиции»→«Главная» (`positionsLabel=
> {tDetailTabs('main')}` qo'shildi — egizak demands S1 fix'i, lekin return modullarda qoldirilgan edi; HIGH) · **I6/print**
> `onPrintList` `/print/sales-return/` ochardi lekin **route YO'Q edi → 404**; egizak `/print/demand/` ishlaydi →
> `print/sales-return/[id]/page.tsx` yaratildi (demand print sahifasining mirror'i) + `pages.print.doc_title.sales_return`
> (ru+uz). **purchase-returns (15/63, vs supplies)** — 1 confirmed delta: **S1** xuddi shu positionsLabel fix (HIGH).
> **🔑 ADVERSARIAL CATCH — customs REFUTED**: diff-agent «sales-returns customs bor → purchase-returns'da ham bo'lishi
> kerak» deb taxmin qildi, lekin blind verify moysklad O'Z API doc'ini (`_purchase_return.md` pozitsiya atribut jadvali)
> tekshirdi → Возврат поставщику pozitsiyalarida gtd/country **YO'Q** (sales_return'da BOR). ГТД/Страна tovar omborga
> KIRGANDA (Приёмка) yoki mijoz qaytarganda (sales-return) yuritiladi; purchase-return tovarni ta'minlovchiga QAYTARADI →
> per-line customs yo'q. Bizning kod+backend to'g'ri → **fix kerak emas** (inverse-direction xato oldini olindi).
> **DEFERRED — needs_capture**: ikkala return'ning «Создать документ» menyusi yo'q (egizak demand=6/supply=7 item, lekin
> bu FORWARD yo'nalish — return ularning *bolasi*; teskari item-set route-walled, capture'siz aniqlab bo'lmaydi — ATAYIN
> invent qilinmadi). purchase-returns base «Печать» (route+button) = follow-up feature (confirmed bug emas).
> **Gates**: web tc0 · biome 0 (3 fayl) · i18n key-existence **8017** ru+uz + no-hardcoded · web **1230 pass/1 skip** (0 regress).
> **HALOL**: yangi print sahifa browser-smoke YO'Q (proven demand-print mirror'i; data-contract egizak endpoint consumer'i
> bilan tasdiqlangan; sales-returns demo-bo'sh → navigate qiladigan seed yo'q). Audit doc: `docs/audits/sales-returns-detail.audit.md`
> + `docs/audits/purchase-returns-detail.audit.md`.
> **⭐ KEYINGI VARIANTLARI** (birinchisi tavsiya): (1) ✅ **BAJARILDI `c6be3247` (invoices-out, 16/63) + `c6bf7673`
> (purchase-orders, 17/63) — eski tavsiya, e'tiborga olinmasin; eng yuqori entry ustun**: ~~invoices-out vs invoices-in
> (egizak, Счёт oilasi)~~ yoki retail-* / processing* katalog detail; (2)
> **counterparties/opportunities/products S17 CRM o'ng widget** (katta structural); (3) list-page yoki nav-graph audit (0%);
> (4) follow-up: return create-menu'lar uchun clean capture (route-wall yechilsa) + purchase-returns base print sahifa.
>
> **🤖 2026-06-02M — `davom et` UCHUN ANIQ KO'RSATMA (Q2 DETAIL AUDIT DAVOM: invoices-in + «Создать документ» LABEL BUG-CLASS SWEEP)**:
> `davom et` → session-start audit **GO** (3-agent: 5 commit struktura-halol, 0 «talk-vs-done» gap; barcha da'volar live-run
> bilan VERIFIED. Audit topgan stale gaps: progress.json ~4soat eskirgan (pre-commit hook 5 commit'ni o'tkazib yuborgan,
> lekin 12/63 detail count to'g'ri qolgan) + NEXT.md status-table 11/63 — ikkalasi ham tuzatildi: NEXT.md 4 satr 12/63'ga,
> `pnpm progress` qayta yaratildi). **i18n workstream TO'LIQ yopilgani uchun Q2 detail audit davom etdi (12→13/63).**
> **invoices-in (13/63, sibling-parity)**: invoices-in DETAIL capture YO'Q (route-wall) → **hybrid reference**: (a) in↔out
> egizak `invoices-out/[id]` (Счёт oilasi: supplier↔customer, payment-out↔payment-in, PO↔customer-order) + (b) audit
> qilingan `supplies/[id]` (REAL capture, shared scaffolding + «Создать» konvensiyasi). Field-by-field diff → faqat **1 real
> delta**: **«Создать документ» menu item `tCreate('cash_in')`=«Приходные ордеры» (incoming, plural) edi, lekin action
> payment-OUT yaratadi** (`/payments-out/from-invoice-in/`) → noto'g'ri yo'nalish + noto'g'ri namespace → tuzatildi
> `tDetailTitles('payment_out')`=«Исходящий платёж». Qolgan hammasi (supplier label, payment-tracking, FSM/tone, Задачи,
> email-yo'qligi) TO'G'RI (doc-type'ga mos / egizak/supplies konvensiyasiga mos). DEFERRED: «Печать» (`/print/invoice-in`
> route YO'Q) + «Создать» menu kengaytirish (backend).
> **🔴 «Создать документ» LABEL BUG-CLASS (6-sahifa sweep, capture-grounded)**: invoices-in topilmasi sinfni ochdi —
> ba'zi DETAIL sahifa «Создать» menyulari **list-page** `create_related.*` namespace'ini (PLURAL list-title, ba'zan
> noto'g'ri referent) ishlatardi, **detail-page** `detail_titles.*` (SINGULAR doc nomi) o'rniga. **Root-cause REAL capture
> bilan tasdiqlandi**: `create-related-dropdown.tsx` (demand LIST) o'z capture'ini (`i-dropdown-sozdat.dom.html`) keltiradi
> → list = PLURAL «Приходные ордеры»/«Входящие платежи» (TO'G'RI, tegilmadi); demands/supplies DETAIL captures
> (`edit-dropdown-sozdat.png`) = SINGULAR «Входящий платёж»/«Отгрузка». Ikki surface, ikki namespace. **6 detail sahifa
> tuzatildi** (9 item): invoices-in payment-out · purchase-orders ×3 (invoice-in «Отгрузки»→«Счёт поставщика» HIGH ·
> payment-out «Приходные ордеры»→«Исходящий платёж» HIGH · supply «Снабжение»→«Приёмка» MED) · internal-orders move
> (hardcoded uz `"Ombor o'tkazish"`→«Перемещение» HIGH) · customer-orders ×2 + invoices-out ×1 + counterparties ×1
> (plural→singular LOW). Hammasi pure call-site key-swap (yangi key YO'Q — barcha detail_titles ru+uz mavjud); 5 sahifadan
> ishlatilmagan `tCreate` hook olib tashlandi. **6-agent verification workflow** (`create-menu-label-verify`) har topilmani
> MUSTAQIL qayta-aniqladi (blind) + singular konvensiya REAL capture bilan grounded.
> **Gates**: web tc0 · biome 0 (6 fayl) · web **1230 pass/1 skip** · i18n key-existence **8015** ru+uz + no-hardcoded.
> **HALOL**: browser-smoke YO'Q (value-only i18n key-swap, isbotlangan supplies/demands keylariga; 0 yangi key, 0 logic).
> Audit doc: `docs/audits/invoices-in-detail.audit.md` (hybrid sibling-parity + «Создать» bug-class jadvali).
> **⭐ KEYINGI VARIANTLARI** (birinchisi tavsiya): (1) **Q2 detail audit davomi sibling-parity bilan** — keyingi tabiiy
> nishon: **sales-returns vs demands** yoki **purchase-returns vs purchase-orders** (har biri audit qilingan egizagiga +
> uning referensiga qarab; «Задачи» + «Создать» label allaqachon to'g'ri, qolgan dimensiyalarni tekshir); (2)
> **counterparties/opportunities/products S17 CRM o'ng widget** (katta structural); (3) list-page yoki nav-graph audit (0%);
> (4) DEFERRED follow-up: invoices-out S4 (План. дата оплаты read-only — invoices-in'da editable, moysklad'da editable
> bo'lishi kerak) + `/print/invoice-in` print-template.
>
> **🤖 2026-06-02L — `davom et` UCHUN ANIQ KO'RSATMA (Q2 DETAIL AUDIT QAYTA BOSHLANDI: cash-out + «Задачи» BUG-CLASS SWEEP)**:
> `davom et` → session-start audit **GO** (3-agent: 5 commit struktura-halol, progress.json FRESH, 0 «talk-vs-done» gap;
> 3 stale-label topdi → `57caae95` bilan yopildi: products/counterparties audit #9 archive-label DEFERRED→FIXED
> `c2aa5722`, NEXT.md session-j RU-anchor DEFERRED→YOPILDI `2aaceba0` — barchasi git+render bilan trust-but-verify).
> **i18n workstream TO'LIQ yopilgani uchun Q2 detail audit qayta boshlandi** (11/63 dan, pauzadan).
> **🔴 BLOKER yechimi (capture-wall)**: 52 ta audit qilinmagan detail sahifaning HECH BIRIDA ishlatiladigan moysklad
> capture YO'Q (invoices-out/detail/ bo'sh; faqat 11 audit qilingan modulning referensi bor; fresh capture =
> route-wall/demo-empty — shu thread'ni pauza qilgan sabab). **Yechim = sibling-parity audit**: audit qilinmagan
> sahifani (a) audit qilingan egizagi (REAL moysklad referensi bor) + (b) egizakning isbotlangan implementatsiyasiga
> qarab tekshir (in↔out yo'nalish farqini hisobga olib). Bu Q2 davomi — fresh capture o'rniga egizak referensi.
> **cash-out (12/63, sibling-parity vs cash-in)**: normalized byte-diff (`in↔out`/`CashIn↔CashOut`/`invoiceOut↔invoiceIn`)
> → faqat 2 divergensiya: (1) `targetKind:'invoicein'` = TO'G'RI (РКО supplier invoice = invoices-in to'laydi); (2)
> **`<DocumentTasksSection>` YETISHMASDI** (cash-in S2'da qo'shilgan «Задачи» bo'limi, cash-out olmagan) = REAL delta.
> Qolgan hammasi (counterparty-label `tFields('agent')`, allocation i18n, FSM, picker, balance) allaqachon to'g'ri —
> cash-in bug-class sweeplari cash-out'ga yetib bo'lgan. **2 shubha REFUTED**: `select_payer_first` KEY nomi "payer"
> lekin QIYMATI «Сначала выберите контрагента» (РКО uchun ham to'g'ri, render'da ko'rinadi) → bug emas.
> **🔴 «Задачи» BUG-CLASS SWEEP (whitelist-grounded)**: cash-out topilmasi butun sinfni ochdi —
> `TASK_ENTITY_WHITELIST` (kod'ning O'Z kontrakti, 19 entity) tasks qo'llab-quvvatlaydi, lekin faqat 7 sahifada
> `DocumentTasksSection` bor edi. **9 hujjat-tipidagi sahifaga qo'shildi** (cash-out + payments-out qo'lda; invoices-out/
> invoices-in/sales-returns/purchase-returns/losses/enters/inventories = workflow codemod, 7-agent parallel,
> deterministik import+mt-6 Задачи bloki AttributesEditor oldidan, demands/[id]:1022 naqshi). **Endi 16/19 whitelist
> entity'da inline bo'lim bor.** DEFERRED (whitelist-bor lekin CRM/katalog layout, oddiy inline emas): counterparties
> (S17 o'ng CRM widget'ga tegishli, "high" structural) · opportunities · products — S17 widget ishiga qoldi. Whitelist'da
> YO'Q (internal-orders/prepayments/processings/...) = ataylab scope tashqarisida (kod kontrakti tasks bermaydi).
> **Gates**: web tc0 · biome 0 (9 fayl) · web **1230 pass/1 skip** · i18n key-existence **8014** ru+uz + no-hardcoded.
> **HALOL**: browser-smoke YO'Q (additive — 7 sahifada isbotlangan komponent, server-whitelisted; yangi i18n key yo'q).
> Audit doc: `docs/audits/cash-out-detail.audit.md` (sibling-parity method + «Задачи» bug-class jadvali).
> **⭐ KEYINGI VARIANTLARI** (birinchisi tavsiya): (1) **Q2 detail audit davomi sibling-parity bilan** — keyingi tabiiy
> nishon: **invoices-in vs supplies** yoki **sales-returns vs demands** yoki **purchase-returns vs purchase-orders**
> (har biri audit qilingan egizagiga + uning referensiga qarab; «Задачи» allaqachon qo'shilgan, qolgan dimensiyalarni
> tekshir); (2) **counterparties/opportunities/products S17 CRM o'ng widget** (Задачи/События/Документы/Показатели —
> katta structural); (3) list-page yoki nav-graph audit (0%).
>
> **🤖 2026-06-02k — `davom et` UCHUN ANIQ KO'RSATMA (#20 UZ-CANONICALIZATION — TO'LIQ LITERARY, 7 SWEEP TUGADI)**:
> Foydalanuvchi `davom et` (×2) + "o'zing chuqur tahlil qilib eng professional qilib qil" dedi → #20 ni avtonom
> bajardim. **5-agentli research workflow** (`scripts/wf-uz-terminology-policy.js`: e-invoicing/soliq.uz+didox+faktura.uz ·
> 1C UZ lokalizatsiya · til-registri · codebase inventory → Opus sintez) **qat'iy xulosa**: professional o'zbek =
> **literary/kalka, transliteratsiya EMAS** — eng kuchli dalil **klonlanayotgan mahsulotning O'Z UZ UI'si** (moysklad.uz/uz,
> support.moysklad.ru/hc/uz) + lex.uz farmonlari. Foydalanuvchi tasdiqladi → **glossary** `docs/i18n-uz-terminology.md`
> (canonical) yozildi (`01bf6306`). So'ng **7 sweep** (har biri uz-only, RU anchor BYTE-O'ZGARMAGAN, riskli'larda 3-lens
> adversarial verify PASS):
> 1. `1212c4dc` schyot-faktura→**hisobvaraq-faktura** (21, lex.uz statutory) · 2. `eb3a8c3c` spisaniye→**hisobdan
> chiqarish** + oprixodovaniye→**kirim** (22) · 3. `5a092316` provedeno→**o'tkazish/o'tkazilgan** (69, role-aware:
> verb/state/activity/sentence; #20 «Provedeno» YOPILDI) · 4. `3834f59f` **schyot→hisobvaraq** (71, q→g' morfologiya;
> 🔴 **#19 ni BEKOR QILDI** — schyot manba-mahsulotga zid edi; referent-guard: hisob=account tegilmadi) · 5. `0c045638`
> otgruzka→**jo'natma** (28) + delivery_planned 3-referent drift (jo'natish/yetkazib berish/chiqarish) · 6+7. `2fcc1fa5`
> residual translit: Priyomka→**Qabul** · Peremeshcheniye→**Ko'chirish** · Zakaz→**Buyurtma** · standalone Faktura(RU=Счёт)→
> **Hisobvaraq** · Otkazma→**Jo'natma** · prixodnaya/rashodnaya→**Kirim/Chiqim yuk xati**.
> **Gates har commit**: web tc0 · biome 0 · web **1230 pass/1 skip** · key-existence 8014 ru+uz + no-hardcoded · grep0
> residual · 3-lens PASS (sweep 3/4/5/7). **HALOL**: browser-smoke YO'Q (uz-only value i18n, ~280 string).
> **⚠️ #19 REVERSAL ESLATMA (drift EMAS)**: `schyot→hisobvaraq` ataylab #19 (`1a38d036`) ni bekor qildi — research +
> moysklad.uz UZ dalili asosida, foydalanuvchi tasdig'i bilan. session-start audit buni "reg'­ression/drift" deb
> belgilamasin — bu **qaror bilan reversal** (glossary §Evidence).
> **✅ DEFERRED-TAIL HAM TUGADI** (foydalanuvchi "eng professional usul" dedi → ikkalasi bajarildi):
> **Sweep 8** `df9017da` ПКО/РКО→**Kirim/Chiqim order** (10; Cyrillic Latin-locale'dan olib tashlandi, nav bilan mos);
> **Sweep 9** `d603e98e` **mijoz↔xaridor referent split** (3-lens PASS): hujjat «Покупатель»→**xaridor** (69), CRM
> «Клиент»→**mijoz** qoldi (14), retail «Контрагент»→**Kontragent** (1); moysklad.uz («sotuvchi↔xaridor» hisobvaraqda,
> mijoz CRM'da) bilan mos. **#20 endi 100% TUGADI — deferred yo'q** (qolgan 14 mijoz = haqiqiy Клиент/CRM, to'g'ri).
> **⭐ KEYINGI VARIANTLARI**: (1) **Q2 detail audit davomi** (11/63, pauzadan — asosiy uzun thread); (2) list-page /
> nav-graph audit (0%); (3) `pnpm audit:module` bilan modul-audit. (i18n workstream — money→…→production conveyor +
> cleanup #15-19 + #20 canonicalization — TO'LIQ yopildi.)

> **🤖 2026-06-02j — `davom et` UCHUN ANIQ KO'RSATMA (SESSION-START AUDIT GAP-CLOSE + «schyot» BUG-CLASS SWEEP)**:
> `davom et` → session-start audit **GO** (3-agent, 4 result fayl: 5 commit struktura-halol, progress.json FRESH
> ~10 daqiqa, NEXT.md/MEMORY.md 0 drift). Audit 3 ta kichik gap topdi → hammasi 1 commit'da yopildi (`00acd8a9`):
> **(1) #19 «schyot» bug-class sweep** (UZ-only, RU=«Счёт» tasdiqlangan — RU tegilmadi, style o'zgarmadi): 7 kalit
> invoices-out «Счёт»ни «Hisob-faktura» (=«Счёт-фактура»=factures, BOSHQA hujjat!) deb yozardi → «schyot»ga tuzatildi:
> email_template subject_invoice/body_invoice (audit flagged) · 2 report col_invoiced (supplier «Счёт» + stats
> «Выставлено счетов») · invoices-out applicable_help · 2 notif (invoice_paid/invoice_overdue). Haqiqiy ЭСФ/factures
> (soliq_bot, facture_out/in, factures nav, generate, mxik/mfo) TEGILMADI. **Saboq: noto'g'ri UZ HAM «Hisob-faktura»
> (proper-Uz) HAM «Schyot-faktura» (transliteratsiya) ko'rinishida edi — reverse RU-sweep («Счёт-фактура» ru.json'da)
> transliteratsiya formani topdi, `[Hh]isob-faktura` grep o'zi o'tkazib yuborardi.** **(2) modals-i18n-audit.md:98**
> customer-orders ◑ partial → ✅ (#18 `e169f3f` yopgan edi, jadval stale — audit freshness agent topdi).
> **(3) progress-report.ts** `actual_routes_in_app`(57) vs `total_target`(56) izohlandi — ikkalasi boshqa narsani
> o'lchaydi (57=barcha top-level route incl. ~13 dashboard/settings/landing; 56=moysklad list-page parity; phase2_pct
> to'g'ri 56'ni ishlatadi). Comment-only, raqam o'zgarmadi.
> Gates: web tc0 · biome 0 · web **1230 pass/1 skip** · key-existence **8014** ru+uz + no-hardcoded · concrete next-intl
> render check (use-intl@4.9.1 prod dist, Windows'da file:// URL: uz subject="Schyot {name}", body raw toza `<p>`; ru
> anchor o'zgarmadi). **HALOL**: browser-smoke YO'Q (additive value-only i18n).
> **✅ #20 RU-anchor bug — YOPILDI `2aaceba0` (2026-06-02 18:55, user-approved)** _(eski «DEFERRED» status; session-start
> audit 2026-06-02k stale-label topdi → bu yerda yopildi deb belgilandi)_: both-locale referent-correctness fix —
> (i) `command-palette` create_invoice `/invoices-out/new`ga boradi (=«Счёт») lekin «счёт-фактура»/«hisob-faktura» deb
> belgilardi → RU «Новый счёт», UZ «Yangi schyot»; (ii) to'lov-taqsimlash `alloc_col_invoice`/`select_invoice`/
> `invoice_picker_title` 3 namespace (payments-in/cash_in/cash_out) «Счёт-фактура»/«Schyot-faktura» → «Счёт»/«Schyot»
> (taqsimlash «Счёт»ga; qo'shni allocation_title/add_invoice tasdiqladi). Haqiqiy factures kalitlari (facture_out/in,
> generate) TEGILMADI. _(Bu deliberate RU-anchor correctness fix — 9 uz-only sweep'ning «RU BYTE-O'ZGARMAGAN» da'vosi
> SHU commit'ga taalluqli emas; alohida, user-approved RU tuzatish.)_
> **⭐ KEYINGI VARIANTLARI** (o'zgarmadi, birinchisi tavsiya): (1) **Q2 detail audit davomi** (11/63, ko'p modul
> route-walled/demo-empty); (2) **#20 UZ-canonicalization** (foydalanuvchi qaror: schyot↔hisob global · mijoz↔xaridor ·
> отгрузка root · + yuqoridagi 2 RU-anchor correctness bug · «Provedeno» ~91); (3) list/nav audit (0%).

> **🤖 2026-06-02i — `davom et` UCHUN ANIQ KO'RSATMA (i18n CLEANUP TAIL #17 + #18 + #19 TUGADI)**: `davom et` →
> session-start audit **GO** (3-agent: 5 commit struktura-halol, progress.json commit'dan 18 daqiqa yangi, NEXT.md/
> MEMORY.md raqamlari mos, 0 drift; tavsiya = #17 ni birinchi tekshir). i18n conveyor 99% tugagani uchun cleanup
> tail to'liq yopildi (3 commit):
> **#17 payrolls** (`6e9d2670`, /new + [id]): HR hujjat formasi yarim-hardcoded edi (label/placeholder/error throw/
> create-CashOut menu/Bekor tugma/«Posted at» ENG/«Tavsif»/«Izoh»). /new STATUS_OPTIONS modul-const'dan komponentga
> ko'chirilib `tStates('payroll')`ga ulandi (oldin 'Qoralama'/'Provedeno'/'Bekor qilindi' hardcoded — RU locale'da
> ham UZ-latin ko'rinardi); org/emp → `tForm.select_*`+picker_title; documentTypeLabel→`tDetailTitles`; role→
> `tDetailHeader.role_primary`; comment→`tFields('description')`. 10 yangi `pages.payroll` kalit (ru+uz, jumladan
> `cashout_description` {name}/{employee} interp). payrolls DONE_ROUTES'ga qo'shildi. **3-lens 0 BLOKER**.
> **#18 customer-orders** (`e169f3f`, /new + [id]): sales guruhiga KIRMAGAN edi → currency option/rate-aria/related
> tab+empty/documentTypeLabel/applicableHelp/createLabel×3/setError×2 hardcoded. Currency → shared `tForm.currency_*`
> (sales naqsh), [id] option-tartibi UZS/USD/**RUB/EUR**→**EUR/RUB** (moysklad parity, 3-lens topdi). 4 yangi
> `pages.customer_orders` kalit. customer-orders DONE_ROUTES'ga. **🔴 3-lens 2 BLOKER topdi (gate KO'RMAYDI —
> «Asosiy» marker emas, Cyrillic emas)**: `label: 'Asosiy'` (main tab)→`tDetailTabs('main')` + `user.position ??
> 'Asosiy'` (role)→`tDetailHeader('role_primary')`. «yashil gate ≠ ishlaydi» yana tasdiqlandi.
> **#19 invoices-out UZ title** (`1a38d036`): `detail_titles.invoice_out` uz «Mijozga hisob-faktura» → «Mijozga
> schyot» (15+ joy «schyot», bu yagona outlier; «hisob-faktura»=«Счёт-фактура»=factures uchun, invoices-out=«Счёт»
> uchun noto'g'ri edi). RU «Счёт покупателю» o'zgarmadi. **detail_titles endi create_related bilan mos**.
> Gates har commit: web tc0 · biome 0 err (payrolls 4 pre-existing nursery warn, men 0 qo'shdim) · web **1230 pass/
> 1 skip** · key-existence **8012** ru+uz + no-hardcoded (payrolls+customer-orders DONE_ROUTES, 0 leak) · concrete
> next-intl render-check OK · **3-lens adversarial verify** (har modul). **HALOL**: browser-smoke YO'Q (additive i18n).
> **🆕 backlog #20 (DEFERRED, «Provedeno»-sinf — foydalanuvchi qarori)**: customer-orders 3-lens Lens-3 topgan keng
> UZ-term canonicalization: (a) **schyot↔hisob** global («Счёт» transliteratsiya vs proper-Uzbek); (b) **mijoz↔xaridor**
> («Покупатель» — fields.customer=«Mijoz» vs form.select_customer_first=«xaridor»); (c) **отгрузка root** (jo'natish/
> yuborish/yuk berish 3 xil); (d) **customer↔agent maydon-label** (/new=«Покупатель» vs [id]=«Контрагент» — moysklad
> screenshot tasdiq kerak); (e) **delivery_planned** key-drift (/new `fields.delivery_planned` vs [id] `detail_form.
> delivery_planned`, RU/UZ farq — moysklad=«План. дата отгрузки»=[id]). Bular email_template invoice + col_invoiced
> «Hisob-faktura» bilan birga bitta deliberate UZ-canonicalization pass'da hal qilinsin (≈«Provedeno» ~91 joy bilan birga).
> **⭐ KEYINGI VARIANTLARI** (birinchisi tavsiya): (1) **Q2 detail audit davomi** (11/63, pauzadan); (2) **#20 UZ-term
> canonicalization** (foydalanuvchi schyot/hisob, mijoz/xaridor, отгрузка root bo'yicha qaror bersa — keyin sweep);
> (3) list-page yoki nav-graph audit (0%).

> **🤖 2026-06-02h — `davom et` UCHUN ANIQ KO'RSATMA (i18n CLEANUP SWEEPS #15 + #16 TUGADI)**: `davom et` →
> session-start audit **GO** (5 production commit struktura-halol, progress.json `pnpm progress` bilan mos, 0 drift;
> 2 stale NEXT.md passage shu commit'da tuzatildi). Conveyor tugagach i18n cleanup tail = ikki sweep yopildi:
> **#15 comment-label**: 3 hujjat `[id]` `<DocumentMetaField>` komment maydoni `tCommon('description')`=«Описание»
> → `tFields('description')`=«Комментарий» (moysklad-kanonik; 37 egizak sahifa shu naqshda): **invoices-in/[id] ·
> purchase-orders/[id] · payrolls/[id]**. (payroll = moysklad hujjati → «Комментарий» to'g'ri, adversarial tasdiqladi.)
> FormField/FormSection CRM-entity tavsiflar (calls/contact-persons/opportunities/tasks) ATAYIN «Описание» qoldirildi
> (hujjat-komment emas — soxta parity yo'q).
> **#16 email-template i18n**: yangi shared `email_template` ns (ru+uz, 6 kalit — subject_{order,shipment,invoice} `{name}`
> interp + body_{order,shipment,invoice}); SendEmailDialog 3 sahifada wire: **customer-orders/[id] · demands/[id] ·
> invoices-out/[id]**. RU byte-exact parity (anchor), UZ yangi. **🔴 KRITIK CATCH (concrete next-intl render check —
> BARCHA mexanik gate yashil edi)**: `t('body_*')` `<p>` ni ICU rich-text tag deb parse qiladi → FORMATTING_ERROR,
> prod'da kalit-yo'lni qaytaradi (buzilgan UI). Fix: body uchun **`t.raw()`** (subject `t(...,{name})` qoladi). Saboq:
> «yashil gate ≠ ishlaydi» — i18n forma o'zgarsa, real render'ni node-da tekshir. i18n-no-hardcoded `EMAIL_TEMPLATE_PROP`
> exclusion OLIB TASHLANDI (endi enforced) + `email_template` key-existence guard qo'shildi (t.raw static scanner'ga kirmaydi).
> Gates: web tc0 · biome (faqat 2 pre-existing payrolls nursery warn) · key-existence **7967** ru+uz + guard · no-hardcoded ·
> web **1229 pass/1 skip** · concrete render OK · **3-lens adversarial verify 0 BLOKER** (Lens A clean; B/C warnings-only).
> **backlog #15 + #16 CLOSED.** Adversarial topgan YANGI backlog (scope-tashqari): **#17** payrolls/[id]+/new chala i18n
> («Posted at» ENG label + hardcoded `placeholder="Izoh"`); **#18** customer-orders/[id] qolgan hardcoded RU (DONE_ROUTES'da
> emas → gate ko'rmaydi); **#19** «schyot» vs «hisob-faktura» UZ term-unifikatsiya (create_related vs detail_titles).
> **⭐ KEYINGI VARIANTLARI** (birinchisi tavsiya): (1) **Q2 detail audit davomi** (11/63, pauzadan); (2) qolgan i18n
> cleanup (#17/#18/#19 yuqorida yoki «Provedeno» ~91 joy transliteratsiya); (3) list-page yoki nav-graph audit (0%).

> **🤖 2026-06-02g — `davom et` UCHUN ANIQ KO'RSATMA (DOCUMENT-FORM i18n CONVEYOR TUGADI)**: `davom et` →
> session-start audit **NO-GO** (2 teshik avval yopildi: (1) MEMORY.md 35.5KB>24.4KB limit → index entry'lar
> bir-qatorli siqildi 12.8KB, 2026-06-02 ning 6 sessiyasi endi yuklanadi; (2) NEXT.md «work-orders'da /new yo'q»
> YOLG'ON da'vo → `production/work-orders/new` 355 satr MAVJUD, tuzatildi). So'ng **butun production guruhi tugadi**
> (4 modul × `/new`+`[id]`, 4 commit): **processings `c5598a34` · processing-orders `6380f832` · productions/[id]
> `92255228` · production/work-orders `e64833ac`**. Har `/new` o'z `[id]` egizagini mirror qildi (productions/new
> oldindan tayyor reference edi); work-orders/new 100% hardcoded edi (4-state FSM, material/output jadvallar).
> **🔴 3-lens adversarial verify har modulda REAL defekt topdi** (mexanik grep+key-existence ko'rmadi):
> work-orders/new planned-qty `tFields('quantity')`=«Кол-во» (BLOCKER, generic) → `t('planned_qty')`=«Плановое
> количество»; productions `col_orders` UZ «Buyruqlar»(=buyruqlar)→«Buyurtmalar»; + UZ inglizcha-leak tuzatishlar
> («BOM»→Texkarta, «Output»→Chiqish/Mahsulot, «Stock»→ombor, «Cost»→tannarx) + picker-title/external_code izchillik.
> **backlog #14 TO'LIQ YOPILDI** (detail_titles.processing/processing_order/work_order qo'shildi). Gates har commit:
> web tc0 · biome 0 · web **1229 pass/1 skip** · i18n key-existence ru+uz · no-hardcoded (4 route registry'da) · grep 0.
> **HALOL**: browser-smoke YO'Q (additive i18n). Tafsilot: `docs/audits/modals-i18n-audit.md` §C «Done — production group».
>
> **✅ BUTUN DOCUMENT-FORM i18n CONVEYOR TUGADI**: money→sales→purchase→inventory→production (5 guruh, har biri
> `/new`+`[id]`). Modal audit (2026-06-02) topgan DOMINANT topilma (~400 hardcoded string) endi to'liq yopilgan.
>
> **⭐ KEYINGI VARIANTLARI** (foydalanuvchi tanlasin yoki avtonom davom etsa — birinchisi tavsiya):
> 1. **Q2 detail-page audit'ni DAVOM ETTIRISH** (asosiy uzun thread, i18n conveyor uchun pauza qilingan edi —
>    **11/63 audited**). Naqsh: `scripts/wf-<module>-detail-audit.js` 6-dim + Opus judge + fix + verify. Keyingi
>    audit = qolgan seed-bor yoki katalog detail (lekin ko'p modul demo-bo'sh/route-walled — `[[session-2026-06-01-q2-payments-in-detail]]`).
> 2. **i18n cleanup sweeps** (kichik, aniq, endi yaxshi tushunilgan): backlog **#15** («Комментарий» vs «Описание»
>    comment-label cross-group sweep — purchase-orders/[id], invoices-in/[id] hali `tCommon('description')`),
>    backlog **#16** (email-template `defaultSubject`/`defaultBodyHtml` hardcoded RU — i18n-no-hardcoded'da excluded),
>    «Provedeno» project-wide transliteratsiya konvensiyasi (~66 joy — alohida qaror).
> 3. **list-page yoki navigation-graph audit** (0% workstream'lar).

> **🤖 2026-06-02f — `davom et` UCHUN ANIQ KO'RSATMA (i18n AVTOMATLASHTIRILDI)**: Keyingi vazifa = **production
> guruhi document-form i18n**, va u endi **avtomatlashtirilgan toolkit bilan** qilinadi (qurildi 2026-06-02:
> `b328f5a1`/`65fc81b0`/`e352aae6`; tafsilot = `[[i18n-automation-toolkit]]` memory + `docs/superpowers/specs/2026-06-02-i18n-automation-design.md`).
> **MAJBURIY jarayon har forma uchun**:
> 1. `pnpm i18n:wire <route>` — codemod mexanik 75%ni qiladi, RESIDUE ro'yxat beradi. Route arg = papka yo'li
>    (`processings`, `processing-orders`, `productions`, `production/work-orders` — codemod nested yo'lni qo'llaydi).
>    Holat: productions/new ✅ TUGADI `e352aae6`; processings/new + processing-orders/new = QISMAN (2 hook + bir nechta
>    hardcoded Kiril prop qoldi → codemod tugatadi); **production/work-orders/new = 0% i18n (355 satr, 0 useTranslations)**.
> 2. RESIDUE'ni qo'lda hal qil (forma-spetsifik 25% — domen label, throw). **Codemod Uzbek-latin residue'ni
>    to'liq ko'rsatmaydi → formani qo'lda ham o'qi.**
> 3. `pnpm i18n:gate` (2 doimiy Vitest gate: key-existence 7775 kalit + no-hardcoded) — yashil bo'lsin.
> 4. `Workflow({scriptPath:<persisted i18n-group-verify copy>, args:{forms:['<route>']}})` — 3-lens adversarial
>    (DIQQAT: `{name:...}` args'ni o'tkazmaydi — `{scriptPath, args}` ishlat).
> 5. Topilmalarni qo'lla → commit + doc.
> **🔴 PRODUCTION GURUHI = KATTAROQ**: money/sales/purchase/inventory'dan farqli, production'da `[id]` formalar HAM
> i18n qilinmagan (codemod faqat `/new`). Ya'ni har modul = `/new` (codemod) + `[id]` (qo'lda). **4 MODUL** (har biri
> /new + [id]): processings · processing-orders · productions (`/new` ✅, `[id]` HALI hardcoded — 10+ Kiril label) ·
> **production/work-orders** (route `production/work-orders`, NESTED; `/new` 0% i18n + `[id]` qisman). _(eski «work-orders'da
> /new yo'q» YOLG'ON edi — 2026-06-02 session-start audit tuzatdi: `production/work-orders/new/page.tsx` 355 satr MAVJUD.)_
> Tartib: processings → processing-orders → productions/[id] → production/work-orders. Tugagach: no-hardcoded registry'ga
> route qo'sh (BOTH /new+[id] done bo'lsa). backlog #14 (processings/processing-orders `[id]` titlePrefix) shu batch bilan.
> _(Toolkit'ni `/[id]` formalarga ham kengaytirish ixtiyoriy enhancement — production'ni yanada tezlashtirardi.)_

> **2026-06-02e (document-form i18n — INVENTORY GURUHI TUGADI)**: `davom et` (sessiya davomi, oldingi
> purchase commit'dan keyin toza tree) → DOMINANT workstream davom etdi va **butun inventory guruhi tugadi**:
> **moves · losses · enters · inventories · internal-orders** (5 ta `/new`). To'rt hujjat-uslubidagi `[id]`
> egizak toza edi; faqat **internal-orders/[id]** hardcoded `titlePrefix="Ichki buyurtma"` bor edi (backlog
> #14) → `tDetailTitles('internal_order')`ga tuzatildi (+ yetishmagan hook). **moves/new** qo'lda oltin-reference
> (2-ombor `store_from`/`store_to`); **inventories/new** (surplus/shortage sanoq jadvali) va **internal-orders/new**
> (singular `pages.internal_order` ns, `destination_store`/`delivery_planned`) ham qo'lda; **losses/new + enters/new**
> = 2 parallel workflow agent (`scripts/wf-inventory-losses-enters-i18n.js`). Inventory guruhi MAVJUD `tErrors(...)`
> throw + `tReasons(reasons.loss/enter)` konvensiyasini SAQLADI (tForm'ga churn qilinmadi). Yangi kalitlar:
> per-page `applicable_help`/`related_empty` (moves/losses/enters); `surplus_qty`/`shortage_qty` (inventories);
> `related_empty`/`select_store_first`/`add_position_first` (internal_order); shared `errors.position_quantity_non_negative`.
> **🔴 3-lens adversarial verify (15 agent) REAL BLOKER topdi**: inventories/new `description`-bog'langan maydonni
> `tFields('reason')` («Причина») deb belgilagan — inventarizatsiyada «Причина» yo'q; [id] egizak komment maydonini
> ko'rsatadi. **Fix butun guruh komment maydonini `tFields('description')` («Комментарий», moysklad-kanonik, moves/[id]
> + demands/[id] allaqachon ishlatadi) ga BIRLASHTIRDI**: inventories/new reason→description (+unused `reason_placeholder`
> o'chirildi) va losses/[id]+enters/[id]+inventories/[id]+internal-orders/[id] `tCommon('description')` («Описание»)
> → `tFields('description')`. Shu pass UZ-polish: okina ʻ→' 6 `detail_form.overhead_*` kalitda;
> `detail_titles.loss` «Yo'qotish»→«Hisobdan chiqarish»; ingliz «Move hujjati»→«Ko'chirish hujjati».
> **Gates**: web tc0 · biome 0 · web **1225 pass/1 skip** · key-existence (5 formaning barcha kaliti ru+uz) · grep 0 hardcoded.
> **HALOL**: browser-smoke YO'Q (additive i18n). **DEFER**: «Provedeno» konvensiyasi (project-wide 66 joy);
> komment-label «Комментарий» vs «Описание» divergensiyasi BOSHQA guruhlar `[id]`'ida (purchase-orders/[id],
> invoices-in/[id] hali `tCommon('description')`) → backlog #15.
> **⭐ KEYINGI = production guruhi** document-form i18n (processings, processing-orders, productions, work-orders —
> eng ko'p domen-ehtiyot). Naqsh: `/new`'ni `[id]` egizagiga mirror; key-existence + grep + 3-lens adversarial verify.
> Batch: `docs/audits/modals-i18n-audit.md` §C. _(backlog #14 ning qolgan 3 production `[id]` titlePrefix shu batch bilan.)_

> **2026-06-02d (document-form i18n — PURCHASE GURUHI TUGADI)**: `davom et` → session-start audit **GO**
> (3-agent audit: 5 commit struktura-halol, progress.json hook bilan yangilangan, purchase guruhi haqiqatan
> boshlanmagan; 2 minor doc-gap topildi → shu sessiyada yopildi: §C jadval stale → status-ustun qo'shildi,
> `internal-orders/processing-orders/processings/productions [id]` hardcoded titlePrefix bug-class → backlog #14).
> DOMINANT workstream (hujjat-forma i18n) davom etdi va **butun purchase guruhi tugadi**: **supplies ·
> purchase-orders · invoices-in · purchase-returns** (har biri `/new` + `[id]`). To'rt `[id]` egizak allaqachon
> i18n-toza edi (grep 0 hardcoded) → ish = faqat 4 ta `/new` forma, har biri o'z `[id]` egizagiga mirror.
> **supplies/new** men (asosiy loop) tomonidan oltin-reference sifatida wire qilindi (tc0·biome·0 hardcoded·
> useTranslations 0→8 hook); qolgan 3 ta **3 parallel workflow agent** bilan (`scripts/wf-purchase-group-i18n.js`)
> shu reference'ga ko'ra wire qilindi → keyin 4 forma **3-lens adversarial verify** (mislabel-vs-`[id]` /
> leftover-hardcoded / key-existence+parity). **🔑 KRITIK mirror fix**: har purchase `[id]` kontragentni
> «Поставщик»=`tFields('supplier')` deb belgilaydi, lekin 4 ta `/new` xato «Контрагент» berардi → `tFields('supplier')`ga
> tuzatildi. Yangi kalitlar (bir marta): per-page `applicable_help`/`waiting_help`/`related_empty`/`select_store_first`/
> `add_position_first` (×4 namespace, ru+uz) + shared `form.select_supplier_first`/`select_supply`/`supply_picker_title`.
> STATUS_OPTIONS har `[id]` real FSM'iga moslandi (supply/invoice_in/purchase_return=draft/posted/cancelled;
> purchase_order=draft/confirmed/cancelled). purchase-returns/new qisman holati birlashtirildi (unused `_t`→`t`;
> `tErrors(...)` throws→`tForm(...)`). **🔴 Adversarial REAL BLOKER topdi**: `uz detail_titles.supply`=«Yetkazib berish»
> (=*yetkazib berish/delivery*) lekin RU «Приёмка» (=*qabul*) → «Priyomka»ga tuzatildi (supplies/[id] + har «Создать→Приёмка»
> menyusida ham live edi). Shu pass purchase guruhi UZ `detail_titles`'ni «Yetkazuvchi»→dominant «Ta'minlovchi»/«Priyomka»
> terminlariga moslashtirdi (UZ-only; RU=parity anchor o'zgarmadi). **Gates**: web tc0 · biome 0 · web **1225 pass/1 skip** ·
> key-existence (4 formaning barcha kaliti ru+uz resolve) · grep 0 hardcoded. **HALOL**: browser-smoke YO'Q (additive i18n).
> **DEFER** (kattaroq UZ sweep, scope tashqarisi): «Provedeno» transliteratsiyasi (atayin 30+ joyli konvensiya);
> `create_related`/nav «Yetkazib beruvchi» «supplier» varianti.
> **⭐ KEYINGI = inventory guruhi** document-form i18n (moves, losses, enters, inventories, internal-orders). Naqsh:
> `/new`'ni `[id]` egizagiga mirror qil; key-existence + grep + 3-lens adversarial verify. Batch: `docs/audits/modals-i18n-audit.md` §C.
> _(backlog #14 = production/inventory `[id]` hardcoded titlePrefix — shu inventory→production batch bilan birga yopiladi.)_

> **2026-06-02c (document-form i18n — SALES GURUHI TUGADI)**: `davom et` → session-start audit **GO**
> (5 i18n commit verified, inflyatsiya yo'q; price-lists/[id] 3 hardcoded-uz = backlog #13 scope tashqarisi,
> NEXT.md eski line ~483 stale pointer tuzatildi). DOMINANT workstream (hujjat-forma i18n) davom etdi va **butun sales
> guruhi tugadi** (3 hujjat × `/new` + `[id]`): **demands · invoices-out · sales-returns**. `/new` formalar ~0% i18n edi
> (demands/new + invoices-out/new: 0 `useTranslations`; sales-returns/new: 2, faqat errors) → har biri o'zining `[id]`
> egizagiga mirror qilindi. Yangi **shared** kalitlar (bir marta, guruh bo'yi qayta ishlatildi): `form.currency_{uzs,usd,eur,rub}` ·
> `form.rate_edit` · `form.create_new_project` · `form.other_fields` · `fields.gtd_cost` («Себестоимость ГТД») ·
> `fields.country` («Страна»). Yangi `pages.<doc>.*`: applicable_help / related_empty / select_store_first /
> add_position_first (+ demands delivery_date / stock_available). Counterparty label har `[id]`'ni hurmat qiladi:
> demands=`fields.agent` («Контрагент», captured reference tasdiqi); invoices-out + sales-returns=`fields.customer`
> («Покупатель», `[id]` egizagiga ko'ra). STATUS_OPTIONS har hujjatning REAL FSM'iga moslandi (draft/posted/cancelled —
> dekorativ confirmed/shipped olib tashlandi, status create'da yuborilmaydi). `[id]` leak'lari ham tuzatildi:
> **sales-returns/[id] hardcoded `gtdSumLabel`→`tFields('gtd_cost')`**. **BUG tuzatildi**: sales-returns/new validation
> `errors.select_payee` («Выберите получателя») mijoz maydoni uchun → `form.select_customer` («Выберите покупателя»).
> **3-lens adversarial verify** (`scripts/wf-sales-group-i18n-verify.js`, 9 agent): 0 blocker; 3 sibling-consistency fix
> qo'llandi (account-picker dialog title'lar `[id]`'ning `tFields`'iga moslandi); **2 false-positive rad etildi moysklad
> screenshot bilan** (demand «Создать документ» menyusi SINGULAR — «Входящий платеж»/«Приходный ордер» — mavjud
> `tDetailTitles` to'g'ri, taklif qilingan plural `create_related` NOTO'G'RI).
> **Gates har holatda**: web tc0 · biome 0 · web **1225 pass/1 skip** · **key-existence 181/181 ru+uz** · grep 0 hardcoded.
> **HALOL**: browser-smoke YO'Q (additive i18n). **DEFER** (free-tier route-wall / strukturaviy): «Покупатель» vs «Контрагент»
> (invoices-out/sales-returns, jonli capture yo'q); demand `delivery_date` maydoni (moysklad demand main panelida
> ko'rsatilmaydi; `/new`-only, `[id]`'da yo'q) — strukturaviy reconciliation demands detail audit'ga tegishli; email-defaults
> bug-class (defaultSubject/defaultBodyHtml hardcoded RU — customer-orders/invoices-out/demands — alohida sweep).
> **⭐ KEYINGI = purchase guruhi** document-form i18n (supplies, purchase-orders, invoices-in, purchase-returns). Naqsh:
> `/new`'ni `[id]` egizagiga mirror qil, key-existence + grep + **3-lens adversarial verify** (sales'da REAL fix'lar +
> false-positive'larni reference bilan rad etish — har ikkisi ham essential). Batch reja: `docs/audits/modals-i18n-audit.md` §C.

> **2026-06-02b (document-form i18n — QOLGAN MONEY HUJJATLAR TUGADI → butun MONEY guruhi yopildi)**: `davom et` →
> session-start audit **GO** (5 commit verified, inflyatsiya yo'q; keyingi-vazifa pointer to'g'ri). Money-order
> guruhidan keyin **qolgan 3 money hujjat** i18n qilindi (har biri `/new` + `[id]` = **6 fayl**):
> **prepayments · prepayment-returns · counterparty-adjustments**. `/new` formalar ~0% i18n edi (hardcoded RU label +
> hardcoded UZ picker) → cash-in/new naqshiga mirror qilindi; `[id]` egizaklaridagi qoldiq leak'lar (Внешний код,
> Наличные/Безналичные/QR, «Forma yuklanmadi», «Yangi kontragent», «Qoldiq qaytarish») bir vaqtda tuzatildi.
> Yangi kalitlar: **detail_titles** (3: Предоплата/Возврат предоплаты/Корректировка взаиморасчётов) + `pages.*` (ru+uz):
> err_*/related_empty/select_agent_first/select_source_first/autofill_from_source/remaining_refundable +
> prepayment_return retail-split (cash_sum/no_cash_sum/qr_sum **prepayment bilan unifikatsiya** — sibling izchillik).
> **🔴 ADVERSARIAL CATCH (3-lens wf)**: lens-1 «wrong-key» topdi — 3 ta `[id]` DetailHeader `titlePrefix={t('title')}`
> ishlatardi = **PLURAL list-title** («Предоплаты № …») singular o'rniga; sibling money-doc'lar (cash-in/payments-in)
> `tDetailTitles(...)` ishlatadi → 3 sahifa ham tuzatildi (`tDetailTitles('<doc>')`). Mechanical grep/key-existence buni
> **ushlay olmasdi** (kalit resolve bo'lardi, lekin noto'g'ri qiymatga) — adversarial lens shart edi.
> **Gates har commit**: web tc0 · biome 0 · web **1225 pass/1 skip** · **key-existence 181/181 ru+uz** · grep 0 hardcoded.
> **HALOL**: browser-smoke YO'Q (additive i18n).
> **⭐ KEYINGI = sales guruhi** document-form i18n (demands, invoices-out, sales-returns; demands/[id] allaqachon
> qisman). _(detail-header bug-class sweep = backlog #13 ✅ shu sessiyada yopildi, 2-commit.)_ Naqsh: `/new`'ni `[id]`
> egizagiga mirror qil, key-existence + grep + 3-lens adversarial verify (3-lens money-docs'da REAL wrong-key topdi —
> mexanik tekshiruv yetarli emas). Batch reja: `docs/audits/modals-i18n-audit.md` §C.

> **2026-06-02 (document-form i18n — MONEY-ORDER GROUP TUGADI)**: `davom et` → session-start audit **GO**
> (3 stale doc gap tuzatildi `18d1b5c1`: auto-protocol step 2 hali «katalog detail capture» deb yozardi →
> `davom et` noto'g'ri yo'lga tushirardi; modal-audit «0%» status). Keyin DOMINANT workstream (hujjat-forma i18n)
> boshlandi va **butun money-order guruhi tugadi** (4 hujjat × `/new` + `[id]` = 8 fayl):
> **`d7006ee8` cash pair** (cash-in + cash-out) · **`c5a7f512` payment pair** (payments-in + payments-out).
> Har `/new` o'zining **audit qilingan `[id]` egizagini mirror** qildi (fields.*/pages.<doc>.*/form.*/detail_*
> kalitlar) → /new va [id] endi izchil; `[id]` egizaklaridagi qoldiq Uzbek-leak'lar (validation throw, allocation
> bo'limi, picker) bir vaqtda tuzatildi (cash-out/[id] va payments-out/[id] eng kam i18n edi → pages.<doc> +
> detail_tabs hook qo'shildi). Counterparty label endi hammada `fields.agent`=«Контрагент» (audit'ga ko'ra, oldin
> «Покупатель»/«Поставщик»). Yangi kalitlar: ~18 cash_in + ~18 cash_out + ~11 payments_in + ~14 payments_out (ru+uz).
> **Gates har commit**: web tc0 · biome 0 · web **1225 pass/1 skip** · har fayl-to'plamda **key-existence (152+173
> kalit) ru+uz tasdiqlandi** (next-intl jim-render bug-class'ini yopadi) · 0 hardcoded RU/UZ qoldi. **Adversarial
> verify** har juftlik uchun 3-lens workflow (cash: 0 wrong-key/0 leftover; payment: 2 consistency fix qo'llandi —
> payments-out/[id] targetHint summasi + kind-aware placeholder). **HALOL**: browser-smoke YO'Q (additive i18n).
> ru-parity «verify vs moysklad» bayroqlari (kind labels «Счёт»/«Заказ (аванс)», paid_documents tab, UZ «Zakaz»
> konvensiyasi) = mavjud kalitlar, free-tier route-wall sabab jonli tasdiqlab bo'lmadi → DEFER.
> ~~**⭐ KEYINGI = qolgan money hujjatlar** (prepayments, prepayment-returns, counterparty-adjustments)~~ ✅ **TUGADI
> 2026-06-02b** (yuqoridagi entry) → butun **money guruhi** yopildi. Keyingi = detail-header bug-class (backlog #13) →
> sales guruhi. Batch reja: `docs/audits/modals-i18n-audit.md` §C.

> **2026-06-02 (per-modal field audit — modal workstream TUGADI + DOMINANT topilma)**: `davom et` →
> session-start audit **GO** (+ stale doc fix `97c652e7`: backlog #9 print-dropdown allaqachon done edi,
> smoke path). 4-agent discovery workflow (`scripts/wf-modal-audit-discover.js`) → Opus judge. **Bajarildi**:
> (1) **CatalogPicker design-system Uzbek-leak FIXED** `70d01ce0` — 10 hardcoded uz string (6 prop-default +
> 6 no-prop literal: loading/cancel/close/clear/pick) RU UI'ga sizardi (Modal/EditForm naqshi); yangi
> `CatalogPickerLabelsProvider` + context + layout wiring + `catalog_picker` namespace + `common.clear` +
> 7 injection test; 4 pre-existing a11y error ham tozalandi (ul→div listbox). (2) **Modal validation
> leaks FIXED** `fa4973af` — send-email «{field} majburiy»→`field_required` + 4 a11y label fix; HR
> template-modal somToMinor 3 uz xabar→`form_err_money_*`. (3) task-create «Тип задачи» = **moysklad-parity**
> tasdiqlandi (API state field); 8 modal toza. Gates har commit: ds tc0·web tc0·ds 118·web 1225/1skip·biome 0err.
> **🔴 DOMINANT TOPILMA (keyingi workstream)**: hujjat formalari (`*/new` + `[id]`) **~0% i18n** — hardcoded
> RU label + hardcoded UZ picker (na RU na UZ to'g'ri). ~16 /new forma × ~25 string ≈ **400 hardcoded**;
> har forma products-scale i18n (cf. products 59-key). **KEYINGI = hujjat-forma i18n** (per-form, products
> naqshi; pickerlar `form.*_picker_title`/`select_*` qayta ishlatadi; money group'dan boshla). To'liq tafsilot
> + inventory + mapping + batch reja: `docs/audits/modals-i18n-audit.md`.

> **2026-06-01 (autonomous sequence, «ketma ketlikda to'liq professional davom et»)**: settings-catalog
> detail conveyor BLOKLANGAN (free-tier route-wall) → foydalanuvchi non-blocked workstream'larni ketma-ket
> qil dedi. Bajarildi: (1) audit cleanup `a2bfbe3d`; (2) **backlog #12 mass-edit tenant-scope CLOSED**
> `96f3db45` (shared `assertMassEditRefsInTenant` → 23 service, live smoke 11/11); (3) **modal audit
> BOSHLANDI** `eb82668e` — modal-primitive Uzbek-default leak (ConfirmDialog confirm/cancel/backdrop +
> Modal closeLabel) injektsiya bilan tuzatildi (web 1218·ds 118 pass); (4) **attribute-metadata-dialog
> to'liq i18n** `a4d927fd` (0 i18n edi → reused attribute_type/entity + pages.attribute_admin; +CustomEntity).
> **KEYINGI = per-modal field audit** (task-create/send-email/webhook-dialog allaqachon i18n → moysklad bilan
> label/order parity tekshir; modal boshida `grep -c useTranslations`) → keyin code+domain katalog audit ·
> product-folders/contracts scaffold. Tafsilot: `session-2026-06-01-backlog12-tenant-scope.md`.

> **2026-05-31 drift-fix sessiyasi**: oldingi 9 sessiya'dagi kamchiliklar
> tuzatildi. Tafsilot oxirgi bo'limda. **`SESSION-CHECKLIST.md` yaratildi**
> — har sessiya yakunida MAJBURIY chequedan o'tadi.


---

## §3 — 2026-05-30 davri: yondashuv, Sessiya 1–10 loglari, timeline, eski backlog, muzlatilgan snapshot (NEXT.md 2021–2560-qatorlar edi)

### Yondashuv (2026-05-30, soddalashtirilgan)

To'liq audit protokoli (200-400 soat) **ishlatilmaydi**. O'rniga uning **eng qimmatli qismi**:

1. **Capture**: `pnpm capture-moysklad <module>` → `metadata.json` (moysklad'dagi dropdown items source-of-truth)
2. **Compare**: bizning component bilan solishtir
3. **Fix**: topilgan deltalarni tuzat

Bu = **30-40 soat 56 sahifa uchun** (foydalanuvchi qaror qildi).

Stateful (S1-S13) va side-by-side PNG taqqoslash — **skip** qilinadi (ortiqcha, kam qimmat). Faqat top 5-10 sahifaga keyinroq qo'llanadi.

### Sessiya 1 — ✅ TUGADI (2026-05-30, 7 commit)
invoices-out · invoices-in · cash-in · cash-out · payments-in · payments-out — hammasi
capture + Phase-2 dropdown audit'dan o'tdi. Shared helper: `apps/web/src/components/money/
document-toolbar-menus.tsx` (+8 test, `money_docs_menu` i18n). Adversarial workflow bilan
char-for-char tasdiqlandi. Tafsilot: `session-2026-05-30-money-docs-phase2.md`.

### Sessiya 1b — ✅ TUGADI (2026-05-30, +5 commit): Phase-3 money mass-edit
Yagona delta yopildi: 5 ta backend `/mass-edit` endpoint+service (invoice-out mirror, tenant-guard)
+ MassEditModal 5 sahifaga ulandi → «Массовое редактирование» endi 6 ta list'da enabled+funksional.
Gates: web 1164 · API 2552 · typecheck/biome clean. **HALOL (yangilandi 2026-05-31 audit'dan keyin)**: shu
sessiyada faqat mirror darajasida tasdiqlangan edi; keyinroq drift-fix sessiyasi (`2d133a81`) seed-data bor
modullarni live smoke qildi — **invoices-out shular orasida** (8 modul: customer-orders/demands/supplies/
sales-returns/purchase-orders/purchase-returns/invoices-out/work-orders), qolgan invoice/payment modullari
seed bo'sh → skip. Commit: `feat(<module>): wire mass-edit endpoint + modal`.

### Sessiya 2 — ✅ TUGADI (2026-05-30 kechki, sifat birinchi avtonom, 10+ commit)
**Phase 1 — Live smoke + adversarial QA (CLAUDE.md majburiy):**
- 5 money modulda real DB smoke (4/4 patched + verified, invoice-in: seed bo'shliq)
- 6/6 adversarial: empty patch 400, missing UUID, mixed partial, invalid format, >100 cap, concurrent last-write-wins

**Phase 2 — yangi 5 sahifa Phase-2 toolbar audit:**
- moves, losses, enters, inventories (warehouse FSM — supplies naqshi)
- inventories special: Изменить FAQAT 3 ta item (post/clone yo'q)
- counterparties (catalog pattern — archive/restore not post/unpost)

**Topilgan bonus bug**: husky pre-commit/commit-msg shebang yo'q + commitlint bare `--no` flag noto'g'ri edi (to'g'risi `--no-install`) → tuzatildi `d4fd0758`.

**Workflow tajriba (qayd)**: 4 ta agent dispatch qilingan, hammasi subagent session limit'ga uchradi (0 ta commit). Sequential direct ish ishonchli — bu sessiya'da 5 modul + 5 test + i18n + page wiring.

**Qolgan**: products (faqat Печать captured), contact-persons + variants (capture fail — moysklad'da boshqacha tashkillangan).

### Sessiya 3 — ✅ TUGADI (2026-05-30, 2 commit): capture-fix + products
**Capture skript ildiz blokeri yopildi** (`0c65f441`): katalog «Изменить» dropdown
tanlovsiz disabled bo'lgani uchun bo'sh capture qilinardi. Endi S3 avval birinchi
qatorni `cfg.firstRowSelector` orqali tanlaydi (ilgari config bor edi-yu ishlatilmasdi),
keyin menu'ni dump qiladi. `rowSelected` flag qo'shildi. products qayta captured →
real 7-item «Изменить» (Удалить · Копировать · Массовое ред. · Переместить · Архивга ·
Архивдан · Цены...) + 3-item «Печать».

**products toolbar dropdown** (`68283506`, 18/56): catalog pattern (counterparties mirror).
delete/archive/restore real backend; copy/move/prices = label-parity disabled placeholder
(backend yo'q — «Объединить» konvensiyasi); mass-edit onMassEdit orqali (hozir disabled).
12 test yashil, web typecheck + biome toza. **Counterparty clone-404 bug'i ATAYIN
takrorlanmadi** (products copy disabled, fake `/clone` call yo'q).

**Halol known-flaky (capture, non-blocking)**: S6 column-gear (Столбцы) + S8 selection-1
products GWT'da hali timeout — parity-kritik S3/S5 ishlaydi.

### Sessiya 4 — ✅ TUGADI (2026-05-30, 1 commit `f269d8b3`): services + bundles (20/56)
**Topilma**: `pnpm capture-moysklad services` (`#service`) moysklad'da **alohida Услуги
ro'yxati YO'Q**ligini ochdi — route «МойСклад для сферы услуг» onboarding splash beradi,
list emas. Services & bundles **unified Товары assortment** (`#good`) ichida yashaydi →
ularning «Изменить»/«Печать» referensi = **products capture**. Bu xuddi contact-persons/
variants kabi strukturaviy holat (`docs/moysklad-reference/services/FINDING.md`).

**Bajarildi**: `Product{Bulk,Print}Dropdown` → `Assortment{Bulk,Print}Dropdown` ga
rename + `components/assortment/` ga ko'chirildi (products ham qayta ishlatadi — **dublikat
yo'q**), services + bundles toolbar'lariga ulandi. Backend services/bundles'ni products
(kind=service/bundle) sifatida ko'radi → `/products/bulk-*` o'zgartirishsiz ishlaydi
(delete/archive id+tenant-guard bo'yicha, kind-filtri yo'q → jim-fail yo'q).

**Live smoke (3399, real DB)**: /services 7-item «Изменить» byte-parity (delete/archive/
restore enabled; copy/mass-edit/move/prices disabled), 3-item «Печать», selection-gating
ishlaydi; /bundles ikkala dropdown render. Gates: typecheck+biome toza, 12+5 test yashil.
services/bundles ATAYIN MODULES'ga qo'shilmadi (`--all` splash'da fail bo'lardi).

### Sessiya 5 — ✅ TUGADI (2026-05-30, 1 commit `dbdc5353`): contact-persons + variants (22/56)
**Topilma tasdiqlandi (3 mustaqil dalil)**: `#contactperson` va `#variant` moysklad'da
**alohida list EMAS** — ikkala hash ham sektor onboarding splash'ga tushadi (xuddi `#service`).
Dalil: (1) `states/metadata.json` da har interaktiv state timeout; (2) `01-default.png` =
splash, list yo'q; (3) AYNAN shu akkaunt `#good`/`#company` uchun real list beradi → sabab
route-specific. Ular **detail-card sub-tab**: contact-persons → Контрагент kartasi,
variants → Товар kartasi («Модификации»).

**Parity qarori (HALOL)**: catalog «Изменить»/«Печать» dropdown'lar **QO'SHILMADI** — bu
moysklad'da yo'q parity'ni soxtalashtirardi. (services/bundles'dan farq: ular `#good`
 assortment ichida → dropdown'larni qayta ishlatadi; contact-persons/variants = sub-tab,
boshqa kontekst.) Variants = ALOHIDA `Variant` entity (`/variants/bulk-*`), products EMAS →
assortment dropdown (`/products/bulk-*`) ham texnik jihatdan noto'g'ri bo'lardi.

**Bajarildi**: 2 FINDING.md (`docs/moysklad-reference/{contact-persons,variants}/`), ikkala
page'ga to'g'ri parity-comment, capture MODULES'dan ikkalasi olib tashlandi (services/bundles
bilan birga) → `--all` splash'da timeout sarflamaydi. Gates: scripts tc + 5 capture test +
web tc + biome — hammasi yashil. Tafsilot: `session-2026-05-30-contact-persons-variants.md`.

### Sessiya 6 — ✅ TUGADI (2026-05-30, 2 commit): employees (23/56) + superset parity
**Topilma**: `#employee` moysklad'da **REAL ro'yxat** (splash EMAS) — Настройки → Справочники →
Сотрудники. «Изменить» = {Удалить, Поместить в архив, Извлечь из архива}, «Печать» YO'Q.
Bizning `/hr/employees` ataylab boyroq HR moduli. **Foydalanuvchi tanlovi: SUPERSET** — boy
dizaynni saqlab, ustiga moysklad bulk poverxnostini qo'shdik (strict superset).

**Bajarildi** (`989b286c` feat):
- backend: `archived` list filtri; setArchived (archive/restore) + FK-safe hardDelete
  (P2003/P2014→aniq xabar); 3 bulk endpoint (runBulk); self-archive/self-delete guard
  (arxiv = login o'chadi); hammasi tenant-scoped.
- web: qator tanlash (+indeterminate select-all), «Состояние» active/archived view,
  kontekst-aware «Изменить» dropdown (active'da archive, archived'da restore), archived
  view'da per-row restore, partial-result toast; uz+ru i18n.
- capture states + metadata.json + FINDING.md (no-owner lockout caveat = backlog).

**Bonus bugfix** (`af4e9d3e` fix): `HrPermissionGuard` `import type { Reflector }` → DI
runtime'da `undefined` (tsx/esbuild type-only importni o'chiradi) → HAR HR endpoint 500.
`typecheck` yashil edi (tsc un-elide qiladi) → faqat **live smoke** ushladi. value-import +
`@Inject(Reflector)` ga o'tkazildi (permissions.guard.ts naqshi). **Saboq: yashil gate ≠ ishlaydi.**

**Gates**: api **2562** + web **1190** test yashil, typecheck+biome toza, live real-DB smoke
(archive→archived-view→restore, self-guard, empty=400, ghost→partial, hard-delete→404) tasdiqlandi.

### Sessiya 7 — ✅ TUGADI (2026-05-30, 1 commit `04cbbe62`): Projects (Проекты) catalog (24/56)
**Topilma**: `#project` moysklad'da **REAL Справочник** (Настройки → Справочники → Проекты).
«Изменить» = **5 punkt** (counterparties naqshi): Удалить · Копировать · Массовое редактирование ·
Поместить в архив · Извлечь из архива. **«Печать» YO'Q**. Ustunlar: Наименование · Код · Описание.
Bizda `Project` Prisma model + read-only `GET /projects` (hujjat pickerlari) bor edi, lekin **write
yo'li va katalog UI butunlay yo'q edi** (controller "Full CRUD lives in Settings Round 5+" deb qoldirган).

**Bajarildi**: backend create/update/archive/restore/hard-delete (barcha hujjat FK `onDelete:SetNull`
→ delete xavfsiz) + bulk-delete/archive/restore (runBulk) + mass-edit (owner+description). Tenant-scoped,
unique code→ConflictException, `withTotal` opt-in (COUNT picker hot-path'da ishlamaydi). Web: `/settings/
projects` list+new+[id] + `ProjectBulkActionsDropdown` (5 punkt, Копировать=disabled placeholder, clone
backend yo'q) + MassEditModal(hideProject)+owner picker + Справочники sidebar link + Icons.projects + uz/ru.

**Gates**: full api+web suite yashil (regress yo'q), typecheck+biome toza, **live real-DB smoke 28/28**
(CRUD + unique-conflict + mass-edit + bulk-partial + FK-SetNull + tenant + permission=dev admin ALL).
**Adversarial review (2 workflow)**: 1 BLOKER topildi+tuzatildi (edit-form `null`→400, UpdateSchema
`.optional()` `null` qabul qilmasdi → `.nullable()` + live-tasdiq); 1 perf (COUNT) tuzatildi; mass-edit
owner cross-tenant FK = shared-path backlog (`docs/moysklad-reference/projects/FINDING.md`).
**HALOL qoldiq**: brauzer-klik smoke qilinmagan (backend to'liq live-verified; web = typecheck+unit+i18n).
Tafsilot: `session-2026-05-30-projects-catalog.md`.

### Sessiya 8a — ✅ TUGADI (2026-05-30, 1 commit `67cbe8ee`): null→400 bug-class sweep
Projects review topgan bloker (edit-form `code.trim()||null` → `UpdateX=CreateX.partial()` `.optional()`
`null`ni rad etadi → 400) **mirror** edi. Adversarial sweep: HAMMA settings katalog `[id]` sahifasi
tekshirildi. Buggy (tuzatildi): **expense-item · region · uom · tax-rate** (`.partial().extend({...nullable})`
+ har biriga null-clear test). Allaqachon to'g'ri (nullish/nullable, tegilmadi): store · organization ·
organization-account · price-type · publication · label-template. Gates: api tc + suite **2580** + biome toza.

### Sessiya 9 — ✅ TUGADI (2026-05-30, 2 commit): currencies + uoms system-catalog dropdowns (26/56)
**Topilma (capture + mass-edit modal capture, har biri alohida tasdiqlandi)**:
- **uoms** (`#uom`, `4181d42b`): REAL list (59 system unit). «Изменить» = **2 punkt** {Удалить, Массовое
  редактирование}, «Печать» YO'Q, archive YO'Q. Mass-edit moysklad'da SISTEM uomlarda **xato beradi**
  («выставите фильтр по конкретному типу справочника») → faithful behaviour yo'q. Bajarildi: backend
  `POST /uoms/bulk-delete` (runBulk) + delete FK-guard (P2003/P2014→409; `Product.uom` = free-text, FK yo'q
  → integrity buzilmaydi); web ListView selection + 2-punkt dropdown (Удалить funksional, **Массовое ред. =
  disabled placeholder**). Live smoke **22/22**.
- **currencies** (`#currency`, `0804bcf0`): REAL list. «Изменить» = **4 punkt** {Удалить, Массовое ред.,
  Поместить в архив, Извлечь из архива} (counterparties naqshi − Копировать), «Печать» YO'Q. Mass-edit modal
  = FAQAT **Доступ** bloki (Владелец-сотрудник/отдел + Общий доступ); bizning `Currency` modelda owner/group/
  shared **yo'q** → faithful mass-edit imkonsiz, rate/name tahrirlash soxta parity bo'lardi. Bajarildi: bespoke
  jadvalga row-checkbox ustun (select-all + per-row) + «N | Изменить ▾» + 4-punkt dropdown (delete/archive/
  restore funksional — backend allaqachon bor; base/system qatorlar per-id rad etiladi → **partial result**;
  **Массовое ред. = disabled placeholder**). Inline rate-edit saqlandi. Live smoke **25/25** (mixed-selection
  partial archive+delete tasdiqlandi).

**Saboq**: mass-edit modal'ni LIVE capture qilish (throwaway Playwright) soxta parity'dan saqladi — har ikki
katalogda ham menyuda «Массовое редактирование» bor, lekin biri xato beradi, biri bizda yo'q ustunlarni tahrirlaydi
→ ikkisi ham disabled placeholder (assortment «Копировать» konvensiyasi). **Brauzer smoke ✅ QILINDI** (Playwright
MCP, web :3101): uoms — throwaway uom yaratib→tanlab→O'chirish→`bulk-delete [201]`; currencies — USD arxivlab→tiklab
(`bulk-archive [201]`+`bulk-restore [201]`, dev data toza), ikkala dropdownda «Ommaviy tahrirlash» disabled tasdiqlandi,
default (EUR) qatorda tugma yo'q. Backend live smoke (22/22+25/25) + RTL unit + browser e2e — uchovi yashil. Tafsilot:
`session-2026-05-30-currencies-uoms.md`.

### ⭐ Sessiya 10 — Q1 QUALITY FOUNDATION (yangi sustainable-velocity strategiya)

**Tavsiya (2026-05-31 quality+speed research'dan):** dropdown audit'ni davom ettirishdan oldin
**quality infrastructure'ni mustahkamlash** — Q1-Q5 ketma-ketligi. Q1 bo'lmasa Q4 (mass parallel)
mass drift'ga aylanadi. To'liq plan: `docs/audits-historical/quality-speed-final-research-2026-05-31.md`.

#### Q1 — Quality foundation (1-2 kun, eng yuqori ROI)

**Q1.1 (BIRINCHI VAZIFA, 5 min, eng kichik+strategic):**
- `progress` **pre-commit hook** — har commit'da `pnpm progress` ishga tushadi, `docs/progress.json`
  yangilanadi va commit'ga qo'shiladi. Drift va inflyatsiya **structural mumkin emas** bo'ladi.
- Implementation: `.husky/pre-commit` ga ikki qator qo'shish + lint-staged tartibida ishlash.

**Q1.2 (✅ TUGADI 2026-05-31, commit `1e042860`):** `pnpm audit:module <name>` composite CLI.
7-8h manual audit → 1 komanda: capture → DOM compare (live Playwright default, static
fallback) → todo.json → typecheck → smoke. Fayllar: `scripts/audit-module-lib.ts` (19 pure
test), `audit-module-registry.ts` (22 modul), `audit-module.ts` (orchestrator), design:
`docs/superpowers/specs/2026-05-31-audit-module-cli-design.md`. **Tasdiq (aniqlashtirildi 2026-05-31)**:
customer-orders haqiqiy LIVE capture qildi (`source: live`); counterparties'da live dropdown trigger topilmadi
→ **static fallback** ishladi (`source: static`, `docs/audits/counterparties/_last-live-run.txt`da qayd).
Ikkalasi ham REAL deltalar topdi («В архив» vs «Поместить в архив», «Комплект…» ellipsis farqi, mass-edit
disabled-holat).
Gates: biome 0/0, lib 19/19, typecheck 8/8. Adversarial: false-exact guard (`referenceItemCount`,
ikki tomon bo'sh → parity da'vo qilmaydi) + arg-parse `--web-url`-collision tuzatildi.
**Ishlatish:** `pnpm audit:module <module>` (web dev :3100 + API :4000 + DB kerak), yoki
`--static` (serversiz), `--list`, `--skip-typecheck`/`--skip-smoke`.

**Q1.3 (✅ TUGADI 2026-05-31, commit `257b19de`):** Playwright ARIA snapshot baseline.
`apps/web/tests/e2e/aria-snapshot.spec.ts` har list page'ning accessibility tree'sini ushlaydi
(audit:module = dropdown matni; ARIA = layout/struktura). Har modul uchun 2 ta **data-independent**
baseline: `<module>-toolbar.aria.yml` (sarlavha+tugmalar+qidiruv+counter) va `<module>-columns.aria.yml`
(ustun-sarlavha kontrakti, qatorlar bo'lsa). tbody + «Всего: N» pagination ATAYIN olinmaydi
(seed-bog'liq) → data o'zgarsa baseline buzilmaydi. Matcher loading→loaded remount'ni kutadi
(thead YOKI empty marker = terminal holat) → race yo'q; 30s/20s timeout Next dev cold-compile yutadi.
**Coverage: 20 shared-ListView modul (40 fayl)**; 2 bespoke (currencies, employees — shared ListView
`-page` root ishlatmaydi) auto-skip (sababli log, jim-fail emas). **Bonus harness bug**: `playwright.config`
baseURL `:3000`(prod `next start`) edi, dev `:3100` → e2e hech ulanmagan (shu sabab hech qachon baseline
bo'lmagan); webServer.url ham tuzatildi. **Evidence (live :3100 + API :4000 + DB)**:
`pnpm --filter @moysklad/web test:aria` (ENFORCE, --update'siz). Commit `257b19de` body (ishonchli manba):
**19 passed, 1 flaky (retry'da pass), 0 failed** + **2 skipped** (bespoke) = 20/20 modul reproduce.
Pass/flaky split cold-compile timing'ga bog'liq, run-to-run o'zgaradi (ba'zan 18+2flaky) — flaky'lar har doim
retry'da yashil. biome 0 · typecheck 0 · 40 baseline fayl. **Ishlatish**: `test:aria`
(drift) / `test:aria:update` (yangilash); dev :3100 kerak. **flaky** = cold-compile timing race (CI
retries=2 yutadi). ~~**HALOL qoldiq**: progress pre-commit hook spawn fail~~ ✅ HAL BO'LDI — keyingi
commit'lar (`70d01ce0`/`fa4973af`/`5ce94e7b`) progress.json'ni muvaffaqiyatli yangiladi (hook ishlayapti).

> **Q1 QUALITY FOUNDATION TO'LIQ YOPILDI** ✅ — Q1.1 (`a68e4ffa` hook) · Q1.2 (`1e042860` audit:module CLI) ·
> Q1.3 (`257b19de` ARIA baseline). **Keyingi = Q2 (detail page audit, 0% gap)** yoki Q4 (mass parallel).

#### Q2 — Detail page urgent gap (~~2-3 hafta~~ — eskirgan estimate; 38/63 @ 2026-06-03i, cohort-konveyer davom etmoqda; haqiqiy timeline = «TIMELINE TUZATILDI» ≈line 1070) — BOSHLANDI ✅
**11/63 audited** _(eskirgan snapshot — joriy holat: detail-audit konveyer **63/63 (A–L) TUGADI** 2026-06-04; faol konveyer endi LIST-AUDIT, L3 done → L4 keyingisi; faylning yuqori qismidagi cohort-jadvalga qara)_**:** ~~customer-orders/[id]~~ ✅ · ~~demands/[id]~~ ✅ · ~~supplies/[id]~~ ✅ · ~~cash-in/[id]~~ ✅ · ~~moves/[id]~~ ✅ · ~~payments-in/[id]~~ ✅ (seed-bor hujjat 6/6) · ~~counterparties/[id]~~ ✅ (1-katalog) · ~~products/[id]~~ ✅ (**butun forma hardcoded-uz → 59-key i18n**) · ~~settings/projects/[id]~~ ✅ (**3-katalog, `c1424f4f`**: extra «Внешний код» olib tashlandi + **SYSTEMIC `<EditForm/>` Uzbek-leak topildi**) · ~~settings/stores/[id]~~ ✅ (**4-katalog, `e4215437`**: 6 label-parity + «Комментарий к адресу» + leak fix; route `#warehouse` jonli topildi) · ~~settings/uoms/[id]~~ ✅ (**5-katalog, `3bc2c306`**: extra «Описание» olib tashlandi + «Цифровой код»; **data-model gap**: full/short name split = backend DEFER).

> **⚠️ organizations/[id] (Юр.лица) BLOKLANGAN**: route topildi = `#myorganization` (tan olingan — splash'ga redirect bo'lmaydi), LEKIN bu (bepul tarif) akkauntda «Загрузка...»da osilib qoladi → capture imkonsiz. Paid-tier akkaunt yoki code+domain audit kerak. `#warehouse` (Склады) va `#myorganization` ikkalasi ham `scripts/capture-moysklad-lib.ts` MODULES'ga qo'shildi. Route'lar jonli UI-probe bilan topildi (`scratch/`, gitignored) — moysklad GWT nav'ida statik href yo'q.

> **🔴 SYSTEMIC SWEEP TUGADI (2026-06-01, `bb604bf8`)** — shared `<EditForm/>` pattern Uzbek default beradi (`saveLabel='Saqlash'`, `cancelLabel='Bekor qilish'`, Alert `'Xato'`); label bermagan sahifa RU UI'da Uzbek Save/Close/Error ko'rsatardi. Yangi `useEditFormLabels()` hook (`apps/web/src/hooks/`) + `errorTitle` prop + `common.error_title` kalit → **35 EditForm sahifa** wire qilindi (projects 2 + sweep 33, `wf-editform-i18n-sweep.js` 33 edit→verify pipeline, 0 fail). RU = Сохранить/Закрыть/Ошибка; UZ save/error o'zgarmadi, UZ cancel «Bekor qilish»→«Yopish» (moysklad «Закрыть»). Bonus: 2 pre-existing `noGlobalIsNan` biome error (tax-rates) tuzatildi. PositionEditor-sweep naqshi. **MUHIM**: bu sweep faqat EditForm chrome'ni (Save/Close/Error) localize qildi — wire qilingan 33 sahifaning FORM MAYDONLARI hali parity-audit qilinmagan (denominator'ga kirmaydi; audit≠sweep).

**Keyingi = qolgan settings-katalog detail audit** (form-maydonlari parity, EditForm chrome endi to'g'ri). Template: `wf-stores-detail-audit.js` (boy katalog) / `wf-projects-detail-audit.js` (sodda). **Route discovery (2026-06-01 saboq)**: moysklad GWT nav'ida statik href YO'Q → route'larni jonli UI-probe bilan top (`scratch/probe-routes.mjs` naqshi: candidate hash'larni navigate qil, qaysi biri splash'ga redirect bo'lmasa = haqiqiy). **MUHIM manba**: `docs/moysklad-reference/visual-captures/*/` papka NOMLARI = moysklad route nomlari.

> **🔴 ROUTE-WALL (2026-06-01 jonli probe, `scratch/probe-routes.mjs`)** — qolgan settings-katalog'lar **bepul-tarif akkauntda BLOKLANGAN**, jonli capture imkonsiz:
> - **Splash-redirect** (`#homepage` + «МойСклад для сферы услуг»): `#pricetype` (price-types) · `#vatrate` (tax-rates) · `#productfolder` · `#expenseitem` · `#region` · `#cashregister` · `#group`.
> - **«Загрузка...»da osiladi** (tan olingan lekin render bo'lmaydi): `#myorganization` (organizations) · `#customentity` (custom-entities).
> - **Render bo'ladi LEKIN bizda `[id]` sahifa YO'Q** (scaffold workstream): `#contract` (Договоры) · `#saleschannel` (Каналы продаж) · `#country` (Страны) · `#pricelist` (Прайс-лист hujjat).
>
> ⇒ Jonli-capture settings-katalog detail conveyor'i **deyarli tugadi** (counterparties+products+projects+stores+uoms = reachable bo'lganlari). **Keyingi sessiya variantlari**: (1) **paid-tier moysklad akkaunt** ochsa → bloklangan katalog'lar (price-types/tax-rates/custom-entities/...) capture+audit; (2) **code+domain audit** jonli capture'siz (eski-broken refs yaroqsiz → domen-bilim + bizning kod asosida, masalan price-types/tax-rates/custom-entities formasi allaqachon i18n, label-parity domen bilan); (3) **modal audit** (0%) yoki **navigation graph** (0%) workstream'iga o'tish; (4) **product-folders/[id]+contracts/[id] scaffold** (route bor, sahifa yo'q). **Auth**: stale bo'lsa `.auth/moysklad.json` o'chir → keyingi capture avto-login qiladi (`.env.local` creds, captcha yo'q edi 2026-06-01).
**⚠️ organizations/[id] (Юр.лица) BLOKLANGAN**: route = `#myorganization` (tan olingan) lekin bepul-tarif akkauntda «Загрузка...»da osiladi → paid-tier yoki code+domain kerak.
**⚠️ Backend backlog (uoms)**: full/short name split — moysklad uom = Полное+Краткое наименование + Цифровой код; bizda yagona `name` (=short). `fullName` field + «Полное наименование» input kerak (Prisma+service+DTO+UI).
**⚠️ MUHIM**: `product-folders/[id]` va `contracts/[id]` route mavjud, lekin BIZNING app'da bu sahifalar YO'Q → 0-dan scaffold (alohida workstream).

> **products/[id] (2026-06-01, `3a033c60`)**: 2-katalog detail. **DOMINANT**: butun products formasi (HAM `products/[id]` HAM
> `products/new`, mirror) **hardcoded UZBEK** edi (formada 0 i18n; RU UI'da butun karta o'zbekcha chiqardi). `pages.product_new`
> namespace (59 key ru+uz) + ikkala sahifa wire qilindi (section/label/hint/picker/option/header + Zod xabarlari
> `makeProductFormSchema(t)` factory orqali). RU label'lar moysklad DOM'iga moslandi; UZ original saqlandi. Adversarial
> verify agent → 5 polish (DOM'da verbatim tasdiq): «Наименование товара», «ИКПУ (MXIK)» (Latin), «Объем» (ё-siz), «расчета»
> (ё-siz), «Запретить скидки при продаже в розницу». DEFER: o'ng CRM/narx/variant widget · Тип товара/seriya/marking ·
> Доступ editor · «Поиск по ТАСНИФ» (UZ IKPU lookup) · ~~archive label (shared, backlog #9)~~ ✅ YOPILDI `c2aa5722`. Gates tc0·biome·1214 pass.
Har sahifa: 6-agent fakt-yig'ish workflow → Opus deltalarni hukm qiladi → fix → verify (naqsh:
`scripts/wf-customer-order-detail-audit.js` + `docs/audits/customer-orders-detail.audit.md`).

> **customer-orders/[id] (2026-06-01, commit `c68dd11a`)**: 70 delta topildi. **SYSTEMIC bug-class** ochildi
> (shared komponentlar, ~14 detail sahifa): (1) `<PositionEditor>` RU locale'da ham **Uzbek labels** ko'rsatadi
> (design-system locale-agnostik, 13/14 sahifa `labels=` bermaydi) → `position_editor` i18n + `usePositionEditorLabels()`
> hook bilan tuzatildi (customer-orders wire qilindi); (2) **dublikat totals** (editor footer + sidebar) → `hideTotals`
> prop; (3) `<AttributesEditor>` hardcoded Uzbek title → i18n. + Close «Назад»→«Закрыть», Tab1 «Позиции»→«Главная».
> Gates: tc 8/8 · web 1214 · ui 118 · biome toza. **HALOL**: browser-smoke qilinmagan (pure i18n/label/prop).

> **✅ SYSTEMIC SWEEP TUGADI (2026-06-01)**: **13 detail sahifa**ga `labels={usePositionEditorLabels()}` (+ 8 ta
> full-mode'ga `hideTotals`) `position-editor-i18n-sweep` workflow bilan ulandi (har sahifa edit + adversarial
> struktura-verify; markaziy gate: web typecheck 0 · biome toza · web 1214 test). Pages: demands · supplies ·
> invoices-out/in · purchase-orders · purchase-returns · sales-returns · internal-orders (full) · moves · losses ·
> enters (qty-cost) · processings (×2 editor) · inventories (merge). **Tuzatish**: `processing-orders` PositionEditor
> ISHLATMAYDI → sweep'ga kirmaydi (haqiqiy son 13, ilgarigi "12" xato). Tafsilot: `customer-orders-detail.audit.md`
> «Done — systemic sweep» bo'limi. **Keyingi = demands/[id] detail audit** (customer-orders 6-agent naqshi).

#### Q3 — Real-DB integration test (1 hafta)
OpenAPI spec + openapi-generator → Supertest e2e + CI integratsiyasi. "Yashil typecheck ≠ ishlaydi" gap yopiladi.

#### Q4 — Mass parallel parity (Goose overnight, 2-3 hafta)
**FAQAT Q1-Q3 locked'dan keyin**. Recipe template currencies/uoms naqshidan. 16/56 → 50/56 list.

#### Q5 — Production hardening (1 hafta minimum, scope'ga bog'liq)
Adversarial QA sweep + real-data smoke (Excel 2000+ qator, multi-user) + staging + beta.

---

### ⚠️ TIMELINE TUZATILDI (2026-05-31, audit'dan keyin)

Avvalgi "**6-8 hafta**" raqami **noto'g'ri edi** — case studies bilan qarama-qarshi
(Cal.com 5 yil, NocoDB 4+ yil, Twenty 6 oy = 15-20% Salesforce parity). 3-agent
audit (wgu1om7d6) buni "logical contradiction" deb ko'rsatdi.

**Foydalanuvchi qarori (2026-05-31): 99% parity, NO MVP cuts.**

Real raqam:
- 1 list COHORT (~6 sahifa) = ~1 sessiya | list_audits **71 bajarildi — L1–L12 BUTUNLAY TUGADI** (2026-06-05)
- 1 detail page = ~2-3 sessiya (og'ir hujjat: FSM+pozitsiyalar) yoki ~0.5-1 (sodda settings/katalog detail)
  | **63 actual detail** (eski "36" hardcoded taxmin almashtirildi; 62→63 tuzatildi 2026-06-01) = **~100-140 sessiya** (aralash og'irlik)
- 1 modal = ~0.5 sessiya | 80+ modal = **~40+ sessiya**
- Reports + import/export + permissions + e2e + i18n + admin = **~40+ sessiya**
- Q5 production hardening (load, staging, beta) = **~10 sessiya**

**Jami ~200+ sessiya** (kuniga 1-2 sessiya = **5-7 oy realistik**).

Q1-Q5 fazalari aniq, lekin Q4 (mass parallel) **eng katta vaqt blok** (40+ hafta'ga
emas, 5-7 oy'ga sig'gan model = haftada 6-8 modul detail-qatlami bilan). Q2 0.5
page/day emas, **0.2-0.3 page/day** realistik (detail murakkabroq).

**99% parity yo'lining oltin qoidasi:**
- ❌ Hech qachon "6-8 hafta'da tugaymiz" demang — bu tarixiy tezlik bilan mumkin emas
- ✅ Har sessiyada 1-2 modul professional yoping
- ✅ Q4 Goose overnight = MAX 5 modul/tun (review capacity sizning ertangi kuningiz)
- ✅ Sifat tushishi mumkin emas (CLAUDE.md NOLINCHI QOIDA)

---

#### Tavsiya etilgan boshlanish (yangi sessiyada `davom et`)

**Q1 QUALITY FOUNDATION TO'LIQ YOPILDI** ✅:
- **Q1.1** (`a68e4ffa`) — progress pre-commit hook
- **Q1.2** (`1e042860`) — `pnpm audit:module` composite parity CLI
- **Q1.3** (`257b19de`) — Playwright ARIA snapshot baseline (20 modul, 40 fayl; commit body: 19 pass+1flaky, +2 skip)

**Q2 BOSHLANDI ✅ — 34/63 detail audited** ⚠️ **[MUZLATILGAN SNAPSHOT 2026-06-04 — eskirgan; jonli holat: detail 63/63 (A–L) ✅, list_audits 71 · `pnpm progress` → `docs/progress.json`. Bu blok tarixiy, yangilanmaydi.]** (customer-orders · demands · supplies · cash-in · moves · payments-in · counterparties · products · projects · stores · uoms, hammasi 2026-06-01; **cash-out** 2026-06-02L · **invoices-in** 2026-06-02M · **sales-returns** + **purchase-returns** 2026-06-03 · **invoices-out** 2026-06-03b · **purchase-orders** 2026-06-03c · **payments-out** + **processing-orders** + **processings** + **productions** (Cohort A) 2026-06-03d, sibling-parity). **+ SYSTEMIC EditForm Uzbek-leak sweep (35 sahifa, `bb604bf8`) + «Главная» first-tab bug-class sweep (9 sahifa, `c6be3247`) + F20 totals VAT bug-class fix (9 sahifa, `c6bf7673`) + doc-date moment bug-class fix (5 /new, `77195e2d`) + buyPrice cost-prefill bug-class fix (5 sahifa, `066d55fb`)**. **+ Cohort B (enters·losses·inventories·internal-orders) 2026-06-03e — internal-orders money-format/externalCode/uz-leak fixes**.
**Barcha seed-bor hujjat modullari TUGADI (6/6) + birinchi katalog detail (counterparties/[id]) TUGADI.**

**✅ counterparties/[id] TUGADI (2026-06-01, `cdb773d8`)** — **birinchi KATALOG-card detail** (katalog ≠ hujjat: ikki ustunli
form-card + o'ng CRM widget). NO-GO session-start audit avval cash-in S5 «Плательщик»→«Контрагент» mismark + bug-class
(cash-out/payments-out) tuzatdi (`eb8a761e`). Capture: `openFirstRow` katalog cell-table qatorlarini ochmas edi (edit-anchor
yo'q) → catalog-row candidate qo'shildi + «Выбрать тариф» banner-link interference tuzatildi (`f0ffa01f`); counterparties card
reference captured (edit-default.html 168KB + extra-menus.json). 6-dim `wf-counterparties-detail-audit.js` → Opus judged → **13 fix**:
typeLabel header-badge hardcoded-uz→i18n · Bank+Balans read-only jadvallar (title+empty+8 header) hardcoded-uz→i18n · tag-aria ·
7 label parity (Наименование/Электронный адрес/Комментарий/Тип контрагента/Полное наименование/Цены/Номер диск. карты) ·
«Создать документ» customer-order mislabel (`tCreate('demand')`«Отгрузки» dublikat → yangi `create_related.customer_order`«Заказ
покупателя») · contact-add «Новый контакт»→«Контактное лицо». DEFER (audit.md'da): o'ng CRM widget · section regrouping ·
Статус/Группы/Доступ editorlar · «Заполнить по ИНН» · inline bank-add · ~~archive label «Поместить в архив» (shared `common.archive` backlog #9)~~ ✅ YOPILDI `c2aa5722` · calls-section.tsx « с»/ru-RU (shared). Gates tc0·biome·web **1214 pass/1 skip**, browser-smoke YO'Q.

**✅ cash-in/[id] TUGADI (2026-06-01, `fbe3d16d`)** — birinchi MONEY doc (Приходный ордер): tab1 hardcoded-uz
«Taqsimlanish»→«Оплаченные документы» (i18n) + allocation_title/empty wire + Tasks section. Qoldiq (audit.md'da, bounded):
allocation jadval column-label uz strings (~5 key), «Создать документ» 1 item, «Печать» print-forma. **MUHIM topilma**:
invoices-out/purchase-orders/invoices-in/cash-out/payments-out/losses/enters/inventories demo-akkauntda **BO'SH**
(capture openFirstRow fail) → seed bor modullar: customer-orders·demands·supplies·**cash-in(56)·moves(18)·payments-in(9)**.

**✅ SYSTEMIC SWEEP TUGADI (2026-06-01)** — 13 detail sahifaga `labels={usePositionEditorLabels()}` (+ 8 full-mode
`hideTotals`) ulandi (`position-editor-i18n-sweep` workflow; web typecheck 0 · biome toza · web 1214 test). Uzbek-leak
bug-class butun hujjat suite'ida yopildi. `processing-orders` PositionEditor ishlatmaydi → tashqarida (haqiqiy son 13).

**✅ demands/[id] detail audit TUGADI (2026-06-01)** — 6-dim `demands-detail-audit` workflow → Opus judged → **5 fix**:
Tab1 «Главная» · inline Tasks section qo'shildi · «Создать документ» label→«Возврат покупателя» · pager «N из M» (RU,
shared) · linked-order «Заказ»→«Заказ покупателя». Gates: tc0·biome·web 1214. Tafsilot: `docs/audits/demands-detail.audit.md`.
**MUHIM:** demands reference screenshot'lari buzuq edi → audit DOM+kod asosida; ko'p delta NEEDS-LIVE-CAPTURE (audit.md'da).

**✅ supplies/[id] detail audit TUGADI (2026-06-01)** — toza `--detail` capture bilan → 3 fix (demands naqshi):
Tab1 «Главная» · inline Tasks section · «Создать документ» 2→7 (Исходящий платёж+Возврат поставщику funksional +5
disabled placeholder; mislabel «Отгрузки»/«Приходные ордеры» tuzatildi) + `create_related.facture_in` i18n. Gates
tc0·biome·1214. `docs/audits/supplies-detail.audit.md`. **`--detail` capture endi robust** (4 bug tuzatildi, commit `e9a3d43b`).

**✅ moves/[id] detail audit TUGADI (2026-06-01, `e27375e9`)** — Перемещение, 5-detail. Toza `--detail` capture +
6-dim `moves-detail-audit` workflow → Opus judged → **6 fix**: Tab1 «Главная» (S1) · inline Tasks section (S2) ·
store labels «Склад-источник/получатель»→«Со склада»/«На склад» (yangi `fields.store_from`/`store_to`, shared key
tegilmadi) · Комментарий `tCommon('description')`→`tFields('description')` (moves yagona «Описание» ishlatardi) ·
overhead i18n leak (hardcoded RU→`tDetailForm('overhead_*')`) · **I8 shared `detail_header.changed` «Изменено»→«Изменения»**
(BARCHA detail sahifaga ta'sir, moysklad bo'yicha; README+comment sync). «Создать документ» TO'G'RI yo'q (move hech
nima spawn qilmaydi); to'lov/jo'natma chip'lari to'g'ri yo'q. Print named-forms + position cost/stock ustunlari +
custom-status = DEFER (backend/print-template/shared). Gates: tc0·biome·web **1214 pass/1 skip**. Browser-smoke YO'Q
(additive i18n/label/prop). `docs/audits/moves-detail.audit.md`. **infra**: `scripts/wf-*.js` biome-ignore (Workflow
return-contract) → detail-audit wf template'lar endi durable commit; `scratch/` gitignored.

**✅ payments-in/[id] detail audit TUGADI (2026-06-01, `fe377059`)** — Входящий платёж, 6-detail (2-money-doc, cash-in
naqshi). Toza `--detail` capture + 6-dim `payments-in-detail-audit` wf → Opus judged → **4 fix**: S1 tab1 «Taqsimlanish»→
«Оплаченные документы» · S2 inline `<DocumentTasksSection entity="PaymentIn">` · S3 **to'liq** allocation i18n (mavjud
allocation_title/empty + 9 yangi `pages.payments_in` kalit ru+uz — cash-in'ning partial S3'idan oshib ketdi) · S5
counterparty label «Плательщик»→«Контрагент» (`tFields('payer')`→`('agent')`; **bug-class**: cash-in refi ham «Контрагент»
ko'rsatadi, uning S5'i xato «match» belgilagan; cash-out/payments-out tasdiqlanmagan). DEFER: Создать/Печать/Отправить
menyular · Канал продаж/Включая НДС/Валюта maydonlar · «Привязать платеж» jadval (S4) · status-dropdown/help · save-handler
validation i18n. Gates tc0·biome·web **1214 pass/1 skip**, browser-smoke YO'Q. `docs/audits/payments-in-detail.audit.md`.

**(SUPERSEDED — joriy KEYINGI fayl boshidagi eng yuqori entry'da: hujjat-forma i18n purchase guruhi. Bu Q2 detail-audit
eslatmasi tarixiy.)** ~~**⭐ KEYINGI = qolgan katalog detail**~~ (product-folders/[id] «Группы товаров», contracts/[id] «Договоры», yoki
`settings/*` katalog detail'lari). **2 katalog detail TUGADI** (counterparties + products) — katalog-card naqshi va
`openFirstRow` patch ishonchli. **Hujjat detail conveyor'i (seed-bor) TUGADI (6/6)**; qolgan hujjat detail'lari
(cash-out·payments-out·invoices-out·purchase-orders·invoices-in·losses·enters·inventories) moysklad-akkaunti BO'SH →
ular uchun avval moysklad UI'da test-hujjat yaratish kerak (keyin batch capture+audit).
`pnpm capture-moysklad <module> --detail` → 6-dim wf (`scripts/wf-counterparties-detail-audit.js` = **katalog-card
template**, REF/OUR_PAGE paths'ni o'zgartir). **`openFirstRow` katalog-row patch (`f0ffa01f`) barcha katalogga ishlaydi**
(bir xil `table.b-document-table` struktura). **SABOQ (products)**: ba'zi sahifa BUTUNLAY hardcoded-uz bo'lishi mumkin
(products formasi 0 i18n edi) → audit boshida `grep -c useTranslations` bilan tekshir; mirror sahifa (`/new`) ham bir
xil hardcoded → ikkalasini birga i18n qil (ikki xillik bo'lmasin).

Men avtomat (yangi sessiyada `davom et`):
1. session-start-audit workflow ishga tushaman (GO/NO-GO)
2. Bu NEXT.md → top «Aniq keyingi vazifa» (eng yangi entry). **DOCUMENT-FORM i18n CONVEYOR TUGADI**
   (money→sales→purchase→inventory→production, 5 guruh — 2026-06-02). Keyingi = top entry'dagi 3 variant:
   (1) Q2 detail audit davomi, (2) i18n cleanup sweeps (#15/#16/Provedeno), (3) list/nav audit.
3. (TARIXIY — conveyor jarayoni) Har `/new` forma o'zining to'liq-i18n `[id]` egizagini mirror qildi
   (`fields.*` + `pages.<doc>.*` + `form.*` kalitlarini qayta ishlatadi). Adversarial verify: 3-lens wf +
   grep 0 hardcoded Cyrillic/UZ + key-existence. Toolkit: `[[i18n-automation-toolkit]]`.
4. Gates: web typecheck + biome + full web suite yashil; husky o'tadi.
5. **Eslatma (eski detail-audit conveyor — TARIXIY, qachonki katalog-detail'ga qaytsa)**: katalog-card naqshi =
   `scripts/wf-counterparties-detail-audit.js`; money-doc = `wf-payments-in-detail-audit.js`; position-doc =
   `wf-moves-detail-audit.js`. Har modul uchun REF/OUR_PAGE paths + dimension'larni moslash.

**Q1.2 ishlatish (yangi vosita):** `pnpm audit:module <module>` har sahifa parity tekshiruvini
~3-5 min ga qisqartiradi. Web dev :3100 ishlab tursa live, aks holda `--static`. Topilgan
deltalar `docs/audits/<module>/todo.json` ga yoziladi. Bu Q4 mass-parallel uchun asosiy vosita.

**Diqqat:** Eski tavsiya (tax-rates katalog) endi **Q4 fazasiga ko'chirildi** — quality infra bo'lmasa,
yana 1 modul drift'ni kuchaytiradi. Q1 birinchi.

**Eslatma (port/dev)**: web dev **3100**, API **4000**, PG **5433**. Live capture creds `.env.local`da,
auth `.auth/moysklad.json`. **MUHIM saboq**: guard/DI yoki schema bo'lsa — typecheck yashil bo'lsa ham
**live smoke qil** (Reflector bug + null→400 bug ikkalasi ham faqat smoke/review'da chiqdi).

### Backlog (Sessiya 8+, tartib o'zgarishi mumkin)
1. **Sub-tab audit** (QISMAN BLOK — splash): contact-persons (Контрагент kartasi vkладка) +
   variants (Товар kartasi «Модификации») — haqiqiy tulbar referensini domen-bilim + reference
   loyiha (KONTRAGENTLAR) bilan olish. Live capture'siz.
2. Qolgan katalog **list** sahifalar: ~~projects~~ (✅ `04cbbe62`), contracts, productFolders, ... — capture + audit (har biri employees naqshi). (Eski inline "24/56" raqami olib tashlandi — drift-fix recount'idan keyin halol list count = **16/56**, line 511 yagona haqiqat.)
3. Capture S6/S8 GWT selektor flakiness (ikkilamchi, parity'ga ta'sirsiz).
4. Modal-level audit (TaskCreate, ProductPicker, va h.k.) — **QISMAN ✅ (2026-06-02)**: ~8 modul tekshirildi (8 toza) + 3 shared-leak fix; DOMINANT follow-up = hujjat-forma i18n (`docs/audits/modals-i18n-audit.md`).
5. Detail page audit (har sahifaning `/[id]` versiyasi) — **BOSHLANDI ✅ 34/63** (Q2, yuqoridagi bo'limga qara).
6. Eski-pattern money sahifalar shu helper'ga o'tkazish: counterparty-adjustments, prepayments, prepayment-returns.
7. products copy/move/prices/mass-edit uchun backend (kelajak — funksional parity).
8. **Employees account-lockout** (tracked, Sessiya 6 findingi): formal `owner` maydoni YO'Q +
   `JwtAuthGuard` har requestda `archived` qayta tekshirmaydi → 2 admin token oynasida bir-birini
   arxivlasa lockout. To'g'ri lechenie: owner-field / last-admin guard YOKI JwtAuthGuard archived
   re-check. Self-guard hozir asosiy footgun'ni yopadi. Tafsilot: employees/FINDING.md.
9. **audit:module ochiq deltalar — REAL parity gap** (Q1.2 topdi, 2026-05-31). Ikkala todo.json
   ham **ru-vs-ru** taqqoslangan (bizning UI ru-locale'da captured) → deltalar haqiqiy, til-shovqin
   EMAS. Aniq topilmalar:
   - **counterparties** (`static`): ~~bulk-archive label farqi — bizda «В архив»/«Из архива»~~ ✅ **YOPILDI
     2026-06-01** (`fix(i18n)` archive-label bug-class): shared `bulk.archive`/`bulk.restore` + `common.archive`/
     `common.restore` + `task_types`/`print_templates`/`pages.currencies` RU → «Поместить в архив»/«Извлечь из
     архива» (26 bulk dropdown + 22 detail-card button bir vaqtda; currencies status-badge `common.archived`'ga
     ko'chirildi; `pages.korzina.action_restore` = Корзина-restore → «Восстановить» ATAYIN tegilmadi; UZ
     «Arxivlash»/«Tiklash» tabiiy o'zbekcha, parity RU-side → o'zgartirilmadi; 3 UZ-assert test yashil).
     ~~Print dropdown **0/3 mos** hali OCHIQ — bizda «Список контрагентов», «...(Узбекистан)», «Настроить...» yo'q.~~
     ✅ **YOPILDI** `f2567e00` (2026-05-30) — `components/counterparties/print-dropdown.tsx` 3/3 enabled item
     (`print_menu_counterparty.list_export`/`list_export_uz` + `print_menu.configure`), page'ga wire qilingan + test.
     (2026-06-01 session-start audit topdi: backlog yozuvi stale edi, kod allaqachon to'g'ri.)
   - **customer-orders** (`live`): bulk **8/8 label mos** ✓; lekin `disabledMismatch` — «Удалить»/
     «Копировать»/«Провести» moysklad'da disabled, bizda enabled. Print: «Комплект...» (ASCII 3-nuqta)
     vs «Комплект…» (U+2026 ellipsis) byte-farqi + «Заказ» disabled-holat farqi.
   - **Pattern (bug-class)**: (a) *disabled-state* — moysklad amal qilib bo'lmaydigan punktni disable
     qiladi, biz enabled qoldiramiz → **hamma bulk dropdown'da tekshirilishi kerak**; (b) *Unicode
     ellipsis* «…» vs «...» → grep bilan barcha «Комплект»/«Настроить»/«...» label'larni audit qil.
   Bu ikki pattern Q4 mass-parallel'dan oldin shared-component darajasida yopilsa, 40+ modulda
   takrorlanmaydi.
10. **sales-returns + purchase-returns — qisman holat** (2026-05-31 audit topdi). Ikkalasida ham
    `useBulkDocumentActions` hook ulangan (funksional bulk) + ARIA struktura baseline bor (Q1.3'da
    captured), LEKIN **Phase-2 dropdown audit (capture+compare+fix) qilinmagan** va dedicated
    `bulk-actions-dropdown.tsx` komponenti yo'q → shu sabab 16/56 sanog'iga KIRMAYDI (to'g'ri — ARIA
    baseline ≠ dropdown parity audit). Vazifa: `pnpm audit:module sales-returns` (+purchase-returns)
    bilan dropdown deltalarini topib, shared `document-toolbar-menus` helper'iga moslash.
11. **✅ YOPILDI — 03-module EDIT-capture BUZUQ edi (2026-06-01 demands audit topdi, fix `e9a3d43b`+`cfde6b49`)** — `visual-captures/03-module/<doc>/`
    edit/detail PNG'lari (45-edit-default, 50-edit-tab-*, 58-detail-default + i-* set) «Корзина» list + stuck
    «Сохранение изменений» modal ko'rsatadi — capture skripti edit-form'ga yetib bormagan (save-modal dismiss
    qilinmagan). Dropdown meta JSON'lar ham buzuq (yagona «Показатели» artifact). customerorder edit-meta ham
    buzuq → **systemic**. **Ta'sir**: detail audit'lar visual parity'ni tasdiqlay olmaydi (demands DOM+kod-only
    qilindi). **Yechim**: capture skriptini tuzatish (edit'ga o'tishdan oldin save-modal'ni yopish + har dropdown'ni
    expand qilish) + 03-module re-capture. Bu Q2 detail audit'lar uchun ASOSIY bloker. customer-orders ishlagani —
    u DETAIL `59-detail-default.png` (toza) ishlatgan; lekin ko'p modulda edit-capture buzuq bo'lishi mumkin →
    har modul audit boshida reference-sifatni tekshir.
    **✅ FIX QILINDI (2026-06-01)**: `capture-moysklad-references.ts`ga **`--detail` mode** qo'shildi
    (`pnpm capture-moysklad <module> --detail` → `docs/moysklad-reference/<module>/detail/`): birinchi qatorni
    ochadi → **`dismissSaveModal` guard** (har snapshot'dan oldin «Сохранение изменений» modal'ni «Отмена» bilan
    yopadi — ildiz sabab tuzatmasi) → edit-default (DOM+screenshot) + 4 toolbar dropdown (menu-dump) + 5 tab.
    `DETAIL_STATES`/`DETAIL_DROPDOWNS`/`DETAIL_TABS` lib'da (7 test). Gates: scripts tc0 · 7/7 test · biome.
    **✅ LIVE-VERIFIED (2026-06-01, men o'zim ishga tushirdim)**: `pnpm capture-moysklad demands --detail` →
    `docs/moysklad-reference/demands/detail/` TOZA capture berdi (edit-default DOM+png + 4 dropdown + 2 tab).
    **2 selector bug topildi+tuzatildi**: (1) moysklad qatorlari `.list-row` EMAS — `<a href="#<route>/edit">`
    anchor → `openFirstRow` shunga o'tdi; (2) GWT `.gwt-PopupPanel` menyulari Escape'ni e'tiborsiz qoldiradi →
    `closePopups` (Escape + inert outside-click) qo'shildi (aks holda «Создать документ»/«Отправить» click timeout
    + tablar topilmaydi). PNG'lar gitignore (size policy); `*.html` DOM + `detail-metadata.json` commit qilinadi.
    **Topilgan REAL ma'lumot** (eski buzuq capture bera olmagan): «Изменить»={Удалить,Копировать}; «Создать документ»=
    **6 ta**{Перемещение,Счёт покупателю,Счёт-фактура выданный,Входящий платёж,Приходный ордер,Возврат покупателя}
    (bizda faqat 1!); «Печать»=**13 print-forma**; «Отправить»=10; **faqat 2 tab** (Главная+Связанные документы;
    Файлы/Задачи inline, История/События YO'Q). **KEYINGI = demands RE-AUDIT** shu toza reflar bilan
    (`demands/detail/` + metadata) → NEEDS-CAPTURE deltalarni yopish (ko'pi backend «Создать документ» endpointlari →
    DEFER, lekin «Печать» relabel + «Изменить» «Открыть в API» extra + tab-struktura aniqlandi).
12. ~~**mass-edit `ownerId` tenant-scoping bug-class (data-integrity, LOW sev)**~~ ✅ **YOPILDI (2026-06-01)** —
    shared `assertMassEditRefsInTenant(prisma, accountId, {ownerId, projectId})` helper (`shared/mass-edit.ts`)
    **23 ta** `massEditApply` service'ga ulandi (FINDING.md "~9" deb taxmin qilgan edi — haqiqiy son 23; bug
    `ownerId` HAM `projectId` (ikkala tenant-scoped FK) ni qamradi). Helper non-null FK'ni `employee`/`project`
    `findFirst({id, accountId})` bilan tekshiradi → cross-tenant → `BadRequestException`; null/undefined skip
    (FK tozalash). work-order inline `ensureOwner`'i ham shared helper'ga birlashtirildi (ikki xillik yo'q).
    Gates: api tc0 · biome (0 err, 1 pre-existing warn) · **2585 test pass** (5 yangi unit) · **live cross-tenant
    smoke 11/11** (`apps/api/scripts/verify-mass-edit-tenant-smoke.ts`: cross-tenant owner+project+mixed reject, same-tenant+null
    pass, demand[both-FK]+project[owner-only] variantlar). Manba: `projects/FINDING.md:58-71`.
13. ~~**Detail-header singular-title bug-class**~~ ✅ **YOPILDI (2026-06-02b)**. `<DetailHeader titlePrefix={...}/>`
    «{titlePrefix} № {name} от {date}» render qiladi → titlePrefix **singular doc type** bo'lishi shart, list-title (plural)
    emas. Adversarial 3-lens (money-docs) topdi → money guruhida 3 sahifa tuzatildi. Sweep qolgan 2 ta `t('title')` topdi:
    `price-lists/[id]` (=«Прайс-листы» plural BUG) + `payrolls/[id]` (=«Зарплата» borderline) → ikkalasi `tDetailTitles(...)`
    ga o'tkazildi + yangi `detail_titles.{price_list,payroll}` kaliti (RU «Прайс-лист»/«Зарплата», UZ «Narx ro'yxati»/«Ish
    haqi», ru+uz parity). Sweep tasdiq: butun `(app)/**/[id]` da boshqa `t('title')` titlePrefix YO'Q. Gates: web tc0 ·
    biome 0 err (2 pre-existing nursery warn payrolls'da, mening o'zgarishim emas) · key parity. Alohida commit (money-docs'dan keyin).
14. ~~**Hardcoded `titlePrefix` literallari — production detail sahifalar**~~ ✅ **TO'LIQ YOPILDI (2026-06-02f)**.
    inventory qismi 2026-06-02e (`internal-orders/[id]`). Production guruhi: `processings/[id]`→`tDetailTitles('processing')`
    («Техоперация»), `processing-orders/[id]`→`tDetailTitles('processing_order')` («Заказ на переработку»),
    `production/work-orders/new`→`tDetailTitles('work_order')` («Сборка / Производство»); `productions/[id]` allaqachon
    `tDetailTitles('production')` ishlatardi. Yangi `detail_titles.{processing,processing_order,work_order}` (ru+uz)
    qo'shildi. Production guruhi i18n bilan birga yopildi (commit'lar `c5598a34`/`6380f832`/`e64833ac`).
15. **Komment-maydon label divergensiyasi «Комментарий» vs «Описание» — cross-group bug-class** ✅ **YOPILDI `9d4dd1d3` (2026-06-02h)** (2026-06-02e inventory
    3-lens topdi). Hujjat komment maydoni moysklad'da «Комментарий» = `tFields('description')`, lekin ko'p `[id]`
    forma `tCommon('description')` («Описание») ishlatardi → `/new` («Комментарий») bilan farqlanardi. **Inventory guruhi
    ✅ birlashtirildi** (`tFields('description')`), so'ng **purchase-orders/[id] + invoices-in/[id] + payrolls/[id]
    `DocumentMetaField` `tCommon('description')`→`tFields('description')`ga `9d4dd1d3` bilan o'tkazildi** (#15 yopildi).
    CRM-entity tavsiflar (calls/contact-persons/opportunities/tasks) ATAYIN «Описание» qoldirildi (hujjat-komment emas).
16. **Email-template defaults hardcoded RU — `defaultSubject`/`defaultBodyHtml`** (2026-06-02 i18n-no-hardcoded
    test topdi; sales sessiyada DEFER deb belgilangan edi). 3 forma `[id]`: customer-orders, demands, invoices-out
    SendEmailDialog'ga RU-only subject + HTML-body beradi (UZ user rus email ko'radi). Bu **alohida workstream**
    (email-shablon i18n — HTML/ICU bilan). `i18n-no-hardcoded.test.ts` `EMAIL_TEMPLATE_PROP` orqali ATAYIN istisno
    qilingan (forma-maydon gate'i ≠ email-kontent). Yechim: `pages.<doc>.email_subject`/`email_body` kalitlari (ru+uz),
    `{name}` ICU arg. Past-o'rta sev.

---

## 📊 Joriy holat (2026-06-03i SNAPSHOT — MUZLATILGAN, jonli raqam ⚠️ EMAS)

> ⚠️ **Bu jadval 2026-06-03i holatining muzlatilgan surati (38/63 detail, A–F).** Jonli holat
> ALLAQACHON oldinda: detail **63/63 (A–L) ✅**, list_audits **71 (L1–L12 — barcha list cohort TUGADI)**. «live» yorlig'i olib
> tashlandi (yangi agent yanglitmaslik uchun). **YAGONA JONLI HAQIQAT MANBASI:** `pnpm progress` →
> `docs/progress.json`. Quyidagi A–F ro'yxati faqat tarixiy kontekst.
> Inflyatsiya **structural mumkin emas** (drift-fix sessiyasidagi "26/56" → "16/56" muammosi qaytarilmas yopildi).

| Bo'lim | Holat (2026-06-03i) | Manba |
|---|---|---|
| Phase 2 dropdown audit (list) | **16/56 = 29%** (12 dedicated + 3 shared assortment + 1 inline) | `docs/progress.json` |
| Metadata.json captured | **22 modul** (20 real + 2 splash) | `docs/progress.json` |
| Detail page audit | **38/63 = 60%** (… · payments-out · **proc.-orders·processings·productions** (A) · **enters·losses·inventories·internal-orders** (B) · **boms·processes·stages·work-orders** (C) · **prepayments·prepayment-returns·counterparty-adjustments** (D) · **retail/sales·retail/sessions** (E) · **bundles·services·variants·tracking-codes** (F) ✅; seed-bor hujjat 6/6 + 5-katalog + 2-qaytarish + Счёт 2/2 + Buyurtma 2/2 + Платёж 2/2 + production 3/3 + stock/internal 4/4 + production-config 4/4 + catalog-items 4/4) | `docs/progress.json` |
| PositionEditor i18n sweep | **13/13 detail sahifa ✅** (shared-komponent fix, audit≠sweep) | this session |
| Modal audit | per-modal **~8/100+** (8 toza) + 3 shared-leak fix (`eb82668e`·`70d01ce0`·`fa4973af`); DOMINANT = hujjat-forma i18n | manual |
| Navigation graph | **0%** ⚠️ | manual |
| Mass-edit endpoints (backend) | **23** | `docs/progress.json` |
| Phase 3 stateful | **0/56** (boshlanmagan) | manual |
| Phase 4 reference-check | **0/56** (boshlanmagan) | manual |

**Strategiya** (foydalanuvchi 2026-05-29 tanladi): Variant 1+2 aralash
- Hozirgi sessiya'larda: Workflow bilan **dropdown-level Phase 2** ni hamma 56 sahifaga tarqatish (5-6 sessiya)
- Keyin: Top 10 sahifaga to'liq 4-faza sertifikat
- Modallar: alohida audit pass
- Cross-page navigation: graph audit
- Detail page'lar: parallel oxirgi

**Realistik vaqt**: ~200+ sessiya = **5-7 oy** (kuniga 1-2 sessiya). Yuqoridagi
«⚠️ TIMELINE TUZATILDI (2026-05-31)» bo'limi (≈line 1070) yagona haqiqat — eski «6-8 hafta»
raqami 2026-05-31 audit'da rad etildi (Cal.com 5 yil, NocoDB 4+ yil case-study'lari).

---

---

## §4 — Drift-fix sessiyasi 2026-05-31 (NEXT.md 2616–2648-qatorlar edi)

## 🔧 Drift-fix sessiyasi (2026-05-31) — oldingi 9 sessiya kamchiliklari

Foydalanuvchi so'rovi: "har bir sessiya'dagi kamchiliklarni o'rganib chiqib tuzat".

### Topilgan + tuzatilgan deltalar

| # | Topilgan kamchilik | Sweep | Fix |
|---|---|---|---|
| 1 | **counterparty Copy fake `/clone` 404** | Boshqa katalog'lar tekshirildi: assortment OK (disabled), supplies/demands/customer-orders OK (real endpoint bor) | counterparty Copy `disabled` qilindi + commit `(this session)` |
| 2 | **NEXT.md "26/56" inflyatsiya** | Real count: 12 dedicated + 3 shared = ~16 = 29% | Halol recount qo'shildi |
| 3 | **Mass-edit live smoke faqat money** | 18 ta untested modul tekshirildi | **8 modul live tasdiqlandi** (customer-orders, demands, supplies, sales-returns, purchase-orders, purchase-returns, invoices-out, work-orders), 10 skip (seed bo'sh) |
| 4 | **Adversarial QA tor doirada** | 4 ta module'da 3 ta adversarial test (empty/invalid/missing) | **12/12 pass** |
| 5 | **HR DI bug naqshi (other Guards)** | 4 ta guard tekshirildi | Clean — boshqa joyda yo'q |
| 6 | **Husky shebang naqshi (other hooks)** | 2 ta hook tekshirildi | Clean — ikkala hook ham shebang bilan |
| 7 | **counterparties/products mass-edit 404** | UI gating tekshirildi | onMassEdit page'larda yo'q → dropdown to'g'ri disabled (fake call yo'q) |

### Yangi qo'shildi
- **`SESSION-CHECKLIST.md`** — har sessiya yakunida MAJBURIY chequedan o'tish
- **Adversarial test pattern**: empty/invalid/missing UUID + concurrent (last-write-wins) — 4 modul'da tasdiqlangan
- **Halol coverage** raqami: 12/56 dedicated (29% inc. shared), 0/62 detail page

### Keyingi sessiya — drift'siz davom (⚠️ TARIXIY — 2026-05-31 holati, allaqachon bajarildi)

> **Eslatma (2026-06-01):** Bu bo'lim 2026-05-31 drift-fix sessiyasi yakunidagi
> tavsiya edi. **№1 (Detail page audit) BAJARILDI** — Q2 boshlandi, hozir **34/63**
> (yuqoridagi «Q2 — Detail page urgent gap» bo'limi = yagona joriy haqiqat).
> Quyidagi top-5'ning hammasi tugadi: customer-orders · demands · ~~invoices-out~~
> (seed bo'sh, o'rniga supplies/cash-in/moves/payments-in) · products · counterparties.
> Bu ro'yxatni tarixiy kontekst sifatida qoldiramiz, lekin amal qilmaydi.

1. ~~**Detail page audit boshlash**~~ ✅ BAJARILDI (Q2, 34/63) — top-5'ning hammasi tugadi
2. Yoki: **Modal audit** (MassEditModal, ProductPicker, TaskCreate, va h.k.) — hali 0%
3. Yoki: **Phase 2 list-page davom** (~40 sahifa qolgan, lekin past ROI)
