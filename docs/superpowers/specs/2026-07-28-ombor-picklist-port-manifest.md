# PORT-MANIFEST — Ombor/Yacheyka + Pick-list («chek yig'ish»)ni SHU loyihaga moslash

**Sana:** 2026-07-28 · **Manba xarita:** foydalanuvchi bergan «TO'LIQ KO'CHIRISH XARITASI» · **Target:** shu repo
(`sherset-climart-adoption`) — bizning struktura/nomlarга moslab. **Holat:** manifest (reja), kod emas.

> ⚠️ **MANBA-KIRISH:** Xaritадаgi manba `Biznesjon-Official/moysklad` **mavjud emas / kirish yo'q** (org bor, `moysklad`
> repo yo'q). Pick-list moduli hech bir branch'да (main/origin/sherset/climart-adoption) topilmadi. Ya'ni **manba
> KODINI o'qiy olmayman** — bu manifest siz bergan XARITA + shu repo'ning read-only holatidan tuzildi. Actual kod ikki
> yo'l bilan yoziladi: (A) to'g'ri manba repo + kirish berilsa — o'shandan port; (B) manba topilmasa — xarita
> spetsifikatsiyasidan **noldan quramiz** (MoySklad JSON API + bizning konvensiyalar — buning uchun manba kod SHART EMAS).
> ⚠️ **climart VPS'ga hech qanday yozuv/restart yo'q** — hammasi shu repo + GitHub read-only.

---

## 0. Xulosa — nima bor, nima kerak

Shu repo'ni xaritaga solishtirdim (read-only grep/ls, 2026-07-28):

| Blok | Shu repo'да | Xulosa |
|---|---|---|
| **Ombor-yacheyka** (zonalar/yacheykalar/per-cell qoldiq) | ✅ BOR | **QAYTA KO'CHIRILMAYDI** — mavjud (faqat parity-tekshiruv) |
| **Skaner UX** (kamera+wedge, 7 komponent) | ✅ BOR | mavjud |
| **Label** (yorliq-render, modul) | ✅ BOR | mavjud |
| **`/scan`, `/labels/print`, `/stock-training`** | ✅ BOR | mavjud |
| **`__yacheyka`** (Product.attributes uy-bog'lash) | ✅ BOR | mavjud (pick-list print shundan o'qiydi) |
| **Pick-list («chek yig'ish»)** — jadval/modul/poller/sahifalar | ❌ **YO'Q** | **PORT QILINADI** (asosiy ish) |

**Demak asosiy ko'chirish ishi = Pick-list funksionali + uni bizning mavjud yacheyka/label/print stack'iga ulash.**
Qolgan ombor-yacheyka qismini qayta ko'chirmaymiz — u shu yerда tayyor (§6'да parity-tekshiruv ro'yxati).

---

## 1. DB qatlami — YANGI: `MsPickList` (`ms_pick_lists`)

Bizning sxema-konvensiyaga moslab (`packages/db/prisma/schema.prisma`):

```prisma
/// «Chek yig'ish» — TASHQI (haqiqiy) MoySklad hisobidan tortilган «Заказ покупателя».
/// CUSTOM (moysklad-parity EMAS). Bizning ombor-yacheyka bilan print paytida bog'lanadi.
model MsPickList {
  id          String    @id @default(uuid()) @db.Uuid
  accountId   String    @map("account_id") @db.Uuid          // ko'p-ijara (bizning konvensiya)
  msOrderId   String    @map("ms_order_id") @db.VarChar(64)  // tashqi MS buyurtma id
  docType     String    @map("doc_type") @db.VarChar(32)     // 'customerorder' ...
  name        String    @db.VarChar(120)
  moment      DateTime  @db.Timestamptz()
  msUpdatedAt DateTime  @map("ms_updated_at") @db.Timestamptz() // sync-kursor manbai
  agentName   String?   @map("agent_name") @db.VarChar(255)
  agentPhone  String?   @map("agent_phone") @db.VarChar(40)
  storeName   String?   @map("store_name") @db.VarChar(255)
  ownerName   String?   @map("owner_name") @db.VarChar(255)
  description String?
  sumMinor    BigInt    @default(0) @map("sum_minor")        // pul — minor (bizning konvensiya)
  applicable  Boolean   @default(false)                       // Проведено
  payedMinor  BigInt    @default(0) @map("payed_minor")
  positions   Json                                            // snapshot [{msAssortmentId,name,qty,code,barcode}]
  printedAt   DateTime? @map("printed_at") @db.Timestamptz()
  createdAt   DateTime  @default(now()) @map("created_at") @db.Timestamptz()
  updatedAt   DateTime  @updatedAt @map("updated_at") @db.Timestamptz()

  account Account @relation(fields: [accountId], references: [id], onDelete: Cascade)

  @@unique([accountId, msOrderId]) // idempotent upsert
  @@index([accountId, applicable, moment(sort: Desc)])
  @@map("ms_pick_lists")
}
```
- `Account`ga back-relation: `msPickLists MsPickList[]` (Account massiv-relatsiya — bizning konvensiya).
- **Migratsiya:** bitta `20260728xxxxxx_ms_pick_lists` (xaritадаgi 3 ta migratsiya — receipt_fields + applicable_payed — bu yerда noldan qurgani uchun BIR migratsiyaga birlashtiriladi). Qo'lда SQL (loyiha uslubi) yoki `migrate dev` (lokal DB bo'sh bo'lsa).
- **Snapshot `positions`:** uy-yacheyka SAQLANMAYDI — print paytида `__yacheyka`dan hal qilinadi (qayta-bog'lash darhol ko'rinadi). Bu bizning mavjud `store-address`/`product-cell-move` mantiqidan o'qiydi.

## 2. API qatlami — YANGI modul `apps/api/src/modules/pick-list/`

Fayllar (bizning NestJS naqshi — driver-tracking/attendance-geo kabi):

| Fayl | Vazifa |
|---|---|
| `pick-list.module.ts` | `imports: [PrismaModule, AuthModule]`, controller + servislar + sync-cron. `app.module.ts`ga `PickListModule` qo'shiladi (LabelModule yonida) |
| `pick-list.controller.ts` | `@Controller('pick-lists')` + `@UseGuards(JwtAuthGuard)` — quyidagi endpointlar |
| `pick-list.service.ts` | ro'yxat/bitta/printed + `cells-by-products` (uy-yacheyka join, mavjud `store-address` o'qish mantiqidan) |
| `pick-list-sync.service.ts` | tashqi MoySklad poller — `@Cron('*/30 * * * * *')` (bizning @nestjs/schedule, eta-worker kabi) |
| `picksync-env.util.ts` | ENV o'qish (0600 fayl-fallback) |
| `pick-list.schema.ts` | zod DTO'lar |

