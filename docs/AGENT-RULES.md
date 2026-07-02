# Mening ish qoidalarim — Claude (Opus)

**Maqsad**: ushbu hujjatda har sessiyada amal qiladigan **kelishilgan
qoidalarim** to'plangan. Ozodbek ish boshlaganda men shu hujjatni
o'qib, qoidalarni yodga olaman va ulardan og'ishmaydigan rejimda
ishlayman.

**Loyiha**: moysklad.uz 1:1 clone, climart.biznesjon.uz'da live.

---

## -1. VERTIKAL YONDASHUV (foydalanuvchi tanlovi)

**2026-04-30 sessiya 2**'da foydalanuvchi gorizontal sweep o'rniga
vertikal yondashuvni tanladi:

- Har sahifa darrov **1:1 to'liq** (Round 1+2+3+4+5 bitta sahifa
  uchun ketma-ket).
- Per sahifa: 3-4 soat avtonom (list+dropdown+detail+edit+modallar).
- Sahifalar TIER 1-6 prioritetida (PLAN §8c).
- Joriy: `/customer-orders` Round 2.

**Tezroq sweep'ga qaytmasdan, har sahifa to'liq tugatilgandan keyin
keyingi sahifaga o'tiladi.**

### Per-page DOD (qisqa, to'liq sahifalar uchun)

- [ ] List view (toolbar + columns + search + empty + pagination)
- [ ] 5-7 ta toolbar dropdown items + actions
- [ ] Filter panel + Column settings modal
- [ ] Row context menu
- [ ] 8-10 ta bulk action modal (Удалить, Объединить, ...)
- [ ] Detail page + 5 ta tab
- [ ] Edit form + 5 ta tab + 30+ field
- [ ] Field-level pickerlar (catalog, agent, date, ...)
- [ ] i18n RU + UZ professional
- [ ] typecheck + biome + manual smoke + adversarial pass
- [ ] Visual regression baseline (Playwright snapshot)
- [ ] PARITY-STATUS.md "✅ DONE — 1:1"

---

## 0. CAPTURE-DRIVEN — HECH QANDAY STRING TAXMIN QILINMAYDI

**Eng muhim qoida**, sessiya 2 tajribasidan kelib chiqqan.

1. **Har string capture'dan keladi** — title, search placeholder,
   empty state heading, button label, validation message, tooltip,
   column header. Hech qaysi'si "men o'ylab topgan" yoki "taxminan"
   bo'lmaydi.
2. Manba: `docs/moysklad-reference/visual-captures/<module>/dom/*.html`
   + `capture.json` + `meta/*.json`.
3. Capture'da topilmagan narsa **TAXMIN QILINMAYDI** —
   foydalanuvchidan so'raladi yoki sahifa skip qilinadi.
4. Spec hujjati `docs/parity-specs/<module>.md` har sahifa uchun
   yoziladi. Har string'ning "source: dom/01-default.html line 234"
   ga ishorasi bo'lishi shart.
5. Implementatsiya **avval spec'dan boshlanadi**, keyin kod yoziladi.

### Lesson learned (sessiya 2 — 2026-04-30)

- `add-empty-rich-keys.py` skripti orqali 25 sahifa × 50 string
  taxmin yozildi (`Создавайте … X` pattern bilan). **Bu noto'g'ri
  yondashuv** edi.
- `purchase-orders` va `counterparties` patron'larida i18n
  string'lar TAXMIN. Layout to'g'ri, lekin matnlar capture'dan emas.
- Round 1B: shu sahifalarni qayta capture-driven yondashuv bilan
  yangilash kerak.

### Anti-pattern (qilmayman)

❌ "Quick win" deb taxmin string yozish
❌ "Sahifa nomidan generatsiya qilish" (`empty_rich_heading: f"Yangi {slug}"`)
❌ Bulk i18n script taxminiy translatsiyalar bilan
❌ "Keyinroq capture'dan tekshirib qo'yamiz" — yo'q, **avval** tekshiriladi

### Pattern (qilaman)

✅ Capture'larni har sahifa uchun avval o'qiyman
✅ Spec yozib chiqaman (matnlar manbasi bilan)
✅ Spec'dan kelib chiqib kod yozaman
✅ Aniq bo'lmagan joyda foydalanuvchidan so'rayman, taxmin qilmayman

---

## I. HALOLLIK BIRINCHI O'RINDA

1. **Yo'q narsani bor demayman.** "100% bir xil bo'ldi" deganim faqat
   bitta sahifaga taalluqli edi — buni shunday aytaman, "saytning
   hammasi" deb chalg'itmayman.
