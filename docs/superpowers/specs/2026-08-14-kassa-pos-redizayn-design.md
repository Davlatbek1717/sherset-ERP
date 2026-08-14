# Kassa POS redizayn — sensorli monoblok uchun zamonaviy interfeys

**Sana:** 2026-08-14 · **Holat:** egasi bilan brainstorm qilingan, tasdiqlash kutilmoqda
**Qamrov:** `/sotuv` sahifasi (web + kassa .exe — bitta kod), `desktop/` (exe 1.7.0), auth (ko'p-kassir)

## 1. Maqsad va muammo

Egasi sensorli monoblokda kassa .exe'ni ochganda:

- 7 ta bo'lim (savat · jarayonda · tayyor · zakazlar · cheklar · mijozlar · smena) o'ng 600px
  panelning tepasida **juda kichik** tab yozuvlar bilan turibdi — barmoq bilan noqulay;
- dizayn eskirgan, «SOTUV» sarlavhasi o'rniga brend yo'q;
- chekni bekor qilish tugmasi kodda bor-u (`page.tsx` jarayonda/tayyor qatorlari), kassir uni
  **topa olmagan** — ochiq cheklar smenani yopishni bloklagan, chiqish yo'li ko'rinmagan;
- exe'ning oyna tugmalari (— ❐ ✕) preload tomonidan «yalang» tashlangan, qo'pol ko'rinadi.

Maqsad: butun POS interfeysini sensorli ekranga mos, ko'k-oq brendli, katta-shriftli qilib
qayta qurish; smena yopish oqimini kassir mustaqil yakunlay oladigan qilish; bir qurilmada
bir nechta kassir ishlashiga yo'l ochish.

## 2. Qabul qilingan qarorlar (egasi bilan kelishilgan)

| # | Qaror | Tanlov |
|---|-------|--------|
| Q1 | Dizayn qamrovi | Hamma joyda bir xil — brauzer ham, exe ham (bitta kod) |
| Q2 | Navigatsiya modeli | **To'liq ekran rejimlar** — sidebar butun ish maydonini almashtiradi |
| Q3 | Jarayonda + Tayyor | Bitta **«Navbat»** ekrani (ikki ustunli kanban) |
| Q4 | Shrift | Sensorli-optimallashgan shkala (mexanik 2× emas) |
| Q5 | Implementatsiya | Bitta route (`/sotuv`), rejim-komponentlar; sub-route YO'Q |
| Q6 | Savat ± tugmalari | **Olib tashlanadi** — qator tegilsa `cart-line-edit-modal` ochiladi |
| Q7 | Smena yopish sanog'i | **Yopiq (blind) sanoq** — kutilgan summa sanoqdan OLDIN ko'rinmaydi |
| Q8 | Ko'p-kassir pul hisobi | **Har kassir o'z smenasi bilan** (ketma-ket; parallel smena yo'q) |
| Q9 | Oyna tugmalari | Headerga singdiriladi, funksional o'zgarmaydi (exe 1.7.0) |

## 3. Layout — sidebar + header

```
┌──────────────────────────────────────────────────┐
│ HEADER (64px, ko'k)  [SHERSET]  smena-chip  soat │
├──────┬───────────────────────────────────────────┤
│ SIDE │                                           │
│ BAR  │            ISH MAYDONI                    │
│ 72px │         (tanlangan rejim)                 │
│  ↔   │                                           │
│ 240px│                                           │
└──────┴───────────────────────────────────────────┘
```

### 3.1 Header (64px, ko'k fon)

- **Chapda:** SHERSET logotipi (oq) + sidebar yig'ish tugmasi (☰).
- **O'rtada:** smena-chip — kassir ismi · smena yoshi («3 soat ochiq») · bugungi savdo soni
  va summasi. Hozirgi «session strip» shu yerga ko'chadi. `stale` bo'lsa chip sariq yonadi.
- **O'ngda:** soat · versiya-badge (mavjud `shell-version-badge`) · **aloqa indikatori**
  (server bilan ulanish uzilsa qizil nuqta + «Server bilan aloqa yo'q» banner) · oyna
  boshqaruv uchligi (§7, faqat exe 1.7.0+ da).

### 3.2 Sidebar (chap, yig'iladigan)

- Kengaygan 240px (ikonka + 17px yozuv) ↔ yig'iq 72px (28px ikonka + badge).
  Holat `localStorage`da; tor ekranda avtomatik yig'iq.
- Har element balandligi **64px**; aktiv bo'lim oq fon + ko'k chiziq.
- Bo'limlar: **Sotuv** (savat-badge) · **Navbat** (yig'ilmoqda+tayyor jami badge) ·
  **Zakazlar** (`customerorder.view` bo'yicha, hozirgidek) · **Cheklar** · **Mijozlar** ·
  pastda ajratilgan **Smena**. Badge'lar yig'iq holatda ham ko'rinadi.

## 4. Tema va tipografika

- **Ko'k-oq palitra:** header/aksent to'q ko'k (≈ #1e5aa8 oralig'i, SHERSET brendiga
  moslanadi), fon oq/och kulrang. Yashil/qizil faqat semantik joylarda (to'lov/bekor/xavf).
- Mavjud `--ms-*` tokenlar ustiga **POS-qamrovli tema qatlami** (`/sotuv` ildizidagi CSS
  class) — ERP'ning boshqa sahifalariga TEGMAYDI.
- **Tipografika:** jami summa 36–40px qalin · tovar nomi/narx 18–20px · tugma yozuvi 18px ·
  sidebar 17px · ikkilamchi meta 14px. Maqsad: 1 metrdan o'qilsin.
- **Barmoq nishonlari:** bosiladigan elementlar kamida **56×56px**; savat qatori 64px;
  asosiy «TO'LASH» tugmasi panel enida, 72px balandlik.
- Barcha yangi yorliqlar i18n orqali (ru+uz), hardcode YO'Q.

## 5. Rejim-ekranlar

### 5.1 Sotuv (asosiy rejim)

- Hozirgi setka + savat; savat Sotuv rejimida DOIM ko'rinadi (tab emas).
- Tovar kartalari kattaroq; skanerdan/setkadan qo'shilganda qisqa «bip» + savat qatori bir
  lahza yashil yonadi; topilmasa boshqa ovoz + qizil xabar.
- **Savat qatori:** tovar nomi + miqdor × narx + jami. ± tugmalar YO'Q. Qator (64px)
  tegilsa `cart-line-edit-modal` ochiladi (miqdor/narx, katta numpad, miqdor 0 = o'chadi).
  Tez yo'llar saqlanadi: setkadan yana bosish = +1, skaner = +1.
- Mijoz-ekran (CFD) boshqaruvi header yoki Sotuv rejimida qoladi, funksional o'zgarmaydi.

### 5.2 Navbat (jarayonda + tayyor birlashgan)

- Ikki ustunli kanban: **«Yig'ilmoqda»** (sariq) · **«Tayyor»** (yashil).
- Har karta: chek raqami (20px) · summa · mijoz · o'tgan vaqt; kartada katta **«TO'LASH»**
  (faqat tayyor ustunida) va **«BEKOR QILISH»** tugmalari.
- Bekor qilish tasdiq oynasi chek raqami + summani ko'rsatadi; `noAccidentalClose`
  konvensiyasi saqlanadi.

### 5.3 Cheklar · Zakazlar · Mijozlar

- To'liq ekran ro'yxat + o'ng detal-panel. Funksional hozirgi tab'lardan **1:1** ko'chadi
  (cheklar qaytarish/qayta chop, zakazlar F7/F8 oqimi, mijozlar qarz/karta/cheklar).
- Qatorlar 64px, shriftlar §4 shkalasi bo'yicha.

### 5.4 Smena

- **Yopiq sanoq (Q7):** «Smenani yopish» → faqat sanoq maydon(lar)i (katta numpad; USD
  maydoni hozirgi shart bilan — oqim bo'lsa). Kutilgan summa KO'RINMAYDI.
  «Tasdiqlash»dan keyin: «Sanadingiz X · Kutilgan Y · **Farq Z**». Farq ≠ 0 bo'lsa izoh
  so'raladi (mavjud akt mexanizmi). Sanoqni farqni ko'rib o'zgartirib bo'lmaydi.
  Server o'zgarmaydi (u baribir o'zi hisoblaydi) — faqat UI ko'rsatish tartibi.
- **Ochiq cheklar bloki:** yopish bloklanganida server xabari toast o'rniga **strukturali
  ro'yxat** bo'lib chiqadi: har yakunlanmagan chek karta — raqam, bosqich, summa + yonida
  **«To'lash» / «Bekor qilish»** tugmalari. `draft` (savatda qolgan) cheklar ham shu
  ro'yxatda ko'rinadi (hozir hech qaysi tabda yo'q edi — «ko'rinmas bloklovchi» shu edi).
- Yashiq amallari (kirim/chiqim), Z-hisobot chop etish — hozirgi funksional saqlanadi.
- **«Kassirni almashtirish»** tugmasi (§8).

## 6. Monolitni bo'lish (texnik qarz, MK33 bilan mos)

3370 qatorli `sotuv/page.tsx` rejim-komponentlarga bo'linadi:
`PosSidebar` · `PosHeader` · `SotuvMode` · `NavbatMode` · `ZakazlarMode` · `CheklarMode` ·
`MijozlarMode` · `SmenaMode`.

**Chegara — nima ko'chadi, nima yangidan yoziladi:**

- **Ko'chadi (qayta yozilmaydi):** savat matematikasi (sof modul), server so'rovlari,
  smena/to'lov/bekor mantiqi, mijoz-ekran BroadcastChannel sinxroni, hotkey'lar.
- **Yangidan yoziladi:** JSX/ko'rinish qatlami — sidebar, header, rejim-ekranlar, o'lchamlar.
- 77 ta characterization test (MK32) — xulq o'zgarmaganining qo'riqchisi. Test fayllari
  USTIDAN Write TAQIQ (xotira qoidasi); moslashtirish faqat Edit bilan, xulq-assertlar
  saqlanib.

## 7. Oyna boshqaruv tugmalari — headerga (exe 1.7.0)

Hozir — ❐ ✕ uchligini `desktop/preload.js` sahifa ustiga yalang fixed tugmalar qilib
tashlaydi. Yangi dizaynda:

- `electronAPI` ga 3 metod qo'shiladi: `minimize()` · `toggleWindowed()` · `requestQuit()`.
  Funksional AYNAN hozirgidek: — = ish stoliga · ❐ = kiosk ↔ oynali · ✕ = tasdiq dialogli
  chiqish (`shell:request-quit`, `shell:quit` EMAS).
- Web header eng o'ngda uchlikni **headerga singdirilgan tekis tugmalar** qilib chizadi:
  64px balandlik, ko'k fonda oq belgilar, hover'da yorishadi, ✕ hover qizil.
- **Versiya-moslik matritsasi** (qurilmalar exe'ni qo'lda yangilaydi):
  - Web tugmalarni FAQAT `electronAPI.minimize` mavjud bo'lsa chizadi (eski exe → chizmaydi).
  - Web chizganda DOM'ga belgi qo'yadi (`data-sherset-window-controls="page"`); yangi preload
    belgini ko'rsa o'z suzuvchi tugmalarini chizmaydi. Eski preload belgini bilmaydi →
    eski ko'rinish qoladi. Hech qaysi kombinatsiyada tugmalar ikkilanmaydi/yo'qolmaydi.
- Burchak-imosi (chap-yuqori 2s = chiqish) SAQLANADI (E4).
- Qo'riqchi-test `desktop-window-controls.test.ts` yangi shartnoma bilan qayta yoziladi
  (tarixda bir marta shunday kengaygan — niyat yozilib).

## 8. Ko'p-kassir — bir qurilmada (Q8: har kassir o'z smenasi)

Hozirgi server modeli saqlanadi: smena bitta kassirga tegishli (`session.cashierId` = token
egasi), har chek smena egasi nomidan. Yangi qism — **kassirni tez almashtirish**:

1. Smena ekranida «Kassirni almashtirish» → joriy kassir smenasini yopadi (yopiq sanoq;
   ochiq cheklar bo'lsa §5.4 ro'yxati chiqadi — almashinuv har doim TOZA nuqtada).
2. Smena yopilgach — **kassir-tanlash ekrani:** shu do'kon smenasiga biriktirilgan
   kassirlar katta kartalar (ism + bosh harf doirasi).
3. Yangi kassir kartasini bosib **PIN** teradi → server qurilma-juftligi + smena-a'zolikni
   tekshirib yangi token beradi → kassir ochilish sanog'ini kiritib ishga tushadi.
4. **PIN-qulf moslashuvi:** smena ochiq bo'lsa faqat egasi PIN'i ochadi (hozirgidek);
   smena yopiq bo'lsa qulf o'rniga kassir-tanlash ekrani.

**Server ishi (yangi):**

- `POST /auth/pos-pin/switch` — juftlangan qurilmada boshqa xodim nomidan PIN bilan token.
  Tekshiruvlar: qurilma juftligi · xodim shu do'kon/smenaga biriktirilgan · PIN to'g'ri ·
  mavjud 5-xato-lockout qoidalari qayta ishlatiladi.
- Kassir-ro'yxat endpointi: «shu qurilmada ishlay oladigan kassirlar» (ism + id, PIN'siz).
- Xavfsizlik: switch faqat kiosk-juftlangan qurilmadan; token almashganda eski token
  bekor qilinadi; audit-jurnalga almashinuv yoziladi.

## 9. Qamrovga ATAYLAB kirmagan

- Offline-rejimda savdo · chegirma tizimi — alohida loyihalar.
- Parallel ochiq smenalar (bir yashiqda ikki kassir bir vaqtda) — Q8 da rad etilgan.
- Server tomonda smena-yopish qoidalarining o'zgarishi (avto-bekor va h.k.) — egasi
  2026-08-12 qarori kuchda.

## 10. Qabul mezonlari va chiqarish

**Gate (har faza):** typecheck 0 · biome 0 · i18n key-existence ru+uz + no-hardcoded ·
web Vitest (77 POS characterization testi yashil; yangi komponentlarga yangi testlar).

**Chiqarish tartibi:**

1. Web-redizayn deploy — eski exe'larda ham darhol ko'rinadi (kiosk shell webni ko'rsatadi);
   oyna tugmalari eski ko'rinishda qoladi (moslik matritsasi §7).
2. Exe 1.7.0 reliz (kanalga) — headerga singdirilgan tugmalar; qurilmalarda QO'LDA yangilash.
3. Qurilmada haqiqiy sensorli sinov (Phase-2 QA) — deploy'dan keyin.

**Implementatsiya rejasiga talablar (egasi, 2026-08-14):** reja fazalarga bo'linadi; har
faza — alohida sessiyada, alohida agent; rejada umumiy MUMKIN/TAQIQ qoidalari; har agent
ishini tugatib reja faylining o'z fazasi ostiga qisqa hisobot yozadi; oxirgi faza oldingi
chala ishlarni tugatib deploy qiladi; har fazaga tayyor ishga-tushirish prompti yoziladi.
