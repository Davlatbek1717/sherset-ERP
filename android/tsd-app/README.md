# Sherset TSD — omborchi qo'l terminali (G5 skeleti)

> **Holat:** SKELET — auth oqimi + arxitektura + kalit fayllar.
> **Build-verified EMAS** (bu repo pnpm/TS monorepo, Android toolchain yo'q) —
> `driver-app` bilan bir xil chegara.
> Reja: [`docs/plans/2026-08-23-omborchi-tsd-mijozlar.md`](../../docs/plans/2026-08-23-omborchi-tsd-mijozlar.md) → G5.

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

**G6 da quriladi:** yig'ish qatorlarini tasdiqlash ekrani, joylashtirish/
ko'chirish, yacheyka sanash, navbatni avtomatik bo'shatuvchi fon ishi.

## Backend kontrakti

| Endpoint | Metod | Izoh |
|---|---|---|
| `/auth/tsd-device/pair` | POST | Admin (JWT + `employee.update`). Kalit FAQAT shu javobda. |
| `/auth/tsd-login` | POST | `{deviceId, deviceSecret, pin, appVersion?}` → `{accessToken, refreshToken, user, device}` |
| `/auth/refresh` | POST | Sessiya uzaytirish; terminal bekor qilingan bo'lsa 401 |
| `/restock-tasks` | GET | «Mening topshiriqlarim» |
| `/restock-tasks/:id/lines/:lineId/confirm` | POST | Qatorni qo'lda tasdiqlash |
| `/restock-tasks/:id/confirm-scan` | POST | Skaner bilan tasdiqlash |
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

## Build (prerequisites)

1. **Android Studio** (yoki `sdkmanager` + JDK 17), `ANDROID_HOME` sozlangan.
2. Gradle wrapper: `cd android/tsd-app && gradle wrapper --gradle-version 8.7`
   (repo'da wrapper binarlari yo'q — `driver-app` bilan bir xil qaror).
3. `local.properties` ga `sdk.dir=…`; kerak bo'lsa
   `app/src/main/res/values/config.xml` dagi `api_base_url` ni o'zgartiring.
4. `./gradlew assembleDebug` → `app/build/outputs/apk/debug/app-debug.apk`.
5. Terminalда «Noma'lum manbalar» ni yoqib APK'ni o'rnating.

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
   ko'rinsin; Wi-Fi qaytgach navbat bo'shashi (G6 da avtomatlashtiriladi).

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
   MainActivity.kt                         — juftlash → PIN → topshiriqlar → skan
app/build.gradle.kts · settings.gradle.kts — build konfiguratsiyasi
```
