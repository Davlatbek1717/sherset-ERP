# Moysklad clone — Data flow audit

**Generated**: 2026-05-05 · **Pages scanned**: 139 · **Unique endpoints**: 55 URL families

## Bu hujjat nima haqida

Har bir frontend sahifa (page.tsx) qanday API ga murojaat qiladi, 
API qaysi NestJS modul orqali xizmat ko'rsatadi va qaysi Prisma 
model(lar)ga yozadi/o'qiydi — sahifa-by-sahifa ko'rsatadi.

**Ma'lumot oqimi sxemasi (har sahifa uchun):**

```
Foydalanuvchi  →  Next.js page.tsx (apps/web)
                  ↓  api.get/post/patch/delete()
                  HTTP request (auth: JWT cookie)
                  ↓
                  NestJS controller (apps/api/src/modules/<entity>)
                  ↓  guards: JwtAuthGuard + RequirePermission
                  Service (business logic + RLS)
                  ↓  prisma.<model>.* with accountId scope
                  PostgreSQL (RLS: per-tenant row isolation)
```

## Joylashuv (Where data lives)

- **Frontend**: `apps/web/src/app/(app)/<route>/page.tsx`
- **API**: `apps/api/src/modules/<module>/{controller,service,schema}.ts`
- **DB**: PostgreSQL (port :5433 dev), schema `packages/db/prisma/schema.prisma`
- **Money**: BigInt minor units (tiyin) — ADR-0004
- **Tenant guard**: `accountId` on every row + RLS policies — ADR-0003

## Parity status

- ✅ **1:1 parity** — moysklad bilan bir xil sahifa, ma'lumot va xulq
- 🟡 **Custom (intentional)** — moysklad reference yo'q, mustaqil dizayn
- 🔴 **Gap** — moysklad'da bor, bizda yo'q yoki noto'g'ri

---

## Feature areas

### `home` — Bosh sahifa    `✅ 1:1 parity`

**Vazifa**: Dashboard / kunlik metrikalar

**Sahifalar:**

| Sahifa | Fayl | Endpointlar |
|--------|------|-------------|
| `/<root>` | `apps\web\src\app\(app)\page.tsx` | 1 (GET) |

**Endpointlar va backend:**

| Verb | URL | Backend modul | Prisma model(lar) |
|------|-----|---------------|------------------|
| `GET` | `/reports/dashboard` | `report` | `CashIn`, `CashOut`, `Counterparty`, `CounterpartyBalance`, `CustomerOrder`, `Demand`, `Employee`, `InvoiceOut`, `Organization`, `PaymentIn`, `PaymentOut`, `Product`, `SalesReturn`, `Stock`, `Store`, `Task` |


### `apps` — Apps katalogi    `✅ 1:1 parity`

**Vazifa**: 3rd-party integratsiya katalogi

**Sahifalar:**

| Sahifa | Fayl | Endpointlar |
|--------|------|-------------|
| `/apps` | `apps\web\src\app\(app)\apps\page.tsx` | 1 (GET) |
| `/apps/[appKey]` | `apps\web\src\app\(app)\apps\[appKey]\page.tsx` | 1 (GET) |

**Endpointlar va backend:**

| Verb | URL | Backend modul | Prisma model(lar) |
|------|-----|---------------|------------------|
| `GET` | `/app-installs/available` | `app-install` | `AppInstall` |


### `customer-orders` — Mijoz buyurtmalari    `✅ 1:1 parity`

**Vazifa**: Sotuv pipeline boshi — mijoz buyurtmasi

**Sahifalar:**

| Sahifa | Fayl | Endpointlar |
|--------|------|-------------|
| `/customer-orders` | `apps\web\src\app\(app)\customer-orders\page.tsx` | 5 (GET) |
| `/customer-orders/[id]` | `apps\web\src\app\(app)\customer-orders\[id]\page.tsx` | 4 (GET, POST) |
| `/customer-orders/new` | `apps\web\src\app\(app)\customer-orders\new\page.tsx` | 4 (GET, POST) |

**Endpointlar va backend:**

| Verb | URL | Backend modul | Prisma model(lar) |
|------|-----|---------------|------------------|
| `GET` | `/counterparties` | `counterparty` | `AuditLog`, `Counterparty`, `CounterpartyAccount` |
| `GET` | `/customer-orders` | `customer-order` | `AuditLog`, `Counterparty`, `CustomerOrder`, `CustomerOrderPosition`, `Demand`, `InvoiceOut`, `Organization`, `Store` |
| `GET` | `/organizations` | `reference` | `CashDesk`, `Employee`, `Organization`, `OrganizationAccount`, `Store` |
| `GET` | `/products` | `product` | `AuditLog`, `Product`, `ProductPack` |
| `GET` | `/projects` | `project` | `Project` |
| `GET` | `/stores` | `reference` | `CashDesk`, `Employee`, `Organization`, `OrganizationAccount`, `Store` |
| `POST` | `/customer-orders` | `customer-order` | `AuditLog`, `Counterparty`, `CustomerOrder`, `CustomerOrderPosition`, `Demand`, `InvoiceOut`, `Organization`, `Store` |
| `POST` | `/customer-orders/:id/clone` | `customer-order` | `AuditLog`, `Counterparty`, `CustomerOrder`, `CustomerOrderPosition`, `Demand`, `InvoiceOut`, `Organization`, `Store` |
| `POST` | `/demands/from-customer-order/:id` | `demand` | `AuditLog`, `Counterparty`, `CustomerOrder`, `Demand`, `DemandPosition`, `DemandPositionCostConsumption`, `Organization`, `Store`, `SupplyPosition` |
| `POST` | `/invoices-out/from-customer-order/:id` | `invoice-out` | `AuditLog`, `Counterparty`, `CustomerOrder`, `InvoiceOut`, `InvoiceOutPosition`, `Organization` |


### `demands` — Otgruzkalar (Demands)    `✅ 1:1 parity`

**Vazifa**: Mahsulotni omborgan chiqarish

**Sahifalar:**

| Sahifa | Fayl | Endpointlar |
|--------|------|-------------|
| `/demands` | `apps\web\src\app\(app)\demands\page.tsx` | 4 (GET) |
| `/demands/[id]` | `apps\web\src\app\(app)\demands\[id]\page.tsx` | 2 (GET, POST) |
| `/demands/new` | `apps\web\src\app\(app)\demands\new\page.tsx` | 4 (GET, POST) |

**Endpointlar va backend:**

| Verb | URL | Backend modul | Prisma model(lar) |
|------|-----|---------------|------------------|
| `GET` | `/counterparties` | `counterparty` | `AuditLog`, `Counterparty`, `CounterpartyAccount` |
| `GET` | `/demands` | `demand` | `AuditLog`, `Counterparty`, `CustomerOrder`, `Demand`, `DemandPosition`, `DemandPositionCostConsumption`, `Organization`, `Store`, `SupplyPosition` |
| `GET` | `/organizations` | `reference` | `CashDesk`, `Employee`, `Organization`, `OrganizationAccount`, `Store` |
| `GET` | `/products` | `product` | `AuditLog`, `Product`, `ProductPack` |
| `GET` | `/stores` | `reference` | `CashDesk`, `Employee`, `Organization`, `OrganizationAccount`, `Store` |
| `POST` | `/demands` | `demand` | `AuditLog`, `Counterparty`, `CustomerOrder`, `Demand`, `DemandPosition`, `DemandPositionCostConsumption`, `Organization`, `Store`, `SupplyPosition` |
| `POST` | `/demands/:id/clone` | `demand` | `AuditLog`, `Counterparty`, `CustomerOrder`, `Demand`, `DemandPosition`, `DemandPositionCostConsumption`, `Organization`, `Store`, `SupplyPosition` |


### `invoices-out` — Mijoz schyot-faktura    `✅ 1:1 parity`

**Vazifa**: Mijozga chiqarilgan hisob-faktura

**Sahifalar:**

| Sahifa | Fayl | Endpointlar |
|--------|------|-------------|
| `/invoices-out` | `apps\web\src\app\(app)\invoices-out\page.tsx` | 4 (GET) |
| `/invoices-out/[id]` | `apps\web\src\app\(app)\invoices-out\[id]\page.tsx` | 3 (GET, POST) |

**Endpointlar va backend:**

| Verb | URL | Backend modul | Prisma model(lar) |
|------|-----|---------------|------------------|
| `GET` | `/counterparties` | `counterparty` | `AuditLog`, `Counterparty`, `CounterpartyAccount` |
| `GET` | `/invoices-out` | `invoice-out` | `AuditLog`, `Counterparty`, `CustomerOrder`, `InvoiceOut`, `InvoiceOutPosition`, `Organization` |
| `GET` | `/organizations` | `reference` | `CashDesk`, `Employee`, `Organization`, `OrganizationAccount`, `Store` |
| `GET` | `/products` | `product` | `AuditLog`, `Product`, `ProductPack` |
| `GET` | `/stores` | `reference` | `CashDesk`, `Employee`, `Organization`, `OrganizationAccount`, `Store` |
| `POST` | `/invoices-out/:id/clone` | `invoice-out` | `AuditLog`, `Counterparty`, `CustomerOrder`, `InvoiceOut`, `InvoiceOutPosition`, `Organization` |
| `POST` | `/payments-in/from-invoice-out/:id` | `payment-in` | `AuditLog`, `Counterparty`, `InvoiceOut`, `Organization`, `PaymentIn`, `PaymentInOperation` |


### `sales-returns` — Sotuv qaytarishlari    `✅ 1:1 parity`

**Vazifa**: Mijozdan qaytgan tovar

**Sahifalar:**

| Sahifa | Fayl | Endpointlar |
|--------|------|-------------|
| `/sales-returns` | `apps\web\src\app\(app)\sales-returns\page.tsx` | 4 (GET) |
| `/sales-returns/[id]` | `apps\web\src\app\(app)\sales-returns\[id]\page.tsx` | 2 (GET, POST) |
| `/sales-returns/new` | `apps\web\src\app\(app)\sales-returns\new\page.tsx` | 4 (GET, POST) |

