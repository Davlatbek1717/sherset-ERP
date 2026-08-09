import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isCronLeader } from './cron-leader.js';

// `vi.stubEnv(name, undefined)` REMOVES the variable (assigning undefined
// would store the string 'undefined' — exactly the trap this guard must not
// fall into).
beforeEach(() => {
  vi.stubEnv('NODE_APP_INSTANCE', undefined);
  vi.stubEnv('CRON_WORKERS_DISABLED', undefined);
  vi.stubEnv('pm_id', undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('isCronLeader', () => {
  it('plain node / dev (no pm2 env) → leader', () => {
    expect(isCronLeader()).toBe(true);
  });

  it('pm2 fork mode (NODE_APP_INSTANCE=0) → leader', () => {
    vi.stubEnv('NODE_APP_INSTANCE', '0');
    expect(isCronLeader()).toBe(true);
  });

  it('pm2 cluster replica #1/#2 → NOT leader', () => {
    vi.stubEnv('NODE_APP_INSTANCE', '1');
    expect(isCronLeader()).toBe(false);
    vi.stubEnv('NODE_APP_INSTANCE', '2');
    expect(isCronLeader()).toBe(false);
  });

  it('empty NODE_APP_INSTANCE is treated as absent → leader', () => {
    vi.stubEnv('NODE_APP_INSTANCE', '');
    expect(isCronLeader()).toBe(true);
  });

  it('CRON_WORKERS_DISABLED=1 kills the crons even on the leader', () => {
    vi.stubEnv('NODE_APP_INSTANCE', '0');
    vi.stubEnv('CRON_WORKERS_DISABLED', '1');
    expect(isCronLeader()).toBe(false);
  });

  it('ignores pm_id — it is pm2-global, not per-app (api can legitimately be pm_id=1)', () => {
    vi.stubEnv('pm_id', '1');
    expect(isCronLeader()).toBe(true);
  });
});
