# SIZDAN KERAK — input-paket (2026-06-10, Phase-2 100% dan keyingi yo'l)

> ## ✅ JAVOBLAR OLINDI (2026-06-10d) — GROUNDING TO'LIQ UNBLOCKED
> - **1-savol = B**: foydalanuvchi pullik akkaunt berdi → creds `.env.local`ga qo'yildi (gitignored,
>   parol hech qayerda yozilmaydi), eski `.auth` sessiya o'chirildi, **avtomatik login JONLI tekshirildi — OK**.
> - **Jonli tarif-probe natijasi** (scratch/probe-paid-tier.mjs, gitignored): `#internalorder` ·
>   `#processingplan` (Техкарты) · `#processingorder` · `#processing` · `#retaildemand` · `#retailshift`
>   **hammasi OCHIQ** (real grid render, nav'da «Производство» bor) → IO-3/4, boms cost-split, WO docDate,
>   retail/kassa grounding'larining BARI endi capture bilan yopiladi. `#pricetype`/`#vatrate`/`#productfolder`/
>   `#customentity`/`#cashregister` = alohida route emas (redirect) — kerak bo'lsa settings/retail sub-nav
>   («Точки продаж») orqali olinadi.
> - **2-savol (3 qaror) = «moysklad'dagiday»** — ya'ni uchchalasi ham parity: qty=0 xulqi, PO kurs xulqi,
>   WO sana maydoni moysklad'ning o'zidan capture orqali aniqlanadi (taxmin YO'Q).
> - **Grounding-sessiya oldidan qoladigan texnik ish (bizda):** `scripts/capture-moysklad-lib.ts` MODULES'ga
>   yangi modullar qo'shish: internalorder · processingplan · processingorder · processing · retaildemand ·
>   retailshift (route'lar yuqorida jonli tasdiqlangan).
>
> ---
>
> *(Quyidagi asl so'rov tarix uchun saqlanadi — javob berilgan.)*
>
> **Qisqasi: sizdan faqat 3 narsa kerak. Capture'larni qo'lda olish SHART EMAS** —
> `pnpm capture-moysklad` scripti o'zi login qilib o'zi oladi (creds `.env.local`da sozlangan ✓).
> Muammo boshqa joyda: **moysklad.uz akkauntimiz FREE-TIER** va grounding kerak bo'lgan modullarning
> bir qismi tarifda yopiq (2026-06-01 da jonli tekshirilgan: «Кассы ККМ», bir qator spravochniklar
> splash'ga redirect bo'ladi; production moduli capture-config'da umuman yo'q — katta ehtimol u ham).

---

## 1-SAVOL (eng muhimi) — moysklad tarifi

Grounding-gated itemlarning ~yarmi (boms cost-split · work-orders docDate · non-UZS kassa ·
inventories «Дополнить из остатков» · IO-3/IO-4 label'lar) moysklad'ning **pullik moduli**dagi
ekranlarni talab qiladi. Uchta yo'ldan birini tanlang:

- **[ ] A — Tarifni vaqtincha ko'tarish** (1 oy yetadi): keyin men hammasini avtomat capture qilib,
  grounding-sessiyada yopaman. *(Eng to'liq parity — tavsiya, agar narxi maqbul bo'lsa.)*
- **[ ] B — Boshqa pullik akkaunt bor**: uning email/parolini `.env.local`dagi
  `MOYSKLAD_EMAIL/MOYSKLAD_PASSWORD`ga qo'yasiz — qolganini o'zim qilaman.
- **[ ] C — Moysklad'siz yopamiz**: yopiq modullar bo'yicha parity emas, **o'z mahsulot-qarorimiz**
  bilan yakunlaymiz (men har item uchun taklif tayyorlayman, siz ha/yo'q deysiz). Halol yorliq:
  «product-decision, moysklad-grounded EMAS».

## 2-SAVOL — 3 ta mahsulot-qarori (bilmasangiz «moysklad'dagiday» deng — A/B tanlansa o'zim aniqlayman)

1. **qty=0**: hujjat qatorida miqdor 0 bo'lishi mumkinmi? (~13 schema; hozir qabul qiladi)
   — [ ] ruxsat · [ ] taqiq (400) · [ ] moysklad'dagiday
2. **Purchase-order valyuta kursi**: buyurtma yaratilganda kurs hujjatga muzlatilsinmi,
   yoki doim joriy kurs ishlatilsinmi?
   — [ ] muzlatish (snapshot) · [ ] joriy kurs · [ ] moysklad'dagiday
3. **Work-order hujjat-sanasi**: ishlab chiqarish topshirig'iga tahrirlanadigan «hujjat sanasi»
   ustuni kerakmi (hozir faqat tizim `createdAt`)?
   — [ ] kerak (BE column qo'shamiz) · [ ] kerak emas · [ ] moysklad'dagiday

## 3-AMAL (faqat kerak bo'lsa) — captcha/2FA

Capture-sessiya eskirgan bo'lsa va avtomatik login captcha'ga uchrasa, men aytaman — siz bitta marta:
```
pnpm capture-moysklad:login
```
ochilgan brauzerda qo'lda kirasiz (parol log qilinmaydi, sessiya `.auth/`ga saqlanadi). **Hozircha kerak emas.**

---

## Sizdan KERAK EMAS (avtomat/bizda):
- Capture'larni qo'lda olish/saqlash — script qiladi (`pnpm capture-moysklad <module> --detail`).
- Mexanik wrap (hook, phase2-counter, «Сумма от/до» filtrlari) — keyingi `davom et` sizsiz boshlaydi.
- Grounding-sessiya ijrosi, Phase-3 master-plan — men.

## Javob berish tartibi
Shu faylda katakchalarni belgilang yoki shunchaki chatda yozing: masalan
**«1: C · 2: taqiq, muzlatish, kerak emas»** — shu yetarli.