Endpointlar (bizning `/api/v1` prefiksida):
| Endpoint | Vazifa |
|---|---|
| `GET  /pick-lists` | ro'yxat (Оплачен/Частично + Проведено filtri) — accountId-scoped |
| `POST /pick-lists/sync` | qo'lда sync-trigger (rol-gate: HR/menejer — biz `DispatcherGuard` uslubidagi yengil rol-check qo'shamiz) |
| `GET  /pick-lists/cells-by-products?productIds=` | mahsulotlar → uy-yacheyka (mavjud `__yacheyka` o'qishdan) |
| `GET  /pick-lists/:id` | bitta |
| `POST /pick-lists/:id/printed` | chop-etildi belgisi |

**Sync-poller (asosiy yangi mantiq):**
- Tashqi **haqiqiy** MoySklad hisobidan (`https://api.moysklad.ru/api/remap/1.2/entity/customerorder`) Basic-auth (login/parol) bilan tortadi. **BU bizning `moysklad-compat` moduli EMAS** (u — biz MS-mos API CHIQARAMIZ); bu — biz MS'дан TORTAMIZ (yangi outbound HTTP klient, `fetch`).
- Kursor = `max(msUpdatedAt) − 2 daqiqa overlap`; birinchi run — oxirgi 48 soat. Idempotent upsert (`@@unique[accountId, msOrderId]`).
- ENV: `MOYSKLAD_SYNC_LOGIN`, `MOYSKLAD_SYNC_PASSWORD`, ixtiyoriy `MOYSKLAD_SYNC_ACCOUNT_ID`, `MOYSKLAD_SYNC_BASE` (yo'q bo'lsa 0600 fayl — `picksync-env.util.ts`). ENV yo'q → poller **jim o'chiq** (graceful, bizning konvensiya).
- `applicable`(Проведено) + `payedMinor` (to'lov-holati) MS javobidan.

## 3. FE qatlami — YANGI sahifalar

| Fayl | Vazifa |
|---|---|
| `apps/web/src/app/(app)/pick-lists/page.tsx` | ro'yxat (to'lov/Проведено chip, qidiruv). Bizning `api-client` + `@moysklad/ui` (Badge/Button/Table) |
| `apps/web/src/app/(app)/pick-lists/[id]/print/page.tsx` | yig'ish-varaq: mahsulot + **uy-yacheyka** + qty, NARXSIZ («Товарный чек» ko'rinishi). Mavjud print-infra (`print-agent`/print-templates) qayta ishlatiladi |

