# Mijozga Telegram qarz xabarlari — dizayn

**Sana:** 2026-08-16 · **Holat:** dizayn · **Talab (egasi):** qarzga savdo qo'shilsa, mijoz
qarzini to'lasa va qarzi bo'lsa — mijozning **shaxsiy chatiga** admin Telegramidan xabar borsin.

## 1. Muhim: bu 2026-07-23 qarorini teskarisiga o'giradi

Mijozga **avtomatik** xabar yuborish o'sha kuni ataylab o'chirilgan
(`debt-reminder.service.ts` izohi: *«foydalanuvchi "faqat o'zimiz bossak ketsin" dedi»*), va
2026-07-26 da yana toraytirilgan (*«faqat Excel akt, matn yo'q»* →
`DEBT_NOTIFY_ENABLED` bayrog'i). Egasi 2026-08-16 da avtomatik yuborishni qayta so'radi.

## 2. O'lchangan holat (prod `sherset_v2`, 2026-08-16)

**Funksiyaning KATTA QISMI allaqachon qurilgan** — `counterparty-debt-notify` moduli:

| Komponent | Holat |
|---|---|
| `CounterpartyDebtNotifier` — balans hodisasini tinglaydi | ✅ yozilgan, testlangan |
| Mijozga o'zbekcha matnlar (`counterparty-message.util.ts`) | ✅ *«🛒 Qarzga qo'shildi»*, *«✅ To'lovingiz qabul qilindi»*, *«💰 Qolgan qarzingiz»* |
| Egaga guruhga xabar (Bot API) | ✅ `DEBT_NOTIFY_BOT_TOKEN` + `DEBT_NOTIFY_CHAT_ID=173049511` sozlangan |
| MTProto userbot (admin raqamidan) | ✅ **slot 1 faol**, sessiyasi bor (`+998919258700`) |
| Outbox yetkazuvchi | ✅ ishlaydi (2026-08-16 da 2 xabar `sent`) |
| Ban himoyasi | ✅ `FLOOD_WAIT` intizomi, akkaunt bo'yicha ~3s pauza, `flood_wait_until` |
| Hujjat bo'yicha dedup | ✅ `(sourceEventType, sourceDocId)` |
| Teskari yozuvni chetlab o'tish | ✅ `if (!payload.source) return` |
| **Bayroq** | 🔴 `DEBT_NOTIFY_ENABLED = false` |

**Aloqa qamrovi:** 1785 kontragent · telefonli **1644** · `tgid` li **486** · bog'langan
chat **146** · qarzdor **608**, shundan telefonli **600**.

## 3. 🔴 Asosiy yoriq — kassa oqimi hodisa yubormaydi

`CounterpartyBalanceChangeSource` atigi 6 qiymatdan iborat:
`invoiceIn · invoiceOut · paymentIn · paymentOut · cashIn · cashOut`.

**Kassa savdosi (`retailsale`) va qarz to'lovi (`debt`) unda YO'Q.** Ikkalasi ham
`applyDelta` ga faqat `{docType, docId, organizationId}` uzatadi, `source` esa uzatilmaydi
⇒ notifier `if (!payload.source) return` bilan ularni jimgina tashlaydi.

Ya'ni **bayroqni yoqishning o'zi yetarli emas**: bu biznesda qarz aynan kassada tug'iladi.

**Qilinadigan ish (kichik, ~1 kun):**
1. `CounterpartyBalanceChangeSource` ga `'retailsale'` va `'debt'` qo'shish.
2. `retail-sale.service.ts` (qarz ulushi bor post) va `debt.service.ts` / POS to'lov yo'lida
   `meta.source` uzatish.
3. `counterparty-message.util.ts#cpHead` ga ikki matn: kassa savdosi va qarz to'lovi.
4. `.env` da `DEBT_NOTIFY_ENABLED=true` + API restart.

## 4. Qo'shish mumkin bo'lgan boshqa holatlar

### 4.1 Deyarli tekin (kod bor, ulanmagan)
- **Qarz to'liq yopilganda tasdiq** — `notifyCounterparty` signature'ida `'debt_closed'` turi
  **bor**, lekin hech kim shu tur bilan chaqirmaydi.
- **Davriy takror eslatma** — `Debt.lastTgReminderAt` maydoni **aynan shu uchun** qo'yilgan
  (izohi: «15-kunlik mijozga takror telegram eslatmasi»), hozir doim `NULL`.
- **Egaga «katta qarz» ogohlantirishi** — `DEBT_NOTIFY_THRESHOLD_MINOR` o'qiladi, `.env` da
  qo'yilmagan; qo'yilsa xabarga ⚠️ qatori qo'shiladi.

### 4.2 Yangi ish
- Qarz muddati (`nextContactAt`) kelganda mijozga avtomatik eslatma (hozir faqat operatorga).
- Sotuvdan keyin **chek nusxasi** Telegramga.
- Buyurtma tayyor bo'lganda («omborchiga yuborildi» → «buyurtmangiz tayyor»).
- Akt-sverka Excel faylini Telegramga yuborish (tugma bor, faqat yuklab olish).
- Oylik/haftalik qarz xulosasi (bitta jamlangan xabar).

### 4.3 🔴 Haqiqiy yoriq — tuzatish xabari yo'q
Qaytarish / bekor qilish / storno **ataylab** chetlab o'tiladi (`source` bo'lmaydi). Natija:
mijoz «qarzga qo'shildi» xabarini oladi, savdo bekor qilinsa **tuzatish xabari kelmaydi** va
uning qo'lida noto'g'ri raqam qoladi. Bu ishonchni buzadi — «qarz qo'shildi» yuborilgan har
qanday hodisaning bekori ham yuborilishi kerak.

