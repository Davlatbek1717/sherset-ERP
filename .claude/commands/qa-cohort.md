---
description: Phase-2 QA sessiyasi — cohort sahifalarini real brauzerda runtime-verify qilish
---

Phase-2 QA sessiyasi (CLAUDE.md §1 Phase 2). Cohort: $ARGUMENTS — bo'sh bo'lsa `NEXT.md` → «QA-backlog (Phase 2)» dan navbatdagisini ol.

1. **Stack ko'tar**: PostgreSQL `moysklad_dev` @ `localhost:5433` · `pnpm dev` (web 3100, api 4000) · kerak bo'lsa `pnpm db:seed` / `seed-real`.
2. Har sahifani **real brauzerda** (Playwright MCP) ochib adversarial QA qil — nafaqat «render bo'ldimi»: concurrency · timeout · data-integrity · edge-case · authorization savollari.
3. Topilgan bug **darhol** (issiq kontekst) tuzatiladi — gate bilan (typecheck 0 · biome 0 · i18n · Vitest).
4. Mavjud Playwright e2e spec qoplagan joy bo'lsa — spec'ni yangilab yugurt.
5. Yakun: cohort statusi «Phase-1» → **«Phase-2 verified»** (NEXT.md QA-backlog yangilanadi) → commit → NEXT.md top-entry.
