/**
 * MK39 — record-scope QAMROV HISOBOTI (deterministik, 0 token).
 *
 * Faza MK39 ning birinchi buyrug'i: «yoqishdan oldin qamrov hisobotini chiqar —
 * qoplanmagan endpoint bo'lsa YOQMA». Bu skript o'sha hisobotni chiqaradi va
 * `docs/audits/record-scope-coverage.md` ga yozadi.
 *
 * Butun mantiq `apps/api/src/modules/permissions/record-scope-coverage.ts` da —
 * ya'ni hisobot, guard-test va OPS skripti BIR manbadan o'qiydi (ikkinchi
 * «qamrov» ta'rifi yaratilmaydi).
 *
 * Ishlatish:
 *   pnpm record-scope:coverage           # hisobotni chop etadi + faylga yozadi
 *   pnpm record-scope:coverage --check   # faqat darvoza (blokerlar bo'lsa exit 1)
 *
 * Exit kod: darvoza yopiq (blokerlar bor) bo'lsa `--check` da 1, aks holda 0.
 */

import { writeFileSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  RECORD_SCOPE_REGISTRY,
  buildCoverage,
  canEnableRecordScope,
  repoRoot,
  summarize,
} from '../apps/api/src/modules/permissions/record-scope-coverage.js';

const ROOT = repoRoot();
const rows = buildCoverage(RECORD_SCOPE_REGISTRY, (file) => {
  try {
    return readFileSync(join(ROOT, file), 'utf8');
  } catch {
    return null;
  }
});
const sum = summarize(rows);
const gate = canEnableRecordScope(rows);

const schemaText = readFileSync(join(ROOT, 'packages/db/prisma/schema.prisma'), 'utf8');
const schemaDefault =
  schemaText.match(/recordScopeEnforced\s+Boolean\s+@default\((true|false)\)/)?.[1] ?? '?';

const STATUS_LABEL: Record<string, string> = {
  enforced: '✅ majburlangan',
  partial: '🟠 yarim',
  missing: '❌ ulanmagan',
  'no-entity': '❌ entity slug yo`q',
  'no-read-path': '⚪ o`qish-yo`li yo`q',
  'not-applicable': '➖ qo`llanmaydi',
};

const ORDER = ['missing', 'partial', 'no-entity', 'no-read-path', 'enforced', 'not-applicable'];
const sorted = [...rows].sort(
  (a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || a.model.localeCompare(b.model),
);

const scopedTotal = sum.total - sum.notApplicable;
const pct = scopedTotal === 0 ? 0 : Math.round((sum.enforced / scopedTotal) * 100);

const lines: string[] = [];
lines.push('# Record-scope qamrov hisoboti (MK39)');
lines.push('');
lines.push('> **AVTOMAT HOSILA — QO`LDA TAHRIRLAMA.** Manba: `scripts/record-scope-coverage.ts`');
lines.push('> (`pnpm record-scope:coverage`). Registr va darvoza mantiqi:');
lines.push('> `apps/api/src/modules/permissions/record-scope-coverage.ts`.');
lines.push('');
lines.push('## Xulosa');
lines.push('');
lines.push(`- Scoped model (schema.prisma \`{ownerId, groupId, shared}\`): **${sum.total}**`);
lines.push(
  `- Record-scope qo\`llanadigan: **${scopedTotal}** · qo\`llanmaydigan: ${sum.notApplicable}`,
);
lines.push(
  `- ✅ majburlangan: **${sum.enforced}** / ${scopedTotal} (**${pct}%**) · 🟠 yarim: ${sum.partial} · ❌ ulanmagan: ${sum.missing} · ❌ entity slug yo\`q: ${sum.noEntity} · ⚪ o\`qish-yo\`li yo\`q: ${sum.noReadPath}`,
);
lines.push('');
lines.push(
  `- **YOQISH DARVOZASI: ${gate.ok ? '🟢 OCHIQ — bayroqni yoqish mumkin' : `🔴 YOPIQ — ${gate.blockers.length} bloker`}**`,
);
lines.push(`- \`Account.recordScopeEnforced\` sxema default'i: \`${schemaDefault}\``);
lines.push('');
lines.push('## Qatorlar');
lines.push('');
lines.push('| Model | Entity | Holat | list | detail | Servis / sabab |');
lines.push('|---|---|---|---|---|---|');
for (const r of sorted) {
  const marks = `${r.listEnforced ? '✓' : '·'} | ${r.detailEnforced ? '✓' : '·'}`;
  const tail = r.service ? `\`${r.service}\`` : (r.reason ?? '—');
  lines.push(
    `| ${r.model} | ${r.entity ? `\`${r.entity}\`` : '—'} | ${STATUS_LABEL[r.status]} | ${marks} | ${tail} |`,
  );
}
lines.push('');
if (!gate.ok) {
  lines.push('## Blokerlar (yoqishga to`sqinlik qiladi)');
  lines.push('');
  for (const b of gate.blockers) lines.push(`- ${b}`);
  lines.push('');
}
lines.push('## Qo`llanmaydigan deb belgilangan modellar — sabablari');
lines.push('');
for (const r of rows.filter((x) => x.status === 'not-applicable')) {
  lines.push(`- **${r.model}** — ${r.reason}`);
}
lines.push('');
lines.push('> Bu qaror mustaqil manba bilan tekshiriladi: rol shablonlaridan (MK29) birortasi');
lines.push(
  '> entity`ga `view` uchun ALL`dan past scope bergan bo`lsa, `record-scope-coverage.test.ts`',
);
lines.push('> uni «qo`llanmaydi» deb belgilashga YO`L QO`YMAYDI.');
lines.push('');

const md = `${lines.join('\n')}`;
const OUT = join(ROOT, 'docs/audits/record-scope-coverage.md');

const checkOnly = process.argv.includes('--check');
if (!checkOnly) {
  writeFileSync(OUT, md, 'utf8');
  console.log(`yozildi: ${OUT}`);
}

console.log('');
console.log('— RECORD-SCOPE QAMROVI —');
console.log(
  `  scoped: ${scopedTotal} · majburlangan: ${sum.enforced} (${pct}%) · yarim: ${sum.partial} · ulanmagan: ${sum.missing} · slug yo'q: ${sum.noEntity} · o'qish-yo'li yo'q: ${sum.noReadPath} · qo'llanmaydi: ${sum.notApplicable}`,
);
console.log(`  sxema default: recordScopeEnforced = ${schemaDefault}`);
console.log(
  gate.ok
    ? '  DARVOZA: 🟢 OCHIQ — bayroqni yoqish mumkin'
    : `  DARVOZA: 🔴 YOPIQ — ${gate.blockers.length} bloker (birinchi 5):`,
);
if (!gate.ok) for (const b of gate.blockers.slice(0, 5)) console.log(`    ✗ ${b}`);

if (checkOnly && !gate.ok) process.exit(1);
