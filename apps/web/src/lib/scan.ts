/**
 * Phone-scan helpers (USER-DIRECTED 2026-07-05).
 *
 * Printed labels carry a plain Code 128 BARCODE of the raw product token
 * (user rule 2026-07-05: no QR anywhere) — hardware scanners and the /scan
 * camera read it and resolve it through the products search. The URL form
 * below is still normalized away defensively: /scan?c=<code> deep-links can
 * arrive by hand (typed, shared) and a few QR labels printed during the
 * brief QR era carried them.
 */

/**
 * Peel the product code out of a scanned value:
 *   "https://host/scan?c=4780…"  → "4780…"
 *   "host/scan?c=4780…"          → "4780…"  (some scanners drop the scheme)
 *   "4780…"                      → "4780…"  (raw code, old labels)
 */
export function normalizeScanInput(raw: string): string {
  const s = raw.trim();
  if (!s.includes('/scan?') && !s.startsWith('scan?')) return s;
  const query = s.slice(s.indexOf('?') + 1);
  for (const pair of query.split('&')) {
    const [k, v = ''] = pair.split('=');
    if (k === 'c') {
      try {
        return decodeURIComponent(v);
      } catch {
        return v;
      }
    }
  }
  return s;
}
