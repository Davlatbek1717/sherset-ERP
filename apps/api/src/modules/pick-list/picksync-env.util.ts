import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Pick-list sync configuration source: process env first, then the 0600
 * `.picksync.env` file (KEY=VALUE lines) at the repo root / process cwd —
 * the shared prod box's pm2 env snapshot is awkward to extend, a file isn't.
 * File content is cached after the first read.
 */
let cachedFileVars: Map<string, string> | null | undefined;

function fileVars(): Map<string, string> | null {
  if (cachedFileVars !== undefined) return cachedFileVars;
  cachedFileVars = null;
  try {
    const candidates = [
      join(process.cwd(), '.picksync.env'),
      join(process.cwd(), '..', '..', '.picksync.env'),
    ];
    const p = candidates.find((c) => existsSync(c));
    if (p) {
      const vars = new Map<string, string>();
      for (const line of readFileSync(p, 'utf8').split('\n')) {
        const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/);
        if (m?.[1] && m[2]) vars.set(m[1], m[2].replace(/^['"]|['"]$/g, ''));
      }
      cachedFileVars = vars;
    }
  } catch {
    // unreadable file = unset vars
  }
  return cachedFileVars;
}

export function picksyncVar(name: string): string | null {
  return process.env[name] ?? fileVars()?.get(name) ?? null;
}

/** Comma-separated store names the UI should show; empty = show everything.
 *  (Owner 2026-07-27: «hozircha faqat Иподром Склад — keyingilari keyin».) */
export function allowedStoreNames(): string[] {
  const raw = picksyncVar('MOYSKLAD_SYNC_STORES');
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
