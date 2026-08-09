# Record-scope qamrov hisoboti (MK39)

> **AVTOMAT HOSILA — QO`LDA TAHRIRLAMA.** Manba: `scripts/record-scope-coverage.ts`
> (`pnpm record-scope:coverage`). Registr va darvoza mantiqi:
> `apps/api/src/modules/permissions/record-scope-coverage.ts`.

## Xulosa

- Scoped model (schema.prisma `{ownerId, groupId, shared}`): **55**
- Record-scope qo`llanadigan: **47** · qo`llanmaydigan: 8
- ✅ majburlangan: **2** / 47 (**4%**) · 🟠 yarim: 0 · ❌ ulanmagan: 35 · ❌ entity slug yo`q: 5 · ⚪ o`qish-yo`li yo`q: 5

- **YOQISH DARVOZASI: 🔴 YOPIQ — 45 bloker**
- `Account.recordScopeEnforced` sxema default'i: `false`

## Qatorlar

| Model | Entity | Holat | list | detail | Servis / sabab |
|---|---|---|---|---|---|
| CashierSession | `cashiersession` | ❌ ulanmagan | · | · | `apps/api/src/modules/cashier-session/cashier-session.service.ts` |
| CashIn | `cashin` | ❌ ulanmagan | · | · | `apps/api/src/modules/cash-in/cash-in.service.ts` |
| CashOut | `cashout` | ❌ ulanmagan | · | · | `apps/api/src/modules/cash-out/cash-out.service.ts` |
| CommissionReportIn | `commissionreport` | ❌ ulanmagan | · | · | `apps/api/src/modules/commission-report/commission-report.service.ts` |
| CommissionReportOut | `commissionreport` | ❌ ulanmagan | · | · | `apps/api/src/modules/commission-report/commission-report.service.ts` |
| Contract | `contract` | ❌ ulanmagan | · | · | `apps/api/src/modules/contract/contract.service.ts` |
| Counterparty | `counterparty` | ❌ ulanmagan | · | · | `apps/api/src/modules/counterparty/counterparty.service.ts` |
| CounterpartyAdjustment | `counterpartyadjustment` | ❌ ulanmagan | · | · | `apps/api/src/modules/counterparty-adjustment/counterparty-adjustment.service.ts` |
| Enter | `enter` | ❌ ulanmagan | · | · | `apps/api/src/modules/enter/enter.service.ts` |
| FactureIn | `facturein` | ❌ ulanmagan | · | · | `apps/api/src/modules/facture-in/facture-in.service.ts` |
| FactureOut | `factureout` | ❌ ulanmagan | · | · | `apps/api/src/modules/facture-out/facture-out.service.ts` |
| InternalOrder | `internalorder` | ❌ ulanmagan | · | · | `apps/api/src/modules/internal-order/internal-order.service.ts` |
| Inventory | `inventory` | ❌ ulanmagan | · | · | `apps/api/src/modules/inventory/inventory.service.ts` |
| InvoiceIn | `invoicein` | ❌ ulanmagan | · | · | `apps/api/src/modules/invoice-in/invoice-in.service.ts` |
| InvoiceOut | `invoiceout` | ❌ ulanmagan | · | · | `apps/api/src/modules/invoice-out/invoice-out.service.ts` |
| Loss | `loss` | ❌ ulanmagan | · | · | `apps/api/src/modules/loss/loss.service.ts` |
| Move | `move` | ❌ ulanmagan | · | · | `apps/api/src/modules/move/move.service.ts` |
| PaymentIn | `paymentin` | ❌ ulanmagan | · | · | `apps/api/src/modules/payment-in/payment-in.service.ts` |
| PaymentOut | `paymentout` | ❌ ulanmagan | · | · | `apps/api/src/modules/payment-out/payment-out.service.ts` |
| Payroll | `payroll` | ❌ ulanmagan | · | · | `apps/api/src/modules/payroll/payroll.service.ts` |
| Prepayment | `prepayment` | ❌ ulanmagan | · | · | `apps/api/src/modules/prepayment/prepayment.service.ts` |
| PrepaymentReturn | `prepaymentreturn` | ❌ ulanmagan | · | · | `apps/api/src/modules/prepayment-return/prepayment-return.service.ts` |
| PriceList | `pricelist` | ❌ ulanmagan | · | · | `apps/api/src/modules/price-list/price-list.service.ts` |
| Processing | `processing` | ❌ ulanmagan | · | · | `apps/api/src/modules/processing/processing.service.ts` |
| ProcessingOrder | `processingorder` | ❌ ulanmagan | · | · | `apps/api/src/modules/processing-order/processing-order.service.ts` |
| ProcessingProcess | `processingprocess` | ❌ ulanmagan | · | · | `apps/api/src/modules/processing-process/processing-process.service.ts` |
| ProcessingStage | `processingstage` | ❌ ulanmagan | · | · | `apps/api/src/modules/processing-stage/processing-stage.service.ts` |
| Product | `product` | ❌ ulanmagan | · | · | `apps/api/src/modules/product/product.service.ts` |
| ProductFolder | `productfolder` | ❌ ulanmagan | · | · | `apps/api/src/modules/product-folder/product-folder.service.ts` |
| Project | `project` | ❌ ulanmagan | · | · | `apps/api/src/modules/project/project.service.ts` |
| PurchaseOrder | `purchaseorder` | ❌ ulanmagan | · | · | `apps/api/src/modules/purchase-order/purchase-order.service.ts` |
| PurchaseReturn | `purchasereturn` | ❌ ulanmagan | · | · | `apps/api/src/modules/purchase-return/purchase-return.service.ts` |
| RetailSale | `retailsale` | ❌ ulanmagan | · | · | `apps/api/src/modules/retail-sale/retail-sale.service.ts` |
| SalesReturn | `salesreturn` | ❌ ulanmagan | · | · | `apps/api/src/modules/sales-return/sales-return.service.ts` |
| Supply | `supply` | ❌ ulanmagan | · | · | `apps/api/src/modules/supply/supply.service.ts` |
| BonusOperation | — | ❌ entity slug yo`q | · | · | `apps/api/src/modules/loyalty/loyalty.service.ts` |
| Production | — | ❌ entity slug yo`q | · | · | `apps/api/src/modules/production/production.service.ts` |
| RetailDrawerCashIn | — | ❌ entity slug yo`q | · | · | `apps/api/src/modules/cashier-session/cashier-session.service.ts` |
| RetailDrawerCashOut | — | ❌ entity slug yo`q | · | · | `apps/api/src/modules/cashier-session/cashier-session.service.ts` |
| ServiceRequest | — | ❌ entity slug yo`q | · | · | `apps/api/src/modules/service-desk/service-request.service.ts` |
| EmissionOrder | — | ⚪ o`qish-yo`li yo`q | · | · | Markirovka emissiya buyurtmasi; `findMany` o`qish-yo`li hali yo`q (2026-08-10 grep). |
| MarkingCodeOrder | — | ⚪ o`qish-yo`li yo`q | · | · | Markirovka kod buyurtmasi; `findMany` o`qish-yo`li hali yo`q (2026-08-10 grep). |
| ProcessingPlanFolder | — | ⚪ o`qish-yo`li yo`q | · | · | Texkarta papkasi; `findMany` o`qish-yo`li hali yo`q (2026-08-10 grep). |
| RetailSalesReturn | — | ⚪ o`qish-yo`li yo`q | · | · | Chakana qaytarish; `findMany` o`qish-yo`li hali yo`q (2026-08-10 grep). Qo`shilganda darvoza uni talab qiladi. |
| RetireOrder | — | ⚪ o`qish-yo`li yo`q | · | · | Markirovka chiqarish buyurtmasi; `findMany` o`qish-yo`li hali yo`q (2026-08-10 grep). |
| CustomerOrder | `customerorder` | ✅ majburlangan | ✓ | ✓ | `apps/api/src/modules/customer-order/customer-order.service.ts` |
| Demand | `demand` | ✅ majburlangan | ✓ | ✓ | `apps/api/src/modules/demand/demand.service.ts` |
| Country | `country` | ➖ qo`llanmaydi | · | · | `apps/api/src/modules/country/country.service.ts` |
| Employee | `employee` | ➖ qo`llanmaydi | · | · | Tashkiliy struktura. Xodimlar ro`yxati butun ilovada dropdown (mas`ul, ijrochi, egasi) — yozuv-darajasida filtrlash maxfiylik bermaydi, ekranlarni bo`shatadi. Ko`rinish HR ruxsatlari (MK27) va filial o`qi (MK35) bilan boshqariladi. |
| Organization | `organization` | ➖ qo`llanmaydi | · | · | `apps/api/src/modules/organization/organization.service.ts` |
| RetailStore | — | ➖ qo`llanmaydi | · | · | Chakana do`kon ma`lumotnomasi (dropdown), `Store` bilan bir xil sabab; o`qish-yo`li ham yo`q. |
| SalesChannel | `saleschannel` | ➖ qo`llanmaydi | · | · | `apps/api/src/modules/sales-channel/sales-channel.service.ts` |
| Store | `store` | ➖ qo`llanmaydi | · | · | `apps/api/src/modules/store/store.service.ts` |
| TaxRate | `taxrate` | ➖ qo`llanmaydi | · | · | `apps/api/src/modules/tax-rate/tax-rate.service.ts` |
| Uom | `uom` | ➖ qo`llanmaydi | · | · | `apps/api/src/modules/uom/uom.service.ts` |

## Blokerlar (yoqishga to`sqinlik qiladi)

