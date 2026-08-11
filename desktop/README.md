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

- **Chiqish — ikki yo'l** (2026-08-11 da ikkinchisi qo'shildi):
  1. `Ctrl + Alt + Shift + Q` — klaviatura bilan;
  2. **chap YUQORI burchakni 2 soniya bosib turish** — barmoq bilan, so'ng
     tasdiq dialogi («Chiqish» / «Bekor qilish»).

  Ikkinchisi SENSORLI monoblok uchun MAJBURIY edi: klaviatura ulanmagan
  qurilmada ilovani umuman yopib bo'lmasdi (real hodisa). Imo **passiv**
  tinglovchilar bilan qilingan — burchakdagi haqiqiy tugmalar to'silmaydi;
  2 soniya + barmoq siljisa bekor + tasdiq dialogi = tasodifan chiqib
  ketmaydi. `Alt+F4`, `Ctrl+W` va oyna tugmalari kiosk holatida ataylab
  bloklangan.

- **Kiosk FAQAT juftlashdan keyin.** Qurilma juftlanmagan bo'lsa ilova oddiy
  (ramkali, maksimal) oynada ochiladi — Windows ekran klaviaturasi uning
  ustida normal ishlaydi, ya'ni klaviaturasiz monoblokda ham server manzilini
  va juftlash parolini kiritish mumkin. Juftlangan zahoti ilova **o'zi qayta
  ishga tushadi** va kiosk rejimida qulflanadi. Sozlash oynasini oddiy «X»
  bilan yopsa bo'ladi (hali kassir yo'q, qulflaydigan narsa ham yo'q).
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

1. `cd desktop && pnpm install --ignore-workspace` → `SHERSET_SERVER_URL=http://localhost:3100 pnpm run dev`.
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

- **F3 (bajarildi):** `printSheet` / `listPrinters` / mijoz-ekran (`pushCart`,
  `toggleCustomerDisplay`, `customerDisplayStatus`) ulandi va `preload-customer.js`
  qo'shildi — yuqoridagi «Chop etish» va «Mijoz-ekran» bo'limlariga qarang.
  Hech bir printerda va hech bir 2-monitorda **o'lchanmagan**.
- **F4 (bajarildi, pastga qarang):** `electron-builder` (NSIS) konfiguratsiyasi,
  `electron-updater` simlari, nginx kanali va operator yo'riqnomasi tayyor.
  🔴 Qolgan yagona narsa — `build/icon.ico` (binar fayl, repo'da YO'Q).

---

## Installer yig'ish (`.exe`)

> 🔴 **Bu yerdagi qadamlar HECH QACHON yugurtirilmagan.** F4 sessiyasida
> `electron` va `electron-builder` ataylab o'rnatilmadi (~200 MB, foydalanuvchi
> rozilik bermagan). Ya'ni konfiguratsiya **strukturaviy** — «.exe yig'iladi»
> degan da'vo hozircha tasdiqlanmagan.

