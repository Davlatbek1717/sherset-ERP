# Kassa bo'limi — fazalik IJRO rejasi (har faza = alohida sessiya)

> Sana: 2026-08-10 · Bu hujjat — **ijro uchun yagona manba**.
> Kontekst: strategik ko'rinish `docs/superpowers/plans/2026-08-10-kassa-master-reja.md` ·
> dizayn spec `docs/superpowers/specs/2026-08-10-kassa-exe-pin-design.md` ·
> K1–K4 TDD tafsilotlari `docs/superpowers/plans/2026-08-10-kassa-pin-kirish-backend-web.md`

---

## 0. O'ZGARMAS QOIDALAR (har sessiya agenti uchun)

Bu bo'lim har faza promptida takrorlanadi. Agent uni **birinchi bo'lib** o'qiydi.

### 0.1 Bitta sessiya = bitta faza. TO'XTASH MAJBURIY 🔴

- Agent **faqat o'ziga berilgan fazani** bajaradi.
- Faza tugagach **keyingi fazani BOSHLAMAYDI** — hatto «vaqt bor», «oson ko'rinadi»,
  «bir qatorlik ish» bo'lsa ham. Sessiya to'liq to'xtaydi.
- Sabab: kontekst o'sgan sari token sarfi ~kvadratik oshadi (CLAUDE.md §0.3). Kenglik
  sessiyalar SONI orqali olinadi, sessiya uzunligi orqali emas.
