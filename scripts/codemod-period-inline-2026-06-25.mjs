// CODEMOD — convert filter «Период»/«Когда изменен» fields from the legacy
// combined <PeriodPicker> (label / shortcuts / inputs stacked on 3 rows) to the
// moysklad period-filter-widget2 layout: label + вч·сег·нед·мес presets INLINE on
// one row (Field inlineSuffix=<PeriodShortcuts/>), date inputs below (<PeriodInputs/>).
//
// Transforms blocks of the shape:
//   <InlineFilterPanel.Field label={X} expandable>
//     <PeriodPicker from={F} to={T} onChange={H} labels={L} testId="..." />
//   </InlineFilterPanel.Field>
// and rewrites the @moysklad/ui import (PeriodPicker → PeriodInputs+PeriodShortcuts).
//
// Brace/quote-aware (onChange + labels hold nested {}). DRY=1 prints a report
// without writing. Run biome after applying — emitted JSX is intentionally loose.
import { readFileSync, writeFileSync } from 'node:fs';

const DRY = process.env.DRY === '1';
const files = process.argv.slice(2);
if (!files.length) {
  console.error('usage: node codemod-period-inline.mjs <file...> [DRY=1]');
  process.exit(2);
}

/** From `s` at index `i` (pointing AT the opening delim), return the index just
 *  past the matching closer. Handles {…} (brace depth) and "…" / '…' strings. */
function matchDelim(s, i) {
  const open = s[i];
  if (open === '"' || open === "'") {
    for (let j = i + 1; j < s.length; j++) {
      if (s[j] === '\\') j++;
      else if (s[j] === open) return j + 1;
    }
    throw new Error('unterminated string');
  }
  if (open === '{') {
    let depth = 0;
    for (let j = i; j < s.length; j++) {
      const c = s[j];
      if (c === '"' || c === "'") {
        j = matchDelim(s, j) - 1;
        continue;
      }
      if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) return j + 1;
      }
    }
    throw new Error('unbalanced braces');
  }
  throw new Error(`not a delimiter at ${i}: ${open}`);
}

/** Extract a JSX prop's raw value text INCLUDING delimiters, e.g. `{a.b}` or `"x"`. */
function extractProp(props, name) {
  const re = new RegExp(`\\b${name}\\s*=\\s*`);
  const m = re.exec(props);
  if (!m) return null;
  const start = m.index + m[0].length;
  const end = matchDelim(props, start);
  return props.slice(start, end);
}

let totalBlocks = 0;
for (const file of files) {
  let src = readFileSync(file, 'utf8');
  let count = 0;
  let cursor = 0;
  let out = '';
  while (true) {
    const idxPP = src.indexOf('<PeriodPicker', cursor);
    if (idxPP === -1) {
      out += src.slice(cursor);
      break;
    }
    const idxFieldOpen = src.lastIndexOf('<InlineFilterPanel.Field', idxPP);
    const fieldOpenEnd = src.indexOf('>', idxFieldOpen); // first > closes the open tag
    const fieldAttrs = src.slice(idxFieldOpen + '<InlineFilterPanel.Field'.length, fieldOpenEnd);
    const label = extractProp(fieldAttrs, 'label');
    const ppClose = src.indexOf('/>', idxPP);
    const ppProps = src.slice(idxPP + '<PeriodPicker'.length, ppClose);
    const from = extractProp(ppProps, 'from');
    const to = extractProp(ppProps, 'to');
    const onChange = extractProp(ppProps, 'onChange');
    const labels = extractProp(ppProps, 'labels');
    const testId = extractProp(ppProps, 'testId');
    const fieldClose = src.indexOf('</InlineFilterPanel.Field>', ppClose);
    const blockEnd = fieldClose + '</InlineFilterPanel.Field>'.length;

    if (!label || !from || !to || !onChange || !labels) {
      console.error(`! ${file}: could not parse a PeriodPicker block near offset ${idxPP} — SKIPPED`);
      out += src.slice(cursor, blockEnd);
      cursor = blockEnd;
      continue;
    }

    // extractProp returns values WITH their delimiters ({…} or "…"), so the
    // template must NOT re-wrap them in braces (the v1 bug minted label={{…}}).
    const testIdAttr = testId ? ` testId=${testId}` : '';
    const block =
      `<InlineFilterPanel.Field\n` +
      `  label=${label}\n` +
      `  inlineSuffix={<PeriodShortcuts onChange=${onChange} labels=${labels} />}\n` +
      `  expandable\n` +
      `>\n` +
      `  <PeriodInputs from=${from} to=${to} onChange=${onChange}${testIdAttr} />\n` +
      `</InlineFilterPanel.Field>`;

    out += src.slice(cursor, idxFieldOpen) + block;
    cursor = blockEnd;
    count++;
  }

  // import rewrite: PeriodPicker → PeriodInputs + PeriodShortcuts (only if we
  // converted something and PeriodPicker is no longer used in the body).
  if (count > 0) {
    out = out.replace(/^(\s*)PeriodPicker,\s*$/m, `$1PeriodInputs,\n$1PeriodShortcuts,`);
  }

  totalBlocks += count;
  console.log(`${DRY ? '[dry] ' : ''}${file}: ${count} field(s) converted`);
  if (count > 0 && !DRY) writeFileSync(file, out);
}
console.log(`\n${DRY ? '[dry] ' : ''}TOTAL: ${totalBlocks} period field(s) across ${files.length} file(s)`);
