#!/usr/bin/env node
/**
 * preflight.mjs — deterministik sessiya-boshi tekshiruvi (2026-06-11d).
 *
 * NIMA UCHUN: session-start-audit workflow (3–4 Opus agent) har sessiyada
 * ~250–320k token sarflardi (jonli o'lchovlar: 311k va 245k) va asosan
 * machine-checkable hisoblagichlar allaqachon tutadigan kosmetik doc-drift
 * topardi. Bu script o'sha tekshiruvlarning deterministik qismini ~0 tokenga
 * bajaradi. FAQAT ANOMALIYA topilgandagina session-start-audit workflow
 * (yoki bitta audit-agent) yuboriladi — GO bo'lsa to'g'ridan-to'g'ri ish.
 *
 * Tekshiruvlar (har biri talk-vs-done drift klassining bitta tutqichi):
 *   1. git working tree toza (uzilib qolgan sessiya artefaktlari — 06-10
 *      "interrupted session" klassi)
 *   2. NEXT.md top-entry'laridagi commit-hash'lar git'da MAVJUD
 *      (claims-vs-evidence lite — yo'q hash = konfabulyatsiya belgisi)
 *   3. NEXT.md eng yangi entry sanasi vs eng yangi commit sanasi
 *      (sessiya commit qilib NEXT.md yozmagan = hand-off drift)
 *   4. progress.json ichki konsistensiya (ui_conventions.locked soni
 *      ro'yxatdagi locked'lar bilan teng; phase2 hisoblagichi)
 *   5. MEMORY.md auto-load limiti (24.4KB) ichida
 *   6. dev-stack portlari (3100/4000/5433) — axborot (docs-sessiya uchun
 *      stack shart emas, shuning uchun anomaliya emas)
 *
 * Usage:  node scripts/preflight.mjs            — tez tekshiruv
 *         node scripts/preflight.mjs --harness  — + optimistic-lock jonli harness
 * Exit:   0 = GO · 1 = ANOMALIYA (ro'yxati chiqadi → audit-agent yuboring)
 */
import { execSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import net from 'node:net';

const sh = (cmd) => execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const issues = [];
const infos = [];

// ── 1. working tree
const porcelain = sh('git status --porcelain');
if (porcelain) {
  issues.push(`working tree TOZA EMAS (uzilgan sessiya artefakti?):\n${porcelain}`);
} else {
  infos.push('tree: toza');
}

// ── 2+3. NEXT.md top-entry'lar
const next = readFileSync('NEXT.md', 'utf8');
// 40k ≈ eng yangi 4–5 entry (ular uzun bo'ladi; 12k yetmasligi jonli aniqlangan)
const anchor = next.indexOf('## ⏭️ Aniq keyingi vazifa');
const topRegion = anchor >= 0 ? next.slice(anchor, anchor + 40_000) : next.slice(0, 40_000);

// hash-nomzodlar: 8 ta hex, kamida bitta harf (sof raqamli sanalarni chetlab o'tadi).
// Lookaround `-`/`=`/hex'ni chetlab o'tadi: UUID-prefiks (`1519595d-5c88-…`) va
// query-param qiymati (`agentOwnerId=1519595d`) commit-hash EMAS — bizning handoff'da
// haqiqiy hash backtick/probel bilan o'raladi, hech qachon `=`/`-` ga yopishmaydi.
// (2026-06-12 11r: `1519595d` (Admin User emp UUID) false-positive ANOMALIYA berardi.)
// Record-ID istisnosi (2026-06-20 06-20s): bir xil 8-hex HAM `=qiymat` ko'rinishida
// (`?fromOrder=a3445bc9`) HAM nasrda backtick bilan (`buyurtma `a3445bc9` saqladi`)
// ko'rinsa — bu DB record-id (jonli-E2E buyurtma id'si), commit EMAS. `=`-dan keyin
// uchragan har hex'ni nomzodlardan chiqaramiz (backtick-versiyasi ham tushib qoladi).
const recordIdValues = new Set(topRegion.match(/(?<=[=])[0-9a-f]{8}(?![0-9a-f])/g) ?? []);
const hashes = [
  ...new Set(topRegion.match(/(?<![0-9a-f=_-])[0-9a-f]{8}(?![0-9a-f_-])/g) ?? []),
].filter((h) => /[a-f]/.test(h) && !recordIdValues.has(h));
// `^{commit}` ISHLATILMAYDI: Windows'da execSync=cmd.exe, cmd `^`ni escape sifatida
// yutadi → har hash yolg'ondan "yo'q" chiqadi (birinchi yugurishda jonli tutilgan bug).
const missing = hashes.filter((h) => {
  try {
    return sh(`git cat-file -t ${h}`) !== 'commit';
  } catch {
    return true;
  }
});
if (missing.length) {
  issues.push(`NEXT.md top-entry'larda git'da YO'Q hash'lar: ${missing.join(', ')}`);
} else {
  infos.push(`NEXT.md hash'lari: ${hashes.length}/${hashes.length} git'da mavjud`);
}

const entryDates = topRegion.match(/2026-\d{2}-\d{2}/g) ?? [];
const newestEntry = entryDates.sort().at(-1) ?? '1970-01-01';
const lastCommitDate = sh('git log -1 --format=%as');
if (lastCommitDate > newestEntry) {
  const gapDays =
    (new Date(lastCommitDate).getTime() - new Date(newestEntry).getTime()) / 86_400_000;
  if (gapDays >= 1) {
    issues.push(
      `hand-off drift: oxirgi commit ${lastCommitDate}, NEXT.md eng yangi entry ${newestEntry} (${gapDays.toFixed(0)} kun orqada)`,
    );
  }
}

// ── 4. progress.json konsistensiya
const prog = JSON.parse(readFileSync('docs/progress.json', 'utf8'));
const uc = prog.ui_conventions;
if (uc) {
  const lockedListed = (uc.conventions ?? []).filter((c) => c.locked).length;
  if (uc.locked !== lockedListed) {
    issues.push(`ui_conventions.locked=${uc.locked} ≠ ro'yxatdagi locked=${lockedListed}`);
  } else {
    infos.push(`ui_conventions: ${uc.locked}/${uc.total} locked`);
  }
}
if (prog.phase2) {
  infos.push(
    `phase2: ${prog.phase2.pct}% (${prog.phase2.cohorts_done ?? '?'} cohort)` +
      (prog.phase2.not_production_ready ? ' · production-ready EMAS' : ''),
  );
}
infos.push(
  `detail: ${prog.detail_pages?.audited}/${prog.detail_pages?.total_target} · list_audits: ${prog.list_audits?.audited}`,
);

// ── 5. MEMORY.md limiti
const memPath = 'C:\\Users\\user\\.claude\\projects\\d--projects-moysklad\\memory\\MEMORY.md';
if (existsSync(memPath)) {
  const kb = statSync(memPath).size / 1024;
  if (kb > 24.4) issues.push(`MEMORY.md ${kb.toFixed(1)}KB > 24.4KB auto-load limiti (trim kerak)`);
  else infos.push(`MEMORY.md: ${kb.toFixed(1)}KB (limit ichida)`);
}

// ── 6. portlar (axborot)
const checkPort = (port) =>
  new Promise((resolve) => {
    const s = net.connect({ port, host: '127.0.0.1' });
    const done = (up) => {
      s.destroy();
      resolve(up);
    };
    s.once('connect', () => done(true));
    s.once('error', () => done(false));
    s.setTimeout(800, () => done(false));
  });

const ports = await Promise.all([3100, 4000, 5433].map(checkPort));
infos.push(
  `stack: web ${ports[0] ? 'UP' : 'down'} · api ${ports[1] ? 'UP' : 'down'} · db ${ports[2] ? 'UP' : 'down'}` +
    (ports.every(Boolean) ? '' : '  (runtime-ish uchun `pnpm dev` kerak; docs-ish uchun shart emas)'),
);

// ── optional harness
if (process.argv.includes('--harness')) {
  console.log('▶ optimistic-lock jonli harness...');
  const r = spawnSync('node', ['scripts/verify-optimistic-lock-smoke.mjs'], {
    stdio: 'inherit',
    timeout: 600_000,
  });
  if (r.status !== 0) issues.push('optimistic-lock harness YIQILDI (yuqoridagi chiqishga qara)');
}

// ── verdikt
console.log('\n— PRE-FLIGHT —');
for (const l of infos) console.log('  ✓ ' + l.replace(/\n/g, '\n    '));
console.log('  · oxirgi 5 commit:');
console.log(
  sh('git log --oneline -5')
    .split('\n')
    .map((l) => '      ' + l)
    .join('\n'),
);
if (issues.length) {
  console.log('\n⚠ ANOMALIYA (' + issues.length + ') — session-start-audit agentini yuboring:');
  for (const i of issues) console.log('  ✗ ' + i.replace(/\n/g, '\n    '));
  process.exit(1);
}
console.log('\n✅ GO — audit-workflow KERAK EMAS, ishni boshlang.');
