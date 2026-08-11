# Sherset Kassa — Electron o'rami (`desktop/`)

> Holat: **F3 — Phase-1 (strukturaviy, runtime-tasdiqlanmagan · printer-tasdiqlanmagan).**
> Bu papka kod darajasida tayyor, lekin **hech qachon ishga tushirilmagan**
> (parallel to'lqin qoidasi: F2/F3 sessiyalarida `pnpm install` ham, Electron ham
> ishga tushirilmadi). Chop etish va mijoz-ekran **ulandi** (F3), lekin hech bir
> printerda va hech bir 2-monitorda **o'lchanmagan** — «Chop etishni o'lchash»
> bo'limiga qarang. Installer va avtoyangilanish — **F4**.

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
| `preload-customer.js` | mijoz-ekran oynasining ALOHIDA ko'prigi → `window.customerDisplay.onCart(cb)` |
| `device-store.js` | `%APPDATA%/<app>/kassa-config.json` — server manzili (ochiq) + qurilma kaliti (DPAPI) |
| `setup.html` | birinchi ishga tushish: server manzili so'raladi |
| `offline.html` | aloqa yo'q ekrani + qayta urinish |

## Ishga tushirish (dasturchi)

🔴 `desktop/` monorepo workspace'iga **kirmaydi** (sabab `pnpm-workspace.yaml`
izohida: `--frozen-lockfile` CI'ni sindirardi). Shuning uchun bog'liqliklar shu
papkaning ICHIDA, alohida o'rnatiladi:

```bash
cd desktop
pnpm install            # bir marta (electron ~200 MB yuklab olinadi)
pnpm run dev            # = electron .
```

Server manzilini oldindan berish (setup ekranini o'tkazib yuborish):

```bash
cd desktop && SHERSET_SERVER_URL=http://localhost:3100 pnpm run dev
```

`desktop/node_modules` va `desktop/pnpm-lock.yaml` monorepo lockfile'iga
ta'sir qilmaydi.

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

## Chop etish (F3)

- `listPrinters()` → `webContents.getPrintersAsync()` nomlari. 🔴 Sinxron
  `getPrinters()` Electron 25+ da olib tashlangan — ishlatilmaydi.
- `printSheet(printerName, html, pageSizeMicrons?)` → HTML **vaqtinchalik faylga**
  yoziladi (`%TEMP%`, UTF-8; `data:` URL emas — uzun chek va kirill uchun),
  yashirin `BrowserWindow` uni renderlaydi, so'ng
  `webContents.print({ silent: true, deviceName, margins: none, pageSize })`.
  Qog'ozga **Windows drayveri** bosadi ⇒ ESC/POS kodpage muammosi yo'q.
- **Qog'oz o'lchami:** web `pageSizeMicrons` bersa (senik/label) — o'sha; bermasa
  eni 80mm, **bo'yi mazmun bo'yicha** (`scrollHeight` × 264.58 mkm + 4mm quyruq).
  Aks holda drayver har chek uchun A4 gacha cho'zib qog'oz sarflardi.
- **Vaqt chegaralari:** render 15s, chop 60s. Chegara urilsa `{ ok:false, error }`
  qaytadi — va'da hech qachon osilib qolmaydi (kassir tugmasi muzlab turmaydi).
- **Uch qatlamli fallback buzilmagan:** `electronAPI.printSheet` → HTTP agent
  (`127.0.0.1:17777`) → brauzer popup. 🔴 Qobiq ichida web HTTP agentga
  **qaytmaydi** — shuning uchun bu yerdagi xato oxirgi so'z va jim `ok`
  qaytarish taqiqlanadi.
- **Pul yashigi impulsi (cash drawer kick) — YO'Q (qarz).** `webContents.print`
  faqat drayverga hujjat beradi; ESC/POS `ESC p` impulsi uchun printerga XOM
  bayt yuborish kerak, buni Electron API'si qila olmaydi. Ikki mumkin yo'l
  (ikkalasi ham F3 dan tashqarida): (a) chekni yashik impulsi bilan boshlanadigan
  drayver profiliga bosish, (b) xom baytni HTTP agent orqali yuborish.

## Mijoz-ekran (F3)

- `toggleCustomerDisplay()` → `screen.getAllDisplays()` da ikkinchi displey
  bo'lsa o'sha bounds'da ramkasiz fullscreen oyna, `<server>/customer-display`.
  Ikkinchi ekran yo'q bo'lsa `{ open:false, error }` (web buni toast qiladi).
- Savat: kassir sahifasi `pushCart(payload)` → main (`cfd:push`) →
  `preload-customer.js` (`cfd:cart`) → sahifadagi `onCart(cb)`. Main **oxirgi
  savatni saqlaydi** va oyna yuklangach darhol yuboradi — aks holda ekran
  keyingi o'zgarishgacha bo'sh turardi.
- 🔴 Mijoz-oynaga alohida `partition` **berilmaydi**: sahifa `refresh()` bilan
  kassir bilan umumiy cookie sessiyasidan token oladi.
- Kassir oynasi yopilsa mijoz-ekran ham yopiladi (aks holda `window-all-closed`
  otilmay, ilova ko'rinmas holda tirik qolardi).

## Chop etishni o'lchash (HALI BAJARILMAGAN)

Bu qadamlar birinchi qo'lda o'lchashda bajarilsin (virtual PDF-printer ham
hisoblanadi — real chek printeri shart emas):

1. `cd desktop && pnpm install` → `SHERSET_SERVER_URL=http://localhost:3100 pnpm run dev`.
2. Windows'da «Microsoft Print to PDF» ni Sozlamalar → chek printeri qilib tanlang;
   `listPrinters()` ro'yxatida ko'ringanini tekshiring (ro'yxat bo'sh bo'lsa —
   `getPrintersAsync` muammosi).
3. Sotuvni rasmiylashtiring → PDF faylda: kirill/o'zbekcha **buzilmaganini**,
   eni 80mm, uzunligi chek mazmuniga mos ekanini tekshiring (A4 chiqsa — o'lcham
   hisobi ishlamagan).
4. Yacheykali chek (`printPickingViaAgent`) va Z-hisobot ham shu yo'ldan chiqsin.
5. Noto'g'ri printer nomi bilan bir marta bosing — kassirga **xato ko'rinishi**
   shart (jim yo'qolgan chek emas).
6. Mijoz-ekran: HDMI bilan 2-monitor ulang → Sotuv panelidagi tugma (yoki `F9`) →
   ekran ochilishi, savat qo'shilganda **darhol** yangilanishi, tugma ikkinchi
   bosilganda yopilishi. Monitorsiz holatda xato toast'i chiqishi.

## Hali yo'q (keyingi fazalar)

- **F4:** `build/icon.ico`, `electron-builder` (NSIS) konfiguratsiyasi,
  `electron-updater` simlari, SmartScreen bo'yicha yo'riqnoma.
- **Pul yashigi impulsi** — yuqoridagi qarz.
