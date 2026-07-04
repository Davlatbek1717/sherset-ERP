#!/usr/bin/env node
/**
 * hook-git-add-guard.mjs — PreToolUse hook (2026-07-04, CLAUDE.md §6).
 *
 * NIMA UCHUN: parallel sessiyalar bitta checkout'da ishlaganda eng xavfli xato —
 * `git add -A` / `git add .` / `git commit -a` boshqa sessiyaning tugallanmagan
 * fayllarini ham commit'ga tortib ketadi. Bu hook o'sha shakllarni mexanik
 * bloklaydi: stage har doim aniq yo'llar bilan bo'lishi shart.
 *
 * Kirish: stdin JSON {tool_input:{command}} · Chiqish: permissionDecision deny/undefined
 */
let raw = '';
process.stdin.on('data', (c) => {
  raw += c;
});
process.stdin.on('end', () => {
  let cmd = '';
  try {
    cmd = String(JSON.parse(raw).tool_input?.command ?? '');
  } catch {
    // JSON bo'lmasa — aralashmaymiz
  }
  // har bir zanjir bo'lagini alohida tekshiramiz (`cd x && git add .` ham tutilsin)
  const parts = cmd.split(/&&|\|\||;|\n/);
  const sweeping = parts.some((p) => {
    const t = p.trim();
    if (/^git\s+add\s/.test(t) && /(\s(-A|--all|-u|--update)(\s|$)|\s\.\s*$)/.test(t)) return true;
    if (/^git\s+commit\s/.test(t) && /\s(-a|--all|-am)\b/.test(t)) return true;
    return false;
  });
  if (sweeping) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason:
            "CLAUDE.md §6: `git add -A/./-u` va `git commit -a` TAQIQ — parallel sessiyaning fayllarini tortib ketishi mumkin. Faqat aniq yo'llar bilan stage qil: `git add <fayl1> <fayl2>`, oldin `git status --short` bilan tekshir.",
        },
      }),
    );
  }
});