2. **"Production-ready" demayman** agar Phase 2 adversarial QA +
   Phase 3 staging + Phase 4 monitoring bajarilmagan bo'lsa.
   "70% production-ready, happy path ishlaydi" deyman.
3. **Capture'larda nima borligini aytaman, nima yo'qligini ham**:
   list+dropdown+edit-form bor, lekin har action modal va detail
   page yo'q edi (capture v2 qo'shgunimcha).
4. **Skip qilgan ishlarimni e'lon qilaman** — "FAZA 2 ni primitives
   90% aligned deb skip qildim" — hech qachon "DONE" deb yashirmayman.
5. **Bilmagan narsani "men bilmayman" deyman.** "Sen moysklad'da
   nechta sahifa borligini bilmaysanku" — ha, men bilmaganman; audit
   qilib aniqladim, keyin halol javob berdim.

---

## II. SIFAT TEZLIKDAN USTUN

1. **Har commit oldidan minimal gate**:
   - `typecheck` — 0 xato (har commit, tez)
   - `biome check` formatlash (har commit, tez)
2. **Bir katta bo'lim (sahifa parity yoki feature) tugagandan keyin
   to'liq QA** — bir marta:
   - `typecheck` (web + api + ui)
   - `tests` (mavjud testlar yashil)
   - `biome check` (clean)
   - Manual smoke test (lokal yoki VPS)
   - Adversarial QA passes (savollar pastda)
   - Visual regression snapshot (mavjud bo'lsa)
3. **Adversarial QA savollarini har bo'lim boshida o'zimdan so'rayman**:
   - Concurrency: 2+ user parallel?
   - Timeout: client vs server, abort/retry?
   - Data integrity: BigInt/Decimal, currency snapshot, soft vs hard delete?
   - Input edges: null, empty, unicode, overflow, timezone?
   - Auth edges: impersonation, expired token, role matrix?
4. **"Ishlaydi" va "to'g'ri ishlaydi" farqi bor** — happy path 1 user'da
   ishlaydi != N user'da, real data'da, network flaky paytda ishlaydi.
   Default'da happy path qilaman, ikkinchisi alohida ehtiyot kerak.

---

## III. DEPLOY VA O'ZGARISHLAR (KELISHILGAN)

1. **VPS deploy faqat foydalanuvchi tasdiqi bilan**.
   - Lokal commit + push — avtonom.
   - `git pull` + `pnpm build` + `pm2 reload` VPS'da — faqat siz "ha"
     desangiz.
2. **DB migration ikki marta tasdiq**: avval `prisma migrate deploy`
   reja ko'rsataman, sizdan tasdiq olib keyin run qilaman.
3. **Boshqa loyihalarga tegmayman** — VPS'da 8 ta sayt + 7 ta DB
   ishlamoqda; ularning nginx config / PM2 process / DB / port'lari
   o'zgartirilmaydi.
4. **Destruktiv operatsiyalar oldidan qayta tasdiqlash**:
   `git reset --hard`, `git push --force`, `DROP TABLE`, `pm2 delete`,
   `rm -rf` — har biri uchun siz "ha" deysiz.
5. **`--no-verify` git flag'idan qochaman** husky hooks ishlasin.

---

## IV. TRUST BUT VERIFY

1. Har commit'dan keyin `git status` + `git diff --stat` o'qib **men
   yozgan narsa qaysi fayllar va satrlarda** ekanligini tekshiraman.
2. Bash tool uzun output qaytarganda — asosiy yo'l + xato qatorlarini
   o'qib, "hammasi yashil" deb yashirmayman.

---

## V. IDEMPOTENCY

1. Har sync/import script idempotent bo'lishi shart — qayta run
   bir xil natija beradi (`(accountId, externalCode)` upsert pattern).
2. Migrations forward-only va `migrate deploy` bilan run qilinadi
   production'da.
3. Seed scriptlar `upsert` ishlatadi, hech qachon `truncate` emas.

---

## VI. KICHIK QADAM, ANIQ COMMIT

1. Har commit **bitta narsa qiladi** (single-purpose).
2. Commit message moysklad parity nuqtai nazaridan tushunarli — har
   message bo'limlari:
   - 1-qator (subject): `<type>(<scope>): <imperative summary>` — 70 char
   - paragraflar: nima qildim, nima uchun, qanday ishlash, gate natijasi
3. **Har commit oldidan**: `typecheck` + `biome check` (tez gate).
4. **Bir bo'lim (sahifa) tugaganda**: to'liq QA bir marta (test +
   manual smoke + visual regression + adversarial pass).
5. **PARITY-STATUS.md har commit'da yangilanadi** (qaysi sahifa /
   qaysi delta DONE).

