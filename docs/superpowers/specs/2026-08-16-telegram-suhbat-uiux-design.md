# Telegram suhbati — UI/UX dizayni

**Sana:** 2026-08-16 · **Holat:** dizayn · **Talab (egasi):** xabar botdan emas, kontragentning
shaxsiy chatiga — «xuddi mijozlarga telegramdan xabar borgandek»; chat ham ochilsin.

## 1. Yo'nalish allaqachon to'g'ri

Mijozga ketadigan xabar **botdan EMAS**: u MTProto orqali egasining shaxsiy raqamidan
(`+998919258700`, slot 1 faol) ketadi. Bot faqat **egaga** — guruhga xabar berish uchun.
Ya'ni «shaxsiy chatga, odam yozgandek» talabi transport darajasida bajarilgan.

Muammo transportda emas — **ko'rinishda**.

## 2. O'lchangan muammo: suhbatning yarmi ko'rinmaydi

| Yo'nalish | Transport | `TelegramChatMessage` ga yoziladimi | Suhbatda ko'rinadimi |
|---|---|---|---|
| Mijoz → biz | MTProto (inbound) | ✅ ha (`mtproto-inbound-handler` → `handleIncoming`) | ✅ |
| Mijoz → biz | Business/Bot | ✅ ha | ✅ |
| Biz → mijoz (qo'lda) | Business/Bot | ✅ ha (`telegram.service` 3 joyda) | ✅ |
| **Biz → mijoz (avtomatik)** | **MTProto outbox** | ❌ **YO'Q** | ❌ **YO'Q** |

Oqibati aniq: kontragent kartasidagi suhbatda operator **mijozning javobini ko'radi, lekin
nimaga javob berganini ko'rmaydi**. U mijozga allaqachon ketgan «qarzingiz 6 908 994 so'm»
xabarini bilmay, o'sha gapni qaytadan yozadi.

### Yana uch bo'shliq (o'lchangan)

1. **Yetkazish holati ko'rinmaydi.** `HrTelegramOutbox` da `status` (`pending`/`sent`/
   `failed`/`retry`), `retryCount`, `sentAt`, `lastError` bor — UI'da **birortasi**
   ko'rsatilmaydi. «Mijoz oldimi?» degan savolga ERP javob bera olmaydi.
2. **Chat mijoz yozmaguncha mavjud emas.** `TelegramChat` inbound'da tug'iladi. Biz birinchi
   bo'lib yozgan mijozda karta «chat bog'lanmagan» deb turaveradi — 251 nafar qarzdorning
   ko'pchiligi shu holatda bo'ladi.
3. **Yetkazilmaganlar hech kimga ko'rinmaydi.** Telefoni yo'q, Telegram'da yo'q yoki bloklagan
   mijoz faqat `logger` qatorida qoladi.

## 3. Yo'naltiruvchi tamoyil

> **Bitta suhbat, bitta haqiqat.** Mijozga nima ketgan bo'lsa — qaysi transport bilan, qo'lda
> yoki avtomatik — hammasi bitta ipda, bir xil joyda, holati bilan ko'rinadi.

Bu tamoyil `mtproto-inbound-handler.ts` izohida allaqachon e'lon qilingan («normalized into the
SAME tables … no parallel UI needed») — inbound uchun bajarilgan, outbound uchun bajarilmagan.
Dizayn shuni yakunlaydi, yangi UI yaratmaydi.

## 4. UI/UX qarorlari

### 4.1 Suhbat ipi — avtomatik xabar ham ko'rinadi