## 5. Xavflar

**5.1 Spam shikoyati / akkaunt bloki.** Xabarlar egasining **shaxsiy** raqamidan, o'zi hech
qachon yozmagan 600 kishiga ketadi. Texnik ban himoyasi bor (FLOOD_WAIT, pace), lekin u
tezlik xavfini yopadi — «yozmagan odamga yozish» **boshqa xavf klassi** (foydalanuvchi
«Report spam» bosadi).
**Tavsiya:** birinchi to'lqin faqat `tgid` bor (486) yoki bog'langan chatli (146) mijozlarga;
qolganlariga faqat ular yozgandan keyin.

**5.2 🔴 Backfill bombasi.** 2026-08-16 dagi 759 boshlang'ich qoldiq **to'g'ridan-to'g'ri**
yozilgan (`applyDelta` orqali EMAS) ⇒ hech qanday hodisa chiqmadi, xabar ketmadi. Lekin
kelajakda `recompute-counterparty-balances.ts` yoki shunga o'xshash backfill `applyDelta`
orqali yugurtirilsa — **600 mijozga bir zumda xabar ketadi**.
**Talab:** ommaviy skriptlar `source` UZATMASIN, va notifier'ga «bir yugurishda N dan ortiq
xabar» qo'riqchisi qo'shilsin.

**5.3 Til.** Matnlar o'zbekcha lotin; ba'zi mijozlar ruschada («пакуптел», «1покупатель»).

**5.4 Telefon ≠ Telegram.** 8 qarzdorda telefon yo'q; telefoni borlarning ham hammasida
Telegram bo'lmasligi mumkin — yetkazilmaganlar hisoboti kerak.

## 6. Bosqichlar

1. **B1 (kichik):** kassa oqimini ulash (§3) + `DEBT_NOTIFY_ENABLED=true` + cheklangan
   birinchi to'lqin (§5.1) + yetkazilmaganlar hisoboti.
2. **B2:** tuzatish/bekor xabari (§4.3) — ishonch uchun B1 bilan birga chiqishi ma'qul.
3. **B3:** tekin holatlar (§4.1).
4. **B4:** yangi holatlar (§4.2) — alohida talab bo'yicha.

## 7. Qamrovdan tashqarida
- Marketing/aksiya tarqatmalari (ToS xavfi yuqori, alohida qaror talab qiladi).
- Mijozning javobini qayta ishlash (bot dialogi).
