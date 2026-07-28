# Sherset Driver — native Android GPS-tracking ilova (Faza 1 skeleti)

> **Holat:** SKELET — arxitektura + kalit fayllar. **Build-verified EMAS** (bu repo pnpm/TS
> monorepo, Android toolchain yo'q). Quyidagi qadamlar bilan Android Studio/CLI'да quriladi.
> TZ: [`docs/superpowers/specs/2026-07-28-hr-driver-tracking-design.md`](../../docs/superpowers/specs/2026-07-28-hr-driver-tracking-design.md) §5.

## Nima qiladi

Haydovchi telefonida **foreground-service** (ekran o'chiq ham) GPS'ni backendga uzatadi:

- «Smenani boshlash» → `DriverShift` ochiladi (`POST /driver-tracking/shifts/start`), foreground GPS boshlanadi.
- Har ~15s (faol yetkazma) / ~60s (bo'sh) → `POST /driver-tracking/ping` `{lat,lng,accuracy,speed,heading,ts}`.
- Internet yo'q → lokal buferga yoziladi, ulanganda `ts` bilan ketma-ket yuboriladi (oflayn-safe).
- «Smenani tugatish» → `POST /driver-tracking/shifts/end`, GPS to'xtaydi. **Smena yopiq → GPS umuman uzatilmaydi** (maxfiylik: 24/7 EMAS).

## Backend kontrakti (mavjud, tayyor)

| Endpoint | Metod | Body/Resp |
|---|---|---|
| `/auth/login` | POST | `{email,password}` → `{accessToken}` (mavjud auth) |
| `/driver-tracking/shifts/start` | POST | `DriverShift` |
| `/driver-tracking/shifts/end` | POST | `DriverShift` |
| `/driver-tracking/shifts/current` | GET | `DriverShift \| null` |
| `/driver-tracking/ping` | POST | `{lat,lng,accuracy,speed?,heading?,ts?}` → `{accepted,reason,arrivedTripId}` |
| `/driver-tracking/my/trips` | GET | `DriverTrip[]` (faol yetkazma) |

Barcha so'rovlar `Authorization: Bearer <accessToken>`. Xodim `trackingMode='field'` bo'lishi shart.

## Build (prerequisites)

1. **Android Studio** (yoki `sdkmanager` + JDK 17). `ANDROID_HOME` sozlangan.
2. Gradle wrapper yarat: `cd android/driver-app && gradle wrapper --gradle-version 8.7`
   (bu repo'да wrapper binarlari yo'q — versiya nazorati uchun matn fayllar qoldirildi).
3. `local.properties`ga `sdk.dir=...` + `app/src/main/res/values/config.xml`da `api_base_url` (masalan `https://erp.sherset.uz/api/v1`).
4. `./gradlew assembleDebug` → `app/build/outputs/apk/debug/app-debug.apk`.
5. Telefonда «Noma'lum manbalar»ni yoqib APK'ni o'rnat (Play Store: keyingi bosqich — fon-lokatsiya siyosati qo'shimcha ko'rik talab qiladi, TZ §13.3).

## Ruxsatlar (runtime)

`ACCESS_FINE_LOCATION` + `ACCESS_BACKGROUND_LOCATION` (Android 10+ ikki bosqichли so'raladi) + `FOREGROUND_SERVICE_LOCATION` (Android 14+) + `POST_NOTIFICATIONS` (Android 13+).

## Fayl xaritasi (skelet)

```
app/src/main/AndroidManifest.xml            — ruxsatlar + foreground-service e'loni
app/src/main/java/uz/sherset/driver/
   ApiClient.kt                             — login + ping + shift (OkHttp)
   LocationForegroundService.kt             — FusedLocation + foreground + ping + oflayn-flush
   PingBuffer.kt                            — oflayn bufer (SharedPreferences JSON navbat)
   MainActivity.kt                          — kirish + smena start/stop UI
app/build.gradle.kts · settings.gradle.kts  — build konfiguratsiyasi
```

## Keyingi ish (skeletdan to'liq ilovagacha)

- Room bilan bardoshli oflayn bufer (hozir SharedPreferences — kichik hajm uchun).
- Faol yetkazma ekrani (xarita + «Yo'lga chiqdim»/«Yetdim» → `/driver-trips/:id/status`).
- Token refresh + qayta-login oqimi.
- WorkManager bilan service qayta-tiklanishi (OS o'ldirsa).
- Play Store: fon-lokatsiya deklaratsiyasi + maxfiylik siyosati.
