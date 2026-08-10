# Kassa .exe + PIN-kirish — dizayn (spec)

> Sana: 2026-08-10 · Holat: **tasdiqlangan dizayn** (implementatsiya rejasi alohida hujjat)
> Buyurtma: «kassa exe'sini tayyorlaymiz; har kassirga o'z PIN-kodi beriladi, o'sha PIN bilan
> ochib kirib savdo qilishadi».

## 1. Maqsad va qamrov

Kassa kompyuterida ishlaydigan **Windows .exe** — kassir uni ochadi, **faqat 4–6 raqamli PIN**
teradi va darhol savdo ekraniga (`/sotuv`) tushadi. Email/parol yo'q, brauzer ko'rinmaydi,
ERP'ning qolgan qismiga yo'l yo'q.

**Qamrovga kiradi:** Electron kiosk-o'ram · qurilma juftlash · PIN-login API · admin tomonidan
PIN berish · chek printeri (native Windows chop etish) · mijoz-ekran · NSIS installer ·
avtoyangilanish.

**Qamrovga KIRMAYDI (halol qarz):** offline savdo (internet uzilsa kassa to'xtaydi — bu
ongli qaror, §3.1) · shtrix-skaner uchun maxsus kod (klaviatura emulyatsiyasi, kod talab
qilmaydi) · pul yashigi impulsi · kod imzolash sertifikati (keyinchalik, §8.2) · macOS/Linux.

## 2. Hozirgi holat (kod bilan tasdiqlangan)

| Narsa | Holat | Manba |
|---|---|---|
| Kiosk rejim (server-side allowlist) | ✅ bor | `apps/api/src/modules/auth/kiosk-policy.ts`, `kiosk.guard.ts` |
| Rol `uiMode='kiosk'` → login'dan keyin `/sotuv` | ✅ bor | `apps/web/src/app/login/page.tsx` |
| POS PIN — **idle-qulf** (5 daq harakatsizlik) | ✅ bor | `pos-pin.service.ts`, `POST /auth/pos-pin/verify` (**JWT talab qiladi**) |
| `Employee.posPinHash` (argon2) | ✅ bor | `schema.prisma:354` |
| PIN bilan **kirish** (tokensiz) | ❌ yo'q | — |
| Admin tomonidan boshqa xodimga PIN berish | ❌ yo'q | mavjud endpoint faqat `CurrentUser` uchun |
| Electron o'ram manba kodi | ❌ **yo'q** | `desktop/` papkasi repo'da, `main` da, git tarixida va diskda topilmadi |
| `window.electronAPI` shartnomasi | ⚠️ **kodda hujjatlangan, implementatsiyasi yo'q** | `apps/web/src/lib/print-agent.ts:23-49` |
| `tools/print-agent` (PowerShell HTTP agent, `127.0.0.1:17777`) | ✅ bor (bu daraxtda emas, `main` da) | `D:/projects/Sherset ERP/tools/print-agent` |

**Eng muhim xulosa:** exe ilgari mavjud bo'lgan (web kodi `v1.0.3`/`v1.0.4`/`v1.0.5` xususiyatlarini
nomma-nom kutadi), lekin manbasi yo'qolgan. Yangi o'ram **shu shartnomani aynan tiklashi shart** —
aks holda chop etish va mijoz-ekran jimgina o'ladi va hech bir gate qizarmaydi.

## 3. Arxitektura

### 3.1 Yupqa o'ram (qaror)

Exe — kiosk `BrowserWindow`, ishlab turgan prod web-ilovani ochadi. Savdo mantiqi ko'chirilmaydi.

**Nega:** kod bir manbada qoladi, deploy qilinganda hamma kassa avtomat yangilanadi, ikkinchi
ma'lumot-modeli va sinxronizatsiya qatlami paydo bo'lmaydi.

