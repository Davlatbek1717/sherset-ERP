# TZ — HR Haydovchi jonli-tracking (live-lokatsiya + ETA + to'xtash) — Dizayn hujjati

**Sana:** 2026-07-28 · **Modul:** HR → Xodimlar → Haydovchilar (jonli) · **Holat:** dizayn tasdiqlangan (egasi tanlovlari kiritilgan), TZ

> Bu funksiya noldan qurilmaydi — mavjud **HR GPS-davomat** infratuzilmasi ustiga quriladi:
> `apps/api/src/modules/hr/attendance-geo/` (`ping-ingest.service`, `haversine.util`, `jump-filter.util`,
> `geofence.util`, `davomat-ping-cleanup.cron`) + sxema (`HrLocationPing`, `HrWorkLocation`, `HrAttendance`,
> `EmployeeWorkSchedule`, `HrRole`). Bog'liq TZ: [`2026-07-23-hr-gps-attendance-design.md`](./2026-07-23-hr-gps-attendance-design.md).

---

## 1. Maqsad

Haydovchi rolidagi xodimlar uchun **jonli logistika-kuzatuv**:

1. **Jonli lokatsiya** — har haydovchining hozirgi joyi xaritada real-time (dispecher/menejer ko'radi).
2. **ETA + masofa** — haydovchi biriktirilgan yetkazma manziligacha **necha daqiqada boradi** va **qancha masofa** (tirbandlik bilan).
3. **To'xtash aniqlash** — haydovchi yo'lда **necha daqiqa to'xtab qolgan** (tanaffus/tirbandlik vs manzilда yetkazish).
4. **Grafiksiz ish hisobi** — haydovchilarda **aniq ish jadvali yo'q** (har kun har xil). Shu sababli davomat/kechikish
   modeli ular uchun mos emas: ish **smena + yetkazma** bilan o'lchanadi (jadvalga nisbatan kechikish EMAS).

---

## 2. Tasdiqlangan qarorlar (egasi bilan, 2026-07-28)

| # | Qaror | Tanlov |
|---|---|---|
| Ikki rejim | `Employee.trackingMode`: **`GEOFENCE`** (ofis, mavjud davomat) \| **`FIELD`** (haydovchi, yangi). FIELD'da jadval-kechikish O'CHIRILADI | two-mode |
| Tracking-klient | **Native Android ilova** — foreground-service, fon'da (ekran o'chiq) ishonchli GPS. Oflayn bufer + smena start/stop | native |
| Routing/ETA | **Yandex API** (Router + Geocoder) — UZ ko'cha/tirbandlik qoplamasi eng aniq. *(Muqobil: 2GIS)* | yandex |
| Manzil koordinatasi | **Gibrid** — sotuv/demand «Yetkazib berish manzili» matnini avto-geocoding, dispecher xaritada tuzatishi mumkin | auto+manual |
| Ish o'lchovi | Haydovchi: **smena + yetkazma** (jami km, faol vaqt, yetkazmalar, to'xtash) — jadval-kechikish YO'Q | shift/trip-based |

---

## 3. Arxitektura va oqim

