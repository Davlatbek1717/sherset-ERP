#!/usr/bin/env node
/**
 * Commit'dan KEYIN: tarkibi men stage qilgan narsaga mos keldimi?
 *
 * `post-commit` hook commit'ni bekor qila olmaydi (git shunday ishlaydi), lekin
 * BALAND OVOZDA ogohlantirishi mumkin — va bu yetarli, chunki hali push
 * qilinmagan: `git reset --soft HEAD~1` bilan bir daqiqada tuzatiladi.
 *
 * Real hodisa (2026-08-02): 12 fayl stage qilingan, 16 tasi commit'ga tushgan —
 * qolgan 4 tasi parallel sessiyaning ishlanayotgan fayllari edi (lint-staged
 * butun daraxtni stash qilib tiklaganda qo'shilgan). Commit muvaffaqiyatli
 * bo'ldi, testlar yashil edi, hech narsa shikoyat qilmadi.
 *
 * Bir nechta fayl ATAYLAB qo'shiladi — ular kutilgan deb belgilangan
 * (`pre-commit` hook `docs/progress.json` ni o'zi qo'shadi).
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/** Hook'lar o'zi qo'shadigan fayllar — «begona» hisoblanmaydi. */
const EXPECTED_EXTRA = new Set(['docs/progress.json']);

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

try {
  const gitDir = git('rev-parse', '--absolute-git-dir');
  const snapPath = path.join(gitDir, 'staged-snapshot.json');
  if (!fs.existsSync(snapPath)) process.exit(0);

  const snap = JSON.parse(fs.readFileSync(snapPath, 'utf8'));
  fs.rmSync(snapPath, { force: true }); // bir martalik

  const committed = git('show', '--pretty=', '--name-only', 'HEAD')
    .split('\n')
    .filter(Boolean);

  const stagedSet = new Set(snap.staged ?? []);
  const extra = committed.filter((f) => !stagedSet.has(f) && !EXPECTED_EXTRA.has(f));
  if (extra.length === 0) process.exit(0);

  const head = git('rev-parse', '--short', 'HEAD');
  process.stderr.write(
    [
      '',
      '[1;31m✗ COMMIT TARKIBI STAGE QILINGANIDAN FARQ QILADI[0m',
      `  commit ${head} ga siz stage QILMAGAN ${extra.length} fayl tushdi:`,
      ...extra.map((f) => `      ${f}`),
      '',
      '  Ehtimoliy sabab: parallel sessiya shu payt ishlayapti va lint-staged',
      '  butun daraxtni stash qilib tiklaganda ularni qo’shib yuborgan',
      '  (CLAUDE.md §6.7). Ish YO’QOLMAGAN — shunchaki notog’ri commit’da.',
      '',
      '  [1mPush QILINMAGAN bo’lsa tuzatish:[0m',
      '      git reset --soft HEAD~1',
      `      git restore --staged ${extra.slice(0, 3).join(' ')}${extra.length > 3 ? ' …' : ''}`,
      '      git -c core.hooksPath=/dev/null commit -F <xabar-fayli>',
      '  (oxirgi qadam hook’larsiz — aks holda lint-staged yana qo’shadi;',
      '   gate’larni qo’lda yugurtirib, commit xabarida shuni yozing)',
      '',
    ].join('\n'),
  );
} catch {
  // Tekshiruv o'zi yiqilsa jim qolamiz — bu qo'shimcha himoya.
}
