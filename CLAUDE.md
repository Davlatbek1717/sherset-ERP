# CLAUDE.md — moysklad loyiha qoidalari (har sessiya auto-loaded)

> Bu fayl — loyihaning yagona doimiy qoidalar fayli (global `~/.claude/CLAUDE.md` MAVJUD EMAS — unga ishora qilma).
> Asosiy hand-off — `NEXT.md` (har sessiya `davom et` da o'qiladi). Bu yerda faqat
> **doim amal qiluvchi** loyiha qoidalari turadi.
> Slash-commandlar: `/davom` (fokus-sessiya) · `/deploy` (VPS deploy) · `/qa-cohort` (Phase-2 QA) — `.claude/commands/`.

## 0. Ish rejimi — `davom et` = fokus-sessiya · juda sifatli · OPUS (Sonnet EMAS) (2026-06-07; 2026-06-11d tahriri)

**«Think with Opus, type with Sonnet» uslubi bu loyihada AMAL QILMAYDI — doim flagship model.**
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
- **Maqsad**: *runtime correctness* — real brauzer + adversarial QA (concurrency / timeout / data-integrity / edge-case / authorization savollari), nafaqat «render bo'ldimi».
- **Stack** (bu yerda ishlaydi): DB = PostgreSQL **`climart_adopt` @ `localhost:5432`** — bu repo
  `packages/db/.env` da shu turibdi. *(2026-08-02 tuzatildi: bu yerda ilgari `moysklad_dev` @ `5433`
  yozilgan edi — 5433 portida hech narsa TINGLAMAYDI, tekshirildi. Eski qiymat bir sessiyani
  adashtirdi. Xotira: `climart-adopt-local-db-untracked.md`.)* · `pnpm dev` (turbo --parallel: api
  `tsx watch`, web `next dev`) · seed `pnpm db:seed` / `seed-real`. Playwright MCP mavjud.
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

## 5. Loyiha xaritasi (2026-07-04 — qidirishdan oldin shu yerga qara)

pnpm/turbo monorepo (MoySklad-klon ERP). Kod izlashda avval shu xaritadan joyni aniqlab ol:

```
# APPS
apps/api                       — NestJS backend (REST + Prisma); main.ts bootstrap, observability.ts logging
apps/api/src/modules/*         — ~130 domain modul, har biri .controller/.service/.schema/.test.ts (testlar co-located)
   moysklad-sync               — MoySklad'dan jonli import/sync · moysklad-compat — MS JSON API moslik qatlami
   money, payment-in/out, cash-in/out, cash-desk, exchange-rate, currency — pul/kassa
   product, variant, bundle, bom, stock, store, move, enter, loss, inventory — tovar/ombor
   customer-order, demand, invoice-in/out, purchase-order, supply, retail-sale — savdo hujjatlari
   counterparty*, contract, contact-person — kontragentlar · auth, permissions, organization, hr, payroll
   sklad-keeper                — CompanySettings CRUD + omborchi/print sozlamalari
   task, pipeline, opportunity, call, service-desk — CRM
apps/web                       — Next.js App Router frontend (dev port 3100, prod 3010)
apps/web/src/app/(app)/*       — ~90 ERP route; sotuv/ = custom POS sahifa; retail/ = MS-parity chakana (sales/sessions/z-report)
apps/web/src/app/(app)/settings/* — sozlamalar · app/{login,print,p,actions} — auth/chop/public/server-actions
apps/web/src/components/*      — domain UI (pos/, print/, money/, filters/, document-detail/…)
apps/web/src/lib               — api-client.ts, auth-store.ts, print-agent.ts, doc-totals.ts
apps/web/src/messages/{ru,uz}.json — i18n tarjimalar (next-intl config: src/i18n)
apps/web/tests/e2e             — Playwright e2e
apps/marketing                 — alohida marketing sayti

# PACKAGES
packages/money                 — @moysklad/money: pul/valyuta/kurs mantiq (WEB'DAN OLDIN build!)
packages/db                    — @moysklad/db: prisma/schema.prisma (yagona sxema, CompanySettings shu yerda),
                                 prisma/migrations (155+), seed*.ts; src/generated — Prisma client
packages/design-system         — @moysklad/ui React primitivlar · packages/workflows — data-model/CLI · packages/config — tsconfig

# SCRIPTS / TOOLS / QOLGANLAR
scripts/preflight.mjs          — sessiya-boshi deterministik tekshiruv (SessionStart hook yugurtiradi)
scripts/snapshot-staged.mjs    — pre-commit: stage ro'yxatini yozadi (§6.7 B)
scripts/verify-commit-contents.mjs — post-commit: commit tarkibi stage bilan mos kelganini tekshiradi
scripts/audit-module*.ts       — audit dvigateli · capture-moysklad-*.ts — MS reference capture
scripts/wf-*.js                — workflow skriptlar (cohort-detail-audit, label-grounding-audit…)
scripts/cert-*.mjs, ground-*.mjs, verify-* — bir-martalik sertifikatsiya/grounding skriptlar (graveyard)
tools/print-agent              — Windows print agent (.ps1/.bat) · tools/{capture,extract-i18n,admin}
deploy/                        — nginx conf + pm2 ecosystem.config.cjs + DEPLOY-sherset.md
desktop/                       — Electron desktop o'rami · docs/ — roadmap/ADR/arxivlar · audit/ — parity audit natijalar
turbo.json · biome.json · pnpm-workspace.yaml · tsconfig.base.json — monorepo config
```

## 5.5. Jonli OMBOR/QOLDIQ/KASSA ma'lumotiga tegishdan oldin (2026-08-24 — MAJBURIY)

Jonli bazadagi ombor tuzilmasi, qoldiq yoki kassa xulqini o'zgartiradigan ish
(split, ko'chirish, prioritet, hisobdan chiqarish, kaskad sozlamasi) boshlanishidan
oldin **`docs/plans/2026-08-24-split-kassa-hodisasi.md`** to'liq o'qiladi.
Sabab: 2026-08-23 dagi ombor-split kassani 46 daqiqa to'xtatib qo'ygan (eng shiddatli
savdo soatida), tovar POS yeta olmaydigan omborga ko'chgani uchun.

Majburiy qoidalar (kanonik matn: `docs/plans/2026-08-23-ombor-restrukturizatsiya.md`
2-bo'lim, 10–14-bandlar): (10) ikki tomonlama bog'liqlik — F va G rejalarni ikkalasini
o'qi, hisobotda «bu nimani buzishi mumkin?» savoliga yozma javob ber; (11) bajarilmagan
qabul mezoni bilan faza YOPILMAYDI; (12) jonli skriptning teskarisi o'sha sessiyada
yoziladi va sinaladi; (13) o'zgarishdan keyin uchma-uch smoke — sotuv + sanash +
ko'chirish (sahifa 200 YETARLI EMAS); (14) VPS'da yozilgan skript o'sha kuni git'ga.

Jonli holatning kutilayotgan reyestri: `docs/ops/jonli-holat.md`
(tekshirish: `packages/db/scripts/warehouse-state.ts`).

## 6. Parallel sessiyalar protokoli (2026-07-04 — MAJBURIY)

Bir vaqtda bir nechta Claude sessiyasi ishlashi mumkin. Halaqit bermaslik qoidalari:

1. **Seniki bo'lmagan o'zgarishlarga TEGMA.** Preflight dirty-tree ko'rsatsa va u fayllarni SEN o'zgartirmagan
   bo'lsang — bu parallel sessiyaning faol ishi: o'qish mumkin, yozish/stash/revert/`git checkout --` TAQIQ.
2. **Faqat aniq yo'llar bilan stage.** `git add <aniq fayllar>` — hech qachon `git add -A` / `git add .` /
   `git commit -a` (hook mexanik bloklaydi: `scripts/hook-git-add-guard.mjs`). Commit'dan oldin `git status --short`
   bilan staged ro'yxatda FAQAT o'z fayllaring ekanini tasdiqla. Diqqat: lint-staged commit paytida butun tree'ni
   stash qiladi — parallel sessiya commit qilayotgan payt commit BOSHLAMA (ketma-ket).
3. **NEXT.md entry kolliziyasi:** sana+harf yorlig'ini yozishdan oldin band harflarni tekshir (`grep` sana bo'yicha),
   keyingi bo'sh harfni ol. Edit «modified since read» xatosi bersa — qayta o'qib faqat o'z qo'shimchangni kirit.
4. **Umumiy resurslar bir vaqtda bitta sessiyada:** `prisma migrate`/`db:seed` (lokal 5433 yoki prod), `pnpm dev`
   portlari (3100/4000), VPS deploy + `pm2 restart`. Port/lock band bo'lsa — jarayonni o'ldirib qayta ochish EMAS,
   avval parallel sessiya ishlatayotgan bo'lishi mumkinligini hisobga ol (userdan so'ra).
5. **Katta/uzoq mustaqil ish → worktree izolyatsiyasi** (EnterWorktree yoki Agent `isolation: worktree`) — jismonan
   alohida checkout, merge git orqali. Bir checkout'da faqat path-kesishmaydigan ishlar parallel yuradi.
6. **Diff'ing path-cheklangan bo'lsin**; parallel sessiya ishini ko'rgan bo'lsang NEXT.md entry'ingda qayd et
   («parallel sessiya X qildi, diff'im path-cheklangan» uslubida).

### 6.7 Git vositalari BUTUN daraxtda ishlaydi — ikki real hodisa (2026-08-02)

Bir sessiyada ikki marta ish buzildi. Ikkalasining ham sababi bitta: `lint-staged` ham,
`git reset --hard` ham **kim ishga tushirganidan qat'i nazar butun ish daraxtiga** ta'sir qiladi.
§6.2 dagi «bir vaqtda commit qilmang» buni to'liq qoplamaydi.

**A. `git reset --hard` / `fetch + reset` — BOSHQANING ishini o'chiradi. 🔴 ENG XAVFLISI.**
Reflog: `HEAD@{1}: reset: moving to FETCH_HEAD`. Bu bir amal bilan (a) boshqa sessiyaning **commit
qilinmagan** 7 fayldagi tahririni va (b) allaqachon qilingan **commit'ini** yo'q qildi. Faqat
*untracked* yangi fayllar omon qoldi. Git'da `pre-reset` hook YO'Q — buni faqat qoida to'xtatadi:
- **Umumiy checkout'da `reset --hard`, `checkout -- .`, `clean -fd`, `stash` — TAQIQ**, agar
  daraxtda sen yaratmagan o'zgarish bo'lsa. Avval `git status --short` bilan ko'r.
- Remote bilan sinxronlash kerak bo'lsa: `git pull --rebase` yoki `fetch` + **`merge`** ishlat;
  `reset --hard FETCH_HEAD` faqat daraxt **toza** bo'lganda va o'z commit'ing yo'qolmasligi
  tekshirilgandan keyin.
- **Uzoq ishni commit qilinmagan holda ushlab turma** — bosqichma-bosqich commit qil («qatlam
  qo'shildi» → «chaqiruvchilar ko'chirildi»). Bir soatlik tahrir bir `reset --hard` bilan ketadi.
- Yo'qotish bo'lsa: `git reflog` sababni aniq ko'rsatadi. Commit qilinganini `git reset --hard <hash>`
  yoki `cherry-pick` bilan tiklash mumkin; commit qilinmaganini — **yo'q**, qayta yozish kerak
  (deterministik skript bilan: anchor topilmasa to'xtaydi, «jimgina yarim qo'llanish» bo'lmaydi).

**B. `lint-staged` — BEGONA faylni sening commit'ingga qo'shadi.**
`git add` faqat aniq yo'llar bilan qilingan edi (12 fayl), commit'ga 16 tasi tushdi: lint-staged
butun daraxtni stash qilib tiklaganda parallel sessiyaning 4 fayli qo'shilib ketdi. Commit
muvaffaqiyatli, testlar yashil, hech narsa shikoyat qilmaydi.
- **Avtomat himoya qo'yilgan:** `pre-commit` → `scripts/snapshot-staged.mjs` (stage ro'yxatini
  yozadi) va `post-commit` → `scripts/verify-commit-contents.mjs` (tarkib bilan solishtiradi,
  farq bo'lsa baland ovozda ogohlantiradi va tuzatish buyruqlarini beradi). `post-commit` commit'ni
  bekor qila olmaydi, lekin hali push qilinmagan — `reset --soft HEAD~1` bilan tuzatiladi.
- Qayta commit'da **hook'larni bir martaga chetlab o't** (`git -c core.hooksPath=/dev/null commit`),
  aks holda lint-staged yana qo'shadi. Bu holda gate'larni (typecheck/biome/test) **qo'lda to'liq**
  yugurtir va commit xabarida shuni yoz.
- Commit'dan **keyin** `git show --stat HEAD` bilan tarkibni ko'rish odat bo'lsin — `git add` ning
  aniqligi kafolat emas.

**Xulosa:** haqiqatan uzoq/mustaqil ish uchun §6.5 (worktree izolyatsiyasi) — bu ikki hodisaning
ham yagona to'liq yechimi.