- Agent boshqa fazaning fayllariga **tegmaydi** (hatto «yo'l-yo'lakay tuzatish» ham yo'q).
  Ko'rgan nuqsonini hisobotning «Kelgusi fazalarga qoldirilgan» bandiga yozadi.

### 0.2 Hisobot — shu faylning oxirida (§3)

Faza yakunida agent **shu hujjatning oxiridagi «Hisobotlar» bo'limiga** o'z fazasi uchun
tayyor turgan bo'sh shablonni to'ldiradi. Shablon tashqarisiga yozilmaydi, boshqa faza
hisoboti tahrirlanmaydi.

🔴 Yozishda **`Edit` bilan aynan o'z shablon blokini almashtir** — `Write` bilan butun faylni
qayta yozish TAQIQ (xotira: «hujjatga qo'shishda marker-kesish halokati» — `indexOf` bilan
kesish 2270 qatorni o'chirgan; «mavjud test-fayl ustidan Write qilma»).

### 0.3 TDD majburiy

Har o'zgarish: **avval yiqiladigan test → yiqilishini KO'RISH → minimal implementatsiya →
yashil → commit**. «Test keyin yoziladi» — qabul qilinmaydi.

Test yozishdan oldin `superpowers:test-driven-development` skill'i o'qiladi.

### 0.4 Gate — har commit'da (qisqartirilmaydi)

```bash
pnpm --filter @moysklad/money build          # avval — xotira: «money dist eskirishi»
pnpm --filter @moysklad/api typecheck        # 0 xato
pnpm --filter @moysklad/web typecheck        # 0 xato
pnpm biome check <faqat tegilgan yo'llar>    # 0 xato
pnpm --filter @moysklad/api test             # API testlari — MAJBURIY
pnpm --filter @moysklad/web test             # web testlari — MAJBURIY
pnpm i18n:gate                               # UI matni tegilgan bo'lsa
```

⚠️ **Buyruq shakli (2026-08-11 tuzatildi):** ilgari bu yerda `pnpm --filter X vitest run`
turardi — pnpm buni *script* nomi deb qidiradi va
`ERR_PNPM_RECURSIVE_RUN_NO_SCRIPT: None of the selected packages has a "vitest" script`
xatosi bilan **exit 1** qaytaradi. Ya'ni gate «qizil» ko'rinadi, aslida bitta ham test
yugurmaydi. To'g'ri shakl — `test` scripti (`"test": "vitest run"`), bitta faylni
yugurtirish uchun esa `pnpm --filter @moysklad/api exec vitest run <yo'l>`.

🔴 **API testlarini o'tkazib yuborish TAQIQ** — xotira: «web-only gate `apps/api`
qo'riqchilarini o'tkazib yuboradi» (bir faza 9 yiqilishni jim qoldirgan).

🔴 **To'plamlarni KETMA-KET yugurtir, bir vaqtda EMAS** (2026-08-11 audit-to'lqini sabog'i):
API va web to'plamlari bir vaqtda ishlaganda 9 ta test 5000ms chegarasida **timeout**
bo'ldi (argon2 xesh testlari va og'ir React render testlari). Yolg'iz yugurtirilganda
hammasi yashil edi. Ya'ni parallel yuklamadagi qizil natija **soxta signal** — uni bug deb
qidirib vaqt ketadi. Shubhali yiqilishni **doim yolg'iz** qayta yugurtirib tasdiqla;
5000ms atrofidagi davomiylik — timeout belgisi, defekt emas.

Yiqilgan test bo'lsa: **meniki ekanini yoki oldindan qizil ekanini aniqlab**, hisobotda yoz.
«Bog'liq emas» deb jim o'tish — taqiq.

### 0.5 Git intizomi (CLAUDE.md §6)

- 🔴 **Parallel to'lqin rejimi:** senga berilgan promptda «parallel to'lqin» deyilgan bo'lsa,
  ishni boshlashdan OLDIN alohida worktree yarat (branch: `kassa-f<N>`) va butun ishni o'sha
  yerda qil — §1.2 protokoli. Sessiya boshida `git worktree list` bilan boshqa faol
  worktree'lar borligini ko'r.
- `git add <aniq fayllar>` — `git add -A` / `git add .` / `commit -a` TAQIQ (hook bloklaydi).
- Commit'dan keyin **doim** `git show --stat HEAD` — lint-staged begona fayl qo'shishi mumkin.
- `git reset --hard`, `checkout -- .`, `clean -fd`, `stash` — daraxtda o'zing yaratmagan
  o'zgarish bo'lsa TAQIQ (parallel sessiya ishini o'chiradi).
- Commit sarlavhasi **kichik harf** bilan (`commitlint` bosh harfni rad etadi):
  `feat(kassa): …`, `fix(kassa): …`, `docs(kassa): …`.
- Bosqichma-bosqich commit qil — bir soatlik ishni commit qilinmagan holda ushlab turma.

### 0.6 Halol yorliq (CLAUDE.md §1)

Faza natijasi **«Phase-1: strukturaviy, runtime-tasdiqlanmagan»** deb belgilanadi.
«done» / «production-ready» / «verified» — F12 (real kassada QA) dan oldin **TAQIQ**.
Brauzerda o'lchagan bo'lsang, aniq nima o'lchanganini yoz («brauzer-smoke: PIN kirish OK,
printer sinovi YO'Q» uslubida).

### 0.7 Tasdiqlanmagan ≠ fakt (CLAUDE.md §2)

Har da'vo fayl/qator dalili bilan. «Eslayman», «kontekstimda bor» — dalil emas.
Reja qatorida yozilgan fayl/qator ham vaqt o'tib siljigan bo'lishi mumkin — **oldin o'qi**,
keyin tahrirla (xotira: «grep maydonni noto'g'ri modelga bog'ladi»).

### 0.8 Muhit

- DB: PostgreSQL **`climart_adopt` @ `localhost:5432`** (`packages/db/.env`). Ishlaydi —
  `preflight` ning «db down» ogohlantirishi yolg'on (xotira: `preflight-db-probe-false-negative`).
- Dev: `pnpm dev` (web `:3100`, api `:4000`). 🔴 QA'dan oldin `:4000` **qaysi worktree'dan**
  ishlayotganini tekshir (xotira: «dev-stack boshqa worktree'dan ishlashi mumkin» — eski
  commitdan ishlasa yangi marshrutlar 404 beradi).
- UI matni **hech qachon hardcode emas** → `apps/web/src/messages/{ru,uz}.json`.
- Model: Opus (CLAUDE.md §0) — subagentlarga `model` uzatilmaydi.

---

## 0.9 AUDIT-TO'LQINI (2026-08-11) — bajarilgan va qolgan

Butun kassa yuzasi 5 yo'nalishda auditdan o'tkazildi (POS FE · retail-sale server ·
cashier-session/smena · qarz+chop etish · auth/kiosk). **21 tasdiqlangan bug tuzatildi**
(TDD, gate yashil) — tafsilot §3 «Audit-to'lqini hisoboti» da.

🔴 **F0 fazasi BAJARILDI** shu to'lqinda (kiosk-allowlist) — uni qayta bajarma.

**Auditda topilgan, ATAYLAB qoldirilgan ishlar — tegishli fazalarga biriktirildi:**

| Topilma | Qaysi fazada | Nega hozir emas |
|---|---|---|
| Chekda «Qarz»/«Terminal»/USD qatorlari YO'Q — uchala renderer `RetailSalePayment` qatorlarini o'qimaydi, eski legacy ustunlarni o'qiydi | **F5** (kengaytirildi) | Chek qatlamini qayta simlash — F5 ning dollar ishi bilan bir joyda qilinsa, uchala renderer bir marta tegiladi |
| Qarzga sotilgan chekni POS'dan qaytarib bo'lmaydi (FE har doim to'liq naqd so'raydi → server 400) | **F5** (kengaytirildi) | O'sha to'lov-qatlami ishi |
| POS qarzga sotuv `Debt` reyestriga tushmaydi (faqat `CounterpartyBalance`) ⇒ «Qarz to'lovi» oynasida ko'rinmaydi | **F9** (kengaytirildi) | Ikki daftarni uchrashtirish — mijoz bilan ishlash fazasining yadrosi |
| Kasr miqdorli («1.5 kg») tayyor chek POS'ni yiqitadi (`BigInt(1.5)`) | **F8** (kengaytirildi) | `CartLine.quantity` tipini o'zgartirish — zakaz/savat qayta simlash bilan bir joyda |
| Savat footeri chegirmani jamiga bir marta qo'llaydi, server esa har qatorga (tiyin farqi) | **F8** (kengaytirildi) | `cart-math.ts` da server-mos funksiya BOR (`discountedCartTotalMinor`), sahifa uni ishlatmaydi |
| Valyutali kassa (`CashDesk.currency ≠ UZS`) drawer-hujjatlari so'm formulasiga sent bilan kiradi | **F6** (kengaytirildi) | USD ishi bilan bir joyda |
| USD naqd qarz to'lovi so'm-expected'ga qo'shiladi (valyuta filtri yo'q) | **F6** (kengaytirildi) | O'sha |
| `escalateOverdue`/`markStale` (smena qabuli) HECH QAYERDAN chaqirilmaydi — o'lik avtomatika | **yangi F13** | Cron/wiring ishi, kassa oqimidan mustaqil |
| `markReady` poygasi: ikki omborchi parallel tugatsa chek `picking`da qolishi mumkin (o'z-o'zidan davolanadi) | **F12 QA** | Past zarar, QA'da kuzatiladi |
| Mijoz dublikati (kassir bir mijozni ikki marta ochadi) | **F9** | Operatsion xavf; qidiruv kuchaytirilganda tabiiy kamayadi |

---

## 1. Fazalar xaritasi

| Faza | Funksiya | Old shart | Hajm |
|---|---|---|---|
| ~~**F0**~~ | ~~Kiosk-allowlist buglari~~ ✅ **BAJARILDI** (2026-08-11 audit-to'lqini) | — | S |
| **F1** | `/kassa-kirish` — web PIN ekrani | F0 | M |
| **F2** | Electron kiosk o'rami (`desktop/`) | F1 | L |
| **F3** | Exe'da chop etish + mijoz-ekran | F2 | M |
| **F4** | NSIS installer + avtoyangilanish | F3 | M |
| **F5** | Dollar savdo (USD tender POS'da) | F0 | M |
| **F6** | USD qarz to'lovi | F5 | M |
| **F7** | Zakazlar POS'da: ro'yxat + tasdiqlash | F0 | M |
| **F8** | Zakazni POS'dan to'lash (chek ↔ zakaz bog'lanishi) | F7 | L |
| **F9** | Mijoz kartasi POS'da (saldo · tarix · zakaz · telefon-qidiruv) | F7 | M |
| **F10** | Avans (oldindan to'lov) qabul qilish | F9 | M |
| **F11** | Z-hisobot chop sahifasi (`/print/z-report`) | — | S |
| **F13** | Smena-qabul avtomatikasi tirik emas (audit) | — | S |
| **F12** | Phase-2 QA: real kassa kompyuterida | hammasi | L |

**Mustaqil shoxlar:** `F1→F2→F3→F4` (exe) va `F5→F6`, `F7→F8→F9→F10` (funksiya) bir-biriga
bog'liq emas — tartibni ehtiyojga qarab almashtirish mumkin. **F0 hammadan oldin.**

### 1.1 Parallel ijro — TO'LQIN JADVALI (maksimal tezlik uchun)

Bir to'lqin ichidagi fazalar **fayl-kesishmasiz** — bir vaqtda alohida sessiyalarda berish
mumkin. Keyingi to'lqin **faqat oldingi to'lqin to'liq merge bo'lgach** boshlanadi.

| To'lqin | Bir vaqtda beriladigan fazalar | Nega birga mumkin |
|---|---|---|
| **1** | ~~F0~~ · F1 · F5 · F11 | F0 BAJARILDI · F1=`kassa-kirish` (yangi papka) · F5=`sotuv`+to'lov modali · F11=`print/z-report` (yangi papka) — kesishma faqat `messages/*.json` (har xil kalitlar, merge oson) |
| **2** | F2 · F6 · F7 | F2=`desktop/` (yangi) · F6=`debt` moduli · F7=`kiosk-policy`+`sotuv` zakaz tabi (F0 va F5 allaqachon merge bo'lgan) |
| **3** | F3 · F8 | F3=`desktop/` chop etish · F8=`retail-sale` servis + `sotuv` to'lov oqimi |
| **4** | F4 · F9 | F4=installer/`deploy/` · F9=mijoz paneli (`sotuv`) — F8 merge bo'lgan |
| **5** | F10 · F13 | avans (F6+F9 poydevorida) · F13=`shift-acceptance` cron (kesishmaydi) |
| **6** | F12 | QA — hammasi merge bo'lgach, yolg'iz |

🔴 **F8 va F9 ni bir to'lqinda BERMANG** — ikkalasi ham `sotuv/page.tsx` ni og'ir tahrirlaydi.
Xuddi shunday F5 va F7 ham (shuning uchun har xil to'lqinda).

### 1.2 Parallel sessiya protokoli (MAJBURIY, aks holda ish yo'qoladi)

1. **Har parallel sessiya ALOHIDA worktree'da ishlaydi** — sessiya boshida agent worktree
   yaratadi (`superpowers:using-git-worktrees` skill / `git worktree add`), branch nomi:
   `kassa-f<N>`. Bitta checkout'da ikki sessiya = lint-staged bir-birining fayllarini
   commit'ga qo'shadi (CLAUDE.md §6.7 — ikki marta real sodir bo'lgan).
2. **Hisobot ham worktree ichidagi nusxaga yoziladi** — merge paytida har faza o'z blokini
   to'ldirgani uchun to'qnashuv bo'lmaydi (bloklar har xil joyda).
3. **To'lqin tugagach — merge sessiyasi**: bitta qisqa sessiya barcha `kassa-f*` branchlarni
   `climart-adoption` ga birma-bir merge qiladi, har merge'dan keyin TO'LIQ gate (§0.4)
   yugurtiradi, konflikt bo'lsa hal qiladi, worktree'larni yig'ishtiradi
   (`git worktree list` bilan tekshirish — xotira: «parallel worktree = takroriy ish»,
   merge qilinmagan branch butun feature'ni ikki marta qurdirgan).
4. **`pnpm dev` (3100/4000 portlari) bir vaqtda faqat BITTA sessiyada** — brauzer-o'lchov
   qadamini parallel sessiyalar bir vaqtda bajara olmaydi. Yechim: parallel fazalar testgacha
   ishlaydi, brauzer-o'lchovni merge sessiyasidan keyin bitta sessiya bajaradi, YOKI
   foydalanuvchi fazalarga navbat bilan «endi brauzerda o'lcha» deydi.
5. **Migratsiya/seed bir vaqtda faqat bitta sessiyada** (lokal DB umumiy — 5432). Bu rejada
   migratsiya faqat F10 da ehtimol bor, boshqa fazalar DB sxemasiga tegmaydi.

---

## 2. Fazalar

---

### F0 — Kiosk-allowlist buglari

**Maqsad:** kiosk-rejimdagi kassir `/sotuv` ning ALLAQACHON mavjud imkoniyatlarini ishlata olishi.
Hozir ikkita yo'l allowlist'dan tushib qolgan va prodda 403 beradi.

**Hozirgi holat (dalil bilan):**
- `apps/api/src/modules/auth/kiosk-policy.ts:52` — `{ prefix: '/smena/mine', methods: ['GET'] }`
- Real controller: `apps/api/src/modules/smena/smena.controller.ts:27` — `@Controller('admin/smenas')`
- `/sotuv` chaqiruvlari: `apps/web/src/app/(app)/sotuv/page.tsx:105` (`/admin/smenas/mine`),
  `:109` (`POST /admin/smenas/open-session`)
- ⇒ `/admin/*` hech bir qoidaga tushmaydi → **kiosk-kassir smena OCHA OLMAYDI**
- Eski test ham eski yo'lni tekshiradi: `apps/api/src/modules/auth/kiosk-policy.test.ts:66`
- `/sklad-keepers` allowlist'da yo'q, lekin `apps/web/src/lib/print-agent.ts` (`printReceiptViaAgent`)
  uni chek-printer nomi uchun chaqiradi → kiosk'da native chop etish jimgina popup'ga tushadi

**Vazifalar:**
1. `kiosk-policy.ts` da `/smena/mine` qatorini **aniq yo'llar** bilan almashtir:
   `/admin/smenas/mine` (GET) va `/admin/smenas/open-session` (POST). Butun `/admin` OCHILMAYDI.
2. `/sklad-keepers` (GET) qatorini qo'sh — sababi izohda: chek printeri nomi.
3. `kiosk-policy.test.ts` ni yangila:
   - pozitiv: yangi ikki yo'l + `/sklad-keepers` ruxsat etilgan;
   - **negativ (majburiy)**: `/admin/smenas` ning boshqa yo'llari (masalan `GET /admin/smenas`,
     `POST /admin/smenas/close-session` agar mavjud bo'lsa) va boshqa `/admin/*` yo'llar
     hamon RAD ETILADI — allowlist kengayib ketmasin;
   - eski `/smena/mine` qatori olib tashlangani uchun eski testni ham tuzat.
4. `/sotuv` da smena bilan bog'liq boshqa chaqiruvlar bor-yo'qligini **grep bilan tekshir**
   (`/admin/` prefiksi bo'yicha butun `apps/web/src/app/(app)/sotuv/` va `components/pos/`) —
   topilganlarini ham allowlist'ga aniq yo'l sifatida qo'sh yoki hisobotda qayd et.

**Testlar:** `pnpm --filter @moysklad/api exec vitest run src/modules/auth/kiosk-policy.test.ts`
+ to'liq gate (§0.4).

**Qabul mezoni:**
- Yangi testlar yashil; negativ testlar `/admin/*` ning qolganini bloklab turibdi.
- Hisobotda: qaysi yo'llar qo'shildi va NEGA (har biriga bir qator sabab).

<details>
<summary><b>📋 F0 SESSIYA PROMPTI</b> (nusxa ol → yangi sessiyaga qo'y)</summary>

```
docs/superpowers/plans/2026-08-10-kassa-fazalar-ijro-reja.md faylini o'qi.
§0 (O'ZGARMAS QOIDALAR) va §2 → F0 bo'limini bajarasan. FAQAT F0.

Qoidalar (buzilmaydi):
- F0 tugagach TO'XTA. Keyingi fazani BOSHLAMA.
- TDD: avval yiqiladigan test, yiqilishini ko'r, keyin implementatsiya.
- To'liq gate: money build → api typecheck → web typecheck → biome (tegilgan yo'llar) →
  api test → web test. API testlarini o'tkazib yuborma.
- git add faqat aniq fayllar; commitdan keyin git show --stat HEAD.
- Yakunda shu faylning §3 dagi «F0 hisoboti» shablonini Edit bilan to'ldir (Write BILAN
  BUTUN FAYLNI QAYTA YOZMA).
- Yorliq: «Phase-1, runtime-tasdiqlanmagan».

Hisobotda majburiy: (1) o'zgargan fayllar ro'yxati, (2) qo'shilgan har allowlist qatori va
sababi, (3) test natijalari (raqam bilan: nechta o'tdi), (4) gate chiqishi, (5) commit hash,
(6) kelgusi fazalarga qoldirilgan kuzatuvlar.
```
</details>

---

### F1 — `/kassa-kirish` web PIN ekrani

**Maqsad:** brauzerda qurilma juftlanadi va kassir PIN bilan `/sotuv` ga kiradi. Bu — exe'ning
old sharti (exe yupqa o'ram, savdo mantiqi web'da qoladi).

**Hozirgi holat:** backend TAYYOR (`pos-login`, `pos-device/pair`, admin PIN berish — commit'lar
`afd1bffd`…`16d76a4f`). Web tomon YO'Q: `apps/web/src/app/kassa-kirish` papkasi mavjud emas.

**Vazifalar:** mavjud TDD rejasining **Task 10–15** ini aynan bajar — qayta ixtiro qilma:
`docs/superpowers/plans/2026-08-10-kassa-pin-kirish-backend-web.md`

- Task 10 — `apps/web/src/lib/pos-device.ts` (+ test): qurilma ma'lumotini saqlash
  (Electron `safeStorage` ko'prigi bo'lsa u, aks holda `localStorage` — dev/QA uchun)
- Task 11 — `auth-store.ts` ga `posLogin(creds, pin)` (+ test)
- Task 12 — `components/pos/pin-keypad.tsx` (+ test) + `messages/{ru,uz}.json` `kassaLogin.*`
- Task 13 — `app/kassa-kirish/page.tsx` va `app/kassa-kirish/juftlash/page.tsx` + wiring-test
- Task 14 — kiosk «Chiqish» → `/kassa-kirish` (email-login EMAS) + test
- Task 15 — to'liq gate + brauzerda jonli o'lchash (5 qadam)

**Diqqat qaratiladigan tuzoqlar (xotiradan):**
- Sahifa komponentni **haqiqatan ulaganini** wiring-test tekshiradi (prop-drop bug-klassi —
  typecheck jim o'tadi, render'ga yetmaydi).
- Detal/holat shoxlari tartibi: `not_found` shoxi `loading` dan OLDIN bo'lmasa abadiy spinner.
- i18n: kalitlar `messages/*.json` da bo'lishi va `pnpm i18n:gate` o'tishi shart.

**Testlar:** har task'ning o'z testi + `pnpm i18n:gate` + to'liq gate.

**Qabul mezoni (Task 15 Step 5 — brauzerda o'lchanadi):**
1. `http://localhost:3100/kassa-kirish` → «juftlanmagan» ekrani
2. Juftlash → admin bilan kirib do'kon/kassa/tashkilot tanlanadi → qaytadi
3. PIN → `/sotuv` ochiladi
4. Noto'g'ri PIN → xato, maydon tozalanadi
5. `/sotuv` «Chiqish» → `/kassa-kirish` (`/login` emas)

Har qadam natijasi hisobotda **alohida yoziladi** (o'tdi/o'tmadi + nima ko'rindi).

<details>
<summary><b>📋 F1 SESSIYA PROMPTI</b></summary>

```
docs/superpowers/plans/2026-08-10-kassa-fazalar-ijro-reja.md faylini o'qi.
§0 (O'ZGARMAS QOIDALAR) va §2 → F1 bo'limini bajarasan. FAQAT F1.

F1 = docs/superpowers/plans/2026-08-10-kassa-pin-kirish-backend-web.md dagi Task 10–15.
O'sha rejadagi kod va testlarni aynan ishlat, qayta ixtiro qilma. Reja yozilganidan beri
fayllar siljigan bo'lishi mumkin — har faylni tahrirlashdan OLDIN o'qi.

Qoidalar (buzilmaydi):
- F1 tugagach TO'XTA. F2 (Electron) ni BOSHLAMA.
- TDD: har task'da avval yiqiladigan test, yiqilishini ko'r, keyin implementatsiya.
- To'liq gate: money build → api typecheck → web typecheck → biome → api vitest → web vitest
  → pnpm i18n:gate.
- Task 15 Step 5 — brauzerda 5 qadamni HAQIQATAN o'lcha (pnpm dev). Playwright MCP bor.
  QA'dan oldin :4000 qaysi worktree'dan ishlayotganini tekshir.
- git add faqat aniq fayllar; commitdan keyin git show --stat HEAD.
- Yakunda shu faylning §3 dagi «F1 hisoboti» shablonini Edit bilan to'ldir.
- Yorliq: «Phase-1 + brauzer-smoke o'lchangan; real kassa PC va printer — F12».

Hisobotda majburiy: (1) yaratilgan/o'zgartirilgan fayllar, (2) har task holati, (3) test
raqamlari, (4) brauzer 5 qadamining HAR BIRI natijasi, (5) commit hashlar, (6) qoldirilgan qarz.
```
</details>

---

### F2 — Electron kiosk o'rami (`desktop/`)

**Maqsad:** kassa kompyuterida ochiladigan kiosk oyna — brauzer ko'rinmaydi, faqat `/kassa-kirish`.

**Hozirgi holat:** `desktop/` papkasi **yo'q** (spec §2: eski exe manbasi yo'qolgan, diskda ham,
git tarixida ham topilmadi). Web kodi esa eski exe shartnomasini nomma-nom kutadi:
`apps/web/src/lib/print-agent.ts:24-46` (`ElectronBridge`).

**Vazifalar (spec §6):**
1. `desktop/package.json` (electron, electron-updater, electron-builder — dev bog'liqliklari)
2. `desktop/main.js` — kiosk `BrowserWindow`: `kiosk: true`, `frame: false`, menyu yo'q,
   single-instance lock; prod'da DevTools va `Ctrl+Shift+I`/`F12` o'chiq, `Ctrl+W`/`Alt+F4`
   ushlanadi; tashqi havolalar (`window.open`, `will-navigate`) tashqi brauzerga chiqariladi
3. `desktop/preload.js` — `contextBridge` → `window.electronAPI`
4. `desktop/device-store.js` — `safeStorage` (Windows DPAPI) bilan qurilma kaliti + server manzili
5. Server manzili **kodga qotirilmaydi** (spec §3.2): birinchi ishga tushishda kiritiladi,
   build vaqtida default beriladi
6. Aloqa uzilganda Chrome xato sahifasi emas — «server bilan aloqa yo'q, qayta urinish»
   ekrani + fonda `/health` so'rovi + tiklanganda avto-qaytish (spec §3.1)
7. 🔴 **Shartnoma qo'riqchisi:** `apps/web/src/__tests__/electron-bridge-contract.test.ts` —
   `print-agent.ts` dagi `ElectronBridge` interfeysidan metod nomlarini **manbadan o'qib**,
   `desktop/preload.js` da har biri `contextBridge` orqali berilganini tekshiradi.
   Shartnoma (spec §6.3): `isSherset`, `version`, `listPrinters()`, `printSheet(printer, html,
   pageSizeMicrons?)` (v1.0.3), `pushCart(payload)` (v1.0.4), `toggleCustomerDisplay()` /
   `customerDisplayStatus()` (v1.0.5). Yangi: `pair(...)`, `getDevice()`, `clearDevice()`.
   Sabab — xotira «ombor cheki uch renderer»: web yangi metod kutadi, exe bermaydi,
   `electronAPI` optional bo'lgani uchun typecheck YASHIL qoladi.
8. `desktop/README.md` — operator uchun (F4 da to'ldiriladi)

**Testlar:** `electron-bridge-contract.test.ts` (web vitest ichida) + to'liq gate.
Electron'ning o'zi unit-test qilinmaydi — `pnpm --filter desktop dev` bilan qo'lda o'lchanadi.

**Qabul mezoni:** `pnpm --filter desktop dev` da kiosk oyna ochiladi, `/kassa-kirish` ko'rinadi,
PIN bilan `/sotuv` ga kiriladi; shartnoma-testi yashil; `Alt+F4` oynani yopmaydi.

<details>
<summary><b>📋 F2 SESSIYA PROMPTI</b></summary>

```
docs/superpowers/plans/2026-08-10-kassa-fazalar-ijro-reja.md faylini o'qi.
§0 (O'ZGARMAS QOIDALAR) va §2 → F2 bo'limini bajarasan. FAQAT F2.
Dizayn tafsiloti: docs/superpowers/specs/2026-08-10-kassa-exe-pin-design.md §3, §6.

Qoidalar (buzilmaydi):
- F2 tugagach TO'XTA. F3 (chop etish) ni BOSHLAMA.
- Eng avval electron-bridge-contract.test.ts ni YOZ va yiqilishini ko'r — u butun fazaning
  qabul mezoni. Metod nomlari apps/web/src/lib/print-agent.ts dagi ElectronBridge
  interfeysidan MANBADAN o'qilsin (qo'lda ro'yxat ko'chirma — ikkinchi nusxa eskiradi).
- Eski exe shartnomasi AYNAN tiklanadi (spec §6.3). Undan chetga chiqish = jim o'lgan chop etish.
- To'liq gate: money build → api typecheck → web typecheck → biome → api vitest → web vitest.
- desktop/ pnpm workspace'ga qo'shilishi kerak (pnpm-workspace.yaml) — tekshirib qo'sh.
- git add faqat aniq fayllar; commitdan keyin git show --stat HEAD.
- Yakunda shu faylning §3 dagi «F2 hisoboti» shablonini Edit bilan to'ldir.
- Yorliq: «Phase-1; real kassa PC'da sinalmagan».

Hisobotda majburiy: (1) yaratilgan fayllar, (2) shartnoma-testi nimani tekshiradi va qanday
yiqilardi, (3) qo'lda o'lchash natijasi (kiosk oyna ochildimi, PIN ishladimi, Alt+F4),
(4) gate chiqishi, (5) commit hashlar, (6) F3 uchun qoldirilgan nuqtalar.
```
</details>

---

### F3 — Exe'da chop etish + mijoz-ekran

**Maqsad:** chek Windows drayveri orqali chiqadi (kirill/o'zbekcha to'g'ri), ikkinchi monitorda
mijoz-ekran ishlaydi.

**Hozirgi holat:** web tomon tayyor va uch qatlamli fallback bilan ishlaydi
(`apps/web/src/lib/print-agent.ts`): `electronAPI.printSheet` → HTTP agent `127.0.0.1:17777`
→ brauzer popup. Hozir birinchi qatlam yo'q, shuning uchun hamma narsa 2/3-qatlamga tushadi.

**Vazifalar (spec §6.4–6.5):**
1. `printSheet(printerName, html, pageSizeMicrons?)`: yashirin `BrowserWindow` → HTML yuklanadi
   → `webContents.print({ deviceName, silent: true, pageSize })`. **Windows drayveri
   renderlaydi** — ESC/POS kodpage muammosi yo'q (`print-agent.ts:19-21` izohidagi eski xulq).
2. `listPrinters()` → `Promise<string[]>` (o'rnatilgan printerlar).
3. Mijoz-ekran: `screen.getAllDisplays().length > 1` bo'lsa o'sha displeyda ramkasiz oyna;
   `pushCart(payload)` savatni **IPC orqali** uzatadi; tashqi ekran yo'q bo'lsa
   `toggleCustomerDisplay()` → `{ open: false, error }` (shartnomada shunday).
4. `tools/print-agent` (PowerShell) **olib tashlanmaydi** — zaxira yo'l bo'lib qoladi.
5. Pul yashigi impulsi (cash drawer kick) — agar printer drayveri qo'llab-quvvatlasa,
   `printSheet` bilan birga; qo'llamasa — hisobotda qarz sifatida qayd et, ixtiro qilma.

**Testlar:** shartnoma-testi (F2 dan) yangi metodlarni ham qamrab olishi kerak; to'liq gate.
Chop etishning o'zi — qo'lda o'lchash (virtual PDF-printer ham hisoblanadi).

**Qabul mezoni:** `printSheet` bilan chek chiqadi (real yoki virtual printer), kirill matn
buzilmagan; 2-monitor ulanganda mijoz-ekran ochiladi va savat yangilanadi.
Printer topilmasa — hisobotda «printer-tasdiqlanmagan» deb ochiq yoziladi.

<details>
<summary><b>📋 F3 SESSIYA PROMPTI</b></summary>

```
docs/superpowers/plans/2026-08-10-kassa-fazalar-ijro-reja.md faylini o'qi.
§0 (O'ZGARMAS QOIDALAR) va §2 → F3 bo'limini bajarasan. FAQAT F3.
Dizayn: docs/superpowers/specs/2026-08-10-kassa-exe-pin-design.md §6.4–6.5.

Qoidalar (buzilmaydi):
- F3 tugagach TO'XTA. F4 (installer) ni BOSHLAMA.
- apps/web/src/lib/print-agent.ts ni AVVAL o'qi — chaqiruv shakli (argumentlar, qaytish tipi)
  o'sha yerda hujjatlangan; exe unga moslashadi, teskarisi emas.
- Chop etish ishlaganini QANDAY o'lchaganingni aniq yoz. O'lchamagan bo'lsang «ishlaydi» DEMA.
- To'liq gate: money build → api typecheck → web typecheck → biome → api vitest → web vitest.
- git add faqat aniq fayllar; commitdan keyin git show --stat HEAD.
- Yakunda shu faylning §3 dagi «F3 hisoboti» shablonini Edit bilan to'ldir.

Hisobotda majburiy: (1) o'zgargan fayllar, (2) chop etish qanday o'lchandi (qaysi printer,
natija), (3) mijoz-ekran o'lchandimi, (4) pul yashigi impulsi holati, (5) gate, (6) commitlar.
```
</details>

---

### F4 — NSIS installer + avtoyangilanish

**Maqsad:** `.exe` qo'lda — admin uni kassa kompyuteriga o'rnatadi va keyingi versiyalar o'zi keladi.

**Vazifalar (spec §8):**
1. `electron-builder` konfiguratsiyasi → NSIS (`oneClick: false`, `perMachine: true`),
   natija: `Sherset-Kassa-Setup-<version>.exe`
2. **1-versiya imzosiz** (ongli qaror, spec §8.2). Sertifikat olingach
   `build.win.certificateFile`/`certificatePassword` env orqali qo'shiladi — kod o'zgarmaydi.
   Sertifikat/parol repo'ga **hech qachon** yozilmaydi.
3. `electron-updater`, `generic` provider → `https://<server>/downloads/desktop/`
   (`latest.yml` + `.exe`). Ishga tushganda va har 4 soatda tekshiriladi.
4. 🔴 Yangilanish **savdo o'rtasida o'rnatilmaydi** — yuklab olingach kutadi, kassir «Chiqish»
   bosganda o'rnatiladi.
5. `deploy/` nginx konfiguratsiyasiga statik `location /downloads/desktop/` qo'shiladi.
6. `desktop/README.md` — operator yo'riqnomasi: o'rnatish, SmartScreen ogohlantirishini
   («Дополнительно → Все равно запустить») skrinshot bilan tushuntirish, juftlash tartibi,
   qurilmani bekor qilish.

**Testlar:** to'liq gate. Installer — qo'lda yig'iladi va o'rnatiladi.

**Qabul mezoni:** `.exe` yig'iladi va o'rnatiladi; versiya ko'tarilganda yangilanish topiladi va
«Chiqish» dan keyin o'rnatiladi. Deploy qadamlari hisobotda yozilgan.

<details>
<summary><b>📋 F4 SESSIYA PROMPTI</b></summary>

```
docs/superpowers/plans/2026-08-10-kassa-fazalar-ijro-reja.md faylini o'qi.
§0 (O'ZGARMAS QOIDALAR) va §2 → F4 bo'limini bajarasan. FAQAT F4.
Dizayn: docs/superpowers/specs/2026-08-10-kassa-exe-pin-design.md §8.

Qoidalar (buzilmaydi):
- F4 tugagach TO'XTA. F5 (dollar) ni BOSHLAMA.
- VPS'ga deploy QILMA — nginx o'zgarishini faqat repo'dagi deploy/ konfiguratsiyasiga yoz va
  hisobotda «deploy qadami kutmoqda» deb belgila. Deploy alohida, foydalanuvchi qaroridan keyin.
- Sertifikat/parol/sirlarni repo'ga yozma.
- To'liq gate: money build → api typecheck → web typecheck → biome → api vitest → web vitest.
- git add faqat aniq fayllar; commitdan keyin git show --stat HEAD.
- Yakunda shu faylning §3 dagi «F4 hisoboti» shablonini Edit bilan to'ldir.

Hisobotda majburiy: (1) o'zgargan fayllar, (2) installer yig'ildimi (buyruq + natija),
(3) autoupdate qanday sozlandi, (4) nginx/deploy uchun kerakli qadamlar ro'yxati,
(5) gate, (6) commitlar.
```
</details>

---

### F5 — Dollar savdo (USD tender POS'da)

**Maqsad:** kassir chekni so'm + dollar aralash yopa oladi; kurs chekka muzlatiladi.

**Hozirgi holat — SERVER TAYYOR, UI YO'Q (dalil bilan):**
- `apps/api/src/modules/retail-sale/retail-tenders.ts:29-36` — `TENDER.cashUsd = 'CASH_USD'`
- `:59-63` — `cashUsdMinor` + `usdRateE8` kirishlari; `:101` — `usdBaseMinor()` formulasi
- `:136-140` — **kurs topilmasa to'lov BLOKLANADI** (jim 1:1 taqiqlangan)
- `:170-176` — qaytim chegarasiga dollarning so'm ekvivalenti kiradi
- `:206-228` — `legacyTotals()` CASH_USD ni so'm naqdiga QO'SHMAYDI (ataylab)
- `apps/api/src/modules/retail-sale/retail-sale.schema.ts:106-134` — `cashUsdAmountMinor`,
  `usdRateMinor`, kurs majburiyligi, **stale-scale guard** (`< 1_000_000_000` → 400)
- `RetailSalePayment.currency/rateMinor/amountBaseMinor` — `packages/db/prisma/schema.prisma:8500-8530`
- `CashierSession.expectedCashUsdMinor` va smena yopilishida USD sanog'i — allaqachon ishlaydi
- ❌ `apps/web/src` bo'ylab `cashUsdAmountMinor`/`usdRateMinor` — **0 hit** (grep tasdiqladi)
- ❌ `apps/web/src/components/pos/rasmilashtirish-modal.tsx:53` — `type ActiveField = 'cash' | 'card' | 'terminal'`
- ❌ `apps/web/src/app/(app)/sotuv/page.tsx:~1000-1015` — post payload'da 4 maydon, USD yo'q

**Vazifalar:**
1. **Kurs olish (FE):** `GET /exchange-rates/rate?currency=USD` — kiosk allowlist'da BOR
   (`kiosk-policy.ts:61`), carry-forward server tomonda (`exchange-rate.service.ts:121-155`).
   Kurs to'lov oynasida ko'rsatiladi (sanasi bilan) va payload'da **muzlatib** yuboriladi.
   🔴 Kurs FE'da QO'LDA kiritilmaydi (mavjud `call-outcome-modal.tsx` naqshi qo'lda — uni
   ko'chirma), va FE **o'zi hisoblamaydi** — server formulasini ko'rsatadi xolos.
2. **`rasmilashtirish-modal.tsx`:** 4-tender «Naqd USD» — `ActiveField` ga `cashUsd` qo'shiladi,
   dollar summa kiritiladi, so'm ekvivalenti jonli ko'rinadi, qaytim so'mda hisoblanadi
   (server `retail-tenders.ts:170-176` chegarasi bilan mos bo'lsin).
3. **`page.tsx` post payload:** `cashUsdAmountMinor` + `usdRateMinor` qo'shiladi (`/post` chaqiruvi).
4. **Chek — UCHALA renderer** (xotira: «ombor cheki uch renderer — biri o'zgarsa qolgani jimgina
   eskiradi»): `print-agent.ts` `buildReceiptText` (~:414-420) va `buildReceiptHtml` (~:483-487)
   + `apps/web/src/app/print/retail-sale/…` React sahifasi — «Dollar (kurs bilan)» qatori.
   🔴 **AUDIT (2026-08-11) — bu band kengaytirildi.** Chek qatlami tubdan buzuq:
   `ReceiptSale` `RetailSalePayment` qatorlarini UMUMAN o'qimaydi, faqat eski legacy
   ustunlarni. Oqibatlari **o'lchangan**:
   - «Qarz» qatori **o'lik** — `advancePaymentSumMinor` ga hech kim yozmaydi (grep: 0 hit).
     Qarzga sotilgan chekda 60 000 qayerdaligi haqida bironta qator yo'q.
   - «Terminal» qatori **hech qachon chiqmaydi** — `terminalAmountMinor` `RetailSale` da
     mavjud bo'lmagan ustun; terminal puli `legacyTotals` orqali «Karta» bo'lib ko'rinadi.
   - Chegirma chekda **ko'rinmaydi**, `qty × price` va `sum` bir-biriga mos kelmaydi
     (`priceMinor` chegirmasiz, `sumMinor` chegirmali) — mijoz uchun izohsiz nomuvofiqlik.
   ⇒ Bu fazada chek to'lov qatlami **`RetailSalePayment` qatorlaridan o'qishga o'tkaziladi**
   (bitta manba), USD qatori esa tabiiy ravishda o'sha yerdan chiqadi. Uchala renderer birga.
5. **Qarzli chekni qaytarish (AUDIT)** — hozir POS'dan **mumkin emas**:
   `sotuv/page.tsx:276-291` refundda har doim to'liq naqd so'raydi
   (`cashAmountMinor` = butun summa), server esa `retail-refund-validation.ts:316-319`
   bilan «payout > moneyMaxMinor» deb 400 beradi (xom inglizcha matn). FE `debtReturnMinor`
   ni hisoblab yuborishi kerak (server auto-split'i faqat maydon berilmaganda ishlaydi).
6. **Kurs yo'q kun:** server 400 beradi; FE tushunarli xabar ko'rsatadi va USD maydonini
   bloklaydi (jim 1:1 ga tushish TAQIQ).
7. **Eskirgan izohni yangila:** `schema.prisma:8489-8498` — «CASH_USD rejalashtirilgan, hali
   ULANMAGAN» endi noto'g'ri.
8. i18n: yangi matnlar `messages/{ru,uz}.json`.

**Testlar:**
- FE: modal komponent testi (USD kiritilganda payload maydonlari, kurs ko'rsatilishi, kurssiz
  holatda bloklash) · post payload wiring-testi
- Chek: uchala renderer USD qatorini chiqarishi (snapshot yoki matn-tekshiruv)
- API tomonga tegilsa — mavjud `retail-tenders` testlari yashil qolishi
- To'liq gate + `pnpm i18n:gate`

**Qabul mezoni:** brauzerda aralash to'lov (so'm naqd + USD naqd + karta) chek yopadi;
chekda dollar qatori kurs bilan; smena yopilishida `expectedCashUsdMinor` mos; kurssiz kunda
to'lov bloklanadi va xabar tushunarli.

**🔴 Ochiq qarz (hisobotga yoziladi, bu fazada YECHILMAYDI):** dollar `CashDesk.balanceMinor`
ga tushmaydi (`retail-sale.service.ts:918-931` — ataylab), shuning uchun pul-daftar va
bank-balans hisobotlari kassadagi dollarni ko'rmaydi. Yechim alohida faza talab qiladi.

<details>
<summary><b>📋 F5 SESSIYA PROMPTI</b></summary>

```
docs/superpowers/plans/2026-08-10-kassa-fazalar-ijro-reja.md faylini o'qi.
§0 (O'ZGARMAS QOIDALAR) va §2 → F5 bo'limini bajarasan. FAQAT F5.

MUHIM: server tomoni ALLAQACHON tayyor (retail-tenders.ts, retail-sale.schema.ts,
RetailSalePayment). Server matematikasini QAYTA YOZMA — avval o'qi, keyin FE uni chaqirsin.
Kurs ×10^8 kanonik (RATE_SCALE, @moysklad/money) — masshtabni FE'da ixtiro qilma.

Qoidalar (buzilmaydi):
- F5 tugagach TO'XTA. F6 (USD qarz to'lovi) ni BOSHLAMA.
- TDD: avval yiqiladigan test.
- Chek UCHTA rendererda ko'rsatiladi (matn/HTML/React) — uchalasiga ham teg, aks holda biri
  jimgina eskiradi.
- Kurs yo'q kunda jim 1:1 ga tushish TAQIQ — server 400 beradi, FE buni ko'rsatadi.
- To'liq gate: money build → api typecheck → web typecheck → biome → api vitest → web vitest
  → pnpm i18n:gate.
- Brauzerda aralash to'lovni HAQIQATAN o'lcha (pnpm dev), natijani yoz.
- git add faqat aniq fayllar; commitdan keyin git show --stat HEAD.
- Yakunda shu faylning §3 dagi «F5 hisoboti» shablonini Edit bilan to'ldir.

Hisobotda majburiy: (1) o'zgargan fayllar, (2) qaysi test qaysi xulqni qo'riqlaydi,
(3) brauzer o'lchovi (qanday summa, qanday kurs, natija), (4) uchala chek renderer holati,
(5) CashDesk dollar qarzi holati, (6) gate, (7) commitlar.
```
</details>

---

### F6 — USD qarz to'lovi

**Maqsad:** kassir mijozdan qarzni dollarda ham qabul qila oladi.

**Hozirgi holat:**
- `apps/api/src/modules/debt/debt.schema.ts:437-447` — `PosDebtPaymentSchema` da `currency`
  bor, lekin **kurs maydoni YO'Q** ⇒ USD to'lovni qabul qilishning yo'li yo'q
- `:449-457` — `usdCentsToSomTiyin(cents, rateE8)` helper **tayyor** (aynan `retail-tenders.ts:101`
  formulasi bilan bir xil — nusxa emas, umumiy manba)
- `apps/web/src/components/pos/debt-payment-dialog.tsx` — UZS-only
- Naqsh sifatida ishlatiladigan namuna: `retail-sale.schema.ts:110-134` (kurs majburiyligi +
  stale-scale guard)

**Vazifalar:**
1. `PosDebtPaymentSchema` ga kanonik ×10⁸ kurs maydoni + «USD bo'lsa kurs MAJBURIY» qoidasi +
   **stale-scale guard** (eski ×10⁴ masshtab 400 bilan rad etiladi).
2. Servis: USD summa `usdCentsToSomTiyin` bilan so'mga o'giriladi; qarz daftariga yoziladigan
   qiymat va PKO cheki mos bo'lsin. 🔴 Xotira: «debt daftari simmetriya yopildi» —
   create `+total` · to'lov `−paid`; simmetriyani buzma.
3. Kurs to'lov paytida **muzlatiladi** (chek/hujjatda saqlanadi) — ertangi kurs bilan qayta
   baholanmaydi.
4. `debt-payment-dialog.tsx` — UZS/USD tanlovi, kurs avtomatik (`/exchange-rates/rate`),
   so'm ekvivalenti jonli, kurssiz kunda USD bloklanadi.
5. PKO cheki USD qatorini ko'rsatadi (F5 dagi chek qatlamlari bilan bir uslubda).
6. 🔴 **Smena hisobiga ta'siri — AUDIT o'lchadi, TUZATISH SHU FAZADA:**
   `cashier-session.service.ts:425-427` naqd qarz to'lovlarini **valyuta filtrisiz** sanaydi
   (`method:'cash'`), `DebtPayment.amountMinor` esa har doim so'm ekvivalentida. Ya'ni
   `currency:'USD'` to'lovda yashiqqa **dollar** tushadi, so'm-expected esa oshadi va
   USD-expected (`collectUsdCashInputs` faqat `RetailSalePayment CASH_USD` o'qiydi) uni
   ko'rmaydi ⇒ soxta so'm kamomadi + hisobga olinmagan dollar. Bugun FE `currency`
   yubormagani uchun bu **uxlab yotgan mina** — F6 uni uyg'otadi, shuning uchun
   valyuta ajratmasi shu fazada yopiladi.
7. 🟠 **Valyutali kassa (AUDIT):** `CashDesk.currency ≠ UZS` bo'lsa drawer-in/out va cash-out
   hujjatlari so'm agregatiga sent bilan kiradi (`cashier-session.service.ts:429-439`
   valyuta bo'yicha filtrlamaydi, `:554,588,1143` esa hujjatga kassa valyutasini yozadi).
   Kamida: agregatlarga valyuta filtri; USD-kassa to'liq qo'llab-quvvatlanmasa — ochiq
   xato bilan bloklash (jim noto'g'ri hisobdan ko'ra).
8. i18n: yangi matnlar ru+uz.

**Testlar:** schema testi (kurssiz USD → 400, stale-scale → 400) · servis testi (o'girish
formulasi, daftar simmetriyasi) · dialog komponent testi · to'liq gate + i18n.

**Qabul mezoni:** kassir USD'da qarz to'lovini qabul qiladi, qarz to'g'ri kamayadi, PKO cheki
kurs bilan chiqadi, kurssiz kunda bloklanadi.

<details>
<summary><b>📋 F6 SESSIYA PROMPTI</b></summary>

```
docs/superpowers/plans/2026-08-10-kassa-fazalar-ijro-reja.md faylini o'qi.
§0 (O'ZGARMAS QOIDALAR) va §2 → F6 bo'limini bajarasan. FAQAT F6.

MUHIM: apps/api/src/modules/debt/debt.schema.ts dagi usdCentsToSomTiyin helperini ISHLAT,
formulani qayta yozma. Kurs guard'lari uchun retail-sale.schema.ts naqshini ko'chir
(stale-scale guard shart). Qarz daftari simmetriyasini (create +total, to'lov −paid) buzma.

Qoidalar (buzilmaydi):
- F6 tugagach TO'XTA. F7 (zakazlar) ni BOSHLAMA.
- TDD: avval yiqiladigan test.
- Smena hisobiga ta'sirini KOD BILAN tekshir va hisobotda ayt — taxmin qilma.
- To'liq gate: money build → api typecheck → web typecheck → biome → api vitest → web vitest
  → pnpm i18n:gate.
- Brauzerda USD qarz to'lovini o'lcha (pnpm dev), natijani yoz.
- git add faqat aniq fayllar; commitdan keyin git show --stat HEAD.
- Yakunda shu faylning §3 dagi «F6 hisoboti» shablonini Edit bilan to'ldir.

Hisobotda majburiy: (1) o'zgargan fayllar, (2) schema guard'lari, (3) qarz daftariga ta'siri
qanday tekshirildi, (4) smena USD hisobiga ta'siri, (5) brauzer o'lchovi, (6) gate, (7) commitlar.
```
</details>

---

### F7 — Zakazlar POS'da: ro'yxat + tasdiqlash

**Maqsad:** kassir jarayondagi zakazlarni (CustomerOrder) POS'da ko'radi va o'zi tasdiqlaydi.

**Hozirgi holat (dalil bilan):**
- `/sotuv` da `/customer-orders` chaqiruvi **umuman yo'q** (butun sahifa bo'ylab 0 hit)
- Kiosk allowlist'da `/customer-orders` **YO'Q** → hozir qo'shsang ham kassir 403 oladi
- FSM mavjud: `apps/api/src/modules/customer-order/customer-order.schema.ts:11-20`
  (`draft | confirmed | awaiting_payment | paid | partially_shipped | fully_shipped | closed | cancelled`),
  o'tish jadvali `customer-order.service.ts:2886-2899`
- Transition endpointi: `POST /customer-orders/:id/transitions/:target`, ruxsat
  **`customerorder.approve`** (`customer-order.controller.ts:142-143`)
- `confirmed` da **avtomatik rezerv** qo'yiladi (`customer-order.service.ts:1137-1165`) + audit (`:1148-1150`)
- ⚠️ CustomerOrder'da **ikki holat o'qi** bor: FSM `state` va tenant-sozlanadigan `statusId`
  (`State` jadvali) — ular mustaqil

**Qarorlar (bu fazada ixtiro qilinmaydi):**
- Yangi qabul-FSM (`acceptance-fsm`) **QO'SHILMAYDI** — mavjud transition yetarli. Uchinchi
  holat-o'qi CustomerOrder'ni chalkashtiradi. «Kim tasdiqladi» — audit allaqachon yozadi.
- Kassir roliga `customerorder.approve` ruxsati **rol-shabloni orqali** beriladi (MK29 naqshi),
  qo'lda DB tahriri emas.

**Vazifalar:**
1. Kiosk allowlist: `/customer-orders` uchun **aniq** qoidalar (GET + transition POST).
   `*` bermaslik — o'chirish/tahrirlash kassirga ochilmasin. Negativ test bilan qo'riqla.
2. Kassir roli uchun `customerorder.approve` ruxsati (seed/rol-shabloni; xotira: «eski seed'li
   bazada ruxsat qatorlari yo'q» — lokal bazada tekshir, prod uchun qadam hisobotga yoziladi).
3. `/sotuv` ga **«Zakazlar» tabi**: jarayondagi zakazlar ro'yxati (holat bo'yicha filtr:
   `draft`/`confirmed`/`awaiting_payment`; do'kon bo'yicha cheklov), zakaz detali (pozitsiyalar,
   summa, mijoz, holat).
4. **Tasdiqlash tugmasi:** `draft → confirmed` (rezerv avtomatik tushadi). Natija darhol
   ro'yxatda ko'rinadi; xato holatda tushunarli xabar.
5. Ruxsati yo'q kassir tugmani ko'rmaydi **va** server ham rad etadi (UI yashirish yetarli emas —
   `kiosk-policy.ts:4-8` falsafasi).
6. i18n ru+uz.

**Testlar:** kiosk-policy testi (pozitiv + negativ) · zakazlar tabi komponent/wiring testlari ·
ruxsat qo'riqchisi testi · to'liq gate + i18n.

**Qabul mezoni:** kiosk-kassir POS'da zakazlar ro'yxatini ko'radi, `draft` zakazni tasdiqlaydi,
rezerv tushadi (DB'da o'lchanadi), ruxsatsiz foydalanuvchi 403 oladi.

<details>
<summary><b>📋 F7 SESSIYA PROMPTI</b></summary>

```
docs/superpowers/plans/2026-08-10-kassa-fazalar-ijro-reja.md faylini o'qi.
§0 (O'ZGARMAS QOIDALAR) va §2 → F7 bo'limini bajarasan. FAQAT F7.

MUHIM: mavjud CustomerOrder FSM va POST /customer-orders/:id/transitions/:target ishlatiladi.
YANGI qabul-FSM yaratma (reja buni ataylab rad etgan — sabab F7 bo'limida yozilgan).
Kiosk allowlist'ga `*` bermaydi — faqat aniq yo'l va metodlar, negativ test bilan.

Qoidalar (buzilmaydi):
- F7 tugagach TO'XTA. F8 (zakazni to'lash) ni BOSHLAMA.
- TDD: avval yiqiladigan test.
- Rezerv haqiqatan tushganini DB'da o'lcha (climart_adopt @ localhost:5432), «tushishi kerak»
  deb yozma.
- To'liq gate: money build → api typecheck → web typecheck → biome → api vitest → web vitest
  → pnpm i18n:gate.
- git add faqat aniq fayllar; commitdan keyin git show --stat HEAD.
- Yakunda shu faylning §3 dagi «F7 hisoboti» shablonini Edit bilan to'ldir.

Hisobotda majburiy: (1) o'zgargan fayllar, (2) allowlist'ga qo'shilgan aniq yo'llar,
(3) ruxsat qanday berildi va prod uchun qanday qadam kerak, (4) rezerv qanday o'lchandi,
(5) brauzer o'lchovi, (6) gate, (7) commitlar.
```
</details>

---

### F8 — Zakazni POS'dan to'lash (chek ↔ zakaz bog'lanishi)

**Maqsad:** kassir zakazni to'laydi — chek zakazga bog'lanadi, zakaz `paid` holatiga o'tadi.

**Hozirgi holat:**
- `RetailSale.customerOrderId` ustuni + relation + indeks **mavjud**
  (`packages/db/prisma/schema.prisma:8386, 8461, 8471`)
- 🔴 **Hech bir kod bu ustunga yozmaydi** — `apps/api/src/modules/retail-sale/` bo'ylab 0 hit.
  Ulanish nuqtasi tayyor, sim tortilmagan.

**Vazifalar:**
1. Zakazdan **savat yuklash**: zakaz pozitsiyalari `/sotuv` savatiga tushadi (narx/miqdor
   zakazdan, kassir tahrirlay oladimi — qaror faza boshida yozib qo'yiladi).
2. To'lov: mavjud rasmilashtirish oqimi (naqd/karta/terminal/qarz + USD agar F5 bajarilgan bo'lsa).
3. `RetailSale.customerOrderId` **yoziladi** — post schema + servis. Bu fazaning yadrosi.
4. Zakaz holati `paid` ga o'tadi (mavjud transition orqali, o'z qo'lda yozilgan yangi o'tish emas).
5. 🔴 **Ikki marta to'lash himoyasi:** zakaz allaqachon `paid` bo'lsa POS to'lovni rad etadi.
   Tekshiruv **serverda va tranzaksiya ichida** (UI tekshiruvi yetarli emas — ikki kassir
   bir vaqtda bosishi mumkin).
6. **Rezerv → chiqim:** zakaz to'langanda rezerv nima bo'ladi — mavjud kod bilan aniqlanadi
   (yig'ish zanjiri `send-to-picking` bilan birlashadimi yoki to'g'ridan-to'g'ri sotiladimi).
   Qaror hisobotda **sabab bilan** yoziladi.
7. **Qisman to'lov:** `awaiting_payment` da qoladimi — qaror va sabab.
8. 🔴 **`CartLine.quantity` tipi (AUDIT) — bu fazada tuzatiladi.** Hozir `number`, server
   sxemasi esa `Decimal(20,6)` ruxsat beradi (og'irlik tovarlar). Kasr miqdorli «tayyor»
   chek savatga yuklansa `BigInt(1.5)` **RangeError** otadi va butun POS oq ekranga aylanadi
   (`sotuv/page.tsx:764`, `:1794`, `cart-math.ts:31`; yuklovchi `:901`). Zakaz pozitsiyalari
   ham kasr miqdorli bo'lishi mumkin — shuning uchun aynan shu fazada.
9. 🟡 **Savat footeri ↔ server chegirmasi (AUDIT):** sahifa jamiga bir marta floor-chegirma
   qo'llaydi (`page.tsx:757`), server har qatorni alohida half-up yaxlitlaydi ⇒ tiyin farqi
   (ekran ≠ chek). `cart-math.ts:107-111` da server-mos `discountedCartTotalMinor` ALLAQACHON
   bor, sahifa uni ishlatmaydi — shunga o'tkaziladi.
10. i18n ru+uz.

**Testlar:** servis testi (`customerOrderId` yoziladi; `paid` zakaz ikkinchi marta to'lanmaydi;
holat o'tishi) · **concurrency testi** (ikki parallel to'lov — bittasi yutadi) · FE wiring ·
to'liq gate + i18n.

**Qabul mezoni:** zakaz POS'dan to'lanadi, chek zakazga bog'lanadi (DB'da o'lchanadi), zakaz
`paid`, takroriy to'lov rad etiladi, qoldiq/rezerv holati hisobotda tushuntirilgan.

<details>
<summary><b>📋 F8 SESSIYA PROMPTI</b></summary>

```
docs/superpowers/plans/2026-08-10-kassa-fazalar-ijro-reja.md faylini o'qi.
§0 (O'ZGARMAS QOIDALAR) va §2 → F8 bo'limini bajarasan. FAQAT F8.

MUHIM: RetailSale.customerOrderId ustuni ALLAQACHON bor (schema.prisma:8386) — migratsiya
kerak emas, unga YOZUVCHI kerak. Zakaz holatini mavjud transition orqali o'zgartir, yangi
o'tish jadvali yozma. Ikki marta to'lash himoyasi SERVERDA va tranzaksiya ichida.

Qoidalar (buzilmaydi):
- F8 tugagach TO'XTA. F9 (mijoz kartasi) ni BOSHLAMA.
- TDD: avval yiqiladigan test. Concurrency testini ALOHIDA yoz.
- Rezerv/qisman to'lov qarorlarini KOD BILAN asosla va hisobotda sabab bilan yoz.
- To'liq gate: money build → api typecheck → web typecheck → biome → api vitest → web vitest
  → pnpm i18n:gate.
- Brauzerda to'liq oqimni o'lcha: zakaz → savat → to'lov → chek → zakaz holati.
- git add faqat aniq fayllar; commitdan keyin git show --stat HEAD.
- Yakunda shu faylning §3 dagi «F8 hisoboti» shablonini Edit bilan to'ldir.

Hisobotda majburiy: (1) o'zgargan fayllar, (2) customerOrderId qayerda yoziladi,
(3) ikki marta to'lash himoyasi qanday va qanday sinaldi, (4) rezerv qarori + sababi,
(5) qisman to'lov qarori + sababi, (6) brauzer o'lchovi, (7) gate, (8) commitlar.
```
</details>

---

### F9 — Mijoz kartasi POS'da

**Maqsad:** kassir mijoz bilan to'liq ishlaydi — kim ekanini, qancha qarzi borligini, nima
olganini va qanday zakazlari borligini bir joyda ko'radi.

**Hozirgi holat:** mijoz tanlash va kassada yangi mijoz ochish bor
(`components/pos/rasmilashtirish-modal.tsx:87-99`), qarz to'lovi bor
(`components/pos/debt-payment-dialog.tsx` → `/debts/pos/summary/:id`, `/debts/pos/pay`),
lekin **hammasi to'lov dialoglari ichida yashiringan** — mijozning umumiy ko'rinishi yo'q.

**Vazifalar:**
1. **Mijoz paneli** (POS'da alohida panel/tab): tanlangan mijoz uchun
   - joriy qarz saldosi (`/debts/pos/summary/:id` — mavjud endpoint)
   - oxirgi xaridlar tarixi (retail-sales mijoz bo'yicha filtr)
   - jarayondagi zakazlari (F7 dagi ro'yxatdan, mijoz bo'yicha filtr)
   - tez amallar: «Qarz to'lash», «Zakazni ochish», «Chekni qayta chop etish»
2. **Telefon bo'yicha qidiruv** — kassada eng tez identifikator. Server tomonda qidiruv
   telefonni qamrab olishini **tekshir** (`/counterparties?search=`), qamramasa qo'sh
   (indeks holatini ham ko'r — xotira: «indeksni so'rov yoqadi, sxema emas»).
3. **Mijoz ma'lumotini tahrirlash** — faqat telefon va izoh (to'liq karta emas: kiosk chegarasi).
   Allowlist'ga `PATCH/PUT /counterparties/:id` kerak bo'lsa **aniq** qo'shiladi.
4. 🔴 **IKKI QARZ DAFTARI UCHRASHMAYDI (AUDIT) — bu fazaning YADROSI.**
   POS'da qarzga sotilgan chek qarzni faqat `CounterpartyBalance` ga yozadi
   (`retail-sale.service.ts:950-963` — ataylab), POS «Qarz to'lovi» oynasi esa FAQAT
   `Debt` reyestrini o'qiydi (`pos-debt-payment.service.ts:282-293`). Oqibat **o'lchangan**:
   kassir 60 000 qarzga sotadi → ertasi kuni mijoz to'lagani keladi → oynada
   «ochiq qarz yo'q», `pos/pay` 400. **Kassada bu qarzni qabul qilish yo'li umuman yo'q.**
   Qaror faza boshida (kod bilan asoslab): POS qarz-sotuvi `Debt` yozuvini ham yaratadimi,
   yoki oyna balansdan o'qiydimi. Ikki «haqiqat» qolmasin.
5. **Qaytarish (refund) qarzga ta'siri** — hozirgi xulqni **o'lchab** (qarzga sotilgan chek
   qaytarilganda qarz kamayadimi) hisobotda ayt. Nuqson topilsa — tuzatish **bu fazada**,
   lekin avval o'lchov, keyin da'vo.
6. 🟡 **POS summary sanasi (AUDIT):** `pos-debt-payment.service.ts:78` qarzni
   `nextContactAt ?? createdAt` bo'yicha tartiblaydi, FIFO taqsimot esa (`:349`) faqat
   `createdAt` bo'yicha ⇒ kassir ko'rgan tartib server yopadigan tartibdan farq qiladi
   (dialogda kelajakdagi qo'ng'iroq sanasi «qarz sanasi» bo'lib ko'rinadi).
7. i18n ru+uz.

**Testlar:** panel komponent testlari (saldo/tarix/zakaz bloklari; NULL≠0 farqi — o'lchanmagan
saldo «0» deb ko'rsatilmasin) · qidiruv testi · allowlist testi · to'liq gate + i18n.

**Qabul mezoni:** kassir mijozni telefon bo'yicha topadi, panelda qarz/tarix/zakazlarni ko'radi,
tez amallar ishlaydi; refund↔qarz xulqi o'lchangan va hisobotda yozilgan.

<details>
<summary><b>📋 F9 SESSIYA PROMPTI</b></summary>

```
docs/superpowers/plans/2026-08-10-kassa-fazalar-ijro-reja.md faylini o'qi.
§0 (O'ZGARMAS QOIDALAR) va §2 → F9 bo'limini bajarasan. FAQAT F9.

MUHIM: mavjud endpointlarni ishlat (/debts/pos/summary/:id, /counterparties, /retail-sales).
Yangi endpoint faqat mavjudi yetmasa. Kiosk allowlist'ga qo'shsang — aniq yo'l va metod,
negativ test bilan.
NULL ≠ 0: o'lchanmagan saldo «0 so'm» deb ko'rsatilmasin (xotira: ma'lumot sifati bayrog'i).

Qoidalar (buzilmaydi):
- F9 tugagach TO'XTA. F10 (avans) ni BOSHLAMA.
- TDD: avval yiqiladigan test.
- Refund ↔ qarz xulqini AVVAL o'lcha (kod + lokal DB), keyin da'vo qil. Nuqson bo'lsa tuzat.
- To'liq gate: money build → api typecheck → web typecheck → biome → api vitest → web vitest
  → pnpm i18n:gate.
- git add faqat aniq fayllar; commitdan keyin git show --stat HEAD.
- Yakunda shu faylning §3 dagi «F9 hisoboti» shablonini Edit bilan to'ldir.

Hisobotda majburiy: (1) o'zgargan fayllar, (2) panel qaysi manbalardan o'qiydi,
(3) telefon-qidiruv holati (ishladimi, indeks kerakmi), (4) refund↔qarz o'lchovi natijasi,
(5) brauzer o'lchovi, (6) gate, (7) commitlar.
```
</details>

---

### F10 — Avans (oldindan to'lov) qabul qilish

**Maqsad:** mijozda qarz bo'lmasa ham kassir undan pul qabul qila oladi (bo'lajak xarid uchun),
va bu pul keyin xarid/qarzga hisoblanadi.

**Hozirgi holat:** POS qarz to'lovi **FIFO** — faqat MAVJUD qarzni yopadi
(`PosDebtPaymentSchema`, `/debts/pos/pay`). Ortiqcha summa yoki qarzsiz to'lov uchun yo'l yo'q.

**Vazifalar:**
1. **Model qarori (faza boshida, kod bilan asoslab):** avans qayerda saqlanadi —
   mavjud qarz daftarining manfiy saldosi sifatidami yoki alohida belgi bilanmi.
   🔴 Xotira: «debt daftari — simmetriya yopildi» (create `+total` · to'lov `−paid` ·
   remove `−total`); simmetriyani buzadigan yechim tanlanmasin.
2. Avans qabul qilish oqimi POS'da (mijoz panelidan — F9): summa, valyuta (UZS/USD agar F6
   bajarilgan bo'lsa), PKO cheki.
3. Ortiqcha to'lov: FIFO qarzlarni yopgach **qoldiq avansga** o'tadi (jimgina yo'qolmaydi).
4. Avansni ishlatish: keyingi savdoda «avansdan yechish» — chek to'lov turlaridan biri sifatida
   yoki avtomatik. Qaror sabab bilan yoziladi.
5. Balans o'quvchilariga ta'siri **o'lchanadi** (xotira: «balans o'quvchilari jurnaldan» —
   4 o'quvchi bitta manbadan; avans ularda qanday ko'rinadi).
6. i18n ru+uz.

**Testlar:** daftar simmetriyasi testi · ortiqcha to'lov taqsimoti testi · avansdan yechish
testi · balans o'quvchilari testi · to'liq gate + i18n.

**Qabul mezoni:** qarzsiz mijozdan pul qabul qilinadi, saldo to'g'ri ko'rinadi, keyingi xaridda
avans ishlatiladi, balans hisobotlarida ikki karra sanalmaydi.

<details>
<summary><b>📋 F10 SESSIYA PROMPTI</b></summary>

```
docs/superpowers/plans/2026-08-10-kassa-fazalar-ijro-reja.md faylini o'qi.
§0 (O'ZGARMAS QOIDALAR) va §2 → F10 bo'limini bajarasan. FAQAT F10.

MUHIM: qarz daftari simmetriyasi (create +total · to'lov −paid · remove −total) buzilmaydi —
avval mavjud daftar kodini o'qi, keyin model qarorini yoz. Balans o'quvchilari (4 ta, bitta
jurnaldan) avansni qanday ko'rishini O'LCHA — ikki karra sanash eng katta xavf.

Qoidalar (buzilmaydi):
- F10 tugagach TO'XTA. F11 ni BOSHLAMA.
- TDD: avval yiqiladigan test.
- Model qarorini (avans qayerda yashaydi) SABAB bilan hisobotda yoz.
- To'liq gate: money build → api typecheck → web typecheck → biome → api vitest → web vitest
  → pnpm i18n:gate.
- git add faqat aniq fayllar; commitdan keyin git show --stat HEAD.
- Yakunda shu faylning §3 dagi «F10 hisoboti» shablonini Edit bilan to'ldir.

Hisobotda majburiy: (1) o'zgargan fayllar, (2) avans model qarori + sababi, (3) daftar
simmetriyasi qanday tekshirildi, (4) balans o'quvchilariga ta'siri, (5) brauzer o'lchovi,
(6) gate, (7) commitlar.
```
</details>

---

### F11 — Z-hisobot chop sahifasi (`/print/z-report`)

**Maqsad:** smena yopilganda Z-hisobot chek printerdan chiqadi.

**Hozirgi holat:**
- `apps/api/src/modules/auth/kiosk-policy.ts:74` izohi `/print` ni «chek, PKO, RKO,
  **Z-hisobot**» deb va'da qiladi
- `apps/web/src/app/print/` da esa: `cash-out`, `debt-payment`, `retail-sale`, `picking`,
  `customer-order` bor — **`z-report` YO'Q**
- Ma'lumot manbai tayyor: `GET /cashier-sessions/:id/z-report`
  (`cashier-session.controller.ts:189`), to'liq ekran versiyasi
  `apps/web/src/app/(app)/retail/sessions/[id]/page.tsx:123-131`

**Vazifalar:**
1. `apps/web/src/app/print/z-report/[id]/page.tsx` — chek formatida (72mm) Z-hisobot:
   smena raqami/sana, kassir, kutilgan/haqiqiy naqd (UZS **va USD**), farq, sotuvlar/qaytarishlar
   soni va summasi, to'lov turlari kesimi, kirim/chiqim.
   🔴 NULL≠0: sanalmagan USD `0` deb ko'rsatilmaydi (`CashierSession` izohi shunday talab qiladi).
2. `?auto=1` bilan avto-chop (boshqa print sahifalari naqshi).
3. Smena yopilgandan keyin `/sotuv` dan chop etish tugmasi.
4. `print-agent.ts` orqali native chop etish yo'li (electron → agent → popup fallback).
5. i18n ru+uz.

**Testlar:** sahifa render testi (NULL/0/normal uch holat — xotira: «brauzer-QA statik
ko'rmaganini tutadi») · wiring testi · to'liq gate + i18n.

**Qabul mezoni:** yopilgan smena uchun `/print/z-report/<id>` ochiladi, raqamlar
`/retail/sessions/<id>` bilan **mos** (ikki manbadan solishtir), chop etish ishlaydi.

<details>
<summary><b>📋 F11 SESSIYA PROMPTI</b></summary>

```
docs/superpowers/plans/2026-08-10-kassa-fazalar-ijro-reja.md faylini o'qi.
§0 (O'ZGARMAS QOIDALAR) va §2 → F11 bo'limini bajarasan. FAQAT F11.

MUHIM: raqamlarni O'ZING hisoblama — GET /cashier-sessions/:id/z-report beradi. Natijani
/retail/sessions/[id] sahifasi bilan solishtir (bir raqamni ikki manbadan tekshir).
NULL ≠ 0: sanalmagan USD naqdi «0» emas, «sanalmagan» deb ko'rsatiladi.

Qoidalar (buzilmaydi):
- F11 tugagach TO'XTA.
- TDD: avval yiqiladigan test (NULL/0/normal uch holat).
- To'liq gate: money build → api typecheck → web typecheck → biome → api vitest → web vitest
  → pnpm i18n:gate.
- git add faqat aniq fayllar; commitdan keyin git show --stat HEAD.
- Yakunda shu faylning §3 dagi «F11 hisoboti» shablonini Edit bilan to'ldir.

Hisobotda majburiy: (1) o'zgargan fayllar, (2) raqamlar qaysi ikki manbadan solishtirildi va
mos keldimi, (3) NULL holati qanday ko'rsatiladi, (4) brauzer o'lchovi, (5) gate, (6) commitlar.
```
</details>

---

### F13 — Smena-qabul avtomatikasi tirik emas (audit topilmasi)

**Maqsad:** yopilgan smenalar navbatda abadiy osilib qolmasin.

**Hozirgi holat (AUDIT 2026-08-11, o'lchangan):** `shift-acceptance.service.ts:266` va `:301`
dagi `escalateOverdue` va `markStale` metodlarini **hech kim chaqirmaydi** (grep: yagona
ishlatuvchi — o'z test fayllari). `employee-daily-kpi.cron.ts:66` **boshqa** servisning
(`DailyKpiAcceptanceService`) shu nomli metodini chaqiradi. Bu — «yetim modul = o'lik
funksiya» bug-klassi (xotira).

Oqibatlari:
- `SHIFT_ESCALATE_AFTER_DAYS=3` hech qachon ishlamaydi — javobsiz `pending`/`rejected`
  smenalar navbatda qoladi;
- `stale` holatiga o'tish yo'q;
- `force_accept` faqat menejer QO'LDA eskalatsiya qilsagina yetib boriladi.

**Vazifalar:**
1. Cron/scheduler'ga ulash (mavjud `@nestjs/schedule` naqshi; `employee-daily-kpi.cron.ts`
   namuna) — **lekin avval** nega ulanmaganini tekshir (ehtimol ataylab kechiktirilgan).
2. 🔴 Wiring qo'riqchisi: `app-boot.test.ts` yoki shunga o'xshash testda metod haqiqatan
   chaqirilishini qulfla — aks holda keyingi refactor uni yana yetim qoldiradi.
3. Eskalatsiya xabari (Telegram/bildirishnoma) kimga ketishini tekshir.

**Qabul mezoni:** 3 kundan oshgan `pending` smena avtomatik eskalatsiya qilinadi
(soxta soat bilan test), wiring-testi metod chaqirilishini qulflaydi.

<details>
<summary><b>📋 F13 SESSIYA PROMPTI</b></summary>

```
docs/superpowers/plans/2026-08-10-kassa-fazalar-ijro-reja.md faylini o'qi.
§0 (O'ZGARMAS QOIDALAR) va §2 → F13 bo'limini bajarasan. FAQAT F13.

MUHIM: avval `escalateOverdue`/`markStale` nega ulanmaganini tekshir (git log/izohlar) —
ataylab kechiktirilgan bo'lishi mumkin. Ulashdan oldin xabar-yuborish yo'lini ham ko'r
(kimga ketadi, spam bo'lmaydimi).

Qoidalar (buzilmaydi):
- F13 tugagach TO'XTA.
- TDD: avval yiqiladigan test (soxta soat bilan — Date.now ni mock qil).
- Wiring qo'riqchisi MAJBURIY: metod haqiqatan chaqirilishini qulflovchi test.
- To'liq gate: money build → api typecheck → web typecheck → biome → api vitest → web vitest.
- git add faqat aniq fayllar; commitdan keyin git show --stat HEAD.
- Yakunda shu faylning §3 dagi «F13 hisoboti» shablonini Edit bilan to'ldir.

Hisobotda majburiy: (1) nega ulanmagan edi (topgan sababing), (2) o'zgargan fayllar,
(3) wiring qo'riqchisi qanday ishlaydi, (4) testlar, (5) gate, (6) commitlar.
```
</details>

---

### F12 — Phase-2 QA: real kassa kompyuterida

**Maqsad:** hamma fazalarni real muhitda tekshirish va yorliqni «Phase-1» dan
**«Phase-2 verified»** ga ko'tarish.

**Bu faza kod yozish emas — o'lchash.** Topilgan buglar issiq kontekstda darhol tuzatiladi.

**Ssenariylar:**
1. **O'rnatish:** admin exe'ni yangi kassa PC'siga o'rnatadi → parol bilan kirib qurilmani
   do'kon/kassa/tashkilotga bog'laydi → kassirlarga PIN beradi
2. **Kirish:** kassir exe'ni ochadi → PIN → `/sotuv`; «Chiqish» → PIN ekrani (email-login emas)
3. **Xavfsizlik:** 5 marta noto'g'ri PIN → qurilma 15 daqiqa qulf; kassir boshqa ERP sahifasiga
   URL bilan kira olmaydi; ikki qurilmada bir xil PIN ishlatilishi
4. **Savdo:** oddiy sotuv → chek chiqadi; qaytarish (to'liq va qisman)
5. **Dollar (F5–F6):** aralash to'lov; kurs muzlatilishi; kurssiz kun; smena yopilishida USD farq;
   USD qarz to'lovi
6. **Zakaz (F7–F8):** tasdiqlash → rezerv → to'lash → `paid`; **ikki kassir bir zakazni bir
   vaqtda to'lash** urinishi
7. **Mijoz (F9–F10):** telefon-qidiruv, qarz to'lovi, avans, avansdan yechish
8. **Smena:** ochish/yopish, kirim/chiqim, Z-hisobot chop (F11)
9. **Edge:** internet uzilishi ekrani va avto-tiklanish; smena yopilgan holda sotish urinishi;
   printer o'chirilgan holda chek; ikkinchi monitor uzilganda mijoz-ekran

**Qabul mezoni:** har ssenariy natijasi (o'tdi/o'tmadi + nima ko'rindi) hisobotda; topilgan
buglar tuzatilgan yoki alohida faza sifatida qayd etilgan; fazalar yorlig'i yangilangan.

<details>
<summary><b>📋 F12 SESSIYA PROMPTI</b></summary>

```
docs/superpowers/plans/2026-08-10-kassa-fazalar-ijro-reja.md faylini o'qi.
§0 (O'ZGARMAS QOIDALAR) va §2 → F12 bo'limini bajarasan. FAQAT F12.

Bu faza — QA. Kod yozish emas, O'LCHASH. Har ssenariyni real muhitda bajar (exe yoki brauzer +
real DB), natijani ayni ko'rganingdek yoz. «Ishlashi kerak» — javob emas.
Topilgan buglarni issiq kontekstda tuzat (kichik bo'lsa), katta bo'lsa alohida faza sifatida
hisobotga yoz va TO'XTA.

Qoidalar (buzilmaydi):
- Yangi funksiya QO'SHMA — faqat mavjudini tekshir va tuzat.
- Har tuzatishdan keyin to'liq gate.
- git add faqat aniq fayllar; commitdan keyin git show --stat HEAD.
- Yakunda shu faylning §3 dagi «F12 hisoboti» shablonini Edit bilan to'ldir va §1 dagi
  fazalar jadvalidagi yorliqlarni yangila.

Hisobotda majburiy: har 9 ssenariy bo'yicha natija (o'tdi/o'tmadi + ko'ringan xulq), topilgan
buglar ro'yxati (tuzatilgan / qoldirilgan), commitlar.
```
</details>

---

## 3. Hisobotlar

> Har faza agenti **faqat o'z blokini** to'ldiradi (`Edit` bilan, `Write` bilan emas).
> Boshqa faza hisobotiga tegilmaydi.

### Audit-to'lqini hisoboti (2026-08-11) — 21 bug tuzatildi

**Holat:** ✅ bajarilgan · **Yorliq:** Phase-1 (test-tasdiqlangan, **brauzer-smoke YO'Q**)

**Usul:** 5 parallel auditor (POS FE · retail-sale server · cashier-session/smena ·
qarz+chop etish · auth/kiosk), refute-default; har topilma fayl:qator dalili bilan.
Tuzatish 4 parallel agent + o'zim (auth), har biri TDD (RED ko'rilgan → fix → GREEN).

#### Tuzatilgan buglar

**Pul yo'qotish / xavfsizlik (eng jiddiy):**
1. 🔴 **Vozvrat zanjiri — cheksiz pul generatori.** `refund()` originalning o'zi vozvrat-mirror
   ekanini tekshirmasdi; mirror `posted` bo'lgani va payment-qatorlari yo'qligi uchun har
   safar butun summa naqd qaytarilardi ⇒ cheksiz takrorlash. `retail-sale.service.ts:1136-1145`
   + `retail-sale-refund-guards.test.ts`.
2. 🔴 **PIN-kirish akkauntga bog'lanmagan edi.** `findByPin` global qidirardi; unique cheklov
   esa `[accountId, posPinLookup]` — ya'ni ikki ijarachida bir xil PIN bo'lishi mumkin va
   pepper global. Natija: haqiqiy kassir to'g'ri PIN bilan kira olmasdi va 5 urinishdan keyin
   qurilma 15 daqiqaga qulflanardi (hujumchisiz DoS). `pos-pin.service.ts:109-134`.
3. 🔴 **`pos-login` argon2'ni umuman tekshirmasdi** — butun kirish tuzsiz HMAC'ga tayanardi
   (sxema shartnomasi buzilgan edi: «lookup topadi, hash tasdiqlaydi»). Endi ikki bosqich.
4. 🔴 **Qarz to'lovi qulfsiz** (`addCashPayment`): `remaining` tekshiruvi tranzaksiyadan
   tashqarida ⇒ ikki parallel to'lov bir qarzni ikki marta yopardi, kontragent balansi
   manfiyga ketardi. Endi `SELECT … FOR UPDATE` + qulfdan keyin qayta o'qish.
5. 🔴 **`retailShiftId` tekshiruvsiz yozilardi** — yopiq/begona smena id yuborilsa naqd pul
   joriy smena hisobiga tushmasdi (kamomad yashirish yo'li). Endi `{id, accountId, open}`.
6. 🔴 **Ruxsatsiz POS endpointlari:** `GET /debts/pos/summary/:id` va `pos/receipt/:batchId`
   da `@RequirePermission` yo'q edi — istalgan xodim istalgan mijozning qarz ro'yxatini
   o'qiy olardi. Endi `debtpayment.create` (oyna-ruxsati bilan bir xil).
7. 🟠 **Kassir o'z kamomad aktini o'zi «ko'rildi» qila olardi** — endi 403.
8. 🟠 **Smena a'zoligi tekshirilmasdi** — kassir begona smena id bilan ochib, vaqtdan-tashqari
   nazoratni chetlab o'tardi.
9. 🟠 **Manfiy ochilish naqdi** qabul qilinardi (`z.coerce.bigint()`) ⇒ kamomadni yashirish.
   Endi asosiy sxema naqshi (`^\d+$`).
10. 🟠 **`update()` POSTED chekni qayta yozardi** (tx ichida holat filtri yo'q edi, `post()`
    esa `version`ni oshirmaydi) — to'langan chek boshqa tovarlarni ko'rsatib qolardi.
11. 🟠 **`refund()` smenani atomik claim qilmasdi** — yopilgan smenaga vozvrat tushib, soxta
    kamomad akti chiqardi (`post()` dagi SALES-07 naqshi qo'llandi).
12. 🟡 **Tenant chegarasi:** `agentId` boshqa akkauntdan bo'lishi mumkin edi — endi tekshiriladi.

**Ma'lumot to'g'riligi:**
13. 🟡 **Naqd sotuvda mijoz tashlanardi** (`agentId` faqat qarzli to'lovda yozilardi) ⇒
    loyalty ishlamasdi, chekda mijoz izi qolmasdi.
14. 🟡 **Legacy z-report naqdni qaytimni ayirmay** ko'rsatardi (`Σcash` vs to'g'ri
    `Σcash − Σchange`) — bir smenada ikki hisobot har qaytim summasiga farq qilardi.
15. 🟢 **`zReport` `sessionId` Zod'siz** edi — noto'g'ri uuid P2023 → 500 (endi 400).
16. 🔴 **`isWithinShift` TZ formulasi xato** — UTC+5 hostda soatni +10 deb o'qirdi
    (14:00 → 19:00) ⇒ «vaqtdan tashqari» yolg'on talab, tunda esa teskarisi. Smena modulida
    umuman test yo'q edi — endi 10 test.
17. 🟢 Parallel smena ochishda xom P2002 → 500 (endi 409).

**POS FE (kassir ko'radigan):**
18. 🔴 **Narx maydoni bo'shatilsa ESKI narx ketardi** — ko'rinishda bo'sh, rasmiylashtirishda
    eski qiymat (K-3, MK32 da o'lchangan, tuzatilmagan edi). Endi 0.
19. 🔴 **«Tayyor» chek to'langach savat tozalanmasdi** ⇒ keyingi «Omborchiga yuborish»
    **dublikat sotuv** yaratardi (chegirma ham qolardi).
20. 🔴 **`5e3` kiritilsa butun POS yiqilardi** — smena yopish sanog'ida `Money.fromMajor`
    render tanasida try/catchsiz, `type="number"` esa `e` harfini o'tkazadi.
21. 🟡 USD farqi `$-10.00` (endi `-$10.00`) · uchala dialogda Radix `Description` warningi.

**Qo'shimcha (F0 fazasi shu yerda bajarildi):**
- 🔴 **Kiosk-kassir smena ocholmasdi:** allowlist `/smena/mine` deb yozgan, real yo'l
  `/admin/smenas/*` ⇒ 403. Endi ikki **aniq** yo'l (butun `/admin` emas) + negativ testlar.
- 🔴 `/sklad-keepers` allowlist'da yo'q edi ⇒ kiosk'da native chop etish jimgina
  popup'ga tushardi.
- 🔴 `pos-login` mutatsiya-qo'riqchi allowlist'ida yo'q edi — **oldingi kassa ishidan qolgan
  qizil qo'riqchi** (`mutation-guard-coverage.test.ts` yiqilib turardi); sabab bilan qo'shildi.

#### Gate natijalari

- `pnpm --filter @moysklad/money build` → OK
- `pnpm --filter @moysklad/api typecheck` → **0 xato**
- `pnpm --filter @moysklad/web typecheck` → **0 xato**
- `node scripts/check-lint.mjs` (loyiha lint gate'i) → **0 error**, 834 warning (siyosat bo'yicha ruxsat)
- API vitest (to'liq) → §3 oxiridagi yakuniy raqamga qara
- Web vitest (to'liq) → 3199 test; POS to'plami yolg'iz 85/85 yashil
- 🔴 **Diqqat (kelgusi sessiyalarga sabog'i):** API va web to'plamlarini **bir vaqtda**
  yugurtirganda 9 ta test 5000ms chegarasida timeout bo'ldi (argon2 va React render testlari).
  Yolg'iz yugurtirilganda hammasi yashil. **To'plamlarni ketma-ket yugurtiring.**

#### Yangi testlar (11 fayl)

`retail-sale-refund-guards.test.ts` · `retail-sale-update-state-guard.test.ts` ·
`retail-sale-post-agent.test.ts` · `retail-sale-zreport.test.ts` · `debt-pos-guard.test.ts` ·
`pos-debt-payment.retail-shift.test.ts` · `debt-cash-payment-lock.test.ts` ·
`smena.service.test.ts` (modul ilgari umuman testsiz edi) ·
`acknowledge-variance-guard.test.ts` · `sotuv/__tests__/audit-fixlar.test.tsx` ·
(+ `pos-pin.service.test.ts` kengaytirildi)

#### Yangilangan mavjud testlar (sabab bilan)

- `sales-screen-cart.test.tsx` ×2 — eski **buggy** xulqni (bo'sh maydon → eski narx) K-3
  kuzatuvi sifatida qulflagan edi; endi 0-xulqni qulflaydi.
- `sales-screen-shift.test.tsx` — `$-10.00` → `-$10.00`.
- `shift-cash-faza-q1.test.ts` — `SESSION` fixture'i uuid shakliga o'tdi (yangi Zod
  validatsiyasi tufayli); **assertion'lar tegilmagan** (netSum matematikasi o'sha-o'sha).
- `retail-sale-refund-debt/pricing.test.ts`, `retail-sale-post-guards.test.ts`,
  `retail-sale-tenders-wiring.test.ts`, `debt-cash-ledger.service.test.ts` — faqat mok-yuzasi
  (yangi `updateMany`/`findFirst`/`$queryRaw` chaqiruvlari uchun); assertion'lar o'zgarmagan.

#### Qoldirilgan (fazalarga biriktirildi)

§0.9 jadvaliga qara — chek to'lov qatlami (F5), ikki qarz daftari (F9), kasr-miqdor crash
(F8), valyuta filtri (F6), o'lik eskalatsiya avtomatikasi (F13).

---

### F0 hisoboti

- **Holat:** ✅ **BAJARILDI** — audit-to'lqinida (yuqoriga qara). Qayta bajarilmaydi.
- **Sana:**
- **O'zgargan fayllar:**
- **Qilingan ish:**
- **Testlar (raqam bilan):**
- **Gate natijasi:**
- **Commit(lar):**
- **Kelgusi fazalarga qoldirilgan:**
- **Yorliq:**

### F1 hisoboti

- **Holat:** ✅ kod tugadi (Task 10–14 · Task 15 gate) · ⬜ brauzer-o'lchov QOLDI
- **Sana:** 2026-08-11 · worktree `D:/projects/sherset-kassa-f1`, branch `kassa-f1` (baza `6ba54150`)

- **O'zgargan fayllar:**
  - *Yangi:* `apps/web/src/lib/pos-device.ts` · `apps/web/src/lib/__tests__/pos-device.test.ts` ·
    `apps/web/src/lib/__tests__/auth-store-pos-login.test.ts` ·
    `apps/web/src/components/pos/pin-keypad.tsx` ·
    `apps/web/src/components/pos/__tests__/pin-keypad.test.tsx` ·
    `apps/web/src/app/kassa-kirish/page.tsx` · `apps/web/src/app/kassa-kirish/juftlash/page.tsx` ·
    `apps/web/src/__tests__/kassa-kirish-wiring.test.ts` ·
    `apps/web/src/__tests__/kiosk-logout-redirect.test.ts`
  - *Tahrirlangan:* `apps/web/src/lib/auth-store.ts` (`posLogin`) ·
    `apps/web/src/app/(app)/layout.tsx` (chiqish yo'nalishi + kiosk «Chiqish» tugmasi) ·
    `apps/web/src/components/pos/pos-pin-lock.tsx` (lockout yo'nalishi) ·
    `apps/web/src/__tests__/kiosk-shell.test.ts` (1 ta assertion — pastda izohlangan) ·
    `apps/web/src/messages/{ru,uz}.json` (`kassaLogin.*`, 16 kalit)
  - 🔴 `apps/api` va `packages/` ga UMUMAN tegilmadi (`git diff 6ba54150..HEAD -- apps/api packages/` — bo'sh).

- **Qilingan ish (task-task):**
  - **Task 10 ✅** — `pos-device.ts`: `readPosDevice/writePosDevice/clearPosDevice`. Ikki saqlash
    joyi: Electron ko'prigi (`window.electronAPI`, `isSherset` bayrog'i bilan tanilади) yoki
    `localStorage` (dev/QA). To'liqmas/buzuq yozuv → `null` (yarim juftlangan qurilma kirishga
    urinmasin). Rejadan tashqari 1 test qo'shildi: ko'prik bor bo'lsa YOZUV ham o'shanga ketadi.
  - **Task 11 ✅** — `auth-store.posLogin(creds, pin)`: `POST /auth/pos-login`, `credentials:'include'`
    (cookie'lar parol-login bilan bir xil). Tana faqat `deviceId/deviceSecret/pin` — serverdagi
    `PosLoginSchema` (`auth.schema.ts:130-134`) qurilma NOMINI kutmaydi, shuning uchun test buni
    alohida qulflaydi.
  - **Task 12 ✅** — `PinKeypad` (sof prezentatsion, tarmoqqa chiqmaydi): 0–9 + Tozalash +
    O'chirish, sensorli ekran uchun katta tugmalar, kiritilgan raqamlar OCHIQ ko'rsatilmaydi
    (nuqta-indikator — kassa monitorini mijoz ham ko'radi), `<4` raqamda «Kirish» o'chirilgan.
    `kassaLogin.*` kalitlari ru+uz.
  - **Task 13 ✅** — `/kassa-kirish` (PIN ekrani, «juftlanmagan» shoxi bilan) va
    `/kassa-kirish/juftlash` (admin login → do'kon/kassa/tashkilot tanlash → `POST
    /auth/pos-device/pair` → kalitni darhol saqlash). Yo'llar o'lchandi:
    `/stores`, `/cash-desks`, `/organizations` — `reference.controller.ts:62,85,113`
    (`@Controller()`, ya'ni prefikssiz), javob `{ items, total }`.
    🔴 Holat-shoxlari tartibi: `if (!ready) return null` «juftlanmagan» shoxidan OLDIN — aks holda
    juftlangan kassada birinchi kadrda «juftlanmagan» ekrani chaqnaydi.
  - **Task 14 ✅** — chiqish yo'nalishi. **Auditda topildi: kiosk qobig'ida CHIQISH TUGMASI UMUMAN
    YO'Q edi** (`layout.tsx` kiosk shoxi faqat `{children}` + `PosPinLock` render qilardi;
    `/sotuv/page.tsx` da `logout` — 0 hit). Ya'ni qabul mezoni 5-qadamini bajaradigan tugma
    mavjud emasdi. Uchala chiqish yo'li shartli qilindi:
    1. yangi kiosk «Chiqish» tugmasi (`layout.tsx`, `data-test-id="kiosk-logout"`);
    2. PIN-qulfda 5 xatodan keyingi majburiy chiqish (`pos-pin-lock.tsx`) — ilgari SO'ZSIZ
       `/login` ga tashlardi, kassir esa parolni bilmaydi ⇒ kassa jimgina o'lik qolardi;
    3. sessiya o'lgach `layout.tsx` ning avto-yo'naltirishi.
    Qoida: `readPosDevice() ? '/kassa-kirish' : '/login'` — juftlanmagan brauzerda PIN ekrani
    foydasiz, `/login?redirect=` zaxira yo'li saqlanib qoldi.
    ⚠️ `kiosk-shell.test.ts` dagi `expect(lock).toContain("window.location.href = '/login'")`
    assertioni ATAYLAB o'zgartirildi (so'zsiz `/login` endi xato xulq) — o'rniga shartli
    ifodaning o'zi qulflandi. Fayl `Edit` bilan, bitta assertion doirasida tahrirlandi.
  - **Task 15 ✅ (gate) / ⬜ (brauzer)** — pastda.
  - **Qo'shimcha tuzatish:** juftlash ekranidagi xom `<select>` DS `NativeSelect` ga ko'chirildi.
    Buni **to'liq web suite tutdi** (`raw-element-conventions.test.ts`, UI Convention 8) —
    fayl-darajasidagi typecheck/biome uni KO'RMAGAN edi. Sabog'i: yo'l-cheklangan gate yetarli emas.

- **Testlar (raqam bilan):**
  - Yangi yozilgan: **41 test** — `pos-device` 7 · `auth-store-pos-login` 5 · `pin-keypad` 10 ·
    `kassa-kirish-wiring` 12 · `kiosk-logout-redirect` 7. Hammasi TDD: har biri avval
    yiqildi (modul/komponent yo'q · `posLogin is not a function` · `ENOENT page.tsx` ·
    layout'da `/kassa-kirish` yo'q), keyin yashil.
  - Tahrirlangan `kiosk-shell.test.ts` — 12 test, yashil (regress yo'q).

- **Brauzer o'lchovi (5 qadam):** 🔴 **BAJARILMADI — parallel to'lqin, port band; merge'dan
  keyingi QA sessiyasiga qoldirildi.** (Ijro rejasi §1.2.4: `pnpm dev` 3100/4000 bir vaqtda faqat
  bitta sessiyada, hozir 3 faza parallel ketyapti.) O'lchanishi kerak bo'lgan qadamlar:
  1. `http://localhost:3100/kassa-kirish` → «Bu qurilma juftlanmagan» ekrani ko'rinadi;
  2. «Qurilmani juftlash» → admin bilan kirish → do'kon/kassa/tashkilot tanlanadi → `/kassa-kirish`
     ga qaytadi va qurilma nomi ko'rinadi;
  3. To'g'ri PIN → `/sotuv` ochiladi;
  4. Noto'g'ri PIN → server xabari ko'rinadi va PIN maydoni tozalanadi (nuqtalar bo'shaydi);
  5. `/sotuv` da «Chiqish» (o'ng-past burchak, `kiosk-logout`) → `/kassa-kirish` (`/login` EMAS).
  Qo'shimcha tavsiya: 5 marta noto'g'ri PIN bilan PIN-QULF lockout yo'lini ham o'lchash
  (u ham `/kassa-kirish` ga qaytishi kerak) va juftlanmagan brauzerda `/login` zaxirasi.

- **Gate natijasi** (hammasi yugurtirildi, qisqartirilmadi):
  - `@moysklad/money build` — OK · `api typecheck` — 0 xato · `web typecheck` — 0 xato
  - `biome check` (tegilgan 15 fayl) — **0 diagnostika**.
    ℹ️ `apps/web/src/components/pos` butun papkasida 20 warning bor, lekin hammasi
    `rasmilashtirish-modal.tsx` dan (F5 ning fayli, men tegmadim — `git log --name-only` tasdiqladi).
  - `web test` — **227 fayl / 3221 o'tdi · 26 skip · 0 yiqildi** (exit 0).
  - `api test` — 553 fayl / 7771 o'tdi · **11 yiqildi**. 🔴 **Hammasi `Test timed out in 5000ms`
    (assertion emas) va hammasi oldindan qizil** — baseline `6ba54150` (orkestrator o'lchagan).
    Dalil: (a) bu branchda `apps/api` ga bitta ham o'zgarish yo'q; (b) izolyatsiyada
    `pos-device.service` (6), `pos-pin.service` (3), `publication.service` (1) — yashil, ya'ni
    parallel yuk ostidagi argon2 timeout'i; (c) `mutation-guard-coverage` (1) yolg'iz yugurtirilganda
    ham ~5060 ms da timeout beradi — chegaraga yopishib qolgan test, baseline ro'yxatida bor.
    Baseline qiyosi: api 10–11 qizil (timeout), web 1 qizil (timeout, `sales-screen-shift`) — mening
    yakuniy web yugurishimda u ham yashil chiqdi (mashina bo'shaganda).
  - `pnpm i18n:gate` — 9 test yashil (ru+uz parity, hardcode yo'q).

- **Commit(lar):** `e0ee620a` (Task 10) · `996639db` (Task 11) · `700c0585` (Task 12) ·
  `e2e10c6d` (Task 13) · `3cd7c18d` (Task 14) · `2502e489` (NativeSelect tuzatishi) ·
  + shu hisobot commit'i.
  Har commitdan keyin `git show --stat HEAD` tekshirildi; begona fayl tushmadi
  (`docs/progress.json` — pre-commit hook'ining o'zi qo'shadi, normal).

- **Kelgusi fazalarga qoldirilgan:**
  1. 🔴 **F2 uchun shartnoma kengaydi:** `pos-device.ts` Electron ko'prigidan `isSherset`,
     `getDevice()`, `setDevice(creds)`, `clearDevice()` ni kutadi. F2 ning
     `electron-bridge-contract.test.ts` metod nomlarini FAQAT `print-agent.ts` dan emas,
     `pos-device.ts` dan HAM manbadan o'qisin — aks holda `electronAPI` optional bo'lgani uchun
     typecheck yashil qolib, prod kassada qurilma kaliti jimgina `localStorage` ga tushadi.
  2. **Qurilmani bekor qilish (unpair) UI yo'q:** `clearPosDevice()` yozildi va test qilindi,
     lekin uni HECH KIM chaqirmaydi. Qurilma almashtirilganda/o'g'irlanganda kassirning yo'li yo'q.
     Tabiiy joyi — F2 (Electron sozlamalar oynasi) yoki F4 (operator yo'riqnomasi + admin ekrani).
  3. **Layout avto-yo'naltirishi QURILMA bo'yicha ishlaydi, foydalanuvchi bo'yicha emas** — chunki
     u nuqtada `auth.user` allaqachon `null`. Ya'ni juftlangan brauzerda ADMIN ham sessiyasi
     tugagach `/kassa-kirish` ga tushadi. Real kassa PC'da to'g'ri, dev brauzerda kutilmagan
     bo'lishi mumkin; yumshatish — `/kassa-kirish` dagi «Administrator kirishi» havolasi.
     F12 QA'da kuzatilsin.
  4. **Kiosk «Chiqish» tugmasining joyi vaqtinchalik** — `layout.tsx` da fiksirlangan o'ng-past
     burchak. F5/F8 `/sotuv` ga o'z chrome'ini qo'shganda uni POS sarlavhasiga ko'chirish
     mantiqiyroq bo'lishi mumkin (tugmaning o'zi va `data-test-id="kiosk-logout"` saqlansin).
  5. **`POS_PIN_PEPPER` `.env` ga qo'shilishi** hamon prod-qadam sifatida ochiq (K1–K4 rejasining
     Task 15 Step 6 bandi). `NEXT.md` ga hand-off yozuvi bu sessiyada YOZILMADI — parallel
     to'lqinda `NEXT.md` umumiy fayl, merge sessiyasida yozilsin.
  6. **Juftlash uchun `employee.update` ruxsati kerak** (`auth.controller.ts:262-263`) — kiosk
     kassiri o'zi juftlay olmaydi, bu ATAYLAB. Operator yo'riqnomasida (F4) shu aytilsin.

- **Yorliq:** **«Phase-1: strukturaviy, runtime-tasdiqlanmagan»** — brauzer-smoke YO'Q,
  real kassa PC va printer — F12.

### F2 hisoboti

- **Holat:** ✅ bajarildi (kod + qo'riqchi darajasida; Electron ishga TUSHIRILMAGAN)
- **Sana:** 2026-08-11 · worktree `D:/projects/sherset-kassa-f2`, branch `kassa-f2`
- **O'zgargan fayllar:**
  - yangi `desktop/main.js` — kiosk oyna, klaviatura qulflari, IPC, offline ekran, tashqi havolalar
  - yangi `desktop/preload.js` — `contextBridge` → `window.electronAPI` (+ qobiq sahifalari uchun `window.shersetShell`)
  - yangi `desktop/device-store.js` — `safeStorage` (DPAPI) qurilma kaliti + server manzili (`kassa-config.json`)
  - yangi `desktop/setup.html` (birinchi ishga tushish: server manzili) · `desktop/offline.html` (aloqa yo'q ekrani)
  - yangi `desktop/package.json` (`@moysklad/desktop`, electron + electron-builder + electron-updater) · `desktop/README.md`
  - yangi `apps/web/src/__tests__/electron-bridge-contract.test.ts` (26 test)
  - `pnpm-workspace.yaml` — `desktop` workspace paketi sifatida qo'shildi
- **Qilingan ish:**
  - Yupqa kiosk o'ram (spec §3.1): `kiosk:true`, `frame:false`, menyu yo'q, `requestSingleInstanceLock`,
    prod'da DevTools o'chiq (`devTools: isDev` + `F12`/`Ctrl+Shift+I` ushlanadi), `Ctrl+W` va `Alt+F4`
    ushlanadi — `Alt+F4` uchun ishonchli to'siq `win.on('close')` da (OS darajasidagi yopishni
    `before-input-event` doim ko'rmaydi). Operator chiqishi: `Ctrl+Alt+Shift+Q` (README'da).
  - Tashqi havolalar: `setWindowOpenHandler` → `deny` + `shell.openExternal`; `will-navigate` faqat
    server origini va `file://` ga ruxsat beradi.
  - Aloqa uzilishi (spec §3.1): `did-fail-load` (mainFrame, `ERR_ABORTED` bundan mustasno) → `offline.html`;
    fonda har 5 s `GET <server>/api/v1/health` (`apps/api/src/health.controller.ts` + `main.ts:72`
    `setGlobalPrefix('api/v1')`), javob berishi bilan ilova o'zi qayta yuklanadi.
  - Server manzili KODGA QOTIRILMAGAN (spec §3.2): konfiguratsiya → `SHERSET_SERVER_URL` (build/env
    default) → `setup.html`. Saqlashdan oldin `/health` bilan tekshiriladi (xato manzil kassirni bo'sh
    ekranga tashlamasin).
  - DPAPI: `safeStorage` mavjud bo'lmasa qurilma kaliti **saqlanmaydi** va `dialog.showErrorBox` chiqadi —
    ochiq matnda jimgina saqlash TAQIQ (web `setDevice` natijasini ko'rmaydi, shuning uchun xatoni qobiq ko'rsatadi).
  - Chop etish/mijoz-ekran IPC ishlovchilari **ochiq xato** qaytaradi («F3 da ulanadi»), jim `ok` emas —
    sabab: `print-agent.ts:105-118` ko'prik mavjud bo'lganda HTTP-agentga QAYTMAYDI.
- **Shartnoma-testi nimani qo'riqlaydi:**
  - Metod nomlari **ikki manbadan, manba-matndan** o'qiladi (qo'lda ro'yxat yo'q):
    `print-agent.ts` → `interface ElectronBridge` (`isSherset`, `version`, `listPrinters`, `printSheet`,
    `pushCart`, `toggleCustomerDisplay`, `customerDisplayStatus`) **VA** `pos-device.ts` → `interface ShellBridge`
    (`getDevice`, `setDevice`, `clearDevice`). 🔴 Ikkinchisi F1 agentining ogohlantirishi bo'yicha qo'shildi:
    metod tushib qolsa `pos-device.ts` jimgina `localStorage` ga tushadi — DPAPI umuman ishlamaydi va hech
    narsa shikoyat qilmaydi. Spec'dagi `pair(...)` amalda `setDevice(creds)` (juftlashning o'zi web'da,
    `kassa-kirish/juftlash/page.tsx:86`) — shuning uchun shartnomaga MANBADAGI nom kiritildi.
  - Har nom `preload.js` da `contextBridge.exposeInMainWorld('electronAPI', {…})` obyektining **tashqi**
    kalitlaridan biri ekani tekshiriladi (ichma-ich payload maydonlari sanalmaydi).
  - `getDevice`/`setDevice`/`clearDevice` **sinxron** (`ipcRenderer.sendSync`, `async` emas) bo'lishi shart —
    `pos-device.ts:44-47` natijani darhol `isComplete` bilan tekshiradi, Promise unga «juftlanmagan» bo'lib
    ko'rinadi (abadiy juftlash sikli).
  - `main.js` qattiqligi: `preload.js` oynaga ULANGAN, `contextIsolation:true`, `nodeIntegration:true` YO'Q,
    `kiosk:true`, `frame:false`, `requestSingleInstanceLock`, `setApplicationMenu(null)`, va manbada
    localhost'dan boshqa `http(s)://` **qotirilgan domen yo'q** (spec §3.2 qo'riqchisi).
  - **Vacuity qo'riqchisi:** parser buzilsa (satr/izoh skaneri) manba-a'zolar bo'sh chiqib testlar «o'tib»
    ketardi — shuning uchun ikki test langar nomlar topilganini alohida tasdiqlaydi.
  - **Qanday yiqilardi (o'lchangan):** (a) `desktop/` yo'q holatida 26 testdan 23 tasi qizil edi;
    (b) mutatsiya bilan tekshirildi — `preload.js` dan `getDevice` olib tashlanib, `setDevice`
    `invoke` ga o'tkazilganda 4 test yiqildi (ya'ni qo'riqchi vakuum emas), keyin fayl tiklandi.
- **Qo'lda o'lchash natijasi:** 🔴 **BAJARILMADI — ataylab.** Bu to'lqinda uch agent parallel ishlagan
  (`pnpm dev` portlari 3100/4000 bitta sessiyaga tegishli), `pnpm install` esa butun monorepo uchun
  taqiqlangan edi (electron ~100 MB yuklab olinadi). Ya'ni kiosk oyna ochilgani, PIN bilan `/sotuv` ga
  kirilgani va `Alt+F4` ishlamasligi **o'lchanmagan**. O'lchash qadamlari (F3 yoki merge'dan keyingi QA):
  1. `pnpm install --filter @moysklad/desktop`
  2. `pnpm dev` (web 3100, api 4000) — `:4000` qaysi worktree'dan ekanini tekshir
  3. `SHERSET_SERVER_URL=http://localhost:3100 pnpm --filter @moysklad/desktop dev` → kiosk oyna ochiladi va `/kassa-kirish` ko'rinadi
  4. Juftlash → admin login → do'kon/kassa/tashkilot → `%APPDATA%/…/kassa-config.json` da `device` **shifrlangan** (base64, ochiq matn emas) ekanini ko'z bilan tasdiqla
  5. PIN → `/sotuv` ochiladi (qurilma kaliti DPAPI'dan o'qildi degani)
  6. `Alt+F4`, `Ctrl+W`, `F12` — oyna yopilmaydi/DevTools ochilmaydi; `Ctrl+Alt+Shift+Q` — yopiladi
  7. `pnpm dev` ni to'xtat → offline ekrani chiqadi; qayta yoq → kassa **o'zi** qaytadi
  8. Manzilsiz ishga tushir (`SHERSET_SERVER_URL` yo'q, konfiguratsiya o'chirilgan) → `setup.html`; noto'g'ri manzil → «Server javob bermadi»
- **Gate natijasi (ketma-ket yugurtirildi):** `money build` OK · `api typecheck` 0 · `web typecheck` 0 ·
  `biome check desktop apps/web/src/__tests__/electron-bridge-contract.test.ts pnpm-workspace.yaml` 0 ·
  `api test` 551 fayl / 7784 test yashil, **5 yiqilish = yuk timeout'i** (`pos-device.service`,
  `pos-pin.service`, `publication.service` — hammasi 5000ms argon2), **yolg'iz yugurtirilganda 3 fayl /
  45 test yashil** · `web test` 239 fayl / 3338 test yashil (0 yiqilish; +26 shu fazadan) · `i18n:gate` OK.
- **Commit(lar):** `e45770a` — `feat(kassa): electron kiosk o'rami (desktop/) + ko'prik shartnoma qo'riqchisi`
  (+ shu hisobot commit'i). ⚠️ `docs/progress.json` commit'ga lint-staged orqali qo'shildi (hook qayta
  generatsiya qilgan: `branch: kassa-f2`) — merge'da `climart-adoption` versiyasi olinsin.
- **Kelgusi fazalarga qoldirilgan:**
  - **F3 (chop etish/mijoz-ekran):** `print:list` → `[]`, `print:sheet`/`cfd:toggle` → ochiq xato,
    `cfd:push` → no-op. 🔴 `print-agent.ts:105-118` ko'prik mavjud bo'lganda HTTP-agentga **qaytmaydi**,
    shuning uchun F3 gacha bu qobiqda chop etish umuman yo'q (jim emas, xato bilan).
  - **F3:** mijoz-ekran oynasi uchun **ikkinchi ko'prik** kerak — `apps/web/src/app/customer-display/page.tsx:40-47`
    `window.customerDisplay.onCart(cb)` ni kutadi (`preload-customer.js`). Shartnoma-testi hozir buni
    QAMRAMAYDI — F3 da o'sha testga qo'shilsin (aks holda xuddi shu «jim eskirish» klassi qaytadi).
  - **F4:** `build/icon.ico` yo'q (binar fayl — bu sessiyada yaratilmadi), `electron-builder` NSIS
    konfiguratsiyasi, `electron-updater` simlari, `latest.yml` uchun nginx `location /downloads/desktop/`.
    `desktop/package.json` versiyasi ataylab `1.1.0-dev` — chop etish ulangach F3/F4 ko'taradi.
  - **F1 dan kelgan qarz (yopilmadi):** `clearPosDevice()` ni hech kim chaqirmaydi — POS'da «qurilmani
    bekor qilish» tugmasi YO'Q. F2 da UI qo'shilmadi (bu POS sahifasi ishi, F2 fayl chegarasidan tashqarida);
    vaqtinchalik yo'l README'da (`kassa-config.json` dagi `device` maydonini o'chirish).
  - **O'lchanmagan taxminlar (kod bilan tasdiqlanmagan, faqat hujjat bilan):** `sandbox: true` preload'da
    `ipcRenderer.sendSync` ishlashi; `did-fail-load` xato kodlari; `dialog.showErrorBox` kiosk oynasi ustida
    ko'rinishi. Birinchi qo'lda o'lchashda shular alohida tekshirilsin.
  - `pnpm install` **yugurtirilmagan** — `desktop/` bog'liqliklari (electron) hali yuklab olinmagan,
    `pnpm-lock.yaml` yangilanmagan. Merge'dan keyin bir marta `pnpm install` kerak.
- **Yorliq:** **Phase-1 — strukturaviy, runtime-tasdiqlanmagan.** Electron o'rami hech qachon ishga
  tushirilmagan; real kassa PC'da (va umuman brauzerdan tashqarida) sinalmagan.

### F3 hisoboti

- **Holat:** ⬜ bajarilmagan
- **Sana:**
- **O'zgargan fayllar:**
- **Qilingan ish:**
- **Chop etish qanday o'lchandi:**
- **Mijoz-ekran / pul yashigi holati:**
- **Gate natijasi:**
- **Commit(lar):**
- **Kelgusi fazalarga qoldirilgan:**
- **Yorliq:**

### F4 hisoboti

- **Holat:** ✅ bajarildi (worktree `D:/projects/sherset-kassa-f4`, branch `kassa-f4`, baza `b5e10c85`, merge kutilmoqda)
- **Sana:** 2026-08-11

- **O'zgargan fayllar (10):**
  - *desktop (yangi):* `desktop/updater.js` · `desktop/check-build-assets.js`
  - *desktop (tahrir):* `desktop/package.json` (`build` bloki + `dist` scripti) ·
    `desktop/main.js` (🔴 3 qator — F3 bilan konflikt kutiladi) · `desktop/README.md` (QO'SHILDI, mavjud bo'limlar buzilmadi)
  - *qo'riqchi test (yangi):* `apps/web/src/__tests__/kassa-installer-config.test.ts` (30 test)
  - *deploy:* `deploy/nginx-sherset.biznesjon.uz.conf` · `deploy/nginx-climart.biznesjon.uz.conf` ·
    `deploy/nginx-climartgroup.uz.conf` · `deploy/DEPLOY-sherset.md` (yangi §7)
  - *avtomatik:* `docs/progress.json` (pre-commit hook o'zi qo'shadi — `pnpm -s progress`)

- **Qilingan ish:**
  1. **NSIS konfiguratsiyasi** — `desktop/package.json` → `build`: `appId: uz.sherset.kassa`,
     `productName: Sherset Kassa`, `win.target: nsis (x64)`,
     `artifactName: Sherset-Kassa-Setup-${version}.exe`, `nsis.oneClick: false`,
     `nsis.perMachine: true`, `allowToChangeInstallationDirectory`, `installerLanguages: [ru_RU]`.
     **Qaror: alohida `electron-builder.yml` EMAS, `package.json` ichidagi `build` bloki.**
     Sabab (o'lchangan): monorepoda YAML parseri YO'Q — `yaml` va `js-yaml` na ildizdan,
     na `apps/web`, na `apps/api` dan `require.resolve` bo'lmaydi. YAML variantida
     «konfiguratsiya parse bo'ladi» qo'riqchisi qo'lda yozilgan soxta parserga
     suyanardi; `build` bloki esa `JSON.parse` bilan haqiqatan tekshiriladi.
  2. **Imzo — 1-versiya IMZOSIZ** (spec §8.2, ongli qaror). Sertifikat kalitlari repo'ga
     yozilmadi; qo'riqchi test `certificateFile`/`certificatePassword`/`certificateSubjectName`
     `package.json` da YO'Qligini tekshiradi (mutatsiya bilan tasdiqlandi).
  3. **Avtoyangilanish** — `desktop/updater.js`, `electron-updater` `generic` provider.
     🔴 Manzil kodga qotirilmagan (spec §3.2): `setFeedURL` qurilma **juftlangan serverdan**
     yasaydi — `<server>` + `/downloads/desktop/`. Ishga tushganda + **har 4 soatda**
     tekshiradi, fonda yuklaydi. Birinchi ishga tushishda server manzili hali yo'q bo'lsa
     `updater.js` o'zi 60 soniyada qayta uradi (aks holda avtoyangilanish faqat keyingi
     ishga tushishda tirilardi). Har qanday nosozlik — **jim** (kassirga dialog yo'q).
  4. **O'rnatish vaqti (spec §8.3)** — `autoInstallOnAppQuit = false` (Electron o'zi hech
     qachon o'rnatmaydi), `update-downloaded` faqat bayroq qo'yadi; o'rnatish **faqat**
     `main.js` → `quitShell()` → `updater.installOnQuit()` yo'lida
     (`quitAndInstall(isSilent=true, isForceRunAfter=false)`).
  5. **`build/icon.ico` — binar, repo'da YO'Q.** Konfiguratsiyada yo'l ko'rsatilgan;
     `check-build-assets.js` yig'ishni birinchi qadamda ANIQ xabar bilan to'xtatadi.
  6. **nginx + deploy hujjati** — pastda.

- **Qo'yilgan qo'riqchi testlar + mutatsiya natijasi:**
  `apps/web/src/__tests__/kassa-installer-config.test.ts` — **30 test**, TDD (avval qizil:
  21 yiqilgan / 8 o'tgan, keyin yashil). **18 mutatsiya sinaldi, HAMMASI qizardi:**
  nginx yo'li · `autoInstallOnAppQuit=true` · 4 soat→1 soat · `update-downloaded` ichida
  o'rnatish · versiya 1.2.0 · `perMachine=false` · artifactName qotirildi · `quitShell`
  o'rnatishni chaqirmaydi · `dist` qo'riqchisiz · README dan `latest.yml` olib tashlandi ·
  README dan kanal yo'li olib tashlandi · DEPLOY doc yo'li · `autoDownload=false` ·
  `UPDATE_PATH` · `publish.url` · `app.isPackaged` qo'riqchisi · sertifikat paroli
  qo'shildi · `win.icon` olib tashlandi.
  🔴 **Bitta haqiqiy vacuity TOPILDI va tuzatildi:** `autoInstallOnAppQuit = false`
  matni fayl boshidagi JSDoc'da ham aynan shunday yozilgan edi — kodni `true` ga
  o'zgartirganda test YASHIL qolardi (regex izohga tushardi). Yechim: xulq testlari
  endi `stripComments()` dan o'tgan **kod** ustida ishlaydi + `= true` YO'Qligi ham
  tekshiriladi. (Bug-klass: «qo'riqchi o'z hujjatini o'qib turibdi».)

- **Installer yig'ildimi (buyruq + natija):**
  🔴 **YO'Q — `.exe` HECH QACHON yig'ilmagan.** `desktop/` monorepo workspace'ida emas va
  `electron` + `electron-builder` (~200 MB) ataylab o'rnatilmadi (foydalanuvchi rozilik
  bermagan). Ya'ni «`.exe` yig'iladi» — **tasdiqlanmagan da'vo**.
  Yig'ish qadamlari (operator/dasturchi qo'lda bajaradi):
  1. `desktop/build/icon.ico` ni qo'sh (ko'p o'lchamli `.ico`, kamida 256×256).
  2. `cd desktop && pnpm install` (bir marta).
  3. `pnpm run dist` (= `node check-build-assets.js && electron-builder --win nsis`).
  4. Natija: `desktop/dist/Sherset-Kassa-Setup-1.1.0-dev.exe` + `desktop/dist/latest.yml`.
     Relizdan oldin `package.json` → `version` ni `-dev` siz qiymatga ko'tarish.
  **Ikonka yo'qligida nima bo'ladi (o'lchangan):** `node desktop/check-build-assets.js`
  → `exit 1` + «Yig`ish TO`XTATILDI — kerakli fayllar yo`q: desktop/build/icon.ico».
  electron-builder ning O'Z xulqi (xato beradimi yoki default Electron ikonkasi bilan
  jim davom etadimi) — **o'lchanmagan**; qo'riqchi aynan shu noaniqlikni yopish uchun
  qo'yildi.

- **`latest.yml` / kanal yo'li qaysi joylarda yozilgan (drift-lock, 5 joy):**
  1. `desktop/updater.js` → `const UPDATE_PATH = '/downloads/desktop/'` (runtime feed)
  2. `desktop/package.json` → `build.publish[0].url` (build vaqtidagi default)
  3. `deploy/nginx-*.conf` ×3 → `location /downloads/desktop/`
  4. `desktop/README.md` → operator yo'riqnomasi (`latest.yml` + kanal URL)
  5. `deploy/DEPLOY-sherset.md` §7 → deploy qadamlari
  Beshalasi ham qo'riqchi testda **bitta konstantaga** bog'langan.

- **Deploy uchun kerakli qadamlar (🔴 VPS'ga QO'LLANMAGAN — kutmoqda):**
  1. `sudo mkdir -p /var/www/kassa-downloads/desktop` (git checkout'idan TASHQARIDA —
     `git pull`/`deploy-smart.sh` tegmaydi).
  2. Yangilangan nginx конфini ko'chir + `sudo nginx -t && sudo systemctl reload nginx`.
  3. Artefaktlarni yukla — **avval `.exe`, OXIRIDA `latest.yml`** (manifest — trigger;
     u birinchi tushsa har bir kassa hali yo'q `.exe` ni so'raydi).
  4. `curl -I https://<server>/downloads/desktop/latest.yml` → 200 va `.exe` → 200.
  5. `latest.yml` ni QO'LDA tahrirlama (ichida `.exe` ning SHA-512 si; mos kelmasa har
     bir kassa yangilanishni **jim** rad etadi). Eski `.exe` ni kamida bir reliz saqla.
  Tafsilot: `deploy/DEPLOY-sherset.md` → «7. Kassa (Electron) installer + update channel».

- **F3 bilan kutilayotgan konflikt:** `desktop/main.js` da **3 qator** (F3 ayni paytda shu
  faylda `print:*`/`cfd:*` ishlovchilarini yozyapti): (a) `require('./updater')` — import
  bloki; (b) `app.whenReady()` ichida `updater.start(serverBase);`;
  (c) `quitShell()` ichida `if (updater.installOnQuit()) return;`. Uchalasi ham F3 ning
  hududidan (`registerIpc` dagi `print:*`/`cfd:*`, `preload*.js`) **tashqarida** —
  merge'da matn-konflikt bo'lsa **ikkala tomonni ham saqlash** kerak, birini tanlash EMAS.
  `desktop/package.json` da faqat `build` bloki va `scripts.dist` qo'shildi;
  `main`/`dependencies` TEGILMADI.

- **Gate natijasi (to'liq, qisqartirilmagan):**
  - `pnpm --filter @moysklad/money build` ✅
  - `pnpm --filter @moysklad/api typecheck` ✅ 0 xato
  - `pnpm --filter @moysklad/web typecheck` ✅ 0 xato
  - `pnpm biome check <tegilgan 5 yo'l>` ✅ 0 xato (dastlab 5 `useOptionalChain` +
    1 keraksiz suppression — tuzatildi)
  - `pnpm --filter @moysklad/api test` — 7840 ✅ / **11 timeout** (`pos-device`,
    `pos-pin`, `publication`, `mutation-guard-coverage`). Har biri **YOLG'IZ qayta
    yugurtirildi → 4/4 YASHIL** ⇒ yuk artefakti (5 agent parallel, 56 node jarayoni),
    defekt EMAS. `testTimeout` oshirilmadi.
  - `pnpm --filter @moysklad/web test` — 3411 ✅ / **1 timeout**
    (`menejer/_components/comment-template-settings.test.tsx`) → yolg'iz **YASHIL**
    (5044ms, chegara ustida) ⇒ yuk artefakti. Bu fayl F4 tegmagan hududda.
  - `pnpm i18n:gate` ✅ (UI matni tegilmadi)
  - Qo'shimcha: `node --check` desktop `.js` fayllari ✅, `JSON.parse(package.json)` ✅

- **Commit(lar):**
  - `1ea00968` — `feat(kassa): nsis installer + avtoyangilanish (f4)` (7 fayl)
  - `0c0bea3` — `chore(deploy): kassa yangilanish kanali uchun nginx location (f4)` (5 fayl)
  - *(bu hisobot — uchinchi commit)*
  Ikkalasida ham `docs/progress.json` bor: uni **repo'ning o'z pre-commit hooki** qo'shadi
  (`pnpm -s progress && git add docs/progress.json`) — parallel sessiya ishi EMAS.

- **Kelgusi fazalarga qoldirilgan:**
  - **F12 (Phase-2 QA):** butun oqim — yig'ish → yuklash → topilishi → «Chiqish» da
    o'rnatilishi — **hech qachon yugurtirilmagan**. Shu jumladan: `perMachine: true`
    bo'lgani uchun `isSilent=true` da ham Windows **UAC** so'raydi; kassani yopayotgan
    xodim «Да» bosmasa yangilanish keyingi «Chiqish» ga qoladi (README da yozilgan,
    o'lchanmagan).
  - `1.1.0-dev` prerelease'dan relizga o'tish `electron-updater` da **tekshirilmagan** —
    birinchi reliz `-dev` siz chiqarilsin.
  - `build.publish[0].url` da build vaqtidagi default domen (`sherset.biznesjon.uz`)
    qotirilgan — runtime uni baribir bosib o'tadi, lekin uch domen (`climart.biznesjon.uz`,
    `climartgroup.uz`, xotiradagi `erp.sherset.uz`) noaniqligi hamon hal qilinmagan.
  - Qurilmani **unpair** qilish UI'si hamon yo'q (F1 qarzi, README da qayd etilgan).
  - Kod imzolash sertifikati olingach `build.win` ga env orqali qo'shiladi — kod o'zgarmaydi.

- **Yorliq:** **Phase-1: strukturaviy, runtime-tasdiqlanmagan · `.exe` yig'ilmagan ·
  VPS'ga deploy qilinmagan.** «done»/«production-ready»/«verified» — F12 dan oldin TAQIQ.

### F5 hisoboti

- **Holat:** ✅ bajarildi (worktree `kassa-f5`, branch `kassa-f5`, merge kutilmoqda)
- **Sana:** 2026-08-11

- **O'zgargan fayllar (21):**
  - *server:* `apps/api/src/modules/exchange-rate/exchange-rate.service.ts` ·
    `.../exchange-rate-canonical-scale.test.ts` (yangi) ·
    `apps/api/src/modules/retail-sale/retail-sale.service.ts` ·
    `.../retail-sale-detail-payments.test.ts` (yangi) ·
    `.../retail-tenders.ts`
  - *paket:* `packages/money/src/exchange-rate.ts` · `.../index.ts` · `.../money.test.ts` ·
    `packages/db/prisma/schema.prisma` (faqat izoh)
  - *web (chek):* `apps/web/src/lib/pos/receipt-payments.ts` + `.test.ts` (yangi) ·
    `apps/web/src/lib/print-agent.ts` · `apps/web/src/lib/__tests__/receipt-renderers.test.ts` (yangi) ·
    `apps/web/src/app/print/retail-sale/[id]/page.tsx` + `print-retail-sale.test.tsx` (yangi)
  - *web (POS):* `apps/web/src/components/pos/rasmilashtirish-modal.tsx` ·
    `.../pos/__tests__/rasmilashtirish-usd.test.tsx` (yangi) ·
    `apps/web/src/app/(app)/sotuv/page.tsx` · `.../__tests__/harness.tsx` ·
    `.../__tests__/sales-screen-usd.test.tsx` (yangi) · `.../__tests__/chek-refund-debt.test.tsx` (yangi) ·
    `apps/web/src/lib/pos/cart-math.ts` + `.test.ts`
  - *i18n:* `apps/web/src/messages/{uz,ru}.json` (5 kalit)

- **Qilingan ish:**
  1. **Kurs — serverdan, kanonik masshtabda.** `GET /exchange-rates/rate` endi
     `rateMinor` (×10^8) ham qaytaradi (mavjud `cbuRateToRateValue` bilan, `nominal`
     hisobga olinib). Sabab: endpoint CBU'ning o'nlik satrini beradi, sxema esa
     `< 10^9` ni rad etadi — o'girishni ekranga qoldirsak formula ikkinchi nusxada
     yashardi (`nominal ≠ 1` da 100× xato). Margin QO'LLANMAYDI (0) — u `Currency`
     jadvalining ishi; qaror izohda yozilgan.
  2. **`@moysklad/money` → `convertByRateE8`** — kurs bo'yicha o'girishning yagona
     formulasi. `retail-tenders.ts` `usdBaseMinor` unga delegat qiladi (matematika
     o'zgarmagan), kassa ekrani ham shundan foydalanadi ⇒ kassir ko'rgan so'm
     ekvivalenti server yozadigan raqam bilan bir xil.
  3. **`rasmilashtirish-modal.tsx` — 4-tender «Naqd USD».** Summa SENTDA parse
     qilinadi, so'm ekvivalenti jonli ko'rinadi, qaytim chegarasiga uning so'm
     qiymati kiradi (`retail-tenders.ts` `cashLikeMinor` bilan aynan bir xil).
     «Aniq summa» dollar maydonida so'm qoldig'ini YUQORIGA yaxlitlab sentga
     o'giradi (pastga yaxlitlansa server «to'lov yetarli emas» derdi).
  4. **Kurs yo'q kun:** dollar tugmasi `disabled`, sabab matni ko'rsatiladi, USD
     summasi 0 ga majburlanadi ⇒ jim 1:1 ga tushish yo'li **yopiq**. So'm to'lovi
     bu holatda ishlayveradi.
  5. **`sotuv/page.tsx` payload:** `cashUsdAmountMinor` + `usdRateMinor` FAQAT dollar
     berilganda qo'shiladi — eski payload shakli va uni qulflagan testlar tegilmagan.
  6. **Chek to'lov qatlami qayta simlandi** (audit topilmasi): `findById` endi
     `payments` ni beradi, uchala renderer `lib/pos/receipt-payments.ts` dan o'qiydi.
     Natijada «Terminal» va «Qarz» qatorlari ISHLAY BOSHLADI (ilgari biri mavjud
     bo'lmagan ustundan, ikkinchisi hech kim yozmaydigan ustundan o'qirdi), dollar
     qatori esa tabiiy ravishda o'sha manbadan chiqadi. Eski cheklar uchun legacy
     ustunlarga fallback saqlangan.
  7. **Qarzli chekni qaytarish ochildi** (audit topilmasi): `saleDebtMinor` +
     `refundCashShareMinor` (serverning `moneyCap` formulasi bilan aynan bir xil);
     qarz ulushi ataylab yuborilmaydi — server auto-split qiladi.

- **Testlar (qaysi xulqni qo'riqlaydi) — 49 yangi:**
  | Fayl | Nechta | Nimani qo'riqlaydi |
  |---|---|---|
  | `exchange-rate-canonical-scale.test.ts` | 5 | o'nlik kurs → ×10^8; `nominal ≠ 1` bir birlikka keltiriladi; qiymat stale-scale chegarasidan (10^9) o'tadi; kurs yo'q bo'lsa **otiladi**, 1:1 ga tushmaydi |
  | `retail-sale-detail-payments.test.ts` | 2 | `findById` `payments` ni **include qiladi** va dollar qatori uchun kerakli 5 maydonni so'raydi — FE fikstura'si o'zini aldamasin |
  | `packages/money/money.test.ts` (+4) | 4 | `convertByRateE8`: masshtab, pastga yaxlitlash, identity kurs |
  | `lib/pos/receipt-payments.test.ts` | 12 | kanonik tartib · **TERMINAL alohida qator** · **QARZ qatori bor** · dollar qatori asl sent+kurs+server bergan so'm ekvivalenti bilan · noma'lum kanal (CLICK) tushib qolmaydi · legacy fallback · kurssiz buzuq qator otmaydi |
  | `lib/__tests__/receipt-renderers.test.ts` | 6 | matn (ESC/POS) va HTML renderer'lari **bir xil** qatorlarni chiqaradi |
  | `app/print/retail-sale/[id]/print-retail-sale.test.tsx` | 2 | uchinchi (React) renderer ham shu manbadan |
  | `components/pos/__tests__/rasmilashtirish-usd.test.tsx` | 7 | kurs **serverdan** olinadi va sanasi bilan ko'rsatiladi · payload'da sent + muzlatilgan kurs · so'm ekvivalenti jonli · **kurssiz → bloklangan + sabab** · kurssiz holatda so'm to'lovi ishlaydi · qaytim chegarasiga dollar kiradi · ortiqcha karta hamon bloklangan |
  | `sotuv/__tests__/sales-screen-usd.test.tsx` | 3 | post payload'da ikki maydon; dollarsiz to'lovda **umuman yuborilmaydi**; aralash to'lov |
  | `sotuv/__tests__/chek-refund-debt.test.tsx` | 6 | naqd ulushi chek qanday yopilganidan; qarz ulushi ekranda; so'rovda `debtReturnMinor` **yo'q**; to'liq qarzli chekda naqd 0 va tugma ishlaydi; qisman qaytarish; eski chekda xulq o'zgarmagan |
  | `lib/pos/cart-math.test.ts` (+10) | 10 | `refundCashShareMinor` (qarzsiz/to'liq qarz/qisman/yaxlitlash/buzuq ma'lumot/nol summa) + `saleDebtMinor` |

- **Brauzer o'lchovi (summa/kurs/natija):** 🔴 **BAJARILMADI — parallel to'lqin, portlar band
  (§1.2.4); QA sessiyasiga qoldirildi.** O'lchanishi kerak bo'lgan aniq stsenariylar:
  1. *Kurs mavjud kun.* Chek 155 628,37 so'm · kurs 1$ = 12 450,27 · to'lov faqat
     «Naqd USD» = **$12.50** → kutilgan: «Aniq to'landi», qaytim yo'q; chekda
     `Dollar $12.50` + `1USD = 12450.27` + `155 628`; smena yopilishida
     `expectedCashUsdMinor` = **1250 sent**, so'm kutilgan naqdi **oshmaydi**.
  2. *Aralash.* 55 628,37 so'm naqd + **$8.04** → jami 155 728,54 ⇒ qaytim
     **100,17 so'm** (so'mda beriladi); chekda uchala qator (Naqd · Dollar · Qaytim).
  3. *Qaytim chegarasi.* 1 000 so'mlik chek, **$1** → o'tishi kerak (dollar naqd
     hisoblanadi); shu chekka **karta 2 000** → tugma bloklangan bo'lishi kerak.
  4. *Kurssiz kun.* `exchange_rates` da USD qatori yo'q akkaunt (yoki endpoint 404) →
     «Naqd USD» tugmasi o'chiq, sabab matni ko'rinadi, so'm to'lovi ishlayveradi.
     So'ng payload'ni qo'lda `usdRateMinor` siz yuborib server 400 berishini ko'rish.
  5. *Eski masshtab.* `usdRateMinor: '124502700'` (×10^4) bilan → server 400
     («Kurs eski (×10⁴) masshtabda»).
  6. *Chek uchala yo'ldan.* `/print/retail-sale/:id` brauzer · Electron native ·
     ESC/POS agent — aralash to'lovli chekda qatorlar bir xilligi.
  7. *Qarzli qaytarish.* 18 000 lik chek 6 000 naqd + 12 000 qarz → to'liq qaytarish:
     kassadan **6 000** chiqadi, mijoz balansidan **12 000** yechiladi (400 YO'Q).

- **Uchala chek renderer holati:** uchalasiga ham **tegildi va bitta manbaga**
  (`lib/pos/receipt-payments.ts`) ulandi —
  (1) `buildReceiptText` (ESC/POS matn) va (2) `buildReceiptHtml` (Electron native)
  `print-agent.ts` da, ikkalasi ham eksport qilinib matn-tekshiruvi bilan sinaldi
  (`receipt-renderers.test.ts`, 6 test: dollar/terminal/qarz/qaytim/legacy);
  (3) `/print/retail-sale/[id]` React sahifasi — `renderWithProviders` bilan real
  render qilinib tekshirildi (2 test). 🔴 **Fizik chop etish sinalmagan** (printer
  yo'q, Electron qobiq yo'q) — faqat qurilgan matn/HTML/DOM.

- **CashDesk dollar qarzi:** ✅ **TASDIQLANDI — bu fazada YECHILMADI** (reja §F5 da
  shunday yozilgan). Dalil: `apps/api/src/modules/retail-sale/retail-sale.service.ts:959-971`
  — `money.applyDeltas` ga faqat `cashToDrawer = cashAmount − change` (SO'M) yoziladi;
  dollar ataylab tushmaydi, chunki `CashDesk.balanceMinor` bitta valyutadagi qoldiq va
  boshqa valyutali delta «Currency mismatch» bilan rad etiladi. Oqibati o'zgarmagan:
  **pul daftari va bank-balans hisobotlari kassadagi dollarni KO'RSATMAYDI**; dollar
  faqat smena hisobida (`CashierSession.*UsdMinor`) va `CASH_USD` to'lov qatorlarida
  yuritiladi. Yechim alohida faza talab qiladi.

- **Gate natijasi:**
  - `pnpm --filter @moysklad/money build` → **OK**
  - `pnpm --filter @moysklad/api typecheck` → **0 xato**
  - `pnpm --filter @moysklad/web typecheck` → **0 xato**
  - `pnpm biome check <tegilgan yo'llar>` → **0 error** (57 warning: `nursery/useSortedClasses`,
    tegilmagan satrlarda ham bor — siyosat bo'yicha ruxsat)
  - `pnpm --filter @moysklad/api test` → **554 fayl / 7789 test — hammasi yashil** (1 skip)
  - `pnpm --filter @moysklad/web test` → **228 fayl / 3226 test — hammasi yashil** (26 skip)
  - `pnpm i18n:gate` → **9/9 yashil**
  - 📌 Baseline `6ba54150` da orkestrator o'lchagani: api 10 qizil, web 1 qizil —
    **hammasi `Test timed out in 5000ms`** (parallel yuk ostida argon2/render).
    Mening yugurtirishimda mashina bo'shroq bo'lgani uchun **o'sha testlar ham yashil**;
    ya'ni yangi yiqilish YO'Q va baseline qizillari ham qaytarilmadi.
  - ⚠️ Bir kuzatuv: `sales-screen-usd.test.tsx` ning aralash-to'lov testi dastlab
    `user.type` bilan 5 s chegarasidan oshdi. `testTimeout` OSHIRILMADI — test
    arzonlashtirildi (`fireEvent.change`, izoh bilan).

- **Commit(lar):**
  - `5cc1b1e9` — `feat(kassa): chek to'lov qatlami RetailSalePayment qatorlaridan o'qiladi`
  - `ef5da7b2` — `feat(kassa): POS'da dollar naqd tenderi (kurs serverdan, muzlatiladi)`
  - `ed19780e` — `fix(kassa): qarzli chekni POS'dan qaytarish mumkin bo'ldi`
  - *(+ shu hisobot commiti)*
  - Har commitdan keyin `git show --stat HEAD` bilan tarkib tekshirildi — begona fayl
    tushmagan (worktree izolyatsiyasi; hook'lar chetlab o'tilgan, gate'lar qo'lda to'liq).

- **Kelgusi fazalarga qoldirilgan:**
  1. 🔴 **CashDesk dollar qoldig'i** (yuqorida) — pul daftari/bank-balans dollarni ko'rmaydi.
  2. **Kurs manbai qarori:** POS `ExchangeRate` (CBU, margin'siz) dan oladi, hujjatlar esa
     `Currency.rateValue` (margin qo'llangan) dan. Ikkalasi bir kun ajralib qolishi mumkin —
     do'kon ustamasi POS'ga ham kerak bo'lsa, F6 bilan birga bitta manbaga keltirilsin.
  3. **F6 uchun:** `debt.schema.ts` dagi `usdCentsToSomTiyin` ham endi
     `convertByRateE8` ga delegat qilinishi mumkin (bu fazada TEGILMADI — F6 hududi).
  4. **Chek chegirmasi** hamon ko'rinmaydi (`qty × price` va `sum` mos kelmaydi) — audit
     topilmasi, F5 doirasidan tashqarida qoldirildi (to'lov qatlami tuzatildi, POZITSIYA
     qatlami emas).
  5. Chek yorliqlari (`Naqd`/`Dollar`/`Qarz`…) ataylab i18n'da EMAS — chek mijozga
     beriladigan hujjat. Ko'p tilli chek kerak bo'lsa alohida qaror talab qiladi.
  6. `/print/retail-sale` sahifasidagi `_t` (ishlatilmagan tarjimon) tegilmadi.

- **Yorliq:** **Phase-1: strukturaviy, runtime-tasdiqlanmagan** — brauzer-smoke **YO'Q**,
  fizik chop etish **YO'Q**, real DB bilan uchidan-uchiga o'lchov **YO'Q**.

### F6 hisoboti

- **Holat:** ✅ bajarildi (Phase-1)
- **Sana:** 2026-08-11 · worktree `sherset-kassa-f6`, branch `kassa-f6`

- **O'zgargan fayllar:**
  - *Server:*
    - `apps/api/src/modules/debt/debt.schema.ts` — `PosDebtPaymentSchema` kengaytirildi
    - `apps/api/src/modules/debt/debt-fifo.ts` — yangi `splitOriginalMinor`
    - `apps/api/src/modules/debt/pos-debt-payment.service.ts` — USD→so'm o'girish, kurs muzlatish, chek maydonlari
    - `apps/api/src/modules/cashier-session/cashier-session.service.ts` — §6 + §7 valyuta ajratmasi
    - `apps/api/src/modules/cashier-session/cashier-session-reconciliation.ts` — `ShiftUsdCashInputs.debtUsdMinor`
  - *Ekran:*
    - `apps/web/src/components/pos/debt-payment-dialog.tsx` — valyuta tanlovi, kurs, ekvivalent
    - `apps/web/src/app/print/debt-payment/[batchId]/page.tsx` — PKO dollar qatori
    - `apps/web/src/messages/{ru,uz}.json` — 3 yangi kalit
  - *Testlar:* `debt.schema.test.ts` (+6) · `debt-fifo.test.ts` (+6) ·
    `pos-debt-payment.usd.test.ts` (yangi, 8) · `shift-usd-debt-currency.test.ts` (yangi, 6) ·
    `foreign-cash-desk-guard.test.ts` (yangi, 7) · `debt-payment-usd.test.tsx` (yangi, 11) ·
    `pko-usd.test.tsx` (yangi, 3) · `pos-debt-payment-wiring.test.ts` (+3, 2 tasi F6 uchun yangilandi) ·
    `sales-screen-shift.test.tsx` (payload'ga `currency` qo'shildi)

- **Qilingan ish (reja 8 bandi):**
  1. **Sxema** — `currency` (`UZS|USD`, default UZS) + kanonik ×10⁸ `exchangeRate`;
     USD'da kurs majburiy; **stale-scale guard** (`< 10⁹` → 400).
     🔴 `amountMinor` endi **to'lov valyutasining minor birligida** (UZS→tiyin, USD→sent) —
     `PostRetailSaleSchema.cashUsdAmountMinor` bilan bir xil konvensiya.
     Klient so'mdagi ekvivalentni **umuman yubormaydi** (ikki manba muqarrar uzoqlashadi).
  2. **Servis** — o'girish `usdCentsToSomTiyin` bilan (nusxa emas, `retail-tenders.ts` bilan
     bitta funksiya). Qarzga tushadigan qiymat, kassa daftari va PKO cheki bir manbadan.
  3. **Kurs muzlatiladi** — `DebtPayment.exchangeRate` (+ `amountOriginalMinor`); `receipt()`
     ularni qaytaradi, ya'ni chek qayta chop etilganda AYNAN o'sha kurs chiqadi.
     Migratsiya **kerak emas**: ustunlar `DebtPayment` da allaqachon bor
     (`schema.prisma:11380-11382`, 2026-07-13 dan).
  4. **Dialog** — So'm/Dollar tanlovi; kurs `GET /exchange-rates/rate?currency=USD` dan
     (kanonik `rateMinor`, F5 merosi — masshtab FE'da qayta hisoblanmaydi); so'm ekvivalenti
     jonli; kurssiz kunda USD **bloklanadi**. Qo'shimcha ikki qaror:
     · valyuta almashganda summa **tozalanadi** (sent ≠ tiyin, bir bosishda ~12 000× xato);
     · USD'da **terminal bloklanadi** (dollar terminal orqali kelmaydi) va usul naqdga qaytadi.
  5. **PKO cheki** — «Dollar $100.00 × 12450.27» qatori; yorliq va formatlar
     `lib/pos/receipt-payments.ts` dan (savdo cheki bilan **bitta lug'at**, F5 uslubi).
  6. **§F6.6 AUDIT — YOPILDI** (pastda alohida).
  7. **§F6.7 AUDIT — YOPILDI** (pastda alohida).
  8. **i18n** — `debt_currency_uzs`, `debt_currency_usd`, `debt_usd_residual` (ru+uz);
     `usd_rate_hint` / `usd_rate_missing` F5 dan qayta ishlatildi.

- **Schema guard'lari** (`debt.schema.test.ts` → «PosDebtPaymentSchema — F6»):
  | Guard | Xulq | Test |
  |---|---|---|
  | USD + kurssiz | 400 (jim 1:1 TAQIQ) | «🔴 KURSSIZ USD to'lovni RAD etadi» |
  | USD + eski ×10⁴ kurs (`128000000`) | 400 | «🔴 ESKI (×10⁴) masshtabdagi kursni RAD etadi» |
  | kurs `0` / manfiy | 400 | «nol yoki manfiy kursni RAD etadi» |
  | `currency: 'EUR'` | 400 (kassa oqimi yo'q) | «noma'lum valyutani RAD etadi» |
  | UZS kursisiz | o'tadi (regressiya yo'q) | «so'm to'lovi kursisiz ishlayveradi» |
  Servisda **ikkinchi qatlam** ham bor: `currency==='USD'` bo'lib kurs yo'q bo'lsa servis
  to'g'ridan-to'g'ri chaqirilganda ham `BadRequestException` (sent tiyin deb o'qilmasin).

- **Qarz daftariga ta'siri qanday tekshirildi:**
  Simmetriya (`create +total` · `to'lov −paid`) **buzilmadi** — o'zgarish faqat «qancha so'm»
  savolida, «qaysi ishorada» savolida emas. Dalil:
  · `pos-debt-payment.usd.test.ts` → «qarz daftari simmetriyasi: to'lov MANFIY delta va
  SO'MDA (sent emas)» — `balanceDeltas === [{ currency: 'UZS', deltaMinor: -128_000_000n }]`
  ($100 × 12 800 kurs). Ya'ni delta **manfiy**, **so'mda** va **qarz valyutasida**
  (`recalcDebt` `debt.currency` ni ishlatadi, to'lov valyutasini emas).
  · «$100 to'lovi qarzni SO'M ekvivalentiga kamaytiradi» — `debt.paidMinor === 128 000 000n`.
  · Tuzatishdan OLDIN bu ikkala test `10 000n` (sent tiyin deb o'qilgan) bilan **yiqilardi** —
    non-vacuity o'lchandi (yiqilish ko'rildi, keyin tuzatildi).
  · «bir necha qarzga bo'linsa har qator O'Z sentini oladi (Σ = asl summa)» — FIFO 2 qarzga
    bo'lganda `amountOriginalMinor` bo'laklari `[5 000, 5 000]`, jami 10 000 sent.
    Bu **storno** uchun hal qiluvchi: `debt.service.reverseCashDeskDelta` yashiqdan
    chiqadigan JISMONIY summani aynan shu maydondan oladi.
  · «SO'M to'lovi o'zgarmagan» — daftar ham, yashiq ham so'mda, `exchangeRate: null`.

- **Smena USD hisobiga ta'siri (§F6.6 — KOD BILAN tekshirildi, taxmin emas):**
  - **Muammo (o'lchangan):** `collectCashInputs` naqd qarz to'lovini `method:'cash'` bo'yicha
    yig'ardi, **valyuta filtrisiz**; `DebtPayment.amountMinor` esa har doim so'm ekvivalenti.
    ⇒ USD to'lovda yashiqqa **dollar** tushib, **so'm**-kutilgani dollarning so'm qiymatiga
    oshardi, USD-kutilgani esa uni ko'rmasdi ⇒ **soxta so'm kamomadi + hisobga olinmagan dollar**.
  - **Yechim:** so'm agregatiga `currency: BASE_CURRENCY` filtri; dollar to'lovlari
    `collectUsdCashInputs` da **`amountOriginalMinor`** bo'yicha alohida yig'iladi
    (`ShiftUsdCashInputs.debtUsdMinor`, `expectedUsdCashMinor` ga qo'shildi).
    Ikki filtr **juft**: bir to'lov ikkala jamiga ham tushmaydi, birortasidan ham tushib qolmaydi.
  - **Qo'riqchi:** `shift-usd-debt-currency.test.ts` — (1) manba-qulf: so'm agregatida
    `currency: BASE_CURRENCY`, dollar agregatida `currency: 'USD'` + `amountOriginalMinor`
    (🔴 `amountMinor` emas) + `method:'cash'` + `retailShiftId` + `reversedAt: null`;
    (2) `BASE_CURRENCY === 'UZS'` konstantasi qulflandi; (3) sof formula testi
    (`debtUsdMinor` kutilgan dollarni aynan o'sha summaga oshiradi, berilmasa 0).
    Manba-qulf ATAYLAB: `debtUsdMinor` ixtiyoriy maydon ⇒ uzatish tushib qolsa **typecheck jim
    o'tadi** va sof testlar yashil qoladi (`DocumentEditor` prop-drop klassi).
  - **Kutilgan yon ta'sir (ijobiy):** `close()` da `expectedUsd !== 0n && closingCashUsd === null`
    ⇒ 400. Ya'ni smenada **USD qarz to'lovi bo'lsa** kassir endi smenani dollarni sanamasdan
    yopa olmaydi. Bu avtomatik ravishda `collectUsdCashInputs` orqali keldi.

- **Valyutali kassa (§F6.7 — YOPILDI):**
  - **Muammo (o'lchangan):** drawer-in/out va cash-out hujjatlariga `session.cashDesk.currency`
    yoziladi (`:554`, `:588`, `:1143` — endi siljigan), `collectCashInputs` esa `sumMinor` ni
    valyuta bo'yicha filtrlamasdi ⇒ so'm bo'lmagan kassada **sent so'm formulasiga** kirardi.
  - **Yechim — ikki qatlam:** (1) `retailDrawerCashIn/Out` agregatlariga
    `currency: BASE_CURRENCY`; (2) `loadOpenShiftForDrawer` (uch chaqiruvchining **yagona**
    qo'riqchisi: `drawerCashIn`, `drawerCashOut`, `posCashOut`) so'm bo'lmagan kassada
    **ochiq `BadRequestException`** beradi, xato matnida kassa valyutasi ko'rsatiladi.
    Sabab: smena hisobining butun oqimi (opening · sales · expected · variance) so'm
    semantikasida — USD-kassa **qo'llab-quvvatlanmaydi**, jim noto'g'ri hisobdan ko'ra ochiq
    to'xtash. Dollar oqimi `CASH_USD` tenderi va F6 dollar qarz to'lovi orqali **alohida**
    sanaladi.
  - **Qo'riqchi:** `foreign-cash-desk-guard.test.ts` (7 test) — agregat filtrlari,
    `kind` filtri **hamon yo'q** (§8.2 regressiyasi qaytmasin), USD kassada Внесение/Изъятие
    bloklanadi, xato matni sababni aytadi, so'm kassada qo'riqchi **to'smaydi** (vacuity).
  - **Bugungi bazada xulq o'zgarmaydi:** lokal `climart_adopt` da 1 ta valyuta bor —
    UZS (default). Ya'ni filtr bugun hech narsani kesmaydi, kelajakdagi jim xatoni yopadi.

- **🟠 KURS MANBAI DIVERGENSIYASI (ochiq biznes savoli — QAROR QILINMADI):**
  - **Ikki manba, dalil bilan:**
    | Manba | Kim o'qiydi | Margin |
    |---|---|---|
    | `ExchangeRate` jadvali → `GET /exchange-rates/rate` | **F5 dollar savdo**, **F6 dollar qarz to'lovi** | **YO'Q** — `exchange-rate.service.ts:44` `cbuRateToRateValue(r.rate, r.nominal, **0**)` |
    | `Currency.rateValue` | hujjatlar (cash-in/out, contract, invoice, commission-report…) | **BOR** — `currency.service.ts:265` `cbuRateToRateValue(src.rate, src.nominal, **c.margin**)` |
    Formula bitta (`currency-rate-source.ts:16`), farq faqat uchinchi argumentda.
  - **F6 qarori:** manba **O'ZGARTIRILMADI** — F5 bilan bir xil (`/exchange-rates/rate`).
    Izchillik muhimroq: kassadagi dollar savdo va dollar qarz to'lovi bir xil kursda yopilsin.
  - **Amalda nima bo'ladi:** `margin > 0` bo'lsa `Currency.rateValue > CBU`, ya'ni mijozning
    $100 i **ko'proq so'm** qarz yopardi ⇒ do'kon **kamroq oladi**. Margin sotuvda (chiqayotgan
    tovarni chet valyutada narxlashda) ma'noli; **kiruvchi** naqdga qo'llanganda teskari ishlaydi.
    Ya'ni hozirgi tanlov (xom CBU) kiruvchi to'lov uchun do'kon foydasiga **konservativ**.
  - **Miqdoriy misol (lokal DB'dan o'lchangan):** `ExchangeRate` USD = **11 952.10**
    (2026-08-10, `source: CBRU`, `nominal: 1`) ⇒ `rateMinor = 1195210000000`.
    Mijoz $100 bersa qarz **1 195 210,00 so'm**ga kamayadi. Agar `Currency` da margin **2%** li
    USD qatori bo'lsa, o'sha $100 **1 219 114,20 so'm** yopardi — bitta to'lovda
    **23 904,20 so'm** farq (do'kon zarariga). *(2% — misol uchun olingan taxminiy qiymat;
    haqiqiy `Currency.margin` prod bazada o'lchanmagan.)*
  - **🔴 O'lchangan holat:** lokal `climart_adopt` bazasida `Currency` jadvalida **umuman
    USD qatori YO'Q** (jami 1 qator: `860`/`UZS`, `MANUAL`, `margin: null`, default).
    Ya'ni bugun divergensiya **latent** — hujjat yo'li USD kursini oladigan joy yo'q.
    (Prod bazada o'lchanmagan.)
  - **O'zgartirish kerak bo'lsa qayerda:** **bitta joy** — `exchange-rate.service.ts:44`
    dagi `cbuRateToRateValue(r.rate, r.nominal, 0)` ning uchinchi argumenti (yoki bu endpoint
    `Currency.rateValue` ni o'qishga o'tkaziladi). F5 ham, F6 ham shu bitta endpointdan
    oziqlangani uchun ikkalasi birga o'zgaradi.
  - ⚠️ **Bu pul qarori — foydalanuvchiniki.** Javob kelgunicha jim «to'g'irlash» qilinmadi.

- **Brauzer o'lchovi:** ❌ **BAJARILMADI** (to'lqin qoidasi — `pnpm dev` portlari band, 3 agent
  parallel). **Phase-2 da o'lchanadigan stsenariylar (kutilgan raqamlar bilan):**
  | # | Stsenariy | Kutilgan natija |
  |---|---|---|
  | 1 | Qarz 2 000 000 so'm, kurs 11 952.10, mijoz **$100 naqd** | qarz `2 000 000 − 1 195 210 = 804 790` so'mga tushadi; PKO chekda «Dollar $100.00 × 11952.1» va «TO'LANDI 1 195 210» |
  | 2 | O'sha to'lovdan keyin smenani yopish | so'm-kutilgan **o'zgarmaydi**; USD-kutilgan **+10 000 sent**; dollar sanalmasa `close()` **400** beradi («dollar naqd oqimi bor») |
  | 3 | Qarz 1 000 so'm, mijoz $100 | tugma **bloklangan** (ortiqcha to'lov), server ham 400 |
  | 4 | Kurs yo'q kun (`/exchange-rates/rate` 404) | «Dollar» tugmasi **disabled**, `usd_rate_missing` matni; so'm to'lovi ishlaydi |
  | 5 | FIFO: 2 ta qarz (600 000 + 595 210 so'm), mijoz $100 | ikkala qarz yopiladi; ikkita `DebtPayment` qatori, `amountOriginalMinor` bo'laklari **jami 10 000 sent** |
  | 6 | «Hammasi» dollarda, qarz 2 000 000 so'm | maydonga **`167.33`** ($167.33 = 1 999 944,89 so'm), yopilmagan **55,11 so'm** izohda ko'rinadi, to'lov **400 bermaydi** *(raqamlar shu sessiyada hisoblab tekshirildi: `200 000 000 × 10⁸ / 1 195 210 000 000 = 16 733` sent)* |
  | 7 | Storno (dollar to'lovini qaytarish) | kassa daftaridan **10 000 sent** (USD) chiqadi, so'm qoldig'i tegilmaydi; qarz `paidMinor` tiklanadi |
  | 8 | `CashDesk.currency = 'USD'` bo'lgan smenada Внесение | **400**, xato matnida «Kassa valyutasi USD» |
  🔴 Migratsiya YOZILMADI va QO'LLANMADI — kerak emas edi (`DebtPayment.currency`,
  `amountOriginalMinor`, `exchangeRate` ustunlari 2026-07-13 dan beri bor).

- **Gate natijasi (to'liq, qisqartirilmagan):**
  - `pnpm --filter @moysklad/money build` — OK
  - `pnpm --filter @moysklad/api typecheck` — **0 xato**
  - `pnpm --filter @moysklad/web typecheck` — **0 xato**
  - `pnpm biome check <tegilgan yo'llar>` — **0 xato**
  - `pnpm --filter @moysklad/api test` — **557 fayl · 7822 test · 0 yiqilish** (1 skip)
  - `pnpm --filter @moysklad/web test` — **240 fayl · 3329 test · 0 yiqilish** (26 skip)
  - `pnpm i18n:gate` — **9 test yashil** (12 971 kalit tekshirildi)
  - Timeout/soxta-qizil hodisa **bo'lmadi** (yakka yugurtirish talab qilinmadi).
  - ⚠️ Ikki mavjud test F6 tufayli **yangilandi** (yashirilmadi):
    `pos-debt-payment-wiring.test.ts` dagi ikki manba-qulfi (`formatAmountInput(outstanding,
    currency)` → `payAllInput`; `parseAmountToMinor(amountInput, currency)` → valyutali variant)
    va `sales-screen-shift.test.tsx` payload'iga `currency: 'UZS'` qo'shildi. Ikkalasi ham
    ataylab qilingan shartnoma o'zgarishi, niyat (float yo'q, umumiy parse) qulfda qoldi.

- **Commit(lar):**
  - `cd32636d` — `feat(kassa): f6 server — usd qarz to'lovi + smena valyuta ajratmasi`
  - `66fb4035` — `feat(kassa): f6 ekran — qarz to'lovi oynasida dollar + pko chek qatori`
  - *(har ikkisiga `docs/progress.json` ning avto-yangilangan 1 qatori ilashdi — hook
    generatsiyasi, begona sessiya ishi emas; bu worktree izolyatsiyalangan.)*

- **Kelgusi fazalarga qoldirilgan:**
  1. **🟠 Kurs manbai qarori** (yuqorida) — foydalanuvchi javobidan keyin **bitta** joyda
     o'zgaradi. F6 hech narsani jim o'zgartirmadi.
  2. **Dollar `CashDesk.balanceMinor` ga tushmaydi** — F5 dan meros ochiq qarz.
     Endi dollar qarz to'lovi ham `MoneyOperation` ga `currency: 'USD'` bilan yozadi, ya'ni
     pul-daftar va bank-balans hisobotlari kassadagi dollarni hamon **so'm bilan aralashtirmaydi**,
     lekin uni **ko'rsatmaydi** ham. Alohida faza talab qiladi.
  3. **Aralash (so'm + dollar) qarz to'lovi** — hozir bitta to'lov = bitta valyuta.
     Mijoz $50 + 100 000 so'm bermoqchi bo'lsa kassir ikki marta qabul qiladi (ikki PKO cheki).
  4. **Dollar bilan qarzni TIYIN-BA-TIYIN yopib bo'lmaydi** (1 sent ≈ 120 tiyin). «Hammasi»
     pastga yaxlitlaydi va qoldiq ochiq ko'rsatiladi; to'liq yopish uchun qoldiqni so'mda
     olish kerak. Avans (F10) kelganda bu tabiiy yechiladi.
  5. **USD-kassa (`CashDesk.currency ≠ UZS`)** endi ochiq bloklangan — to'liq qo'llab-quvvatlash
     (dollar opening/expected/variance) alohida ish.
  6. `escalateOverdue`/`markStale` hamon chaqirilmaydi (F13 da).

- **Yorliq:** **Phase-1: strukturaviy, runtime-tasdiqlanmagan** — brauzer-smoke **YO'Q**,
  real DB bilan uchidan-uchiga to'lov **YO'Q**, fizik PKO chop etish **YO'Q**.

### F7 hisoboti

- **Holat:** ✅ Phase-1 bajarildi (runtime-tasdiqlanmagan)
- **Sana:** 2026-08-11 · worktree `sherset-kassa-f7`, branch `kassa-f7`
- **O'zgargan fayllar:**
  - `apps/api/src/modules/auth/kiosk-policy.ts` — qoida modeli (`:param`, `exact`) + 3 yangi qator
  - `apps/api/src/modules/auth/kiosk-policy.test.ts` — pozitiv 4 + negativ 22 + `:id` shakli izohi
  - `apps/api/src/modules/permissions/role-templates.ts` — kassirga `customerorder {view, approve}`
  - `apps/api/src/modules/permissions/role-templates.test.ts` — `entity.action` route-override, F7 qulfi
  - `apps/api/src/modules/permissions/__snapshots__/role-templates.test.ts.snap` — 1 qator
  - `apps/api/src/modules/permissions/template-topup.{ts,test.ts}` — `TOPUP_ENTITIES += customerorder`
  - `apps/web/src/app/(app)/sotuv/page.tsx` — «Zakazlar» yorlig'i + `ZakazDetailPanel`
  - `apps/web/src/app/(app)/sotuv/__tests__/sales-screen-orders.test.tsx` — YANGI, 12 test
  - `apps/web/src/app/(app)/sotuv/__tests__/harness.tsx` — `/permissions/me` marshruti
  - `apps/web/src/hooks/use-permissions.ts` — `can(entity, action)`
  - `apps/web/src/messages/{ru,uz}.json` — 11 kalit × 2 til
- **Qilingan ish:** POS'da «Zakazlar» yorlig'i — holat filtri (Yangi / Tasdiqlangan /
  To'lov kutilmoqda) SERVER `state=` parametri bilan + `storeId` cheklovi; zakaz detali
  (pozitsiyalar, miqdor, narx, **rezerv miqdori**); `draft` zakaz uchun «Tasdiqlash»
  tugmasi. **Yangi qabul-FSM QO'SHILMADI** — mavjud `state` o'qiladi va mavjud
  `POST /customer-orders/:id/transitions/:target` chaqiriladi. Rezervni FE qo'ymaydi:
  server `confirmed` da o'zi qo'yadi (dalil: `customer-order.service.ts:1138-1165` —
  `applicable = true` → `applyReservationInvariant(…, 'hold-remaining')`).
- **Allowlist'ga qo'shilgan aniq yo'llar** (har biri — nega):
  | yo'l | metod | nega |
  |---|---|---|
  | `/customer-orders` | GET (`exact`) | zakazlar ro'yxati — yorliqning o'zi |
  | `/customer-orders/:id` | GET (`exact`) | detal: pozitsiyalar, summa, mijoz, rezerv |
  | `/customer-orders/:id/transitions/confirmed` | POST (`exact`) | `draft → confirmed`; rezerv AYNAN shu o'tishda tushadi |

  Buning uchun qoida modeli kengaytirildi: `:param` bitta segmentga mos keladi,
  `exact: true` ichki yo'llarni OCHMAYDI. Oddiy prefiks-qoida bo'lganda bitta
  `/customer-orders` GET qatori `:id/related`, `:id/supply-shortfall` va kelajakdagi
  har qanday sub-resursni ham jimgina ochib yuborardi.

  **Negativ test nimani bloklab turibdi** (`kiosk-policy.test.ts`, 22 yo'l):
  `POST /customer-orders` (yaratish) · `PATCH`/`DELETE`/`:id/clone` ·
  `bulk-delete`, `bulk-transition`, `bulk-set-status`, `bulk-reserve`,
  `bulk-clear-reserve`, `bulk-mark-printed`, `bulk-print`, `merge`, `mass-edit` ·
  `transitions/cancelled` (rezervni bo'shatadi), `transitions/paid` (F8 ishi),
  `transitions/closed` · `:id/related`, `:id/supply-shortfall`, `:id/position` ·
  segment-chegarasi `/customer-orders-archive`.
  ⚠️ **Ochiq qolgani ochiq yozilgan:** `/customer-orders/kanban` va `/print-forms`
  shaklan `:id` ga tushadi. Ataylab qoldirildi (ikkalasi ham ro'yxat bilan bir xil
  `customerorder.view` ruxsatiga bog'langan, yozadigan hech narsa yo'q) va bu holat
  alohida test bilan hujjatlangan — «jimgina ochilib qolgan» emas.
- **Ruxsat qanday berildi (prod qadami):** rol-shabloni orqali (MK29 naqshi, qo'lda DB
  tahriri EMAS) — `cashier` shabloniga `customerorder {view: ALL, approve: ALL}`;
  `create`/`update`/`delete`/`print` ataylab `NO`. `PermissionEntity` unioniga TEGILMADI
  (`customerorder` allaqachon bor) — ya'ni «izohda nuqtali vergul» tuzog'i bu fazada
  qo'zg'almadi. Seed-sync holati: `role-templates.test.ts` (62), `permissions-seed-sync`,
  `hr-role-seed-sync`, `template-topup.test.ts` (18) — hammasi yashil; kassir↔kiosk
  moslik testi `entity.action` override bilan `approve` uchun aynan
  `…/transitions/confirmed` yo'lini tekshiradi.
  🔴 **Prod qadami (hali BAJARILMAGAN):** `TOPUP_ENTITIES` ga `customerorder` qo'shildi →
  jonli serverda `npx tsx src/scripts/topup-role-permissions.ts --apply` (apps/api ichidan),
  keyin api jarayonini restart (ruxsat cache 5 daqiqa TTL). Yugurtirilib tasdiqlangach
  `customerorder` ro'yxatdan **OLIB TASHLANADI** — u yangi entity emas, va boshqa
  shablonlarda (owner/admin/sales_manager/seller) ham musbat bo'lgani uchun ro'yxatda
  qolsa «admin butunlay olib tashlagan» rolni keyingi run tiriltirib qo'yishi mumkin.
  Sabab kodda ham yozilgan (`template-topup.ts`).
- **Rezerv qanday o'lchandi:** 🔴 **O'LCHANMAGAN.** Bu to'lqinda dev-stack ko'tarilmadi
  (portlar 3 parallel agent bilan band — sessiya promptining §4 chegarasi). O'lchangani —
  faqat KOD dalili: `customer-order.service.ts:1138-1165`. Kutayotgan o'lchov quyidagi
  «Brauzer o'lchovi» ro'yxatining 3-bandi.
- **Brauzer o'lchovi:** 🔴 **BAJARILMAGAN.** O'lchanishi kerak bo'lgan stsenariylar:
  1. **Kiosk-kassir yorliqni ko'radi** — kiosk rolli xodim `/sotuv` → «Zakazlar»;
     kutilgan: ro'yxat 200 bilan keladi (403 EMAS — allowlist qatorining haqiqiy sinovi).
  2. **Do'kon cheklovi** — boshqa do'konning `draft` zakazi ro'yxatda KO'RINMAYDI.
  3. **Rezerv DB'da** (asosiy o'lchov) — `draft` zakaz, 2 pozitsiya, ombor qoldig'i yetarli:
     tasdiqlashdan OLDIN `SELECT reserved_qty FROM customer_order_position` = 0 va
     `Stock.reserved` = X; «Tasdiqlash» dan KEYIN `reserved_qty` = buyurtma miqdori,
     `Stock.reserved` = X + miqdor, `CustomerOrder.state='confirmed'`, `applicable=true`.
     Ekranda: detalda «Rezerv: N» raqami ko'tariladi.
  4. **Qoldiq yetmaganda** — rezerv qisman/0 bo'lsa ekran nima ko'rsatadi (server
     `hold-remaining` ni qanday hal qiladi — o'lchanmagan).
  5. **Ruxsatsiz kassir** — `customerorder.approve` olib tashlangan rol: tugma yo'q VA
     `curl -X POST …/transitions/confirmed` 403 qaytaradi.
  6. **Yopiq yo'l** — `curl -X DELETE …/customer-orders/:id` kiosk tokeni bilan → 403.
  7. **Xato yo'li** — `cancelled` zakazni tasdiqlashga urinish → toast'da server matni.
- **Gate natijasi (ketma-ket yugurtirildi, parallel EMAS):**
  `pnpm --filter @moysklad/money build` OK ·
  `api typecheck` 0 · `web typecheck` 0 ·
  `biome check <tegilgan yo'llar>` exit 0 ·
  `api test` **554 fayl / 7818 test yashil** (0 yiqilish, 1 fayl + 2 test skip) ·
  `web test` **239 fayl / 3323 test yashil** (0 yiqilish, 26 skip) ·
  `pnpm i18n:gate` OK (9 test). Yuk timeouti kuzatilmadi.
  Testlar: +26 API (kiosk-policy +5 blok, role-templates +1, template-topup +3) va
  +12 web. Har biri avval QIZIL ko'rildi; ikki ruxsat testi mutatsiya bilan
  tasdiqlandi (guard olib tashlansa qizaradi — vakuum emas).
- **Commit(lar):**
  - `215964f8` — `feat(kassa): kiosk zakaz yo'llari + kassirga customerorder.approve (f7 server)`
  - `44ca0cb3` — `feat(kassa): pos «zakazlar» yorlig'i — ro'yxat, detal, tasdiqlash (f7 web)`
  (ikkalasida ham hook `docs/progress.json` ni avtomat qo'shdi — repo konvensiyasi.)
- **Kelgusi fazalarga qoldirilgan:**
  - **F8 (to'lash):** `RetailSale.customerOrderId` ga TEGILMADI; to'lov oqimi
    o'zgartirilmadi. F8 ga kerak bo'ladi: (a) `transitions/awaiting_payment` va/yoki
    `transitions/paid` uchun allowlist qatori — hozir ATAYLAB yopiq va negativ test bilan
    qulflangan, ya'ni F8 o'sha testni ongli ravishda yangilashi kerak; (b) zakaz
    detalidan «To'lash» yo'li; (c) ikki kassir bitta zakazni bir vaqtda to'lashi
    (reja §5 «Zakaz (F7–F8)» bandi).
  - **F9 (mijoz kartasi):** «jarayondagi zakazlari» ro'yxati shu yerdagi
    `/customer-orders?state=…&storeId=…` so'rovini mijoz bo'yicha filtrlab qayta ishlatadi
    — `agentId` filtri allowlist'ga qo'shimcha yo'l TALAB QILMAYDI (o'sha GET).
  - **Prod:** `topup-role-permissions.ts --apply` + api restart, keyin `TOPUP_ENTITIES`
    dan `customerorder` ni olib tashlash (yuqorida).
  - **Kuzatilgan, tegilmagan:** `apps/web/src/app/(app)/sotuv/page.tsx` da eski
    class-sort ogohlantirishlari (biome `warning`, `error` emas) — MK33 bo'linishida
    ko'riladi. Worktree'da `lint-staged automatic backup` stash'i qoldi (o'z commitimdan,
    tarkib commitga tushgan) — **o'chirilmadi** (CLAUDE.md §6.7 A qoidasi).
- **Yorliq:** **Phase-1: strukturaviy, runtime-tasdiqlanmagan** · brauzer-smoke YO'Q ·
  rezerv DB'da o'lchanmagan.

### F8 hisoboti

- **Holat:** ⬜ bajarilmagan
- **Sana:**
- **O'zgargan fayllar:**
- **Qilingan ish:**
- **`customerOrderId` qayerda yoziladi:**
- **Ikki marta to'lash himoyasi (qanday + qanday sinaldi):**
- **Rezerv qarori + sababi:**
- **Qisman to'lov qarori + sababi:**
- **Brauzer o'lchovi:**
- **Gate natijasi:**
- **Commit(lar):**
- **Kelgusi fazalarga qoldirilgan:**
- **Yorliq:**

### F9 hisoboti

- **Holat:** ⬜ bajarilmagan
- **Sana:**
- **O'zgargan fayllar:**
- **Qilingan ish:**
- **Panel manbalari:**
- **Telefon-qidiruv holati:**
- **Refund ↔ qarz o'lchovi natijasi:**
- **Brauzer o'lchovi:**
- **Gate natijasi:**
- **Commit(lar):**
- **Kelgusi fazalarga qoldirilgan:**
- **Yorliq:**

### F10 hisoboti

- **Holat:** ⬜ bajarilmagan
- **Sana:**
- **O'zgargan fayllar:**
- **Qilingan ish:**
- **Avans model qarori + sababi:**
- **Daftar simmetriyasi tekshiruvi:**
- **Balans o'quvchilariga ta'siri:**
- **Brauzer o'lchovi:**
- **Gate natijasi:**
- **Commit(lar):**
- **Kelgusi fazalarga qoldirilgan:**
- **Yorliq:**

### F11 hisoboti

- **Holat:** ✅ bajarildi (Phase-1)
- **Sana:** 2026-08-11 · worktree `sherset-kassa-f11`, branch `kassa-f11` (baza `6ba54150`)

- **O'zgargan fayllar:**
  - YANGI `apps/web/src/app/print/z-report/[id]/page.tsx` — 72mm chek, `?auto=1` avto-chop
  - YANGI `apps/web/src/lib/z-report-receipt.ts` — SOF model (`buildZReceipt`) + ikki renderer
    (`renderZReceiptText` ESC/POS 32-ustun, `renderZReceiptHtml` 72mm Electron)
  - YANGI `apps/web/src/lib/use-z-receipt-labels.ts` — yorliqlar i18n'dan (`pages.z_report.*`)
  - YANGI testlar: `lib/__tests__/z-report-receipt.test.ts` (8) ·
    `app/print/z-report/[id]/__tests__/z-report-print-page.test.tsx` (8) ·
    `…/z-report-source-parity.test.ts` (6) ·
    `app/(app)/sotuv/__tests__/z-report-print-wiring.test.tsx` (4) ·
    `lib/__tests__/z-receipt-labels-fixture.ts` (fikstura, test emas)
  - `apps/web/src/lib/print-agent.ts` — `printZReportViaAgent()` (Electron native → HTTP agent)
  - `apps/web/src/app/(app)/sotuv/page.tsx` — `usePrintZReport()` hooki; «Smena» yorlig'ida
    `print-z-report` tugmasi; smena yopilgach `print-closed-z-report` tugmasi (id `SotuvPage` da
    saqlanadi, chunki `SalesScreen` yopilish bilan unmount bo'ladi)
  - `apps/web/src/messages/{ru,uz}.json` — `pages.z_report.print.*` (34 kalit) + `pages.sotuv.print_z_report`
  - Mavjud 6 POS test faylida `vi.mock('@/lib/print-agent')` fabrikasiga 1 qatordan qo'shildi
    (+2 qator/fayl, boshqa hech narsa tegilmadi)

- **Qilingan ish:** reja §2/F11 ning 5 bandi. 🔴 Uch renderer bir modeldan chiziladi — xotira
  «Ombor cheki uch renderer» (biri o'zgarsa qolgani jimgina eskiradi) shu sababdan raqam va
  NULL mantig'i `z-report-receipt.ts` da BIR MARTA turadi.

- **Raqamlar ikki manbadan solishtirildimi:** HA, lekin **kod darajasida** (brauzer emas — pastga qara).
  - Manba-1 = `GET /cashier-sessions/:id/z-report` (`cashier-session.service.ts#zReport`) —
    aynan `/retail/sessions/[id]` ekranining `zFull` so'rovi. Chop sahifasi TUSHUM, cheklar soni,
    o'rtacha chek, yalpi foyda, chegirma, qarzga sotilgan, qarz to'lovlari, qaytarish summasi,
    xarajat/inkassatsiya, kutilgan/sanalgan naqd va farqni AYNAN shu maydonlardan oladi.
  - Manba-2 = eski `GET /retail-sales/z-report?sessionId=` — faqat **qaytarishlar SONI** uchun
    (yangi javobda bunday maydon yo'q); ekran ham xuddi shu manbadan oladi.
  - Qulf: `z-report-source-parity.test.ts` (6 test) — (A) ikkala sahifa bir endpointdan va
    15 ta umumiy maydon nomidan o'qishi; chop sahifasida `BigInt(x) ± BigInt(y)` arifmetikasi
    YO'Qligi; (B) `ZReportPayload` ning har maydoni serverning `zReport()` manbasida borligi
    (grounding — xotira «FE fixture server maydonini o'zi to'qiydi»), + qo'riqchi vakuum
    bo'lmasligi uchun maydonlar soni > 20 tekshiruvi.
  - **Ekran bilan MOS KELMAYDIGAN qism (o'lchangan, ataylab tuzatilmagan):**
    `/retail/sessions/[id]` ning `ZFull` interfeysi `openingCashMinor`, `unconvertedByMethod`
    va BARCHA dollar maydonlarini (`openingCashUsdMinor`, `expectedUsdCashMinor`,
    `countedUsdCashMinor`, `varianceUsdMinor`) umuman e'lon qilmaydi — ya'ni ekran ularni
    KO'RSATMAYDI, chop qog'ozi ko'rsatadi. Bundan tashqari ekran `revenueByMethod[].sumMinor`
    ni HAR DOIM smena valyutasi bilan formatlaydi (USD qatori sent sifatida noto'g'ri chiqadi),
    chop qog'ozi esa qator valyutasi bilan. Ekran F11 fayli emas — qarzga yozildi.

- **NULL holati qanday ko'rsatiladi:** uch holat AJRATILGAN va testda qulflangan (12 assert):
  - `null` sanoq → **«sanalmagan»** matni (raqam UMUMAN yo'q — test `not.toMatch(/\d/)` bilan
    tekshiradi); `null` farq → ham «sanalmagan»
  - `'0'` sanoq → «0,00»; `'0'` farq → **«farq yo'q»** (bu ikkisi hech qachon bir xil ko'rinmaydi)
  - normal → raqam; farq ishorasiga qarab «kamomad»/«ortiqcha»
  - `grossProfitMinor: null` (tan narx muzlatilmagan) → **«o'lchanmagan»**, 0 EMAS —
    «100% marja» yolg'onining oldi olinadi
  - `averageReceiptMinor: null` → «—»; qaytarishlar soni manbasi yiqilsa → «—», 0 EMAS
  - Dollar bloki **HAR DOIM** chiziladi (dollar oqimi bo'lmagan smenada ham): Z-hisobot arxiv
    hujjati, «dollar yashigi sanalmagan» fakti qog'ozda ko'rinib turishi kerak.

- **Brauzer o'lchovi:** 🔴 **BAJARILMADI — parallel to'lqin, portlar band (3 faza bir vaqtda);
  QA sessiyasiga qoldirildi.** QA'da `/print/z-report/<id>` ni `/retail/sessions/<id>` bilan
  yonma-yon ochib solishtirilishi kerak bo'lgan raqamlar: **tushum (`revenueMinor`)** ·
  **cheklar soni (`salesCount`)** · **o'rtacha chek** · **yalpi foyda** · **chegirma** ·
  **qarzga sotilgan** · **qabul qilingan qarz to'lovlari** · **qaytarishlar soni va summasi** ·
  **xarajatlar (jami + moddalar bo'yicha)** · **inkassatsiya** · **kutilgan naqd** ·
  **sanalgan naqd** · **farq** · **to'lov turlari kesimi (har qator: tur + valyuta + summa)**.
  Ekranda YO'Q, faqat qog'ozda tekshiriladi: **ochilish qoldig'i (UZS va USD)**, **dollar
  kutilgan/sanalgan/farq**, **kursi yo'q qatorlar**. Alohida: real chek printerida 72mm sig'imi
  va ESC/POS kirill/lotin chiqishi (`renderZReceiptText` 32-ustun cheklovini birlik-test
  qiladi, printer emas).

- **Gate natijasi:**
  - `pnpm --filter @moysklad/money build` — ✅
  - `pnpm --filter @moysklad/api typecheck` — ✅ 0 xato
  - `pnpm --filter @moysklad/web typecheck` — ✅ 0 xato
  - `pnpm biome check <tegilgan yo'llar>` (19 fayl) — ✅ **0 error**; 20 warning —
    hammasi `sotuv/page.tsx` dagi OLDINDAN mavjud `lint/nursery/useSortedClasses`
    (qator raqamlari tekshirildi: mening yangi qatorlarim ro'yxatda YO'Q)
  - `pnpm --filter @moysklad/api test` — ✅ **552 fayl o'tdi, 1 skip, 0 qizil** (7782 test).
    Diqqat: orkestratorning `6ba54150` baseline'ida 4 fayl / 10 test qizil edi (argon2
    timeout, parallel yuk) — bu yugurishda yuk pasaygani uchun hammasi yashil chiqdi.
  - `pnpm --filter @moysklad/web test` — 224/226 fayl yashil, **3 test qizil, HAMMASI
    `Test timed out in 5000ms`** (assertion emas):
    `sotuv/__tests__/sales-screen-shift.test.tsx` (2) + `menejer/_components/comment-template-settings.test.tsx` (1).
    Uchalasi ham **YAKKA yugurtirilganda YASHIL** (tekshirildi: shift fayli 17/17, menejer fayli 4/4).
    Baseline `6ba54150` da web'da 1 qizil bor edi (aynan `sales-screen-shift` › «kirim summasi…»);
    qolgan 2 tasi ham shu sinf — 3 agent + gate bir mashinada parallel yugurgani uchun 5 s chegara.
    **Yangi (baseline'da yo'q) haqiqiy yiqilish YO'Q.**
  - `pnpm i18n:gate` — ✅ 9 test (470 fayl, 12 969 kalit)
  - Yangi testlar: **26** (chek modeli 8 · chop sahifasi 8 · manba-parity 6 · `/sotuv` wiring 4)

- **Commit(lar):** `8ff8e25d` — `feat(kassa): z-hisobot chop sahifasi (/print/z-report)`
  (19 fayl; 19-chisi — hook yozgan `docs/progress.json` metadata, begona ish emas)

- **Kelgusi fazalarga qoldirilgan:**
  1. **`/retail/sessions/[id]` ekrani dollar bloki va `openingCashMinor` ni ko'rsatmaydi**
     (`ZFull` interfeysi eskirgan) — chop qog'ozi ekrandan ko'proq narsa ko'rsatadi.
  2. **O'sha ekran `revenueByMethod[].sumMinor` ni har doim smena valyutasi bilan formatlaydi**
     — USD to'lov qatori sentni tiyin sifatida ko'rsatadi (chop qog'azida to'g'ri).
  3. **Farq aktlari (`variances[]`) chop qog'oziga chiqarilmadi** — ekranda bor. Qog'ozda
     aktlar bloki kerakmi, degan qaror F12 (real kassada QA) ga qoldirildi.
  4. **`printZReportViaAgent` uchun birlik-test yo'q** — `printReceiptViaAgent` da ham yo'q
     (mavjud naqsh); chop yo'lining o'zi `/sotuv` wiring testida mok orqali qulflangan.
  5. Brauzer/printer smoke — yuqoridagi ro'yxat bo'yicha.

- **Yorliq:** **Phase-1: strukturaviy, runtime-tasdiqlanmagan.** Brauzer-smoke YO'Q,
  printer-smoke YO'Q.

### F12 hisoboti

- **Holat:** ⬜ bajarilmagan
- **Sana:**
- **9 ssenariy natijasi:**
- **Topilgan buglar (tuzatilgan / qoldirilgan):**
- **Yorliq o'zgarishi (qaysi fazalar «Phase-2 verified» bo'ldi):**
- **Commit(lar):**
