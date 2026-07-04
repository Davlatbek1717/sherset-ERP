---
description: «davom et» fokus-sessiyasi — NEXT.md protokoli bo'yicha keyingi vazifani bajarish
---

Fokus-sessiya boshla (CLAUDE.md §0 rejimi: **OPUS/flagship model**, 1 flagship ish + commit → sessiya yopiladi, juda yuqori sifat):

1. `node scripts/preflight.mjs` natijasini ko'r (SessionStart hook allaqachon yugurtirgan bo'lishi mumkin) — **ANOMALIYA** bo'lsa avval uni hal qil yoki session-start-audit agentini yubor.
2. `NEXT.md`ni o'qi: «Avtomat protokol» → «⏭️ Aniq keyingi vazifa» top-entry → «Cohort audit navbati».
3. Keyingi vazifani bajar. Cohort-audit bo'lsa — `scripts/wf-cohort-detail-audit.js` dvigateli; mexanik ish uchun avval deterministik script/codemod.
4. Gate: typecheck 0 · biome 0 · i18n key-existence ru+uz · tegishli Vitest. Label o'zgartirilsa — CLAUDE.md §4 grounding intizomi.
5. Statusni **HALOL** yorliqla: «Phase-1: strukturaviy, runtime-tasdiqlanmagan» yoki «Phase-2 verified» — hech qachon asossiz «done/production-ready» deb yozma.
6. Yakun: commit → NEXT.md top-entry'ga yangi yozuv (eskisi 8–10 tadan oshsa arxivga: `docs/audits/_ARCHIVE-NEXT-*.md`) → MEMORY.md'ga 1 qatorli pointer.

$ARGUMENTS bo'lsa — o'sha vazifani navbatdan ustun qo'y.
