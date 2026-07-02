// Reorder the customer-orders filter Field blocks to match the live moysklad
// #customerorder filter order (grounded 2026-06-25, docs/audits/ms-co-filter-ground-2026-06-25.png):
//   Период · Оплата · Отгружено · Товар или группа · Склад · Проект ·
//   Контрагент · Организация · Счет организации · Статус · [custom: Уста · Санаси]
// Move product + store + project to sit right after the «shipment» (Отгружено)
// block, before «reserve»/«agent». Static, brace-aware, idempotent-ish (run once).
// DRY=1 prints the plan without writing.
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = 'apps/web/src/app/(app)/customer-orders/page.tsx';
let src = readFileSync(FILE, 'utf8');
const DRY = process.env.DRY === '1';

const OPEN = '<InlineFilterPanel.Field';
const CLOSE = '</InlineFilterPanel.Field>';

// Find the static Field block carrying fieldKey="KEY" (the literal attribute, so
// the dynamic custom-attr fields with `fieldKey={fieldKey}` are never matched).
function blockByFieldKey(key) {
  const marker = `fieldKey="${key}"`;
  const mIdx = src.indexOf(marker);
  if (mIdx < 0) throw new Error(`fieldKey ${key} not found`);
  let openStart = src.lastIndexOf(OPEN, mIdx);
  // pull in the indentation on the open line
  const lineStart = src.lastIndexOf('\n', openStart) + 1;
  openStart = lineStart;
  const closeIdx = src.indexOf(CLOSE, mIdx);
  if (closeIdx < 0) throw new Error(`close for ${key} not found`);
  let end = closeIdx + CLOSE.length;
  // swallow the trailing newline
  if (src[end] === '\n') end += 1;
  return { key, start: openStart, end, text: src.slice(openStart, end) };
}

// Insertion point: right after the «shipment» block's close.
const shipment = blockByFieldKey('shipment');
const product = blockByFieldKey('product');
const store = blockByFieldKey('store');
const project = blockByFieldKey('project');

if (DRY) {
  for (const b of [shipment, product, store, project]) {
    console.log(`--- ${b.key} [${b.start}..${b.end}] ---\n${b.text.slice(0, 90).replace(/\n/g, '\\n')}…`);
  }
}

// Build: remove product/store/project from their spots, insert (product, store,
// project) right after shipment.end. Work on offsets carefully.
const toRemove = [product, store, project].sort((a, b) => a.start - b.start);
// sanity: none of the removed blocks overlap shipment
const insertAfter = shipment.end;
const moved = product.text + store.text + project.text;

// Construct the new string by scanning and skipping removed ranges, inserting at insertAfter.
let out = '';
let cursor = 0;
const points = [];
for (const b of toRemove) points.push(['remove', b.start, b.end]);
points.push(['insert', insertAfter, insertAfter]);
points.sort((a, b) => a[1] - b[1] || (a[0] === 'insert' ? 1 : -1));

for (const [kind, s, e] of points) {
  out += src.slice(cursor, s);
  if (kind === 'insert') out += moved;
  cursor = e; // for remove, skip the block; for insert, e===s (no skip)
}
out += src.slice(cursor);

// guard: the moved blocks must now appear exactly once each, right after shipment
const afterShip = out.indexOf(CLOSE, out.indexOf('fieldKey="shipment"')) ;
console.log(DRY ? '[dry] ' : '', 'product count:', (out.match(/fieldKey="product"/g) || []).length,
  'store count:', (out.match(/fieldKey="store"/g) || []).length,
  'project count:', (out.match(/fieldKey="project"/g) || []).length);

if (!DRY) { writeFileSync(FILE, out); console.log('reordered', FILE); }
else console.log('[dry] would write; new length', out.length, 'vs', src.length);
