# Sherset TSD — omborchi qo'l terminali

> **Holat:** ISH EKRANLARI TAYYOR (G6). Auth va skelet — G5.
> **BUILD-VERIFIED** (2026-08-25): `assembleDebug` ogohlantirishsiz o'tdi,
> `app-debug.apk` ≈ 7,1 MB. Toolchain shu mashinada: JDK 17 va Android SDK
> `D:/dev` da (Gradle 8.7 alohida yuklab olindi — repo'da wrapper yo'q).
> **JONLI QURILMADA sinalmagan** — terminal hali yo'q (qoida 11).
> Reja: [`docs/plans/2026-08-23-omborchi-tsd-mijozlar.md`](../../docs/plans/2026-08-23-omborchi-tsd-mijozlar.md) → G5, G6.

## Nima qiladi (G5 doirasi)

1. **Juftlash** — admin `POST /auth/tsd-device/pair` bilan olgan `deviceId` +
   `deviceSecret` ni terminalga bir marta kiritadi. Kalit **shifrlangan** holda
   yotadi (`DeviceStore.kt` — EncryptedSharedPreferences).
2. **PIN kirish** — `POST /auth/tsd-login` (qurilma kaliti **majburiy** + 4
   raqamli PIN). Sessiya `deviceMode: 'tsd'` bilan muhrlanadi.
3. **Topshiriqlar ro'yxati** — `GET /restock-tasks?assigneeId=…&assigneeOpen=1`.
4. **Skan** — `GET /tsd/scan` (**narxsiz**), yacheyka kodi uchun
   `GET /admin/stores/cells/by-barcode`. Multi-hit tanlovi majburiy.
5. **Oflayn amal navbati** — `ActionQueue.kt` (FIFO, `clientOpId` bilan).

## Ish ekranlari (G6 doirasi)

Har ekran alohida faylda va `Shell` interfeysi orqali ishlaydi — `Activity` ni
KO'RMAYDI. Skan avval JORIY ekranga beriladi (u bosqichga qarab talqin qiladi),
ekran uni yemasa umumiy narxsiz skan-ma'lumot ochiladi.

| Ekran | Fayl | Nima qiladi |
|---|---|---|
| Topshiriqlar | `TaskListScreen.kt` | `picking` + `restock` bitta navbatda; kartada `qolgan / jami` va ⚠ yetishmovchilik soni |
| Topshiriq detali | `TaskDetailScreen.kt` | Qatorlar **yacheyka marshruti** tartibida (saralashni SERVER qiladi); qo'lda tasdiq, skan bilan tasdiq |
| Yetishmovchilik | `ShortageScreen.kt` | «Javonda shuncha topolmadim» — MUTLAQ son; chek tarkibi O'ZGARMAYDI |
| Joylashtirish | `PlaceScreen.kt` | tovar → manba (yacheyka **yoki** yacheykasiz qoldiq) → maqsad yacheyka → miqdor |
| Sanash | `CountScreen.kt` | Yacheyka yorlig'i → tarkib → mutlaq sanoq (`mode: 'set'`) |
| Skan ma'lumoti | `ScanInfoScreen.kt` | Nom, jami qoldiq, yacheykalar — **narxsiz** |
| Multi-hit tanlovi | `PickProductScreen.kt` | Shtrix bir nechta tovarga tegishli bo'lsa TANLOVNI ODAM qiladi |

**Navbatni bo'shatish** — `QueueSender.kt`: qat'iy ketma-ket, tarmoq/5xx da
navbat JOYIDA qoladi, 4xx da amal navbatdan chiqadi va **sabab bilan** ekranda
ko'rinadi (jim yo'qotish yo'q). Ilova ochilganda navbat o'z-o'zidan yuboriladi.

🔴 **«Tayyor» tugmasi ATAYLAB YO'Q.** Hamma qator yopilgach topshiriq
o'z-o'zidan `done` bo'ladi va chek KONTROL navbatiga tushadi (G2) — TSD chekni
`mark-ready` bilan flip QILMAYDI. Ekran «kontrolga ketdi» deb aytadi.

## Backend kontrakti

