/**
 * One-shot codegen: injects `cellText` accessors into list-page column
 * definitions that follow the multi-line `{ key: 'X', ... }` pattern.
 *
 * Run from repo root: `node tools/scripts/inject-celltext.mjs`.
 *
 * Only inserts a new `cellText` line when the column block is multi-line
 * AND doesn't already declare `cellText:`. The accessor is chosen from
 * `accessorMap` keyed by the column's `key`.
 */
import fs from 'node:fs';
import path from 'node:path';

const accessorMap = {
  name: `(r: any) => r.name`,
  moment: `(r: any) => formatDate(r.moment)`,
  agent: `(r: any) => r.agent?.legalTitle ? r.agent.name + ' (' + r.agent.legalTitle + ')' : (r.agent?.name ?? '')`,
  state: `(r: any) => r.state`,
  description: `(r: any) => r.description ?? ''`,
  organization: `(r: any) => r.organization?.name ?? ''`,
  reason: `(r: any) => r.reason ?? ''`,
  sum: `(r: any) => r.sumMinor ? formatMoney(r.sumMinor) : ''`,
  sum_total: `(r: any) => r.sumMinor ? formatMoney(r.sumMinor) : ''`,
  payed_sum: `(r: any) => r.payedSumMinor ? formatMoney(r.payedSumMinor) : ''`,
  positions: `(r: any) => String(r._count?.positions ?? '')`,
  posted_at: `(r: any) => r.postedAt ? formatDate(r.postedAt) : ''`,
};

const pages = [
  'customer-orders',
  'demands',
  'invoices-out',
  'supplies',
  'payments-in',
  'purchase-orders',
  'invoices-in',
  'payments-out',
  'purchase-returns',
  'moves',
  'losses',
  'enters',
  'inventories',
  'counterparties',
  'products',
];

for (const slug of pages) {
  const filePath = path.join('apps/web/src/app/(app)', slug, 'page.tsx');
  let src = fs.readFileSync(filePath, 'utf8');
  let touched = 0;

  for (const [key, accessor] of Object.entries(accessorMap)) {
    const keyRe = new RegExp(`\\n(\\s+)key: '${key}',`, 'g');
    let m;
    while ((m = keyRe.exec(src)) !== null) {
      const keyIdx = m.index + 1;
      const keyIndent = m[1];
      const closeIndent = keyIndent.slice(0, Math.max(0, keyIndent.length - 2));
      const closeNeedle = '\n' + closeIndent + '},';
      const closeIdx = src.indexOf(closeNeedle, keyIdx);
      if (closeIdx === -1) continue;
      const block = src.slice(keyIdx, closeIdx);
      if (block.includes('cellText:')) continue;
      if ((block.match(/\n/g) || []).length < 2) continue;
      const insertion = '\n' + keyIndent + 'cellText: ' + accessor + ',';
      src = src.slice(0, closeIdx) + insertion + src.slice(closeIdx);
      touched++;
      keyRe.lastIndex = closeIdx + insertion.length;
    }
  }

  if (touched > 0) {
    fs.writeFileSync(filePath, src);
    console.log('OK:', slug, '(' + touched + ' cols)');
  } else {
    console.log('SKIP:', slug);
  }
}
