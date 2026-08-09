/**
 * Minimal in-process TTL cache for read-only report aggregates (PERF-06).
 *
 * Why in-process and not Redis: the API runs `exec_mode: 'fork'`, `instances: 1`
 * (deploy/ecosystem.config.cjs), so a module-local Map IS the process cache —
 * there is no second replica to keep coherent. Adding a network cache would
 * buy nothing here and add an operational dependency.
 *
 * Contract, deliberately narrow:
 *  - **Read-only aggregates only.** A cached value is up to `ttlMs` stale by
 *    construction; never put anything a mutation must observe immediately
 *    behind it (balances a document posts against, permission checks, …).
 *  - **The key MUST carry the tenant.** Every caller keys by `accountId` (plus
 *    whatever else the value depends on). A key that forgets it leaks one
 *    account's numbers to another — `dashboard.service.test.ts` locks this.
 *  - **In-flight sharing.** The pending promise is what gets stored, so N
 *    concurrent callers of a cold key run the loader ONCE (a dashboard opened
 *    by 50 users at 09:00 must not fire 50 whole-history UNION aggregates).
 *    A rejected load is evicted immediately, so failures are never cached.
 */
export class TtlCache<T> {
  private readonly entries = new Map<string, { value: Promise<T>; expiresAt: number }>();

  /**
   * @param ttlMs      How long a loaded value stays servable.
   * @param maxEntries Hard cap on distinct keys (multi-tenant safety valve).
   *                   Oldest-inserted keys are dropped first — Map preserves
   *                   insertion order, and every entry is re-inserted on
   *                   refresh, so the victim is the least recently *loaded*.
   */
  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries = 500,
  ) {}

  async getOrLoad(key: string, load: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const hit = this.entries.get(key);
    if (hit && hit.expiresAt > now) return hit.value;

    const value = load();
    this.entries.set(key, { value, expiresAt: now + this.ttlMs });
    // A failed load must not be served (nor kept until the TTL runs out).
    value.catch(() => {
      if (this.entries.get(key)?.value === value) this.entries.delete(key);
    });
    this.prune(now);
    return value;
  }

  /** Drop every cached value (tests; a future explicit-invalidate hook). */
  clear(): void {
    this.entries.clear();
  }

  private prune(now: number): void {
    if (this.entries.size <= this.maxEntries) return;
    for (const [k, e] of this.entries) {
      if (e.expiresAt <= now) this.entries.delete(k);
    }
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.entries.delete(oldest.value);
    }
  }
}