**Endpointlar va backend:**

| Verb | URL | Backend modul | Prisma model(lar) |
|------|-----|---------------|------------------|
| `GET` | `/counterparties` | `counterparty` | `AuditLog`, `Counterparty`, `CounterpartyAccount` |
| `GET` | `/organizations` | `reference` | `CashDesk`, `Employee`, `Organization`, `OrganizationAccount`, `Store` |
| `GET` | `/products` | `product` | `AuditLog`, `Product`, `ProductPack` |
| `GET` | `/sales-returns` | `sales-return` | `AuditLog`, `Counterparty`, `CustomerOrder`, `Demand`, `DemandPosition`, `Organization`, `SalesReturn`, `SalesReturnPosition`, `Store` |
| `GET` | `/stores` | `reference` | `CashDesk`, `Employee`, `Organization`, `OrganizationAccount`, `Store` |
| `POST` | `/sales-returns` | `sales-return` | `AuditLog`, `Counterparty`, `CustomerOrder`, `Demand`, `DemandPosition`, `Organization`, `SalesReturn`, `SalesReturnPosition`, `Store` |
| `POST` | `/sales-returns/:id/clone` | `sales-return` | `AuditLog`, `Counterparty`, `CustomerOrder`, `Demand`, `DemandPosition`, `Organization`, `SalesReturn`, `SalesReturnPosition`, `Store` |


### `purchase-orders` — Yetkazib beruvchiga buyurtma    `✅ 1:1 parity`

**Vazifa**: Sotib olish pipeline boshi

**Sahifalar:**

| Sahifa | Fayl | Endpointlar |
|--------|------|-------------|
| `/purchase-orders` | `apps\web\src\app\(app)\purchase-orders\page.tsx` | 1 (GET) |
| `/purchase-orders/[id]` | `apps\web\src\app\(app)\purchase-orders\[id]\page.tsx` | 5 (GET, POST) |
| `/purchase-orders/new` | `apps\web\src\app\(app)\purchase-orders\new\page.tsx` | 4 (GET, POST) |

**Endpointlar va backend:**

| Verb | URL | Backend modul | Prisma model(lar) |
|------|-----|---------------|------------------|
| `GET` | `/organizations` | `reference` | `CashDesk`, `Employee`, `Organization`, `OrganizationAccount`, `Store` |
| `GET` | `/products` | `product` | `AuditLog`, `Product`, `ProductPack` |
| `GET` | `/purchase-orders` | `purchase-order` | `AuditLog`, `Counterparty`, `Organization`, `PurchaseOrder`, `PurchaseOrderPosition`, `Store` |
| `GET` | `/stores` | `reference` | `CashDesk`, `Employee`, `Organization`, `OrganizationAccount`, `Store` |
| `POST` | `/invoices-in/from-purchase-order/:id` | `invoice-in` | `AuditLog`, `Counterparty`, `InvoiceIn`, `InvoiceInPosition`, `Organization`, `PurchaseOrder` |
| `POST` | `/payments-out/from-purchase-order/:id` | `payment-out` | `AuditLog`, `Counterparty`, `InvoiceIn`, `Organization`, `PaymentOut`, `PaymentOutOperation`, `PurchaseOrder` |
| `POST` | `/purchase-orders` | `purchase-order` | `AuditLog`, `Counterparty`, `Organization`, `PurchaseOrder`, `PurchaseOrderPosition`, `Store` |
| `POST` | `/purchase-orders/:id/clone` | `purchase-order` | `AuditLog`, `Counterparty`, `Organization`, `PurchaseOrder`, `PurchaseOrderPosition`, `Store` |
| `POST` | `/supplies/from-purchase-order/:id` | `supply` | `AuditLog`, `Counterparty`, `Organization`, `PurchaseOrder`, `Store`, `Supply`, `SupplyPosition` |


### `supplies` — Kirimlar (Supplies)    `✅ 1:1 parity`

**Vazifa**: Yetkazuvchidan qabul qilingan tovar

**Sahifalar:**

| Sahifa | Fayl | Endpointlar |
|--------|------|-------------|
| `/supplies` | `apps\web\src\app\(app)\supplies\page.tsx` | 1 (GET) |
| `/supplies/[id]` | `apps\web\src\app\(app)\supplies\[id]\page.tsx` | 2 (GET, POST) |
| `/supplies/new` | `apps\web\src\app\(app)\supplies\new\page.tsx` | 4 (GET, POST) |

**Endpointlar va backend:**

| Verb | URL | Backend modul | Prisma model(lar) |
|------|-----|---------------|------------------|
| `GET` | `/organizations` | `reference` | `CashDesk`, `Employee`, `Organization`, `OrganizationAccount`, `Store` |
| `GET` | `/products` | `product` | `AuditLog`, `Product`, `ProductPack` |
| `GET` | `/stores` | `reference` | `CashDesk`, `Employee`, `Organization`, `OrganizationAccount`, `Store` |
| `GET` | `/supplies` | `supply` | `AuditLog`, `Counterparty`, `Organization`, `PurchaseOrder`, `Store`, `Supply`, `SupplyPosition` |
| `POST` | `/supplies` | `supply` | `AuditLog`, `Counterparty`, `Organization`, `PurchaseOrder`, `Store`, `Supply`, `SupplyPosition` |
| `POST` | `/supplies/:id/clone` | `supply` | `AuditLog`, `Counterparty`, `Organization`, `PurchaseOrder`, `Store`, `Supply`, `SupplyPosition` |


### `invoices-in` — Yetkazuvchi schyot-faktura    `✅ 1:1 parity`

**Vazifa**: Yetkazuvchidan kirim hisob-faktura

**Sahifalar:**

| Sahifa | Fayl | Endpointlar |
|--------|------|-------------|
| `/invoices-in` | `apps\web\src\app\(app)\invoices-in\page.tsx` | 1 (GET) |
| `/invoices-in/[id]` | `apps\web\src\app\(app)\invoices-in\[id]\page.tsx` | 3 (GET, POST) |
| `/invoices-in/new` | `apps\web\src\app\(app)\invoices-in\new\page.tsx` | 4 (GET, POST) |

**Endpointlar va backend:**

| Verb | URL | Backend modul | Prisma model(lar) |
|------|-----|---------------|------------------|
| `GET` | `/invoices-in` | `invoice-in` | `AuditLog`, `Counterparty`, `InvoiceIn`, `InvoiceInPosition`, `Organization`, `PurchaseOrder` |
| `GET` | `/organizations` | `reference` | `CashDesk`, `Employee`, `Organization`, `OrganizationAccount`, `Store` |
| `GET` | `/products` | `product` | `AuditLog`, `Product`, `ProductPack` |
| `GET` | `/purchase-orders` | `purchase-order` | `AuditLog`, `Counterparty`, `Organization`, `PurchaseOrder`, `PurchaseOrderPosition`, `Store` |
| `POST` | `/invoices-in` | `invoice-in` | `AuditLog`, `Counterparty`, `InvoiceIn`, `InvoiceInPosition`, `Organization`, `PurchaseOrder` |
| `POST` | `/invoices-in/:id/clone` | `invoice-in` | `AuditLog`, `Counterparty`, `InvoiceIn`, `InvoiceInPosition`, `Organization`, `PurchaseOrder` |
| `POST` | `/payments-out/from-invoice-in/:id` | `payment-out` | `AuditLog`, `Counterparty`, `InvoiceIn`, `Organization`, `PaymentOut`, `PaymentOutOperation`, `PurchaseOrder` |


### `purchase-returns` — Sotib olish qaytarishlari    `✅ 1:1 parity`

**Vazifa**: Yetkazuvchiga qaytariladigan tovar

**Sahifalar:**

| Sahifa | Fayl | Endpointlar |
|--------|------|-------------|
| `/purchase-returns` | `apps\web\src\app\(app)\purchase-returns\page.tsx` | 1 (GET) |
| `/purchase-returns/[id]` | `apps\web\src\app\(app)\purchase-returns\[id]\page.tsx` | 2 (GET, POST) |
| `/purchase-returns/new` | `apps\web\src\app\(app)\purchase-returns\new\page.tsx` | 4 (GET, POST) |

**Endpointlar va backend:**

| Verb | URL | Backend modul | Prisma model(lar) |
|------|-----|---------------|------------------|
| `GET` | `/organizations` | `reference` | `CashDesk`, `Employee`, `Organization`, `OrganizationAccount`, `Store` |
| `GET` | `/products` | `product` | `AuditLog`, `Product`, `ProductPack` |
| `GET` | `/purchase-returns` | `purchase-return` | `AuditLog`, `Counterparty`, `Organization`, `PurchaseReturn`, `PurchaseReturnPosition`, `Store`, `Supply`, `SupplyPosition` |
| `GET` | `/stores` | `reference` | `CashDesk`, `Employee`, `Organization`, `OrganizationAccount`, `Store` |
| `POST` | `/purchase-returns` | `purchase-return` | `AuditLog`, `Counterparty`, `Organization`, `PurchaseReturn`, `PurchaseReturnPosition`, `Store`, `Supply`, `SupplyPosition` |
| `POST` | `/purchase-returns/:id/clone` | `purchase-return` | `AuditLog`, `Counterparty`, `Organization`, `PurchaseReturn`, `PurchaseReturnPosition`, `Store`, `Supply`, `SupplyPosition` |


### `enters` — Kirimlar (Enters)    `✅ 1:1 parity`

**Vazifa**: Inventarizatsiya kirim

**Sahifalar:**

| Sahifa | Fayl | Endpointlar |
|--------|------|-------------|
| `/enters` | `apps\web\src\app\(app)\enters\page.tsx` | 1 (GET) |
| `/enters/[id]` | `apps\web\src\app\(app)\enters\[id]\page.tsx` | 2 (GET, POST) |
| `/enters/new` | `apps\web\src\app\(app)\enters\new\page.tsx` | 4 (GET, POST) |

**Endpointlar va backend:**

