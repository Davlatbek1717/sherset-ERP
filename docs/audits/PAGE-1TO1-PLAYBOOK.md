# Sahifani moysklad bilan 1:1 qilish — PLAYBOOK (qoidalar · xatolar · prompt)

> Har bir sahifani (list + /new + /[id]) **sertifikatlangan 1:1 moysklad.uz** ga yetkazish uchun
> qayta ishlatiladigan jarayon. Birinchi nishon: **`/enters` (Оприходования)**.
> Asos: `CLAUDE.md` (loyiha qoidalari) + `goal` skill + to'plangan bug-class tajribasi.
> **Oltin qoida:** «ishlaydi» ≠ «to'g'ri ishlaydi». Sifat hech qachon kenglik uchun qurbon qilinmaydi.

---

## 0. Bir sahifaning 4 fazasi (har biri tugamaguncha keyingisiga o'tilmaydi)

| Faza | Nima | Chiqish (Definition of Done) |
|------|------|------------------------------|
| **G — Grounding** | Jonli moysklad.uz + JORIY kod'ni yonma-yon o'qish | har element uchun verdict + `file:line` dalil + falsifiable ijro-navbat |
| **B — Build/Fix** | Har element = alohida flagship | tsc0 · biome0 · vitest yashil · guard-test · jonli cert · commit |
| **Q — QA (adversarial)** | Real brauzer + edge/concurrency/money/tz | topilgan buglar issiq-kontekstda tuzatiladi |
| **H — Handoff** | Halol status yozish | NEXT.md/memory + qolgan navbat; «done» faqat 100% bo'lsa |

---

## A. QOIDALAR (har element uchun majburiy)

