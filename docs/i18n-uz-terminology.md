# Uzbek-locale terminology policy (i18n) — canonical glossary

> **Status**: ADOPTED 2026-06-02 (user decision: "full literary canonicalization").
> Backlog **#20** is executed against this doc. This is the single source of truth
> for Uzbek accounting/document terminology in `apps/web/src/messages/uz.json`.
> RU (`ru.json`) is the byte-exact moysklad parity anchor and is **already correct
> and internally consistent** — every decision below is **uz-only** unless noted.

## Guiding principle

**Professional Uzbek = literary / calqued Uzbek, NOT Russian-loanword transliteration.**
A small, principled whitelist of naturalized internationalisms is retained: **faktura**
(only inside the compound `hisobvaraq-faktura`), **kontragent**, **akt**, **order**,
**realizatsiya** (revenue sense only). **Zero raw transliteration** (`schyot`,
`provedeno`, `otgruzka`, `spisaniye`, `oprixodovaniye`, `nakladnaya`) in UI labels.

The decisive test for any string: *prefer the word a literate Uzbek accountant actually
reads on soliq.uz and in moysklad.uz's own Uzbek UI.* For a 1:1 clone of moysklad.uz this
is not a style preference — it is **parity to the source product's own localization**.

### Evidence (why this reverses the earlier «schyot» convention)

- The term most tempting to transliterate, «Счёт-фактура», is rendered **`hisobvaraq-faktura`**
  by the government itself (lex.uz decrees 522-son, 3136-son; soliq.uz ЭСФ; norma.uz; didox.uz)
  and by **moysklad.uz/uz**. `schyot-faktura` appears in **no** current official or vendor source.
- moysklad.uz/uz renders «выставление счетов» as **`hisobvaraq taqdim etish`** (Счёт = `hisobvaraq`),
  and titles the payment bill **`to'lov hisobvarag'i`**.
- Official MoySklad Uzbek help (support.moysklad.ru/hc/uz): «Провести» → **`o'tkazish`**
  («hujjat o'tkazish belgisi»); «Отгрузка» → **`Tovarlarni jo'natish`**; «Списание» →
  **`hisobdan chiqarish`**; «Накладная» → **`yuk xati`**.
- ⚠️ **Prior session #19 (and the 2026-06-02j schyot fixes) unified invoices-out to `schyot`.
  That ran against the source product and is REVERSED here** (`Счёт` → `hisobvaraq`). The
  earlier work was still net-positive: it corrected a document-type error (`Счёт-фактура`
  mislabelling a `Счёт` referent); this pass converts the now-correct `schyot` → `hisobvaraq`.

## Decision matrix

| # | Concept (RU) | UZ (chosen) | Rejected | Scope | ~occ | Guard |
|---|---|---|---|---|---|---|
| 1 | Счёт-фактура (ЭСФ, factures doc) | **hisobvaraq-faktura** (el.: «Elektron hisobvaraq-faktura (EHF)») | schyot-faktura, hisob-faktura | uz-only | 21 | suffix `-faktura` makes it unambiguous; include lone `hisob-faktura`@4076 |
| 2a | Списание (losses doc) | **hisobdan chiqarish** | spisaniye, chiqim, o'chirish | uz-only | 2–4 | keep `yo'qotish` where RU=Недостача/Потери (loss-category, not the act) |
| 2b | Оприходование (enters doc) | **kirim** (act: **kirim qilish**) | oprixodovaniye, qabul qilish | uz-only | 4 | `qabul qilish` = приёмка (supplies), a different act — don't fold |
| 3 | Провести/Проведён/Проведение (post) | **o'tkazish** (verb) · **o'tkazilgan** (state) · ledger «buxgalteriya o'tkazmalari» | provedeno, tasdiqlash | uz-only | 69 | **role-aware**: verb-keys→`O'tkazish`, state-keys→`o'tkazilgan`, sentence-embedded→rephrase. `tasdiqlash`=Подтвердить (ЭСФ sign) is DIFFERENT — keep distinct |
| 4 | Счёт / Счёт на оплату (invoices-out doc) | **hisobvaraq** (doc «Mijozga hisobvaraq»; payment-emphatic «to'lov hisobvarag'i») | schyot, hisob (alone), hisob-faktura | uz-only | 90 | **referent-guard**: do NOT touch the ~44 `hisob` that mean a GL/bank/tax ACCOUNT (`fields.organization_account`, soliq tax-account). Only doc-type `schyot` where RU twin = «Счёт покупателю/Счета покупателям». **REVERSES #19** |
| 5 | Отгрузка/Реализация (demands doc) | **jo'natma** (doc) · **jo'natish** (act) | otgruzka, yuk berish, yuborish | uz-only | 6 | per-sentence: doc-title→`jo'natma`, act→`jo'natish`. **Keep `sotuv` (21)** = sales-revenue, different referent |
| 5b | demand `delivery_planned` (Планируемая дата отгрузки) | **«Rejalashtirilgan jo'natish sanasi»** (demand route ONLY) | «yuk berish» (3rd stray variant) | uz-only | 1–2 | **HIGH drift**: key reused with 3 RU referents (отгрузки=jo'natish · поставки=yetkazib berish · выпуска=chiqarish). Change ONLY the demand instance |
| 6a | Покупатель vs Клиент | **xaridor** (buyer-on-doc) · **mijoz** (CRM client) · **kontragent** (counterparty) | folding either way, pokupatel/klient | uz-only | 1 | referent-only: `fields.customer`@646 → `xaridor` IFF RU twin=«Покупатель»; else keep `mijoz`. Establish rule going forward |
| 6b | Накладная (waybill) | **yuk xati** (TTN: «tovar-transport yuk xati») | nakladnaya | uz-only | 1 | `print_menu_supply.prixodnaya`@205: keep RU print-form title if it labels a printed template; else `Kirim yuk xati` |

