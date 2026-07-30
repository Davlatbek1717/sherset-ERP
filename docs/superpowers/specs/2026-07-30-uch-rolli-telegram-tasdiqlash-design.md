# Uch-rolli Telegram tasdiqlash (Qabul-tasdiqlash — Faza D) — dizayn

> ## ⚠️⚠️ KORREKSIYA — 2026-07-30 (BU DIZAYNNING BOT-QISMI BEKOR)
> **Egasi aniqlashtirdi (2026-07-30):** «bot kerak emas — hammasi adminning SHAXSIY Telegram akkauntidan (lichka/MTProto)
> boradi; taminotchiga admin telegramidan, omborchiga uning ULANGAN TELEFON RAQAMI orqali (admin lichkasidan), admin esa
> oxirida SAYTда (ERP) tasdiqlaydi.» Ya'ni quyidagi **Bot API / inline-tugma** dizayni (D1 bind + D2/D3 inline) — **NOTO'G'RI
> yo'l, olib tashlanadi.** Egasi qarori: «olib tashlab, MTProto'ga o't».
>
> ### To'g'ri arxitektura (MTProto — grounded, mavjud infra):
> | Rol | Mexanizm | Holat |
> |---|---|---|
> | **Taminotchi** | `counterparty-statement.generateSupplyGoods(deliver=true)` → `hrTelegramOutbox` qatori (`toPhone=agent.phone`) → outbox-worker adminning userbot (gramjs) akkauntidan yuboradi | ✅ **ALLAQACHON ISHLAYDI** (supply-goods «deliver» oqimi) |
> | **Omborchi** | 🆕 `hrTelegramOutbox` qatori `toPhone=Employee.telegramPhone` (SHU mexanizm; `messageText`+ixtiyoriy `attachmentPath`) | qurish kerak |
> | **Admin** | ERP `supply-approval-panel` (Faza C) da yakuniy tasdiq → `adminConfirm`→`supply.transition('post')`→stock | ✅ BOR |
>
> **Outbox-yuborish API (grounded, `counterparty-statement.service.ts:672-697`):** `prisma.hrTelegramOutbox.create({ data: {
> accountId, counterpartyId?, toPhone, messageText, attachmentPath?, sourceEventType, sourceDocId, status: 'pending' } })` —
> `hr-telegram-outbox-worker` pending qatorlarni userbot orqali `toPhone`ga yuboradi. Telefon→Telegram = `TelegramLookupService`
> / gramjs `getEntity(phone)`.
>
> ### OLIB TASHLANADIGAN bot-ishi (deployed, LEKIN uxlab yotibdi — bot sozlanmaguncha ishlamaydi, zararsiz):
> - **D1** (`09450fe`): `Employee.telegramChatId`/`telegramBindToken`/`…ExpiresAt` migration · `hr-employee/employee-telegram.service`
>   (parseBindToken/issueBindToken/bindByToken) · `POST/DELETE /hr/employees/:id/telegram*` endpointlar · `employee-card.tsx`
>   «Telegram ulash/uzish» UI + i18n 6 kalit · telegram.service `/start bind_` handler · telegram.module→HrEmployeeModule.
>   *(Migration ustunlarini DB'дан olib tashlash SHART EMAS — zararsiz; kod/UI/endpoint olib tashlanadi. Omborchi TELEFON orqali
>   topiladi (`telegramPhone`), chat_id bind kerak emas.)*
> - **D2** (`4c3ecb8`): `dispatchToOmborchi` + `ocfm/oadj` callback + `handleOmborchiCallback`.
> - **D3** (`4f1aec1`): `dispatchToAdmin` + `acfm/arej` callback + `handleAdminCallback` + `adminKeyboard` + DRY helperlar.
> - callback.ts inline-keyboard protokoli · telegram.service `handleApprovalCallback` routing · `supply-approval.callback.test` inline testlari.
> - **Faza B `dispatchToSupplier` (bot)** — MTProto `generateSupplyGoods`ga almashtiriladi.
>
> ### KEYINGI SESSIYA REJASI (MTProto redizayn):
> 1. Bot-inline dispatch/callback (D2/D3) + `/start bind` handler + employee bind endpoint/UI (D1) ni OLIB TASHLA (migration ustunlari qoladi).
> 2. Taminotchi «yuborish» → `generateSupplyGoods(deliver=true)` MTProto yo'liga ula (bot `dispatchToSupplier` o'rniga).
> 3. 🆕 Omborchiga MTProto-send: `supplyPermChats` o'rniga `supply.update` ruxsatli xodimlarning `telegramPhone`'iga outbox-qatori.
>    Trigger: taminotchi bosqichidан keyin (yoki ERP «Omborchiga yuborish» tugmasi — keyingi sessiyada egasidan aniqlashtiriladi).
> 4. Admin → ERP-panel (mavjud). FSM stage'lari kuzatuv uchun qolishi mumkin (yoki soddalashtiriladi).
> 5. Gate + BE deploy. Egasidан omborchi-trigger + xabar-formatini aniqlashtir.

