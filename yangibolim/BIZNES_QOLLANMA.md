# Tizim Qo'llanmasi — Biznes Tushuncha

> **Maqsad:** Bu hujjat **MoySklad ↔ Telegram integratsiya tizimini** texnik bo'lmagan tilda tushuntiradi. Tizim nima qiladi, foydalanuvchi nima ko'radi, har bir tugma nimaga xizmat qiladi, jarayonlar ortida qanday mantiq ishlaydi va qismlar bir-biri bilan qanday bog'lanadi.
>
> Texnik tafsilotlar (kod, ma'lumotlar bazasi nomlari, server konfiguratsiyasi) **alohida hujjatda** — bu yerda biznes-mantiqqa diqqat.

---

## MUNDARIJA

1. [Tizimning umumiy ma'nosi](#1-tizimning-umumiy-manosi)
2. [Foydalanuvchi turlari va ularning kirish darajasi](#2-foydalanuvchi-turlari-va-ularning-kirish-darajasi)
3. [Asosiy biznes oqimlar](#3-asosiy-biznes-oqimlar)
4. [Sahifalar va ularning vazifasi](#4-sahifalar-va-ularning-vazifasi)
5. [Vazifalar tizimi — to'rt ko'z prinsipi](#5-vazifalar-tizimi--tort-koz-prinsipi)
6. [Bonus va jarima qanday hisoblanadi](#6-bonus-va-jarima-qanday-hisoblanadi)
7. [Davomat va ish vaqti](#7-davomat-va-ish-vaqti)
8. [Oylik va KPI](#8-oylik-va-kpi)
9. [Sahifa va modullar o'rtasidagi bog'liqliklar](#9-sahifa-va-modullar-ortasidagi-boglarliqliklar)
10. [Avtomat ishlaydigan jarayonlar](#10-avtomat-ishlaydigan-jarayonlar)
11. [Ma'lumotlar himoyasi va kirish nazorati](#11-malumotlar-himoyasi-va-kirish-nazorati)

---

## 1. TIZIMNING UMUMIY MA'NOSI

### Tizim nima qiladi

Tizim **uchta katta vazifani** bir joyda hal qiladi:

**Birinchi — mijozlar bilan aloqa:** Do'kondan har bir savdo, to'lov yoki buyurtma qilinganda, mijozning Telegram'iga avtomat tarzda xabar boradi. Xabarda nima sotib olganligi, qancha to'laganligi, hozirgi qarzi bormi-yo'qmi va elektron chek havolasi bo'ladi. Mijoz hech kim qo'l bilan yozib bermaydi — tizim o'zi avtomat ishlaydi.

**Ikkinchi — xodimlar boshqaruvi:** Boshliq xodimlarga vazifa beradi (masalan, "Kassani yopdingmi?" har kuni soat 21:00 da). Vazifa Telegram'da xodimga keladi. Xodim "Ha" yoki "Yo'q" deb javob beradi. Tekshiruvchi (boshqa odam) bu javobni tasdiqlaydi yoki rad qiladi. Vazifa bajarilsa — bonus, bajarilmasa — jarima avtomat hisoblanadi.

**Uchinchi — oylik hisobi:** Har xodim uchun asosiy oylik, sotuv ulushi (KPI), bonuslar va jarimalar avtomat yig'iladi. Oy oxirida boshliq tugmani bossa, har xodim qancha olishi kerakligi tayyor jadval ko'rinishida chiqadi.

### Nima uchun bu tizim qurilgan

Avval do'konda har savdoni qo'l bilan yozib, mijozga qo'ng'iroq qilib aytish kerak edi. Xodimlarga topshiriqlarni og'zaki berish, kim bajardi-kim bajarmadini eslab qolish — boshliq vaqtini behuda yo'qotardi. Oylik hisoblash oxirida har xodimning vazifalari, bonuslari, jarimalari qog'ozlardan yig'ilar va xato tez-tez bo'lardi.

Bu tizim shu uchta katta vaqt yo'qotuvchi ishni avtomatlashtirdi:
- **Aloqa** — savdo bo'lishi bilan mijozga Telegram'da bildirishnoma o'zi keladi
- **Nazorat** — vazifa Telegram'da yuboriladi va javob avtomat yig'iladi
- **Hisob-kitob** — har xodim uchun real vaqtda jami summa ko'rinib turadi

### Tizim qaysi platformada ishlaydi

Tizim **internet brauzeri orqali** ishlaydi — Chrome, Firefox, Edge — har qanday qurilmada (kompyuter, planshet, telefon). Hech narsa o'rnatish kerak emas. Manzil — `moy.biznesjon.uz`. Foydalanuvchi nomini va parolini kiritib kirsa, kerakli sahifalarini ko'radi.

Xodimlar uchun ishning ko'p qismi **Telegram orqali** ham ishlaydi — vazifa Telegram'da keladi, javobni Telegram'dan beradi, bonus xabari Telegram'da keladi. Brauzer'ga kirish faqat tarix ko'rish yoki batafsil ma'lumot uchun kerak.

---

## 2. FOYDALANUVCHI TURLARI VA ULARNING KIRISH DARAJASI

Tizimda uch xil foydalanuvchi bor, har biriga turli sahifalar va imkoniyatlar ko'rinadi.

### Bosh boshliq (admin)

Tizimning to'liq egasi. U kirsa **chap menyuda hamma narsa ko'rinadi**: bosh sahifa (hisobotlar bilan), Telegram xabarlar tarixi, hisobotlar, xodimlar, vazifalar, davomat, oylik va sozlamalar. Boshliq:
- Yangi xodim qo'shadi yoki o'chiradi
- Har xodimga nima ko'rsatilishi va nima qilishi mumkinligini sozlaydi
- Vazifa shablonlarini yaratadi (kim qachon nima qilishi kerak)
- Tekshiruvchilarni belgilaydi
- Bonus va jarima qoidalarini yozadi
- MoySklad'ga ulanish ma'lumotlarini va Telegram akkauntlarni boshqaradi
- Barcha xabar tarixini ko'radi

### Oddiy xodim

U kirsa **menyu juda qisqa** — faqat o'ziga tegishli ikkita bo'lim:
- **Mening vazifalarim** — unga yuborilgan vazifalar ro'yxati. U yerda javob berishi mumkin (lekin asosan Telegram'dan javob beradi)
- **Davomat** — o'zining kelish-ketish vaqtlari

Boshqa xodimlar haqida hech nima ko'ra olmaydi. Boshqa xodimlarning oyligi, vazifalari, kontragentlari undan yashirin.

### Tekshiruvchi xodim

Bu maxsus belgilangan xodim. Boshliq uni xodimlar bo'limidagi sozlamada "tekshiruvchi" deb belgilab qo'yadi. Shunda u kirsa, **odatdagi xodim menyusiga qo'shimcha "Tekshiruv" bo'limi paydo bo'ladi**. Bu yerda u boshqa xodimlar bajardim deb topshirgan vazifalarni ko'radi va ularni tasdiqlash yoki rad qilish huquqiga ega.

Misol: Bekzod tekshiruvchi. Kamoliddin "Kassani yopdim" deb topshirsa, vazifa avtomat Bekzodning "Tekshiruv" bo'limiga keladi. Bekzod ko'radi, agar haqiqatan bajarilgan bo'lsa "Tasdiqlayman" tugmasini bosadi — Kamoliddinga bonus avtomat yoziladi. Agar yaxshi bajarmagan bo'lsa "Rad qilaman" tugmasini bosadi — jarima avtomat yoziladi.

### Kirish darajalari

Boshliq har xodim uchun alohida sozlash mumkin: qaysi sahifalarni ko'rishi mumkin va u sahifada nima qilishi mumkin (faqat ko'rish, to'liq ish, yoki faqat o'ziga tegishlilarini ko'rish). Masalan, biror xodimni shunday sozlash mumkin: "Hisobotlarni ko'r, lekin xodimlarni ko'rmasin, vazifalarini ham faqat o'ziniki ko'rsin".

---

## 3. ASOSIY BIZNES OQIMLAR

Tizim har kuni bir nechta avtomat oqimlarni amalga oshiradi. Bularning ko'pchiligi foydalanuvchi ko'zidan yashirin tarzda fonda ishlaydi.

### Birinchi oqim — savdo va xabar yuborish

Do'konda kassa orqali biror narsa sotilganda yoki to'lov qabul qilinganda yoki yangi buyurtma qilinganda, MoySklad ERP tizimida shu hujjat yaratiladi. Tizim har yarim daqiqada (sozlanadigan vaqt) MoySklad'dan yangi hujjatlarni so'rab oladi. Yangi hujjat topilsa, mijozni topadi, uning telefon raqami bo'yicha Telegram'da uni qidiradi va avtomat tarzda chiroyli xabar yuboradi. Xabarda:
- Salomlashish va do'kon nomi
- Sotilgan tovarlar yoki to'lov ma'lumoti
- Sana, summa, hujjat raqami
- Hozirgi qarz yoki avans summasi
- Elektron chek havolasi (bossa printerda chiqarish mumkin chek)
- Do'kon aloqa raqami

Xabar yuborilgandan keyin tizim uni "Xabarlar tarixi" sahifasiga yozib qo'yadi — boshliq qachon kim nima oldi va xabar yetib bordimi-yo'qmi ko'rishi mumkin.

### Ikkinchi oqim — vazifa va javob

Boshliq vazifa shabloni yaratadi: "Kassani yopdingmi?" — har kuni soat 21:00 da kassirga yuborilsin. Belgilangan vaqtda tizim avtomat tarzda Telegram'ga xabar yuboradi. Kassir Telegram'da "Ha" tugmasini bosadi. Agar shu vazifaga tekshiruvchi belgilangan bo'lsa, vazifa "Tasdiq kutmoqda" holatiga o'tadi va tekshiruvchining brauzeridagi Tekshiruv bo'limiga keladi. Tekshiruvchi tasdiqlasa — bonus avtomat hisoblanadi. Rad qilsa — jarima.

Agar tekshiruvchi belgilanmagan bo'lsa, kassirning "Ha" javobi to'g'ridan-to'g'ri qabul qilinadi va bonus darhol yoziladi.

Agar kassir belgilangan vaqtda javob bermasa va vazifaga muddat qo'yilgan bo'lsa (masalan, 1 soat ichida javob berish kerak), muddat tugagandan keyin tizim avtomat ravishda vazifani "bajarilmadi" deb belgilaydi va jarimani avtomat yozadi. Boshliq Telegram'da bu haqda alohida bildirishnoma oladi.

### Uchinchi oqim — bonus va jarima yig'ilishi

Vazifa bajarilganda yoki bajarilmaganda yoki tekshiruvchi qaror qabul qilganda, tizim avtomat ravishda bonus yoki jarima yozadi. Bu yozuvlar **xodimga tegishli alohida ro'yxatda** yig'iladi. Boshliq oylik sahifasiga kirsa, har xodim uchun:
- Asosiy oylik
- Yig'ilgan bonus (yashil rang)
- Yig'ilgan jarima (qizil rang)
- Bugungi o'zgarish
- Jami to'lanadigan summa

ko'radi. Bonus yoki jarima raqamining ustiga bossa, alohida modal ochiladi va o'sha xodimning shu davrda olgan har bir bonusi va jarimasi alohida ko'rinadi: qaysi vazifa uchun, qancha summa, qachon, qoldirgan izoh — barchasi.

### To'rtinchi oqim — KPI va sotuv ulushi

Bir xil maoshda ishlash xodimga rag'bat bermaydi. Shuning uchun tizimda KPI tizimi bor. Boshliq har xodim uchun:
- Oylik sotuv rejasi (masalan, 50 million so'm)
- Reja bajarilsa qancha qo'shimcha to'lanishini (masalan, 80% bajarilsa, qo'shimcha 4 million)
- Sotuv ulushi (masalan, har sotuvdan 0.5 foiz)

belgilab qo'yadi. Tizim har kuni kechqurun MoySklad'dan ushbu xodim qancha sotgani haqida ma'lumot oladi va avtomat hisoblaydi: rejaning necha foizi bajarildi, qancha pul to'lanishi kerak. Bu summa avtomat oylikka qo'shiladi.

### Beshinchi oqim — davomat

Xodim ishga kelganda, boshliq yoki o'zi (agar huquqi bo'lsa) Davomat sahifasidan "Kelishni belgilash" tugmasini bosadi va xodimni tanlaydi. Tizim avtomat tarzda hozirgi vaqtni saqlaydi va boshliqning Telegram'iga xabar yuboradi: "Kamoliddin ishga keldi soat 09:15 da". Ish kuni oxirida "Ketishni belgilash" tugmasi bosiladi va ketish vaqti yoziladi. Tizim ishlagan vaqtni avtomat hisoblaydi (masalan, 9 soat 15 daqiqa).

Agar vaqt noto'g'ri belgilangan bo'lsa, boshliq qalam tugmasini bosib tahrirlash modaliga kirib, vaqtni qo'lda tuzatishi yoki yozuvni butunlay o'chirishi mumkin.

---

## 4. SAHIFALAR VA ULARNING VAZIFASI

### Kirish sahifasi

Tizimga kirish uchun foydalanuvchi nomi va parolni kiritish so'raladi. Parolni ko'rish uchun ko'z belgisi bor. Agar noto'g'ri kiritilsa, qizil rangda xato xabari chiqadi. To'g'ri kiritilsa, kim ekanligiga qarab tizim sizni avtomat kerakli sahifaga yuboradi: boshliq bo'lsang bosh sahifa (hisobotlar bilan), oddiy xodim bo'lsang o'z vazifalaring sahifasiga.

### Bosh sahifa (Dashboard)

Boshliq kirsa darrov ko'rgan birinchi sahifa. Bu yerda **to'rtta katta karta** bor:
- Jami mijozlar soni va nechtasi Telegram'ga ulangan
- Bugun yuborilgan xabarlar
- Muvaffaqiyatsiz xabarlar (yetib bormagan)
- Telegram'ga ulangan mijozlar foizi

Pastda **chiziqli grafik** — oxirgi 7 kunda har kuni nechta xabar yuborilganini ko'rsatadi (savdo, to'lov, buyurtma alohida ranglar bilan).

Eng pastida **so'nggi 5 ta xabar** — kim qaysi tur xabar oldi, holati qanday, qachon yuborilgan. Boshliq darhol ko'rib qoladi: "Ha, hammasi yuborildi" yoki "Bir necha xabar yetmagan, sabab nima ekan?"

Sahifa har 30 soniyada o'zi yangilanadi.

### Xabarlar tarixi

Bu yerda **Telegram orqali yuborilgan barcha xabarlar** ro'yxat bo'lib chiqadi (5000 dan ortiq yozuv bo'lishi mumkin). Har qator: kim oldi, qaysi tur (savdo/to'lov/buyurtma/qaytarish), xabar matni qisqacha, status (yuborildi/xato/navbatda), vaqt.

**Filterlar har ustun ustida** — "Mijoz" tugmasini bosa olishingiz mumkin va dropdown ochiladi. U yerda barcha mijozlar ro'yxati va har biri yonida nechta xabar borligi ko'rinadi. Qidiruv maydoni ham bor — mijoz ismini yozsangiz, faqat shu ism bo'yicha filter bo'ladi. Xuddi shunday "Tur" va "Status" ham filterlanadi.

Filter qo'llanganda yuqorida "5 ta natija topildi" deb yozadi va qanday filterlar qo'yilganligi rangli yorliqlar bilan ko'rsatiladi (har birini X bilan o'chirish mumkin).

**Mijoz qatorini bosgan sahifaning o'ng tomonidan slayd-panel chiqadi** — bu mijoz bilan butun Telegram suhbat tarixi (oxirgi 40 ta xabar) ko'rinadi. Pastda yangi xabar yozish maydoni — admin to'g'ridan-to'g'ri shu yerdan mijozga xabar yuborishi mumkin.

Xabar yuborilmagan bo'lsa (qizil "Xato"), qator yonida qayta yuborish tugmasi bor — bossa tizim xabarni navbatga qo'shadi va yana urinib ko'radi.

Sahifa har 15 soniyada o'zi avtomat yangilanadi.

### Hisobotlar

Sotuv aktivligi statistikasi. To'rtta karta yuqorida (mijozlar, ulangan, bugungi xabarlar, xatoliklar), keyin **diagrammalar**:
- Vaqt tanlash tugmalari (7 kun / 14 kun / 30 kun)
- Asosiy diagramma — kun bo'yicha xabarlar (savdo/to'lov/buyurtma uch xil rang)
- Top mijozlar — eng ko'p xabar yuborilgan 5 mijoz, har biriga progress chiziq va aylana diagramma

Bu sahifa boshliqqa "ish qanday ketyapti" degan savolga bir qarashda javob beradi.

### Xodimlar

Bu yerda **barcha xodimlarning ro'yxati** jadval shaklida. Har qator: ism, telefon, rol (kassir/omborchi/admin), Telegram raqami, bo'lim, harakat tugmalari.

Yuqorida **qidiruv maydoni** va **rol bo'yicha filter** dropdown.

**"Yangi xodim qo'shish" tugmasi** — bossa modal ochiladi. Modalda kiritiladi: ism (majburiy), telefon, Telegram raqami (xabarlar shu raqamga yuboriladi), rol (dropdown), bo'lim, **"Tekshiruvchi" belgisi** (agar yoqilgan bo'lsa, bu xodim boshqa vazifalarni tasdiqlash huquqiga ega bo'ladi). Saqlash tugmasini bosgach, xodim ro'yxatga qo'shiladi.

Har qatorda uchta tugma:
- **Kalit tugma** — login va parol o'rnatish (xodim brauzerdan kira olishi uchun)
- **Qalam tugma** — ma'lumotlarni tahrirlash
- **Qizil tugma** — xodimni nofaol qilish (haqiqiy o'chirib tashlanmaydi, faqat ko'rinmaydi)

**Xodim huquqlarini sozlash** alohida bo'limda. Har xodim uchun qaysi sahifalarni ko'rishini va qanchalik (faqat ko'rish/to'liq ish/faqat o'ziniki) sozlash mumkin.

Boshliq yangi rol qo'shishi mumkin (masalan, "haydovchi", "menejer") — default 4 ta rol bor (admin/kassir/omborchi/xodim), ammo qo'shimcha qo'shish mumkin.

### Vazifalar

Bu sahifa **ikki tabga bo'lingan**: "Vazifa shablonlari" va "Vazifa tarixi".

**Vazifa shablonlari tabi** — boshliq vazifa qoidalarini yaratadigan joy. Yangi shablon qo'shish modali juda batafsil:

- **Sarlavha** — vazifa nomi (masalan, "Kassani yopdingmi?")
- **Tavsif** — qisqacha tushuntirish
- **Aniq xodim YOKI rol bo'yicha** — bittadan tanlanadi (xodim tanlasa, faqat shu kishi oladi; rol tanlasa, shu rol egalari hammasi oladi). Yangi rol yoki bo'lim qo'shish ham shu modal ichida amalga oshiriladi
- **Muhimlik darajasi** — Oddiy / O'rta / Muhim / Shoshilinch (har biri o'z rangi bilan)
- **Yuborish turi** — uchta variant:
  - **Qo'lda** — boshliq tugmani bosa yuboriladi
  - **Vaqt bo'yicha** — belgilangan vaqtda avtomat yuboriladi (har kuni / haftaning ma'lum kunlari / oyning ma'lum sanasida)
  - **Hodisa bo'yicha** — MoySklad'da ma'lum hodisa sodir bo'lganda (yangi sotuv, katta sotuv, omborga tovar kelishi va h.k.)
- **Javob turi** — uch variant:
  - **Javob kerak emas** — faqat ma'lumot
  - **Ha/Yo'q** — ikki tugmali javob
  - **Matnli javob** — xodim matn yozadi
- **Muddat (daqiqa)** — qancha vaqt ichida javob berilishi kerak. Tezkor tanlovlar (30 daqiqa, 1 soat, 2 soat, 4 soat, 8 soat) yoki o'zgarishi mumkin
- **Mukofot summasi** — yashil rang, bajarilsa qancha bonus yoziladi
- **Jarima summasi** — qizil rang, bajarilmasa qancha jarima yoziladi
- **Tekshiruvchi** — alohida ko'k blok. Bu yerda dropdown — faqat "tekshiruvchi" belgili xodimlar ro'yxati. Tanlasa, bu vazifa bajarildi degan javob avtomat tasdiqlanmaydi, balki shu odamning qarorini kutadi
- **Oldingi vazifa (zanjir)** — ixtiyoriy. Agar bu vazifa boshqa vazifa bajarilgandan keyin avtomat yuborilishi kerak bo'lsa, shu yerda tanlanadi
- **Faollik** — yoqilgan/o'chirilgan toggle

Saqlanganda agar "Vaqt bo'yicha" turi bo'lsa, tizim shu shablonni o'zining ichki kalendariga yozib qo'yadi va belgilangan vaqtlarda avtomat ishga tushiradi.

Yuqorida **filter ustunlari** — sarlavha bo'yicha, bo'lim bo'yicha, tekshiruvchi bo'yicha, yuborish turi bo'yicha, vaqt bo'yicha, muhimlik bo'yicha, faollik bo'yicha. Har filter dropdown'i ichida qidiruv qutisi va variant yonida nechta shablon borligi ko'rsatiladi.

Har qator yonida tugmalar: yuborish (hozir yuboriladi), tahrirlash, o'chirish.

**Vazifa tarixi tabi** — barcha yuborilgan vazifalar va ularning natijalari. Bu yerda:

- Yuqorida qidiruv qutisi (javob matnida qidirish), vaqt oraliq tanlovi (qaysi sanadan-qaysi sanagacha)
- Jadvalning chap ustunida vizual belgi: agar vazifaga tekshiruvchi belgilangan bo'lsa va u tasdiqlagan bo'lsa — yashil belgi, rad qilgan bo'lsa — qizil belgi, hali qaror qilmagan bo'lsa — ko'k aylanma. Tekshiruvchi belgilanmagan vazifalarda chap ustun bo'sh
- Vazifa nomi, xodim ismi, holat (yuborildi/javob berildi/tasdiq kutmoqda/ha/yo'q), javob matni (to'liq, kichik shriftda lekin to'liq ko'rinadi), vaqt
- Agar boshliq yoki tekshiruvchi sifatida ko'rsangiz, "tasdiq kutmoqda" qatorlarida darhol tasdiqlash va rad qilish tugmalari ko'rinadi (alohida sahifaga o'tmasdan)
- Pastda sahifalar — birinchi sahifa, oldingi, hozirgi sahifa raqami, keyingi, oxirgi sahifa

Vazifalar real vaqtda yangilanib turadi — xodim Telegram'dan javob bersa, sahifani yangilamasdan ham javob darhol ko'rinadi.

### Tekshiruv

Bu sahifa **faqat tekshiruvchi xodimlarga va boshliqqa** ko'rinadi. U yerda **tasdiqlash kutayotgan vazifalar** ro'yxati: "Bekzod tasdiqlashingiz kerak" yoki "Sardor sizdan kutmoqda" kabi.

Har vazifa karta shaklida ko'rinadi: vazifa nomi, kim bajardi, qachon, javob matni, va ikki katta tugma:
- **Tasdiqlayman** (yashil)
- **Rad qilaman** (qizil)

Tugmani bosgach modal ochiladi. Ixtiyoriy izoh yozish maydoni bor — tekshiruvchi xohlasa qo'shimcha izoh qoldira oladi (yoki bo'sh qoldiradi). "Tasdiqlash" yoki "Rad qilish" tugmasini bosgach, vazifa shu joydan yo'qoladi (tasdiqlandi yoki rad etildi) va xodimga avtomat Telegram'da bildirishnoma boradi: "Vazifangiz tasdiqlandi" + bonus summasi yoki "Vazifangiz rad etildi" + jarima sababi.

Sahifa real vaqtda yangilanadi — yangi tasdiq kutayotgan vazifa kelsa, darhol ko'rinadi va kichik ovoz bildirishnomasi chiqadi.

### Mening vazifalarim

Bu sahifa **oddiy xodimlar uchun**. U yerda faqat o'ziga yuborilgan vazifalar ro'yxati. Ikki tab: "Yangi" (faqat hali javob bermagan) va "Barchasi" (tarix bilan).

Har vazifa karta shaklida — vazifa nomi, holat, xabar matni, yuborilgan vaqt, agar muddat qo'yilgan bo'lsa **qolgan vaqt taymeri** (yashil rang, agar 10 daqiqadan kam qolsa qizil va miltillaydigan).

Javob berish tugmasini bossa, javob modali chiqadi. Telefon ekranida pastdan ko'tariladigan oyna shaklida (mobile uchun qulay), kompyuterda esa o'rtada modal. Javob tipiga qarab:
- Ha/Yo'q tugmalari — agar "Yo'q" deb bossa, "Sababini yozing" maydoni paydo bo'ladi
- Matnli — katta matn maydoni
- Faqat ma'lumot — "Bu vazifa javob talab qilmaydi" deb yozadi

Yuborilgach toast bildirishnoma chiqadi.

### Davomat

Sahifa **ikki tabga bo'lingan**: "Bugungi" va "Hisobot".

**Bugungi tabi** — bugun ishga kelgan xodimlar jadvali. Har qator: ism, kelish vaqti (yashil soat belgisi bilan), ketish vaqti (qizil soat belgisi yoki "—" agar hali ketmagan), holat (yashil "Ishda" yoki kulrang "Ketdi"), harakat tugmalari.

Yuqorida **"Kelishni belgilash" tugmasi** — bossa modal ochiladi va xodim tanlanadi (faqat hali bugun belgilanmagan xodimlar ko'rinadi). "Belgilash" tugmasini bosgach, xodimning ismi va hozirgi vaqt yoziladi va boshliqqa Telegram orqali xabar yuboriladi: "Kamoliddin ishga keldi 09:15 da".

Har qatorda **"Ketishni belgilash" tugmasi** ham bor (faqat "Ishda" holatidagilar uchun). Bossa, hozirgi vaqt ketish vaqti sifatida yoziladi.

Va har qatorda **qalam tugmasi** — vaqtni qo'lda tahrirlash uchun. Modal ochiladi:
- Kelish vaqti — sana va vaqt tanlash maydoni
- Ketish vaqti — sana va vaqt tanlash maydoni yoki "Tozalash" tugmasi (bosa, ketish vaqti o'chiriladi va xodim "Ishda" holatiga qaytadi)
- O'chirish tugmasi — yozuvni butunlay o'chirish (agar noto'g'ri xodim belgilangan bo'lsa)

**Hisobot tabi** — sana oraliq filtri bilan davomat hisoboti. Boshlanish va tugash sanalari, xodim tanlash dropdown, "Qidirish" tugmasi. Pastda jadval — sana, xodim, kelish, ketish, ishlagan vaqt (avtomat hisoblanadi: "9 soat 15 daqiqa"), holat.

### Oylik

Tizimning eng katta sahifasi. **Oltita tabga bo'lingan**:

**1) Hisob-kitob tabi** — asosiy sahifa. Yuqorida vaqt oraliq tanlovi (Bugun / 30 kun / 60 kun / 90 kun). Beshta katta karta:
- Jami asosiy oylik
- Jami bonus (yashil)
- Jami jarima (qizil)
- Bugungi o'zgarish (sariq)
- Jami to'lov (qalin)

Pastda **xodimlar bo'yicha jadval** — har qator: xodim ismi, rol yorliqlari, asosiy oylik, bonus (yashil rang, **bossa modal ochiladi**), jarima (qizil rang, **bossa modal ochiladi**), bugungi, jami, harakat tugmalari (bonus qo'shish, jarima qo'shish, oylik o'zgartirish).

**Bonus yoki jarima raqamiga bossangiz** — alohida modal ochiladi. U yerda shu xodimning shu davrda olgan har bir bonusi/jarimasi alohida ko'rinadi:
- **Kun bo'yicha guruhlangan** ("3-may, dushanba" sarlavha bilan)
- Har yozuv: vazifa nomi, izoh, manba (qo'lda / qoida bo'yicha / vazifa bajarilgani uchun / vazifa vaqti tugagani uchun), vaqt, summa
- Yuqorida jami summa banner

Bu boshliqqa "nega bu xodimga 200 ming bonus yozilgan?" degan savolga aniq javob beradi.

**Bonus qo'shish tugmasini bossangiz** alohida modal ochiladi — bu xodim uchun mavjud bonus qoidalari ro'yxati ko'rinadi. Har qoidaga tekshirish belgisi (checkbox). Belgilanganlari shu kunga bonus sifatida yoziladi.

**Oylik o'zgartirish** — qalam tugmasi orqali xodimning asosiy oyligini o'zgartirish modali.

**2) Bonuslar tabi** — bonus qoidalarini boshqarish. Yangi qoida qo'shish modalida: vazifa nomi (masalan, "Rejani bajarish"), tavsif, summa, qaysi rolga taalluqli (yoki barchaga). Saqlanadigan qoidalar keyin Hisob-kitob tabidagi modal ichida tanlash uchun chiqadi.

**3) Jarimalar tabi** — bonusga o'xshash, lekin jarima qoidalari uchun (masalan, "Kechikib kelish" — 50 000 so'm).

**4) KPI tabi** — sotuv ulushi va reja. Xodim tanlanadi va uning sozlamalari ko'rinadi: shablon, oylik sotuv rejasi, kunlik maqsad, har kun MoySklad'dan qancha sotgan, reja necha foiz bajarildi, daraja (To'liq / Qisman / Bajarilmadi), KPI summasi. "Bugun hisoblash" tugmasi — qo'lda yangilash. Avtomat ravishda tizim har kuni soat 23:30 da hisoblaydi.

**5) Konfiguratsiya tabi** — har xodim uchun KPI sozlamalari yoziladi: shablon tanlash, asosiy oylik vaznoligi (foiz), KPI vaznoligi, bonus vaznoligi, oylik sotuv rejasi, KPI byudjeti, savdo komissiya foizi, daraja jadvali (necha foizdan boshlab qancha to'lanishi).

**6) Xulosa tabi** — to'liq oylik xulosasi jadval shaklida. Asosiy oylik + sotuv ulushi + KPI summasi + bonuslar - jarimalar = jami to'lov. Har xodim uchun bitta qator. Boshliq oy oxirida bu sahifaga kirib, har xodimga qancha to'lash kerakligini bir qarashda ko'radi.

### Sozlamalar

Bu sahifa **boshliqning maxsus konfiguratsiya joyi**. Bo'limlarga bo'lingan:

**MoySklad sozlamalari** — bu yerda MoySklad ERP'ga ulanish uchun maxsus token kiritiladi. Tokenni MoySklad sayti'dan olish kerak. Yana shu yerda ma'lumot olish chastotasi (har necha soniyada MoySklad'dan yangi hujjatlarni so'rab olish) va qaysi turdagi hujjatlar kuzatilishi (savdo cheklari, buyurtmalar, to'lovlar) belgilanadi.

**Kompaniya ma'lumotlari** — do'kon nomi va aloqa raqami. Bular har bir Telegram xabarining boshiga va oxiriga avtomat qo'shiladi. Mijoz xabarning kimdan kelganini biladi.

**Telegram sozlamalari** — bu eng murakkab bo'lim. Tizim **2 ta Telegram akkaunti** bilan ishlaydi (agar biri ish bermay qolsa, ikkinchisi ishlaydi). Har biri uchun:
- API ID va API Hash kiritiladi (Telegram saytidan olinadi)
- Telefon raqam kiritiladi
- "Telegram'ga ulanish" tugmasini bosish bilan tizim Telegram'dan SMS yoki ilovaga kod yuboradi
- Kelgan kod yoziladi va tasdiqlanadi
- Ulangan bo'lsa, foydalanuvchi ma'lumotlari yashil oynada ko'rinadi (ism, foydalanuvchi nomi, telefon)
- Test xabar yuborish funksiyasi — ulangan kontragent tanlanadi va matn yoziladi, "Yuborish" tugmasi bosilsa, shu kontragentga test xabar yuboriladi

Agar SMS kelmasa, **session string orqali ulanish** ham mumkin — alohida skriptdan olingan satr kiritilib, "Session String bilan ulanish" tugmasi bosiladi.

**Xabar shablonlari** — har xil hujjat turi uchun xabar matni shabloni. Joker so'zlar bor: hujjat raqami, sana, summa, mahsulotlar ro'yxati, mijoz nomi — shu so'zlar avtomat to'ldiriladi.

**Hujjat cheklari** — har MoySklad hujjati turi uchun qaysi chek shabloni ishlatilishi belgilanadi. Boshliq mavjud cheklarni tartibga solishi, yoqishi/o'chirishi mumkin.

**Custom rollar** — agar default 4 ta rol (admin/kassir/omborchi/xodim) yetmasa, qo'shimcha rol qo'shish mumkin (masalan, "haydovchi", "menejer", "muhandis").

---

## 5. VAZIFALAR TIZIMI — TO'RT KO'Z PRINSIPI

Vazifalar tizimi tizimning eng murakkab va eng muhim moduli. Uning asosini **to'rt ko'z prinsipi** tashkil etadi — ya'ni, **xodim o'zining ishini o'zi tasdiqlashi mumkin emas**, boshqa odam tasdiqlashi kerak. Bu firibgarlikning oldini oladi va sifatni nazorat qiladi.

### Vazifaning hayot davri

Boshliq vazifa shabloni yaratadi (masalan, "Kassani yopdingmi?") va belgilaydi: kassirga, har kuni 21:00 da, javob "Ha/Yo'q", muddat 30 daqiqa, mukofot 30 000, jarima 50 000, **tekshiruvchi — Bekzod**.

Soat 21:00 bo'lganda tizim avtomat ravishda Telegram'da kassirga xabar yuboradi: "📋 Kassani yopdingmi? Ha yoki Yo'q tugmasini bosing".

Kassir Telegram'da "Ha" tugmasini bosadi. Tizim shu javobni qabul qiladi va vazifaning holatini "Tasdiq kutmoqda" ga o'tkazadi. Mukofot hali yozilmaydi — chunki tekshiruvchi tasdiqlashi kerak.

Bekzod brauzeridagi Tekshiruv bo'limiga kirsa, vazifa u yerda ko'rinadi: "Kamoliddin Kassani yopdingmi?ga 'Ha' deb javob berdi. Tasdiqlaysizmi?" Bekzod bossa, ikki variant — "Tasdiqlayman" yoki "Rad qilaman" + ixtiyoriy izoh.

Agar Bekzod tasdiqlasa: vazifa "bajarildi" deb yopiladi. Kamoliddinga 30 000 so'm bonus avtomat yoziladi (oylik sahifasida ko'rinadi). Kamoliddinning Telegram'iga xabar boradi: "✅ Vazifa tasdiqlandi → Bonus 30 000 so'm. Tekshiruvchi: Bekzod".

Agar Bekzod rad qilsa: vazifa "bajarilmadi" deb yopiladi. 50 000 so'm jarima yoziladi. Kamoliddinga xabar: "❌ Vazifa rad etildi → Jarima 50 000 so'm. Sabab: ..." (Bekzodning izohi).

Agar Kamoliddin umuman javob bermasa va 30 daqiqa muddat tugaydi: tizim avtomat ravishda vazifani "muddat tugadi" deb yopadi va 50 000 jarima yoziladi. Boshliqqa va Kamoliddinga Telegram'da xabar yuboradi.

### Tekshiruvchisiz vazifa

Agar shabloning sozlamasida tekshiruvchi belgilanmagan bo'lsa, kassir "Ha" deb javob berishi bilan vazifa to'g'ridan-to'g'ri "bajarildi" deb yopiladi va bonus darhol yoziladi. Bu sodda vazifalar uchun — kim tekshirib o'tirmaydigan, ishonch bilan beriladigan vazifalar.

### "Yo'q" deb tan olish

Agar kassir o'zi tan olib "Yo'q" deb javob bersa (vazifani bajarmadi deb), tekshiruvchi kerak emas — to'g'ridan-to'g'ri jarima yoziladi. Mantiq oddiy: agar xodim o'zi rost gapirib "bajarmadim" desa, tekshirib o'tirishga hojat yo'q.

### Zanjirli vazifalar

Bir vazifa boshqa vazifa bajarilgandan keyin avtomat yuborilishi mumkin. Masalan, "Kassani yopdingmi?" vazifasi bajarilgandan keyin avtomat yangi vazifa yuboriladi: "Hisobotni omborchiga jo'natdingmi?". Bu zanjir orqali bog'lanadi. Boshliq qo'lda har birini yuborib o'tirishi shart emas — mantiqiy ketma-ketlik o'rnatilsa, tizim o'zi bajaradi.

### Vazifaning muhimligi

Har vazifaning muhimlik darajasi belgilanadi: oddiy, o'rta, muhim, shoshilinch. Bu tahliliy maqsadlar uchun — tarix sahifasida muhim vazifalar tezroq ko'zga tashlanadi va boshliq qaysi turdagi vazifalar ko'p marta bajarilmayotganini ko'radi.

### Vazifa tarixini tekshirish

Boshliq istalgan vaqtda vazifa tarixi sahifasiga kirib qaysi vazifa kim tomonidan, qanday natija bilan yopilganini ko'rishi mumkin. Filterlar yordamida masalan: "Bu hafta Kamoliddinga yuborilgan barcha vazifalardan qaysi biri rad etildi?" yoki "Tekshiruvchi Bekzod tomonidan rad etilgan vazifalar ro'yxati" — bunday savollarga bir necha tugma bosish bilan javob olinadi.

---

## 6. BONUS VA JARIMA QANDAY HISOBLANADI

Tizim bonus va jarima yozuvlarini **beshta turli manbalardan** yig'adi.

### Birinchi manba — qo'lda yozilgan

Boshliq oylik sahifasiga kirib qo'l bilan bonus yoki jarima yozadi. Masalan, "Kamoliddin yaxshi savdo qildi, 100 000 bonus" yoki "Bekzod kechikib keldi, 50 000 jarima". Bu yozuv "Qo'lda" deb belgilanadi.

### Ikkinchi manba — qoida bo'yicha yarim avtomat

Boshliq bonus va jarima qoidalarini oldindan yaratib qo'yadi. Masalan, "Rejani bajarish — 100 000 bonus" yoki "Kechikib kelish — 50 000 jarima". Keyin oylik sahifasidan har xodim uchun "qaysi qoidalar bugun bajarildi" degan tekshirish ro'yxatidan foydalanadi. Belgilangan qoidalar avtomat yoziladi. Bu yozuv "Qoida bo'yicha" deb belgilanadi.

### Uchinchi manba — vazifa bajarilgani uchun avtomat

Vazifa shabloni'da mukofot summasi belgilangan va xodim vazifani bajarsa (yoki tekshiruvchi tasdiqlasa), bonus avtomat yoziladi. Yozuv "Vazifa bajarilgani uchun" deb belgilanadi. Hech kim qo'l bilan yozish kerak emas.

### To'rtinchi manba — vazifa bajarilmagani uchun avtomat

Aksincha, vazifa bajarilmasa (xodim "Yo'q" deb javob bersa yoki tekshiruvchi rad qilsa), shablonda jarima summasi belgilangan bo'lsa, jarima avtomat yoziladi. "Vazifa bajarilmagani uchun" deb belgilanadi.

### Beshinchi manba — vazifa vaqti tugagani uchun avtomat

Vazifa muddat ichida javobsiz qolsa, tizim avtomat jarima yozadi. "Vazifa vaqti tugagani uchun" deb belgilanadi.

### Manbalar nima uchun ajratilgan

Boshliq oy oxirida har xodimning bonus va jarimalarini ko'rganda, qaysisi qo'lda yozilgan, qaysisi avtomat ekanligini darhol ajratadi. Bu shaffoflik beradi — agar xodim "nima uchun jarima oldim?" deb so'rasa, boshliq aniq aytadi: "Vazifa #123 vaqtida bajarmaganing uchun avtomat".

### Bonus/jarima qaerda ko'rinadi

Oylik sahifasida har xodim uchun jami bonus va jami jarima alohida ustunlarda yashil va qizil ranglarda ko'rinadi. Raqamning ustiga bossa, batafsil ro'yxat ochiladi va har bir yozuvning sababi, vaqti, summasi, manbasi alohida ko'rinadi. Boshliqqa hech narsa yashirin emas.

### Telegram orqali xabardor qilish

Bonus yoki jarima yozilgani vaqtda xodimga avtomat Telegram xabar boradi. U xabar qachon, qaysi vazifa uchun qancha bonus/jarima yozilganini biladi. Boshliqqa ham alohida kanal orqali xabar boradi — tizimda nima sodir bo'layotganini real vaqtda kuzatadi.

---

## 7. DAVOMAT VA ISH VAQTI

### Asosiy g'oya

Davomat — kim qachon ishga keldi va qachon ketdi degan ma'lumot. Tizim bu ma'lumotni saqlaydi va ishlagan vaqtni avtomat hisoblaydi.

### Belgilash usuli

Boshliq (yoki huquqi bo'lgan xodim) Davomat sahifasiga kirib "Kelishni belgilash" tugmasini bosadi va xodimni tanlaydi. Tizim hozirgi vaqtni saqlaydi va boshliqning Telegram'iga xabar yuboradi: "Kamoliddin ishga keldi 09:15 da". Kechqurun "Ketishni belgilash" tugmasini bosib, xuddi shunday ketish vaqti yoziladi.

### Vaqtning to'g'riligi

Tizim **Toshkent vaqt zonasida** ishlaydi. Hech qanday vaqt zonasi noto'g'ri ko'rinmaydi — agar xodim xorijda joylashgan bo'lsa ham, tizim doim Toshkent vaqtini ko'rsatadi.

### Xato bo'lganda

Agar boshliq xodimning ketish vaqtini noto'g'ri vaqtda belgilab qo'ysa (masalan, kechikib bossa), qalam tugmasi orqali tahrirlash mumkin. Modal ochiladi va vaqtlar qo'lda kiritiladi. Yoki "Tozalash" tugmasi orqali ketish vaqtini bekor qilib, xodimni "Ishda" holatiga qaytarish mumkin — keyin to'g'ri vaqtda yana belgilanadi.

Yozuvni butunlay o'chirish ham mumkin (agar noto'g'ri xodim belgilangan bo'lsa).

### Hisobot

Davomat sahifasining ikkinchi tabida sana oraliq hisobot bor. Boshliq "1-may dan 10-may gacha Kamoliddin qancha kun ishladi va har kun necha soat ishladi" degan savolga shu yerdan javob oladi. Jadvalda har kun, kelish vaqti, ketish vaqti, ishlagan davomiyligi (avtomat hisoblanadi: "9 soat 15 daqiqa") va holati ko'rinadi.

### Telegram bildirishnoma

Xodim ishga kelganini boshliq darhol biladi — Telegram'iga avtomat xabar boradi. Bu boshliq do'konda yo'q bo'lsa ham xodimlar qachon kelganini, soatma-soat ko'rib turishini ta'minlaydi.

---

## 8. OYLIK VA KPI

Oylik tizimi xodim oxiri-da nima olishini hisoblash uchun **uch turli komponentni** birlashtiradi: asosiy oylik, sotuv ulushi (KPI), bonus va jarima.

### Asosiy oylik

Har xodim uchun aniq oylik miqdori belgilangan bo'ladi (masalan, 5 000 000 so'm). Bu o'zgarmas asos. Agar xodim hech qanday vazifa bajarmasa va sotuv qilmasa ham, shu oylikni oladi.

### Sotuv ulushi (KPI)

Lekin xodim shunchaki ishlamasligi uchun, qo'shimcha rag'bat tizimi mavjud. Boshliq har xodim uchun:
- Oylik sotuv rejasi (masalan, oyiga 50 million so'm sotish)
- Reja bajarilsa qancha qo'shimcha pul (masalan, 4 million)
- Komissiya foizi (har sotuvdan 0.5%)

belgilab qo'yadi. Tizim har kuni avtomat ravishda MoySklad'dan ushbu xodim qancha sotgani haqida ma'lumot oladi.

Oy oxirida tizim hisoblaydi:
- **100% va undan ortiq sotgan** bo'lsa — to'liq qo'shimcha pul (masalan, 4 million)
- **90-99% sotgan** bo'lsa — qisman pul (masalan, 80%, ya'ni 3.2 million)
- **90%dan kam sotgan** bo'lsa — qo'shimcha pul yo'q

Bu **tier (daraja) sistemasi** — boshliq xohlasa, har turli darajalarni va to'lovlarni o'zi sozlay oladi.

### Bonus va jarima

Yuqorida tushuntirilgan beshta manbadan yig'iladigan summalar. Ular oyning oxirida jami bonus va jami jarima sifatida ko'rinadi va asosiy oylikka qo'shiladi/ayriladi.

### Yakuniy hisob

Oy oxirida har xodim uchun:
**Oylik = Asosiy oylik + Sotuv ulushi (KPI) + Yig'ilgan bonuslar - Yig'ilgan jarimalar**

Bu summa "Jami to'lov" ustunida ko'rinadi. Boshliq uni bir qarashda ko'radi va kassirga "Kamoliddinga 6 750 000 so'm bering" deb aytishi kifoya.

### Real vaqtda kuzatish

Boshliq oy davomida ham har xodimning hozirgi statusini ko'rib turadi: "Bugungacha qancha bonus yig'ildi", "Reja necha foiz bajarildi", "Bugungi o'zgarish qancha". Bu xodimning ishini real vaqtda nazorat qilish imkonini beradi — oy oxirida hayron qolish o'rniga, oy boshidan boshlab tendensiyani kuzatadi.

### KPI hisoblanish vaqti

Tizim har kuni soat 23:30 da avtomat ravishda KPI hisoblaydi. Boshliq uxlab yotganda ham hisob to'g'ri ishlab turadi. Agar boshliq tezroq ko'rmoqchi bo'lsa, "Bugun hisoblash" tugmasini bosib, qo'lda ham yangilatishi mumkin.

---

## 9. SAHIFA VA MODULLAR O'RTASIDAGI BOG'LIQLIKLAR

Tizimda hech qanday sahifa yoki modul yakka emas — hammasi bir-biri bilan bog'langan. Eng muhim bog'liqliklarni tushunish kerak, chunki bir joyda o'zgarish boshqa joyda o'z aksini topadi.

### Xodim va Telegram

Xodimning Telegram raqami yozilgan bo'lsa, vazifalar va davomat xabarlari shu raqamga yuboriladi. Agar Telegram raqami yozilmasa, xodim hech qanday avtomat xabar olmaydi. Boshliq uni qo'shganda doim Telegram raqamini ham kiritishi tavsiya etiladi.

### Tekshiruvchi belgisi va vazifa shabloni

Xodimning "tekshiruvchi" belgisi yoqilgan bo'lsa — u vazifa shabloni yaratganda dropdown'da ko'rinadi. Belgi yoqilmasa, dropdown'da ko'rinmaydi. Agar boshliq biror xodimni vazifa shablonlarining tekshiruvchisi sifatida tanlasa, lekin keyinroq u xodimning belgisini o'chirib qo'ysa, eski vazifa shablonlarida xodimning ismi qoladi (lekin yangi shablonlarda tanlash mumkin emas).

### Vazifa va bonus/jarima

Vazifa shabloni'da mukofot va jarima summasi yozilgan bo'lsa, vazifa natijasidan kelib chiqib avtomat bonus yoki jarima yoziladi. Bu yozuv keyin oylik sahifasida ko'rinadi va xodimning yakuniy oyligiga qo'shiladi/ayriladi. Agar shabloningda summalar yozilmagan bo'lsa, vazifa bajarilsa-bajarilmasa ham hech qanday bonus/jarima yozilmaydi (faqat tarixda saqlanadi).

### Xodim va MoySklad agent

KPI hisoblash uchun xodimni MoySklad'dagi tegishli agent (xodim yozuvi) bilan bog'lash kerak. Bog'lanmagan xodim uchun KPI hisoblanmaydi. Agar boshliq KPI ishlatmoqchi bo'lsa, har xodimning MoySklad agentini tanlashi shart.

### MoySklad va Telegram xabarlar

MoySklad'da yangi savdo, to'lov yoki buyurtma paydo bo'lsa, tizim avtomat ravishda mijozga Telegram xabar yuboradi. Bu jarayon to'liq avtomat — boshliq hech narsa qilmaydi. Faqat sozlamalarda MoySklad token to'g'ri kiritilgan bo'lishi va Telegram akkaunti ulangan bo'lishi kerak.

### Davomat va Telegram

Xodim ishga kelganida boshliqqa avtomat Telegram xabar boradi. Boshliqning telefon raqami sozlamalardan kiritilgan bo'lishi kerak.

### Vazifa va WebSocket (real vaqt)

Vazifa yangilangan vaqtda (yangi yuborildi, javob kelmadi, tasdiqlandi yoki rad qilindi) — barcha brauzerlarda darhol ko'rinadi. Sahifani qayta yuklash kerak emas. Bu xususiyat tasdiqlash kutayotgan vazifalar uchun juda muhim — tekshiruvchi sahifani ochiq qoldirsa, yangi vazifa kelsa darhol ko'radi.

### Sozlamalar va boshqa hammasi

Sozlamalar sahifasi tizimning poydevori. Agar:
- MoySklad token noto'g'ri bo'lsa → MoySklad'dan ma'lumot kelmaydi → xabarlar yuborilmaydi → tarixga ham yozilmaydi
- Telegram ulanmagan bo'lsa → xabarlar yuborilmaydi → "navbatda" deb qoladi
- Kompaniya nomi yozilmagan bo'lsa → xabarlar bo'sh sarlavha bilan ketadi

Boshliq tizimni birinchi marta sozlaganda, eng birinchi sozlamalar sahifasiga kirib hammasini to'g'ri kiritishi shart.

---

## 10. AVTOMAT ISHLAYDIGAN JARAYONLAR

Tizim doim ishlab turadi — boshliq sahifani ochmasa ham, fonda bir nechta jarayon o'z ishini bajarmoqda.

### Har 30 soniyada — MoySklad tekshirish

Tizim har 30 soniyada (sozlanadi) MoySklad'ga so'rov yuboradi va yangi hujjatlar borligini tekshiradi. Yangi savdo, to'lov yoki buyurtma topilsa, mijozga avtomat Telegram xabar yuboriladi va xabar tarixiga yoziladi.

### Har 5 soniyada — xabar navbatini ishlatish

Yuboriladigan xabarlar maxsus "navbat"ga yozib qo'yiladi. Tizim har 5 soniyada navbatdan bitta xabarni olib, Telegram orqali yuboradi. Agar xabar yetib bormasa, yana urinib ko'radi (3 marta gacha). Bu Telegram'ning cheklovlarini chetlab o'tish va xabarlarni tartibli yuborish uchun.

### Har 60 soniyada — vazifa muddatini tekshirish

Vaqt belgilangan vazifalar bor. Tizim har daqiqada (60 soniya) shu vazifalarni tekshiradi. Agar muddat tugagan bo'lsa va xodim javob bermagan bo'lsa, vazifa avtomat "bajarilmadi" deb yopiladi va jarima yoziladi.

### Har 5 daqiqada — Telegram aloqasini tekshirish

Telegram akkauntlari haqiqatan ulanganmi-yo'qligi tekshiriladi. Agar uzilib qolgan bo'lsa, log'ga yoziladi (boshliq sozlamalar sahifasiga kirib qaytadan ulashi mumkin).

### Har kuni 23:30 da — KPI hisoblash

Kun oxirida tizim avtomat ravishda barcha xodimlar uchun KPI hisoblaydi. MoySklad'dan kunlik sotuv ma'lumotini oladi va xodimning rejaga nisbatan necha foiz bajarganini hisoblab, KPI summasini yangilaydi. Boshliq ertasi kuni oylik sahifasini ochsa, ma'lumotlar yangilanib turgan bo'ladi.

### Belgilangan vaqtlarda — vazifa shablonlari

Har vazifa shabloningda yuborish vaqti yozilgan bo'lsa (masalan, "har kuni 21:00"), tizim shu vaqtda avtomat ravishda Telegram'da xodimga xabar yuboradi. Agar har kuni emas, faqat ish kunlarida bo'lsa — dam olish kunlarida o'tkazib yuboradi. Oyning aniq sanasida bo'lsa — har oyning shu sanasida.

### Mijoz xabar yuborishi bilan

Mijoz xabar yuborganda Telegram'dan tizim qabul qiladi va kerakli vazifa logiga yozadi. Agar bu vazifa javobi bo'lsa, vazifa holati avtomat yangilanadi.

### Foydalanuvchiga ta'siri

Bu jarayonlar foydalanuvchiga ko'rinmaydi. Boshliq sahifani ochmasa ham, tizim ish bajarmoqda — vazifalar yuborilmoqda, xabarlar mijozlarga ketmoqda, KPI hisoblanmoqda. Boshliq faqat sahifaga kirganda natijalarni ko'radi: "Bugun 50 ta xabar yuborildi", "Bugun 12 ta vazifa bajarildi".

---

## 11. MA'LUMOTLAR HIMOYASI VA KIRISH NAZORATI

### Login va parol

Har foydalanuvchi o'z foydalanuvchi nomi va paroli bilan kiradi. Parol shifrlangan tarzda saqlanadi (boshliq ham parolni ko'ra olmaydi, faqat yangisini o'rnatishi mumkin). Parol kamida 4 ta belgi bo'lishi kerak.

### Sessiya saqlash

Foydalanuvchi kirgandan keyin tizim brauzerda kirish belgisi (token) saqlaydi. Brauzerni yopib qaytadan ochsa ham, qayta kirish kerak emas — tizim eslab qoladi. Faqat "Chiqish" tugmasini bossa, sessiya tugaydi.

### Kirish darajalari

Boshliq har xodim uchun alohida sozlash mumkin: qaysi sahifalarni ko'rishi mumkin va qanchalik. Uch xil daraja:

**To'liq** — sahifani ko'rish + ichidagi yozuvlarni o'zgartirish, qo'shish, o'chirish huquqi

**Faqat ko'rish** — sahifani ko'radi, lekin hech narsa o'zgartira olmaydi

**Faqat o'ziniki** — faqat o'ziga tegishli yozuvlarni ko'radi (masalan, faqat o'zining vazifalari, faqat o'zining davomati)

Bu nazorat tufayli boshliq xodimga aniq qaerga kirish va aniq nima qilishni ruxsat berishi mumkin. Masalan, kassirga vazifa va davomat sahifalarini to'liq ruxsat, ammo boshqa xodimlarning oyligi yashirin.

### Maxfiy ma'lumotlar

MoySklad token, Telegram API kalitlar, parol — bularning barchasi shifrlangan tarzda yoki maxsus papkalarda saqlanadi. Foydalanuvchi sahifada faqat yulduzchalar shaklida ko'radi. Hech kim, hatto tizim administratoriga ham, parolni asl shaklda ko'ra olmaydi (faqat yangilash mumkin).

### Faoliyat tarixi

Tizimda har bir muhim harakat (kim qachon nima qildi) avtomat yozib qoladi. Boshliq "Faoliyat tarixi" sahifasiga kirib (agar yoqilgan bo'lsa) kim nima o'zgartirgani, kim qaysi vazifani yaratgani, kim qaysi xodimga bonus yozgani — barchasini ko'rishi mumkin. Bu shaffoflik va javobgarlik uchun.

### Soft-delete (yumshoq o'chirish)

Xodim "o'chirilsa" — haqiqatda ma'lumotlar o'chirilmaydi, faqat "nofaol" deb belgilanadi. Bu xodimning tarixi (vazifalari, davomati, oyligi) saqlanib qoladi. Kerak bo'lsa boshliq uni qaytadan "faol" qilishi mumkin.

### Backup (zaxira nusxa)

Tizim ma'lumotlari muntazam ravishda zaxira nusxa olinadi (har kuni avtomat). Agar biror muammo yuz bersa, eski holatga qaytarish mumkin. Boshliq buni alohida sozlamasdan ham, jarayon avtomat ishlaydi.

---

## YAKUNIY MAZMUN

Bu tizim **uchta katta ishni avtomatlashtiradi**: mijozlar bilan Telegram orqali aloqa, xodimlarga vazifa berish va ularni nazorat qilish, oylik va KPI hisoblash. Foydalanuvchi har sahifaga kirganda aniq nima qilishi kerakligini biladi, har tugmaning vazifasi tushunarli, har modal bir aniq maqsad uchun ochiladi.

**Asosiy printsip — to'rt ko'z:** xodim o'zini o'zi tasdiqlay olmaydi, doim boshqa odam tekshiradi. Bu firibgarlikning oldini oladi.

**Asosiy bog'liqlik:** sozlamalar to'g'ri kiritilmasa, hech narsa ishlamaydi. Boshliq birinchi navbatda sozlamalarni to'liq qiladi, keyin boshqa modullarga o'tadi.

**Avtomat jarayonlar:** tizim doim ishlab turadi, boshliq sahifani ochmasa ham. Telegram'ga xabarlar ketmoqda, vazifalar yuborilmoqda, KPI hisoblanmoqda. Foydalanuvchi faqat natijani ko'radi va kerakli qarorlarni qabul qiladi.

**Shaffoflik:** har bonus, har jarima, har vazifaning sababi va qaerdan kelganligi tarixda saqlanadi. Hech narsa yashirin emas.

**Moslashuvchanlik:** boshliq har xodim uchun kirish darajasini, vazifa shablonlarini, bonus/jarima qoidalarini va KPI sozlamalarini alohida sozlay oladi. Tizim har kompaniya uchun moslashuvchan.

Bu hujjat tizimning **biznes-mantiqini** to'liq tushuntiradi. Texnik tafsilotlar (kod, server konfiguratsiyasi, ma'lumotlar bazasi strukturasi) alohida hujjatda — bu ikkala hujjat birga butun tizimni har tomonlama tushunish imkonini beradi.