| Verb | URL | Backend modul | Prisma model(lar) |
|------|-----|---------------|------------------|
| `GET` | `/enters` | `enter` | `AuditLog`, `Enter`, `EnterPosition`, `Organization`, `Store` |
| `GET` | `/organizations` | `reference` | `CashDesk`, `Employee`, `Organization`, `OrganizationAccount`, `Store` |
| `GET` | `/products` | `product` | `AuditLog`, `Product`, `ProductPack` |
| `GET` | `/stores` | `reference` | `CashDesk`, `Employee`, `Organization`, `OrganizationAccount`, `Store` |
| `POST` | `/enters` | `enter` | `AuditLog`, `Enter`, `EnterPosition`, `Organization`, `Store` |
| `POST` | `/enters/:id/clone` | `enter` | `AuditLog`, `Enter`, `EnterPosition`, `Organization`, `Store` |


### `losses` — Spisaniya (Losses)    `✅ 1:1 parity`

**Vazifa**: Inventarizatsiya yo'qotish

**Sahifalar:**

| Sahifa | Fayl | Endpointlar |
|--------|------|-------------|
| `/losses` | `apps\web\src\app\(app)\losses\page.tsx` | 1 (GET) |
| `/losses/[id]` | `apps\web\src\app\(app)\losses\[id]\page.tsx` | 2 (GET, POST) |
| `/losses/new` | `apps\web\src\app\(app)\losses\new\page.tsx` | 4 (GET, POST) |

**Endpointlar va backend:**

| Verb | URL | Backend modul | Prisma model(lar) |
|------|-----|---------------|------------------|
| `GET` | `/losses` | `loss` | `AuditLog`, `Loss`, `LossPosition`, `Organization`, `Store` |
| `GET` | `/organizations` | `reference` | `CashDesk`, `Employee`, `Organization`, `OrganizationAccount`, `Store` |
| `GET` | `/products` | `product` | `AuditLog`, `Product`, `ProductPack` |
| `GET` | `/stores` | `reference` | `CashDesk`, `Employee`, `Organization`, `OrganizationAccount`, `Store` |
| `POST` | `/losses` | `loss` | `AuditLog`, `Loss`, `LossPosition`, `Organization`, `Store` |
| `POST` | `/losses/:id/clone` | `loss` | `AuditLog`, `Loss`, `LossPosition`, `Organization`, `Store` |


### `moves` — Peremestheniya (Moves)    `✅ 1:1 parity`

**Vazifa**: Omborlar orasida ko'chirish

**Sahifalar:**

| Sahifa | Fayl | Endpointlar |
|--------|------|-------------|
| `/moves` | `apps\web\src\app\(app)\moves\page.tsx` | 1 (GET) |
| `/moves/[id]` | `apps\web\src\app\(app)\moves\[id]\page.tsx` | 2 (GET, POST) |
| `/moves/new` | `apps\web\src\app\(app)\moves\new\page.tsx` | 4 (GET, POST) |

**Endpointlar va backend:**

| Verb | URL | Backend modul | Prisma model(lar) |
|------|-----|---------------|------------------|
| `GET` | `/moves` | `move` | `AuditLog`, `Move`, `MovePosition`, `Organization`, `Stock`, `Store` |
| `GET` | `/organizations` | `reference` | `CashDesk`, `Employee`, `Organization`, `OrganizationAccount`, `Store` |
| `GET` | `/products` | `product` | `AuditLog`, `Product`, `ProductPack` |
| `GET` | `/stores` | `reference` | `CashDesk`, `Employee`, `Organization`, `OrganizationAccount`, `Store` |
| `POST` | `/moves` | `move` | `AuditLog`, `Move`, `MovePosition`, `Organization`, `Stock`, `Store` |
| `POST` | `/moves/:id/clone` | `move` | `AuditLog`, `Move`, `MovePosition`, `Organization`, `Stock`, `Store` |


### `inventories` — Inventarizatsiya    `✅ 1:1 parity`

**Vazifa**: Stok hisob-kitobi

**Sahifalar:**

| Sahifa | Fayl | Endpointlar |
|--------|------|-------------|
| `/inventories` | `apps\web\src\app\(app)\inventories\page.tsx` | 1 (GET) |
| `/inventories/[id]` | `apps\web\src\app\(app)\inventories\[id]\page.tsx` | 2 (GET, POST) |
| `/inventories/new` | `apps\web\src\app\(app)\inventories\new\page.tsx` | 4 (GET, POST) |

**Endpointlar va backend:**

| Verb | URL | Backend modul | Prisma model(lar) |
|------|-----|---------------|------------------|
| `GET` | `/inventories` | `inventory` | `AuditLog`, `Inventory`, `InventoryPosition`, `Organization`, `Stock`, `Store` |
| `GET` | `/organizations` | `reference` | `CashDesk`, `Employee`, `Organization`, `OrganizationAccount`, `Store` |
| `GET` | `/products` | `product` | `AuditLog`, `Product`, `ProductPack` |
| `GET` | `/stores` | `reference` | `CashDesk`, `Employee`, `Organization`, `OrganizationAccount`, `Store` |
| `POST` | `/inventories` | `inventory` | `AuditLog`, `Inventory`, `InventoryPosition`, `Organization`, `Stock`, `Store` |
| `POST` | `/inventories/:id/clone` | `inventory` | `AuditLog`, `Inventory`, `InventoryPosition`, `Organization`, `Stock`, `Store` |


### `cash-in` — Kassa kirim (Cash in)    `✅ 1:1 parity`

**Vazifa**: Naqd pul kirimi

**Sahifalar:**

| Sahifa | Fayl | Endpointlar |
|--------|------|-------------|
| `/cash-in` | `apps\web\src\app\(app)\cash-in\page.tsx` | 3 (GET) |
| `/cash-in/[id]` | `apps\web\src\app\(app)\cash-in\[id]\page.tsx` | 4 (GET, POST) |
| `/cash-in/new` | `apps\web\src\app\(app)\cash-in\new\page.tsx` | 4 (GET, POST) |

**Endpointlar va backend:**

| Verb | URL | Backend modul | Prisma model(lar) |
|------|-----|---------------|------------------|
| `GET` | `/cash-desks` | `reference` | `CashDesk`, `Employee`, `Organization`, `OrganizationAccount`, `Store` |
| `GET` | `/cash-in` | `cash-in` | `AuditLog`, `CashDesk`, `CashIn`, `CashInOperation`, `Counterparty`, `InvoiceOut`, `Organization` |
| `GET` | `/counterparties` | `counterparty` | `AuditLog`, `Counterparty`, `CounterpartyAccount` |
| `GET` | `/invoices-out` | `invoice-out` | `AuditLog`, `Counterparty`, `CustomerOrder`, `InvoiceOut`, `InvoiceOutPosition`, `Organization` |
| `GET` | `/organizations` | `reference` | `CashDesk`, `Employee`, `Organization`, `OrganizationAccount`, `Store` |
| `POST` | `/cash-in` | `cash-in` | `AuditLog`, `CashDesk`, `CashIn`, `CashInOperation`, `Counterparty`, `InvoiceOut`, `Organization` |
| `POST` | `/cash-in/:id/clone` | `cash-in` | `AuditLog`, `CashDesk`, `CashIn`, `CashInOperation`, `Counterparty`, `InvoiceOut`, `Organization` |


### `cash-out` — Kassa chiqim (Cash out)    `✅ 1:1 parity`

**Vazifa**: Naqd pul chiqimi

**Sahifalar:**

| Sahifa | Fayl | Endpointlar |
|--------|------|-------------|
| `/cash-out` | `apps\web\src\app\(app)\cash-out\page.tsx` | 3 (GET) |
| `/cash-out/[id]` | `apps\web\src\app\(app)\cash-out\[id]\page.tsx` | 4 (GET, POST) |
| `/cash-out/new` | `apps\web\src\app\(app)\cash-out\new\page.tsx` | 4 (GET, POST) |

**Endpointlar va backend:**

| Verb | URL | Backend modul | Prisma model(lar) |
|------|-----|---------------|------------------|
| `GET` | `/cash-desks` | `reference` | `CashDesk`, `Employee`, `Organization`, `OrganizationAccount`, `Store` |
| `GET` | `/cash-out` | `cash-out` | `AuditLog`, `CashDesk`, `CashOut`, `CashOutOperation`, `Counterparty`, `InvoiceIn`, `Organization` |
| `GET` | `/counterparties` | `counterparty` | `AuditLog`, `Counterparty`, `CounterpartyAccount` |
| `GET` | `/invoices-in` | `invoice-in` | `AuditLog`, `Counterparty`, `InvoiceIn`, `InvoiceInPosition`, `Organization`, `PurchaseOrder` |
| `GET` | `/organizations` | `reference` | `CashDesk`, `Employee`, `Organization`, `OrganizationAccount`, `Store` |
| `POST` | `/cash-out` | `cash-out` | `AuditLog`, `CashDesk`, `CashOut`, `CashOutOperation`, `Counterparty`, `InvoiceIn`, `Organization` |
| `POST` | `/cash-out/:id/clone` | `cash-out` | `AuditLog`, `CashDesk`, `CashOut`, `CashOutOperation`, `Counterparty`, `InvoiceIn`, `Organization` |


### `payments-in` — Bank kirim (Payments in)    `✅ 1:1 parity`

**Vazifa**: Bank orqali kirim to'lov

**Sahifalar:**

| Sahifa | Fayl | Endpointlar |
|--------|------|-------------|
| `/payments-in` | `apps\web\src\app\(app)\payments-in\page.tsx` | 3 (GET) |
| `/payments-in/[id]` | `apps\web\src\app\(app)\payments-in\[id]\page.tsx` | 3 (GET, POST) |
| `/payments-in/new` | `apps\web\src\app\(app)\payments-in\new\page.tsx` | 3 (GET, POST) |

**Endpointlar va backend:**

