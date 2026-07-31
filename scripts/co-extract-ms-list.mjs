// Extract the customer-orders LIST structure from the archived moysklad DOM dump.
// DOM-role aware (CLAUDE.md §4): a term counts only when it is element CONTENT
// (>TERM<) or a column-header title="TERM" — never a substring of prose.
import fs from 'node:fs';

const html = fs.readFileSync('audit/moysklad/customer-orders-list.html', 'utf8');

const out = {};

// --- column headers: moysklad GWT grid renders them as title="…" on header cells
const titles = [...html.matchAll(/title="([^"<>]{2,40})"/g)].map((m) => m[1]);
const freq = {};
for (const t of titles) freq[t] = (freq[t] || 0) + 1;
out.titleAttrs = Object.entries(freq).sort((a, b) => b[1] - a[1]);

// --- element-content Cyrillic tokens (>TERM<) = real labels/buttons/headers
const content = [...html.matchAll(/>([^<>{}]{2,45})</g)]
  .map((m) => m[1].replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim())
  .filter((t) => /[А-Яа-яЁё]/.test(t));
const cfreq = {};
for (const t of content) cfreq[t] = (cfreq[t] || 0) + 1;
out.elementContent = Object.entries(cfreq).sort((a, b) => b[1] - a[1]);

fs.writeFileSync(process.argv[2] || '.audit-co/ms-list-extract.json', JSON.stringify(out, null, 2));
console.log('titleAttrs:', out.titleAttrs.length, 'elementContent:', out.elementContent.length);
console.log('\n--- title="" (column headers likely) ---');
console.log(out.titleAttrs.filter(([t]) => /[А-Яа-яЁё]/.test(t)).map(([t, n]) => `${n}× ${t}`).join('\n'));
console.log('\n--- element content (top 120) ---');
console.log(out.elementContent.slice(0, 120).map(([t, n]) => `${n}× ${t}`).join('\n'));
