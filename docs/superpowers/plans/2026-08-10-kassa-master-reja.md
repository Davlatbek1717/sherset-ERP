# Kassa bo'limi — to'liq master-reja (fazalik)

> Sana: 2026-08-10 · Holat: **reja** (har faza boshlanishida alohida TDD-implementatsiya rejasi yoziladi —
> repo konvensiyasi: `2026-08-10-kassa-pin-kirish-backend-web.md` K1–K4 uchun shunday yozilgan)
> Bog'liq hujjatlar: spec `docs/superpowers/specs/2026-08-10-kassa-exe-pin-design.md` (K1–K8) ·
> K1–K4 TDD rejasi `docs/superpowers/plans/2026-08-10-kassa-pin-kirish-backend-web.md`

## 0. Buyurtma (foydalanuvchi talablari, 2026-08-10)

1. **kassir.exe** — har kassa alohida qurilma, Windows .exe, kiosk rejim.
2. **PIN bilan kirish** — har kassir o'z paneliga faqat PIN teradi (email/parol yo'q).
3. **Zakazni kassir o'zi tasdiqlaydi** — jarayonda turgan zakaz (CustomerOrder)ni kassir POS'dan tasdiqlay oladi.
4. **Dollar savdo** — kassir USD'da ham savdo qila oladi.
5. **Mijozlar bilan to'liq ishlash** — qarz qabul qilish va shunga o'xshash boshqa amallar (qolganini o'zim to'ldirishim so'ralgan — §F7).

## 1. Hozirgi holat — kod bilan tasdiqlangan inventarizatsiya

### 1.1 BAJARILGAN (commit'lar bilan)

| Nima | Dalil |
|---|---|
| `Employee.posPinLookup` (HMAC ×pepper, unique) + `PosDevice` jadvali + migratsiya | `11342658`, `afd1bffd` |
| Kirish qo'riqchilari umumiy funksiyaga ajratildi (`assertEmployeeMayLogin`) | `83c686ad` |
| `PosPinService` — lookup yozadi, takror PIN 23505→400 | `fcf63226` |
| `PosDeviceService` — juftlash, kalit tekshiruvi, brute-force qulfi (bazada) | `019885f1` |
| `PosLoginService` — qurilma+PIN → token (parol-login bilan bir xil tokenlar) | `a566c5d2` |
| `POST /auth/pos-login` + `POST /auth/pos-device/pair` endpointlari + kiosk-guard testi | `10682cc7` |
| Admin xodimga PIN beradi/o'chiradi (`POST/DELETE /hr/employees/:id/pos-pin`) | `948f51fa` |
| `POS_PIN_PEPPER` env siri hujjatlangan | `16d76a4f` |
| **Jonli o'lchash**: API haqiqatan token beradi (K1–K4 rejasi Task 9) | plan Task 9 bajarilgan (commit tarixi K2 yakuni) |

### 1.2 POS `/sotuv` sahifasida ALLAQACHON BOR (Explore-agent auditi, fayl-dalillar bilan)

`apps/web/src/app/(app)/sotuv/page.tsx` (2219 qator), tablar: `savat | jarayonda | tayyor | cheklar | smena`.

- Savat + miqdor/narx tahrir, sof matematika `apps/web/src/lib/pos/cart-math.ts`
- Tovar qidiruv + qoldiq (`GET /products?search`)
- Savat chegirmasi (%), pozitsiyalarga taqsimlanadi
- To'lov turlari: **naqd · karta · terminal · qarz** (`components/pos/rasmilashtirish-modal.tsx`)
- Mijoz tanlash va kassada yangi mijoz ochish (`POST /counterparties`)
- Qarzga sotish (mijoz majburiy)
- Yig'ish zanjiri: rasmilashtirish → `send-to-picking` → omborchi `mark-ready` → «Tayyor»dan to'lash
- Chekni bekor qilish, cheklar ro'yxati, **qaytarish (refund, qisman ham)**
- Chek chop etish (electron → HTTP-agent → popup fallback, `lib/print-agent.ts`)
- Smena ochish/yopish + kutilgan naqd/farq (UZS **va USD sanog'i**), kirim/chiqim (drawer-in/out)
- Xarajat/inkassatsiya (RKO), qarz to'lovi FIFO (PKO chek) — `components/pos/debt-payment-dialog.tsx`
- Mijoz-ekran (2-monitor `pushCart`), PIN idle-qulf (5 daq)
- Smena qabul-FSM (`cashier-session/shift-acceptance.ts`, umumiy dvigatel `shared/acceptance-fsm.ts`)

### 1.3 BAJARILMAGAN / YO'Q

| Nima | Holat | Dalil |
|---|---|---|
| `/kassa-kirish` web PIN ekrani (K4) | ❌ yo'q | `apps/web/src/app/kassa-kirish` — papka yo'q; K1–K4 rejasining Task 10–15 ochiq |
| Electron o'ram `desktop/` (K5–K7) | ❌ manba yo'qolgan | spec §2 — diskda/tarixda topilmadi; `window.electronAPI` shartnomasi faqat `print-agent.ts:24-46` da |
| USD savdo **UI** | ❌ yo'q | `apps/web/src` bo'ylab `cashUsdAmountMinor`/`usdRateMinor` — 0 hit (grep tasdiqlandi) |
| USD savdo **server** | ✅ 90% tayyor | `retail-tenders.ts:36,59-63,101,136-140,184-195` (CASH_USD, kurs majburiy, ×10⁸); `retail-sale.schema.ts:106-134` (stale-scale guard); `RetailSalePayment.currency/rateMinor/amountBaseMinor` (`schema.prisma:8500-8530`); `CashierSession.expectedCashUsdMinor` (`:8119-8122`) |
| Zakaz ↔ POS | ❌ sim tortilmagan | `RetailSale.customerOrderId` ustuni bor (`schema.prisma:8386`) — **hech kim yozmaydi** (0 hit); `/sotuv` da `/customer-orders` chaqiruvi yo'q; kiosk allowlist'da `/customer-orders` yo'q |
| POS qarz to'lovi USD'da | ❌ yo'q | `PosDebtPaymentSchema` da `currency` bor, **kurs maydoni yo'q** (`debt.schema.ts:437-447` — o'zim o'qidim); `usdCentsToSomTiyin` helper tayyor (`:455-457`) |
| Chekda «Dollar» qatori | ❌ yo'q | `print-agent.ts` `buildReceiptText:414-420` / `buildReceiptHtml:483-487` — faqat Naqd·Karta·Terminal·Qarz·Qaytim |
| `/print/z-report` sahifasi | ❌ yo'q | `apps/web/src/app/print/` da yo'q; kiosk-policy `:74` izohida niyat bor |

### 1.4 TOPILGAN BUGLAR (reja bajarilishidan OLDIN tuzatiladi — F0)

1. 🔴 **Kiosk-kassir smena ocholmaydi**: allowlist `/smena/mine` deydi (`kiosk-policy.ts:52`),
   real controller `@Controller('admin/smenas')` (`smena.controller.ts:27` — o'zim tekshirdim);
   `/sotuv` `POST /admin/smenas/open-session` chaqiradi (`page.tsx:109`). `/admin/*` hech bir
   qoidaga tushmaydi → kiosk rejimda 403. Test ham eski yo'lni tekshiradi (`kiosk-policy.test.ts:66`).
2. ⚠️ `/sklad-keepers` allowlist'da yo'q, lekin `print-agent.ts` chek-printer sozlamasi uchun
   chaqiradi → kiosk'da native chop etish jim popup'ga tushadi.

## 2. Fazalar

Tartib mantiqiy: avval bloker-buglar (F0), keyin exe zanjiri (F1–F4 — spec K4–K7 ning davomi),
keyin funksiya-fazalar (F5–F7 — web'da, exe yupqa o'ram bo'lgani uchun deploy bilan avtomatik
yetib boradi), oxirida real kassada QA (F8). **F5–F7 ni F2–F4 bilan almashtirish mumkin** —
bir-biriga bog'liq emas; agar dollar savdo shoshilinch bo'lsa F5 ni F1 dan keyin qilish to'g'ri.

---

### F0 — Kiosk-allowlist tuzatishlari (bloker, ~0.5 sessiya)

**Maqsad:** kiosk-rejimdagi kassir `/sotuv` ning mavjud imkoniyatlarini to'liq ishlata olishi.

- `kiosk-policy.ts`: `/smena/mine` o'rniga **aniq yo'llar**: `/admin/smenas/mine` GET va
  `/admin/smenas/open-session` POST (butun `/admin` OCHILMAYDI). `/sklad-keepers` GET qo'shiladi.
- `kiosk-policy.test.ts` yangilanadi (eski yo'l testi ham tuzatiladi).

**Qabul mezoni:** kiosk-token bilan smena ochish 200; allowlist testlari yashil; boshqa `/admin/*` yo'llar 403 bo'lib qolaveradi (negativ test).

---

### F1 — K4 qoldig'i: `/kassa-kirish` web PIN ekrani (~1 sessiya)

**Maqsad:** brauzerda PIN bilan kirish ishlaydi — exe'ning old sharti.

Mavjud K1–K4 TDD rejasining **Task 10–15** aynan bajariladi (qayta yozilmaydi):
- `apps/web/src/lib/pos-device.ts` — qurilma ma'lumotini saqlash (electron ko'prigi / localStorage)
- `auth-store.ts` → `posLogin(deviceId, deviceSecret, pin)`
- `components/pos/pin-keypad.tsx` (sensorli ekran, min 64px tugmalar) + testlar
- `app/kassa-kirish/page.tsx` + `app/kassa-kirish/juftlash/page.tsx` (admin juftlash ekrani)
- Chiqish → PIN ekraniga qaytish (email-login emas)
- i18n `kassaLogin.*` ru+uz · wiring-test · to'liq gate

**Qabul mezoni:** brauzerda qurilma juftlanadi, PIN bilan `/sotuv` ochiladi, chiqishda PIN ekrani qaytadi. Yorliq: Phase-1.

---

### F2 — Electron kiosk o'rami `desktop/` (K5, ~1 sessiya)

Spec §6 bo'yicha: kiosk `BrowserWindow` (frame yo'q, DevTools o'chiq, `Ctrl+W`/`Alt+F4` ushlanadi,
single-instance) · server manzili sozlanadigan (§3.2) · qurilma kaliti DPAPI (`safeStorage`) ·
aloqa uzilganda «server bilan aloqa yo'q» ekrani + avto-tiklanish.

**🔴 Majburiy qo'riqchi:** `apps/web/src/__tests__/electron-bridge-contract.test.ts` —
`print-agent.ts` dagi `ElectronBridge` interfeysidan metod nomlarini manbadan o'qib,
`desktop/preload.js` da har biri berilganini tekshiradi (spec §6.3: eski exe shartnomasi
`isSherset`, `version`, `listPrinters`, `printSheet` v1.0.3, `pushCart` v1.0.4,
`toggleCustomerDisplay`/`customerDisplayStatus` v1.0.5 — aynan tiklanadi; yangi: `pair`,
`getDevice`, `clearDevice`).

**Qabul mezoni:** `pnpm --filter desktop dev` da juftlash + PIN bilan kirish; shartnoma-testi yashil.

---

### F3 — Chop etish + mijoz-ekran exe'da (K6, ~1 sessiya)

- `printSheet`: yashirin `BrowserWindow` → `webContents.print({deviceName, silent:true})` —
  Windows drayveri renderlaydi (kirill/o'zbekcha ESC/POS kodpage muammosisiz).
- `listPrinters()` → printer tanlash; `tools/print-agent` (127.0.0.1:17777) zaxira bo'lib qoladi.
- Mijoz-ekran: 2-monitor topilsa ramkasiz oyna, `pushCart` IPC orqali.

**Qabul mezoni:** real printerda chek chiqadi (agar printer bor bo'lsa; bo'lmasa virtual printerda) — aks holda «Phase-1, printer-tasdiqlanmagan» deb yoziladi.

---

### F4 — Installer + avtoyangilanish (K7, ~1 sessiya)

- `electron-builder` NSIS → `Sherset-Kassa-Setup-<version>.exe` (imzosiz v1 — spec §8.2).
- `electron-updater` generic provider → `https://<server>/downloads/desktop/` (nginx statik
  location + `latest.yml`); yangilanish kassir «Chiqish» bosganda o'rnatiladi.
- `desktop/README.md` — operator uchun o'rnatish/juftlash yo'riqnomasi (SmartScreen skrinshoti bilan).

**Qabul mezoni:** .exe fayl o'rnatiladi, yangilanish kanali versiya ko'tarilganda ishlaydi.

---

### F5 — Dollar savdo (USD tender, ~1 sessiya)

**Server tayyor — bu faza asosan FE.** Aralash to'lov (so'm naqd + USD naqd + karta) `computeTenders` da allaqachon qo'llab-quvvatlanadi.

1. **Kurs olish (FE):** `GET /exchange-rates/rate?currency=USD` (kiosk allowlist'da BOR —
   `kiosk-policy.ts:61`; carry-forward server tomonda). Kurs to'lov oynasida ko'rsatiladi va
   **chekka muzlatiladi** (`rateMinor` ×10⁸ — `RATE_SCALE` yagona manbadan).
2. **`RasmiyashtirishModal`:** 4-tender «Naqd USD» — dollar summa kiritiladi, so'm ekvivalenti
   jonli ko'rsatiladi (`usdCentsToSomTiyin` formulasi), qaytim so'mda hisoblanadi (server
   `retail-tenders.ts:170-176` chegarasi bilan mos).
3. **`page.tsx` post payload:** `cashUsdAmountMinor` + `usdRateMinor` qo'shiladi (`:1007-1014`).
4. **Chek — UCHALA renderer** (xotira: «ombor cheki uch renderer — biri o'zgarsa qolgani jimgina
   eskiradi»): `buildReceiptText` + `buildReceiptHtml` (`print-agent.ts`) va `/print/retail-sale`
   React sahifasiga «Dollar (kurs bilan)» qatori.
5. **Qarz to'lovi USD'da:** `PosDebtPaymentSchema` ga kurs maydoni (naqsh: `retail-sale.schema.ts:110-134`
   dagi stale-scale guard bilan) + `debt-payment-dialog.tsx` ga UZS/USD toggle
   (`call-outcome-modal.tsx:110-132` naqshi, lekin kurs qo'lda emas — avtomat).
6. **Ochiq qaror hujjatlanadi:** dollar `CashDesk.balanceMinor` ga tushmaydi
   (`retail-sale.service.ts:918-931` — ataylab), faqat smena hisobida. Pul-daftar/bank-balans
   kassadagi dollarni ko'rmaydi — bu **ochiq qarz** sifatida NEXT.md'da qayd etiladi (yechim
   alohida faza: kassa-USD daftari yoki inkassatsiyada konvertatsiya).
7. `schema.prisma:8489-8498` dagi eskirgan «hali ulanmagan» izohi yangilanadi.

**Qabul mezoni:** kassir chekni so'm+dollar aralash yopadi; chekda dollar qatori kurs bilan;
smena yopilishida `expectedCashUsdMinor` to'g'ri; kurs yo'q kunda to'lov bloklanadi (server guard),
FE tushunarli xabar beradi. Yorliq: Phase-1 (brauzer-smoke F8 da).

---

### F6 — Zakaz: kassir tasdiqlaydi va to'laydi (~1–2 sessiya)

**Poydevor:** CustomerOrder FSM (`draft→confirmed→awaiting_payment→paid→…`,
`customer-order.service.ts:2886-2899`), transition endpointi `POST /customer-orders/:id/transitions/:target`
(`customerorder.approve` ruxsati, `customer-order.controller.ts:142-143`), `confirmed` da avtomatik
rezerv (`:1137-1165`). `RetailSale.customerOrderId` ustuni tayyor, yozuvchisi yo'q.

1. **Kiosk allowlist:** `/customer-orders` GET + kerakli POST sub-yo'llar (aniq, `*` emas).
2. **Ruxsat:** kassir roliga `customerorder.approve` beriladi (rol-shablon orqali, MK29 naqshi).
   Yangi qabul-o'qi (acceptance-FSM) QO'SHILMAYDI — mavjud FSM transition yetarli; uchinchi
   holat-o'qi yaratish CustomerOrder'dagi ikki o'q (FSM `state` + tenant `statusId`) ustiga
   chalkashlik qo'shadi. (Agar keyin «kim tasdiqladi» jurnali kerak bo'lsa — audit allaqachon bor,
   `:1148-1150`.)
3. **POS'da «Zakazlar» tabi:** jarayondagi zakazlar ro'yxati (filtr: `draft`/`confirmed`/
   `awaiting_payment`, o'z do'koni bo'yicha), zakaz detali (pozitsiyalar, summa, mijoz).
4. **Tasdiqlash:** kassir `draft` zakazni `confirmed` ga o'tkazadi → rezerv avtomatik.
5. **To'lash:** zakazdan savat yuklanadi → oddiy rasmilashtirish oqimi (naqd/karta/terminal/qarz/USD) →
   `RetailSale.customerOrderId` yoziladi (post schema + service) → zakaz `paid` ga o'tadi.
6. **Dizayn savollari (faza boshida TDD-rejada hal qilinadi, ko'r-ko'rona emas):**
   - zakaz to'langanda rezerv → haqiqiy chiqimga aylanishi (yig'ish zanjiri `send-to-picking`
     bilan birlashadimi yoki zakaz-pozitsiyalar to'g'ridan-to'g'ri sotiladimi);
   - qisman to'lov (`awaiting_payment` da qoladimi);
   - ikki marta to'lash himoyasi (zakaz ham invoice orqali, ham POS'da to'lanmasin — `paid`
     holat tekshiruvi server tomonda).

**Qabul mezoni:** kassir POS'dan zakazni ko'radi, tasdiqlaydi (rezerv tushadi), to'laydi —
`RetailSale` zakazga bog'lanadi, zakaz `paid`; kiosk rejimda 403 yo'q. Yorliq: Phase-1.

---

### F7 — Mijozlar bilan to'liq ishlash (~1–2 sessiya)

Foydalanuvchi «bir qismini aytdim, qolganini o'zing top» degan. Mavjud: qarz to'lovi FIFO,
mijoz yaratish/tanlash, qarzga sotish. To'ldiriladigan amallar:

1. **Mijoz kartasi paneli POS'da** (tanlangan mijoz uchun tez ko'rinish):
   - joriy qarz saldosi (`/debts/pos/summary/:id` — bor, faqat dialog ichida yashiringan);
   - oxirgi cheklar/xaridlar tarixi (retail-sales filtri mijoz bo'yicha);
   - jarayondagi zakazlari (F6 bilan bog'lanadi).
2. **Avans (oldindan to'lov) qabul qilish:** mijozda qarz bo'lmasa ham pul qabul qilish —
   hozirgi FIFO faqat mavjud qarzni yopadi. Dizayn: ortiqcha summa mijoz avansiga (debt-daftari
   simmetriyasi buzilmasin — xotira: «debt daftari simmetriya yopildi», create +total ·
   to'lov −paid; avans alohida belgi bilan).
3. **USD qarz to'lovi** — F5 §5 da quriladi, bu fazada mijoz kartasidan ham chaqiriladi.
4. **Qaytarish → qarzga bog'lash tekshiruvi:** refund qarzga sotilgan chekda qarzni ham
   kamaytirishi (hozirgi xulq o'lchanadi, kamchilik bo'lsa tuzatiladi — hozircha da'vo yo'q,
   tekshirilmagan).
5. **Qidiruv kuchaytiriladi:** telefon raqami bo'yicha mijoz topish (kassada eng tez identifikator).
6. **Mijoz ma'lumotini tahrirlash:** telefon/izoh POS'dan (to'liq karta emas — kiosk chegarasi).
7. **Kiosk allowlist auditi:** yuqoridagilar uchun kerak yo'llar aniq qo'shiladi
   (masalan `/retail-sales?counterpartyId=` allaqachon `*` ostida, `/counterparties/:id` GET bor).

**Qabul mezoni:** kassir mijozni telefon bo'yicha topadi, kartasida qarz/tarix/zakazlarni ko'radi,
qarz qabul qiladi (so'm yoki USD), avans qabul qiladi. Yorliq: Phase-1.

---

### F8 — Phase-2 QA: real kassa kompyuterida (~1 sessiya)

Spec §12 qabul mezonlari + yangi funksiyalar bo'yicha adversarial QA (real brauzer/exe, real DB):

1. Admin exe o'rnatadi → juftlaydi → kassirga PIN beradi → kassir PIN bilan kiradi → sotadi → chek chiqadi.
2. 5 xato PIN → qurilma 15 daqiqa qulf; kassir boshqa sahifaga URL bilan kira olmaydi.
3. USD: aralash to'lov, kurs muzlatilishi, smena yopilishidagi USD farq, kurssiz kun.
4. Zakaz: tasdiqlash→rezerv→to'lash→`paid`; ikki marta to'lash urinishi.
5. Mijoz: qarz to'lovi ikkala valyutada, avans, telefon-qidiruv.
6. Concurrency/edge: ikki kassir bir zakazni bir vaqtda; smena yopilgan holda sotish urinishi;
   internet uzilishi ekrani; parallel qurilmada bir xil PIN.

**Natija:** fazalar «Phase-1» → «Phase-2 verified»; topilgan buglar issiq kontekstda tuzatiladi.

---

## 3. Qo'shimcha tavsiyalar (buyurtmada yo'q, professional to'ldirish — alohida qaror kutadi)

| Tavsiya | Nega | Hajm |
|---|---|---|
| `/print/z-report` sahifasi | Kiosk-policy izohi va'da qiladi, sahifa yo'q — smena yopilganda Z-hisobot chek printerda chiqishi kerak | kichik |
| Pul yashigi impulsi (cash drawer kick) | Spec'da ongli qarz; Electron'da ESC/POS `pulse` yoki drayver orqali | kichik (F3 ga qo'shsa bo'ladi) |
| Shtrix-skaner | Klaviatura-emulyatsiya bilan HOZIR ham ishlaydi (qidiruv maydoni fokusda) — maxsus kod shart emas; faqat F8 da real skaner bilan tekshiriladi | 0 |
| Kassa-USD daftari | F5 §6 dagi ochiq qarz: dollar tushumi pul-daftar/bank-balans hisobotlarida ko'rinmaydi | o'rta, alohida faza |
| Smena-farq eskalatsiyasi | Shift-acceptance FSM bor; katta farqda menejerga Telegram-xabar (mavjud telegram infra) | kichik |
| Offline-savdo | Spec §3.1 da ONGLI RAD ETILGAN (ikkinchi ma'lumot-model + sinxronizatsiya narxi) — qayta ochilmaydi | — |

## 4. Xavflar (spec §11 ga qo'shimcha)

| Xavf | Yumshatish |
|---|---|
| USD qaytim/yaxlitlash: kassir dollarda oladi, qaytimni so'mda beradi — kurs yaxlitlashi tiyin farqi chiqaradi | server allaqachon so'm-ekvivalentda hisoblaydi (`retail-tenders.ts:101`); FE aynan shu formulani ko'rsatadi, o'zi hisoblamaydi |
| Kurs eskirishi (kecha sinxronlanmagan) | carry-forward bor; FE kurs sanasini ko'rsatadi; kurs umuman yo'q — server 400, FE ochiq xabar |
| Zakazni ikki kanal to'laydi (POS + invoice) | F6 §6: `paid` holat tekshiruvi tranzaksiyada |
| Chek uch renderer sinxron eskirishi | F5 §4 uchala rendererga birga tegadi + chek-snapshot testi |
| Exe shartnoma-drift (web yangi metod kutadi, exe bermaydi) | F2 shartnoma-testi (`electron-bridge-contract.test.ts`) |
| Kiosk allowlist kengayib ketishi | har faza faqat aniq yo'llar qo'shadi, `*` faqat mavjud `/retail-sales`, `/cashier-sessions`, `/auth`, `/print` da qoladi |

## 5. Tartib va hajm xulosasi

| Faza | Nima | Hajm | Old shart |
|---|---|---|---|
| F0 | Kiosk-allowlist buglari | 0.5 sessiya | — |
| F1 | `/kassa-kirish` PIN ekrani (K4 qoldiq, Task 10–15) | 1 | F0 |
| F2 | Electron o'ram | 1 | F1 |
| F3 | Chop etish + mijoz-ekran | 1 | F2 |
| F4 | Installer + autoupdate | 1 | F3 |
| F5 | Dollar savdo | 1 | F0 (F1–F4 dan mustaqil) |
| F6 | Zakaz tasdiqlash/to'lash | 1–2 | F0 (F5 dan mustaqil) |
| F7 | Mijoz bilan to'liq ishlash | 1–2 | F5 (USD qarz), F6 (zakazlar paneli) |
| F8 | Phase-2 QA real kassada | 1 | hammasi |

Jami: ~8–10 fokus-sessiya. Har faza boshida alohida TDD-implementatsiya rejasi yoziladi
(CLAUDE.md §0: 1 sessiya = 1 flagship ish → commit → yopiladi). Har faza yakuni **halol
yorliq** bilan: «Phase-1: strukturaviy, runtime-tasdiqlanmagan» — «verified» faqat F8 dan keyin.