| Endpoint | Metod | Izoh |
|---|---|---|
| `/auth/tsd-device/pair` | POST | Admin (JWT + `employee.update`). Kalit FAQAT shu javobda. |
| `/auth/tsd-login` | POST | `{deviceId, deviceSecret, pin, appVersion?}` → `{accessToken, refreshToken, user, device}` |
| `/auth/refresh` | POST | Sessiya uzaytirish; terminal bekor qilingan bo'lsa 401 |
| `/restock-tasks` | GET | «Mening topshiriqlarim» |
| `/restock-tasks/:id/lines/:lineId/confirm` | POST | Qatorni qo'lda tasdiqlash |
| `/restock-tasks/:id/confirm-scan` | POST | Skaner bilan tasdiqlash |
| `/restock-tasks/:id/lines/:lineId/shortage` | POST | **G6** — «topolmadim» (mutlaq miqdor; `0` = belgini olib tashlash) |
| `/tsd/scan?code=` | GET | **Narxsiz** tovar qidiruvi (multi-hit) |
| `/admin/stores/cells/by-barcode?code=` | GET | Yacheyka yorlig'i |
| `/products/:id/cell-move` · `/cell-place` | POST | Ko'chirish / joylashtirish |
| `/admin/stores/:id/cells/:cellId/stock` | GET·PUT | Yacheyka sanash |
| `/notifications` | GET | Yangi topshiriq signali (polling) |

🔴 **Bu ro'yxatdan tashqarisi serverda 403.** Cheklov `apps/api/src/modules/auth/tsd-policy.ts`
da (default-deny) va uni `TsdGuard` global bajaradi. Ilovaga yangi endpoint
kerak bo'lsa **avval o'sha ro'yxatga** qo'shiladi — va savol beriladi: «bu
javobda narx bormi?»

## Nega narx yo'q

Egasining qoidasi: *«Ombor xodimlari narx ko'rmaydi; kirim narxi faqat katta
omborchiga»*. `GET /products` to'liq tovar qatorini (`buyPrice`, `minPrice`,
`salePrices`) qaytaradi, shuning uchun u TSD ro'yxatida **umuman yo'q** —
o'rniga `GET /tsd/scan` bor va uning ustunlari `tsd-scan.ts` da **oq ro'yxat**
bilan sanab chiqilgan. Ekranda ko'rsatmaslik himoya emas: token haqiqiy.

## Skaner

`ScannerBridge.kt` ikki rejimni birga ushlaydi:

- **klaviatura-wedge** — sukut, hamma terminalda sozlashsiz ishlaydi;
- **broadcast** (DataWedge / Urovo / Newland) — model aniqlangach
  `res/values/config.xml` dagi `scanner_broadcast_action` to'ldiriladi,
  **kod o'zgarmaydi**.

## Build

**2026-08-25 da shu mashinada BAJARILDI va o'tdi** (`BUILD SUCCESSFUL`,
ogohlantirishsiz, `app-debug.apk` ≈ 7,1 MB).

1. **JDK 17** va **Android SDK** (platform `android-34`). Shu mashinada ular
   `D:/dev/java/jdk-17` va `D:/dev/android-sdk` da.
2. **Gradle 8.7** — AGP 8.5.0 shuni kutadi. Repo'da wrapper binarlari YO'Q
   (`driver-app` bilan bir xil qaror), shuning uchun gradle alohida yuklab
   olinadi yoki `gradle wrapper --gradle-version 8.7` bilan yaratiladi.
   ⚠️ Shu mashinadagi Gradle 9.1 (`D:/dev/gradle`) AGP 8.5.0 bilan MOS EMAS.
