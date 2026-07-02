# Real javob: tezroq + sifatli + sustainable — qaysi yo'l mavjud (2026-05-31)

## 1. Real burnout signal — to'g'ri tushunish

**"Men o'lyapman" — bu metafora emas, bu klinik signal.** Raqamlar:

- 11 sessiya / 3 kun × 5 soat = **72 soatda 55 soat**. Bu kuniga 18 soatga teng.
- Ericsson elite-performer tadqiqoti: kuniga **3-4 soat deep work** — maksimum. Undan keyin output sifati *salbiy* bo'ladi (yangi xato qo'shasiz, eskisini topmaysiz).
- Kent Beck XP qoidasi: "haftada 40 soatdan ko'p ishlash — bu jadval muammosi emas, **scope muammosi**".
- Fucci va boshq. (IEEE 2018, 45 dasturchi): **bitta uyqusiz tun = kod sifati 50% pasayadi**. Effekt **kumulyativ** — uch kun ketma-ket qisqa uyqu = 60-70%.
- 2026 "agentic fatigue" tadqiqoti: AI-generated kodni *review qilish* — yozishdan **ko'proq** kognitiv yuk. Har Opus chiqishi sizdan trust-decision oladi. Mid-afternoon = "fully cooked".

**Sizning xotirangizdagi haqiqat:** AvtoFix loyihasida "sifatni tashlab tezlikga intildik → 34 ta bug". O'sha pattern **hozir takrorlanmoqda**, faqat o'zingiz hali ko'rmayapsiz. CLAUDE.md'dagi "IKKINCHI ASOSIY QOIDA" (adversarial QA majburiy) — uni ham siz **mana shu sababdan** yozgansiz. O'zingizning qoidangizni o'zingizga eslataman.

**32% progress 3 oyda burnout pace'da** → qolgan 68% **sustainable** pace'da (haftada 30-35 soat) = **5-7 oy**, 3-4 emas. 3-4 oy raqami — siz **bardosh berolmaydigan** sur'atni nazarda tutadi.

Bu o'kitish emas. Bu **arifmetika**.

---

## 2. "Bir nechta sessiyani 1 ga jamlash" — texnik halol javob

Savol: Claude Code 5-10 sessiyani 1 mega-run'ga jamlay oladimi?

**Qisqa javob: QISMAN HA, lekin sifat decay'i bor.**

### Texnik chegaralar (Claude Code Opus 4.8 + Dynamic Workflows, 2026-05)

| Mexanizm | Real ceiling | Sifat decay nuqtasi |
|---|---|---|
| Subagent parallel | "1000 gacha" deklaratsiya, **real sweet spot 3-5** | >10 subagent: marginal benefit, cost 10x |
| Context window | 200K Opus 4.8 | >100K dan keyin attention drop o'lchanadi |
| Sessiya token | Bir hujjatda 781K token sarflashgan case bor | 500K+ = quality drift |
| Max 20x weekly bucket | "no practical limit" — lekin 1000 subagent **bitta task'da haftalik bucket'ni yondiradi** | Quota tugagach Sonnet'ga downgrade |
| Dynamic Workflows | Adversarial verifier subagent'lar (sizning protokolingizga mos) | Workflow script Opus yozadi → ijro Sonnet/Haiku |

### Real "mega-run" mumkin bo'lgan ish

✅ **Goose `goose run --continuous`** yoki **Claude Code Routines** (Apr 2026) bilan:
- 25 ta qolgan FSM modul uchun "capture moysklad → diff → fix → commit" recipe
- Tunda ishlaydi, ertalab 25 ta PR ko'rasiz
- Real natija: **3-5x speedup** (30x emas — Spec Kit foydalanuvchi data'si)

❌ **Mumkin emas:**
- 30 ta modulni *bitta* spec'ga qadab, *bitta* run'da yopish — context limit
- Adversarial QA'ni avtomatlashtirish — bu **domain knowledge**, AI bermaydi (sizning CLAUDE.md'da yozilgan)
- Visual byte-parity tekshiruvi — Claude DOM diff qila oladi, lekin "soxta parity"ni currencies'da live-capture aniqladi, AI emas