Konfiguratsiya `package.json` ning `build` blokida turadi (alohida
`electron-builder.yml` EMAS). Sabab: `build` blokini qo'riqchi test
(`apps/web/src/__tests__/kassa-installer-config.test.ts`) `JSON.parse` bilan
o'qiy oladi — monorepoda YAML parseri yo'q (`yaml`/`js-yaml` na ildizda, na
`apps/web`, na `apps/api` da resolve bo'lmaydi), shuning uchun YAML variantida
qo'riqchi qo'lda yozilgan soxta parserga suyanardi.

### 0. Ikonka — operator qo'shadi

```
desktop/build/icon.ico     ← .gitignore'da emas, shunchaki repo'da YO'Q (binar)
```

Talab: ko'p o'lchamli `.ico`, kamida **256×256** (electron-builder shuni
talab qiladi). U bo'lmasa `pnpm run dist` **birinchi qadamda to'xtaydi**:

```
[dist] Yig`ish TO`XTATILDI — kerakli fayllar yo`q:
  desktop/build/icon.ico
      Windows installer va yorliq ikonkasi. Kamida 256×256, ko`p o`lchamli .ico.
```

Bu to'siq (`check-build-assets.js`) ataylab qo'yilgan: usiz electron-builder
ning o'z xulqi ikki xil bo'lishi mumkin — yo tushunarsiz xato, yoki eng
yomoni **default Electron ikonkasi bilan jim davom etish** (kassa PC'sida
Electron logotipli «Sherset Kassa» paydo bo'lardi). Qaysi biri ekani
**o'lchanmagan** — shuning uchun qo'riqchi javobni deterministik qiladi.

### 1. Yig'ish

```bash
cd desktop
pnpm install            # bir marta (electron + electron-builder ≈ 200 MB)
pnpm run dist           # = node check-build-assets.js && electron-builder --win nsis
```

Natija (hozirgi `version: 1.1.1` uchun):

```
desktop/dist/Sherset-Kassa-Setup-1.1.1.exe
desktop/dist/Sherset-Kassa-Setup-1.1.1.exe.blockmap
desktop/dist/latest.yml
```

Fayl nomi `build.win.artifactName` dan keladi va `${version}` ni
`package.json` dagi versiyadan oladi — nom hech qachon qo'lda yozilmaydi.
🔴 Versiyani ko'targanda **shu yerdagi nomni ham** yangilang — qo'riqchi test
(`kassa-installer-config.test.ts`) ikkalasi mos kelishini talab qiladi.

### 2. Imzo — 1-versiya IMZOSIZ (spec §8.2, ongli qaror)

Kod imzolash sertifikati hozircha yo'q. Sertifikat olingach `build.win` ga
`certificateFile` / `certificatePassword` **muhit o'zgaruvchisi orqali**
qo'shiladi — kod o'zgarmaydi. 🔴 Sertifikat va parol repo'ga **hech qachon**
yozilmaydi (qo'riqchi test `package.json` da bu kalitlar yo'qligini tekshiradi).

---

## Operator: o'rnatish va SmartScreen ogohlantirishi

Installer imzosiz bo'lgani uchun Windows uni **birinchi marta** to'sadi.
Bu normal, viruz emas — bir marta ruxsat berilgach qaytarilmaydi.

1. `Sherset-Kassa-Setup-<versiya>.exe` ni ishga tushiring.
2. **«Windows защитил ваш компьютер»** (SmartScreen) ko'k oynasi chiqadi.
3. **«Подробнее»** (Дополнительно / More info) ni bosing — yashirin tugma ochiladi.
4. **«Выполнить в любом случае»** (Все равно запустить / Run anyway) ni bosing.
5. UAC («Разрешить приложению вносить изменения?») → **«Да»**.
   Ilova **hamma foydalanuvchilar uchun** o'rnatiladi (`perMachine: true`),
   shuning uchun administrator huquqi kerak.
6. O'rnatish yo'lini o'zgartirish mumkin (`oneClick: false`), default yetarli.
7. Tugagach ish stoli va «Пуск» da **Sherset Kassa** yorlig'i paydo bo'ladi.

> Agar SmartScreen oynasida «Подробнее» ko'rinmasa — antivirus faylni
> karantinga olgan. Faylni oq ro'yxatga qo'shing yoki qaytadan yuklab oling.

---

## Avtoyangilanish

| Savol | Javob |
|---|---|
| Qayerdan oladi? | Qurilma **juftlangan serverdan**: `<server>` + `/downloads/desktop/` |
| Nimani so'raydi? | avval `latest.yml`, keyin undagi `.exe` |
| Qachon tekshiradi? | ishga tushganda va **har 4 soatda** |
| Qachon yuklaydi? | topilishi bilan, **fonda** (kassir sezmaydi) |
| 🔴 Qachon o'rnatadi? | **faqat kassir «Chiqish» (`Ctrl+Alt+Shift+Q`) bosganda** |
| Xato bo'lsa? | jim — logga yoziladi, savdo to'xtamaydi |

Yangilanish **savdo o'rtasida hech qachon o'rnatilmaydi**: `electron-updater`
ning o'z `autoInstallOnAppQuit` xulqi ataylab **o'chirilgan**
(`desktop/updater.js`), o'rnatish faqat `main.js` → `quitShell()` yo'lida
boshlanadi. Shu shartnoma qo'riqchi test bilan qulflangan.

O'rnatish paytida Windows yana bir marta **UAC** so'raydi (`perMachine: true`
o'rnatishni «jim» qilib bo'lmaydi) — kassani yopayotgan xodim «Да» bosishi
kerak, aks holda yangilanish keyingi «Chiqish» ga qoladi.

### Server tomoni (bir marta, admin)

Kanal — oddiy statik katalog. Nginx `location` uchala konfiguratsiyada bor
(`deploy/nginx-*.conf`), yuklash tartibi va tuzoqlar
`deploy/DEPLOY-sherset.md` → «7. Kassa (Electron) installer + update channel».

```
https://<server>/downloads/desktop/latest.yml
https://<server>/downloads/desktop/Sherset-Kassa-Setup-<versiya>.exe
```

`package.json` → `build.publish[0].url` dagi domen — faqat **build vaqtidagi
default**. Ish paytida manzil qurilma juftlangan serverdan olinadi
(spec §3.2), shuning uchun bitta `.exe` istalgan tenant domenida ishlaydi.

### Ma'lum cheklovlar (o'lchanmagan / qarz)

- **Yig'ish o'lchandi (2026-08-11):** `pnpm install --ignore-workspace` +
  `pnpm run dist` Windows'da o'tdi, `dist/Sherset-Kassa-Setup-1.1.0.exe`
  chiqdi (`build/icon.ico` web brendidan yasaldi — ko'k→binafsha chaqmoq).
  Qolgan oqim (yuklash → topilishi → o'rnatish) **hali yugurtirilmagan**;
  Electron ilovasining o'zi ham hech qachon ishga tushirilmagan.
  Phase-2 (F12, real kassa PC) da o'lchanadi.
- Birinchi reliz **`1.1.0`** — ataylab prerelease EMAS: `electron-updater` ning
  prerelease→reliz o'tishi bu loyihada tekshirilmagan.
- Yangilanish o'rnatilgach ilova **qaytadan ochilmaydi** (`isForceRunAfter: false`) —
  kassir «Chiqish» bosgan edi, demak ish tugagan.
- **Pul yashigi impulsi** — yuqoridagi qarz (Electron API'sida yo'l yo'q).
