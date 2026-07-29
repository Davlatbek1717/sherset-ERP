# Qabul-tasdiqlash workflow'i — ko'p-rolli (taminotchi → omborchi → admin)

> Spec · 2026-07-29 · branch `climart-adoption` · egasi tasdiqladi (design approval).
> Maqsad: qabul (Supply / приёмка) hujjatiga **3-rolli ketma-ket tasdiqlash zanjiri** qo'shish —
> taminotchi Telegram'da tasdiqlaydi, omborchi jismonan sanaydi/tuzatadi, admin yakuniy tasdiqlaydi
> va shundan keyingina tovar **omborga tushadi (Проведено → stock)**.

## 0. Kontekst (nima bor, nima quriladi)

Mavjud (o'zgartirilmaydi, faqat ulanadi):
- **Supply** modeli: FSM `state` (draft|posted|cancelled) + `applicable` («Проведено» flag) + custom `statusId`.
  Bular **buzilmaydi** — workflow ulardan ALOHIDA yangi `approvalStage` maydoni orqali ishlaydi.
- **counterparty-statement** moduli: `generateSupplyGoods(supplyId, deliver)` — qabul tovarlarining Excel/akt'ini
  yasaydi va MTProto (user-akkaunt) bilan taminotchiga yuboradi. *(Parallel-sessiya domeni — §6, minimal tegamiz.)*
- **telegram** moduli: per-account Bot API + webhook `POST /telegram-webhook/:accountId` → `handleInbound()`,
  kontragent↔chat binding (`autoBind`/`bindChat`), `send()` (reply_markup qo'llab-quvvatlaydi).
- Supply FSM «Проведено» (stock oshirish) mantiqi — `POST /supplies/:id/transitions/:target` (supply.service).

Quriladi: yangi **`supply-approval`** moduli (izolyatsiya, §6) + Supply'ga 1 maydon + 1 audit-jadval +
telegram `handleInbound` callback-kengaytmasi + qabul-detal UI panel.

## 1. Status state-machine

Supply'ga yangi maydon **`approvalStage`** (VarChar(30), default `none`). FSM `state` va `statusId`'dan mustaqil.

| # | `approvalStage` | Kim harakat qiladi | Natija |
|---|---|---|---|
| 1 | `none` | egasi | Ro'yhat shakllanmoqda / tahrirlanadi (workflow boshlanmagan) |
| 2 | `awaiting_supplier` | tizim (yuborish) | Excel + inline-tugmalar taminotchiga ketdi; javob kutilmoqda |
| 3 | `delivering` | **taminotchi** tasdiqladi | «Yetkazib berilyapti»; omborchi tekshiruvi kutilmoqda |
| 4 | `awaiting_admin` | **omborchi** sanadi/tuzatdi + tasdiqladi | Admin yakuniy tasdig'i kutilmoqda |
| 5 | `completed` | **admin** tasdiqladi | Qabul `posted`/`applicable=true` → **stock oshdi**; tugallandi |

### Ruxsat etilgan o'tishlar (forward)
```
none              --send-->         awaiting_supplier   (egasi;   supply:update)
awaiting_supplier --supplier-ok-->  delivering          (taminotchi; Telegram binding-auth)
delivering        --omborchi-ok-->  awaiting_admin      (omborchi; supply:receive)
awaiting_admin    --admin-ok-->     completed           (admin;    supply:approve)  [+ stock post]
```

### Rad etish (reject — sabab MAJBURIY, oldingi bosqichga qaytadi)
```
awaiting_supplier --reject(taminotchi)--> none              (+ egaga bildirishnoma)
delivering        --reject(omborchi)---> awaiting_supplier  (taminotchiga qayta yuborish kerak)
awaiting_admin    --reject(admin)------> delivering         (omborchi qayta ko'radi)
```
Har o'tish (forward yoki reject) **audit-log**ga yoziladi. Rad etilgan hujjat o'chirilmaydi — bosqichi
oldingiga qaytadi, sabab audit-logda saqlanadi, tegishli rolga bildirishnoma boradi.

### Invariantlar (test bilan qulflanadi)
- Bosqichni faqat ruxsat etilgan o'tish o'zgartiradi; noto'g'ri o'tish → 409 Conflict.
- Har harakatni faqat tegishli rol/bog'lanish bajaradi (aks holda 403).
- Stock FAQAT `awaiting_admin → completed`da oshadi — undan oldin hech qachon.
- `completed` va `none`dan boshqa forward yo'q; `completed` — terminal (faqat standart bekor-qilish alohida).

## 2. Ma'lumot modeli (Prisma + migration)

### 2.1 Supply'ga maydon
```prisma
model Supply {
  // ... mavjud maydonlar ...
  approvalStage String @default("none") @db.VarChar(30) // none|awaiting_supplier|delivering|awaiting_admin|completed
  approvalEvents SupplyApprovalEvent[]
}
```

### 2.2 Yangi jadval — audit-log
```prisma
model SupplyApprovalEvent {
  id         String   @id @default(uuid()) @db.Uuid
  accountId  String   @map("account_id") @db.Uuid
  supplyId   String   @map("supply_id") @db.Uuid
  supply     Supply   @relation(fields: [supplyId], references: [id], onDelete: Cascade)
  fromStage  String   @map("from_stage") @db.VarChar(30)
  toStage    String   @map("to_stage")   @db.VarChar(30)
  action     String   @db.VarChar(20)    // send | supplier_ok | omborchi_ok | admin_ok | reject
  actorType  String   @map("actor_type") @db.VarChar(20) // supplier | omborchi | admin | system
  actorId    String?  @map("actor_id")   @db.Uuid        // employeeId (supplier/system uchun null)
  reason     String?  @db.Text                            // reject sababi
  detail     Json?                                        // omborchi tuzatishlari: [{positionId, was, now}]
  createdAt  DateTime @default(now()) @map("created_at")
  @@index([accountId, supplyId, createdAt])
  @@map("supply_approval_events")
}
```

Migration: `add_supply_approval` — `ALTER TABLE supplies ADD COLUMN approval_stage ...` + `CREATE TABLE supply_approval_events`. Additive-only.

> **Eslatma (prod drift):** sherset_v2 DB'sida ba'zi modellarga migration yozilmagani aniqlandi (2026-07-29,
> debts/telegram jadvallari qo'lda yaratildi). Bu migration **repo'ga to'g'ri yoziladi** va deploy'da
> `prisma migrate deploy` bilan qo'llanadi — drift takrorlanmasin.

## 3. Backend — `supply-approval` moduli (izolyatsiya)

Yangi papka `apps/api/src/modules/supply-approval/` — controller + service + schema + test. Mavjud
`supply`/`counterparty-statement` fayllariga minimal teginish (§6).

### 3.1 Endpointlar
| Metod | Yo'l | Kim | Vazifa |
|---|---|---|---|
| `POST` | `/supplies/:id/approval/send` | egasi (`supply:update`) | `none→awaiting_supplier`; Excel-gen + Telegram inline (Faza B) |
| `POST` | `/supplies/:id/approval/omborchi-confirm` | omborchi (`supply:receive`) | `delivering→awaiting_admin`; body: tuzatilgan pozitsiyalar |
| `POST` | `/supplies/:id/approval/admin-confirm` | admin (`supply:approve`) | `awaiting_admin→completed`; **stock post** |
| `POST` | `/supplies/:id/approval/reject` | joriy-bosqich roli | sabab bilan oldingi bosqichga |
| `GET` | `/supplies/:id/approval` | ko'ruvchi (`supply:view`) | joriy bosqich + event-tarixi (UI panel) |

Taminotchi tasdiq/rad — endpoint ORQALI EMAS, **Telegram callback** orqali (Faza B, §4) — service ichki
metod `applySupplierDecision(supplyId, decision, reason)` chaqiriladi, auth = chat↔agent binding.

### 3.2 Ruxsatlar (permissions)
- `supply:receive` — YANGI permission key (omborchi bosqichi). Omborchi/ombor roliga beriladi.
- `supply:approve` — YANGI permission key (admin bosqichi). Admin roli (MAX scope) allaqachon qamraydi.
- Ikkalasi `permissions` registriga + seed-role matritsasiga qo'shiladi. *(Sozlamalar → Rollar'dan o'zgartirsa bo'ladi.)*

### 3.3 Omborchi tuzatishlari
Omborchi kelgan sonni pozitsiya bo'yicha kiritadi. `supply_positions.quantity` **jonli yangilanadi**
(hujjat hali posted emas — xavfsiz). Eski→yangi qiymat audit-log `detail` (JSON) ga yoziladi. Stock keyin
admin bosqichida shu (tuzatilgan) miqdorlar bo'yicha oshadi → nazorat to'g'ri.

### 3.4 Stock-posting (D)
`admin-confirm` mavjud Supply FSM «Проведено» o'tishini (`supply.service` transition → `posted`/`applicable=true`,
stock-ledger yozuvi) chaqiradi. Yangi stock-mantiq yozilmaydi — mavjud, test qilingan yo'l qayta ishlatiladi.

## 4. Faza B — Telegram inline-tugma (taminotchi)

1. **Yuborish** (`/approval/send`): MTProto bilan Excel fayl + Bot API `send()` bilan matn + `reply_markup`:
   `inline_keyboard: [[{text:'✅ Tasdiqlash', callback_data:'sa:cfm:<id>'}, {text:'❌ Rad etish', callback_data:'sa:rej:<id>'}]]`.
2. **Callback** → `POST /telegram-webhook/:accountId` → `handleInbound()` **kengaytiriladi**: `update.callback_query`
   bo'lsa va `data` `sa:`bilan boshlansa → supply-approval service'ga yo'naltiriladi.
   **Auth**: callback kelgan `chat.id` shu supply'ning agent-kontragentiga bog'langan bo'lishi shart (aks holda rad).
3. **Ikki-bosqich-tasdiq**: 1-bosishda `answerCallbackQuery` + xabar tahrirlanadi → «Aniqmi?»
   `[✅ Ha, tasdiqlayman → sa:cfm2:<id>][↩︎ Bekor → sa:cxl:<id>]`. `sa:cfm2` → `awaiting_supplier→delivering`.
4. **Rad** (`sa:rej`): bot `ForceReply` bilan sabab so'raydi; keyingi matn-xabar sabab sifatida
   `applySupplierDecision(reject, reason)` → `awaiting_supplier→none` + egaga bildirishnoma.

**Bot-start sharti**: Bot API xabar faqat taminotchi botni kamida bir marta START qilgan bo'lsa yetadi.
MTProto fayl har doim ketadi. Buttonlar uchun taminotchi bot bilan bir marta bog'langan bo'lishi kerak.
Fallback (agar bog'lanmagan bo'lsa): `akt/:token` ochiq sahifasiga «Tasdiqlash/Rad etish» tugmalari
(kelajak kengaytma — bu spec'da faqat qayd etiladi, Faza B'da Telegram yo'li asosiy).

## 5. Faza C — ERP UI (omborchi + admin)

Qabul-detal sahifasi (`apps/web/src/app/(app)/supplies/[id]/...`) ga **rol-gated approval panel**:

| `approvalStage` | Ko'rinish |
|---|---|
| `none` + egasi | «Taminotchiga yuborish» tugmasi |
| `awaiting_supplier` | Read-only: «Taminotchi javobi kutilmoqda» + kim/qachon yubordi |
| `delivering` + omborchi | **Sanash paneli**: har pozitsiya kelgan sonini kiritish/tuzatish + «Tasdiqlash» (ikki-bosqich dialog) + «Rad etish» (sabab modal) |
| `awaiting_admin` + admin | «Yakuniy tasdiq → omborga qo'shish» (ikki-bosqich dialog) + «Rad etish» (sabab modal) |
| `completed` | Read-only: «Omborga qo'shildi» + vaqt |
| barchasi | **Bosqich-tarixi timeline** (audit-log): kim / qachon / sabab |

**Ikki-bosqich-tasdiq** (har rol): asosiy tugma → tasdiq-dialog («Ishonchingiz komilmi?») → haqiqiy so'rov.
i18n: barcha yorliqlar `ru`+`uz` messages'ga.

## 6. Fazalash (§0 — 1 sessiya ≠ butun feature)

- **Faza A** (shu sessiya boshlaydi): §2 model + migration, §3 `supply-approval` moduli — transitionlar
  (send/omborchi-confirm/admin-confirm/reject), §3.4 stock-post, audit-log, rol-gating, §3.2 permissionlar.
  **Vitest** unit: valid/invalid o'tish, rol-gate, reject→qaytish, stock faqat completed'da, audit yoziladi.
  Telegram/UI YO'Q — API orqali testlanadi.
- **Faza B** (keyingi sessiya): §4 Telegram callback (handleInbound kengaytma, inline send, ikki-bosqich,
  reject-reason, binding-auth).
- **Faza C** (keyingi sessiya): §5 ERP UI panel + timeline + ikki-bosqich dialog + i18n.

Har faza — o'z commiti, o'z gate'i (typecheck 0 · biome 0 · i18n · Vitest). Faza B/C — Phase-2 QA (Playwright).

## 7. Gate va status
- Har faza: typecheck 0 · biome 0 · i18n key-existence ru+uz · tegishli Vitest.
- Status HALOL yorliqlanadi (§0): Faza A commit = «Phase-1: strukturaviy, runtime-tasdiqlanmagan».
  Faza C QA'dan keyin = «Phase-2 verified».

## 8. Risklar / taxminlar (self-review)
1. **§6 parallel-sessiya**: `counterparty-statement` (Excel) parallel domen. Izolyatsiya — yangi `supply-approval`
   moduli; `generateSupplyGoods` faqat CHAQIRILADI, ichi o'zgartirilmaydi. Telegram `handleInbound`ga
   qo'shimcha — additive branch (`sa:` callback), mavjud mantiqqa tegmaydi.
2. **Bot-start** (§4): dokumentlashtirilgan; MTProto fayl har doim, tugmalar bot-start talab qiladi.
3. **Permissionlar**: `supply:receive`/`supply:approve` yangi — seed matritsasiga qo'shiladi, mavjud rollarga
   ta'sir qilmaydi (additive). Admin MAX scope allaqachon qamraydi.
4. **Omborchi tuzatishi** `supply_positions.quantity`ni jonli o'zgartiradi (hujjat posted emas — xavfsiz);
   eski qiymat audit `detail`da saqlanadi.
5. **Reject → `none`**: rad etilgan hujjat «boshlanmagan»dan audit-log borligi bilan farqlanadi (UI timeline ko'rsatadi).
6. **Bir vaqtda ikki rol**: bosqich-o'zgarishlar DB transaction + `approvalStage` optimistik tekshiruvi bilan
   (o'tishdan oldin joriy bosqich kutilgani tasdiqlanadi) — race'da ikkinchisi 409 oladi.

## 9. Ochiq savol yo'q
Barcha arxitektura qarorlari egasi tomonidan tasdiqlangan (Telegram-tugma · admin→stock · omborchi-tuzatadi ·
reject→sabab+qaytish). Permission nomlari (`supply:receive`/`supply:approve`) — taklif; sozlamalardan o'zgartirsa bo'ladi.
