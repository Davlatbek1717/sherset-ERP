# Dizayn — «Отгрузки» (demand) bo'limini moysklad bilan to'liq 1:1 qilish

> **Sana:** 2026-07-23 · **Turi:** dizayn spec (brainstorming natijasi) · **Status:** tasdiqlangan (foydalanuvchi «ha»)
> **Maqsad-egasi:** Sherset ERP operatori · **Manba:** `online.moysklad.ru` (real akkaunt)

## 1. Maqsad

`Отгрузки` bo'limini (bizda `demands`) moysklad bilan **to'liq 1ga-1** qilish — **ham funksiya/xulq, ham
ko'rinish (pixel-1:1)**. Bo'lim 3 sahifadan iborat:

- **Ro'yxat** — `apps/web/src/app/(app)/demands/page.tsx` (hujjatlar ro'yxati, filtr, kolonka, bulk-amal, ustki panel)
- **Detal** — `apps/web/src/app/(app)/demands/[id]/page.tsx` (pozitsiyalar, jami, status, Tarix, chop, bog'liq hujjat)
- **Yaratish** — `apps/web/src/app/(app)/demands/new/page.tsx` (maydon, tovar tanlash, narx, hisob-kitob)

## 2. Hozirgi holat (grounded — kod/NEXT.md tekshirildi)

- **Funksional (Phase-1 + Phase-2):** ✅ deyarli tayyor. Demand Cohort A'da audit + runtime-tasdiqlangan
  (`_PHASE2-cohortA-session2-*`, 2026-06-10c). Backend to'liq: `fifo-consumer`, COGS, `demand-overhead`,
  `demand-toctou` guard, print (`apps/web/src/app/print/demand`), schema. → «to'liq 1:1» bu qatlamda faqat
  **qolgan mayda gap'larni** ochishi kutiladi.
- **Vizual pixel-1:1:** 🚧 loyiha bo'yicha endi boshlangan qatlam. `customer-order /new` = namuna (~90%) va u
  yaratgan **shared vizual paket** ~28 hujjat formasiga avtomat tarqalgan → demand `/new` ehtimol ko'p qismini
  meros olgan; **ro'yxat va detal alohida**.
- **Capture:** `audit/moysklad/demands-list.html` bor (ehtimol eski). Detal + yaratish uchun **toza capture yo'q**.
  Loyiha `CLAUDE.md` §4: capture'siz vizual/label o'zgartirish = taxmin → **taqiqlangan**. Demak toza capture kerak.

## 3. Yondashuv — sahifama-sahifa, capture-birinchi, 1 sahifa = 1 sessiya

Token-protokolga (`CLAUDE.md` §0: 1 flagship → commit → sessiya yopiladi) va vizual-parity uslubiga mos.
Dastur = 4 sessiya (1 recon + 3 fix):

| # | Sessiya | Natija |
|---|---------|--------|
| **0** | **Capture + gap-tahlil** | Playwright (MCP) bilan moysklad'dan 3 sahifani toza capture → hozirgi sahifaga solishtirib **funksional + vizual delta ro'yxati** (per-page backlog). Bu 1–3 sessiyalarning aniq ish-ro'yxatini beradi. |
| **1** | **Yaratish (`/new`)** | Delta'larni tuzatish → moysklad yonida browser-cert. Eng tayyor (shared paket meros). |
| **2** | **Detal (`[id]`)** | Pozitsiya/jami/status/Tarix/print/bog'liq — vizual + funksional. |
| **3** | **Ro'yxat** | Filtr/kolonka/bulk/ustki panel. |

**Boshlash tartibi rationale:** `/new` avval — shared vizual infratuzilmani meros olgan, eng tez natija,
demand-ga xos vizual delta'larni ochib detalga ham foyda beradi. Ro'yxat oxirida (eng mustaqil: kolonka/filtr/bulk).

**Muqobillar (rad etildi):** *dimension-first* (avval hamma funksiya, keyin hamma vizual) — 3 sahifani aralashtiradi,
browser-verify qiyin, 1-flagship qoidasini buzadi. *Big-bang workflow* (hammasini birdan) — juda qimmat/xavfli,
token-protokolni buzadi.

## 4. Har sessiyada intizom (majburiy)

1. **Ground-truth capture** — o'sha sahifaning toza moysklad snapshot'i (Session 0'da olingan). Har label/maydon/xulq
   DOM-rol bo'yicha tekshiriladi (`CLAUDE.md` §4 — grep-count emas, element-rol). Capture'da yo'q bo'lsa → DEFER + hujjatla.
2. **Gate:** typecheck 0 · biome 0 · i18n key-existence (ru+uz) + no-hardcoded · web Vitest (regress yo'q).
3. **Browser-cert:** `:3100`da jonli sahifa, zarur bo'lsa moysklad yonida vizual solishtirish. Faqat shundan keyin
   o'zgarish «vizual-verified» deb belgilanadi.
4. **Halollik:** browser-cert bo'lgunча **«done / 100% / production-ready» YO'Q**. Har commit/audit-doc holatni
   halol yozadi («vizual-verified» yoki «Phase-1, runtime-unverified»).
5. **Parallel-sessiya protokoli (`CLAUDE.md` §6):** faqat o'z fayllarim `git add <aniq yo'l>` bilan; `git add -A` yo'q.

## 5. Capture manbasi

Playwright MCP — foydalanuvchi o'z moysklad akkauntiga brauzerda kiradi (parol saqlanmaydi, faqat o'sha sessiya),
men 3 sahifani (ro'yxat / bitta otgruzka / yangi otgruzka) DOM + skrinshot bilan olaman. Chiqish → faylga
(`docs/audits/demands-live-2026-07-23/`), kontekstga emas (token-iqtisod, `CLAUDE.md` §0.5).

## 6. Verifikatsiya

- Har fix — capture'ga grounded + gate-green + `:3100` browser-cert.
- Real moysklad'ga read-only solishtirish (Playwright ochiq).
- Audit doc har sessiya: `docs/audits/_demand-<page>.audit.md`.

## 7. Ko'lam tashqarisi (YAGNI)

- Demand backend funksional qayta-yozuvi (allaqachon Phase-2 tasdiqlangan; faqat capture ochgan aniq gap tuziladi).
- Boshqa hujjat formalari (shared paketdan tashqari) — bu dastur faqat demand bo'limi.
- Absolyut sub-piksel overlay-diff (ko'rinadigan farq mezoni ishlatiladi; «mutlaq 100%» halol yozilmaydi).

## 8. Muvaffaqiyat mezoni

3 sahifa ham: (a) capture-grounded funksional parity (aniq gap yo'q yoki hujjatlangan DEFER), (b) `:3100`da
moysklad'dan ko'rinadigan farqsiz, (c) gate-green, (d) browser-cert. Har biri o'z audit-doc'i bilan yopiladi.
