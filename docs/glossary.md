# Ubiquitous Language — Glossariy

**Maqsad:** Kod, DB, API, UI, hujjatlar — **bitta nomlash** bo'yicha boshqariladi. Parallel ishlayotgan agentlar bu glossariyga qat'iy rioya qiladi.

**Qoida:** Moysklad API'sining **rasmiy entity slug'lari** (masalan `counterparty`, `purchaseorder`) — **canonical**. Russian, uzbek, ingliz tarjimalari — UI/copy uchun.

---

## Top-level tenant

| Moysklad RU | API slug (canonical) | UZ label | EN label | Clone tur | Izoh |
|---|---|---|---|---|---|
| Учётная запись | `account` | Akkaunt | Account | `Account` | Multi-tenancy key |
| Подписка | `companysettings` | Obuna | Subscription | `Subscription` | Tariff, expiry |
| Юридическое лицо | `organization` | Tashkilot | Organization | `Organization` | Seller legal entity |

---

## Dictionaries (Сущности) — 53

| Moysklad RU | API slug | UZ label | EN label | Clone tur (Prisma) |
|---|---|---|---|---|
| Ассортимент | `assortment` | Assortiment | Assortment | (view, polymorphic) |
| Бонусная операция | `bonustransaction` | Bonus operatsiyasi | BonusTransaction | `BonusTransaction` |
| Бонусная программа | `bonusprogram` | Bonus dasturi | BonusProgram | `BonusProgram` |
| Валюта | `currency` | Valyuta | Currency | `Currency` |
| Вебхуки | `webhook` | Webhook | Webhook | `Webhook` |
| Вебхук на изменение остатков | `webhookstock` | Qoldiq webhook | StockWebhook | `StockWebhook` |
| Грузовая таможенная декларация | `customsdeclaration` | Bojxona deklaratsiyasi | CustomsDeclaration | `CustomsDeclaration` |
| Группа техкарт | `processingplanfolder` | Texkarta guruhi | ProcessingPlanFolder | `ProcessingPlanFolder` |
| Группа товаров | `productfolder` | Tovar guruhi | ProductFolder | `ProductFolder` |
| Договор | `contract` | Shartnoma | Contract | `Contract` |
| Единица измерения | `uom` | Birlik | UnitOfMeasure | `UnitOfMeasure` (tur: `Uom`) |
| Задача | `task` | Vazifa | Task | `Task` |
| Изображение | `image` | Rasm | Image | `Image` |
| Канал продаж | `saleschannel` | Savdo kanali | SalesChannel | `SalesChannel` |
| Карточка контента | `productfeed` | Kontent kartasi | ContentCard | `ContentCard` |
| Кассир | `cashier` | Kassir | Cashier | `Cashier` |
| Коды маркировки | `trackingcode` | Markirovka kodi | TrackingCode | `TrackingCode` |
| Комплект | `bundle` | Komplekt | Bundle | `Bundle` |
| Контрагент | `counterparty` | Kontragent | Counterparty | `Counterparty` |
| Лента событий | `event` | Tadbirlar lentasi | Event | `Event` |
| Модификация | `variant` | Modifikatsiya | Variant | `Variant` |
| Настройки компании | `companysettings` | Kompaniya sozlamalari | CompanySettings | `CompanySettings` |
| Настройки пользователя | `usersettings` | Foydalanuvchi sozlamalari | UserSettings | `UserSettings` |
| Отдел | `group` | Bo'lim | Department | `Department` (API: `group`) |
| Партия | `consignment` | Partiya | Consignment | `Consignment` |
| Печать этикеток | `labelprint` | Etiket chop etish | LabelPrint | `LabelPrint` |
| Площадка для продаж | `salesplatform` | Savdo maydonchasi | SalesPlatform | `SalesPlatform` |
| Пользовательские роли | `role` | Rol | Role | `Role` |
| Пользовательский справочник | `customentity` | Maxsus ma'lumotnoma | CustomEntity | `CustomEntity` |
| Проект | `project` | Loyiha | Project | `Project` |
| Регион | `region` | Viloyat | Region | `Region` |
| Серийный номер | `serialnumber` | Seriya raqami | SerialNumber | `SerialNumber` |
| Скидки | `discount` | Chegirmalar | Discount | `Discount` |
| Склад | `store` | Ombor | Warehouse | `Warehouse` (API: `store`) |
| Сотрудник | `employee` | Xodim | Employee | `Employee` |
| Сохраненные фильтры | `savedfilter` | Saqlangan filtr | SavedFilter | `SavedFilter` |
| Ставка НДС | `vatrate` | NDS stavkasi | VatRate | `VatRate` |
| Статусы документов | `state` | Hujjat statuslari | DocumentState | `DocumentState` (API: `state`) |
| Статья расходов | `expenseitem` | Xarajat moddasi | ExpenseItem | `ExpenseItem` |
| Страна | `country` | Mamlakat | Country | `Country` |
| Техкарта | `processingplan` | Texkarta | ProcessingPlan | `ProcessingPlan` |
| Техпроцесс | `processingprocess` | Texjarayon | ProcessingProcess | `ProcessingProcess` |
| Типы цен | `pricetype` | Narx turlari | PriceType | `PriceType` |
| Товар | `product` | Tovar | Product | `Product` |
| Точка продаж | `retailstore` | Savdo nuqtasi | RetailStore | `RetailStore` |
| Услуга | `service` | Xizmat | Service | `Service` |
| Файлы | `file` | Fayl | File | `File` |
| Характеристики модификаций | `variantcharacteristic` | Modifikatsiya xarakteristikalari | VariantCharacteristic | `VariantCharacteristic` |
| Шаблон печатной формы | `printtemplate` | Chop etish shabloni | PrintTemplate | `PrintTemplate` |
| Этап производства | `processingstage` | Ishlab chiqarish bosqichi | ProcessingStage | `ProcessingStage` |

