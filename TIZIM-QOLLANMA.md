# Alibobo Qurilish — Buyurtma va Inventerizatsiya Tizimi

## To'liq qo'llanma (nazariy tushuntirish)

> Bu hujjat tizimning har bir bo'limi, sahifasi, oynasi va tugmasini —
> **texnik atamalarsiz, oddiy tilda** — tushuntiradi. Maqsad: har bir xodim
> tizim nima qilishini va qaysi tugma nimaga olib kelishini tushunishi.

---

## 1. Tizim nima va kimga kerak

Bu tizim — qurilish mollari savdosi bilan shug'ullanadigan korxonaning
**kundalik ishini bir joyda boshqarish** uchun yaratilgan dastur.

U uchta katta vazifani bajaradi:

1. **Kontragentlar va mahsulotlar bilan ishlash** — kimdan mol olamiz, qaysi
   mahsulot bor, qancha qoldiq bor, qaysi narxda — hammasi ko'rinadi.
2. **Buyurtma shakllantirish** — qaysi kontragentdan qaysi mollarni olish
   kerakligini tanlab, tayyor ro'yxat (Excel) chiqarish.
3. **Inventerizatsiya (ombor sanash)** — omborni sanab, REGOS tizimidagi
   raqam bilan solishtirish, kamomad yoki ortiqchani aniqlash va pul
   hisobida qancha yo'qotish/foyda borligini ko'rsatish.

Tizim **REGOS** degan asosiy savdo dasturi bilan bog'langan. REGOS — bu
korxonaning haqiqiy mol qoldig'i, narxlari va savdo tarixi saqlanadigan
asosiy manba. Bizning tizim REGOS'dan ma'lumotni olib turadi va u bilan
solishtiradi.

---

## 2. Tizimga kirish (Login sahifasi)

Tizimga faqat ro'yxatdan o'tgan xodim kira oladi.

**Nima ko'rinadi:**
- Chap tomonda (kompyuterda) — korxona logotipi va tizim imkoniyatlari haqida
  qisqacha ma'lumot.
- O'ng tomonda — login va parol kiritish maydoni.

**Tugmalar va natijalar:**
- **"Kirish" tugmasi** — login va parol to'g'ri bo'lsa, xodim ichkariga
  kiritiladi va Bosh sahifaga o'tkaziladi. Agar parol noto'g'ri bo'lsa,
  xato xabari chiqadi.
- Parol bir necha marta noto'g'ri kiritilsa, hisob vaqtincha bloklanadi
  (xavfsizlik uchun) — bu noma'lum odamning parolni topishga urinishini
  oldini oladi.
- **"Administratorga yozing" havolasi** — yordam kerak bo'lsa, administrator
  pochtasiga xat yozish imkonini beradi.

Har bir xodimning o'z **roli** bor (masalan: egasi, administrator, oddiy
sanovchi). Rol xodim qaysi bo'limlarni ko'ra olishini va qaysi ishlarni
qila olishini belgilaydi. Shuning uchun bir xodim hamma narsani ko'radi,
boshqasi faqat o'ziga ruxsat berilgan qismni ko'radi.

---

## 3. Bosh sahifa (umumiy holat)

Bu — tizimga kirgandan keyin birinchi ochiladaigan sahifa. U korxonaning
umumiy holatini bir qarashda ko'rsatadi.

**Nima ko'rinadi:**
- **To'rtta asosiy ko'rsatkich kartasi:**
  - Kontragentlar soni (nechta yetkazib beruvchi bor).
  - Jami buyurtmalar soni.
  - Shu oydagi buyurtmalar soni.
  - REGOS bilan oxirgi ma'lumot almashinuvi holati (muvaffaqiyatli yoki
    xato bormi).
- **So'nggi buyurtmalar ro'yxati** — oxirgi 5 ta buyurtma.
- **Eng faol kontragentlar** — eng ko'p xarid qilingan yetkazib beruvchilar.

**Tugmalar va natijalar:**
- **"Yangi buyurtma yaratish"** — Kontragentlar bo'limiga olib o'tadi, u
  yerdan buyurtma boshlanadi.
