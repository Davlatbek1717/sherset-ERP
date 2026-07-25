# Kontragent akt-sverka (reconciliation statement) — Excel + storage + delivery

**Sana:** 2026-07-25
**Holat:** Design (tasdiqlangan) → spec review kutilmoqda
**Muallif:** Davlatbek + Claude

## 1. Maqsad (Goal)

Bitta kontragent bo'yicha **butun hisob-kitob tarixini** professional Excel
faylда shakllantirish — har hujjat va har tovar «ipidan ignasigacha» ko'rinadi,
oxirида yakuniy qoldiq (kim kimga qancha qarzdor). Fayl:
- **erp.sherset.uz'да saqlanadi** (token-havola bilan),
- **kontragentга** Telegram orqали **fayl** sifatida yuboriladi (havolasiz),
- **adminга** bot orqали **havola** bilan yuboriladi (bittада bosib ochish),
- **sayt UI'да** kontragent bo'yicha saqlangan aktlar ro'yxatida ko'rinadi.

Ishga tushirish: kontragent kartасидаги **«Акт-сверка yuborish»** tugmasi (on-demand).

## 2. Foydalanuvchi oqimi (User flow)

1. Admin kontragent detali sahifasида **«Акт-сверka»** tugmasini bosadi.
2. Backend: kontragent bo'yicha barcha balans-hujjatларни yig'adi → Excel yaratadi
   → faylни saqlaydi (token) → DB yozuv → yuborishlarни ishga tushiradi.
