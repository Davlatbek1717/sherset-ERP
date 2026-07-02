# CLAUDE.md — moysklad loyiha qoidalari (har sessiya auto-loaded)

> Bu fayl global `~/.claude/CLAUDE.md` ustiga loyiha-spetsifik qoidalar qo'shadi.
> Asosiy hand-off — `NEXT.md` (har sessiya `davom et` da o'qiladi). Bu yerda faqat
> **doim amal qiluvchi** loyiha qoidalari turadi.

## 0. Ish rejimi — `davom et` = fokus-sessiya · juda sifatli · OPUS (Sonnet EMAS) (2026-06-07; 2026-06-11d tahriri)

**Bu qoida global `~/.claude/CLAUDE.md` dagi «think with Opus, type with Sonnet» ni bu loyiha uchun BEKOR qiladi.**
2026-06-11d foydalanuvchi qarori: limit 1 kunda 3 kunlik ketayotgani uchun **token-iqtisod kiritildi, LEKIN tejash
modeldan EMAS** («ozish sonnetdan emas — doim Opus») va sifat o'lchovlaridan EMAS:

1. **OPUS'da ishla — Sonnet EMAS** (2026-06-11d da QAYTA tasdiqlangan). Subagent va Workflow fan-out agentlari ham
   Opus (`model: 'sonnet'` UZATMA; model'ni qoldir = inherit). Mexanik ish uchun esa eng avval **deterministik
   script/codemod** (0 token, 11b sabog'i: extractor > fan-out) — agent faqat hukm talab joyda.
2. **Juda yuqori sifat** — odatiy gate'lar + adversarial QA + runtime verifikatsiya, qisqartirish yo'q. Sifat hech
   qachon kenglik uchun qurbon qilinmaydi.
3. **Sessiya hajmi = 1 flagship (+1 mayda) → commit → sessiya YOPILADI** (2026-06-11d; eski «bir necha ish»
   marafonlari bekor — kontekst xarajati sessiya uzunligi bilan ~kvadratik, 11b'da recon sessiya-limitida o'lib qayta
   to'langan). Kenglik endi sessiyalar SONI orqali — NEXT.md hand-off har birini arzon boshlatadi.
4. **Pre-flight = `node scripts/preflight.mjs`** (deterministik, ~0 token); session-start-audit workflow (3-4 agent,
   ~250–320k token — jonli o'lchangan) **faqat script ANOMALIYA chiqarsa**.
5. **Agentlar to'liq test-suite yugurtirmaydi** — to'liq gate markazda, commit-nuqtada 1 marta. **Ultracode/Workflow —
   kerakli joyda** (haqiqiy ko'p-birlik fan-out), har turn'da emas. Katta tool-output → faylga, kontekstga emas.

## 1. Audit ikki fazali — Phase 1 (konveyer) ≠ Phase 2 (QA)

Detail/list parity-audit ishi **ikki alohida fazaga** bo'linadi. Ularni aralashtirmaslik shart.

### Phase 1 — Audit konveyeri (har «davom et» sessiyasi shuni qiladi)
- **Maqsad**: *strukturaviy parity* — moysklad'ga nisbatan sahifada to'g'ri maydon/label/xulq/wiring bormi (diff + sibling-parity + adversarial blind-verify workflow).
- **Asosiy usul = COHORT-DVIGATEL** (`scripts/wf-cohort-detail-audit.js`): har «davom et» `NEXT.md` → «Cohort audit navbati»dan keyingi cohort'ni oladi va dvigatel bilan ishlaydi — **premise** (referensni auto-correct + bias immunize: o'z brief'imdagi xatoni mashina tutadi) → per-page **diff** → **completeness critic** (sibling-diff ko'rmaydigan intrinsik/runtime buglar) → har confirmed/critic kandidat **blind-verify** (refute-default). Self-vetting — operatorning og'ir review'i shart emas. **Har confirmed delta ground-truth bilan o'zim tekshiriladi** (ko'r-ko'rona qo'llanmaydi); mexanik fix → Sonnet codemod. *(Dvigatel `buyPrice` runtime bug-class'ini topdi — 4 strukturaviy audit ko'rmagan: `066d55fb`.)*
- **Gate (majburiy)**: typecheck 0 · biome 0 · i18n key-existence ru+uz + no-hardcoded · web Vitest (regress yo'q).
- **Status yorlig'i (MAJBURIY, HALOL)**: natija har doim **«Phase-1: strukturaviy audit, runtime-tasdiqlanmagan»** deb belgilanadi. Commit/NEXT.md'da **«browser-smoke YO'Q»** ochiq yoziladi.
- **TAQIQ**: audit-fix'ni hech qachon **«done» / «production-ready» / «verified»** demaslik. Faqat **«Phase-1 complete»**. Bu — «yashirin caveat» muammosini ildizdan yopadi: qarz ko'rinib turadi, kutilmagan emas.
- Konveyer **to'xtamaydi** — Phase 2 uchun har sahifada browser ko'tarilmaydi.

### Phase 2 — QA sessiyasi (alohida, COHORT bo'yicha)
- **Qachon**: mantiqiy guruh (cohort) tugaganda — masalan «barcha hujjat-detail», keyin «barcha katalog», keyin «retail/processing». **«Hammasini 63 oxirida» QILMASLIK** (sovuq-kontekst debug = qimmat). Cohort ~8–12 sahifa.
- **Maqsad**: *runtime correctness* — real brauzer + adversarial QA (global CLAUDE.md'dagi concurrency / timeout / data-integrity / edge / authorization savollari), nafaqat «render bo'ldimi».
- **Stack** (bu yerda ishlaydi): DB = PostgreSQL `moysklad_dev` @ `localhost:5433` (103+ migration, up-to-date) · `pnpm dev` (turbo --parallel: api `tsx watch`, web `next dev`) · seed `pnpm db:seed` / `seed-real`. Playwright MCP mavjud.
- **Natija**: cohort sahifalari status **«Phase-1» → «Phase-2 verified»**ga o'tadi; topilgan buglar darhol (issiq-kontekst) tuzatiladi.
- **QA-backlog** (qaysi cohort kutmoqda) — `NEXT.md` → «QA-backlog (Phase 2)» bo'limida.
- **Istisno (inline qoladi)**: mavjud Playwright e2e spec (`apps/web/tests/e2e/*.spec.ts`) qoplagan runtime o'zgarish — o'sha spec'ni yangilash/yugurtirish Phase 1'da qoladi (regress'ni darhol tutadi).

## 2. Konfabulyatsiyaga qarshi — tasdiqlanmagan ≠ fakt

- **Tasdiqlay olmagan narsani «fakt» deb aytmayman.** Avval tekshiraman (fayl/git/transkript), keyin da'vo qilaman.
- «Eslayman» / «kontekstimda bor» degan ichki his — dalil EMAS. Faqat shu sessiyada ko'rinadigan tool-natija dalil.
- Adabiy misol: «~40 xotira fayli o'chdi» (2026-06-03b) — bu **tasdiqlanmagan** edi, hech qachon takrorlanmasin. Noaniqlikni «muammo» deb shov-shuv qilishdan oldin verifikatsiya.

## 3. Xotira (memory) gigienasi

- `MEMORY.md` (memory dir) — har sessiya auto-loaded indeks; har session natijasi 1 qatorli pointer bilan qo'shiladi.
- Loyihaning asl/to'liq hand-off'i — `NEXT.md`. Ikkalasi sinxron turishi kerak (count'lar, oxirgi audit).

## 4. Label grounding intizomi (2026-06-04 — capture-grounding bug-class)

**Muammo (real):** RU label tanlashda capture'ni «grep-count» bilan «grounded» deb da'vo qilib, NOTO'G'RI yozildi.
Misol: variant buy-price `«Себестоимость»` deb belgilandi («capture-grounded» deyildi) — aslida u promo-banner so'zi
(`«Маржа и Себестоимость»</p>`), field label EMAS; to'g'risi `«Закупочная цена»`. Xuddi shu klass: counterparty
`«Поставщик»/«Покупатель»` (aslida `«Контрагент»`), kassa-order `«Назначение платежа»` (aslida `«Основание»`),
`«Срок оплаты»` (aslida `«План. дата оплаты»`), retail `«Изъятие»` (aslida `«Выплата»`). **Hech bir gate label
qiymati moysklad bilan mosligini tekshirmaydi** (tc/biome/i18n-key/no-hardcoded faqat mavjudlik/Cyrillic).

**MAJBURIY intizom — har label o'zgartirilganda:**
1. **DOM-rol o'qi, grep-count EMAS.** Capture DOM'da so'z **element kontenti** sifatida (`>LABEL<`, `gwt-Label">LABEL</div>`,
   yoki column-header `title="LABEL"`) turibdimi — shu fieldning labeli ekanini tasdiqla. Banner/help-text/boshqa-field
   ichidagi `«…LABEL»` = grounding EMAS. Grep soni (×1) hech narsa isbotlamaydi.
2. **Capture'da umuman yo'q bo'lsa** (sibling-mirror holati) → **products-reference** terminini ol (parity baseline),
   taxmin qilma. Ikkilanish bo'lsa — **DEFER + hujjatla**, ko'r-ko'rona yozma.
3. **Element-rol vs hujjat/menyu/kolonka nomini farqla:** `«Поставщик»/«Покупатель»` = hujjat/menyu/kolonka nomlari;
   **field label har doim `«Контрагент»`** (universal). `«Принято»` = positions kolonka; `«Получено»` ≠ moysklad termini.

**Guard (avtomat):** `apps/web/src/__tests__/label-grounding.test.ts` — (1) GROUNDING-LOCK: curated `capture→label`
registry, har label `>LABEL<` field-rolда turishini tekshiradi (banner-bug'ni tutadi); (2) REGRESSION-LOCK: tuzatilgan
qiymatlar + page-wiring qaytib buzilmasligi. **Yangi audited label'ni shu registry'ga qo'sh** (avval DOM-rol tasdiqlab).

**Re-runnable audit:** `scripts/wf-label-grounding-audit.js` (workflow) — har cohort tugagach yoki shubha bo'lsa,
audited sahifalarning capture-grounded label'larini DOM-kontekst bo'yicha qayta-tekshiradi (agent grep-count emas,
element-rol o'qiydi). Cohort F'dan keyin ishga tushirilib, A–E'da 8+ misground label topdi (`5ee9b314` tuzatildi).
