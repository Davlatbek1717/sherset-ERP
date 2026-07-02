/* eslint-disable no-console */
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { summarize, validateFsmFile } from '../validate.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FSM_DIR = path.resolve(__dirname, '../../../../docs/moysklad-reference/workflows');

async function main(): Promise<void> {
  const entries = await readdir(FSM_DIR);
  const fsmFiles = entries
    .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
    .map((f) => path.join(FSM_DIR, f));

  console.log(`Found ${fsmFiles.length} FSM JSON file(s) in ${FSM_DIR}`);

  const results = await Promise.all(fsmFiles.map(validateFsmFile));

  for (const r of results) {
    if (r.ok) {
      console.log(`✓ ${path.basename(r.file)}`);
    } else {
      console.log(`✗ ${path.basename(r.file)}`);
      for (const err of r.errors) {
        console.log(`    ${err.path}: ${err.message}`);
      }
    }
  }

  const sum = summarize(results);
  console.log();
  console.log(`Summary: ${sum.valid}/${sum.total} valid, ${sum.invalid} invalid`);

  if (sum.invalid > 0) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