---

## Documents (Документы) — 36

| Moysklad RU | API slug | UZ label | EN label | Clone tur |
|---|---|---|---|---|
| Внесение денег | `retaildrawercashin` | Pul kiritish | CashDrawerIn | `CashDrawerIn` |
| Внутренний заказ | `internalorder` | Ichki buyurtma | InternalOrder | `InternalOrder` |
| Возврат покупателя | `salesreturn` | Xaridordan qaytarish | SalesReturn | `SalesReturn` |
| Возврат поставщику | `purchasereturn` | Yetkazib beruvchiga qaytarish | PurchaseReturn | `PurchaseReturn` |
| Возврат предоплаты | `prepaymentreturn` | Old to'lov qaytarish | PrepaymentReturn | `PrepaymentReturn` |
| Входящий платеж | `paymentin` | Kirim to'lov | PaymentIn | `PaymentIn` |
| Вывод кодов маркировки из оборота | `retirecode` | Kod chiqarish | CodeRetire | `CodeRetire` |
| Выданный отчет комиссионера | `commissionreportout` | Komissioner hisoboti (chiqarilgan) | CommissionReportOut | `CommissionReportOut` |
| Выплата денег | `retaildrawercashout` | Pul chiqarish | CashDrawerOut | `CashDrawerOut` |
| Выполнение этапа производства | `processingstagecompletion` | Ishlab chiqarish bosqichi bajarilishi | ProcessingStageCompletion | `ProcessingStageCompletion` |
| Заказ кодов маркировки | `markingcodeorder` | Markirovka kodi buyurtmasi | MarkingCodeOrder | `MarkingCodeOrder` |
| Заказ на производство | `productionorder` | Ishlab chiqarish buyurtmasi | ProductionOrder | `ProductionOrder` |
| Заказ покупателя | `customerorder` | Xaridor buyurtmasi | CustomerOrder | `CustomerOrder` |
| Заказ поставщику | `purchaseorder` | Yetkazib beruvchi buyurtmasi | PurchaseOrder | `PurchaseOrder` |
| Инвентаризация | `inventory` | Inventarizatsiya | Inventory | `Inventory` |
| Исходящий платеж | `paymentout` | Chiqim to'lov | PaymentOut | `PaymentOut` |
| Корректировка взаиморасчетов | `counterpartyadjustment` | O'zaro hisob-kitob korrektirovkasi | CounterpartyAdjustment | `CounterpartyAdjustment` |
| Оприходование | `enter` | Kirim akt | StockEnter | `StockEnter` (API: `enter`) |
| Отгрузка | `demand` | Jo'natma | Demand | `Demand` |
| Перемещение | `move` | Ko'chirish | Move | `Move` |
| Полученный отчет комиссионера | `commissionreportin` | Komissioner hisoboti (olingan) | CommissionReportIn | `CommissionReportIn` |
| Прайс-лист | `pricelist` | Narxlar ro'yxati | PriceList | `PriceList` |
| Предоплата | `prepayment` | Old to'lov | Prepayment | `Prepayment` |
| Приемка | `supply` | Qabul akt | Supply | `Supply` |
| Приходный ордер | `cashin` | Kirim kassa order | CashIn | `CashIn` |
| Производственное задание | `productiontask` | Ishlab chiqarish topshirig'i | ProductionTask | `ProductionTask` |
| Расходный ордер | `cashout` | Chiqim kassa order | CashOut | `CashOut` |
| Розничная продажа | `retaildemand` | Chakana savdo | RetailDemand | `RetailDemand` |
| Розничная смена | `retailshift` | Chakana smena | RetailShift | `RetailShift` |
| Розничный возврат | `retailsalesreturn` | Chakana qaytarish | RetailSalesReturn | `RetailSalesReturn` |
| Списание | `loss` | Hisobdan chiqarish | StockLoss | `StockLoss` (API: `loss`) |
| Счет покупателю | `invoiceout` | Xaridor hisob-fakturasi | InvoiceOut | `InvoiceOut` |
| Счет поставщика | `invoicein` | Yetkazib beruvchi hisob-fakturasi | InvoiceIn | `InvoiceIn` |
| Счет-фактура выданный | `factureout` | Soliq schet-fakturasi (chiqarilgan) | FactureOut | `FactureOut` |
| Счет-фактура полученный | `facturein` | Soliq schet-fakturasi (olingan) | FactureIn | `FactureIn` |
| Техоперация | `processing` | Texoperatsiya | Processing | `Processing` |

