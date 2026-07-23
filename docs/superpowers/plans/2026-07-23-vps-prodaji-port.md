# climart «moysklad» fork → Sherset: BUTUN-REPO adoption — REJA

> **Maqsad (2026-07-23, foydalanuvchi kengaytirdi):** Sherset kodini butunlay **climart bilan bir xil** qilish
> (VPS `/var/www/moysklad` = `Biznesjon-Official/moysklad` fork) — Sherset ← climart upstream-adoption.
> **Status:** recon + farq-tahlil + qaror ✅ (bu sessiya). Adoption = keyingi sessiyalar (worktree-izolyatsiya).
> **⚠️ Bu oldingi «Продажи per-page port» ni HAM, salesreturn 1:1 QISM ishini ham SUPERSEDES qiladi.**

## 0. Yakuniy ko'lam (foydalanuvchi qarori, 3 savol bilan tasdiqlangan)

- **Butun kod climart bilan bir xil bo'lsin** (barcha apps/packages/routes climart versiyasiga).
- **SAQLANADI (Sherset'niki qoladi):** `counterparties` (konteragentlar) + `debts` (qarzlar) — FE + API + komponent + sxema-modellari.
- **TUSHIB QOLADI** (Sherset-only, foydalanuvchi saqlashni tanlamadi): `sotuv` (maxsus POS), `omborchi`, `restock-tasks`, `replenishment`, `cell`. ⚠️ `sotuv` — butun maxsus kassa; yo'qoladi.
- **QO'SHILADI** (climartda bor, Sherset'da yo'q — climart tree bilan avtomat keladi): `bulk-edit`, `specialoffers`, `subscription`.
- **Rejim:** **LOKAL — avval to'liq tayyorla+tekshir.** Production (`sherset.biznesjon.uz`) deploy = ALOHIDA, keyingi ehtiyotkor qadam.
- **DB:** lokal — **yangi dev-DB** (climart sxemasi + counterparties/debts modellari + seed). **climart datasi KO'CHIRILMAYDI.** Prod-DB migratsiyasi = deploy qadamiga defer.

## 1. Kontekst (grounded)

- climart va Sherset — **bir loyiha oilasi** (`moysklad-clone`), alohida diverged fork. **Monorepo strukturasi bir xil** (apps: api/marketing/web · packages: config/db/design-system/money/workflows).
- climart umuman **to'liqroq**; shared-infra ikkalasida ham divergent (Sherset ba'zi joyda kattaroq: api-client 247>177, schema 9356>8939) — «bir xil» = climart versiyasi g'olib (counterparties/debts bundan mustasno).
- **SSH:** `ssh climart` (root@45.67.216.61, kalit `~/.ssh/climart_vps`, parolsiz). Server FAQAT o'qiladi.
- **climart repo ~3GB, lekin ~keraksiz:** `docs/` 2.8G (committed Claude transcript'lar + captures) · generated Prisma client (index.d.ts 36M, query-engine'lar) · node_modules. **Haqiqiy manba kichik** → adoption'da faqat manba olinadi (apps/*/src, packages/*/src [generated'siz], scripts, config, prisma/schema, i18n).

## 2. Mexanizm (butun-tree overlay, NE fayl-bo'yicha)

Izolyatsiyalangan **worktree/branch**'da (parallel sessiya main'da — halaqit bermaslik):
1. **climart toza manbani ol** — maqsadli `git archive HEAD -- <source-paths>` (docs/audit/scratch/generated CHIQARIB). Kerak: `apps/{api,web,marketing}/src`, `apps/*/{package.json,tsconfig,next.config,…}`, `packages/*` (generated'siz), `scripts`, root config (turbo/biome/pnpm-workspace/tsconfig.base), `packages/db/prisma`, i18n.
2. **Sherset tree'ni climart bilan almashtir** — keep-yo'llar bundan mustasno.
3. **Keep-yo'llarni tikla (Sherset'niki):** `apps/web/src/app/(app)/{counterparties,debts}`, `apps/api/src/modules/{counterparty*,debt*}`, tegishli komponentlar, va sxemadagi counterparties/debts modellari.
4. **Sherset repo-ident + deploy'ni saqla:** `.git`, `deploy/` (sherset.biznesjon.uz conf/ecosystem/DEPLOY-sherset.md), `.env` namunalari, ports (4002/4000) — climart'niki bilan ALMASHTIRILMAYDI.
5. **Drop-yo'llarni olib tashla:** sotuv/omborchi/restock-tasks/replenishment/cell (FE+API+sxema).

## 3. Bosqichli bajarish (har biri gate bilan; ko'p-sessiya)

- **B1 — Manba + overlay:** worktree; climart manbani ol; tree'ni almashtir (keep/drop qoidasi bilan). `pnpm install` o'tsin.
- **B2 — Sxema reconcile:** `packages/db/prisma/schema.prisma` = climart sxemasi **+** counterparties/debts modellari (Sherset'dan). `prisma validate` + `prisma generate`.
- **B3 — Keep-list moslashtir:** counterparties/debts sahifa/modullari climart shared-infra'siga (api-client, komponent, i18n, tiplar) moslashsin. **typecheck 0.**
- **B4 — Build + i18n:** `biome` 0 · i18n key-existence ru+uz · `pnpm build:web`.
- **B5 — DB + runtime:** yangi dev-DB (moysklad_dev reset) → `prisma migrate` → `db:seed` → `pnpm dev` smoke (login + bir nechta sahifa).
- **B6 — Verify + hujjat:** climart yonida solishtir; drop/keep'ni tasdiqla. Branch tayyor.
- **(keyin, ALOHIDA) — Prod deploy:** sherset.biznesjon.uz — prod-DB backup + ehtiyotkor migratsiya/qayta-seed (foydalanuvchi bilan).

## 4. Xavflar
- **Keep-list bog'liqligi:** counterparties/debts Sherset shared-infra/sxemasiga tayanadi → climart bazasiga moslashtirish kerak (B3). Agar toza saqlanmasa — foydalanuvchi bilan hal.
- **Sxema-drift:** climart modellarida Sherset'da bo'lmagan maydonlar → dev-DB yangi bo'lgani uchun lokal muammosiz; prod = alohida.
- **Deploy-config yo'qolishi:** climart tree Sherset `deploy/`ni bosib ketmasin (keep-ro'yxatda).
- **Dropped features:** sotuv/omborchi/… yo'qoladi — foydalanuvchi tasdiqladi, lekin B6'da eslatiladi.

## 5. Keyingi qadam
B1 — yangi toza sessiyada worktree ochib, climart manbani olib, overlay. Reference: bu reja + `ssh climart`.