- CashIn [missing] — record-scope umuman ulanmagan (ro`yxat to`liq ochiq qoladi)
- CashOut [missing] — record-scope umuman ulanmagan (ro`yxat to`liq ochiq qoladi)
- ProductFolder [missing] — record-scope umuman ulanmagan (ro`yxat to`liq ochiq qoladi)
- Counterparty [missing] — record-scope umuman ulanmagan (ro`yxat to`liq ochiq qoladi)
- Project [missing] — record-scope umuman ulanmagan (ro`yxat to`liq ochiq qoladi)
- Contract [missing] — record-scope umuman ulanmagan (ro`yxat to`liq ochiq qoladi)
- BonusOperation [no-entity] — PermissionEntity slug`i yo`q — hech qanday scope qo`llab bo`lmaydi
- Prepayment [missing] — record-scope umuman ulanmagan (ro`yxat to`liq ochiq qoladi)
- PrepaymentReturn [missing] — record-scope umuman ulanmagan (ro`yxat to`liq ochiq qoladi)
- InternalOrder [missing] — record-scope umuman ulanmagan (ro`yxat to`liq ochiq qoladi)
- CounterpartyAdjustment [missing] — record-scope umuman ulanmagan (ro`yxat to`liq ochiq qoladi)
- PriceList [missing] — record-scope umuman ulanmagan (ro`yxat to`liq ochiq qoladi)
- RetailDrawerCashIn [no-entity] — PermissionEntity slug`i yo`q — hech qanday scope qo`llab bo`lmaydi
- RetailDrawerCashOut [no-entity] — PermissionEntity slug`i yo`q — hech qanday scope qo`llab bo`lmaydi
- RetailSalesReturn [no-read-path] — o`qish-yo`li servisi yo`q — keyin qo`shilsa jimgina ochiq qoladi
- ProcessingProcess [missing] — record-scope umuman ulanmagan (ro`yxat to`liq ochiq qoladi)
- ProcessingStage [missing] — record-scope umuman ulanmagan (ro`yxat to`liq ochiq qoladi)
- ProcessingPlanFolder [no-read-path] — o`qish-yo`li servisi yo`q — keyin qo`shilsa jimgina ochiq qoladi
- Production [no-entity] — PermissionEntity slug`i yo`q — hech qanday scope qo`llab bo`lmaydi
- ProcessingOrder [missing] — record-scope umuman ulanmagan (ro`yxat to`liq ochiq qoladi)
- Processing [missing] — record-scope umuman ulanmagan (ro`yxat to`liq ochiq qoladi)
- Payroll [missing] — record-scope umuman ulanmagan (ro`yxat to`liq ochiq qoladi)
- FactureOut [missing] — record-scope umuman ulanmagan (ro`yxat to`liq ochiq qoladi)
- FactureIn [missing] — record-scope umuman ulanmagan (ro`yxat to`liq ochiq qoladi)
- CommissionReportOut [missing] — record-scope umuman ulanmagan (ro`yxat to`liq ochiq qoladi)
- CommissionReportIn [missing] — record-scope umuman ulanmagan (ro`yxat to`liq ochiq qoladi)
- EmissionOrder [no-read-path] — o`qish-yo`li servisi yo`q — keyin qo`shilsa jimgina ochiq qoladi
- MarkingCodeOrder [no-read-path] — o`qish-yo`li servisi yo`q — keyin qo`shilsa jimgina ochiq qoladi
- RetireOrder [no-read-path] — o`qish-yo`li servisi yo`q — keyin qo`shilsa jimgina ochiq qoladi
- Product [missing] — record-scope umuman ulanmagan (ro`yxat to`liq ochiq qoladi)
- InvoiceOut [missing] — record-scope umuman ulanmagan (ro`yxat to`liq ochiq qoladi)
- Supply [missing] — record-scope umuman ulanmagan (ro`yxat to`liq ochiq qoladi)
- PurchaseOrder [missing] — record-scope umuman ulanmagan (ro`yxat to`liq ochiq qoladi)
- PaymentIn [missing] — record-scope umuman ulanmagan (ro`yxat to`liq ochiq qoladi)
- PaymentOut [missing] — record-scope umuman ulanmagan (ro`yxat to`liq ochiq qoladi)
- SalesReturn [missing] — record-scope umuman ulanmagan (ro`yxat to`liq ochiq qoladi)
- PurchaseReturn [missing] — record-scope umuman ulanmagan (ro`yxat to`liq ochiq qoladi)
- Move [missing] — record-scope umuman ulanmagan (ro`yxat to`liq ochiq qoladi)
- Loss [missing] — record-scope umuman ulanmagan (ro`yxat to`liq ochiq qoladi)
- Enter [missing] — record-scope umuman ulanmagan (ro`yxat to`liq ochiq qoladi)
- Inventory [missing] — record-scope umuman ulanmagan (ro`yxat to`liq ochiq qoladi)
- InvoiceIn [missing] — record-scope umuman ulanmagan (ro`yxat to`liq ochiq qoladi)
- CashierSession [missing] — record-scope umuman ulanmagan (ro`yxat to`liq ochiq qoladi)
- RetailSale [missing] — record-scope umuman ulanmagan (ro`yxat to`liq ochiq qoladi)
- ServiceRequest [no-entity] — PermissionEntity slug`i yo`q — hech qanday scope qo`llab bo`lmaydi