---

**Sana:** 2026-07-30
**Holat:** ⚠️ Bot-dizayn BEKOR (yuqoridagi korreksiya) — MTProto redizayn keyingi fokus-sessiyada. Quyisi tarixiy (bot-yondashuv).
**Asos:** Qabul-tasdiqlash Faza A (BE state-machine) + B (taminotchi Telegram) + C (ERP UI) —
`docs/superpowers/specs/2026-07-29-qabul-tasdiqlash-workflow-design.md`, modul `apps/api/src/modules/supply-approval`.

## Maqsad

Qabul (Supply / приёмка) tasdiqlash zanjirining **uch bosqichi ham** — taminotchi → omborchi → admin
— **Telegram inline-tugmalari** orqali bajarilsin. Hozir faqat **taminotchi** Telegram'da; omborchi va admin
ERP web-panelida (Faza C). Bu spec omborchi + admin bosqichlarini ham Telegram'ga ko'chiradi (ERP panel
ixtiyoriy zaxira bo'lib qoladi).

## Egasining qarorlari (2026-07-30, AskUserQuestion)

1. **Qamrov:** uch rol ham Telegram (taminotchi + omborchi + admin).
2. **Chat-bog'lash:** har xodimga alohida Telegram `chat_id` (rolga qarab o'sha odam(lar)ga boradi).
3. **Omborchi oqimi:** Telegram'da «✅ To'g'ri, tasdiqlash» yoki «✏️ Son noto'g'ri». Son tuzatish kerak bo'lsa
   — ERP'da ochib tuzatadi (murakkab qatorma-qator son-tahrir Telegram'da EMAS).
4. **Rol egasi:** rol-ruxsatli **har kim** oladi (omborchi = `supply.update`, admin = `supply.approve` ruxsatli
   + chat_id bog'langan barcha xodimlar). Kim birinchi tasdiqlasa — o'sha.

## Arxitektura

FSM (`supply-approval.fsm.ts`) **o'zgarmaydi** — bosqichlar o'sha:
`none → awaiting_supplier → delivering → awaiting_admin → completed`; reject → oldingi bosqichga (sabab bilan).
Yangilik faqat: **har bosqich-o'tishда tegishli rolga Telegram dispatch** + **callback'lar orqali bosqich-o'tkazish**
(ERP endpointlariga parallel; ikkalasi ham bir xil service metodini chaqiradi).

### 1. Data model (migration)

```prisma
model Employee {
  // ...mavjud maydonlar
  telegramChatId String? @map("telegram_chat_id") @db.VarChar(64) // Bot API chat_id (inline-tugma uchun)
}
```

Migration: `packages/db/prisma/migrations/<ts>_add_employee_telegram_chat_id`. Nullable — mavjud xodimlarga
ta'sir yo'q. `prisma generate` (prod'da alohida — [[deploy sabog'i]]: `migrate deploy` generate QILMAYDI).

**Nega yangi maydon (mavjudini emas):** `Employee.telegramPhone` — HR opt-in telefon; `HrTelegramAccount` —
MTProto userbot konfiguratsiyasi. Ikkalasi ham Bot API `chat_id` EMAS. Inline-tugma FAQAT Bot API'da ishlaydi
(taminotchi oqimi ham shunday), shuning uchun bot bilan yozishgandagi `chat_id` kerak.