1. **GROUNDING-FIRST — taxmin EMAS.** Ishlashdan oldin moysklad'dagi aynan shu sahifani **jonli** ko'r
   (online.moysklad.uz, **faqat read-only** — hech narsa yozma/o'zgartirma). Hujjat/`.md`/handoff eskirgan
   bo'lishi mumkin — ularga ishonma, jonli DOM bilan tasdiqla. Hisob O'zbekiston → `.uz` domeni (`.ru` timeout beradi).

2. **ELEMENT-BY-ELEMENT.** Har maydon · label · ustun · tugma · menyu · filtr · placeholder · xulq (sort,
   pagination, validatsiya, default qiymat) alohida tekshiriladi. «Umuman o'xshaydi» = YETARLI EMAS
   (visual≠functional bug-class). Har element 3 holatdan biri: **DONE** (1:1) · **ACTIONABLE** (farq bor, tuzatish) ·
   **GATED** (ground qilib bo'lmaydi — DEFER + sabab).

3. **PROVENANCE (kelib chiqishi).** Har element uchun: u qayerdan keladi? (built-in default · admin Настройки'da
   yaratadi · user qayerda yaratadi · per-record egasi). Dalil bilan — nafaqat pikselni, ma'lumot-manbasini ham 1:1 qil.

4. **§4 LABEL-GROUNDING INTIZOMI.** RU label tanlashda **DOM-rolni** o'qi, grep-count'ni EMAS. So'z element
   kontenti sifatida (`>LABEL<`, `gwt-Label">LABEL</div>`, column `title="LABEL"`) field-rolida turibdimi —
   shuni tasdiqla. Banner/help-text ichidagi so'z = grounding EMAS. Capture'da umuman yo'q bo'lsa →
   products-reference terminini ol yoki **DEFER**, taxmin qilma. `apps/web/src/__tests__/label-grounding.test.ts`
   registry'siga yangi audited labelni qo'sh.

5. **GATE (commit oldidan, majburiy):** `pnpm --filter @moysklad/api typecheck` 0 · `pnpm --filter @moysklad/web typecheck` 0 ·
   `biome check` 0 · tegishli vitest yashil (regress yo'q) · i18n key-existence ru+uz + no-hardcoded · yangi
   kodga **non-vacuous guard-test** (mock'da SQL/report isbotlanmaydi — u jonli cert bilan).

6. **JONLI CERT (majburiy):** Playwright `:3100` — sahifa render bo'ladi · asosiy flow ishlaydi · network 2xx ·
   **0 console-error**. Money/aggregatsiya bo'lsa — **real ma'lumotda matematik ayniyatni tekshir**
   (mock'dan kuchliroq). Ma'lumot yetishmasa — halol «source-verified, populated-render YO'Q» deb belgila.

7. **HALOL STATUS.** Natija har doim **«Phase-1: strukturaviy, runtime-tasdiqlanmagan»** yoki **«Phase-2 verified»**
   deb aniq belgilanadi. **TAQIQ:** 100% bo'lmagunча «done / 1:1 / verified / production-ready» demaslik. Qarz ko'rinib tursin.

8. **COMMIT INTIZOMI.** Conventional Commits; subject ≤100 belgi, ASCII bilan boshlan; tana'da **konkret dalil**
   (tc0 · guard-N · jonli-cert), «verified/complete/green» so'zlaridan qoch (Husky honesty-gate rad etadi).
   Faqat **o'z fayllaringni** commit qil: `set -f; git --literal-pathspecs add '<path>'…` → `git commit -F -`
   (`(app)` qavslari + `[id]` glob shuni talab qiladi).

9. **MULTI-AGENT XAVFSIZLIK.** Bir ishchi-daraxtda parallel agent: har biriga «HECH QANDAY git buyrug'i —
   stash/diff ham yo'q» kontrakti; markaziy schema o'zgarishini AGENTLARDAN OLDIN commit qil; qaytgach
   `git status` + `git stash list` bilan daraxtni O'ZING tekshir; diff'ni O'ZING o'qi (agent da'vosiga ishonma).

10. **SCOPE & KONTEKST.** 1 element = 1 flagship → gate → cert → commit. Kontekst juda kattalashsa — **toza to'xta**,
    handoff bilan keyingi sessiyaga uzat (kontekst narxi ~kvadratik). Mexanik/keng ish → deterministik
    script/codemod (0 token) yoki tightly-scoped agent; hukm/money ish → o'zing yoki agent natijasini o'zing verify.

---

## B. XATOLAR / BUG-KLASSLAR (aynan bulardan qoch — har biri real tajriba)

| # | Bug-class | Belgi | Qanday qochish / Guard |
|---|-----------|-------|------------------------|
| B1 | **Capture-grounding** | label banner/help-text'dan olingan, field-rol emas | DOM-rolni o'qi (A§4); `label-grounding.test.ts` |
| B2 | **Label misgrounding** | «Поставщик/Покупатель» (aslida **Контрагент**); «Получено» (≠ moysklad termini); «Срок оплаты» (aslida «План. дата оплаты») | element-rol vs hujjat/menyu/kolonka nomini farqla; field label universal |
| B3 | **Visual ≠ functional** | «look 1:1» deb da'vo, lekin chuqur funksiya (modal/menu/edit/validatsiya) yo'q | read-only el-by-el jonli walkthrough; har xulqni sina |
| B4 | **Money/BigInt** | Float drift (0.1+0.2≠0.3); BigInt JSON'da crash; minor-unit ×100 xato | Decimal/BigInt; JSON'da `.toString()`; minor (tiyin) sifatida saqla |
| B5 | **Multi-currency footer** | «Итого» hardcoded UZS sum (turli valyutalarni qo'shadi) | `groupBy(currency)`; aralash bo'lsa «—»; `footerMoneyCells` |
| B6 | **rateValue silent-drop** | non-UZS hujjat rate 1.0'da saqlanadi (Zod e'lon qilinmagan maydonni tashlaydi) | Create/Update schema'ga har maydonni e'lon qil |
| B7 | **i18n leak** | RU matn uz'da; hardcoded Cyrillic tsx'da; kalit ru bor uz yo'q | i18n key-existence ru+uz + no-hardcoded; har label kalit orqali |
| B8 | **sortBy 400** | validatsiyasiz sort maydoni → 400/crash | sortBy whitelist (zod enum) |
| B9 | **date-tz** | date-only range Tashkent kunini noto'g'ri kesadi; `<= dateTo` oxirgi kunni tushiradi | `reportDateBounds` (half-open `[gte,lt)`, UTC+5) |
| B10 | **Cross-tenant FK** | assortmentId/storeId/agentId boshqa account'niki yozilади | har FK'ni `accountId` bilan guard (`assertFksInAccount`) |
| B11 | **Concurrency** | lost update; reservation race; parallel post | optimistic-lock (version); Serializable + lockBalances; exact-reversal |
| B12 | **Placeholder** | CatalogPicker'da placeholder (moysklad'da YO'Q) | global: placeholder render qilinmaydi (label chapda nomlaydi) |
| B13 | **Reference input** | faqat tugma→modal (moysklad: yozib-filtrlash + chevron→modal) | `inlineFetcher` + `onInlineSelect` ber |
| B14 | **Shared-index sweep** | parallel sessiya mening fayllarimni o'z commit'iga oladi | faqat `git add '<own-path>'`; qaytgach commit tarkibini tekshir |
| B15 | **lint-staged MM** | `progress.json` (generated) `MM` → stash/restore konflikt | partially-staged generated faylni stage qilma; `git reset` keyin faqat o'z fayl |
| B16 | **Mock vacuous test** | report SQL mock'da «test» qilinadi (hech narsa isbotlamaydi) | jonli cert + real-data ayniyat; mock faqat JS-logikani |
| B17 | **Stale comment/doc** | schema/doc izohi eskirgan («supply (future)» — aslida yozyapti) | jonli kod/DB bilan tasdiqla, izohga ishonma |

---

## C. PROMPT'lar (qayta ishlatiladigan shablonlar)

### C1. GROUNDING agent (har element/sahifa uchun — read-only audit)
```
TASK: moysklad.uz <PAGE> (<hash>) ni JORIY kod bilan ground qil — <element/ssection>.
CONTEXT:
- Jonli: online.moysklad.uz #<hash> (READ-ONLY — yozma). UZ hisob → .uz domeni.
- Joriy kod: apps/web/src/app/(app)/<page>/page.tsx (+ /new, /[id]); apps/api/src/modules/<mod>/*.
- Reference (eskirgan bo'lishi mumkin): docs/moysklad-reference/...
DO: jonli DOM'dan har field·label·ustun·tugma·filtr·placeholder·xulqни ajrat (browser_evaluate bilan
    text+role+href). Joriy kod bilan solishtir. §4: labelni DOM-rol bilan tasdiqla.
RETURN (structured): har element uchun {element, moysklad_qiymati (dalil: DOM-rol/selector),
    joriy_kod (file:line), verdict: DONE|ACTIONABLE|GATED, fix_eskizi}. Taxmin QILMA — GATED+sabab.
DO NOT: kod o'zgartirma; git buyrug'i ishlatma; moysklad'da hech narsa bosma/yozma (read-only).
```

### C2. IMPLEMENTER agent (mexanik/aniq fix — tightly scoped)
```
TASK: <element> ni 1:1 qil — <aniq o'zgarish>.
CONTEXT (skip etma):
- Mirror qilinadigan pattern: <file:line> (mavjud gold-standard).
- Ground-truth: <grounding verdictidan moysklad qiymati + dalil>.
- Constraint: <money minor·BigInt·tenant guard·tz·i18n ru+uz>.
DELIVERABLES: [ ] <file> <aniq o'zgarish>; [ ] i18n ru+uz; [ ] guard-test (non-vacuous).
QUALITY GATES (qaytishdan oldin): tsc 0 · biome 0 · tegishli vitest yashil · 0 yangi lint.
DO NOT: HECH QANDAY git buyrug'i (stash/diff/add/commit ham YO'Q). 'any' ishlatma. Schema'dan tashqari
    maydon qo'shma. Money'ni Float qilma. Cyrillic'ни tsx'ga hardcode qilma (i18n kalit).
RETURN: o'zgargan fayllar (path + qator) + test delta + ISHLAMAGAN narsa + sababi.
```

### C3. ADVERSARIAL-QA agent (struktura-only sahifa uchun — FE+BE manba audit)
```
TASK: <page> FE+BE manbasini adversarial audit qil (B-jadvaldagi bug-class'lar bo'yicha).
CHECK: money-format(B4/B5) · rateValue(B6) · i18n-leak(B7) · sortBy(B8) · date-tz(B9) · cross-tenant-FK(B10) ·
    concurrency(B11) · null/empty/unicode/overflow edge.
RETURN (structured): {severity: HIGH|MED|LOW, bug-class, file:line, repro, fix_eskizi}. Refute-default
    (ishonchsiz bo'lsa «yo'q» de). DO NOT: kod/git o'zgartirma.
```

---

## D. BIRINCHI NISHON — `/enters` (Оприходования)

- **Jonli:** online.moysklad.uz `#enter` (list) · create-form · detail. UZ hisob → `.uz`. **Read-only.**
- **Joriy kod:** `apps/web/src/app/(app)/enters/{page,new/page,[id]/page}.tsx` ·
  `apps/api/src/modules/enter/{enter.controller,enter.schema,enter.service}.ts`.
- **Ma'lum kontekst:** «Оприходование» = ombor kirimi (sababsiz/inventarizatsiyadan); hujjat-meta inputlar
  allaqachon inline (`8b8b97cf`); list filtrlari hali legacy (B13 navbatda).
- **Navbat:** (G) jonli ground list+new+detail → falsifiable queue → (B) element-by-element fix → (Q) adversarial QA → (H) handoff.
- **Status (2026-06-21b):** LIST kolonkalari ✅ **DONE + jonli-cert** (clean capture `00-clean-default.html` =
  haqiqiy «Оприходования» list bilan ground). Filtr paneli + create + detail = jonli moysklad grounding hali kerak
  (browser login parolni transkriptga chiqaradi + moysklad.uz noturg'un → API-doc bilan ground qilindi, jonli emas).

### D.1 LIST kolonka audit (2026-06-21, `0292508a` + `efc3dd3e`) — ✅ TUGADI
Clean capture `06-module/enter/dom/00-clean-default.html` (`<title>Оприходования</title>` — **haqiqiy list**, qolgan
58 capture ifloslangan «Корзина»/Заказ поставщику) grid `header-content title=` hujayralaridan ajratilgan haqiqiy
moysklad default grid: **№ · Время · На склад · Организация · Сумма · Валюта · Отправлено · Напечатано · Комментарий**.

1. ✅ **Default ustunlar moysklad'ga moslandi** — artifact key'lar (`'all'/'draft'/'posted'/'cancelled'`) olib
   tashlandi; default = name·moment·store·organization·sum·**currency·published·printed·description** (moves
   gold-standard'ni aynan mirror). `state`/`positions` gear-only (off). Jonli-cert :3100: 9 kolonka tartibda,
   Валюта=«сум»×9 populated.
2. ✅ **«Причина» (reason) kolonka OLIB TASHLANDI** — `reason` moysklad'da hujjat-maydoni EMAS (pastga qara), shuning
   uchun hujjat-list'da «Причина» ustuni bo'lmaydi (moysklad grid'ida ham yo'q). aria-snapshot regen qilindi.
3. ✅ **«На склад» label tasdiqlandi** — `store` ustuni `fields.store_to`=«На склад» (capture header bilan mos).

### D.2 create/detail/reason — API-doc bilan grounded divergensiyalar (NAVBAT, jonli tasdiq kerak)
`docs/moysklad-reference/api-docs-official/documents/_enter.md` (rasmiy) bilan solishtirildi:

- 🔴 **`reason` MODEL NOTO'G'RI (HIGH, data-model):** biz `reason`'ni **hujjat-darajasidagi enum**
  (`initial/found/gift/correction/other`) qilganmiz. moysklad'da hujjat-darajasida `reason` YO'Q — u **position-darajasidagi
  `String(255)`** («Причина оприходования данной позиции», erkin matn). → Tuzatish KATTA: schema.prisma (Enter.reason →
  EnterPosition.reason String), migration, service, create/detail formalar, i18n. Alohida flagship. (B2/B3 bug-class.)
- 🟡 **overhead distribution `QUANTITY` ortiqcha (MED):** bizda `['WEIGHT,PRICE,VOLUME,QUANTITY']`; moysklad enter
  overhead distribution = faqat `[weight, volume, price]` (QUANTITY yo'q). FE select + schema enum'dan olib tashlash
  (supply bilan shared `distributeOverhead` — supply doc'ni ham tekshir, balki u QUANTITY'ni qoplaydi).
- 🟡 **«Доступ» (owner/group/shared) create form'da yo'q (MED):** moysklad enter'da Владелец/Отдел/Общий доступ bor;
  bizning create form ularni ko'rsatmaydi (owner server'da hard-stamp). Sibling create formalar (supply/move) ham
  ko'rsatmasligi mumkin → family-wide tekshir.
- ⏭️ **Filtr paneli (B13):** hali jonli ground qilinmagan (clean capture filter'siz default view; ifloslangan
  capture'lardan filter ajratib bo'lmaydi). InlineFilterPanel pattern = loyiha konvensiyasi (settled). Faqat
  **qaysi filter MAYDONLARI** moysklad'da bor — jonli grounding kerak.

### D.3 LIST ✅ + CREATE/DETAIL navbat (2026-06-21b jonli grounded — `docs/audits/enters-live-2026-06-21/`)

**LIST = 1:1 DONE (jonli-cert):** kolonkalar (`0292508a`) · filter panel (`b261732f`) · «Итого» footer (`71ed06a2`).
Qolgan list mayda: filter-grid wrap-eni (4/5/4 vs moysklad 5/6/3 — shared `InlineFilterPanel`, hammaga ta'sir) ·
search placeholder «Номер или комментарий» (hozir «№,причина,комментарий» — ru/uz.json parallel-contended) ·
create-button label «Оприходование» (hozir «Yangi kirim»). Bu 3 tasi i18n/shared-komponent — alohida.

**CREATE forma — jonli side-by-side deltalar** (`our-enters-new-2026-06-21.png` vs `20-enter-create.png`):
| Element | Bizда | moysklad | Tur |
|---|---|---|---|
| «Проведено» checkbox | UNCHECKED | **CHECKED** + create POSTED qiladi | BE (applicable→post-on-create) |
| «Sabab» (Причина) doc-maydon | BOR (dropdown) | **YO'Q** (reason = position-darajа) | data-model migration (QA #5) |
| «Валюта документа» | YO'Q | **BOR** («сум (UZS)» ✎) | multi-currency (yoki display-only) |
| «Накладные расходы»+«Распределить» | META panelда (tepada) | **pастда, Итого yonida**, «по цене» link | layout + default by-price |
| Meta ✎ edit-qalam (Орг/Скл/Вал) | YO'Q | **BOR** | wiring (entity editor) |
| Проект «+» tugma | YO'Q | **BOR** | wiring (create-project) |
| Position «Цена» kolonka | YO'Q (faqat Сумма) | **BOR** (Цена▾ + Сумма) | FE position col (cost/unit) |
| Position «Причина оприходования» kolonka | YO'Q | **BOR** (per-position reason) | migration (QA #5) |
| Position «Ячейка/Остаток/ГТД/РНПТ/Страна» | YO'Q | BOR (⚙-optional ehtimol) | BE feature (katta — ⚙ default tekshir) |
| Position-add | «+ Добавить позицию» tugma | inline «введите наименование…» + «Добавить из справочника» | FE (inline search row) |
| «Итого» pастда | «Pozitsiyalar:N / Jami summa» quti | sodda «Итого: 0,00» | FE layout |
| cost > 0 validatsiya | MAJBUR | 0 ruxsat (gift/found) | FE bir qator (QA MED) |

**DETAIL** ≈ create (edit rejimда) + state/author header + populated Изменить/Печать/Отправить + posted-da read-only.
Position-gear (⚙) DEFAULT vs optional kolonka to'plamini aniqlash uchun hali capture kerak (v2 gear-click muvaffaqiyatsiz).

**✅ DONE 2026-06-21b (user «to'liq 1:1, hammasini»):** (1) `reason` migration doc-enum→per-position String — BE `358ba950`
(EnterPosition.reason + migration `20260621000000`, doc-reason deprecated) + /new `d4e6c0b4` (PositionTable `reason` col +
«Цена» col, Sabab dropdown olib tashlandi) + /[id] `3a0acbd0` (dead Sabab olib tashlandi + data-loss guard: PositionRow.reason
carry, save wipe qilmaydi). End-to-end API-cert (position.reason persist + PATCH-preserve). PositionTable «Цена» allaqachon /new'da.

**✅ DONE 2026-06-21c (continuation):** «Валюта документа» disabled «сум (UZS)» /new `17a601fb` + /[id] `3199ff90`; bottom «Итого»
+ «Накладные расходы» pастga + by-price + QUANTITY drop + cost≥0 `7538a911`; **«Проведено» ATOMIK post-on-create `b913d343`** (BE
applicable→create+post bitta Serializable tx, partial-state YO'Q; API-cert posted+sumMinor+stock); **✎/+ affordances `ea292146`**
(Орг/Скл/Вал/Проект → settings yangi tab'da, create-forma yo'qolmaydi).

**Keyingi sessiya (qolgan — shared-component/struktura, katta-kontekstда riskli → focused follow-up):** (f) **PositionEditor reason-EDIT
COLUMN** (/[id]'da per-position sababни TAHRIRLASH; hozir faqat preserve) — RISKLI: PositionEditor CSS-grid BARCHA doc-detail'da
ulashilgan, header/row column-count mismatch hammasini buzadi (CO smoke-test bir marta tutgan); customs `gtdNumber` opt-in mirror.
(b2) /[id] ✎/+ pencils + /[id] overhead-relocate (struktura: DetailContentTabs+PositionEditor ≠ /new). «Кол-во б. ед.»→«Кол-во»
(shared label, i18n kerak); inline position-add; advanced cols Ячейка/Остаток/ГТД/РНПТ/Страна (⚙-optional).
Adversarial-QA (24 topilma, 5 HIGH): `docs/audits/enters-module-qa-2026-06-21.md`. Family-wide cross-tenant FK
(assortmentId/projectId) = supply/move/enter birga, koordinatsiyalangan fix (enter-only EMAS).
