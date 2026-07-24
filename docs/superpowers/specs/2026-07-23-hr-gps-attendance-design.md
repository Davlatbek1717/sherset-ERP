# TZ — HR GPS-davomat (avtomatik keldi/ketdi) — Dizayn hujjati

**Sana:** 2026-07-23 · **Modul:** HR → Xodimlar → Davomat · **Holat:** dizayn tasdiqlangan, TZ

## 1. Maqsad

Xodimlar ish joyiga kelib-ketishini **avtomatik GPS-geofence** orqali qayd qilish: xodim ertalab korxona radiusiga kirganda avto «keldi» + vaqti, radiusdan chiqqanda avto «ketdi». Kunma-kun ish jadvaliga nisbatan **kechikish daqiqalari** hisoblanadi va **oylik hisobotda** ko'rsatiladi. Mavjud `HrAttendance` + `ShiftSchedule` tizimini kengaytiradi (noldan emas).

## 2. Tasdiqlangan qarorlar (aniqlashtirishdan)

| # | Qaror | Tanlov |
|---|---|---|
| GPS-manba | **Brauzer PWA** (native/telegram emas) — `navigator.geolocation.watchPosition` | veb-sahifa |
| Ishlash-modeli | **PWA ochiq turadi, to'liq-avto** — watchPosition geofence kirish/chiqishni tutadi (tugma yo'q) | to'liq-avto |
| Geofence ko'lami | **Bir nechta filial** — har biri lat/lng/radius; xodim filialga biriktiriladi | multi-branch |
| Kechikish | **Grace-siz (qattiq)** — jadval-boshlanishdan 1 daqiqa kechiksa ham hisoblanadi | 0 grace |
| Payroll | Bu bosqichda **faqat hisobot** (avto-jarima YO'Q) | report-only |

## 3. Arxitektura va oqim

```
Xodim telefoni — brauzer PWA (ochiq, ekranda)
   │  watchPosition → {lat, lng, accuracy, ts}
   │  POST /hr/attendance/ping   (har ~45s yoki >20m siljishda; batareya-do'st)
   ▼
Backend (NestJS + Prisma)
   1. Xodim → biriktirilgan HrWorkLocation (filial) geofence: {lat, lng, radiusMeters}
   2. Haversine masofa → insideGeofence = distance ≤ radius (accuracy-marjini bilan)
   3. Ping validatsiya (anti-cheat): accuracy chegarasi + sakrash-filtri
   4. HOLAT-MASHINASI (per-xodim, per-kun):
        tashqari → ichkari (barqaror N ping)  ⇒  KELDI  → HrAttendance.checkIn (agar bugun ochiq yozuv yo'q bo'lsa)
        ichkari  → tashqari (debounce ~3 min) ⇒  KETDI  → HrAttendance.checkOut
   5. KELDI'da → o'sha kun EmployeeWorkSchedule.startTime bilan solishtir → lateMinutes
   6. WebSocket/poll → PWA'da holat yangilanadi («Ish joyida ✓»)
```

**Nega ping-holat-mashinasi (raw-toggle emas):** GPS radius chegarasida «titraydi» (ichkari↔tashqari sakrash). Barqarorlik uchun: KELDI = ketma-ket **≥2 ping ichkarida**; KETDI = **≥3 min uzluksiz tashqarida** (debounce). Bu soxta keldi/ketdi'ni oldini oladi.

## 4. Ma'lumot modeli

### 4.1 Yangi model — `HrWorkLocation` (filial/geofence)
```prisma
model HrWorkLocation {
  id           String  @id @default(uuid()) @db.Uuid
  accountId    String  @map("account_id") @db.Uuid
  name         String  @db.VarChar(150)          // "Bosh ofis", "Chilonzor filiali"
  lat          Float                              // markaz kenglik
  lng          Float                              // markaz uzunlik
  radiusMeters Int     @default(150)              // geofence radiusi (m)
  archived     Boolean @default(false)
  createdAt    DateTime @default(now()) @map("created_at") @db.Timestamptz()
  updatedAt    DateTime @updatedAt @map("updated_at") @db.Timestamptz()
  account   Account    @relation(fields: [accountId], references: [id], onDelete: Cascade)
  employees Employee[]
  @@index([accountId, archived])
  @@map("hr_work_locations")
}
```

### 4.2 `Employee` kengaytirish
```prisma
  workLocationId  String?  @map("work_location_id") @db.Uuid   // biriktirilgan filial
  workLocation    HrWorkLocation? @relation(fields: [workLocationId], references: [id], onDelete: SetNull)
  attendanceOptIn Boolean  @default(false) @map("attendance_opt_in")  // GPS-kuzatuvga ruxsat berilgan
```

### 4.3 Yangi model — `EmployeeWorkSchedule` (kunma-kun jadval, har xodimga 7 qator)
```prisma
model EmployeeWorkSchedule {
  id         String  @id @default(uuid()) @db.Uuid
  accountId  String  @map("account_id") @db.Uuid
  employeeId String  @map("employee_id") @db.Uuid
  weekday    Int     // 0=Yakshanba … 6=Shanba (Postgres/JS DOW konventsiyasi — implementatsiyada qat'iy belgilanadi)
  startTime  String  @map("start_time") @db.VarChar(5)  // "09:00"
  endTime    String  @map("end_time")   @db.VarChar(5)  // "18:00"
  isDayOff   Boolean @default(false) @map("is_day_off")  // dam olish kuni (jadval yo'q)
  account  Account  @relation(fields: [accountId], references: [id], onDelete: Cascade)
  employee Employee @relation("EmployeeSchedule", fields: [employeeId], references: [id], onDelete: Cascade)
  @@unique([employeeId, weekday])   // har xodimga har kun bitta qator
  @@index([accountId, employeeId])
  @@map("employee_work_schedules")
}
```
> Vaqt-zona: barcha ish-vaqtlari **korxona lokal vaqti** (Asia/Tashkent, UTC+5). `startTime`/`endTime` lokal HH:MM; taqqoslash lokal kalendar-kun bo'yicha. UTC saqlash + lokal-render.

### 4.4 `HrAttendance` kengaytirish (mavjud model)
```prisma
  // mavjud: checkInTime, checkOutTime, editedById, editedAt, notes
  checkInLat      Float?   @map("check_in_lat")
  checkInLng      Float?   @map("check_in_lng")
  checkInAccuracy Int?     @map("check_in_accuracy")   // metr
  checkOutLat     Float?   @map("check_out_lat")
  checkOutLng     Float?   @map("check_out_lng")
  source          String   @default("auto_gps") @db.VarChar(12)  // 'auto_gps' | 'manual'
  lateMinutes     Int      @default(0) @map("late_minutes")       // KELDI'da hisoblanadi (grace-siz)
  workLocationId  String?  @map("work_location_id") @db.Uuid      // qaysi filial geofence'ida
  autoClosed      Boolean  @default(false) @map("auto_closed")    // ketish topilmay jadval-oxirida yopilgan
```

### 4.5 Yangi model — `HrLocationPing` (GPS-oqim, audit + holat-mashina manbai)
```prisma
model HrLocationPing {
  id         String   @id @default(uuid()) @db.Uuid
  accountId  String   @map("account_id") @db.Uuid
  employeeId String   @map("employee_id") @db.Uuid
  lat        Float
  lng        Float
  accuracy   Int                                    // metr
  inside     Boolean                                // geofence ichida edimi
  createdAt  DateTime @default(now()) @map("created_at") @db.Timestamptz()
  @@index([accountId, employeeId, createdAt(sort: Desc)])
  @@map("hr_location_pings")
}
```
> **Saqlash siyosati:** ping'lar **7 kun** saqlanadi (audit/nizo uchun), keyin cron bilan o'chiriladi — faqat `HrAttendance` (keldi/ketdi/kechikish) doimiy qoladi. Ma'lumot-hajmi va maxfiylik uchun.

## 5. Geofence + keldi/ketdi mantig'i (backend)

**Masofa:** Haversine (yer sferik) — `distance(pingLat/Lng, location.lat/Lng)`.
**Ichkarida:** `distance ≤ radiusMeters + min(accuracy, 50)` (GPS-xatolik marjini; lekin accuracy juda katta bo'lsa cheklanadi).

**Holat-mashina (xodim uchun, kunlik):**
- **KELDI shart:** ochiq (checkOut'siz) bugungi yozuv YO'Q **va** ketma-ket ≥2 ping `inside=true`. → `HrAttendance` yaratiladi: `checkInTime=now, checkInLat/Lng/Accuracy, source='auto_gps', workLocationId`, `lateMinutes` hisoblanadi.
- **KETDI shart:** ochiq yozuv bor **va** ≥3 min uzluksiz `inside=false` (debounce). → `checkOutTime=now, checkOutLat/Lng`.
- **Bir kun bir necha kir/chiqish:** birinchi KELDI + oxirgi KETDI kunlik yozuvni belgilaydi (oraliq chiqishlar ping-tarixida qoladi, lekin check-in/out qayta ochilmaydi). *(Muqobil: har kir/chiqish alohida yozuv — TZ v2, hozircha kunlik-yagona.)*

## 6. Kechikish hisobi + kelmagan kun

- **lateMinutes** = `max(0, floor((checkInTime − todayScheduleStart) / 60s))`. Grace = 0.
  - `todayScheduleStart` = `EmployeeWorkSchedule[weekday=bugun].startTime` lokal vaqtda. Agar `isDayOff` yoki jadval yo'q → kechikish 0 (dam olish kuni).
- **Kelmagan kun:** kun-oxirida cron: jadval bor (isDayOff=false) lekin bugun `HrAttendance` yo'q → «kelmadi» (absent) — hisobotda alohida sanaladi. (Alohida jadval saqlash shart emas — hisobot jadval×attendance'dan hisoblaydi.)
- **Auto-checkout:** kun-oxirida (yoki jadval-endTime + bufer) ochiq qolgan yozuv → `checkOutTime = scheduleEnd, autoClosed=true` (PWA yopilib ketish topilmagani). HR qo'lda tuzatishi mumkin.

## 7. Oylik hisobot

Xodim × oy bo'yicha (jadval × attendance'dan hisoblanadi, denormalizatsiyasiz):
- Jami **kechikish daqiqalari** (∑ lateMinutes), o'rtacha kechikish.
- **Kelgan / kelmagan / dam** kunlar soni.
- Ishlangan taxminiy vaqt (∑ checkOut−checkIn).
- Kun-bo'yicha detal (keldi/ketdi/kechikish, rangli), qo'lda-tuzatilganlari belgili.
- **Payroll:** bu bosqichda faqat ko'rsatiladi (avto-jarima yo'q). Kelajakda `salaryConfig`'ga kechikish-jarima qoidasi ulanishi mumkin (TZ v2).