### 2. Bog'lash (binding) oqimi

Inline-tugma ishlashi uchun xodim botni START qilgan bo'lishi va `chat_id`'si saqlangan bo'lishi shart.

- **ERP** (xodim-sozlama yoki profil): «Telegram ulash» tugmasi → `t.me/<bot_username>?start=bind_<token>` havola/QR.
  `token` — server yaratgan bir-martalik, employeeId bilan bog'langan (qisqa TTL, masalan 15 daqiqa; xotirada yoki
  vaqtinchalik jadvalда).
- **Bot** (`telegram.service.handleInbound`): `/start bind_<token>` matnini tanadi → token→employeeId topadi →
  `Employee.telegramChatId = update.message.chat.id` saqlaydi → «✅ Ulandi» javobi. Token iste'mol qilinadi.
- **Bekor ulash:** ERP'da `telegramChatId = null`.

*Bot-username* `telegramConfig`'dan (yoki `getMe` bilan) olinadi.

### 3. Bosqich-o'tishlar + Telegram dispatch

| # | O'tish | Kim boshlaydi | Yangi dispatch |
|---|---|---|---|
| 1 | `none → awaiting_supplier` | Egasi (ERP «Yuborish») | taminotchiga (✅ MAVJUD — `dispatchToSupplier`) |
| 2 | `awaiting_supplier → delivering` | Taminotchi (Telegram «Tasdiqlash») | 🆕 **`dispatchToOmborchi`** — barcha `supply.update`+chat_id xodimga |
| 3 | `delivering → awaiting_admin` | Omborchi (Telegram «To'g'ri» / ERP) | 🆕 **`dispatchToAdmin`** — barcha `supply.approve`+chat_id xodimga |
| 4 | `awaiting_admin → completed` | Admin (Telegram «Tasdiqlash») | STOCK qo'shiladi (mavjud `adminConfirm`) — yakuniy, dispatch yo'q |
| R | har bosqich → oldingi | reject (sabab bilan) | boshlagan bosqich egasiga xabar (ixtiyoriy MVP) |

Har dispatch **non-fatal** (`.catch(() => {})`) — bosqich allaqachon o'zgargan, xabar yuborilmasa oqim to'xtamaydi
(mavjud `dispatchToSupplier` uslubi).

**Omborchi «✏️ Son noto'g'ri»**: bosqichni o'zgartirmaydi — bot javobi «ERP'da oching va sonni tuzating» +
qabul havolasi. Omborchi ERP panelida (`omborchiConfirm` qty-tuzatish bilan) yakunlaydi.

### 4. Callback protokoli + auth

Mavjud `supply-approval.callback.ts` protokoli `sa:<action>:<supplyId>` kengaytiriladi:

```
Taminotchi (MAVJUD): cfm, cfm2, rej, cxl
Omborchi (YANGI):    ocfm (to'g'ri, tasdiqlash), orej (rad — sabab so'raladi)
Admin (YANGI):       acfm (tasdiqlash), arej (rad — sabab so'raladi)
```

`telegram.service.handleInbound` — `data.startsWith('sa:')` callback'ni `supply-approval.service`'ga yo'naltiradi
(MAVJUD). Yangi: action'ga qarab tegishli handler + **auth**:

