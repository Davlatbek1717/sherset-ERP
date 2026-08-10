# TZ — «Scan» va «Sanash» tugmalari (ombor kartochkasi · yacheyka bo'limi)

> **Manba: egasi, 2026-08-10. Bu fayl — TALAB matni (o'zgartirilmaydi).**
> Bajarilish rejasi: `docs/superpowers/plans/2026-08-10-yacheyka-scan-sanash-tz-v3.md`.
>
> **Egasi tasdiqlagan 3 og'ish (2026-08-10):**
> 1. «Umumiy sanash» qo'shuvchi bo'lishi (§2.2.3) — delta **serverda** hisoblanadi
>    (`PUT …/cells/:cellId/stock` tanasida `mode: 'set' | 'add'`), FE «hozirgi»ni o'qib
>    mutlaq qiymat yubormaydi: ikki omborchi bir vaqtda sanaganda yo'qolgan-yangilanish bo'lmasin.
> 2. «Chiqarib qo'shish» (§1.2) qaytarildi — bu 2026-07-21 dagi «destruktiv variant olib tashlansin»
>    qarorini **ataylab bekor qiladi**.
> 3. Ruxsat `store.cell_ops` emas, yangi **`storecell`** obyekti (view/update) sifatida qo'shildi;
>    chiqarish (unbind) esa §3 talabiga ko'ra `store.update` da qoldirildi.
>
> **Holat yorlig'i:** bajarilgan ish **Phase-1** — kod + unit/xulq testlari bilan tasdiqlangan,
> **real skaner/telefon bilan do'konda smoke QILINMAGAN**. §4 checklisti — aynan shu qarz.

---

> Holat: 2026-08-10. «Scan» v3 (02c11307) va «Sanash» v2 (143b129d) bo'yicha.
> Ikkala oyna ham ombor kartochkasidagi «Адресное хранение» bo'limida turadi.
> Yorliq: Phase-1 — kod-darajada tekshirilgan, real skaner/kamera bilan do'konda smoke qilinmagan.

---

## 0. Ikki tugmaning farqi (eng muhim!)

| | **Scan** | **Sanash** |
|---|---|---|
| Nima qiladi | Mahsulotni yacheykaga **BOG'LAYDI** («bu mahsulotning joyi shu yacheyka») | Yacheykadagi **QOLDIQNI/SONINI** yozadi |
| Nima yoziladi | Mahsulot kartochkasidagi «Ячейка» maydoni (__yacheyka) | Yacheyka-qoldiq + avto-hujjat |
| Miqdor so'raydimi | Yo'q — faqat juftlik (yacheyka ↔️ mahsulot) | Ha — son kiritiladi |
| Qachon ishlatiladi | Yangi tovar joylashtirilganda / joyi o'zgarganda | Inventarizatsiya, kirim sanash |

Ikkalasi ham **darhol yozmaydi**: skanlanganlar ro'yxatga yig'iladi, faqat **«Saqlash»** bosilganda serverga yoziladi («Scan»da ham, «Umumiy sanash»da ham). «Sanash» oddiy rejimi ro'yxatsiz — bitta yacheyka ustida ishlaydi, lekin u ham «Saqlash»siz hech narsa yozmaydi.

---

## 1. «Scan» oynasi — yacheyka ↔️ mahsulot bog'lash

### 1.1 Asosiy oqim

1. **«Scan»** tugmasi bosiladi → oyna ochiladi, kamera **o'zi yonadi**, kursor doim skan-maydonda turadi (qo'shimcha bosish kerak emas).
2. **№ 1 — yacheyka**: yacheyka etiketkasi skanlanadi (shtrix-kodi, yoki bosma etiketkadagi nomi). Yashil chip chiqadi: «Yacheyka: A-1-1».
3. **№ 2 — mahsulotlar**: mahsulot shtrix-kodlari ketma-ket skanlanadi. Har skan **pastdagi jadvalga qator bo'lib tushadi**:

   `[A-1-1] Olma siropi 500ml · KOD123 · ✕`

   Bu paytda **serverga HECH NARSA yozilmaydi** — jadval shunchaki yig'ilib boradi.
4. **✕** bosilsa — qator ro'yxatdan chiqadi (server chaqirig'i yo'q, chunki hali yozilmagan; xato skan bir bosishda tuzatiladi).
5. **«Saqlash (N)»** bosilganda — jadvaldagi hamma qator bir yo'la yoziladi: har mahsulotning «Ячейка» maydoni o'z qatoridagi yacheykaga o'rnatiladi. Muvaffaqiyat: «Saqlandi: N ta bog'lash» va oyna yopiladi.
6. **«Bekor qilish»** — oyna yopiladi, hech narsa yozilmaydi.

### 1.2 Band yacheyka (ichida allaqachon mahsulot bor)