---

## Shared base fields

Har entity'da:

| Field | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `accountId` | UUID | Tenant (multi-tenancy) |
| `name` | String | Display name / number |
| `description` | String? | Optional note |
| `code` | String? | Internal code |
| `externalCode` | String? | External sync code |
| `createdAt` | DateTime | RO |
| `updatedAt` | DateTime | RO |
| `deletedAt` | DateTime? | Soft delete |
| `shared` | Boolean | Share visibility |
| `owner` | Employee | RW |
| `group` | Department | RW |
| `meta` | JSON | API metadata |

Har hujjat — shu + quyidagilar:

| Field | Type |
|---|---|
| `moment` | DateTime (hujjat sanasi) |
| `applicable` | Boolean ("проведено") |
| `organization` | Organization |
| `state` | DocumentState? |
| `project` | Project? |
| `contract` | Contract? |
| `rate` | Object ({ currency, value }) |
| `sum` | BigInt (minor units) |
| `vatEnabled` | Boolean |
| `vatIncluded` | Boolean |
| `positions` | Position[] |
| `attributes` | Attribute[] |
| `files` | File[] |
| `printed` | Boolean RO |
| `published` | Boolean RO |

---

## Common terms

| Term | Ma'nosi | UZ | EN |
|---|---|---|---|
| **Tenant** | Multi-tenant izolyatsiya kaliti | Ijaralik | Tenant |
| **Position** | Hujjat qatori (tovar + miqdor + narx) | Pozitsiya | Position |
| **Consignment** | Tovar partiyasi (batch) | Partiya | Consignment |
| **Assortment** | Polymorphic ref (product\|variant\|bundle\|service) | Assortiment | Assortment |
| **Applicable** | Hujjat proveden / qabul qilingan | Proveden | Applicable / Posted |
| **Rate** | Valyuta kursi | Kurs | Exchange rate |
| **Reserve** | Rezerv qilingan qoldiq | Rezerv | Reserve |
| **In transit** | Harakatda | Yo'lda | In transit |
| **Meta** | API entity ref | Meta | Meta ref |
| **State** | Hujjat status | Status | State |
| **Group** | Bo'lim (Otdel) | Bo'lim | Department |
| **Shared** | Umumiy ko'rish | Umumiy | Shared |

---

## Field naming convention

- **camelCase** — TypeScript/Prisma: `accountId`, `createdAt`, `vatEnabled`
- **snake_case** — PostgreSQL kolonnalar: `account_id`, `created_at`, `vat_enabled`
- Prisma `@map("snake_case")` orqali mapping
- API JSON — `camelCase` (Moysklad API bilan mos)

## Entity relationship nomi

- `X → Y` (many-to-one): FK maydoni `yId` (masalan `Product.uomId`)
- `X ↔ Y` (many-to-many): alohida jadval `XY` (masalan `CounterpartyTag`)
- `X ⇇ Y` (one-to-many): child'da FK, parentda `y: Y[]`

## UZ lokalizatsiya qoidalari

- Terminlar — **Moysklad verbatim** saqlanadi (Kontragent, Mardkirovka, Inventarizatsiya) — tadbirkorlar shu so'zga o'rganib qolgan
- Agar o'zbekcha variant keng tarqalgan bo'lsa — u ishlatiladi (Ombor, Tovar, Savdo, Xarid)
- Pul: "so'm" (minor: "tiyin"), format `1 234 567 so'm`
- Sanalar: `DD.MM.YYYY`
- Telefon: `+998 XX XXX-XX-XX`
- Hafta: Dushanba'dan boshlanadi

---

## Keyingi o'zgarishlar

Agar agent yangi entity/hujjat qo'shmoqchi bo'lsa:
1. Avval bu glossariyga qo'shish
2. PR'da o'zgarish review qilinadi
3. Tasdiqdan keyin kod yoziladi

**Qarama-qarshilikni rad etish:** agar agent bu glossariyga mos kelmagan nom ishlatgan bo'lsa, CI test qizil bo'ladi (`scripts/check-naming.ts` har Prisma model + har API route'ni tekshiradi).