| Verb | URL | Backend modul | Prisma model(lar) |
|------|-----|---------------|------------------|
| `GET` | `/counterparties` | `counterparty` | `AuditLog`, `Counterparty`, `CounterpartyAccount` |
| `GET` | `/invoices-out` | `invoice-out` | `AuditLog`, `Counterparty`, `CustomerOrder`, `InvoiceOut`, `InvoiceOutPosition`, `Organization` |
| `GET` | `/organizations` | `reference` | `CashDesk`, `Employee`, `Organization`, `OrganizationAccount`, `Store` |
| `GET` | `/payments-in` | `payment-in` | `AuditLog`, `Counterparty`, `InvoiceOut`, `Organization`, `PaymentIn`, `PaymentInOperation` |
| `POST` | `/payments-in` | `payment-in` | `AuditLog`, `Counterparty`, `InvoiceOut`, `Organization`, `PaymentIn`, `PaymentInOperation` |
| `POST` | `/payments-in/:id/clone` | `payment-in` | `AuditLog`, `Counterparty`, `InvoiceOut`, `Organization`, `PaymentIn`, `PaymentInOperation` |


### `payments-out` — Bank chiqim (Payments out)    `✅ 1:1 parity`

**Vazifa**: Bank orqali chiqim to'lov

**Sahifalar:**

| Sahifa | Fayl | Endpointlar |
|--------|------|-------------|
| `/payments-out` | `apps\web\src\app\(app)\payments-out\page.tsx` | 3 (GET) |
| `/payments-out/[id]` | `apps\web\src\app\(app)\payments-out\[id]\page.tsx` | 4 (GET, POST) |
| `/payments-out/new` | `apps\web\src\app\(app)\payments-out\new\page.tsx` | 4 (GET, POST) |

**Endpointlar va backend:**

| Verb | URL | Backend modul | Prisma model(lar) |
|------|-----|---------------|------------------|
| `GET` | `/counterparties` | `counterparty` | `AuditLog`, `Counterparty`, `CounterpartyAccount` |
| `GET` | `/invoices-in` | `invoice-in` | `AuditLog`, `Counterparty`, `InvoiceIn`, `InvoiceInPosition`, `Organization`, `PurchaseOrder` |
| `GET` | `/organizations` | `reference` | `CashDesk`, `Employee`, `Organization`, `OrganizationAccount`, `Store` |
| `GET` | `/payments-out` | `payment-out` | `AuditLog`, `Counterparty`, `InvoiceIn`, `Organization`, `PaymentOut`, `PaymentOutOperation`, `PurchaseOrder` |
| `GET` | `/purchase-orders` | `purchase-order` | `AuditLog`, `Counterparty`, `Organization`, `PurchaseOrder`, `PurchaseOrderPosition`, `Store` |
| `POST` | `/payments-out` | `payment-out` | `AuditLog`, `Counterparty`, `InvoiceIn`, `Organization`, `PaymentOut`, `PaymentOutOperation`, `PurchaseOrder` |
| `POST` | `/payments-out/:id/clone` | `payment-out` | `AuditLog`, `Counterparty`, `InvoiceIn`, `Organization`, `PaymentOut`, `PaymentOutOperation`, `PurchaseOrder` |


### `bank-import` — Bank import    `✅ 1:1 parity`

**Vazifa**: Bank vipiska importi

**Sahifalar:**

| Sahifa | Fayl | Endpointlar |
|--------|------|-------------|
| `/bank-import` | `apps\web\src\app\(app)\bank-import\page.tsx` | 3 (GET, POST) |

**Endpointlar va backend:**

| Verb | URL | Backend modul | Prisma model(lar) |
|------|-----|---------------|------------------|
| `GET` | `/bank-import/:id` | `bank-import` | `BankStatement`, `BankStatementRow`, `Counterparty`, `PaymentIn`, `PaymentOut` |
| `GET` | `/organizations` | `reference` | `CashDesk`, `Employee`, `Organization`, `OrganizationAccount`, `Store` |
| `POST` | `/bank-import` | `bank-import` | `BankStatement`, `BankStatementRow`, `Counterparty`, `PaymentIn`, `PaymentOut` |


### `counterparties` — Kontragentlar    `✅ 1:1 parity`

**Vazifa**: Mijozlar va yetkazuvchilar

**Sahifalar:**

| Sahifa | Fayl | Endpointlar |
|--------|------|-------------|
| `/counterparties` | `apps\web\src\app\(app)\counterparties\page.tsx` | 1 (GET) |
| `/counterparties/[id]` | `apps\web\src\app\(app)\counterparties\[id]\page.tsx` | 1 (GET) |
| `/counterparties/import` | `apps\web\src\app\(app)\counterparties\import\page.tsx` | 1 (POST) |
| `/counterparties/new` | `apps\web\src\app\(app)\counterparties\new\page.tsx` | 1 (POST) |

**Endpointlar va backend:**

| Verb | URL | Backend modul | Prisma model(lar) |
|------|-----|---------------|------------------|
| `GET` | `/counterparties` | `counterparty` | `AuditLog`, `Counterparty`, `CounterpartyAccount` |
| `GET` | `/counterparties/:id` | `counterparty` | `AuditLog`, `Counterparty`, `CounterpartyAccount` |
| `POST` | `/counterparties` | `counterparty` | `AuditLog`, `Counterparty`, `CounterpartyAccount` |
| `POST` | `/counterparties/bulk-import` | `counterparty` | `AuditLog`, `Counterparty`, `CounterpartyAccount` |


### `contact-persons` — Aloqa shaxslari    `✅ 1:1 parity`

**Vazifa**: Kontragent vakillari

**Sahifalar:**

| Sahifa | Fayl | Endpointlar |
|--------|------|-------------|
| `/contact-persons` | `apps\web\src\app\(app)\contact-persons\page.tsx` | 1 (GET) |
| `/contact-persons/new` | `apps\web\src\app\(app)\contact-persons\new\page.tsx` | 2 (GET, POST) |

**Endpointlar va backend:**

| Verb | URL | Backend modul | Prisma model(lar) |
|------|-----|---------------|------------------|
| `GET` | `/contact-persons` | `contact-person` | `ContactPerson`, `Counterparty` |
| `GET` | `/counterparties` | `counterparty` | `AuditLog`, `Counterparty`, `CounterpartyAccount` |
| `POST` | `/contact-persons` | `contact-person` | `ContactPerson`, `Counterparty` |


### `opportunities` — Imkoniyatlar (CRM)    `🟡 Custom (CRM intentional)`

**Vazifa**: Sales pipeline opportunities (custom CRM)

**Sahifalar:**

| Sahifa | Fayl | Endpointlar |
|--------|------|-------------|
| `/opportunities` | `apps\web\src\app\(app)\opportunities\page.tsx` | 1 (GET) |
| `/opportunities/[id]` | `apps\web\src\app\(app)\opportunities\[id]\page.tsx` | 4 (DELETE, GET, POST) |
| `/opportunities/board` | `apps\web\src\app\(app)\opportunities\board\page.tsx` | 3 (GET, POST) |
| `/opportunities/new` | `apps\web\src\app\(app)\opportunities\new\page.tsx` | 4 (GET, POST) |

**Endpointlar va backend:**

| Verb | URL | Backend modul | Prisma model(lar) |
|------|-----|---------------|------------------|
| `DELETE` | `/opportunities/:id` | `opportunity` | `ContactPerson`, `Counterparty`, `Opportunity`, `PipelineStage` |
| `GET` | `/contact-persons` | `contact-person` | `ContactPerson`, `Counterparty` |
| `GET` | `/counterparties` | `counterparty` | `AuditLog`, `Counterparty`, `CounterpartyAccount` |
| `GET` | `/opportunities` | `opportunity` | `ContactPerson`, `Counterparty`, `Opportunity`, `PipelineStage` |
| `GET` | `/opportunities/:id` | `opportunity` | `ContactPerson`, `Counterparty`, `Opportunity`, `PipelineStage` |
| `GET` | `/opportunities/board:id` | `opportunity` | `ContactPerson`, `Counterparty`, `Opportunity`, `PipelineStage` |
| `GET` | `/pipelines` | `pipeline` | `Opportunity`, `Pipeline`, `PipelineStage` |
| `POST` | `/opportunities` | `opportunity` | `ContactPerson`, `Counterparty`, `Opportunity`, `PipelineStage` |
| `POST` | `/opportunities/:id/${archive ` | `opportunity` | `ContactPerson`, `Counterparty`, `Opportunity`, `PipelineStage` |
| `POST` | `/opportunities/:id/transition` | `opportunity` | `ContactPerson`, `Counterparty`, `Opportunity`, `PipelineStage` |


### `pipelines` — Voronka (CRM)    `🟡 Custom (CRM intentional)`

**Vazifa**: Sales funnel definitions

**Sahifalar:**

| Sahifa | Fayl | Endpointlar |
|--------|------|-------------|
| `/pipelines` | `apps\web\src\app\(app)\pipelines\page.tsx` | 1 (GET) |
| `/pipelines/[id]` | `apps\web\src\app\(app)\pipelines\[id]\page.tsx` | 5 (DELETE, GET, PATCH, POST) |
| `/pipelines/new` | `apps\web\src\app\(app)\pipelines\new\page.tsx` | 1 (POST) |

**Endpointlar va backend:**

| Verb | URL | Backend modul | Prisma model(lar) |
|------|-----|---------------|------------------|
| `DELETE` | `/pipelines/:id` | `pipeline` | `Opportunity`, `Pipeline`, `PipelineStage` |
| `GET` | `/pipelines` | `pipeline` | `Opportunity`, `Pipeline`, `PipelineStage` |
| `GET` | `/pipelines/:id` | `pipeline` | `Opportunity`, `Pipeline`, `PipelineStage` |
| `PATCH` | `/pipelines/:id` | `pipeline` | `Opportunity`, `Pipeline`, `PipelineStage` |
| `POST` | `/pipelines` | `pipeline` | `Opportunity`, `Pipeline`, `PipelineStage` |
| `POST` | `/pipelines/:id/archive` | `pipeline` | `Opportunity`, `Pipeline`, `PipelineStage` |
| `POST` | `/pipelines/:id/restore` | `pipeline` | `Opportunity`, `Pipeline`, `PipelineStage` |