**Narxi (ochiq qabul qilingan):** internet uzilsa savdo to'xtaydi. Yumshatish — o'ram Chrome'ning
xato sahifasini emas, «server bilan aloqa yo'q, qayta urinish» ekranini ko'rsatadi va fonda
`/health` ni so'rab turadi; aloqa tiklanganda o'zi qaytadi.

### 3.2 Server manzili sozlanadigan

Repo'da ikki nginx konfiguratsiyasi bor (`climart.biznesjon.uz`, `climartgroup.uz`) va xotirada
uchinchi domen (`erp.sherset.uz`) eslatiladi. Exe domenni **kodga qotirmaydi**: birinchi ishga
tushishda (juftlash ekranida) server manzili kiritiladi va qurilma konfiguratsiyasiga yoziladi.
Build vaqtida default qiymat beriladi.

### 3.3 Uch qatlam

| Qatlam | Joy | Vazifasi |
|---|---|---|
| Electron o'ram | yangi `desktop/` | kiosk oyna · qurilma kaliti · printer · mijoz-ekran · autoupdate |
| Web PIN ekrani | `apps/web/src/app/kassa-kirish` | raqamli klaviatura, faqat PIN |
| API PIN-login | `apps/api/src/modules/auth` | PIN → xodim → token |

## 4. PIN-kirish

### 4.1 Kassir ko'radigan oqim

```
exe ochiladi
  └─ qurilma juftlanganmi?
       ├─ yo'q  → juftlash ekrani (admin: server manzili + login + parol + do'kon/kassa tanlash)
       └─ ha    → PIN klaviaturasi  →  4–6 raqam  →  /sotuv
```

Ro'yxat yo'q, ism yo'q. Kassir faqat raqam teradi.

### 4.2 Qurilma juftlash

Yangi model `PosDevice`:

| Ustun | Tur | Izoh |
|---|---|---|
| `id` | uuid | |
| `accountId` | uuid | |
| `name` | varchar | «1-kassa, markaziy do'kon» |
| `storeId`, `cashDeskId`, `organizationId` | uuid | `CashierSession` aynan shu uchtasini talab qiladi (`schema.prisma` `model CashierSession`) — juftlashda bir marta tanlanadi, kassir har smenada qayta tanlamaydi |
| `secretHash` | varchar | argon2(qurilma maxfiy kaliti) |
| `pairedById` | uuid | kim juftladi (audit) |
| `lastSeenAt` | timestamptz | |
| `revokedAt` | timestamptz? | qurilma yo'qolsa admin bekor qiladi |
| `failedAttempts`, `lockedUntil` | int / timestamptz? | PIN brute-force qulfi (§4.5) |

Maxfiy kalit **faqat bir marta**, juftlash javobida qaytadi. Exe uni Windows DPAPI
(`safeStorage.encryptString`) bilan shifrlab `userData` ichiga yozadi. Serverda faqat xesh qoladi.

Juftlash `POST /auth/pos-device/pair` — **JWT + `employees:update` ruxsati** talab qiladi
(oddiy kassir o'zi qurilma juftlay olmaydi).

### 4.3 PIN → xodimni topish

Argon2 xeshi tuzli, shuning uchun «PIN bo'yicha qidirish» mumkin emas. Ikkinchi ustun qo'shiladi:

- `Employee.posPinHash` — **mavjud**, argon2, *tekshirish* uchun (o'zgarmaydi)
- `Employee.posPinLookup` — **yangi**, `HMAC-SHA256(pin, POS_PIN_PEPPER)` hex, *topish* uchun

`@@unique([accountId, posPinLookup])`. Postgres'da `NULL` lar bir-biriga to'qnashmaydi, shuning
uchun PIN o'rnatilmagan xodimlar cheklovga tushmaydi — qisman indeks kerak emas.

Unique indeks ikki ishni bajaradi:
1. **O(1) topish** — butun xodimlar bo'ylab argon2 sikli emas (20 xodimda ~1 soniya bo'lardi).
2. **Ikki kassirga bir xil PIN berilishini baza darajasida bloklaydi** — PIN-only modelda bu
   majburiy, aks holda kirish noaniq bo'ladi va sotuv noto'g'ri odamga yozilardi.

`POS_PIN_PEPPER` — env sirri, `boot-secrets.ts` naqshi bo'yicha o'qiladi. **Pepper o'zgarsa
hamma `posPinLookup` yaroqsiz bo'ladi** (xesh emas, HMAC — qayta hisoblab bo'lmaydi, chunki
PIN saqlanmaydi) → PIN'lar qayta beriladi. Bu ADR sifatida spec'da qayd etiladi, kodda ham
izohlanadi.