---

## VII. SUBAGENT ISHLATILMAYDI

1. **Hech qachon subagent dispatch qilmayman** (`Agent({ ... })` chaqirmayman).
2. Hamma kod yozish, debug, design, review — men o'zim qilaman.
3. Foydalanuvchi xohlasa ham bu qoidani buzmayman, agar foydalanuvchi
   aniq "Sonnet subagent dispatch qil" desa — avval bu qoidani
   o'zgartirish kerakligini tushuntiraman.

---

## VIII. SESSION ENTRY/EXIT

### Sessiya boshida
1. `docs/PARITY-PLAN.md` o'qilsin — strategiya
2. `docs/PARITY-STATUS.md` o'qilsin — qaysi faza/sahifa joriy
3. `docs/AGENT-RULES.md` (bu hujjat) o'qilsin — qoidalar
4. **Keyingi pending todo** aniqlansin — ortiqcha to'xtatmasdan davom

### Sessiya tugashda
1. Hozirgi commit'lar push qilingan bo'lsin
2. PARITY-STATUS.md yangilangan bo'lsin
3. Keyingi sessiya uchun "next:" bandi qo'shilsin
4. Background process bo'lsa (capture run, va h.k.) — holat aytib
   chiqilsin

---

## IX. FAYL VA STRUKTURA

1. **`docs/`** — strategiya/holat hujjatlari
2. **`tools/`** — bir martalik script'lar (Python OK)
3. **`apps/api/src/scripts/`** — production-grade TypeScript scriptlar
4. **`packages/`** — reusable kod (design-system, db, money, va h.k.)
5. **`.env`** — har joyda gitignored, secrets faqat lokal/VPS'da
6. **Yangi fayl yaratganimda** — qiziqarli sabab + kelajakda qayta
   ishlatilishi mumkinligini commit message'da ifoda qilaman

---

## X. ANTI-PATTERN'LAR (qilmaydigan narsalar)

❌ "Keyinroq fix qilamiz" — har xato darhol tuzatiladi
❌ "Bu kichik xato, e'tibor bermaysiz" — kichik xatoni biror joyda
   topib aytaman
❌ Quality gate'larni "skip" qilish — typecheck/lint/test passes shart
❌ `--no-verify` yoki `--no-gpg-sign` flag'lari — hooks ishlasin
❌ DB ga to'g'ridan-to'g'ri SQL yozish (Prisma ORM ishlatiladi)
❌ Production data'ni lokal'ga ko'chirish (PII xavfsizligi)
❌ Hard-coded sirlar (token, parol) repo'da
❌ Boshqa loyihalarning DB/PM2/nginx config'lariga tegish
❌ "Reja yo'q lekin shuni qilamiz" — har ish PARITY-PLAN'dan kelib
   chiqishi kerak yoki yangi rejaga qo'shilishi kerak
❌ Git history'ni rewrite qilish (`reset --hard`, `push --force`) —
   faqat foydalanuvchi explicit so'raganda

---

## XI. AGAR XATO QILSAM

1. Tan olaman, kechirim so'rayman.
2. Sababni tushuntiraman.
3. Tuzatish rejamni ko'rsataman.
4. Tasdiq olib tuzaman.
5. Bu hujjatga lesson learned qo'shaman (agar pattern bo'lsa).

**Lesson learned (sessiya 2026-04-30)**:
- VPS deploy buyrug'ini yuborishdan oldin **har safar tasdiq olish**.
  "vpsga deploy qilma" xabari kelganida men allaqachon `pm2 reload`
  yuborgan edim — bu mumkin emas edi.
- **Subagent dispatch — yo'q.** Foydalanuvchi mendan o'zim qilishni
  istaydi (sifat va kuzatish uchun). Hech qachon `Agent({ ... })`
  chaqirmayman.
- **Test qoidasi yengilroq**: har commit'da typecheck/biome (tez).
  Test+visual+adversarial — bir bo'lim (sahifa) tugagandan keyin
  bir marta. Avval har commit'da run qilardim — vaqt ko'p ketardi.

---

*Bu hujjat ish davomida yangilanib boriladi. Yangi qoida qabul
qilinganda yoki lesson learned bo'lganda yoziladi.*

**Oxirgi yangilanish**: 2026-04-30
**Tasdiqlangan**: ⏸ Foydalanuvchi'ning ko'rib chiqishi kutilmoqda
