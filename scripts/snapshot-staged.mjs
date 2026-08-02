#!/usr/bin/env node
/**
 * Commit BOSHIDA stage qilingan fayllar ro'yxatini yozib qo'yadi.
 *
 * Juftligi — `verify-commit-contents.mjs` (post-commit). Ikkalasi birgalikda
 * bitta savolga javob beradi: «men stage qilgan narsa commit'ga tushdimi, va
 * FAQAT o'shami?»
 *
 * Nega kerak (2026-08-02, real hodisa): `git add` FAQAT aniq yo'llar bilan
 * qilingan edi (12 fayl), commit'ga esa 16 tasi tushdi — lint-staged butun
 * daraxtni stash qilib tiklaganda parallel sessiyaning 4 fayli qo'shilib ketdi.
 * Buni hech qanday gate tutmasdi: commit muvaffaqiyatli, testlar yashil, va
 * begona ish sizning nomingiz ostida tarixga kirib ketadi.
 *
 * Snapshot `.git/` ichida saqlanadi — repo tarixiga tushmaydi.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

try {
  const gitDir = git('rev-parse', '--absolute-git-dir');
  // `--cached` = index; commit aynan shundan quriladi.
  const staged = git('diff', '--cached', '--name-only').split('\n').filter(Boolean).sort();
  fs.writeFileSync(
    path.join(gitDir, 'staged-snapshot.json'),
    JSON.stringify({ at: new Date().toISOString(), staged }, null, 2),
  );
} catch {
  // Snapshot ololmaslik commit'ni TO'XTATMASLIGI kerak — bu qo'shimcha
  // himoya, majburiy bosqich emas.
}
