# Sherset Kassa — Electron o'rami (`desktop/`)

> Holat: **F2 — Phase-1 (strukturaviy, runtime-tasdiqlanmagan).** Bu papka kod
> darajasida tayyor, lekin **hech qachon ishga tushirilmagan** (parallel to'lqin
> qoidasi: F2 sessiyasida `pnpm install` va Electron ishga tushirish qilinmadi).
> Chop etish — **F3**, installer va avtoyangilanish — **F4**.

## Nima qiladi

Yupqa kiosk o'ram (spec §3.1): savdo mantiqi web ilovasida qoladi, bu jarayon faqat

1. kiosk `BrowserWindow` ochadi va do'kon serveridagi `/kassa-kirish` ni yuklaydi;
2. qurilma kalitini (`deviceId`/`deviceSecret`) **Windows DPAPI** (`safeStorage`) bilan
   shifrlab saqlaydi — brauzer `localStorage` ига tushmaydi;
3. aloqa uzilganda Chrome xato sahifasi o'rniga «server bilan aloqa yo'q» ekranini
   ko'rsatadi, fonda `/api/v1/health` ni so'rab turadi va tiklanganda **o'zi** qaytadi.

## Fayllar

| Fayl | Vazifasi |
|---|---|
| `main.js` | kiosk oyna, klaviatura qulflari, IPC, offline ekran, tashqi havolalar |
| `preload.js` | `contextBridge` → `window.electronAPI` (eski exe shartnomasi) + `window.shersetShell` |
| `device-store.js` | `%APPDATA%/<app>/kassa-config.json` — server manzili (ochiq) + qurilma kaliti (DPAPI) |
| `setup.html` | birinchi ishga tushish: server manzili so'raladi |
| `offline.html` | aloqa yo'q ekrani + qayta urinish |

## Ishga tushirish (dasturchi)

```bash
pnpm install --filter @moysklad/desktop      # bir marta (electron yuklab olinadi ~100 MB)
pnpm --filter @moysklad/desktop dev          # yoki:  pnpm --filter ./desktop dev
```

Server manzilini oldindan berish (setup ekranini o'tkazib yuborish):

```bash
SHERSET_SERVER_URL=http://localhost:3100 pnpm --filter @moysklad/desktop dev
```

Manzil **kodga qotirilmagan** (spec §3.2): avval konfiguratsiya fayli, keyin
`SHERSET_SERVER_URL`, ikkalasi ham bo'lmasa `setup.html` so'raydi.

## Operator uchun

- **Chiqish:** `Ctrl + Alt + Shift + Q`. Boshqa yo'l yo'q — `Alt+F4`, `Ctrl+W` va
  oyna tugmalari ataylab bloklangan (kassir savdo o'rtasida oynani yopib qo'ymasin).
- **Qurilmani juftlash:** ilova ichida `/kassa-kirish` → «Juftlash» → admin login →
  do'kon/kassa/tashkilot tanlanadi. Kalit shu kompyuterda DPAPI bilan shifrlanadi.
- **Qurilmani bekor qilish (unpair):** hozircha UI'da tugma **YO'Q** (F1 dan qolgan
  qarz). Vaqtinchalik yo'l — `%APPDATA%/<app>/kassa-config.json` faylidagi `device`
  maydonini o'chirish yoki faylni butunlay o'chirish.
- **Shifrlash mavjud bo'lmasa** (`safeStorage` ishlamaydigan tizim) qurilma kaliti
  **saqlanmaydi** va ekranda xato chiqadi — kalit hech qachon ochiq yozilmaydi.

## Hali yo'q (keyingi fazalar)

- **F3:** `printSheet` / `listPrinters` / mijoz-ekran (`pushCart`,
  `toggleCustomerDisplay`, `customerDisplayStatus`) — hozir IPC ishlovchilari
  **ochiq xato** qaytaradi («F3 da ulanadi»), jimgina «ok» demaydi.
  Mijoz-ekran oynasi uchun alohida `preload-customer.js` kerak bo'ladi —
  `apps/web/src/app/customer-display/page.tsx` `window.customerDisplay.onCart(...)`
  ni kutadi.
- **F4:** `build/icon.ico`, `electron-builder` (NSIS) konfiguratsiyasi,
  `electron-updater` simlari, SmartScreen bo'yicha yo'riqnoma.