### `tasks` — Vazifalar    `🟡 Custom (CRM intentional)`

**Vazifa**: CRM tasks (custom layout)

**Sahifalar:**

| Sahifa | Fayl | Endpointlar |
|--------|------|-------------|
| `/tasks` | `apps\web\src\app\(app)\tasks\page.tsx` | 1 (GET) |
| `/tasks/[id]` | `apps\web\src\app\(app)\tasks\[id]\page.tsx` | 4 (DELETE, GET, POST) |
| `/tasks/new` | `apps\web\src\app\(app)\tasks\new\page.tsx` | 2 (GET, POST) |

**Endpointlar va backend:**

| Verb | URL | Backend modul | Prisma model(lar) |
|------|-----|---------------|------------------|
| `DELETE` | `/tasks/:id` | `task` | `Employee`, `Task` |
| `GET` | `/employees` | `reference` | `CashDesk`, `Employee`, `Organization`, `OrganizationAccount`, `Store` |
| `GET` | `/tasks` | `task` | `Employee`, `Task` |
| `GET` | `/tasks/:id` | `task` | `Employee`, `Task` |
| `POST` | `/tasks` | `task` | `Employee`, `Task` |
| `POST` | `/tasks/:id/${archive ` | `task` | `Employee`, `Task` |
| `POST` | `/tasks/:id/transition` | `task` | `Employee`, `Task` |


### `calls` — Qo'ng'iroqlar    `🟡 Custom (CRM intentional)`

**Vazifa**: CRM call log

**Sahifalar:**

| Sahifa | Fayl | Endpointlar |
|--------|------|-------------|
| `/calls` | `apps\web\src\app\(app)\calls\page.tsx` | 1 (GET) |
| `/calls/new` | `apps\web\src\app\(app)\calls\new\page.tsx` | 3 (GET, POST) |

**Endpointlar va backend:**

| Verb | URL | Backend modul | Prisma model(lar) |
|------|-----|---------------|------------------|
| `GET` | `/calls` | `call` | `Call`, `ContactPerson`, `Counterparty` |
| `GET` | `/contact-persons` | `contact-person` | `ContactPerson`, `Counterparty` |
| `GET` | `/counterparties` | `counterparty` | `AuditLog`, `Counterparty`, `CounterpartyAccount` |
| `POST` | `/calls` | `call` | `Call`, `ContactPerson`, `Counterparty` |


### `service-requests` — Xizmat so'rovlari    `🟡 Custom (CRM intentional)`

**Vazifa**: Service desk tickets

**Sahifalar:**

| Sahifa | Fayl | Endpointlar |
|--------|------|-------------|
| `/service-requests` | `apps\web\src\app\(app)\service-requests\page.tsx` | 1 (GET) |

**Endpointlar va backend:**

| Verb | URL | Backend modul | Prisma model(lar) |
|------|-----|---------------|------------------|
| `GET` | `/service-requests` | `service-desk` | `AuditLog`, `ContactPerson`, `Counterparty`, `Employee`, `ServiceRequest` |


### `products` — Tovarlar    `✅ 1:1 parity`

**Vazifa**: Mahsulot katalogi

**Sahifalar:**

| Sahifa | Fayl | Endpointlar |
|--------|------|-------------|
| `/products` | `apps\web\src\app\(app)\products\page.tsx` | 1 (GET) |
| `/products/[id]` | `apps\web\src\app\(app)\products\[id]\page.tsx` | 1 (GET) |
| `/products/new` | `apps\web\src\app\(app)\products\new\page.tsx` | 2 (GET, POST) |

**Endpointlar va backend:**

| Verb | URL | Backend modul | Prisma model(lar) |
|------|-----|---------------|------------------|
| `GET` | `/product-folders` | `product-folder` | `AuditLog`, `ProductFolder` |
| `GET` | `/products` | `product` | `AuditLog`, `Product`, `ProductPack` |
| `GET` | `/products/:id` | `product` | `AuditLog`, `Product`, `ProductPack` |
| `POST` | `/products` | `product` | `AuditLog`, `Product`, `ProductPack` |


### `bundles` — Komplektlar    `✅ 1:1 parity`

**Vazifa**: Tovar kombinatsiyalari

**Sahifalar:**

| Sahifa | Fayl | Endpointlar |
|--------|------|-------------|
| `/bundles` | `apps\web\src\app\(app)\bundles\page.tsx` | 1 (GET) |
| `/bundles/new` | `apps\web\src\app\(app)\bundles\new\page.tsx` | 2 (GET, POST) |

**Endpointlar va backend:**

| Verb | URL | Backend modul | Prisma model(lar) |
|------|-----|---------------|------------------|
| `GET` | `/products` | `product` | `AuditLog`, `Product`, `ProductPack` |
| `POST` | `/products` | `product` | `AuditLog`, `Product`, `ProductPack` |


### `services` — Xizmatlar    `✅ 1:1 parity`

**Vazifa**: Sotiladigan xizmatlar

**Sahifalar:**

| Sahifa | Fayl | Endpointlar |
|--------|------|-------------|
| `/services` | `apps\web\src\app\(app)\services\page.tsx` | 1 (GET) |
| `/services/new` | `apps\web\src\app\(app)\services\new\page.tsx` | 2 (GET, POST) |

**Endpointlar va backend:**

| Verb | URL | Backend modul | Prisma model(lar) |
|------|-----|---------------|------------------|
| `GET` | `/product-folders` | `product-folder` | `AuditLog`, `ProductFolder` |
| `GET` | `/products` | `product` | `AuditLog`, `Product`, `ProductPack` |
| `POST` | `/products` | `product` | `AuditLog`, `Product`, `ProductPack` |


### `variants` — Modifikatsiyalar    `✅ 1:1 parity`

