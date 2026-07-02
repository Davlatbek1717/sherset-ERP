import { mkdir } from 'node:fs/promises';
import path from 'node:path';

/** Ensure a directory exists. Returns the path for chaining. */
export async function ensureDir(dir: string): Promise<string> {
  await mkdir(dir, { recursive: true });
  return dir;
}

/** Make a file path safe (slugify). Preserves hyphens and basic ASCII. */
export function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

/** Ensure a file's parent directory exists. */
export async function ensureParent(filePath: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
}