- callback'ning `chat_id`'sidan → `Employee` (telegramChatId bo'yicha) → uning effektiv ruxsatlari
  (`EmployeeRole → Role → RolePermission`).
- Omborchi action'lar (`ocfm/orej`) → `supply.update` scope ≠ NO talab qiladi; admin action'lar (`acfm/arej`) →
  `supply.approve`. Aks holda `answerCallbackQuery` «Bu amal uchun ruxsatingiz yo'q».
- **Poyga (bir nechta xodim bir vaqtda):** FSM `claim` (atomik `updateMany` bosqich-guard bilan) g'olibni belgilaydi;
  yutqazganlarga `answerCallbackQuery` «Allaqachon tasdiqlangan». Xabar `editMessageText` bilan yakuniy holatga o'zgaradi.

### 5. Reject sabab (force_reply)

Rad tugmasi (`orej`/`arej`/taminotchi `rej`) bosilganda: bot `force_reply` bilan «Rad sababini yozing» so'raydi.
Xodim javob-xabar yozadi → `handleInbound` uni (reply-to bo'yicha) reject-sabab sifatida oladi → `reject()` service
(sabab + oldingi bosqich). MVP soddalashtirilsa: sababsiz reject ham mumkin, lekin ERP panelида sabab so'raladi
— parity uchun Telegram'da ham so'ralsin.

### 6. Xabar mazmuni (uz i18n)

Har rol xabari: hujjat № (`supply.name`), taminotchi nomi, qatorlar (mahsulot × son), jami summa (agar mavjud),
+ inline-tugmalar. `apps/web/src/messages` EMAS — bu server-tomon Telegram matni, `apps/api` ичida uz-string
(mavjud `dispatchToSupplier` xabar uslubiga mos; kerak bo'lsa keyin i18n).

## Qayta ishlatiladigan mavjud infratuzilma

- `telegramConfig` (per-account bot token, `botTokenCipher` — `decryptPassword`).
- `telegram.client`: `tgSendMessage` (reply_markup), `tgEditMessageText`, `tgAnswerCallbackQuery`.
- `supply-approval.service`: `claim`, `logEvent`, `omborchiConfirm`, `adminConfirm`, `reject`, `applySupplierDecision`.
- `supply-approval.callback`: `buildCallbackData`/`parseCallbackData`, keyboard builder'lar.
- `telegram.service.handleInbound`: `sa:` branch (MAVJUD) + `/start` matn-tanish (kengaytiriladi).

## Testlash

- **Unit (Vitest, DB'siz):** callback protokoli (yangi action'lar parse/build) · auth-mantiq (chat_id→ruxsat) pure
  bo'lagi · dispatch role-query (mock). FSM allaqachon 12 test bilan qoplangan.
- **Gate:** api typecheck 0 · biome 0 · to'liq api Vitest regressiya yo'q.
- **Phase-2 (jonli-bot QA):** real bot token + webhook + 2-3 xodim chat_id bog'langan → to'liq zanjir bir qabul
  hujjatida: yuborish → taminotchi tasdiq → omborchi tasdiq → admin tasdiq → stock qo'shildi. Har rolда ruxsatsiz
  xodim bloklanishini ham sinash.

## Bosqichlar (fokus-sessiyalar)

1. **D1 — Bog'lash poydevori:** migration (`Employee.telegramChatId`) + token-yaratish endpoint + ERP «Telegram ulash»
   UI + `/start bind_` handler. Gate + deploy (migration + generate). Jonli: bitta xodim ulanadi.
2. **D2 — Omborchi Telegram:** `dispatchToOmborchi` (role-query) + `ocfm/orej` callback + auth + `editMessageText`.
   «✏️ Son noto'g'ri» → ERP havola. Gate + deploy.
3. **D3 — Admin Telegram + reject-reason:** `dispatchToAdmin` + `acfm/arej` + `force_reply` sabab oqimi (uch rol uchun).
   Gate + deploy.
4. **D4 — Jonli-bot QA (Phase-2):** to'liq zanjir + auth-bloklash sinovi; topilgan buglar issiq-kontekstda tuzatiladi.

## Ochiq savollar / xavflar

- **Bog'lash UI joyi:** xodim-sozlama sahifasi (settings/employees) yoki har xodim o'z profilida? — D1'da aniqlanadi.
- **Token saqlash:** xotira (Map, TTL) yetarli (MVP) yoki jadval? Bir instance ⇒ xotira yetarli; ko'p instance bo'lsa
  jadval. Hozir bitta api instance (pm2) ⇒ xotira MVP uchun yetarli, lekin restart'да yo'qoladi — kichik jadval afzal.
- **Bot username:** `telegramConfig`'da saqlanadimi yoki `getMe` bilan olinadimi — D1'da tekshiriladi.
- **Poyga/idempotentlik:** FSM `claim` allaqachon atomik; yangi callback'lar shu metodlarni chaqirgani uchun avtomat
  himoyalangan (ikki xodim bir vaqtda «Tasdiqlash» bossa — biri o'tadi, biriga «allaqachon»).