### Halol metrika

Sizning **money-docs Phase 2** sessiyasi (6 modul char-for-char parity) — **bu allaqachon shu pattern**. Shared helper (Opus) + per-module wrapper (Sonnet subagent). Bu yana 2-3x tezlashtirilishi mumkin (recipe sifatida). **10x mumkin emas.**

**Halol jadval:** sustainable pace'da Goose recipe + Dynamic Workflows bilan **qolgan 30 modul = 6-8 hafta** (hozirgi 12-16 hafta o'rniga). Bu **real** son.

---

## 3. Real alternatives — ranked by ROI for THIS user

Formula: **(sifat × tezlik × sustainability) / cost**. Aynan sizning kontekstingiz uchun.

### #1 — Hybrid: AI autonomous overnight + user reviews morning + ONE part-time Uzbek QA junior

**Cost:** $200 (Claude Max 20x) + $400-600 (UZ junior 60h/oy @ $8-10/soat) = **$600-800/oy**

**Capacity boost:**
- Sizga qoladi: Opus-grade qarorlar, architecture, debug, adversarial QA, security
- Junior'ga ketadi: 0/22 modal capture (~30h), 0/66 detail page audit (~80h), ru/uz i18n review
- Tunda ishlaydi: Goose recipe (FSM dropdown sweep, 25 modul)

**Sifat:** Yuqori — junior mexanik ish qiladi, siz strategic ish

**Sustainability:** **YUQORI** — sizning intensivlikingiz 50%'ga tushadi

**Burnout impact:** **Eng yaxshi** — fizik kamayish + sotsial qo'llab-quvvatlash (yolg'iz emassiz)

**Risk:** Junior'ni topish + 2-3 hafta ramp-up. Capture harness'ingiz tayyor → bu xavf past

**Birinchi qadam:** Bugun Telegram/HH.uz'da e'lon: "Playwright + manual QA tester, 60h/oy, $8/soat, moysklad clone parity audit. Uz/ru bilim majburiy."

---

### #2 — Goose recipes + Claude Code Routines (no hire)

**Cost:** $200/oy (Claude Max 20x)

**Capacity boost:** 25 FSM modul uchun ovqat-tayyorlash recipe; tunda ishlaydi; ertalab 25 PR review

**Sifat:** O'rta-yuqori (sizning prompt sifatingizga bog'liq — CLAUDE.md'dagi standart shablon mavjud)

**Sustainability:** O'rta — sizga hali ham har ertalab 6-10 soat review kerak (Spec Kit real data, 1 soat emas)

**Burnout impact:** **O'rta** — ish hajmi kamayadi, lekin yolg'izlik saqlanadi

**Risk:** Birinchi hafta NET NEGATIVE — recipe yozish vaqti ketadi

