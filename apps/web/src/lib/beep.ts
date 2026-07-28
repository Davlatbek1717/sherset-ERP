/**
 * Short scan-feedback beep (Web Audio). No-arg, safe to call rapidly and on
 * every read — the cell scan/count flows call it to confirm a successful scan.
 *
 * Sherset-authored equivalent of climart's `@/lib/beep` (the source file could
 * not be pulled over the flaky link during the 2026-07-28 warehouse port); the
 * call site is `beep()` with no arguments, matched here. Silent + non-fatal
 * when audio is unavailable (autoplay policy / no output device / SSR).
 */
let ctx: AudioContext | null = null;

export function beep(): void {
  if (typeof window === 'undefined') return;
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    ctx ??= new Ctor();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.value = 0.08;
    osc.connect(gain).connect(ctx.destination);
    const now = ctx.currentTime;
    osc.start(now);
    osc.stop(now + 0.09);
  } catch {
    // no audio available — non-fatal, scan still works
  }
}