### 4.4 `POST /auth/pos-login`

Kirish: `{ deviceId, deviceSecret, pin }` (tokensiz endpoint).

Ketma-ketlik:
1. `PosDevice` topiladi; `revokedAt` null, `lockedUntil` o'tgan — aks holda 401/423.
2. `argon2.verify(secretHash, deviceSecret)` — mos kelmasa 401 (va qurilma hisoblagichi oshadi).
3. `posPinLookup = HMAC(pin)` bo'yicha xodim topiladi.
4. Xodim topilsa `argon2.verify(posPinHash, pin)` — HMAC to'qnashuviga qarshi ikkinchi to'siq.
5. **Parol-login bilan bir xil qo'riqchilar**: `archived === false`, `lockedUntil`,
   `attributes.__employee_system.loginAllowed`, IP-allowlist. Bular
   `auth.service.ts` dan **umumiy funksiyaga ajratiladi** (nusxa-ko'chirish qilinmaydi — xotira:
   «nusxa-ko'chirish bitta shoxni yo'qotadi»).
6. Muvaffaqiyat: `TokenService` orqali parol-login bilan **aynan bir xil** access/refresh/media
   tokenlar. Javobga qurilmaning `storeId`/`cashDeskId`/`organizationId` qo'shiladi.

Javob **kim ekanini oshkor qilmaydi** xato holatda: PIN topilmasa ham, xodim bloklangan bo'lsa
ham bir xil xabar («PIN noto'g'ri») va bir xil vaqt (dummy argon2 verify — mavjud
`auth.service.ts:55-58` naqshi).

### 4.5 Brute-force himoyasi

PIN-only modelda foydalanuvchi nomi kerak emas, ya'ni 4 raqam = 10 000 variant. Ikki qatlam:

1. **Qurilma juftlash** — `pos-login` faqat to'g'ri `deviceSecret` bilan ishlaydi. Ochiq
   internetdan hujum yo'li yopiladi; hujumchi avval kassa kompyuteriga jismonan kirishi kerak.
2. **Qurilma hisoblagichi** — 5 ketma-ket xato → qurilma 15 daqiqaga qulflanadi (`lockedUntil`),
   menejerga xabar. Hisoblagich **bazada** (xodimniki xotirada — `pos-pin.service.ts` ongli
   qaror), chunki qurilma qulfi jarayon qayta ishga tushganda yo'qolmasligi kerak.

Qo'shimcha: 6 raqamli PIN tavsiya qilinadi, lekin mavjud `POS_PIN_RE = /^\d{4,6}$/` o'zgarmaydi.

### 4.6 Mavjud idle-qulf bilan munosabat

`POST /auth/pos-pin/verify` (JWT bilan, 5 daqiqalik harakatsizlik qulfi) **o'zgarmaydi**. Ikkalasi
boshqa vazifa bajaradi:

| | `pos-pin/verify` | `pos-login` |
|---|---|---|
| Token | talab qiladi | yo'q |
| Nima qiladi | ochiq sessiyani qulfdan chiqaradi (savat saqlanadi) | yangi sessiya beradi |
| Qachon | 5 daq harakatsizlik | exe ochilganda / chiqishdan keyin |