Band yacheykaga birinchi mahsulot skanlanganda **modal savol** chiqadi. Tugmalar ichidagi mahsulot **nomi bilan** yoziladi (bir nechta bo'lsa «Olma +2»):

- **«„Olma“ bilan birga qo'shish»** (yashil) — eskisi qoladi, skanlangani qatorga qo'shiladi.
- **«„Olma“ni chiqarib, hozirgisini qo'shish»** (qizil) — qator qo'shiladi va unga «almashtiradi» belgisi tushadi; eskisini chiqarish ham **faqat «Saqlash» paytida** bajariladi (avval eski chiqariladi, keyin yangi yoziladi).
- **«Bekor qilish»** — skan tashlanadi, hech narsa qo'shilmaydi.

Savol **har yacheyka uchun bir marta** so'raladi: javob berilgach, o'sha yacheykaga keyingi skanlar so'roqsiz tushaveradi (qaror eslab qolinadi).

### 1.3 O'rtada boshqa yacheyka skanlash

Ruxsat etiladi: ro'yxat turgan holda yangi yacheyka etiketkasi skanlansa — keyingi mahsulotlar **yangi yacheykaga** tushadi, eski qatorlar **o'z yacheykasini saqlab qoladi** (har qatorda yacheyka chipi ko'rinib turadi). «Saqlash» har guruhni o'z yacheykasiga yozadi. Ya'ni bir yurishda bir nechta yacheykani joylash mumkin.

### 1.4 Chetki holatlar

| Holat | Javob (banner + ovoz/rang) |
|---|---|
| Yacheyka skanlanmasdan mahsulot skanlansa | Sariq: «Avval yacheyka kodini skanerlang» |
| Kod na yacheyka, na mahsulot | Qizil + beep: «Kod topilmadi» |
| Boshqa ombor yacheykasi | Sariq: «Bu yacheyka boshqa omborga tegishli („X“)» |
| Bir kod bir nechta mahsulotga mos | Sariq: «Bir nechta mahsulot topildi — aniq shtrix-kodni skanerlang» |
| Shu mahsulot allaqachon ro'yxatda | Sariq: «Bu mahsulot allaqachon ro'yxatda» (takror qo'shilmaydi) |
| Shu mahsulot allaqachon shu yacheykaga bog'langan (serverda) | Yashil: «allaqachon bog'langan» (qo'shilmaydi) |
| Saqlashda xato (masalan, tarmoq) | Qizil: sabab ko'rsatiladi; **yozilganlari yozilgan, yozilmaganlari ro'yxatda qoladi** — qayta «Saqlash» mumkin |

### 1.5 Har skanga javob (hech narsa jim o'tmaydi)
- Tepada rangli banner: nima bo'ldi + «O'qildi: <kod>» (xom kod ko'rinadi — begona etiketka o'zini fosh qiladi).
- Vizir (kamera ramkasi) ko'k yonadi = o'qildi; qizil = rad etildi.
- Yangi tushgan qator bir lahza yashil yonadi.

---

## 2. «Sanash» oynasi — yacheykadagi sonni yozish

Bitta oyna, ikki rejim. Tepada **«Umumiy sanash»** katagi (checkbox) va uning yonida **doim bitta son-maydon** (joyidan qimirlamaydi).

### 2.1 Oddiy rejim (checkbox O'CHIQ) — bitta yacheyka

1. Yacheyka etiketkasi skanlanadi → ichidagi mahsulotlar **karta** bo'lib chiqadi (kartada: nom, kod, hozirgi soni). Mahsulot bitta bo'lsa — **o'zi tanlanadi**.
2. Kerakli karta bosiladi (yoki mahsulot shtrix-kodi skanlanadi) → karta ko'k bo'lib tanlanadi, son-maydon ochiladi.
3. Son kiritiladi → **«Saqlash»** → bu **MUTLAQ son** (true-up): yacheyka qoldig'i aynan shu songa tenglashtiriladi, farqqa avto-hujjat yoziladi. Oyna yopiladi.
4. Son kiritmasdan **boshqa** yacheyka skanlansa — qizil + beep: «Oldin miqdor kiriting» (bitta yacheyka tugamaguncha keyingisiga o'tilmaydi).
5. Skan-maydonga **harf** terilsa — katalogdan nom bo'yicha takliflar chiqadi; taklif bosilsa o'sha mahsulot kartaga qo'shilib tanlanadi (etiketkasi yo'q tovar uchun).
6. Bo'sh yacheyka: «Bu yacheykada mahsulot topilmadi».

### 2.2 «Umumiy sanash» (checkbox YONIQ) — ko'p yacheyka, jadval

1. Yacheyka etiketkalari **ketma-ket** skanlanadi — 30 ta bo'lsa 30 tasi ham **pastdagi jadvalga yig'iladi**. Har qator:

   `[A-1-1] Olma siropi · hozirgi: 26 · [son] · ✕`

2. Har qatorda:
   - **hozirgi: N** — yacheykada hozir nechta borligi (qo'shiladigan son shunga tushishini ko'rib turasiz);
   - **o'z son-maydoni** — istisno yacheyka uchun alohida son (bo'sh qolsa umumiy son ishlaydi);
   - **✕** — qator ro'yxatdan chiqadi (hech narsa yozilmagan).
3. Oxirida **tepadagi umumiy son** kiritiladi → **«Saqlash (N)»**:
   - Har qatorga son **QO'SHILADI** (26 + 100 = 126) — mutlaq emas;
   - Qo'shilgan miqdorga avto-«Оприходование» yoziladi;
   - Qatorlar skan tartibida yoziladi; hammasi yozilgach oyna yopiladi.
4. Saqlashdan oldin **hamma qator tekshiriladi**: birortasida yaroqsiz/bo'sh son bo'lsa (umumiysi ham bo'sh) — hech narsa yozilmaydi, qaysi yacheykada muammo ekani aytiladi (yarim-partiya bo'lmaydi). Xato o'rtada chiqsa — yozilganlari yozilgan, qolganlari jadvalda qoladi.
5. Bu rejim **faqat yacheyka** skanlaydi:
   - mahsulot/begona kod skanlansa — qizil + beep: «Bu rejimda YACHEYKA yorlig'ini skanerlang»;
   - ichida **bir nechta** mahsulot bo'lgan yacheyka — qizil: «yacheykada bir nechta mahsulot — uni alohida (oddiy) rejimda sanang»;
   - bo'sh yacheyka — qizil: «mahsulot topilmadi»;
   - bitta yacheyka ikki marta skanlansa — qator takrorlanmaydi (yangilanadi).

### 2.3 Son-maydon skan-himoyasi (wedge-guard)

Skaner adashib son-maydonga «otib» yuborsa (fokus o'sha yerda qolganda) — tizim tezlikdan taniydi: terilgan kod son-maydondan olib tashlanadi va oddiy skan sifatida qayta ishlanadi. Son-maydonda faqat odam qo'li bilan tergan raqam qoladi.

---

## 3. Ikkala oynaga umumiy qoidalar

- **Kirish yo'llari (3 ta, hammasi parallel ishlaydi):**
  1. USB/wedge skaner — kursor qayerda bo'lishidan qat'i nazar ishlaydi (maxsus tutqich bor);
  2. Kamera — oyna ochilishi bilan o'zi yonadi, vizir-ramka bor; «Kamera» tugmasi bilan o'chirib-yoqiladi;
  3. Qo'lda terish — skan-maydonga kod/nom terib Enter.
- Telefonda skan-maydon **virtual klaviaturani chiqarmaydi** (maydonning o'ziga qo'l tekkizilmaguncha) — skaner uchun fokus saqlanadi.
- Tez ketma-ket skanlar **navbatga tushadi** va tartibda qayta ishlanadi — birortasi yo'qolmaydi.
- Har o'qilgan kod bannerda ko'rsatiladi; xatolar qizil + beep — **jim rad etish yo'q**.
- Yacheyka etiketkasi kod bilan ham, **nomi** bilan ham taniladi (bosma etiketkalar nomni kodlaydi).
- Ombor kartochkasi yuklangandan KEYIN yaratilgan yangi yacheyka ham taniladi (server-qidiruv zaxira yo'li bor).
- Ruxsatlar: bog'lash/sanash = store.cell_ops (omborchi roli yetadi); Scan'dagi «chiqarib qo'shish»dagi chiqarish = store.update.

## 4. Sinov-checklist (do'konda birinchi ishga tushirishda)

- [ ] Scan: yacheyka + 3 mahsulot → jadvalda 3 qator → «Saqlash» → mahsulot kartalarida «Ячейка» to'g'ri.
- [ ] Scan: ✕ bosilgan mahsulot saqlanmagan bo'lsin.
- [ ] Scan: band yacheyka → tugmalarda mavjud mahsulot nomi chiqsin; «chiqarib qo'shish»da eski chiqib yangi kirsin.
- [ ] Scan: 2 xil yacheyka aralash skan → har mahsulot o'z yacheykasiga tushsin.
- [ ] Sanash (oddiy): son kiritmay 2-yacheyka → qizil + beep.
- [ ] Umumiy sanash: 5 yacheyka + umumiy 100 → har birining qoldig'i +100 bo'lsin, «hozirgi» to'g'ri ko'rinsin.
- [ ] Umumiy sanash: bitta qatorga alohida 50 → o'shaniki +50, qolganlari +100.
- [ ] Telefon kamerasi bilan hamma yuqoridagilar takror.
