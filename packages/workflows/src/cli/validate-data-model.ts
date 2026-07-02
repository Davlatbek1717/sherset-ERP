/* eslint-disable no-console */
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateDataModelFile } from '../data-model-validate.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_MODEL_DIR = path.resolve(__dirname, '../../../../docs/moysklad-reference/data-model');

async function listJsonFiles(subdir: string): Promise<string[]> {
  const dir = path.join(DATA_MODEL_DIR, subdir);
  const entries = await readdir(dir);
  return entries.filter((f) => f.endsWith('.json')).map((f) => path.join(dir, f));
}

async function main(): Promise<void> {
  const entitySchemas = await listJsonFiles('entity-schemas');
  const documentSchemas = await listJsonFiles('document-schemas');
  const allFiles = [...entitySchemas, ...documentSchemas];

  console.log(
    `Found ${entitySchemas.length} entity + ${documentSchemas.length} document = ${allFiles.length} schema file(s)`,
  );

  const results = await Promise.all(allFiles.map(validateDataModelFile));

  let invalidCount = 0;
  for (const r of results) {
    const rel = path.relative(DATA_MODEL_DIR, r.file).replace(/\\/g, '/');
    if (r.ok) {
      console.log(`✓ ${rel}`);
    } else {
      invalidCount++;
      console.log(`✗ ${rel}`);
      for (const err of r.errors) {
        console.log(`    ${err.path}: ${err.message}`);
      }
    }
  }

  console.log();
  console.log(
    `Summary: ${results.length - invalidCount}/${results.length} valid, ${invalidCount} invalid`,
  );

  if (invalidCount > 0) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