Bitta o'zgarish: kassir «Chiqish» bosganda endi email-login emas, **PIN klaviaturasi** ochiladi.

## 5. Admin tomonidan PIN berish

Yangi `POST /employees/:id/pos-pin` (`employees:update` ruxsati, `PosPinService.setPin` ni
qayta ishlatadi + `posPinLookup` ni ham yozadi). Xodim kartasida «POS PIN» bloki:
holat («o'rnatilgan» / «yo'q»), «PIN berish», «PIN o'chirish».

PIN **hech qachon o'qib bo'lmaydi** — faqat qo'yiladi. Takror PIN kiritilsa unique indeks
23505 beradi → «Bu PIN band, boshqasini tanlang».

Har o'zgarish audit jurnaliga tushadi (kim, kimga, qachon — PIN qiymatisiz).

## 6. Electron o'ram (`desktop/`)

### 6.1 Papka tarkibi

```
desktop/
  package.json          — electron, electron-updater, electron-builder
  main.js               — kiosk oyna, mijoz-ekran, chop etish, autoupdate
  preload.js            — contextBridge → window.electronAPI
  device-store.js       — safeStorage bilan qurilma kaliti + server manzili
  build/icon.ico
  README.md             — o'rnatish va juftlash yo'riqnomasi (operator uchun)
```

### 6.2 Kiosk oyna

`kiosk: true`, `frame: false`, menyu yo'q, `single instance lock`. Prod'da DevTools va
`Ctrl+Shift+I` / `F12` o'chiriladi, `Ctrl+W` / `Alt+F4` ushlanadi (kassir oynani yopa olmasin;
chiqish faqat ilova ichidagi tugma orqali). Tashqi havolalar (`window.open`, `will-navigate`)
tashqi brauzerga uzatiladi — kiosk oynasi hech qachon boshqa saytga ketmaydi.

### 6.3 `window.electronAPI` — eski shartnomani tiklash 🔴

`apps/web/src/lib/print-agent.ts` kutadigan **aynan** shakl:

| Metod | Versiya | Imzo |
|---|---|---|
| `isSherset` | — | `true` |
| `version` | — | `string` |
| `listPrinters()` | bazaviy (versiya izohlanmagan) | `Promise<string[]>` |
| `printSheet(printerName, html, pageSizeMicrons?)` | v1.0.3 | `Promise<{ok, error?}>` |
| `pushCart(payload)` | v1.0.4 | `void` |
| `toggleCustomerDisplay()` | v1.0.5 | `Promise<{open, error?}>` |
| `customerDisplayStatus()` | v1.0.5 | `Promise<{open}>` |

Yangi qo'shiladi: `pair(...)`, `getDevice()`, `clearDevice()`.

**Qo'riqchi (majburiy):** `apps/web/src/__tests__/electron-bridge-contract.test.ts` —
`print-agent.ts` dagi `ElectronBridge` interfeysidan metod nomlarini **manbadan o'qiydi** va
`desktop/preload.js` da har biri `contextBridge` orqali berilganini tekshiradi. Sabab — xotira:
«ombor cheki uch renderer: biri o'zgarsa qolgani jimgina eskiradi». Bu yerda xuddi shu klass:
web tomon yangi metod kutadi, exe bermaydi, typecheck yashil qoladi (`electronAPI` optional).

### 6.4 Chop etish