- **Reuse:** `lib/api-client`, `@moysklad/ui`, mavjud print stack, `__yacheyka` o'qish. Yangi map/skaner SHART EMAS (yacheyka stack bor).
- Menyu: navigatsiyaga «Chek yig'ish» / «Pick-lists» qo'shiladi (Chakana yoki Ombor bo'limi ostida — sizning menyu-strukturaga qarab).

## 4. i18n — YANGI subtree

`apps/web/src/messages/ru.json` + `uz.json`ga `pages.pickLists` bloki (ro'yxat/print/holat kalitlari). `pages.scan` va
`pages.stores.address_storage` **ALLAQACHON BOR** — tegilmaydi. *(Diqqat: bu fayllar hozir parallel sessiya tomonidan
tahrirlanayotgan bo'lishi mumkin — port paytида collision-tekshiruv, §6-protokol.)*

## 5. Mavjud stack bilan ulanish (reuse — qayta yozilmaydi)
- `__yacheyka` (Product.attributes) o'qish — `store/store-address.service.ts` + `product/product-cell-move.service.ts` (BOR).
- Label/print — `label` modul + `labels/print` (BOR).
- Skaner UX — `use-barcode-camera` + wedge (BOR) — pick-list yig'ishда skan kerak bo'lsa shundan foydalanadi.

## 6. Mavjud ombor-yacheykани PARITY-tekshiruv (qayta ko'chirilmaydi, faqat to'liqligi tasdiqlanadi)
Port paytида shu ro'yxat xaritaga to'liq mos ekanini tasdiqlaymiz (agar biror qism yetishmasa — o'shani qo'shamiz):
- [ ] 5 hujjat-pozitsiyasида `cell_id` (Supply/Enter/Loss/PurchaseReturn/SalesReturn) + `demands/[id]` yacheyka-ustun
- [ ] `cell-picker-field.tsx` (portal-dropdown, bind-if-empty) — 11 hujjat-sahifasида
- [ ] hujjat post/unpost'да `StockByCell` +/− (supply/enter/loss/purchase-return/sales-return/inventory/cut servislar)
- [ ] mahsulot-kartада «Ячейка» bloki (`product-form-left-cards` + `use-product-form`)
- [ ] `store/by-barcode`, `products?search`da yacheyka-shtrix/nom integratsiyasi
- [ ] `label/render` yacheyka-yorliq formati (Code-128, nom kodlanadi)

## 7. Moslashtirish nuqtalari (bizning konvensiya)
- **Ko'p-ijara:** har jadval/so'rov `accountId` bilan filtr (bizda universal). Xaritадаgi har model'ga `accountId` bor.
- **Pul:** `sumMinor`/`payedMinor` — **BigInt minor** (bizning konvensiya; xaritадаgi `sumMinor` mos).
- **API prefiks:** `/api/v1`. **Guard:** `JwtAuthGuard` + dispecher-endpoint'ларга yengil rol-check (`DispatcherGuard` uslubi — driver-tracking'да qildik).
- **Cron:** `@nestjs/schedule` `@Cron` (bizда bor). **UI:** `@moysklad/ui` (Modal/Input/Button/Badge/Table).
- **Skaner dep:** `@zxing/browser` + `@zxing/library` — bizда `use-barcode-camera` mavjud, ya'ni **allaqачon o'rnatilган** (qo'shish shart emas).

## 8. Qurilish tartibi (tavsiya)
1. **DB:** `MsPickList` model + migratsiya → `prisma generate`.
2. **BE:** `pick-list` modul — schema/service/controller → `pick-list-sync.service` (tashqi MS klient + cron) → `picksync-env.util` → `app.module`ga ulash.
3. **FE:** `/pick-lists` ro'yxat → `/pick-lists/[id]/print` (uy-yacheyka join) → menyu → i18n `pages.pickLists`.
4. **Gate:** typecheck 0 · biome 0 · i18n key-existence · Vitest (sync-kursor + upsert idempotentligiga unit-test).
5. **Parity (§6):** mavjud yacheyka-stack to'liqligini tasdiqla.
6. **ENV:** haqiqiy MoySklad hisobi login/parol (yoki 0600 fayl) — deploy paytида VPS'да (climart EMAS — bizning target).

## 9. Ochiq savollar (siz hал qilasiz)
1. **Manba kod:** to'g'ri manba repo nomi/kirishi bormi? — yo'q bo'lsa pick-list'ni **xarita spetsifikatsiyasidan noldan quramiz** (MoySklad API + bizning konvensiyalar; manba kod shart emas). Tavsiya: (B) noldan qurish — tez va toza.
2. **Menyu joyi:** «Chek yig'ish» qaysi bo'lim ostida? (Chakana / Ombor / alohida).
3. **Sync manba:** qaysi haqiqiy MoySklad hisobidan tortiladi (login/parol yoki token)? — deploy paytида ENV.
4. **Ko'lam:** faqat pick-list, yoki §6 parity-tekshiruvда topilган ombor-gap'lar ham shu ishда tuzatilsinmi?