3. Kontragentga (telefoni bo'lsa) — Excel **fayl** MTProto orqali.
4. Adminга (bot) — qisqa xabar + **havola** (`erp.sherset.uz/akt/<token>.xlsx`).
5. Sahifада yangi akt ro'yxatда paydo bo'ladi (yuklab olish tugmasi bilan).

## 3. Ma'lumot yig'ish (Data aggregation)

**Kirish:** `counterpartyId` (+ ixtiyoriy `dateFrom`/`dateTo`; standart = butun tarix).

**Manba hujjatlar** (balансга ta'sir qiluvchi, `agentId = counterpartyId`, faqat
`posted`) — balans-dvigatel `applyDelta(source=…)` chaqiruvlariга mos:

| Hujjat | Balans yo'nalishi | Tovar qatorlari bormi |
|---|---|---|
| InvoiceOut (sotuv) | debet + (ular bizga) | ✅ positions |
| InvoiceIn (xarid) | kredit − (biz ularга) | ✅ positions |
| SalesReturn (sotuv qaytarish) | kredit − | ✅ positions |
| PurchaseReturn (xarid qaytarish) | debet + | ✅ positions |
| CashIn / PaymentIn (kirim) | kredit − | ❌ (bitta qator) |
| CashOut / PaymentOut (chiqim) | debet + | ❌ (bitta qator) |

**Chiqish:** `moment` bo'yicha tartiblangan qatorlar ro'yxati; har qatorда
**running qoldiq** (oldingi qoldiq ± delta). Belgi: **>0 ular bizga qarzdor**,
**<0 biz qarzdormiz**.

**Tovar-daraja:** sotuv/xarid/qaytarishlarда har `position` (assortment nomi,
miqdor, narx `priceMinor`, summa). To'lovlarда tovar yo'q — bitta qator.

**Xizmat:** yangi `CounterpartyStatementService` (yoki `reports` moduli ichida) —
Prisma orqali hujjatларни `include: { positions }` bilan o'qiydi, agregatlaydi.

## 4. Excel format (professional dizayn)

Kutubxona: **`exceljs`** (yangi bog'liqlik, apps/api).

**Tuzilma (bitta varaq):**
- **Sarlavha bloki** (merge): kompaniya nomi, «HISOB-KITOB AKT-СВЕРКASI»,
  kontragent nomi, davr, yaratilgan sana.
- **Boshlang'ich qoldiq** (davr berilса; butun tarix = 0).
- **Jadval sarlavhasi** (bold, rangли fon, ramka): № · Sana · Hujjat turi ·
  Hujjat № · Izoh · Debet · Kredit · Qoldiq.
- **Hujjat qatorlari** + har tovar-hujjat ostида **ichkariланган tovar qatorlari**
  (Tovar · Miqdor · Narx · Summa).
- **Yakuniy qatorlar** (bold, highlight): Jami debet · Jami kredit · Umumiy aylanma.
- **Yakuniy balans satri** (katta, rangли): «"X" bizga N so'm qarzdor» /
  «Biz "X"ga N so'm qarzdormiz» / «Hisob teng — qarz yo'q».
- **Footer:** imzo joylari (Yetkazib beruvchi / Xaridor), sana.

**Formatlash:** raqamlar `# ##0` (probel-ajratgich), ustun kengliklari, ramkalar,
freeze header. Til: o'zbekcha. Valyuta: **UZS** (v1; ko'p-valyuta — kelajak).

## 5. Saqlash + token-havola (Storage)

- **Fayl:** konfiguratsiya qilingan katalogда saqlanadi (masalan
  `STATEMENTS_DIR`, standart `apps/api/var/statements/`).
- **DB model** (`packages/db` Prisma) — `CounterpartyStatement`:
  `id · accountId · counterpartyId · periodFrom? · periodTo? · fileToken (unique,
  random) · filePath · finalBalanceMinor · currency · createdAt · createdById`.
- **Token-havola:** `GET /akt/:token` (yoki `/statements/:token/download`) —
  auth SHART EMAS (token = imkoniyat/capability); `fileToken` bo'yicha topib,
  Excel'ни `Content-Disposition: attachment` bilan uzatadi. Token uzun-tasodifiy
  (crypto), taxmin qilib bo'lmaydi. Faqat botга/adminga borgani uchun xavfsiz.

## 6. Yuborish (Delivery)

**(a) Kontragentга — MTProto FAYL** (havolasiz):
- Hozirgi `hr_telegram_outbox` faqat **matn** (`messageText`) yuboradi.
- **Kengaytma:** outbox'ga `attachmentPath?` (yoki `filePath?`) ustuni qo'shiladi;
  outbox-worker `attachmentPath` bo'lsa gramjs `client.sendFile(peer, {file, caption})`
  bilan yuboradi, aks holда hozirgidek `sendMessage`.
- Caption: qisqa matn («… akt-сверkasi, jami qarzingiz: N so'm»).
- Kontragentда telefon bo'lmasа — skip (hozirgidek).

**(b) Adminга — bot HAVOLA:**
- Bot API (`DEBT_NOTIFY_BOT_TOKEN`/`CHAT_ID` yoki yangi maxsus config)
  `sendMessage` — matn + `https://erp.sherset.uz/akt/<token>.xlsx`.
- (Ixtiyoriy) bot `sendDocument` bilan faylni ham qo'shса bo'ladi — lekin asosiy
  talab: **havola** (keyinchalik topish uchun).

## 7. Sayt UI

- **Kontragent detali sahifasi** (`apps/web/.../counterparties/[id]`):
  - **«Акт-сверka yuborish»** tugmasi → `POST /counterparties/:id/statement`
    → yuklab olish havolаsi + «yuborildi» toast.
  - **Saqlangan aktlar ro'yxati:** sana · davr · yakuniy balans · **yuklab olish**.
- I18n: ru + uz kalitlar (loyiha gate talabi).

## 8. Qismlar va build tartibi (Components / build order)

1. **Data agregatsiya** — `CounterpartyStatementService.buildData(counterpartyId, range)`
   → strukturaланган qatorlar + tovar detali + yakuniy balans. (+ unit test)
2. **Excel generator** — `buildXlsx(data)` (`exceljs`), professional styled. (+ test:
   qatorlar/hujayralар/yakuniy satr).
3. **Storage + DB model + token-havola endpoint** — migration + `GET /akt/:token`.
4. **Yuborish** — bot havola-xabari + MTProto outbox **fayl** kengaytmasi
   (schema ustuni + worker `sendFile`).
5. **API endpoint** — `POST /counterparties/:id/statement` (generate + store + deliver).
6. **Sayt UI** — tugma + aktlar ro'yxati + i18n.

## 9. Arxitektura — yaratiladigan/o'zgartириладиган fayllar

**Backend (apps/api):**
- `modules/counterparty-statement/` — `.service.ts` (agregatsiya) ·
  `xlsx-builder.util.ts` (Excel) · `.controller.ts` (POST generate + GET /akt/:token) ·
  `.module.ts` · testlar.
- `modules/hr/hr-telegram-account` outbox-worker + `hr-telegram-outbox` schema —
  `attachmentPath` qo'shish + `sendFile`.
- Bot yuborish — mavjud `counterparty-debt-notify` uslubидаги bot-util qayta ishlatiladi.

**DB (packages/db):**
- `CounterpartyStatement` modeli + migration.
- `HrTelegramOutbox.attachmentPath` ustuni + migration.

**Frontend (apps/web):**
- `counterparties/[id]` — tugма + aktlar ro'yxati komponenti.
- `lib/api-client` — statement endpointlari.
- `messages/{ru,uz}.json` — kalitlar.

## 10. Hal qilingan qarorlar (Resolved decisions)

- **Detallik:** hujjat-daraja + tovar-daraja (har tovar alohida qator). ✅
- **«Ostatka»:** ombor emas — butun tarix bo'yicha **yakuniy qoldiq** (kim kimга). ✅
- **Trigger:** tugма (on-demand). ✅
- **Havola:** kontragentга havola YO'Q (faqat fayl); adminga (bot) **token-havola**. ✅
- **Valyuta:** UZS (v1). ✅
- **MTProto:** outbox `sendFile`ga kengaytiriladi. ✅

## 11. Test rejasi

- **Unit:** agregatsiya (running qoldiq to'g'riligi, tovar qatorlari, aralash hujjat
  turlari, yakuniy balans belgisi) · Excel builder (kutilган hujayра/qatorlar) ·
  token-havola (noto'g'ri token → 404).
- **Gate:** typecheck 0 · biome 0 · i18n key-existence (ru+uz) · web Vitest ·
  api Vitest.

## 12. Non-goals (v1'да YO'Q)

- Ko'p-valyuta akt (faqat UZS).
- Davriy/avtomat yuborish (faqat on-demand tugма).
- Ombor qoldiqlari (stock ostatki) — bu funksiya emas.
- PDF format (faqat Excel).

## 13. Ochiq/keyingi

- Ko'p-valyuta · PDF · davriy avtomat yuborish · imzo/muhr rasmи.