Yashirin `BrowserWindow` → HTML yuklanadi → `webContents.print({ deviceName, silent: true,
pageSize })`. Windows drayveri renderlaydi, shuning uchun ESC/POS kodpage muammosi yo'q
(kirill va o'zbekcha to'g'ri chiqadi) — bu `print-agent.ts:19-21` izohida tasvirlangan eski
xulq-atvorning aynan o'zi.

`tools/print-agent` (PowerShell, `127.0.0.1:17777`) **zaxira yo'l sifatida qoladi** — web kodi
allaqachon `electronAPI` yo'q bo'lsa unga tushadi; hech narsa olib tashlanmaydi.

### 6.5 Mijoz-ekran

Ikkinchi monitor topilsa (`screen.getAllDisplays().length > 1`) — o'sha displeyda ramkasiz oyna.
`pushCart` savatni `BroadcastChannel` emas, IPC orqali uzatadi. Tashqi ekran yo'q bo'lsa
`toggleCustomerDisplay()` → `{ open: false, error }` (shartnomada shunday).

## 7. Web PIN ekrani

Yangi route `/kassa-kirish`:
- katta raqamli klaviatura (sensorli ekran uchun, min 64px tugmalar), fizik klaviatura ham ishlaydi
- kiritilgan raqamlar nuqta sifatida ko'rinadi
- qurilma nomi va do'kon pastda ko'rsatiladi (kassir to'g'ri kassada ekanini bilsin)
- xato: «PIN noto'g'ri» + qolgan urinishlar soni; qulflanganda qolgan daqiqa
- pastda kichik «Administrator kirishi» havolasi → mavjud `/login` (parol bilan; qurilmani
  qayta juftlash va nosozlik uchun)

Barcha matnlar i18n (`ru` + `uz`) — hardcode yo'q (`i18n:gate` shuni tekshiradi; xotira:
«i18n gate komponentlarni ko'rmaydi» → kalitlar `messages/*.json` ga qo'shiladi va test
key-existence bilan tekshiriladi).

Exe kirish nuqtasi: `/{server}/kassa-kirish`. Token bo'lsa sahifa darhol `/sotuv` ga uzatadi.

## 8. Tarqatish

### 8.1 Installer

`electron-builder` → NSIS (`nsis`, `oneClick: false`, `perMachine: true`). Natija:
`Sherset-Kassa-Setup-<version>.exe`.

### 8.2 Imzolash

**1-versiya imzosiz** (qaror). Windows SmartScreen bir marta «Дополнительно → Все равно
запустить» so'raydi; README'da skrinshot bilan tushuntiriladi. Sertifikat olingach
`build.win.certificateFile`/`certificatePassword` (env orqali) qo'shiladi — **kod o'zgarmaydi**.
Sertifikat va parol repo'ga hech qachon yozilmaydi.

### 8.3 Avtoyangilanish

`electron-updater`, `generic` provider → `https://<server>/downloads/desktop/` (nginx statik
`location`, `latest.yml` + `.exe`). Ishga tushganda va har 4 soatda tekshiriladi; yangi versiya
yuklab olingach **darhol emas**, kassir «Chiqish» bosganda o'rnatiladi — savdo o'rtasida
qayta ishga tushmasligi uchun.

## 9. Testlar va gate'lar

| Qatlam | Test |
|---|---|
| `kiosk-policy` | `pos-login` va `pos-device` yo'llari allowlist bilan mos (mavjud `kiosk-policy.test.ts` kengaytiriladi) |
| `pos-login` (yangi unit) | to'g'ri PIN → token · noto'g'ri PIN → 401 · juftlanmagan qurilma → 401 · bekor qilingan qurilma → 401 · qulflangan qurilma → 423 · arxivlangan xodim → 401 · `loginAllowed=false` → 401 · 5 xatodan keyin qulf |
| PIN unique | ikkinchi xodimga bir xil PIN → 23505 → 400 «PIN band» |
| Pepper | HMAC deterministik; pepper yo'q bo'lsa boot'da xato (jim ishlamasin) |
| DI grafi | `app-boot.test.ts` ga yangi servis qo'shiladi (xotira: «yetim modul = o'lik funksiya») |
| Electron shartnoma | `electron-bridge-contract.test.ts` (§6.3) |
| Web | PIN klaviatura komponent testlari + i18n key-existence ru/uz |
| To'liq gate | typecheck 0 · biome 0 · **api + web** vitest (xotira: «web-only gate apps/api qo'riqchilarini o'tkazib yuboradi») |