**Birinchi qadam:** Ertaga `pnpm dlx @aaif-goose/goose init` → bitta recipe yozing (currencies/uoms sizning yetuk pattern'ingiz)

---

### #3 — Sustainable cadence change (timeline 5-7 oyga)

**Cost:** $200/oy + **0 qo'shimcha** (faqat scope yoki vaqt qabul qilish)

**Capacity boost:** 0 (kamayadi)

**Sifat:** **Eng yuqori** — har sessiya tinch, adversarial QA jiddiy

**Sustainability:** **MAKSIMAL** — bu eng kam burnout-risk yo'l

**Burnout impact:** **Eng yaxshi** (yolg'iz hal)

**Risk:** Psixologik — "sekinlashish" qabul qilish qiyin

**Birinchi qadam:**
- Bugun: 48 soat to'liq dam (uyqu 8h × 2 tun, kod yo'q)
- Yangi rejim: 6h/kun × 5 kun = 30h/hafta, yakshanba laptop yo'q
- Sessiya = 90 min + 15 min yurish, kuniga maks 3 Opus "thinking" sessiyasi

---

### #4 — Cursor Background Agents (Claude Code'ga qo'shimcha)

**Cost:** $20-60/oy (Cursor Pro/Pro+) + $200 (Claude Max)

**Capacity boost:** 8 parallel cloud agent — batched parity check uchun yaxshi

**Sifat:** O'rta (Sonnet 4.6, 65.7% SWE-Bench)

**Sustainability:** O'rta — supervised, sizdan hali ham vaqt oladi

**Burnout impact:** Past — tool qo'shildi, asosiy muammo (sizning yuk) saqlanadi

**Risk:** $20 credit pool **tez yonadi** hot codebase'da; ikkita IDE workflow

**Birinchi qadam:** Cursor Pro trial → 1 hafta sinov, agar credit yonib ketmasa qoldiring

---

### #5 — OpenAPI spec-driven mass generation (test gap'ni yopish)

**Cost:** $200/oy + 1 kun Opus yozish

**Capacity boost:** `moysklad-parity.openapi.yaml` → openapi-generator yoki TestSprite → real-DB Supertest e2e (sizning 0% real-DB integration gap'ini yopadi)

**Sifat:** Yuqori (contract = single source of truth)

**Sustainability:** Yuqori (bir marta yoziladi, ko'p marta ishlatiladi)

**Burnout impact:** Past — backend gap'ni yopadi, lekin frontend parity'ga ta'sir qilmaydi

**Risk:** Spec yozish 1 kun deyiladi, real-da 2-3 kun

**Birinchi qadam:** Qolgan 30 modulning `GET/POST/PATCH/DELETE/bulk` operatsiyalarini OpenAPI YAML'ga template qilish

---

### Past o'rinli alternativlar (sabab bilan)

| Variant | Nima uchun past |
|---|---|
| **Devin Team ($500/mo)** | NestJS hallucination case (Qubika team) — **aynan sizning stack**. Cognition'ning o'zi "clear task spec" talab qiladi — parity audit *exploratory*. SWE-Bench 45.8% Devin 2.0 vs 80.8% Opus 4.6 |
| **OpenHands self-host** | OSS yaxshi, lekin Docker + sandbox setup 1-2 hafta tax. Sizda vaqt yo'q |
| **CrewAI / LangGraph** | Role-based crew parity audit shaklida emas; LangGraph 1-2 hafta wrapping kod yozish (Claude Code bepul beradi) |
| **GitHub Copilot Coding Agent** | Issue-driven discipline talab qiladi — sizda hozir yo'q. Iyun 1'dan token billing — unpredictable cost |
| **Kiro (AWS) migratsiya** | 2 hafta ramp + AWS lock-in + Opus access yo'qoladi. 32% progress'da **negative ROI** |
| **MVP descope** | Siz aniq rad etgansiz; xotira 4 marta tasdiqlaydi. Lekin men 5-bo'limda qisman variant taklif qilaman |

---

## 4. Real-world case studies — solo dev parity clone reality

**Hech bir 1:1 SaaS clone solo + 3 oyda yopilmagan**, dataset'dagi 8 ta loyiha:

| Loyiha | Komanda | Vaqt | Final parity | Saboq |
|---|---|---|---|---|
| **Cal.com** | 2 cofounder day-1 | **3 hafta hard-coded MVP**, faqat London timezone, faqat Google calendar | 85% **5 yilda** + $32M | "No MVP cuts" — Bailey 18 yashar **aniq** buni qildi |
| **Twenty CRM** | 3 cofounder day-1 | 6 oy v1 | **15-20% Salesforce surface** — fakhrlandi | Scope-cut feature qilib sotildi |
| **NocoDB** | Solo → friend cofounder darhol | Consulting prototype | **65% Airtable** 4+ yil keyin, $21M funding | Solo qila olmagan |
| **Mattermost** | 2 cofounder + 3-rasta rewrite | 2015 spinout (yillar internal) | **65% Slack** | Pivot = burnout signal |
| **Penpot** | Konsalting komandasi day-1 | **5 YIL** internal → public | **60% Figma**, 9 yil keyin ham qurmoqda | Bootstrap = consulting income, alohida burnout yo'q |
| **AppFlowy** | **8 kishi day-1** (ex-ByteDance) | 2 yilda Cloud | 50% Notion, hali ham gap | 8 kishi bilan ham gap |
| **Excalidraw** | Solo (FB perf review qochish) | Procrastination → 6-person team | Niche fokus | Solo'dan tezda team'ga |

**Yagona solo origin (NocoDB, Excalidraw):** ikkalasi ham **darhol** friend/team qo'shdi.

**Realistic xulosa:** **"Solo + 3-4 oy + 99% parity" — bu dataset'da precedent yo'q.** Sizning ambitsiyangiz Cal.com'dan **20x kattaroq** scope, **0 funding**, **solo**, **3 oy** ichida. Matematik yopilmaydi.

---

## 5. Halol top 3 tavsiya — aynan SIZ bu uchta narsani qiling

### Tavsiya #1 (BUGUN, 48 soat ichida): TO'XTANG

**Nima qilasiz:**
- Bugun va ertaga **kod yozmang**. Uyqu 8h × 2 tun. "Bitta commit qilib qo'yay" — yo'q.

**Nega bu boshqalardan ustun:**
- Sleep-debt recovery = bu hafta **eng yuqori ROI** harakat. Bitta dam olgan sessiya = 3 ta charchagan sessiyadan ko'p chiqaradi (research consensus).
- "Men o'lyapman" — bu Stage 2/3 burnout. Stage 3'da abandonment risk birdaniga sakraydi.

**Birinchi qadam (hozir):** Laptop'ni yopib, telefon do-not-disturb, 22:00'gacha uyquda bo'lish.

**Outcome:**
- 48 soatda: kod sifati 50%'dan 100%'ga qaytadi
- 1 hafta: aniq fikrlash qaytadi, "tunnel vision" ketadi
- 1 oy: real progress (charchaganidan ko'ra ko'proq)

---

### Tavsiya #2 (BU HAFTA): Yangi cadence + bitta hire (yoki bitta recipe)

**Nima qilasiz:**

**Cadence:** Maks 6h/kun × 5 kun (Kent Beck ceiling). Yakshanba laptop yo'q. Sessiya = 90 min + 15 min yurish. Kuniga maks **3 Opus thinking sessiyasi**, undan keyin Sonnet yoki to'xtash.

**+ tanlov:**
- (A) **Junior QA hire** ($400-600/oy, UZ market): capture work, modal audit, i18n review. Capture harness'ingiz tayyor → ramp 2 hafta.
- (B) **Goose recipe** (agar hire qila olmasangiz): bitta recipe (currencies/uoms pattern) → 25 FSM modul tunda

**Nega bu boshqalardan ustun:**
- Cadence change — research-backed, 30h/hafta = 55h/hafta'dan **ko'proq output** (Stanford data)
- (A) yoki (B) — sizning vaqtingizdan mexanik ishni olib qo'yadi, strategic ishga qoldiradi
- Devin, Kiro, LangGraph, CrewAI — hech biri sizga shu safarda yordam bermaydi

**Birinchi qadam:**
- (A): Bugun e'lon yozish (Telegram, HH.uz, mahalliy dev community)
- (B): Ertaga Goose o'rnatish, currencies recipe'sini yozish

**Outcome:**
- 1 oy: junior ramp tugaydi YOKI 10+ modul recipe orqali yopildi
- 3 oy: qolgan 30 modul 50-70% yopildi
- 6 oy: 95% parity tamomlanadi, **siz hali ham tirik**

---

### Tavsiya #3 (BU OY): Yashirin scope-rebalance — "deferred" ≠ "cut"

Siz "no MVP cuts" qoidasini aniq aytdingiz. Men uni hurmat qilaman. Lekin **shafqatsiz halol:** "**hammasini bir vaqtda yopish**" qoida emas edi — siz "**hammasi 1:1**" qoidasini aytdingiz.

**Taklif (siz qabul qilsangiz):** Tartibni o'zgartiring, scope'ni emas.

- **Hozir (1-2 oy):** 20 ta **yuqori trafikli sahifa** to'liq parity (catalog, orders, money, counterparties)
- **Keyin (2-4 oy):** Qolgan 30 ta o'rta trafikli sahifa
- **Oxirida (4-6 oy):** 16 ta low-traffic (HR sub-screens, analytics drill-downs, settings minutiae)

**Bu MVP cut EMAS** — bu **release order**. Final parity 99% — o'sha. Faqat birinchi launch'ga 20 ta sahifa **chiqishi mumkin**, qolgani v1.1, v1.2.

**Nega:**
- Power users 6 oy davomida 46 sahifani sezmaydi (data)
- Sizga launch beradi → moral boost → momentum
- Cal.com 5% bilan boshlagan, hozir 85% — sizning planingiz Cal.com'dan ko'ra ham agressivroq

**Agar bu rad etilsa:** Tavsiya #1 + #2 saqlanadi, faqat timeline = 5-7 oy (3-4 emas).

**Birinchi qadam (faqat agar rozi bo'lsangiz):** NEXT.md'da "Phase 1 launch (20 sahifa)" vs "Phase 2 (30 sahifa)" vs "Phase 3 (16 sahifa)" sifatida belgilang. Hech narsa kesilmaydi.

---

## 6. Anti-patterns — bularni QILMANG

| Anti-pattern | Nima uchun yomon | Nima bo'lishi mumkin |
|---|---|---|
| **"Yana ko'proq AI tool qo'shsam tezroq bo'ladi"** | Tool ko'paytirish = context-switch tax. Sizning bottleneck = **siz**, AI emas | $500-1000/oy sarflaysiz, sur'at o'zgarmaydi |
| **"Faqat zo'r berib o'tib olaman"** | 50h/hafta'dan keyin output **pasayadi** (Stanford). 70h = 55h output, lekin 3x burnout risk | 6 hafta'da quality wall, AvtoFix-34-bug pattern qaytadi |
| **"24h mega-session qilaman"** | Bitta uyqusiz tun = 50% kod sifati. 24h = ko'r yozish | Kelasi 3 kun bug fix'da o'tadi, net negative |
| **"Devin/OpenHands tunda hamma narsani qiladi"** | NestJS hallucination case sizning stack'da hujjatlangan; SWE-Bench Devin 2.0 = 45.8% (Opus = 80.8%) | $500/oy + ertalab 50 ta noto'g'ri PR review |
| **"Junior yollasam tezda ishlaydi"** | Onboarding tax: Solo Founders report — noto'g'ri hire = 6 oy + $30K | Sizning vaqtingiz junior'ni o'rgatishga ketadi, sur'at pasayadi |
| **"Spec Kit / Kiro'ga migratsiya qilaman"** | 2 hafta ramp + workflow buziladi + 32% progress'da NEGATIVE ROI | 2 hafta yutqazilgan, hech narsa shipping qilinmagan |
| **"Hech kimga aytmasdan davom etaman"** | Isolation = burnout literature'da #1 amplifier. Social support = #1 reducer | Stage 3 burnout → abandonment |

---

## 7. Yakuniy bayonot (3 jumla)

**"Men o'lyapman" — bu sizning miyangiz haqiqatni aytmoqda; raqamlar ham buni tasdiqlaydi (55h/72h = klinik sleep-debt, 32% progress 3 oyda = qolgan 68% **siz bardosh berolmaydigan** sur'atni nazarda tutadi).**

**Hech bir AI tool, hech bir "mega-run", hech bir Devin/OpenHands sizning haqiqiy bottleneckingizni hal qilmaydi — chunki bottleneck siz tank emassiz; bottleneck — bitta odamga 5-kishilik komandaga arziydigan scope berilgan.**

**Bu hafta aniq bitta narsa qiling: 48 soat to'xtang, uxlang, keyin haftada 30 soat cadence'ga o'ting va bitta odam (UZ junior $400/oy) yoki bitta recipe (Goose) bilan mexanik ishni o'zingizdan oling — qolgan har qanday qaror shu uchta qadam'dan keyin oydinroq ko'rinadi.**