Har chiquvchi xabar (transportidan qat'i nazar) `TelegramChatMessage` ga yoziladi.
`autoKind` maydoni **allaqachon bor** va kartochkada rozetka sifatida chiziladi — ya'ni
operator qo'lda yozganini avtomatikdan ajratadi. Yangi maydon kerak emas.

```
┌─ Telegram · Шерзод ака магазинчи ────────────────┐
│                                                   │
│  ┌─ avtomatik · kassa savdosi ──────┐            │
│  │ SHERSET ELEKTRO TOVAR DO'KONI     │            │
│  │ 🛒 Qarzga qo'shildi: +100 000     │  ✓ 11:02  │
│  │ 💰 Jami qarzingiz: 6 908 994      │            │
│  └───────────────────────────────────┘            │
│                                                   │
│            ┌─ mijoz ──────────────┐               │
│            │ Ertaga to'layman     │  11:14        │
│            └──────────────────────┘               │
│                                                   │
│  [ Xabar yozing…                    ]  [Yuborish] │
│  ⓘ Xabar sizning shaxsiy raqamingizdan ketadi     │
└───────────────────────────────────────────────────┘
```

### 4.2 Holat — har xabarning yonida, so'z bilan

Xom status kodlari ko'rsatilmaydi. Uchta ko'rinadigan holat:

| Ko'rinish | Ma'nosi | Manba |
|---|---|---|
| `⏳ navbatda` | outbox'da, hali yuborilmagan | `status pending/retry` |
| `✓ yuborildi 11:02` | yetkazildi | `status sent` + `sentAt` |
| `⚠️ yetmadi — sabab` | yetkazilmadi | `status failed` + `lastError` |

🔴 `pending` ni «yuborildi» deb ko'rsatish TAQIQ — bu loyihada allaqachon xato qilingan
klass (`pending` dalil emas). Kutish holati ochiq aytiladi.

### 4.3 Chat birinchi xabarda ochiladi

Biz birinchi bo'lib yozganda `TelegramChat` qatori telefon bo'yicha yaratiladi/bog'lanadi
(`boundBy: 'auto'`), shunda suhbat kartada **darhol** paydo bo'ladi. Mijoz keyin javob
yozganda inbound o'sha ipga tushadi — ikkita ip yaratilmaydi.

### 4.4 Kontragent kartasida aloqa holati halol ko'rsatiladi

Hozir karta faqat «chat bor/yo'q» deydi. Uch holat ajratiladi:

- **Telegram'da bor** — `tgid` yoki bog'langan chat bor ⇒ xabar ketadi;
- **Hali yozilmagan** — telefoni bor, lekin aloqa tarixi yo'q ⇒ «birinchi to'lqin» qulfi
  uni chetlab o'tadi (sababi kartada yoziladi, jim qolmaydi);
- **Yetmaydi** — telefoni yo'q yoki oxirgi urinish `failed` ⇒ sababi bilan.

### 4.5 «Yetkazilmaganlar» ro'yxati

Qarzdorlar bo'limiga filtr: *xabar yetmagan mijozlar*. Aks holda 357 ta chetlab o'tilgan va
xato bergan mijoz hech qachon ko'rinmaydi. Bu — spec §5.4 dagi «yetkazilmaganlar hisoboti»
talabining UI qismi.

### 4.6 Takroriy xabarning oldini olish

Send box tepasida oxirgi avtomatik xabar va uning vaqti ko'rinadi. Operator o'sha gapni
qaytadan yozmasligi uchun — bugungi asosiy nosozlikning bevosita yechimi.

## 5. Qamrovdan tashqarida

- Yangi chat sahifasi/messenger — **yaratilmaydi**. Mavjud `telegram-chat-card.tsx` (343
  qator) va `order-telegram-panel.tsx` kengaytiriladi.
- Guruh yozishmalari, ovozli xabar yuborish, fayl yuborish (kiruvchisi allaqachon bor).
- Ko'p tillilik (kontragentda til maydoni yo'q — alohida ish).

## 6. Xavflar

- **Ikki transport bitta ipda.** Xabar qaysi yo'l bilan ketganini ip KO'RSATMAYDI (ataylab —
  mijoz uchun farqi yo'q). Lekin diagnostikada kerak ⇒ `sourceEventType`/transport
  texnik maydonda saqlanadi, UI'da faqat `⚠️ yetmadi` sababida chiqadi.
- **Shaxsiy raqamdan yozish** — spam-shikoyat xavfi o'zgarmaydi; «birinchi to'lqin» qulfi
  kuchda qoladi va UI uni sabab sifatida ko'rsatadi.
