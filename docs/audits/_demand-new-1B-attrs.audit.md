# Demand `/new` — QISM 1B: custom-attributes (доп. поля) create parity + Task-2 grounding

> **Sub-project:** «Отгрузки» to'liq 1:1 · **QISM 1B** · custom-attrs slice (+ «Грузоотправитель» premise-fix).
> **Status:** ✅ **create-attrs E2E browser-VERIFIED** (jonli DB round-trip). Fayl: `demands/new/page.tsx`.

## ✅ Bajarilgan — Custom-attributes editor create'да (detail parity)
moysklad доп. поля (account custom fields) detailда tahrirlanadi, create'da esa YO'Q edi (funksional gap N1).
demand create-schema allaqachon `attributes: z.record(...)` qabul qiladi (BE o'zgarishi shart emas). demand
`[id]` detail'даги aynan shu **`AttributesEditor`** komponenti /new'ga ko'chirildi:
- Import `AttributesEditor` · state `customAttrs` · render (`entity="Demand"`, inline totals ostida — detail
  bilan izchil, tab-strip tashqarisida) · create payload'га `attributes: customAttrs` (always-send → BE required
  доп.поля'ни server-side tekshiradi, customer-order bilan bir xil).
- Account'да доп.поле yo'q bo'lsa → hech narsa render qilmaydi (moysklad ham shunday — no regression).

### Runtime E2E (Playwright + jonli DB, cleanup bilan)
1. Test доп.поле DB'га kiritildi (`attribute_metadata`, entity=Demand, code=`test_usta_1a`, «Test Usta Field», text).
2. `/new` reload → **«Qo'shimcha maydonlar» (1 ta maydon) + «Test Usta Field»** render bo'ldi ✅.
3. Maydon «QA-1B-attr-persist» bilan to'ldirildi · Kontragent (ABC MCHJ) · tovar (UzKabel VVG 2x2.5) · **Saqlash** →
   detail redirect ✅.
4. **Persist tasdig'i (authoritative):** DB `demands.attributes = {"test_usta_1a": "QA-1B-attr-persist"}` ✅ +
   detail sahifa maydon input'ida qiymat re-render ✅.
5. **Cleanup:** test demand + positions + доп.поле o'chirildi (attribute_metadata 0 qator qoldi) ✅.

## 🛑 Task-2 «Грузоотправитель» blok — PREMISE-ERROR (rad etildi, §4 grounding)
Reja Task 2 va GAP-BACKLOG D5/N3 «shipping 10 maydonni «Грузоотправитель» sarlavhали blok ostида guruhlash»ni
so'ragan edi. **Grounding tekshiruvi (capture DOM-rol, §4):** `demand-02-detail.html` + `demand-03-new.html`'da
«Грузоотправитель» so'zi **atigi 1 marta** uchraydi — u **field labeli** (грузоотправитель = jo'natuvchi), alohida
**seksiya-sarlavha EMAS**. moysklad shipping maydonlarni «Грузоотправитель» sarlavhasi ostида guruhlamaydi — ular
oddiy maydonlar (birinchisi «Грузоотправитель»). Shuning uchun bunday blok-sarlavha **taxmin bo'lardi** (banner/
capture-bug klassi, CLAUDE.md §4) → **QILINMADI**. GAP-BACKLOG D5/N3 premise xato deb belgilanadi (rejadan chiqarildi).

## Gate
- typecheck web = 0 ✅ · biome `demands/new` = 0 ✅ · demand komponent testlar 14/14 ✅
- ⚠️ pre-existing (aloqasiz): `labels/print` no-hardcoded · `label-grounding` ENOENT (capture yo'q, migratsiya)

## Qolgan (1B) / DEFER
- **«Ячейка» (bin)** — `DemandPosition`'да `cell` ustun YO'Q → BE schema+migration (keyingi, §wiring). *(A4 delta:
  moysklad'da Ячейка = optional gear-ustun, default EMAS → past-prioritet.)*
- **«Себест. единицы»** — DEFER (buyPrice /products'дан QASDDAN strip + qoralamада FIFO-cost yo'q). [[_demand-new-1B]]
- **«Маркировка»** — QISM 4 (yangi DS ustun-turi).

**HALOL yorliq:** custom-attrs create-parity = **runtime-verified** (DB round-trip). 1B TO'LIQ EMAS (bin/marking qoldi).
«100% 1:1» YO'Q — QISM 5 QA'dan keyin.