**Halol yorliq:** K1–K7 tugaganda natija **«Phase-1: strukturaviy, runtime-tasdiqlanmagan»**.
Real kassa kompyuterida, real printer bilan sinov — K8 (Phase-2 QA).

## 10. Fazalar

| # | Faza | Bajarilgan deb hisoblanadi qachon |
|---|---|---|
| K1 | Migratsiya: `PosDevice` + `Employee.posPinLookup` unique | `prisma migrate` lokal `climart_adopt` da o'tadi |
| K2 | `POST /auth/pos-login` + `pos-device/pair` + rate-limit + testlar | curl bilan token olinadi; §9 testlari yashil |
| K3 | Admin PIN berish endpoint + xodim kartasi UI | admin kassirga PIN beradi, takror PIN rad etiladi |
| K4 | `/kassa-kirish` PIN klaviaturasi + i18n | brauzerda PIN bilan `/sotuv` ga kiriladi |
| K5 | `desktop/` kiosk o'ram + juftlash + `electronAPI` v1.0.5 | `pnpm --filter desktop dev` da PIN bilan kiriladi |
| K6 | `printSheet` + printer ro'yxati + mijoz-ekran | chek chiqadi |
| K7 | electron-builder NSIS + autoupdate + nginx `location` | `.exe` fayl qo'lda, yangilanish kanali tirik |
| K8 | Phase-2 QA real kassa PC'da | «Phase-2 verified» |

**Vaqt bahosi (halol):** K1–K4 bir sessiya. K5–K7 ikkinchi sessiya. «Bugun exe qo'lda» —
faqat hamma narsa birinchi urinishda ishlasa; va'da qilinmaydi.

## 11. Xavflar

| Xavf | Yumshatish |
|---|---|
| Yangi exe eski `electronAPI` shartnomasidan chetga chiqadi → chop etish jim o'ladi | §6.3 shartnoma testi |
| `POS_PIN_PEPPER` yo'qolsa hamma PIN yaroqsiz | boot'da majburiy sir; deploy hujjatida qayd; PIN qayta berish — 1 daqiqalik ish |
| PIN to'qnashuvi (HMAC) noto'g'ri odamni kiritadi | ikkinchi to'siq: `argon2.verify(posPinHash, pin)` (§4.4 qadam 4) |
| Qurilma kaliti o'g'irlanadi (kassa PC'si buzilsa) | `revokedAt` bilan bekor qilish; kalit DPAPI bilan shifrlangan, faqat o'sha Windows profilida ochiladi |
| Internet uzilishi savdoni to'xtatadi | §3.1 — ongli qaror, aniq ekran + avto-tiklanish |
| Prisma `username` qisman indeksi tufayli `migrate diff` doim ortiqcha indeks chiqaradi (mavjud drift, `schema.prisma:253-262`) | K1 migratsiyasi qo'lda tekshiriladi — faqat o'z o'zgarishlarim qolsin |
| Domen noaniqligi (`climart.biznesjon.uz` / `climartgroup.uz` / `erp.sherset.uz`) | §3.2 — exe'da sozlanadigan, kodga qotirilmaydi |

## 12. Qabul mezoni

1. Admin exe'ni yangi kassa PC'siga o'rnatadi, bir marta parol bilan kirib qurilmani do'kon va
   kassaga bog'laydi.
2. Admin ERP'da har kassirga PIN beradi.
3. Kassir exe'ni ochadi → PIN teradi → `/sotuv` ochiladi → sotuv qiladi → chek chiqadi.
4. Kassir «Chiqish» bosadi → PIN klaviaturasi qaytadi (email-login emas).
5. 5 marta noto'g'ri PIN → qurilma 15 daqiqaga qulflanadi.
6. Kassir ERP'ning boshqa sahifasiga URL bilan kira olmaydi (mavjud `kiosk.guard` bilan).