3. `local.properties` ga `sdk.dir=…` (gitignore'da); kerak bo'lsa
   `app/src/main/res/values/config.xml` dagi `api_base_url` ni o'zgartiring.
4. Buyruq:

   ```sh
   JAVA_HOME=D:/dev/java/jdk-17 ANDROID_HOME=D:/dev/android-sdk \
     <gradle-8.7>/bin/gradle --no-daemon assembleDebug
   ```

   → `app/build/outputs/apk/debug/app-debug.apk`.
5. Terminalda «Noma'lum manbalar» ni yoqib APK'ni o'rnating.

## Qo'lda smoke (G5 qabul mezoni)

1. Admin (ERP, `employee.update` ruxsati bilan):
   `POST /api/v1/auth/tsd-device/pair` `{"name":"TSD-1","storeId":"<ombor UUID>"}`
   → javobdagi `deviceId` va `deviceSecret` ni yozib oling.
2. Ilovani oching → **Terminalni ulash** → ikkalasini kiriting → **Saqlash**.
3. Omborchi PIN'ini kiriting → **Kirish**. Topshiriqlar ro'yxati ochilishi kerak.
4. **Narx tekshiruvi:** o'sha `accessToken` bilan
   `GET /api/v1/products?search=kabel` → **403** bo'lishi SHART.
   `GET /api/v1/tsd/scan?code=<shtrix>` → 200 va javobda narx yo'q.
5. **Refresh tekshiruvi:** 15 daqiqadan keyin (yoki `/auth/refresh` ni qo'lda
   chaqirib) yangi token bilan yana `GET /api/v1/products` → **yana 403**
   (cheklov refresh'dan omon qolgani).
6. **Bekor qilish tekshiruvi:** bazada `tsd_devices.revoked_at` ni qo'ying →
   keyingi `/auth/refresh` **401** berishi kerak.
7. **Oflayn:** Wi-Fi ni o'chiring, amal qiling — «Navbatda: N ta amal»
   ko'rinsin; Wi-Fi qaytgach ilovani qayta oching → navbat o'z-o'zidan
   yuborilsin («Yuborildi: N, rad etildi: 0»).

## Qo'lda smoke (G6 qabul mezoni — TERMINAL kelgach)

Javobgar: __________ · Sana/vaqt: __________ · APK versiyasi: __________

1. **Yig'ish zanjiri (G2 bilan uchma-uch):** kassir 2 skladli chek ochib
   yig'ishga yuboradi → TSD'da topshiriq chiqadi → qatorlar **yacheyka
   tartibida** ekanini ko'zdan kechiring → har qatorni skan yoki tugma bilan
   tasdiqlang → oxirgi qatordan keyin ekranda «chek KONTROLGA tushdi» chiqsin
   va chek `/omborchi/kontrol` navbatida ko'rinsin.
2. **Yetishmovchilik:** bitta qatorda «Topolmadim» → miqdor → saqlang.
   Topshiriq YOPILSIN, chek kontrolga TUSHSIN va kontrol kartasida sariq
   «Omborchi topolmadi» bloki miqdori bilan ko'rinsin.
   So'ng kontrolda o'sha qatorni kamaytiring — kassirda summa o'zgarsin.
3. **Takror himoyasi:** o'sha «Topolmadim» ni AYNI qiymat bilan yana yuboring —
   hech narsa o'zgarmasin (400 ham bo'lmasin).
4. **Joylashtirish:** tovar shtrixini skanerlang → «Yacheykasiz qoldiq» →
   maqsad yacheyka yorlig'ini skanerlang → miqdor → **Ko'chirish**.
   Qoldiq hisobotida o'sha yacheykada ko'rinsin.
5. **Ko'chirish (yacheyka → yacheyka):** o'sha tovarni boshqa yacheykaga
   ko'chiring; ombor JAMI qoldig'i O'ZGARMASIN.
6. **Omborlararo qulf:** kichik omborchi bilan boshqa OMBOR yacheykasiga
   ko'chirishga urinib ko'ring → **403** («store.update kerak»).
7. **Sanash:** yacheyka yorlig'ini skanerlang → tarkib chiqsin → bitta tovarga
   yangi son kiriting → saqlang → `/cell` ekranida o'sha son ko'rinsin.
8. **Narx tekshiruvi (yana):** har ekranda narx YO'Qligini ko'zdan kechiring.

## Fayl xaritasi

```
app/src/main/AndroidManifest.xml           — ruxsatlar (kamera/lokatsiya YO'Q)
app/src/main/res/values/
   config.xml                              — api_base_url + skaner broadcast aksiyasi
   dimens.xml                              — tegish nishonlari (56/64dp)
   strings.xml                             — matnlar (uz; ru kerak bo'lsa values-ru)
app/src/main/java/uz/sherset/tsd/
   DeviceStore.kt                          — SHIFRLANGAN kalit/refresh saqlash
   ApiClient.kt                            — allowlist ichidagi endpointlar
   ActionQueue.kt                          — oflayn FIFO amal navbati
   ScannerBridge.kt                        — wedge + broadcast skaner
   QueueSender.kt                          — navbatni bo'shatish (G6)
   Ui.kt                                   — vidjetlar + `Shell`/`Screen` shartnomasi
   MainActivity.kt                         — qobiq: juftlash → PIN → router → skan marshruti
   TaskListScreen.kt · TaskDetailScreen.kt · ShortageScreen.kt
   PlaceScreen.kt · CountScreen.kt · ScanInfoScreen.kt · PickProductScreen.kt
app/build.gradle.kts · settings.gradle.kts — build konfiguratsiyasi
```
