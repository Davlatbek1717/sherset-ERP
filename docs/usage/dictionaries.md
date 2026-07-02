# Simple Dictionaries — Uom, TaxRate, ExpenseItem, CustomEntity

> 4 ta master-data dictionary moduli. Hammasi flat CRUD: list / create /
> update / archive. Hech qaysisida FSM, transaction, balance, stock ta'siri
> yo'q. Moysklad'ning «Справочники» bo'limining 1:1 klon implementatsiyasi.

**Status**: ✅ Done · Sprint 9
**Test count**: 34 unit (9 uom + 8 tax-rate + 8 expense-item + 9 custom-entity)

---

## 1. Uom — O'lchov birliklari

DB: `Uom` (schema.prisma:1613). Permission entity: `uom`. URL: `/settings/uoms`.

Fields:
- `name` — "Donalar", "Килограмм"
- `code` — OKEI 5-raqamli (масалан: "796" = «штука»)
- `description`, `shared` (umumiy ko'rinish), `externalCode`

**Default seed** (account bo'sh bo'lsa, birinchi GET'da avtomat to'ldiriladi):
шт, кг, г, л, м, м², м³, пачка (8 ta UZ uchun universal o'lchov)

Ishlatilishi: har mahsulot uchun `uom` field (string)ga referent. Variantlar va bundle'larda ham ishlatiladi.

---

## 2. TaxRate — Soliq stavkalari (VAT/NDS)

DB: `TaxRate` (schema.prisma:1638). Permission entity: `taxrate`. URL: `/settings/tax-rates`.

Fields:
- `rate` — Decimal(5,2): masalan, 12.00 = 12%, 5.50 = 5.5%
- `comment` — "UZ asosiy NDS", "Eksport (0%)"
- `shared`, `archived`
- Unique constraint: (`accountId`, `rate`) — bir xil stavkani ikki marta yarata olmaysiz

**Default seed**: 0%, 12% (UZ standart), 15% (xalqaro xizmatlar uchun)

Ishlatilishi: har hujjat satrida `vat` field bilan. Soliq hisoboti pivot uchun.

---

## 3. ExpenseItem — Xarajat moddalari

DB: `ExpenseItem` (schema.prisma:1664). Permission entity: `expenseitem`. URL: `/settings/expense-items`.

Fields:
- `name` — "Аренда", "Реклама", "Канцелярия"
- `code`, `externalCode`, `description`, `archived`
- **YO'Q**: `shared` (har akkountning xususiy ro'yxati)

**Default seed**: Аренда / Реклама / Канцелярия / Зарплата / Налоги / Транспорт / Связь / Прочее

Ishlatilishi: `CashOut.expenseItem` va `PaymentOut.expenseItem` orqali xarajat hujjatlarini kategoriyalashtirish. P&L hisobotida pivot uchun. Hozircha doc'larda string sifatida saqlanadi; bu master ro'yxat dropdown uchun.

---

## 4. CustomEntity — Foydalanuvchi yaratuvchi lug'atlar

DB: `CustomEntity` (schema.prisma:1685) + `CustomEntityValue` (1700). Permission entity: `customentity`. URL: `/settings/custom-entities`.

Ikki bosqichli model:
- **Parent** (`CustomEntity`): name = lug'at nomi ("Bo'limlar", "Buyurtma manbalari")
- **Children** (`CustomEntityValue[]`): har bir qatorning `name` va `position` (display ordering)

API:
```
GET    /custom-entities                       # parent list
POST   /custom-entities                       # parent create
GET    /custom-entities/:id                   # parent + values
PATCH  /custom-entities/:id                   # rename
DELETE /custom-entities/:id                   # archive (no cascade — values stay)
GET    /custom-entities/:id/values            # full value list
POST   /custom-entities/:id/values            # add value
PATCH  /custom-entities/:id/values/:valueId   # rename value, move position
DELETE /custom-entities/:id/values/:valueId   # delete value
```

Ishlatilishi: «Atributlar» (Custom Attributes) tizimida — foydalanuvchi har hujjatga maxsus maydonlar (jumladan, CustomEntity'dan dropdown qiymatlar) qo'shishi mumkin.

Misol: «Buyurtma manbasi» CustomEntity → qiymatlar: ["Telefon", "Web-sayt", "Telegram", "Tavsiya"] → har CustomerOrder'ga ushbu lug'atdan birini biriktirish.

---

## API ulushi (har 4 lug'at uchun)

Hammasi bir xil REST shape:
```
GET    /api/v1/{slug}            # ro'yxat + search + filter (archived/shared)
GET    /api/v1/{slug}/:id        # bitta
POST   /api/v1/{slug}            # create (conflict → 409 ConflictException)
PATCH  /api/v1/{slug}/:id        # update
DELETE /api/v1/{slug}/:id        # soft-archive yoki hard-delete (ishlatilmasa)
```

Slugs:
- /api/v1/uoms
- /api/v1/tax-rates
- /api/v1/expense-items
- /api/v1/custom-entities

**Permissions**: har bir entity uchun `view`, `create`, `update`, `delete`. `approve`/`print` ishlatilmaydi (FSM yo'q).

---

## Frontend joylar

Hammasi `Sozlamalar` (Settings) sub-nav ostida:
- O'lchov birliklari (`/settings/uoms`)
- Soliq stavkalari (`/settings/tax-rates`)
- Xarajat moddalari (`/settings/expense-items`)
- Maxsus lug'atlar (`/settings/custom-entities`)

List sahifasi har biri uchun standart DataTable + search + sort. New/edit alohida sahifa, inline-edit pattern. Soft-archive button bilan «o'chirish o'rniga arxivga ko'chirish» mantiqi.

---

## Kelajakda

- [ ] Import/Export — CSV/Excel orqali katta lug'atlarni yuklash/yuklab olish
- [ ] Audit logging — har CRUD operatsiyasi auditLog tablesida (hozircha skip qilingan v1 uchun)
- [ ] Soft-archive cascade — Uom o'chirilsa, uni ishlatuvchi mahsulotlarni tekshirish va bog'liqliklarni ko'rsatish
- [ ] CustomEntity'dan dynamic dropdown picker yaratish (CustomAttribute tizimida)

---

**Tegishli kod**:
- Backend: `apps/api/src/modules/{uom, tax-rate, expense-item, custom-entity}/`
- Frontend: `apps/web/src/app/(app)/settings/{uoms, tax-rates, expense-items, custom-entities}/`
- DB: `packages/db/prisma/schema.prisma` — Uom (1613), TaxRate (1638), ExpenseItem (1664), CustomEntity (1685)
- i18n: `pages.{uom, tax_rate, expense_item, custom_entity}` + `nav.settings.{uoms, tax_rates, expense_items, custom_entities}`
