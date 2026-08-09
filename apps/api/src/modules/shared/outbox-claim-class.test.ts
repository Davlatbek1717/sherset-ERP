import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Class-lock for the outbox EXCLUSIVE-CLAIM discipline (Faza 28 — INT-08,
 * HR-4, INT-09).
 *
 * Five cron workers drain a queue table by sending to an external provider.
 * Before this fix none of them owned the row while sending:
 *   · hr-telegram-outbox "claimed" with `pending → pending` — a status that
 *     never leaves the sendable set, so a rival worker's identical updateMany
 *     also returned count=1 and BOTH sent the message (HR-4);
 *   · the other four had no claim at all (INT-08);
 *   · all five wrote the outcome only AFTER the provider call, so a crash in
 *     between left the row `pending` for the next tick to re-send (INT-09).
 *
 * Each worker must now: (1) skip work on a non-leader replica, (2) claim the
 * row into `OUTBOX_SENDING` with a lease BEFORE the provider call, (3) reap
 * leases that expired because a worker died mid-send.
 *
 * Non-vacuous: none of these three markers existed in these files before
 * `042b07de..` — the pre-fix hr worker's claim wrote the literal
 * `data: { status: 'pending' }`.
 */

const HERE = import.meta.dirname;
const MODULES_DIR = join(HERE, '..');

/** `data: { status: OUTBOX_SENDING, …` — the claim itself. */
const CLAIM_RE = /data:\s*\{\s*status:\s*OUTBOX_SENDING/;
/** `where: { status: OUTBOX_SENDING, nextRetryAt: { lte: … } }` — the reaper. */
const REAPER_RE = /where:\s*\{\s*status:\s*OUTBOX_SENDING,\s*nextRetryAt:\s*\{\s*lte:/;
/** The pre-fix anti-pattern: a claim that writes the incumbent status back. */
const NO_OP_CLAIM_RE = /data:\s*\{\s*status:\s*'pending'\s*\}/;

const WORKERS = [
  {
    name: 'hr-telegram-outbox',
    file: ['hr', 'hr-telegram-bridge', 'hr-telegram-outbox-worker.service.ts'],
  },
  { name: 'webhook-delivery', file: ['webhook', 'webhook-delivery.service.ts'] },
  { name: 'sms-delivery', file: ['sms', 'sms-delivery.service.ts'] },
  { name: 'email-delivery', file: ['email', 'email-delivery.service.ts'] },
  { name: 'telegram-outbox', file: ['telegram', 'telegram.service.ts'] },
] as const;

function readWorker(file: readonly string[]): string {
  return readFileSync(join(MODULES_DIR, ...file), 'utf8');
}

describe.each(WORKERS)('$name', ({ file }) => {
  const src = readWorker(file);

  it('claims the row into OUTBOX_SENDING (exclusive, leaves the sendable set)', () => {
    expect(src).toMatch(CLAIM_RE);
  });

  it('never re-writes the incumbent `pending` status as a "claim"', () => {
    expect(src).not.toMatch(NO_OP_CLAIM_RE);
  });

  it('stamps a lease and reaps expired ones', () => {
    expect(src).toContain('claimLeaseUntil(');
    expect(src).toMatch(REAPER_RE);
  });

  it('skips work on a non-leader replica', () => {
    expect(src).toContain('isCronLeader()');
  });
});

describe('registry completeness', () => {
  /** Every `*-delivery.service.ts` / `*outbox-worker.service.ts` under modules/. */
  function discover(dir: string, acc: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        discover(full, acc);
      } else if (
        !entry.name.endsWith('.test.ts') &&
        (entry.name.endsWith('-delivery.service.ts') ||
          entry.name.endsWith('outbox-worker.service.ts'))
      ) {
        acc.push(full);
      }
    }
    return acc;
  }

  it('every queue-draining worker on disk is covered by this class-lock', () => {
    const registered = new Set(WORKERS.map((w) => join(MODULES_DIR, ...w.file)));
    const missing = discover(MODULES_DIR).filter((f) => !registered.has(f));
    // A new outbox worker must be added to WORKERS (and given the claim) —
    // otherwise it ships with the duplicate-send bug this phase closed.
    expect(missing).toEqual([]);
  });
});