- **Har bir ko'rsatkich kartasini bosish** — tegishli bo'limga olib o'tadi
  (masalan, "Kontragentlar" kartasi → Kontragentlar bo'limi).
- **REGOS holati kartasini bosish** — Sozlamalardagi sinxronlash
  (ma'lumot almashinuvi) bo'limiga olib o'tadi.
- **Buyurtma yoki kontragent qatorini bosish** — o'sha buyurtma yoki
  kontragentning batafsil sahifasini ochadi.

---

## 4. Kontragentlar bo'limi

Kontragent — bu bizga mol yetkazib beruvchi yoki biz bilan savdo qiladigan
korxona/shaxs. Bu bo'lim ularning ro'yxati va tahlili uchun.

### 4.1. Kontragentlar ro'yxati

**Nima ko'rinadi:**
- Qidiruv maydoni — kontragentni nomi, STIR raqami yoki telefoni bo'yicha
  topish mumkin.
- Guruh bo'yicha filtr — kontragentlar turkumlarga ajratilgan, kerakli
  turkumni tanlash mumkin.
- "O'chirilganlarni ko'rsatish" tugmachasi — eski, o'chirilgan
  kontragentlarni ham ko'rsatadi.
- Kontragentlar jadvali — har birida nomi, guruhi, STIR, telefon ko'rinadi.

**Tugmalar va natijalar:**
- **Qidiruvga yozish** — yozgan zahoti ro'yxat avtomatik filtrlanadi.
- **Guruhni tanlash** — faqat o'sha guruhdagi kontragentlar ko'rinadi.
- **Kontragent qatorini bosish** — o'sha kontragentning tahlil sahifasini
  ochadi.
- **Sahifa o'tish tugmalari** — kontragentlar ko'p bo'lsa, keyingi/oldingi
  sahifaga o'tadi.

### 4.2. Kontragent tahlili va buyurtma yaratish

Bitta kontragentni bosganda ochiladi. **Bu sahifa tizimning eng muhim
ish joylaridan biri** — bu yerda ham tahlil ko'riladi, ham buyurtma
shakllantiriladi.

**Nima ko'rinadi:**

- **Yuqorida sana filtri** — tahlil qaysi davr uchun hisoblanishini
  belgilaydi (standart: oxirgi 30 kun). Sanani o'zgartirsangiz, barcha
  ko'rsatkichlar shu davr bo'yicha qayta hisoblanadi.

- **Statistika kartalari** — o'sha kontragent bilan savdoning to'liq
  manzarasi:
  - Xarid miqdori (undan qancha olingan).
  - Sotilgan miqdor (biz qancha sotganmiz).
  - Sotilgan ulush (olganimizdan qanchasini sotdik).
  - Qoldiq.
  - Kutilayotgan foyda.
  - Xaridlar tannarxi, Sotuvlar tannarxi, Sotuvlar qiymati.
  - So'nggi xarid va so'nggi sotuv sanalari.

- **Mahsulotlar jadvali** — o'sha kontragentdan olinadigan mahsulotlar.
  Har bir mahsulot yonida **miqdor kiritish maydoni** bor.

**Qanday buyurtma yaratiladi:**
1. Kerakli mahsulotlar yoniga olmoqchi bo'lgan miqdorni yoziladi.
2. Pastda doimo ko'rinib turadigan **"buyurtma paneli"** jonli yangilanib
   boradi — nechta mahsulot tanlangani va umumiy summasi ko'rinadi.
3. **"Buyurtma shakllantirish" tugmasi** bosilganda — buyurtma yaratiladi,
   avtomatik Excel fayl yuklab olinadi va buyurtma tafsilot sahifasiga
   o'tiladi.

**Tugmalar va natijalar:**
- **"Buyurtma shakllantirish"** — tanlangan mahsulotlardan rasmiy buyurtma
  yaratadi + Excel yuklaydi (kamida bitta mahsulotga miqdor kiritilishi shart).
- **"Tozalash"** — kiritilgan barcha miqdorlarni o'chiradi. Bosilganda
  tasdiqlash oynasi chiqadi (chunki orqaga qaytarib bo'lmaydi).
- **Orqaga havolasi** — Kontragentlar ro'yxatiga qaytaradi.

> **Eslatma:** Tizimda buyurtmani **ikki yo'l** bilan yaratish mumkin:
> (1) shu yerda — bitta kontragent bo'yicha; (2) Mahsulotlar bo'limida —
> savatga turli mahsulot yig'ib, Excel chiqarish orqali.

---

## 5. Mahsulotlar bo'limi

Bu — barcha tovarlar (nomenklatura) ro'yxati. Korxonada qaysi mahsulot bor,
qancha qoldiq, qaysi narxda — hammasi shu yerda.

**Nima ko'rinadi:**
- **Yuqorida qisqa statistika** — jami mahsulotlar soni, kam qolgan
  mahsulotlar soni, yetkazib beruvchisi belgilanmagan mahsulotlar soni,
  savatdagi mahsulotlar soni.
- **Chap tomonda guruhlar daraxti** — mahsulotlar turkumlarga ajratilgan
  (telefonda alohida "Guruhlar" tugmasi orqali ochiladi).
- **O'ng tomonda mahsulotlar jadvali** — har birida kod, nomi, o'lchov
  birligi, qoldiq, sotilgan miqdor, yetkazib beruvchi va narx.

**Tugmalar va natijalar:**
- **Qidiruv** — mahsulotni nomi yoki kodi bo'yicha topadi.
- **Saralash (sort)** — kod, nom, qoldiq yoki narx bo'yicha tartiblaydi.
- **Filtrlar:**
  - "Kam qoldiq" — faqat tugab borayotgan mahsulotlarni ko'rsatadi.
  - "Yetkazib beruvchisiz" — yetkazib beruvchisi belgilanmagan mahsulotlar.
  - "Savatdagilar" — faqat savatga qo'shilgan mahsulotlar.
- **Sana oralig'ini tanlash** — sotilgan miqdor qaysi davr uchun
  hisoblanishini belgilaydi.
- **Mahsulot yoniga miqdor kiritish** — o'sha mahsulotni "savat"ga qo'shadi
  (buyurtma uchun tayyorlaydi).
- **"Buyurtma shakllantirish" tugmasi** — savatga yig'ilgan mahsulotlarni
  tayyor Excel ro'yxat qilib yuklab beradi. Bu ro'yxatni yetkazib
  beruvchiga yuborish mumkin.

**Savat tushunchasi:** Savat — bu vaqtinchalik xarid ro'yxati. Mahsulotlar
yig'iladi, keyin bir tugma bilan Excelга chiqariladi. Sahifa yangilansa,
savat tozalanadi.

---

## 6. Buyurtmalar bo'limi

Bu — shakllantirilgan buyurtmalar tarixi. Har bir tayyorlangan buyurtma
shu yerda saqlanadi.

### 6.1. Buyurtmalar ro'yxati

**Nima ko'rinadi:**
- Qidiruv — buyurtma raqami yoki kontragent nomi bo'yicha.
- Holat bo'yicha filtr — Hammasi / Qoralama / Shakllantirilgan / Yakunlangan.
- Buyurtmalar ro'yxati — har birida raqami, kontragent, mahsulotlar soni,
  holati, sanasi va umumiy summasi.

**Tugmalar va natijalar:**
- **"Batafsil" tugmasi** — buyurtmaning to'liq sahifasini ochadi.
- **"Excel" tugmasi** — buyurtmani Excel fayl qilib yuklab beradi.

### 6.2. Buyurtma tafsiloti

Bitta buyurtmani bosganda ochiladi. Buyurtmaning to'liq tarkibini ko'rsatadi.

**Nima ko'rinadi:**
- Buyurtma raqami, sanasi.
- Kontragent ma'lumotlari (nomi, STIR, telefon).
- Buyurtma holati va umumiy summasi.
- Mahsulotlar jadvali — har bir mahsulot kodi, nomi, miqdori, narxi va
  jami summasi.

**Tugmalar:**
- **Orqaga havolasi** — buyurtmalar ro'yxatiga qaytaradi.
- **Kontragent nomini bosish** — o'sha kontragent tahliliga o'tadi.
- **"Excel yuklab olish"** — buyurtmani fayl qilib saqlaydi.

Bu sahifa faqat ko'rish uchun — buyurtmani bu yerda o'zgartirib bo'lmaydi.

---

## 7. Inventerizatsiya bo'limi (ombor sanash)

Bu — tizimning eng muhim qismi. Maqsad: omborni real sanab, REGOS
tizimidagi raqam bilan solishtirish va farqni (kamomad yoki ortiqcha)
aniqlash. So'ng pul hisobida qancha yo'qotilgani yoki ortiqcha
topilganini ko'rsatish.

Bu bo'lim 4 qismdan iborat: **Bosh panel, Sanab kiritish, Tasdiqlash,
Hisobot.**

### 7.1. Inventerizatsiya bosh paneli

Inventerizatsiyaning umumiy holatini ko'rsatadi.

**Nima ko'rinadi:**
- Bugungi sanash ko'rsatkichlari (jami sanalgan, yashil/sariq/qizil holatlar,
  yo'qotish, topib olingan, sof natija).
- Tasdiq kutayotgan sanashlar haqida ogohlantirish.
- So'nggi sanashlar va eng faol sanovchilar.

**Tugmalar:**
- **"Yangi sanash"** — Sanab kiritish sahifasiga o'tadi.
- **"Tasdiqlash inbox"** — Tasdiqlash sahifasiga o'tadi.
- **"Hisobot"** — Hisobot sahifasiga o'tadi.

**Yashil / Sariq / Qizil tushunchasi:**
- **Yashil** — farq kichik yoki yo'q. Avtomatik qabul qilinadi, hech kim
  tekshirmaydi.
- **Sariq** — farq sezilarli. Boshliq tasdig'ini kutadi.
- **Qizil** — farq katta. Albatta tekshirilishi va qayta sanalishi kerak.

### 7.2. Sanab kiritish (eng ko'p ishlatiladigan qism)

Bu yerda omborchi mahsulotlarni sanab kiritadi. Dizayni Mahsulotlar
bo'limiga o'xshash — chapda guruhlar, o'ngda mahsulotlar jadvali.

**Nima ko'rinadi:**
- **Yuqorida 4 ta ko'rsatkich:** Bugun nechta sanaganim, jami "Kam"
  miqdor, jami "Ko'p" miqdor, sof natija (NET).
- **Chap tomonda guruhlar** (telefonda "Guruhlar" tugmasi orqali).
- **Qidiruv maydoni** — mahsulotni nom, kod yoki shtrix-kod bo'yicha topish.
- **Mahsulotlar jadvali** — har bir qatorda: rasm, nomi, kodi, REGOS
  qoldig'i, sotuv narxi, va ikkita kiritish maydoni: **"Kam"** va **"Ko'p"**.

**Qanday ishlaydi:**
- Har bir mahsulot uchun ikkita maydon bor:
  - **"Kam"** — agar haqiqatda REGOS'dagidan kam bo'lsa, qancha kamligini
    yoziladi.
  - **"Ko'p"** — agar REGOS'dagidan ko'p bo'lsa, qancha ortiqligini yoziladi.
- Bittasiga raqam yozilsa, ikkinchisi avtomatik bo'shaydi (bir vaqtda ham
  kam, ham ko'p bo'lishi mumkin emas).
- Maydondan chiqilgan zahoti (boshqa joyga bosilganda) sanash **avtomatik
  saqlanadi** — alohida "Saqlash" tugmasi kerak emas.
- Saqlangach, qatorning o'ng chetida holat belgisi paydo bo'ladi: yashil
  belgi (qabul qilindi), sariq yoki qizil belgi (tekshiruv kerak).

**Xato qilsa nima bo'ladi:**
- Agar noto'g'ri raqam yozib saqlangan bo'lsa, maydonni **bo'shatib**
  (raqamni o'chirib) boshqa joyga bossa, o'sha sanash **bekor qilinadi**.
- Raqamni o'zgartirsa, yangi qiymat saqlanadi.

**Muhim:** Bu yerda pul summasi ko'rsatilmaydi — faqat miqdor va sotuv
narxi. Pul hisobi (foyda/zarar) Hisobot bo'limida ko'rinadi.

### 7.3. Tasdiqlash (boshliq uchun)

Sariq va qizil belgilangan sanashlar shu yerga tushadi. Boshliq ularni
ko'rib chiqib, qabul qiladi yoki rad etadi.

**Nima ko'rinadi:**
- Bo'limlar (tab): Tasdiq kutayotganlar / Hammasi / Qabul qilinganlar /
  Rad etilganlar.
- Sanashlar ro'yxati — mahsulot, holati, sanalgan miqdor, REGOS qoldig'i,
  kim sanagani va qachon.
- Ko'p sanashni birdan tanlash uchun belgilash katakchalari.

**Tugmalar va natijalar:**
- **"Tasdiqlash"** — sanashni qabul qiladi. Sabab kodi tanlash oynasi
  ochiladi (masalan: "O'g'irlik", "Buzilgan", "Muddati o'tgan"). Sabab
  tanlangach, qabul qilinadi.
- **"Rad etish"** — sanashni rad etadi va qayta sanash talab qilinadi.
  Bunda ham sabab tanlanadi.
- **"Qayta sanash"** — rad etilgan mahsulotni qaytadan sanash oynasini
  ochadi.
- **"Bekor qilish"** — allaqachon qabul qilingan sanashni orqaga qaytaradi
  (faqat tegishli huquqi bor xodim).
- **Bir nechta belgilab "Hammasini tasdiqlash"** — tanlangan sanashlarni
  birdan qabul qiladi (vaqt tejaydi).

**Sabab kodi oynasi (modal):**
Tasdiqlash yoki rad etishda ochiladi. Boshliq farq nima sababdan
kelganini tanlaydi va kerak bo'lsa izoh yozadi. Bu keyinchalik hisobotda
"qaysi sabab bo'yicha qancha yo'qotish" degan tahlilni beradi.

### 7.4. Hisobot (eng muhim natijalar)

Bu yerda inventerizatsiyaning **pul hisobidagi natijasi** ko'rinadi.
Barcha hisob-kitob **sotuv narxi** asosida qilinadi.

**Nima ko'rinadi:**
- **Yuqorida 3 ta katta karta:**
  - 🔴 **Yo'qotilgan pul** — REGOS'dan kam topilgan mahsulotlarning sotuv
    narxidagi jami summasi.
  - 🟢 **Ortiqcha topib olingan pul** — REGOS'dan ko'p topilgan
    mahsulotlarning summasi.
  - 📊 **Sof natija (NET)** — umumiy foyda yoki zarar.
- **Sana filtri** — Bugun / Kecha / 7 kun / 30 kun.

**Bo'limlar (tab):**
- **Mahsulotlar** (asosiy ko'rinish) — har bir mahsulotdan oxirgi
  sanash natijasi. Kod, nomi, guruhi, REGOS qoldig'i, sanalgan miqdor,
  farq, foiz, sotuv narxi, summa, holati, kim sanagani va vaqti.
  Rad etilgan sanashlar bu yerda ko'rinmaydi.
- **Sanovchi bo'yicha** — qaysi xodim qancha sanagani va summasi.
- **Guruh bo'yicha** — qaysi mahsulot turkumida qancha farq borligi.
- **Sabab bo'yicha** — qaysi sabab (o'g'irlik, buzilish va h.k.) bo'yicha
  qancha yo'qotish.
- **Top 10 farq** — eng katta farqli 10 ta mahsulot.

**Tugmalar va natijalar:**
- **"Barcha sanalganlar" tugmasi** — har mahsulotdan oxirgi sanashni bitta
  Excel faylga yuklab beradi.
- **"Excel" tugmasi** (Mahsulotlar bo'limida) — joriy ko'rinishni
  (tanlangan guruh bo'yicha bo'lsa, o'sha guruhni) Excelга chiqaradi.
- **"PDF" tugmasi** — hisobotni PDF fayl qilib beradi.
- **Guruh tanlash ro'yxati** — Mahsulotlar bo'limini faqat bitta guruh
  bo'yicha ko'rsatadi.
- **"Reset" tugmasi** — barcha sanashlarni (yoki tanlangan guruh
  sanashlarini) tozalaydi. Bu jiddiy amal: bosilganda tasdiqlash so'raladi,
  tasdiqlangach sanashlar nolga tushadi va hisobotdan yo'qoladi. Yangi
  inventerizatsiya boshlash uchun ishlatiladi.
- **Qidiruv** — mahsulot, kod yoki sanovchi bo'yicha.

---

## 8. Xodimlar bo'limi

Bu — tizimda ishlaydigan xodimlarni boshqarish. Ikki qismdan iborat:
**Xodimlar ro'yxati** va **Rollar**.

### 8.1. Xodimlar ro'yxati

**Nima ko'rinadi:**
- Qidiruv — login yoki ism bo'yicha.
- Rol bo'yicha filtr.
- Xodimlar jadvali — login, ism, lavozim, rol, holati.

**Tugmalar va natijalar:**
- **"Yangi xodim" tugmasi** — yangi xodim qo'shish jarayonini boshlaydi.
- **Xodim qatorini bosish** — o'sha xodimning batafsil sahifasini ochadi.

### 8.2. Yangi xodim qo'shish

Uch bosqichli jarayon:
1. **Asosiy ma'lumotlar** — login, ism, lavozim.
2. **Rol tanlash** — xodim qaysi rolga ega bo'lishi.
3. **Ruxsatlar** — qo'shimcha aniq ruxsatlarni belgilash.

Oxirida xodim yaratiladi va u tizimga kira oladigan bo'ladi.

### 8.3. Xodim tafsiloti

Bitta xodimni bosganda ochiladi. Bu yerda uning ma'lumotlari ko'rinadi va
o'zgartirilishi mumkin.

**Tugmalar va natijalar:**
- **Ismni o'zgartirib "Saqlash"** — ma'lumotni yangilaydi.
- **Rolni o'zgartirish** — xodimning huquqlarini o'zgartiradi.
- **Ruxsatlarni tahrirlash** — aniq qaysi ishlarni qila olishini belgilaydi.
- **"Parolni tiklash"** — xodimga yangi parol o'rnatadi (tasdiqlash so'raladi).
- **"Faolsizlantirish"** — xodimni vaqtincha tizimdan chiqaradi
  (tasdiqlash so'raladi).
- **Faollik bo'limi** — xodimning oxirgi kirishlari, muvaffaqiyatli yoki
  muvaffaqiyatsiz urinishlari ko'rinadi.

### 8.4. Mening profilim

Har bir xodim o'zining shaxsiy profilini ko'ra oladi (boshqalarникini emas).

**Nima ko'rinadi:**
- **Profil** — login (o'zgartirib bo'lmaydi), to'liq ism (o'zgartiriladi),
  telefon (o'zgartiriladi), lavozim (faqat admin o'zgartiradi), hisob holati.
- **Login tarixi** — oxirgi 90 kun ichida tizimga kirishlar: muvaffaqiyatli,
  xato yoki bloklangan urinishlar, sana va IP manzil bilan.
- **Mening ruxsatlarim** — nechta ruxsatga ega ekani (to'liq ro'yxatni
  administrator ko'rsatadi).

**Tugmalar va natijalar:**
- **"Saqlash"** — ism va telefon o'zgarishini saqlaydi.
- **"Bekor qilish"** — kiritilgan o'zgarishlarni qaytaradi.

> **Eslatma:** Xodim o'z parolini bu yerda o'zgartira olmaydi — parolni
> faqat administrator tiklaydi (xavfsizlik qarori).

### 8.5. Rollar

Rol — bu huquqlar to'plami. Masalan, "Sanovchi" roli faqat sanab kiritish
huquqini beradi, "Administrator" roli esa hamma narsaga ruxsat beradi.

**Nima ko'rinadi:**
- Rollar ro'yxati — nomi, tavsifi, nechta xodimda borligi.

**Tugmalar va natijalar:**
- **"Yangi rol yaratish"** — alohida sahifa ochadi: rol nomi, tavsifi va
  huquqlarni katakchalardan belgilab yangi rol yaratiladi.
- **"Tahrirlash"** — rolning huquqlarini o'zgartirish sahifasini ochadi.
- **"O'chirish"** — rolni o'chiradi. Bosilganda tasdiqlash oynasi chiqadi.

---

## 9. Sozlamalar bo'limi

Ikki qismdan iborat: **Shaxsiy sozlamalar** va **Tizim sozlamalari (admin)**.

### 9.1. Shaxsiy sozlamalar

**Nima ko'rinadi:**
- Hisob ma'lumotlari — login, rol, qachon yaratilgani, parol qachon
  o'zgartirilgani.
- Parolni o'zgartirish maydoni.

**Tugmalar:**
- **"Saqlash"** — yangi parolni o'rnatadi (kamida 8 ta belgi, harf+raqam
  aralash bo'lishi kerak).

### 9.2. Tizim sozlamalari (administrator uchun)

To'rt bo'limdan iborat:

**A) Farq chegaralari (variance):**
Yashil/sariq/qizil holatlar qaysi chegaradan boshlanishini belgilaydi.
Masalan, "5% gacha farq — yashil, 5-15% — sariq, 15% dan yuqori — qizil".
Boshqaruvchi bu raqamlarni o'zgartirib, tizim qanchalik qattiq tekshirishini
sozlaydi.

**B) Sabab kodlari:**
Tasdiqlash/rad etishda chiqadigan sabablar ro'yxati (masalan: "O'g'irlik",
"Buzilgan", "Sanab xato qilingan").
- **"Yangi sabab kodi" tugmasi** — yon panel (sheet) ochadi, yangi sabab
  yoziladi.
- **Tahrirlash belgisi** — mavjud sababni o'zgartirish panelini ochadi.
- **O'chirish belgisi** — sababni o'chiradi. Bosilganda tasdiqlash oynasi
  chiqadi.

**C) Audit jurnali:**
Tizimda kim, qachon, qanday amal qilganining to'liq tarixi. Kim qaysi
sanashni o'chirgani, kim qaysi xodimni qo'shgani — hammasi yozilib boradi.
Bu — xavfsizlik va nazorat uchun.
- **Filtrlash:** sana oralig'i va obyekt turi bo'yicha (Xodim, Rol,
  Inventerizatsiya, Sabab kodi, Sozlama, Buyurtma, Kontragent, Mahsulot).
  Kerakli turni tanlab, faqat o'sha bo'yicha tarixни ko'rish mumkin.

**D) REGOS bilan sinxronlash:**
REGOS tizimidan ma'lumotni yangilab olish.

**Tugmalar va natijalar:**
- **"Kontragentlar"** — yetkazib beruvchilar ro'yxatini REGOS'dan yangilaydi.
- **"Mahsulotlar"** — tovarlar ro'yxati va qoldiqlarni yangilaydi.
- **"Xaridlar"** — so'nggi xaridlar tarixini oladi.
- **"Sotuvlar"** — so'nggi sotuvlar tarixini oladi.
- **"Hammasi"** — yuqoridagilarning hammasini ketma-ket yangilaydi.

Har bir sinxronlash davomida holat ko'rinadi (qancha yangilandi, qancha
vaqt ketdi, xato bo'ldimi). Bu — tizimdagi ma'lumot har doim REGOS bilan
mos turishini ta'minlaydi.

---

## 10. Rollar va ruxsatlar — umumiy tushuncha

Tizim **rolga asoslangan** — ya'ni har bir xodim o'z roli doirasidagina
ish qila oladi. Bu quyidagilarni ta'minlaydi:

- **Sanovchi** faqat sanab kiritadi, hisobotni yoki pul summasini
  ko'rmaydi.
- **Boshliq** sanashlarni tasdiqlaydi va hisobotni ko'radi.
- **Administrator** xodimlarni boshqaradi, tizimni sozlaydi.
- **Egasi** hamma narsani ko'radi va boshqaradi.

Agar xodimda biror ishga ruxsat bo'lmasa, o'sha tugma yoki bo'lim unga
umuman ko'rinmaydi. Bu — chalkashlikni va xatolarni oldini oladi.

---

## 11. REGOS integratsiyasi — nima uchun kerak

REGOS — korxonaning asosiy savdo dasturi. Bizning tizim u bilan doimiy
ma'lumot almashadi:

- **Mol qoldig'i** — REGOS'da nechta mol borligi. Sanashda biz haqiqiy
  miqdorni shu raqam bilan solishtiramiz.
- **Narxlar** — sotuv va xarid narxlari REGOS'dan olinadi. Pul hisobi
  shularga asoslanadi.
- **Savdo tarixi** — qaysi mol kim tomonidan, qancha sotilgani. Bu
  kontragent tahlili va mahsulot statistikasi uchun ishlatiladi.

Sanab kiritish paytida tizim REGOS'dan **jonli** (real vaqtda) qoldiqni
oladi — shuning uchun sanovchi har doim eng so'nggi raqam bilan
solishtiradi. Agar REGOS vaqtincha ulanmagan bo'lsa, tizim oxirgi
saqlangan raqamdan foydalanadi va buni ogohlantirib turadi.

---

## 12. Umumiy ish jarayoni (qisqacha xulosa)

Tizimning kundalik ishlatilishi taxminan shunday:

1. **Ertalab** — administrator REGOS bilan sinxronlash qiladi (ma'lumot
   yangilanadi).
2. **Kun davomida** — omborchilar "Sanab kiritish" bo'limida mahsulotlarni
   sanab, kam/ko'pini kiritadi.
3. **Sariq/qizil farqlar** — boshliqning "Tasdiqlash" bo'limiga tushadi,
   u sabab bilan qabul qiladi yoki rad etadi.
4. **Oxirida** — "Hisobot" bo'limida umumiy pul hisobi ko'riladi: qancha
   yo'qotildi, qancha ortiqcha topildi, sof natija qancha. Kerak bo'lsa
   Excel/PDF chiqariladi.
5. **Yangi davr** — "Reset" bilan eski sanashlar tozalanadi va jarayon
   qaytadan boshlanadi.

Parallel ravishda **Kontragentlar, Mahsulotlar va Buyurtmalar** bo'limlari
xarid ishini boshqaradi: qaysi yetkazib beruvchidan nima olish kerakligini
tahlil qilib, tayyor buyurtma (Excel) shakllantiriladi.

---

---

## 13. Eski havolalar haqida

Tizim takomillashtirilgani sababli ba'zi bo'limlar bir joydan ikkinchi
joyga ko'chirildi. Eski havolalar hali ham ishlaydi — ular avtomatik yangi
joyga yo'naltiradi:

- Eski "Cycle counting" (ABC sanash) → endi "Sanab kiritish" ichida.
- Eski alohida "Audit", "Sabab kodlari", "Sinxronlash" sahifalari → endi
  "Sozlamalar → Tizim sozlamalari" ichidagi bo'limlarda (tab).
- Eski alohida "Rollar" sahifasi → endi "Xodimlar" ichidagi "Rollar" bo'limida.

Bu — eski yorliq yoki havolani bosganlar uchun chalkashlik bo'lmasligi
uchun qilingan.

---

*Ushbu qo'llanma tizimning barcha bo'limlari, sahifalari, oynalari va
tugmalarini qamrab oladi. Har qanday yangi xodim buni o'qib, tizim qanday
ishlashini to'liq tushunishi mumkin.*

**Tekshiruv:** Hujjat loyihadagi barcha 24 ta sahifa (page) va barcha
tasdiqlash/tahrirlash oynalari bilan birma-bir solishtirib chiqildi.
Hech bir bo'lim, sahifa yoki muhim tugma qoldirilmadi.
