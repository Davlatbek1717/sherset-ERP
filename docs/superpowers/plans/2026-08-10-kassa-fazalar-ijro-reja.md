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

- **Holat:** ⬜ bajarilmagan
- **Sana:**
- **O'zgargan fayllar:**
- **Qilingan ish:**
- **Testlar (raqam bilan):**
- **Brauzer o'lchovi (5 qadam):**
- **Gate natijasi:**
- **Commit(lar):**
- **Kelgusi fazalarga qoldirilgan:**
- **Yorliq:**

### F2 hisoboti

- **Holat:** ⬜ bajarilmagan
- **Sana:**
- **O'zgargan fayllar:**
- **Qilingan ish:**
- **Shartnoma-testi nimani qo'riqlaydi:**
- **Qo'lda o'lchash natijasi:**
- **Gate natijasi:**
- **Commit(lar):**
- **Kelgusi fazalarga qoldirilgan:**
- **Yorliq:**

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

- **Holat:** ⬜ bajarilmagan
- **Sana:**
- **O'zgargan fayllar:**
- **Qilingan ish:**
- **Installer yig'ildimi (buyruq + natija):**
- **Deploy uchun kerakli qadamlar:**
- **Gate natijasi:**
- **Commit(lar):**
- **Kelgusi fazalarga qoldirilgan:**
- **Yorliq:**

### F5 hisoboti

- **Holat:** ⬜ bajarilmagan
- **Sana:**
- **O'zgargan fayllar:**
- **Qilingan ish:**
- **Testlar (qaysi xulqni qo'riqlaydi):**
- **Brauzer o'lchovi (summa/kurs/natija):**
- **Uchala chek renderer holati:**
- **CashDesk dollar qarzi:**
- **Gate natijasi:**
- **Commit(lar):**
- **Kelgusi fazalarga qoldirilgan:**
- **Yorliq:**

### F6 hisoboti

- **Holat:** ⬜ bajarilmagan
- **Sana:**
- **O'zgargan fayllar:**
- **Qilingan ish:**
- **Schema guard'lari:**
- **Qarz daftariga ta'siri qanday tekshirildi:**
- **Smena USD hisobiga ta'siri:**
- **Brauzer o'lchovi:**
- **Gate natijasi:**
- **Commit(lar):**
- **Kelgusi fazalarga qoldirilgan:**
- **Yorliq:**

### F7 hisoboti

- **Holat:** ⬜ bajarilmagan
- **Sana:**
- **O'zgargan fayllar:**
- **Qilingan ish:**
- **Allowlist'ga qo'shilgan aniq yo'llar:**
- **Ruxsat qanday berildi (prod qadami):**
- **Rezerv qanday o'lchandi:**
- **Brauzer o'lchovi:**
- **Gate natijasi:**
- **Commit(lar):**
- **Kelgusi fazalarga qoldirilgan:**
- **Yorliq:**

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

- **Holat:** ⬜ bajarilmagan
- **Sana:**
- **O'zgargan fayllar:**
- **Qilingan ish:**
- **Raqamlar ikki manbadan solishtirildimi:**
- **NULL holati qanday ko'rsatiladi:**
- **Brauzer o'lchovi:**
- **Gate natijasi:**
- **Commit(lar):**
- **Kelgusi fazalarga qoldirilgan:**
- **Yorliq:**

### F12 hisoboti

- **Holat:** ⬜ bajarilmagan
- **Sana:**
- **9 ssenariy natijasi:**
- **Topilgan buglar (tuzatilgan / qoldirilgan):**
- **Yorliq o'zgarishi (qaysi fazalar «Phase-2 verified» bo'ldi):**
- **Commit(lar):**