## Qo`llanmaydigan deb belgilangan modellar — sabablari

- **Employee** — Tashkiliy struktura. Xodimlar ro`yxati butun ilovada dropdown (mas`ul, ijrochi, egasi) — yozuv-darajasida filtrlash maxfiylik bermaydi, ekranlarni bo`shatadi. Ko`rinish HR ruxsatlari (MK27) va filial o`qi (MK35) bilan boshqariladi.
- **Organization** — O`z-kompaniya ma`lumotnomasi (hujjat sarlavhasidagi «Организация» dropdown). Chegara — filial o`qi (MK35), record-scope emas.
- **Store** — Ombor ma`lumotnomasi — har hujjat formasida dropdown. Chegara filial o`qi (MK35) bilan qo`yiladi.
- **Country** — Global klassifikator (CATALOG — barcha rol shablonlarida `view: ALL`). Egasi bo`yicha filtrlash mantiqsiz.
- **Uom** — Global klassifikator (o`lchov birligi) — CATALOG, barcha shablonda `view: ALL`.
- **TaxRate** — Global klassifikator (soliq stavkasi) — CATALOG, barcha shablonda `view: ALL`.
- **RetailStore** — Chakana do`kon ma`lumotnomasi (dropdown), `Store` bilan bir xil sabab; o`qish-yo`li ham yo`q.
- **SalesChannel** — Savdo kanali ma`lumotnomasi — hujjat formasidagi dropdown, egasi bo`yicha filtrlash ekranni bo`shatadi.

> Bu qaror mustaqil manba bilan tekshiriladi: rol shablonlaridan (MK29) birortasi
> entity`ga `view` uchun ALL`dan past scope bergan bo`lsa, `record-scope-coverage.test.ts`
> uni «qo`llanmaydi» deb belgilashga YO`L QO`YMAYDI.