```
Haydovchi telefoni — NATIVE ANDROID ILOVA
   │  Foreground-service (ekran o'chiq ham), FusedLocationProvider
   │  Smena ochiq bo'lsa: watch location → {lat, lng, accuracy, speed, heading, ts}
   │  POST /hr/attendance/ping   (faol yetkazmada ~15s, bo'sh smenada ~60s; batareya-adaptiv)
   │  Internet yo'q → lokal buferga yozadi, ulanganda ketma-ket yuboradi (oflayn-safe)
   ▼
BACKEND (NestJS + Prisma) — attendance-geo modulini KENGAYTIRADI
   1. Ping ingest (mavjud ping-ingest.service): jump-filter anti-cheat + HrLocationPing yozuvi
   2. trackingMode ayirmasi:
        GEOFENCE → mavjud geofence keldi/ketdi holat-mashinasi (o'zgarmaydi)
        FIELD    → geofence-attendance O'TKAZIB YUBORILADI; o'rniga:
                   a) jonli holat (harakatda / to'xtagan / oflayn) yangilanadi
                   b) to'xtash holat-mashinasi (§7) — to'xtash segmentlari
                   c) faol DriverTrip bo'lsa → ETA-hisob navbatiga qo'yiladi
   3. ETA-worker (cron/interval, faol trip'lar bo'yicha): Yandex Router → masofa + ETA (tirbandlik)
        → DriverTrip.distanceMeters / etaSeconds yangilanadi → SSE/WS push
   4. Realtime kanal (mavjud SSE /notifications/stream yoki WS) → web dispecher xaritasi yangilanadi
   ▼
WEB DISPECHER (HR → «Haydovchilar (jonli)»)
   · Yandex Maps xaritasi: haydovchi markerlari (rang = status), real-time
   · Yon panel: har haydovchi status/ETA/masofa/to'xtash-vaqti/bugungi km+yetkazmalar
   · Yetkazma biriktirish: buyurtma → avto-geocode manzil → xaritada tasdiqlash/tuzatish → haydovchiga tayinlash
```

**Nega mavjud `ping-ingest.service`ni kengaytiramiz (yangi endpoint emas):** anti-cheat jump-filter, HrLocationPing
yozuvi, accuracy-marjini — hammasi tayyor va sinovdan o'tgan. FIELD-rejim faqat geofence-attendance shoxidan **ajralib**,
jonli-status + to'xtash + trip-ETA shoxiga o'tadi. Ping-oqim bitta, mantiq ikkita.

---

## 4. Ma'lumot modeli

### 4.1 `Employee` kengaytirish

```prisma
  // Mavjud (GPS-davomat): workLocationId, attendanceOptIn
  trackingMode  String  @default("geofence") @map("tracking_mode") @db.VarChar(10)  // 'geofence' | 'field'
```

