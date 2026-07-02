# Keyingi sessiya prompti — /new (yaratish formalari) → 1:1 moysklad

> **Konteks:** Shu sessiyada `/counterparties` LIST + CARD (`/[id]`) 1:1 qilindi — dual-mode reference
> inputlar + placeholder-yo'q (`747c7d7e`,`1dd5a2b2`), Усто-ustun fix (`35dd46f1`), toolbar guruh
> (`3aa3ae55`), katak nowrap (`e2e6d382`). Ma'lumot-saqlash auditi → `data-storage-audit-2026-06-20.md`.
> Endi **/new (yaratish) formalari** navbati.

---

## 📋 Keyingi sessiyada SHUNI paste qiling:

```
davom et — endi /new (yaratish) formalariga o'tamiz. Maqsad: asosiy /new sahifalarni
moysklad bilan 1:1 qilish, xuddi bu sessiyada /counterparties LIST + CARD'ni qilganimizdek.
Boshlang'ich — counterparties/new. Standing rules + tartib pastdagi handoff faylda:
docs/audits/NEXT-SESSION-new-forms-prompt.md ni o'qi.
```

---

## Boshlang'ich: `/counterparties/new`

Kartochka (`/[id]`) allaqachon **2-ustunli** (`CounterpartyFormShell` + 2 ustun + label-LEFT +
«О контрагенте» card + activity tabs). **LEKIN `/new` hali ESKI tekis `FormSection` ko'rinishida.**

**Vazifa:** kartochkaning 2-ustunli shellini `/new`'ga ko'chir (mirror), shu bilan birga bu sessiyada
`/new`'ga qo'shilgan narsalarni **SAQLA**:
- dual-mode reference inputlar (type-search + o'ngdagi tugma → modal) + **placeholder YO'Q** — `1dd5a2b2`
- «Статус» + «Доступ» (owner/dept/shared) + BE create tenant-guard — `a81abbe7`

> ⚠️ `/new` 2-col shell shu sessiyada **ataylab kechiktirilgan** (foydalanuvchi «shart emas halitcha»
> dedi, keyin LIST+CARD'ga fokus). Shell = ishlayotgan ~600-qatorli formani qayta qurish → ehtiyotkorlik
> bilan, har card'dan keyin tsc + brauzer-smoke.

## Standing rules (BU SESSIYADA O'RNATILGAN — saqlang)

- **OPUS** (Sonnet EMAS) · 1 flagship → commit → sessiya yopiladi (kontekst-iqtisod)
- Har o'zgarish: **tsc0 · biome0 · i18n** (ru+uz key-existence + no-hardcoded + label-grounding)
- **Jonli brauzer-cert :3100** (admin@demo.local / admin123) har feature uchun — **visual ≠ functional**
  (look+label'dan «deyarli tayyor» DEMA; element-by-element jonli walkthrough qil)
- **Reference inputlar = dual-mode** — `CatalogPickerField`'ga `inlineFetcher` + `onInlineSelect` ber
  (ichiga yozib qidirish + chevron → modal), **placeholder=""**. Bu endi **STANDART** pattern.
- **Jadval kataklari = nowrap** (bir qator, ortig'i «…» bilan kesiladi) — `DataTable` td'da bor.
- **Label-grounding** (DOM-rol `>LABEL<`, grep-count EMAS) + **element-provenance** (har element qayerdan:
  built-in default / admin Настройки'da yaratadi / per-record owned — dalil bilan)

## Taxminiy tartib

1. ✅ **counterparties/new** — 2-col shell mirror DONE (`58df1afd`, 2026-06-21; live-cert :3100).
   ⏳ Qoldi (ixtiyoriy refinement, JUFT /new+/[id]): moysklad'ning HAQIQIY card-gruplanishi —
   «Реквизиты»(Тип+ИНН+Полное наим+Юр.адрес+ОКЭД) · «Скидки и цены»(Цены) · «Контактные лица».
   Jonli grounding: `counterparty-card-1to1-2026-06-20/ms-cp-new-scroll-2026-06-21.jpeg` + SPEC.md.
   **MUHIM:** /new va /[id] BIRGA o'zgartiriladi (moysklad bitta forma — create↔edit drift bo'lmasin).
2. **products/new** — qolgan 4 cosmetic: Ед.изм input→combo (uom code↔id reconcile) · Страна input→combo
   (200-davlat data yo'q) · price-row ✏ (moysklad fn noma'lum, grounding kerak) · «Поиск ТАСНИф» (soliq.uz)
3. **customer-orders/new + purchase-orders/new** — `session-2026-06-19-co-new-audit-findings` candidate'lari
   (per-line money rounding · НДС fractional crash · agentAccount match-guard · assortment cross-tenant).
   ⚠️ customer-orders/new'da pre-existing tsc red bor (`toast({...})` callable emas, `5f6b953c`) — parallel.
4. boshqa hujjat /new'lari (demands, supplies, moves, internal-orders, ...)

## Bu sessiyada o'rnatilgan pattern (counterparties/new — keyingilar uchun shablon)
- **2-col shell** = top «* Наименование» + LEFT `CounterpartyFormCard`/`CounterpartyFieldRow` (label-LEFT) +
  RIGHT activity tabs. /[id] kartochkani mirror qil; detail-only section'lar (bank/contacts/calls) /new'da YO'Q.
- **DetailHeader DROP** /new'da (moysklad create'da title qatori yo'q) → `header-conventions` PAIRING_EXEMPT'ga qo'sh.
- **Toolbar trim** = `DetailToolbar` opt-in `hideEditMenu`/`hideSendMenu`/`hidePrintMenu` (moysklad create toolbar
  odatda Сохранить+Закрыть; products/new Печать saqlaydi). Har /new uchun moysklad ground-truth'ga qarab tanla.
- **Activity widget pre-save** = agar widget'da `entityId` bo'lsa, `string | null` qabul qildir + `enabled:!!id`.

## Texnik eslatmalar (PowerShell 5.1 + multi-session)

- **NEXT.md + ru/uz.json + customer-orders + products/new** — parallel sessiya egasi bo'lishi mumkin;
  faqat **`git commit -- <pathspec>`** bilan O'Z fayllaringizni commit qiling, `git add -A` EMAS.
- `git commit -F <file>` yoki **heredoc** ishlat (`-m` ko'p qatorli PS5.1'da sinadi); **commitlint
  body-line ≤100 belgi**; **honesty-gate** «verified/done» uchun «live smoke / N-N» dalil talab qiladi.
- i18n kalit qo'shsangiz: parallel ru/uz.json'ni churn qilsa, kalitni **working-tree'da qoldir**,
  faqat o'z page faylingni commit qil (parallel sweep qiladi).
- Hech qachon PS regex bilan source-replace qilma; Edit tool ishlat.