Whitelist (KEEP as-is): `faktura` (only in `hisobvaraq-faktura`), `kontragent`, `akt`,
`order`, `realizatsiya` (revenue), `sotuv` (sales), `inventarizatsiya`.

## Sweep order (lowest-risk → highest) + status — ✅ ALL DONE 2026-06-02

1. ✅ **Счёт-фактура → hisobvaraq-faktura** (21) — `1212c4dc`.
2. ✅ **Списание → hisobdan chiqarish** + **Оприходование → kirim** (22) — `eb3a8c3c`.
3. ✅ **Провести → o'tkazish/o'tkazilgan** (69) — `5a092316`, 3-lens PASS. Closed #20 «Provedeno».
4. ✅ **Счёт → hisobvaraq** (71) — `3834f59f`, 3-lens PASS. **REVERSED #19** (was schyot). Morphology q→g'.
5. ✅ **Отгрузка → jo'natma** (28) + `delivery_planned` 3-referent fix — `0c045638`, 3-lens PASS. `sotuv` kept.
6. ✅ **Sweep 7 — residual transliterations** (51) — `2fcc1fa5`, 3-lens PASS: Приёмка `Priyomka→Qabul` ·
   Перемещение `Peremeshcheniye/-iya→Ko'chirish` · Заказ `Zakaz→Buyurtma` · standalone `Faktura→Hisobvaraq`
   (RU «Счёт») · `Otkazma→Jo'natma` · `Prixodnaya/Rasxodnaya nakladnaya→Kirim/Chiqim yuk xati` · `incoming_doc→Kiruvchi №`.

### ✅ Deferred-tail — DONE 2026-06-02 (user: "eng professional usul")

7. ✅ **Sweep 8 — `ПКО`/`РКО` → `Kirim`/`Chiqim order`** (10) — `df9017da`. Cyrillic removed from the
   Latin locale; matches nav `Kirim orderlar`. RU keeps ПКО/РКО (anchor untouched).
8. ✅ **Sweep 9 — `mijoz` ↔ `xaridor` referent split** (69→xaridor, 14 kept mijoz, 1→kontragent) — `d603e98e`,
   3-lens PASS. Document «Покупатель» → `xaridor`; CRM «Клиент» → kept `mijoz`; retail «Контрагент» → `kontragent`.
   Matches moysklad.uz («sotuvchi↔xaridor» on the bill, `mijoz` for CRM). `fields.customer` → `xaridor`.

**#20 is now 100% complete — no deferred items.** Remaining `mijoz` (14) are all genuine «Клиент»/CRM/generic
(calls, reports-by-client, online-orders, integrations, service-requests, aging) — correct as-is.

## NEVER blind-sweep (collision/referent hazards)

- **`hisob`** — account/report/calculation vs the bill (`hisobvaraq`). Check RU twin every time.
- **`delivery_planned`** — 3 distinct RU referents (отгрузки / поставки / выпуска); per-route only.
- **`sotuv`** — sales-revenue, NOT the demand doc. Leave.
- **`yo'qotish`** (loss-category) / **`qabul qilish`** (приёмка) — distinct from the Списание/Оприходование acts.
- **`tasdiqlash`/`tasdiqlangan`** — Подтвердить (ЭСФ buyer signing), NOT GL posting.

## Cross-cutting verification (every sweep)

`pnpm i18n:gate` (key-existence both locales) + `grep0` of the retired token + biome + web tc +
web test suite. Sweeps 3/4/5 also get **3-lens** (`.claude/workflows/i18n-group-verify.js` → scratch copy).
RU anchor must remain byte-identical (verify `git diff ru.json` is empty for uz-only sweeps).
