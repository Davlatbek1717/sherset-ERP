#!/usr/bin/env node
/**
 * hook-davom-reminder.mjs — UserPromptSubmit hook (2026-07-04).
 *
 * NIMA UCHUN: «davom et» protokoli `.claude/commands/davom.md`da turadi, lekin
 * foydalanuvchi `/davom` o'rniga oddiy matn bilan «davom et» yozsa command
 * yuklanmaydi va protokol intizomga qolib ketadi. Bu hook erkin promptda
 * «davom» so'zini ko'rsa, protokolni kontekstga avtomat qo'shadi — endi
 * qaysi ko'rinishda yozilishidan qat'i nazar oqim bir xil.
 *
 * Kirish: stdin JSON {prompt: "..."} · Chiqish: hookSpecificOutput.additionalContext
 */
let raw = '';
process.stdin.on('data', (c) => {
  raw += c;
});
process.stdin.on('end', () => {
  let prompt = '';
  try {
    prompt = String(JSON.parse(raw).prompt ?? '');
  } catch {
    // stdin JSON bo'lmasa — jim chiqamiz (hook hech narsa qo'shmaydi)
  }
  const p = prompt.trim().toLowerCase();
  // `/davom` allaqachon command orqali yuklanadi — faqat erkin-matn variantini tutamiz
  if (!p.startsWith('/') && /(^|\s)davom/.test(p)) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'UserPromptSubmit',
          additionalContext:
            "ESLATMA (avtomat hook): bu «davom et» fokus-sessiyasi — `.claude/commands/davom.md` protokoliga TO'LIQ amal qil: " +
            "preflight natijasini ko'r (ANOMALIYA bo'lsa avval hal qil) → NEXT.md («Avtomat protokol» + top-entry + cohort navbati) → " +
            'gate (tc0 · biome0 · i18n · Vitest) → halol status (Phase-1/Phase-2) → commit + NEXT.md top-entry + MEMORY pointer. ' +
            'NEXT.md 600+ qator bo\'lsa eski entry\'larni arxivla.',
        },
      }),
    );
  }
});