> `trackingMode='field'` — haydovchilarga. UI'да haydovchi roli (`HrRole.value='driver'`/`'haydovchi'`) biriktirilganda
> avto-taklif qilinadi, lekin qat'iy bog'liq emas (rol ≠ rejim; menejer ham FIELD bo'lishi mumkin). Migratsiya-default
> `geofence` → mavjud xodimlar xulqi o'zgarmaydi.

### 4.2 `HrLocationPing` kengaytirish (mavjud model)

```prisma
  // Mavjud: lat, lng, accuracy, inside, createdAt
  speed    Float?   // m/s, GPS'dan (to'xtash aniqlash aniqligi uchun)
  heading  Float?   // daraja 0–360 (marker yo'nalishi uchun, ixtiyoriy)
```

> Saqlash siyosati o'zgarmaydi: **7 kun**, keyin `davomat-ping-cleanup.cron` o'chiradi. Faqat yig'ma natijalar
> (`DriverShift`, `DriverTrip`) doimiy qoladi.

### 4.3 Yangi model — `DriverTrip` (yetkazma)

```prisma
/// Bir yetkazma: haydovchi ↔ manzil. ETA shu trip destatsiyasiga hisoblanadi.
model DriverTrip {
  id            String   @id @default(uuid()) @db.Uuid
  accountId     String   @map("account_id") @db.Uuid
  driverId      String   @map("driver_id") @db.Uuid          // Employee (trackingMode=field)
  // Manba hujjat (ixtiyoriy — qo'lda ham yaratish mumkin)
  orderType     String?  @map("order_type") @db.VarChar(20)  // 'demand' | 'retail_sale' | 'manual'
  orderId       String?  @map("order_id") @db.Uuid
  // Manzil (gibrid: avto-geocode + qo'lda tuzatilgan)
  destLat       Float    @map("dest_lat")
  destLng       Float    @map("dest_lng")
  destAddress   String?  @map("dest_address")                // ko'rsatiladigan matn
  geocodeSource String   @default("manual") @map("geocode_source") @db.VarChar(10) // 'auto' | 'manual'
  // Holat-mashina
  status        String   @default("assigned") @map("status") @db.VarChar(12)
                         // 'assigned' → 'enroute' → 'arrived' → 'completed' | 'cancelled'
  assignedAt    DateTime @default(now()) @map("assigned_at") @db.Timestamptz()
  startedAt     DateTime? @map("started_at") @db.Timestamptz()   // haydovchi yo'lga chiqdi
  arrivedAt     DateTime? @map("arrived_at") @db.Timestamptz()   // dest-geofence ichiga kirdi
  completedAt   DateTime? @map("completed_at") @db.Timestamptz()
  // Oxirgi hisoblangan ETA (SSE push manbai)
  distanceMeters Int?    @map("distance_meters")
  etaSeconds     Int?    @map("eta_seconds")
  etaComputedAt  DateTime? @map("eta_computed_at") @db.Timestamptz()

  account Account  @relation(fields: [accountId], references: [id], onDelete: Cascade)
  driver  Employee @relation("DriverTrips", fields: [driverId], references: [id], onDelete: Cascade)

  @@index([accountId, driverId, status])
  @@index([accountId, status])
  @@map("driver_trips")
}
```

### 4.4 Yangi model — `DriverShift` (smena — grafiksiz ish o'lchovi)

```prisma
/// Haydovchi ish-smenasi. «Aniq jadval yo'q» muammosining javobi: ish jadvalga
/// nisbatan EMAS, smena + yetkazma bilan o'lchanadi.
model DriverShift {
  id                String   @id @default(uuid()) @db.Uuid
  accountId         String   @map("account_id") @db.Uuid
  driverId          String   @map("driver_id") @db.Uuid
  startedAt         DateTime @map("started_at") @db.Timestamptz()   // ilovada «Smenani boshlash»
  endedAt           DateTime? @map("ended_at") @db.Timestamptz()    // «Smenani tugatish» yoki auto (long-idle)
  distanceMeters    Int      @default(0) @map("distance_meters")    // bosib o'tgan (ping-oqimidan yig'ma)
  activeSeconds     Int      @default(0) @map("active_seconds")     // harakatда bo'lgan vaqt
  stopSeconds       Int      @default(0) @map("stop_seconds")       // to'xtash jami vaqti
  deliveriesCount   Int      @default(0) @map("deliveries_count")   // bajarilgan DriverTrip soni
  autoClosed        Boolean  @default(false) @map("auto_closed")

  account Account  @relation(fields: [accountId], references: [id], onDelete: Cascade)
  driver  Employee @relation("DriverShifts", fields: [driverId], references: [id], onDelete: Cascade)

  @@index([accountId, driverId, startedAt(sort: Desc)])
  @@map("driver_shifts")
}
```

### 4.5 Jonli holat (persist EMAS — hisoblanadi)

Haydovchining hozirgi `status` (harakatда/to'xtaган/oflayn) va joriy to'xtash-davomiyligi **oxirgi ping'lardan**
hisoblanadi (denormalizatsiyasiz) — alohida "live" jadval shart emas. Zarur bo'lsa performance uchun ping-ingest
oxirida kichik in-memory/Redis snapshot (opsional, Faza 3 optimizatsiyasi).

---

## 5. Native Android ilova (haydovchi klienti)

**Stack:** Kotlin + Jetpack. GPS: `FusedLocationProviderClient`. Fon: **Foreground Service** (doimiy bildirishnoma —
Android talabi + maxfiylik shaffofligi). Ruxsatlar: `ACCESS_FINE_LOCATION` + `ACCESS_BACKGROUND_LOCATION`.

**Ekranlar/xulq:**
1. **Kirish** — xodim email/parol (mavjud auth; JWT olinadi). Faqat `trackingMode=field` xodimlar kira oladi.
2. **Smena** — katta tugma «Smenani boshlash» → `DriverShift` ochiladi, foreground-service GPS boshlaydi.
   «Smenani tugatish» → smena yopiladi, GPS to'xtaydi. **Smena yopiq bo'lsa GPS umuman uzatilmaydi** (maxfiylik: 24/7 emas).
3. **Faol yetkazma** — biriktirilgan `DriverTrip` ko'rinadi (manzil, xarita, «Yo'lga chiqdim» / «Yetdim» tugmalari).
4. **Foreground bildirishnoma** — «Lokatsiya uzatilmoqda · Smena faol» (doimiy, yashirib bo'lmaydi).

**Ping strategiyasi (batareya-adaptiv):**
- Faol trip (enroute) → **~15s** yoki >30m siljish.
- Bo'sh smena (trip yo'q) → **~60s** yoki >50m siljish.
- Turgan joyda (speed≈0, >5min) → siyrаklashadi (~120s) — batareya tejaladi.
- **Oflayn bufer:** internet yo'q → SQLite/Room'ga yoziladi, ulanganda `ts` bilan ketma-ket yuboriladi (server `ts`ni ping vaqti sifatida oladi).

**Tarqatish:** to'g'ridan-to'g'ri APK (birinchi bosqich) → keyin Play Store (opsional). Versiyalash + majburiy-yangilanish bayrog'i.

---

## 6. Backend — kengaytmalar

`attendance-geo` modulida:

- **`ping-ingest.service` shohlanishi:** ping yozilgach `employee.trackingMode` bo'yicha:
  - `geofence` → mavjud KELDI/KETDI mantiq (o'zgarmaydi).
  - `field` → (a) to'xtash-holat-mashinasi (§7), (b) faol `DriverShift`ga km/vaqt yig'indisi, (c) faol `DriverTrip`ni ETA-navbatiga belgilash, (d) dest-geofence: haydovchi manzil radiusiga (masalan 80m) kirsa `DriverTrip.status='arrived'` + `arrivedAt`.
- **`driver-trip` submoduli:** CRUD + holat-o'tishlar (`assign`, `start`, `arrive`, `complete`, `cancel`). Yaratishда gibrid-geocode (§8).
- **`driver-shift` submoduli:** `start`/`end` + yig'ma (km/active/stop/deliveries) hisob. Auto-yopish: >N soat (masalan 8s) ping kelmasa yoki tun-oxirida ochiq qolsa → `autoClosed`.
- **`eta-worker`:** interval (masalan har 20s) — faol (enroute) trip'lar bo'yicha Yandex Router chaqiradi (dedup: har trip uchun ≥45s'да bir marta), natijani DriverTrip'ga yozadi + push.
- **`driver-tracking` read API:** `GET /driver-tracking/live` (dispecher board: har field-haydovchi oxirgi joy + status + faol trip ETA), `GET /drivers/:id/route?date=` (kun izi — ping polyline), `GET /drivers/:id/shifts` (smena hisoboti).

**Realtime:** mavjud SSE (`/notifications/stream`) yoki WS kanaliga `driver:live` hodisa-turi qo'shiladi (throttled, ~5–10s batch — har ping'ni emas).

---

## 7. To'xtash aniqlash (holat-mashina)

Ping-oqimidan (mavjud `haversine.util` + yangi `speed`):

- **MOVING → STOPPED:** ketma-ket ping'lar bir nuqta atrofida (**siljish < 30m**) yoki `speed < 1.5 m/s`, **>3 daqiqa** davomida → to'xtash boshlandi (`stopStartedAt`).
- **STOPPED → MOVING:** siljish ≥ 40m yoki `speed ≥ 2 m/s` barqaror (≥2 ping) → to'xtash tugadi. Segment davomiyligi `DriverShift.stopSeconds`ga qo'shiladi.
- **Kontekst ajratish (geofence bilan):**
  - To'xtash **dest-radius ichida** (faol trip manzili) → «yetkazyapti» (normal ✓) — hisobotда alohida rang.
  - To'xtash **yo'lда** (hech qaysi manzil emas) → «yo'l-to'xtash» ⚠️ (tirbandlik/tanaffus) — dispecherga signal.
- **Jonli ko'rsatkich:** hozir STOPPED bo'lsa → `now − stopStartedAt` = «X daqiqa to'xtagan» (real-time yon-panelда).

> GPS «titrashi» (turgan joyда ham kichik siljish) — `jump-filter.util` va 30m/1.5 m/s ostonalari bilan susaytiriladi.

---

## 8. Yandex integratsiyasi

- **Geocoder** (manzil → koordinata): DriverTrip yaratilganда sotuv/demand «Yetkazib berish manzili» matni → Yandex Geocoder → nomzod lat/lng + ishonch darajasi. Natija dispecherga xaritada ko'rsatiladi → **u tasdiqlaydi yoki pinni suradi** (`geocodeSource='auto'→'manual'`). **Kesh:** bir xil matn qayta geokod qilinmaydi (matn→koordinata jadvali).
- **Router** (ETA + masofa): haydovchi joriy lat/lng → dest lat/lng, `mode=driving`, `traffic=jams` → `distanceMeters` + `etaSeconds`.
- **Xarajat nazorati (MAJBURIY):** ETA har **faol trip** uchun ≥45s'да bir marta (har ping'da emas); geocode keshlanadi; kalit + billing backend'да (`.env`: `YANDEX_API_KEY`). So'rovlar sonini kunlik-monitoring.
- **Kalit maxfiy:** faqat backend chaqiradi (frontend'да emas). Web xaritasi uchun alohida **Yandex Maps JS** kaliti (domenga bog'langan).

---

## 9. Web dispecher (HR → «Haydovchilar (jonli)»)

- **Xarita** (Yandex Maps JS yoki Leaflet): field-haydovchi markerlari, rang = status (🟢 harakatда · 🟡 to'xtagan `>Xmin` · ⚪ oflayn), yo'nalish `heading` bilan. Real-time (SSE).
- **Yon panel** (haydovchi tanlanganда): status · faol yetkazma manzili · **ETA + masofa** · **hozir necha daqiqa to'xtagan** · bugungi jami km · bajarilgan yetkazmalar · smena boshlangan vaqt.
- **Yetkazma biriktirish oqimi:** buyurtma (demand/sotuv) tanla → manzil avto-geocode → xaritada tasdiqlash/tuzatish → haydovchi tanla → `DriverTrip` yaratiladi (`assigned`).
- **Kun izi (route replay):** haydovchi × sana → ping-polyline + to'xtash-nuqtalari (davomiyligi bilan) xaritada.
- **Smena hisoboti:** haydovchi × davr → smenalar ro'yxati (boshlanish/tugash, km, faol/to'xtash vaqti, yetkazmalar soni).

---

## 10. Maxfiylik · batareya · oflayn (huquqiy + amaliy)

- **Faqat smena vaqtида kuzatiladi** — «Smenani tugatish»dan keyin GPS umuman uzatilmaydi (24/7 EMAS). Foreground-bildirishnoma doim ko'rinadi.
- **Rozilik:** haydovchi ilovaga kirishда kuzatuv shartlarini qabul qiladi (`attendanceOptIn` analogi). Ping'lar 7 kun (audit), keyin o'chadi.
- **Batareya:** adaptiv-chastota (§5) + foreground-service (Android'да yagona ishonchli yo'l).
- **Oflayn:** UZ qishloq qoplama-uzilishlariда bufer + keyin-yuborish (§5) — ma'lumot yo'qolmaydi.

---

## 11. Bosqichli reja

| Faza | Ko'lam | Chiqadigan qiymat | Tashqi bog'liqlik |
|---|---|---|---|
| **0 — Poydevor** | `Employee.trackingMode` migratsiyasi + `ping.speed/heading` + web jonli-xarita (mavjud ping'lardan; vaqtincha mavjud PWA bilan sinash) | **Talab 1** (jonli lokatsiya) ishlaydi | yo'q |
| **1 — Native ilova** | Android foreground-GPS ilova, kirish, smena start/stop, oflayn bufer, adaptiv ping | Ishonchli fon-uzatish | Android toolchain |
| **2 — Yetkazma + ETA** | `DriverTrip` + biriktirish oqimi + Yandex Geocoder/Router → ETA/masofa + dest-arrival | **Talab 2** | Yandex kalit+billing |
| **3 — To'xtash + smena hisoboti** | to'xtash holat-mashinasi (§7) + `DriverShift` yig'ma + kun-izi/smena hisoboti | **Talab 3** + grafiksiz ish hisobi | yo'q |

**Tavsiya:** Faza 0'dan — mavjud ping-oqimidan darhol jonli xarita chiqadi, hali tashqi API/native ilovaga bog'liq emas.

---

## 12. Gate va testlar (har faza)

- **Backend:** typecheck 0 · biome 0 · Vitest — to'xtash holat-mashinasi (§7 ostonalar), ETA-dedup/throttle, geocode-kesh, DriverTrip/DriverShift o'tishlari, `field`↔`geofence` shoxlanishi (geofence-attendance regressiyasi YO'Q).
- **Xavfsizlik:** ping faqat `field` xodimda field-shoxga, faqat o'z accountига; Yandex kaliti frontend'ga chiqmaydi.
- **Native:** oflayn-bufer flush, foreground-service tirik qolishi, ruxsat-rad holati.
- **Status yorlig'i (HALOL):** har faza «strukturaviy tayyor / runtime-tasdiqlangan» deб aniq belgilanadi (CLAUDE.md §1).

---

## 13. Ochiq savollar / xavflar

1. **Yandex billing** — kunlik so'rov hajmi × narx? (haydovchilar soni × faol trip'lar). 2GIS bilan taqqoslash kerak.
2. **«Yetkazib berish manzili» maydoni** — demand/sotuv sxemasида aniq qaysi ustunда? (geocode manbai; implementatsiyада tasdiqlanadi).
3. **Android background-location Play Store siyosati** — fon-lokatsiya ilovalari qo'shimcha ko'rik talab qiladi (to'g'ridan-APK bu bosqichда chetlab o'tadi).
4. **Bir haydovchi — bir necha yetkazma** (marshrut-optimizatsiya/ketma-ketlik) — bu TZ **bitta faol trip**ni qamraydi; ko'p-nuqta marshrut = TZ v2.
5. **Realtime miqyosi** — ko'p haydovchi × tez-ping → SSE batch/throttle (§6) kifoyami yoki WS+Redis kerakmi (Faza 3'да o'lchanadi).

---

## 14. Nima QAYTA ISHLATILADI (noldan emas)

- `attendance-geo/ping-ingest.service` — ping ingest + anti-cheat (shohlantiriladi).
- `attendance-geo/haversine.util` · `jump-filter.util` · `geofence.util` — masofa/anti-jump/geofence (to'xtash + dest-arrival uchun).
- `HrLocationPing` (kengaytiriladi) · `HrRole`/`Employee.hrRoles` (haydovchi roli). *(Dest-geofence — alohida `HrWorkLocation` emas, `DriverTrip.destLat/Lng` atrofida haversine-radius.)*
- Mavjud auth/JWT (native ilova kirishи) · SSE `/notifications/stream` (realtime push).
- `davomat-ping-cleanup.cron` — 7-kunlik ping tozalash (o'zgarmaydi).