**Vazifa**: Tovar variantlari (rang/o'lcham)

**Sahifalar:**

| Sahifa | Fayl | Endpointlar |
|--------|------|-------------|
| `/variants` | `apps\web\src\app\(app)\variants\page.tsx` | 1 (GET) |
| `/variants/new` | `apps\web\src\app\(app)\variants\new\page.tsx` | 2 (GET, POST) |

**Endpointlar va backend:**

| Verb | URL | Backend modul | Prisma model(lar) |
|------|-----|---------------|------------------|
| `GET` | `/products` | `product` | `AuditLog`, `Product`, `ProductPack` |
| `GET` | `/variants` | `variant` | `Product`, `Variant` |
| `POST` | `/variants` | `variant` | `Product`, `Variant` |


### `product-folders` — Tovar guruhlari    `✅ 1:1 parity`

**Vazifa**: Mahsulot ierarxiyasi

**Sahifalar:**

| Sahifa | Fayl | Endpointlar |
|--------|------|-------------|
| `/product-folders` | `apps\web\src\app\(app)\product-folders\page.tsx` | 1 (GET) |

**Endpointlar va backend:**

| Verb | URL | Backend modul | Prisma model(lar) |
|------|-----|---------------|------------------|
| `GET` | `/product-folders/tree` | `product-folder` | `AuditLog`, `ProductFolder` |


### `price-types` — Narx tiplari    `✅ 1:1 parity`

**Vazifa**: Narx ro'yxati turlari

**Sahifalar:**

| Sahifa | Fayl | Endpointlar |
|--------|------|-------------|
| `/price-types` | `apps\web\src\app\(app)\price-types\page.tsx` | 3 (GET, PATCH, POST) |

**Endpointlar va backend:**

| Verb | URL | Backend modul | Prisma model(lar) |
|------|-----|---------------|------------------|
| `GET` | `/price-types` | `price-type` | `PriceType` |
| `PATCH` | `/price-types/:id` | `price-type` | `PriceType` |
| `POST` | `/price-types` | `price-type` | `PriceType` |


### `korzina` — Korzina    `✅ 1:1 parity`

**Vazifa**: Birlashtirilgan tovar to'plami

**Sahifalar:**

| Sahifa | Fayl | Endpointlar |
|--------|------|-------------|
| `/korzina` | `apps\web\src\app\(app)\korzina\page.tsx` | 1 (GET) |

**Endpointlar va backend:**

| Verb | URL | Backend modul | Prisma model(lar) |
|------|-----|---------------|------------------|
| `GET` | `/korzina` | `korzina` | — |


### `production` — Ishlab chiqarish    `🟡 Custom (CRM intentional)`

**Vazifa**: BOM + work orders

**Sahifalar:**

| Sahifa | Fayl | Endpointlar |
|--------|------|-------------|
| `/production` | `apps\web\src\app\(app)\production\page.tsx` | 0 (—) |
| `/production/boms` | `apps\web\src\app\(app)\production\boms\page.tsx` | 1 (GET) |
| `/production/boms/[id]` | `apps\web\src\app\(app)\production\boms\[id]\page.tsx` | 2 (GET) |
| `/production/boms/new` | `apps\web\src\app\(app)\production\boms\new\page.tsx` | 2 (GET, POST) |
| `/production/work-orders` | `apps\web\src\app\(app)\production\work-orders\page.tsx` | 1 (GET) |
| `/production/work-orders/[id]` | `apps\web\src\app\(app)\production\work-orders\[id]\page.tsx` | 1 (GET) |
| `/production/work-orders/new` | `apps\web\src\app\(app)\production\work-orders\new\page.tsx` | 2 (GET, POST) |

**Endpointlar va backend:**

| Verb | URL | Backend modul | Prisma model(lar) |
|------|-----|---------------|------------------|
| `GET` | `/boms` | `bom` | `BillOfMaterials`, `BomComponent`, `Product` |
| `GET` | `/boms/:id` | `bom` | `BillOfMaterials`, `BomComponent`, `Product` |
| `GET` | `/products` | `product` | `AuditLog`, `Product`, `ProductPack` |
| `GET` | `/work-orders` | `work-order` | `AuditLog`, `BillOfMaterials`, `Employee`, `Store`, `WorkOrder` |
| `GET` | `/work-orders/:id` | `work-order` | `AuditLog`, `BillOfMaterials`, `Employee`, `Store`, `WorkOrder` |
| `POST` | `/boms` | `bom` | `BillOfMaterials`, `BomComponent`, `Product` |
| `POST` | `/work-orders` | `work-order` | `AuditLog`, `BillOfMaterials`, `Employee`, `Store`, `WorkOrder` |


### `productions` — Production runs    `✅ 1:1 parity`

**Vazifa**: Bajarilgan production yozuvlari (BOM + work-order pipeline natijasi)

**Sahifalar:**

| Sahifa | Fayl | Endpointlar |
|--------|------|-------------|
| `/productions` | `apps\web\src\app\(app)\productions\page.tsx` | 1 (GET) |

**Endpointlar va backend:**

| Verb | URL | Backend modul | Prisma model(lar) |
|------|-----|---------------|------------------|
| `GET` | `/productions` | `production` | `AuditLog`, `CustomerOrder`, `Organization`, `ProcessingOrder`, `Production`, `Store` |


### `retail` — Chakana savdo (POS)    `✅ 1:1 parity`

**Vazifa**: Retail point of sale

**Sahifalar:**

| Sahifa | Fayl | Endpointlar |
|--------|------|-------------|
| `/retail` | `apps\web\src\app\(app)\retail\page.tsx` | 2 (GET, POST) |
| `/retail/sales` | `apps\web\src\app\(app)\retail\sales\page.tsx` | 1 (GET) |
| `/retail/sales/[id]` | `apps\web\src\app\(app)\retail\sales\[id]\page.tsx` | 1 (GET) |
| `/retail/sessions` | `apps\web\src\app\(app)\retail\sessions\page.tsx` | 1 (GET) |
| `/retail/sessions/[id]` | `apps\web\src\app\(app)\retail\sessions\[id]\page.tsx` | 2 (GET) |
| `/retail/z-report` | `apps\web\src\app\(app)\retail\z-report\page.tsx` | 1 (GET) |

**Endpointlar va backend:**

| Verb | URL | Backend modul | Prisma model(lar) |
|------|-----|---------------|------------------|
| `GET` | `/cashier-sessions` | `cashier-session` | `CashDesk`, `CashierSession`, `Organization`, `RetailSale`, `Store` |
| `GET` | `/cashier-sessions/:id` | `cashier-session` | `CashDesk`, `CashierSession`, `Organization`, `RetailSale`, `Store` |
| `GET` | `/cashier-sessions/current` | `cashier-session` | `CashDesk`, `CashierSession`, `Organization`, `RetailSale`, `Store` |
| `GET` | `/retail-sales` | `retail-sale` | `CashDesk`, `CashierSession`, `RetailSale`, `RetailSalePosition` |
| `GET` | `/retail-sales/:id` | `retail-sale` | `CashDesk`, `CashierSession`, `RetailSale`, `RetailSalePosition` |
| `GET` | `/retail-sales/z-report` | `retail-sale` | `CashDesk`, `CashierSession`, `RetailSale`, `RetailSalePosition` |
| `POST` | `/retail-sales` | `retail-sale` | `CashDesk`, `CashierSession`, `RetailSale`, `RetailSalePosition` |


### `ecommerce` — E-commerce    `✅ 1:1 parity`

**Vazifa**: Online order management

**Sahifalar:**

| Sahifa | Fayl | Endpointlar |
|--------|------|-------------|
| `/ecommerce` | `apps\web\src\app\(app)\ecommerce\page.tsx` | 2 (GET) |
| `/ecommerce/channels` | `apps\web\src\app\(app)\ecommerce\channels\page.tsx` | 1 (GET) |
| `/ecommerce/channels/[id]` | `apps\web\src\app\(app)\ecommerce\channels\[id]\page.tsx` | 2 (GET, PATCH) |
| `/ecommerce/channels/new` | `apps\web\src\app\(app)\ecommerce\channels\new\page.tsx` | 1 (POST) |
| `/ecommerce/orders` | `apps\web\src\app\(app)\ecommerce\orders\page.tsx` | 1 (GET) |
| `/ecommerce/orders/[id]` | `apps\web\src\app\(app)\ecommerce\orders\[id]\page.tsx` | 1 (GET) |

**Endpointlar va backend:**

| Verb | URL | Backend modul | Prisma model(lar) |
|------|-----|---------------|------------------|
| `GET` | `/online-orders` | `online-order` | `OnlineOrder`, `SalesChannel` |
| `GET` | `/online-orders/:id` | `online-order` | `OnlineOrder`, `SalesChannel` |
| `GET` | `/online-orders/counts` | `online-order` | `OnlineOrder`, `SalesChannel` |
| `GET` | `/sales-channels` | `sales-channel` | `OnlineOrder`, `SalesChannel` |
| `GET` | `/sales-channels/:id` | `sales-channel` | `OnlineOrder`, `SalesChannel` |
| `PATCH` | `/sales-channels/:id` | `sales-channel` | `OnlineOrder`, `SalesChannel` |
| `POST` | `/sales-channels` | `sales-channel` | `OnlineOrder`, `SalesChannel` |


### `reports` — Hisobotlar    `✅ 1:1 parity`

**Vazifa**: Analytics dashboards

**Sahifalar:**

| Sahifa | Fayl | Endpointlar |
|--------|------|-------------|
| `/reports` | `apps\web\src\app\(app)\reports\page.tsx` | 0 (—) |
| `/reports/abc-analysis` | `apps\web\src\app\(app)\reports\abc-analysis\page.tsx` | 1 (GET) |
| `/reports/aging` | `apps\web\src\app\(app)\reports\aging\page.tsx` | 1 (GET) |
| `/reports/cash-flow` | `apps\web\src\app\(app)\reports\cash-flow\page.tsx` | 1 (GET) |
| `/reports/counterparty-balance` | `apps\web\src\app\(app)\reports\counterparty-balance\page.tsx` | 1 (GET) |
| `/reports/pnl` | `apps\web\src\app\(app)\reports\pnl\page.tsx` | 1 (GET) |
| `/reports/returns-ratio` | `apps\web\src\app\(app)\reports\returns-ratio\page.tsx` | 1 (GET) |
| `/reports/sales` | `apps\web\src\app\(app)\reports\sales\page.tsx` | 1 (GET) |
| `/reports/stock-balance` | `apps\web\src\app\(app)\reports\stock-balance\page.tsx` | 2 (GET) |

**Endpointlar va backend:**

| Verb | URL | Backend modul | Prisma model(lar) |
|------|-----|---------------|------------------|
| `GET` | `/reports/abc-analysis` | `report` | `CashIn`, `CashOut`, `Counterparty`, `CounterpartyBalance`, `CustomerOrder`, `Demand`, `Employee`, `InvoiceOut`, `Organization`, `PaymentIn`, `PaymentOut`, `Product`, `SalesReturn`, `Stock`, `Store`, `Task` |
| `GET` | `/reports/aging` | `report` | `CashIn`, `CashOut`, `Counterparty`, `CounterpartyBalance`, `CustomerOrder`, `Demand`, `Employee`, `InvoiceOut`, `Organization`, `PaymentIn`, `PaymentOut`, `Product`, `SalesReturn`, `Stock`, `Store`, `Task` |
| `GET` | `/reports/cash-flow` | `report` | `CashIn`, `CashOut`, `Counterparty`, `CounterpartyBalance`, `CustomerOrder`, `Demand`, `Employee`, `InvoiceOut`, `Organization`, `PaymentIn`, `PaymentOut`, `Product`, `SalesReturn`, `Stock`, `Store`, `Task` |
| `GET` | `/reports/counterparty-balance` | `report` | `CashIn`, `CashOut`, `Counterparty`, `CounterpartyBalance`, `CustomerOrder`, `Demand`, `Employee`, `InvoiceOut`, `Organization`, `PaymentIn`, `PaymentOut`, `Product`, `SalesReturn`, `Stock`, `Store`, `Task` |
| `GET` | `/reports/pnl` | `report` | `CashIn`, `CashOut`, `Counterparty`, `CounterpartyBalance`, `CustomerOrder`, `Demand`, `Employee`, `InvoiceOut`, `Organization`, `PaymentIn`, `PaymentOut`, `Product`, `SalesReturn`, `Stock`, `Store`, `Task` |
| `GET` | `/reports/returns-ratio` | `report` | `CashIn`, `CashOut`, `Counterparty`, `CounterpartyBalance`, `CustomerOrder`, `Demand`, `Employee`, `InvoiceOut`, `Organization`, `PaymentIn`, `PaymentOut`, `Product`, `SalesReturn`, `Stock`, `Store`, `Task` |
| `GET` | `/reports/sales` | `report` | `CashIn`, `CashOut`, `Counterparty`, `CounterpartyBalance`, `CustomerOrder`, `Demand`, `Employee`, `InvoiceOut`, `Organization`, `PaymentIn`, `PaymentOut`, `Product`, `SalesReturn`, `Stock`, `Store`, `Task` |
| `GET` | `/reports/stock-balance` | `report` | `CashIn`, `CashOut`, `Counterparty`, `CounterpartyBalance`, `CustomerOrder`, `Demand`, `Employee`, `InvoiceOut`, `Organization`, `PaymentIn`, `PaymentOut`, `Product`, `SalesReturn`, `Stock`, `Store`, `Task` |
| `GET` | `/stores` | `reference` | `CashDesk`, `Employee`, `Organization`, `OrganizationAccount`, `Store` |


### `settings` — Sozlamalar    `✅ 1:1 parity`

**Vazifa**: Admin va konfiguratsiya

**Sahifalar:**

| Sahifa | Fayl | Endpointlar |
|--------|------|-------------|
| `/settings` | `apps\web\src\app\(app)\settings\page.tsx` | 0 (—) |
| `/settings/attributes` | `apps\web\src\app\(app)\settings\attributes\page.tsx` | 1 (GET) |
| `/settings/audit-log` | `apps\web\src\app\(app)\settings\audit-log\page.tsx` | 1 (GET) |
| `/settings/bank-accounts` | `apps\web\src\app\(app)\settings\bank-accounts\page.tsx` | 1 (GET) |
| `/settings/bank-accounts/[id]` | `apps\web\src\app\(app)\settings\bank-accounts\[id]\page.tsx` | 6 (DELETE, GET, PATCH, POST) |
| `/settings/bank-accounts/new` | `apps\web\src\app\(app)\settings\bank-accounts\new\page.tsx` | 2 (GET, POST) |
| `/settings/cash-desks` | `apps\web\src\app\(app)\settings\cash-desks\page.tsx` | 1 (GET) |
| `/settings/cash-desks/[id]` | `apps\web\src\app\(app)\settings\cash-desks\[id]\page.tsx` | 5 (DELETE, GET, PATCH, POST) |
| `/settings/cash-desks/new` | `apps\web\src\app\(app)\settings\cash-desks\new\page.tsx` | 1 (POST) |
| `/settings/email` | `apps\web\src\app\(app)\settings\email\page.tsx` | 4 (DELETE, GET, POST, PUT) |
| `/settings/email/log` | `apps\web\src\app\(app)\settings\email\log\page.tsx` | 1 (GET) |
| `/settings/exchange-rates` | `apps\web\src\app\(app)\settings\exchange-rates\page.tsx` | 2 (GET, POST) |
| `/settings/mxik` | `apps\web\src\app\(app)\settings\mxik\page.tsx` | 1 (GET) |
| `/settings/mxik/import` | `apps\web\src\app\(app)\settings\mxik\import\page.tsx` | 1 (POST) |
| `/settings/organizations` | `apps\web\src\app\(app)\settings\organizations\page.tsx` | 1 (GET) |
| `/settings/organizations/[id]` | `apps\web\src\app\(app)\settings\organizations\[id]\page.tsx` | 5 (DELETE, GET, PATCH, POST) |
| `/settings/organizations/new` | `apps\web\src\app\(app)\settings\organizations\new\page.tsx` | 1 (POST) |
| `/settings/price-types` | `apps\web\src\app\(app)\settings\price-types\page.tsx` | 1 (GET) |
| `/settings/price-types/[id]` | `apps\web\src\app\(app)\settings\price-types\[id]\page.tsx` | 5 (DELETE, GET, PATCH, POST) |
| `/settings/price-types/new` | `apps\web\src\app\(app)\settings\price-types\new\page.tsx` | 1 (POST) |
| `/settings/print-templates` | `apps\web\src\app\(app)\settings\print-templates\page.tsx` | 1 (GET) |
| `/settings/stores` | `apps\web\src\app\(app)\settings\stores\page.tsx` | 1 (GET) |
| `/settings/stores/[id]` | `apps\web\src\app\(app)\settings\stores\[id]\page.tsx` | 6 (DELETE, GET, PATCH, POST) |
| `/settings/stores/new` | `apps\web\src\app\(app)\settings\stores\new\page.tsx` | 1 (POST) |
| `/settings/users` | `apps\web\src\app\(app)\settings\users\page.tsx` | 1 (GET) |
| `/settings/users/[id]` | `apps\web\src\app\(app)\settings\users\[id]\page.tsx` | 1 (GET) |
| `/settings/webhooks` | `apps\web\src\app\(app)\settings\webhooks\page.tsx` | 1 (GET) |
| `/settings/webhooks/[id]/deliveries` | `apps\web\src\app\(app)\settings\webhooks\[id]\deliveries\page.tsx` | 1 (GET) |

**Endpointlar va backend:**

| Verb | URL | Backend modul | Prisma model(lar) |
|------|-----|---------------|------------------|
| `DELETE` | `/admin/cash-desks/:id` | `cash-desk` | `CashDesk`, `CashIn`, `CashOut` |
| `DELETE` | `/admin/organization-accounts/:id` | `organization-account` | `MoneyOperation`, `OrganizationAccount` |
| `DELETE` | `/admin/organizations/:id` | `organization` | `Demand`, `InvoiceOut`, `Organization`, `PaymentIn`, `Supply` |
| `DELETE` | `/admin/stores/:id` | `store` | `Stock`, `Store` |
| `DELETE` | `/email/config` | `email` | `Attachment`, `EmailConfig`, `EmailLog` |
| `DELETE` | `/price-types/:id` | `price-type` | `PriceType` |
| `GET` | `/admin/audit-logs` | `audit-log` | `AuditLog` |
| `GET` | `/admin/cash-desks` | `cash-desk` | `CashDesk`, `CashIn`, `CashOut` |
| `GET` | `/admin/cash-desks/:id` | `cash-desk` | `CashDesk`, `CashIn`, `CashOut` |
| `GET` | `/admin/organization-accounts` | `organization-account` | `MoneyOperation`, `OrganizationAccount` |
| `GET` | `/admin/organization-accounts/:id` | `organization-account` | `MoneyOperation`, `OrganizationAccount` |
| `GET` | `/admin/organizations` | `organization` | `Demand`, `InvoiceOut`, `Organization`, `PaymentIn`, `Supply` |
| `GET` | `/admin/organizations/:id` | `organization` | `Demand`, `InvoiceOut`, `Organization`, `PaymentIn`, `Supply` |
| `GET` | `/admin/stores` | `store` | `Stock`, `Store` |
| `GET` | `/admin/stores/:id` | `store` | `Stock`, `Store` |
| `GET` | `/attribute-metadata` | `attribute-metadata` | `AttributeMetadata`, `CustomEntity` |
| `GET` | `/auth/me` | `auth` | `Employee`, `RefreshToken` |
| `GET` | `/email/config` | `email` | `Attachment`, `EmailConfig`, `EmailLog` |
| `GET` | `/email/logs` | `email` | `Attachment`, `EmailConfig`, `EmailLog` |
| `GET` | `/exchange-rates/latest` | `exchange-rate` | `ExchangeRate` |
| `GET` | `/mxik` | `mxik` | `MxikCode` |
| `GET` | `/price-types` | `price-type` | `PriceType` |
| `GET` | `/price-types/:id` | `price-type` | `PriceType` |
| `GET` | `/print-templates` | `print-template` | `PrintTemplate` |
| `GET` | `/webhook` | `webhook` | `Webhook`, `WebhookDelivery`, `WebhookStock` |
| `GET` | `/webhook/:id/deliveries` | `webhook` | `Webhook`, `WebhookDelivery`, `WebhookStock` |
| `PATCH` | `/admin/cash-desks/:id` | `cash-desk` | `CashDesk`, `CashIn`, `CashOut` |
| `PATCH` | `/admin/organization-accounts/:id` | `organization-account` | `MoneyOperation`, `OrganizationAccount` |
| `PATCH` | `/admin/organizations/:id` | `organization` | `Demand`, `InvoiceOut`, `Organization`, `PaymentIn`, `Supply` |
| `PATCH` | `/admin/stores/:id` | `store` | `Stock`, `Store` |
| `PATCH` | `/price-types/:id` | `price-type` | `PriceType` |
| `POST` | `/admin/cash-desks` | `cash-desk` | `CashDesk`, `CashIn`, `CashOut` |
| `POST` | `/admin/cash-desks/:id/archive` | `cash-desk` | `CashDesk`, `CashIn`, `CashOut` |
| `POST` | `/admin/cash-desks/:id/restore` | `cash-desk` | `CashDesk`, `CashIn`, `CashOut` |
| `POST` | `/admin/organization-accounts` | `organization-account` | `MoneyOperation`, `OrganizationAccount` |
| `POST` | `/admin/organization-accounts/:id/archive` | `organization-account` | `MoneyOperation`, `OrganizationAccount` |
| `POST` | `/admin/organization-accounts/:id/restore` | `organization-account` | `MoneyOperation`, `OrganizationAccount` |
| `POST` | `/admin/organizations` | `organization` | `Demand`, `InvoiceOut`, `Organization`, `PaymentIn`, `Supply` |
| `POST` | `/admin/organizations/:id/archive` | `organization` | `Demand`, `InvoiceOut`, `Organization`, `PaymentIn`, `Supply` |
| `POST` | `/admin/organizations/:id/restore` | `organization` | `Demand`, `InvoiceOut`, `Organization`, `PaymentIn`, `Supply` |
| `POST` | `/admin/stores` | `store` | `Stock`, `Store` |
| `POST` | `/admin/stores/:id/archive` | `store` | `Stock`, `Store` |
| `POST` | `/admin/stores/:id/restore` | `store` | `Stock`, `Store` |
| `POST` | `/email/config/test` | `email` | `Attachment`, `EmailConfig`, `EmailLog` |
| `POST` | `/exchange-rates/sync` | `exchange-rate` | `ExchangeRate` |
| `POST` | `/mxik/bulk-import` | `mxik` | `MxikCode` |
| `POST` | `/price-types` | `price-type` | `PriceType` |
| `POST` | `/price-types/:id/archive` | `price-type` | `PriceType` |
| `POST` | `/price-types/:id/restore` | `price-type` | `PriceType` |
| `PUT` | `/email/config` | `email` | `Attachment`, `EmailConfig`, `EmailLog` |


---

## Cross-cutting infrastructure (har sahifa ishlatadi)

Quyidagi NestJS modullari frontend sahifalarida bevosita URL'i
ko'rinmaydi, lekin har bir requestda ishlaydi:

| Modul | Vazifa | Qachon ishlaydi |
|-------|--------|-----------------|
| `auth` | JWT cookie tekshirish, refresh token | Har request, JwtAuthGuard orqali |
| `permissions` | RBAC (EGASI/ADMIN/XODIM) tekshiruvi | RequirePermission decorator bo'lgan endpointlar |
| `audit-log` | Hujjat o'zgarishlarini yozish (POST/PATCH/DELETE) | Service interceptor orqali avtomat |
| `attachment` | Fayl yuklash (PDF, image, Excel) | Detail sahifa "Fayllar" tab orqali |
| `attribute-metadata` | Custom maydon definitsiyalari | Har detail sahifa "Qo'shimcha" tab |
| `notification` | Bell + SSE stream | NotificationBell komponentidan |
| `saved-filter` | Filter pill'lari (per-user) | List sahifa SavedFiltersPills |
| `print-template` | PDF print (sales/purchase/invoices) | Detail sahifa "Chop etish" |
| `state` | FSM transitions (draft → posted → paid) | Har FSM-aware document |
| `stock` | Real-time stok hisob-kitobi | Demand/supply/move/inventory write paths |
| `money` | Currency conversion + rate snapshot | Multi-currency document save |
| `exchange-rate` | UZS↔USD/RUB kurs kunlik refresh | Money module ichida |
| `mxik` | Tax classification (Uzbekistan) | Product detail "Soliq" tab |
| `marking` | Tovar markirovkasi (KIZ/Honest Sign) | Product/demand pozitsiya darajasida |
| `edo` | Elektron hujjat almashish | Demand/supply detail "Chiqarish" |
| `email` | SMTP yuborish + log | Detail toolbar "Yuborish" |
| `sms` | Eskiz.uz integratsiyasi | Notification kanal |
| `telegram` | Telegram bot xabarlari | Notification kanal |
| `webhook` | Outbound webhook delivery | Settings → webhooks |
| `loyalty` | Sodiqlik dasturi (kelajakda) | Counterparty + retail-sale |
| `payment-gateway` | Click/Payme/Apelsin | Settings → payment-gateways |
| `integrations` | Telegram/Eskiz/Click/Payme conf | Settings → integrations |
| `onboarding` | Yangi tenant uchun seed (organization, store, etc.) | Account create flow |
| `app-install` | Apps katalogi metadata | /apps sahifa |
| `image` | Image upload + thumbnail | Product/counterparty avatar |
| `bank-import` | Bank vipiska parsing | /bank-import wizard |
| `moysklad-compat` | Moysklad API token + JSON shape | /admin/api-tokens (kelajakda integratsiyalar) |
| `shared` | bulk.ts, tenant guard utility | Har controller import qiladi |

## Backend modullar tahlili (74 ta jami)

- **Frontend'da to'g'ridan-to'g'ri ishlatiladi**: 52 ta
- **Cross-cutting / sub-resource**: 22 ta (yuqoridagi jadval)

---

## Yakuniy parity baholash

| Aspekt | Holat | Tafsilot |
|--------|-------|----------|
| **Sahifalar soni** | 139 ta page.tsx | 35 ta entity + 28 ta settings + 9 ta reports + 7 ta production + 6 ta retail + 6 ta ecommerce + boshqalar |
| **Backend modullar** | 74 ta NestJS modul | 37 ta entity-controller + 37 ta cross-cutting/shared |
| **Unique endpoint families** | 55 ta URL prefix | hammasi backend modulga mos keladi (0 unmapped) |
| **Endpoint calls (har sahifadagi noyob)** | 293 ta | har sahifa o'rtacha 2.1 ta API calls |
| **Prisma modellar** | 100+ ta | har biri `accountId` bilan tenant-scoped (RLS) |
| **i18n** | 2094 ta uz key, 100% true coverage | uz (manba) + ru (98.7% strukturiy) |
| **Test count** | 1115 web + 90 ui = 1205 | 0 fail, 1 skipped |
| **Visual chrome parity** | ~99% | Sweep 1-8 + Sprint A1-A5 keyin |
| **UX parity** | ~95% | "1 of N" pagination + API viewer + SavedFilters live |

### Aniqlangan kichik kamchiliklar (P3-P4)

1. **`production` (hub) sahifa API call qilmaydi** — bu intentional, faqat sub-page navigation kartalari ko'rsatadi (`/production/boms`, `/production/work-orders`).
2. **`reports` (hub) sahifa API call qilmaydi** — xuddi production hub kabi, sub-pagelarga link.
3. **`settings` (hub) sahifa API call qilmaydi** — settings sub-pagelarga link.
4. **ChatButton** — Crisp/Intercom integratsiyasi disabled placeholder (P4, 1 sprint).
5. **3 ta CRM sahifa custom layout**: opportunities, pipelines, tasks — moysklad reference yo'q, intentional dizayn.

### Funksional uniformlik tekshiruvi (`audit/check-uniformity.py`)

**Frontend detail sahifalar (18 ta):**

| Tekshiruv | Coverage | Status |
|-----------|----------|--------|
| `DetailToolbar` | 18/18 | ✅ |
| `DetailHeader` | 18/18 | ✅ |
| `useUnsavedGuard` | 16/18 | ⚠️ counterparties + products read-only view (intentional) |
| `useDestructiveMutation` | 18/18 | ✅ |
| `useApiMutation` (FSM transitions) | 18/18 | ✅ |
| `useDetailNavigation` (1 of N) | 18/18 | ✅ |
| `useSaveMutation` (toast on save) | 16/18 | ⚠️ counterparties + products read-only (intentional) |
| `apiData` prop (API'da ochish) | 18/18 | ✅ |

**Frontend list sahifalar:**

- `ListView` + `moyskladToolbar` mode: 100% (29/29 list pages)
- `useBulkDocumentActions`: 100% in document-list pages
- `useColumnVisibility`: 100% in document-list pages
- `SavedFiltersPills`: 100% in pages with filter combinations (state + agent + period)

**Backend kontroller uniformlik (27 ta entity modul):**

| Tekshiruv | Coverage | Status |
|-----------|----------|--------|
| `JwtAuthGuard` | 27/27 | ✅ |
| `RequirePermission` decorator | 27/27 | ✅ |
| `CurrentUser` decorator | 27/27 | ✅ |
| `accountId` tenant scope | 27/27 | ✅ |
| Global `BigInt → string` JSON serializer | `main.ts` da o'rnatildi | ✅ |

### Hujjat ketma-ketliklari (`audit/check-sequences.py`)

Moysklad'da hujjatlar zanjir bilan bog'langan: customer-order → demand → invoice-out → payment-in.
Har bog'lanish 3 darajada tekshirilgan (frontend menu / backend endpoint / Prisma FK).

**12 ta sequence tekshirildi, 8 ta to'liq, 4 ta gap:**

| Source → Downstream | Frontend | Backend | Schema | Holat |
|---------------------|----------|---------|--------|-------|
| customer-orders → demands | ✅ | ✅ | ✅ | To'liq |
| customer-orders → invoices-out | ✅ | ✅ | ✅ | To'liq |
| customer-orders → payments-in | ❌ | ❌ | n/a | **Gap (P1)** |
| demands → sales-returns | ✅ (?fromDemand=) | ✅ | ✅ | To'liq |
| demands → invoices-out | ❌ | ❌ | n/a | **Gap (P1)** |
| invoices-out → payments-in | ✅ | ✅ | ✅ (FK PaymentInOperation.invoiceOutId) | To'liq |
| purchase-orders → supplies | ✅ | ✅ | ✅ | To'liq |
| purchase-orders → invoices-in | ✅ | ✅ | ✅ | To'liq |
| purchase-orders → payments-out | ✅ | ✅ | ✅ | To'liq |
| supplies → purchase-returns | ✅ (?fromSupply=) | ✅ | ✅ | To'liq |
| supplies → invoices-in | ❌ | ❌ | n/a | **Gap (P1)** |
| invoices-in → payments-out | ✅ | ✅ | ✅ | To'liq |

### Yangi P1 backlog (yuqoridagi 3 ta sequence gap)

Bu 3 ta moysklad pipeline biz'da to'liq emas:

1. **CustomerOrder → PaymentIn** — "Avans to'lovi" (advance payment) flow.
   - Bekend: `payment-in.controller`'ga `@Post('from-customer-order/:id')` qo'shish
   - Service: PaymentInService.createFromCustomerOrder() — agent/org/sum mijoz buyurtmasidan, link via PaymentInOperation
   - Frontend: customer-orders/[id] page'dagi `payment-in` menu item enable qilish (hozir disabled placeholder)

2. **Demand → InvoiceOut** — Tovar chiqarilgandan keyin alohida hisob-faktura.
   - Bekend: `invoice-out.controller`'ga `@Post('from-demand/:id')` qo'shish
   - Frontend: demands/[id] page'ga `invoice-out` menu item qo'shish

3. **Supply → InvoiceIn** — Tovar qabul qilingandan keyin yetkazuvchidan kelgan hisob-faktura.
   - Bekend: `invoice-in.controller`'ga `@Post('from-supply/:id')` qo'shish
   - Frontend: supplies/[id] page'ga `invoice-in` menu item qo'shish

**Effort baholash:** 3 ta sequence × ~75 LoC + testlar = ~250 LoC. **1-2 sprint.**

### Boshqa funksional kamchiliklar

4. **counterparties + products detail sahifalar read-only** — moysklad'da bular editable. Hozir bizda alohida `/edit` sahifa yo'q, balki detail = view + tabs. **Effort:** ikkala detail sahifani EditForm ga o'tkazish, ~200 LoC har biri. P2.

5. **`Запросить оплату` button** — customer-order detail header'da kerak edi (kommentda). Hozir yo'q. P3.

### Audit'larni qayta ishga tushirish

```bash
cd D:/projects/moysklad
python audit/check-uniformity.py    # frontend + backend uniform behavior
python audit/check-sequences.py     # CO→Demand→Invoice gap detection
```

### Ma'lumot oqimi xavfsizligi (security data flow)

Har bir POST/PATCH/DELETE quyidagi gates orqali o'tadi:

1. **JWT cookie** → AuthGuard token validatsiyasi
2. **CurrentUser decorator** → user + accountId + role extract
3. **RequirePermission decorator** → RBAC tekshiruvi (EGASI/ADMIN/XODIM)
4. **Service-level tenant guard** → har query `accountId` qo'shadi
5. **PostgreSQL RLS** → DB darajasida final isolation (cross-tenant leak imkonsiz)
6. **Audit log** → mutation natijasini AuditLog jadvaliga yozish

---

_Hisobot avtomatik generatsiya qilindi_ — qayta ishga tushirish:

```bash
python audit/trace-data-flow.py    # endpoint scan + JSON dump
python audit/generate-data-flow-md.py    # JSON -> docs/data-flow-audit.md
```
