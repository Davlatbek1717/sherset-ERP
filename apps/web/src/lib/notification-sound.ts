'use client';

/**
 * F2 — audible notification signal («signal-xabar»): the warehouse keeper must
 * HEAR an incoming 🔔 even when the app tab is in another window / background.
 *
 * Browser autoplay policy: audio may only start after a user gesture. So the
 * stream hook calls `armNotificationSound()` once — it installs a one-time
 * pointerdown/keydown listener that (1) creates+resumes the shared
 * AudioContext and (2) asks for the browser Notification permission. From
 * then on `playNotificationSound()` works even with `document.hidden` (a
 * previously-unlocked AudioContext keeps playing in background tabs).
 *
 * The sound itself is SYNTHESIZED (two-tone ding via WebAudio oscillators) —
 * no .mp3 asset to load or block on.
 */

let ctx: AudioContext | null = null;
let armed = false;

function ensureContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  return ctx;
}

/** One-time unlock: call from a mounted hook; resolves on the first gesture. */
export function armNotificationSound(): void {
  if (armed || typeof window === 'undefined') return;
  armed = true;
  const unlock = () => {
    const c = ensureContext();
    if (c && c.state === 'suspended') void c.resume();
    // Browser notification permission — needed for the other-window case
    // (OS-level toast). Asked here because permission prompts also require
    // a user gesture in modern Chrome.
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      void Notification.requestPermission();
    }
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}

/** Two-tone «ding-dong» (~0.5s). Safe to call any time; no-op until unlocked. */
export function playNotificationSound(): void {
  const c = ensureContext();
  if (!c) return;
  // A backgrounded tab (another window) may have auto-suspended the context —
  // the F2 requirement is that the keeper HEARS the ding even then. Resume it
  // (allowed because the context was already unlocked by a prior gesture) and
  // schedule the tones; if resume is async we still emit right after.
  if (c.state === 'suspended') {
    void c
      .resume()
      .then(() => emitDing(c))
      .catch(() => {});
    return;
  }
  if (c.state !== 'running') return;
  emitDing(c);
}

function emitDing(c: AudioContext): void {
  const now = c.currentTime;
  const master = c.createGain();
  master.gain.value = 0.16;
  master.connect(c.destination);
  const tone = (freq: number, start: number, dur: number) => {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, now + start);
    gain.gain.linearRampToValueAtTime(1, now + start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + start + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(now + start);
    osc.stop(now + start + dur + 0.05);
  };
  tone(880, 0, 0.28);
  tone(1174.66, 0.16, 0.34); // D6 — a rising, attention-grabbing second note
}

/**
 * OS-level toast for the other-window/minimized case. The in-page toast is
 * invisible there; `new Notification` shows even when the tab has no focus.
 */
export function showBrowserNotification(title: string, body?: string | null): void {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    const n = new Notification(title, {
      body: body ?? undefined,
      // Reuse one tag so a burst of events doesn't stack dozens of toasts.
      tag: 'moysklad-notification',
    });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    // Notification constructor can throw on some platforms (e.g. Android
    // Chrome requires ServiceWorker) — the in-app toast + sound still fired.
  }
}