## 8. Anti-cheat + maxfiylik

**Anti-cheat (soxta GPS'ga qarshi, bosqichma):**
- `accuracy > 100m` ping → holat-mashinaga kiritilmaydi (ishonchsiz).
- **Sakrash-filtri:** ketma-ket ping'lar orasida imkonsiz tezlik (masalan 2s'da >2km) → rad.
- Debounce (≥2 kel / ≥3min ket) tasodifiy bitta-ping'ni bloklaydi.
- *(v2: mock-location bayrog'i (agar PWA API bersa), ip-geo cheki.)*

**Maxfiylik (mehnat-huquqi/consent):**
- `attendanceOptIn` — xodim bir marta ruxsat beradi (PWA'da consent-ekran); ruxsatsiz kuzatuv yo'q.
- GPS faqat ish-kuzatuv kontekstida (PWA ochiq); ping'lar 7 kun, keyin o'chadi.
- Xodim o'z davomat-tarixini ko'ra oladi (shaffoflik).

## 9. UX — uch yuza

**A. Xodim PWA** (`/hr/davomat`, mobil-birinchi, «Ish joyiga qo'shish» mumkin):
- Birinchi kirishda: consent + geolocation-ruxsat so'rovi.
- Asosiy ekran: katta holat — «🟢 Ish joyida» / «🔴 Ish joyidan tashqarida» + bugungi keldi (HH:MM, kechikish bo'lsa qizil) / ketdi.
- Ochiq turishi kerakligi haqida eslatma (screen-wake yoki «ochiq tuting» ko'rsatma).

**B. Admin sozlash** (HR settings — yangi):
- **Filiallar:** ro'yxat + qo'shish (nom, xarita-picker YOKI lat/lng qo'lda, radius m). *(Xarita-picker: Leaflet+OSM — tashqi kalit shart emas; MVP'da lat/lng qo'lda ham bo'ladi.)*
- **Xodim jadvali:** xodim tanlab → 7 kunlik grid (Du–Ya, start/end/dam) + «boshqa kunlarga ko'chir» tugma.
- **Xodim → filial** biriktirish (employee kartasida).

**C. HR davomat + hisobot** (mavjud `hr/attendance` kengaytir):
- Kunlik ko'rinish: xodimlar × keldi/ketdi/kechikish (rangli — kechikkan qizil, kelmagan kulrang), qo'lda-tuzatish.
- Oylik hisobot: §7 bo'yicha, eksport (Excel/PDF — mavjud infra).

## 10. Edge-case'lar

- **Bir kunda ko'p kel/chiqish** (tushlik) → kunlik birinchi-keldi/oxirgi-ketdi (§5). Tushlik-chiqishi kechikish/ketishga ta'sir qilmaydi (radius kichik bo'lsa tushlik ichkarida qoladi; radius/tushlik siyosati filialga qarab).
- **PWA yopilgan / batareya o'lgan** → ketish topilmaydi → §6 auto-checkout + HR tuzatish.
- **Bir necha filial yaqin** → xodim faqat O'Z biriktirilgan filiali geofence'i bilan tekshiriladi.
- **Jadvalsiz xodim** (ish-vaqti kiritilmagan) → kechikish 0, faqat keldi/ketdi qayd.
- **Vaqt-zona / yarim-tunda smena** → hozircha bir xil kun ichidagi smena (start<end). Tungi smena (end<start, ertaga o'tuvchi) = TZ v2.
- **GPS-ruxsat rad etilgan** → avto-davomat ishlamaydi; HR qo'lda kiritadi (source='manual').

## 11. Ko'lamdan tashqari (v2 / kelajak)

- Native/Telegram-live-location manbasi (fon-kuzatuv ishonchliroq).
- Bir kun ko'p kir/chiqish alohida yozuv.
- Tungi smena (kun-oshib).
- Payroll avto-jarima (kechikish → oylik).
- Yuz-ID / QR qo'shimcha tasdiq.
- Mock-location aniqlash.

## 12. Ochiq savollar (implementatsiyadan oldin)

1. **Xarita-picker** MVP'da kerakmi yoki lat/lng qo'lda kiritish yetarlimi? (Leaflet+OSM tashqi-kalitsiz mumkin.)
2. **Filial radiusi** default nechi metr? (150m taklif — bino+hovli. Kattaroq bino uchun sozlanadi.)
3. **Ping chastotasi** — 45s maqbulmi (batareya vs aniqlik)? 
4. **Tushlik/oraliq chiqish** kechikish-hisobiga ta'sir qilsinmi yoki faqat kunlik keldi/ketdi? (Hozir: faqat kunlik.)
