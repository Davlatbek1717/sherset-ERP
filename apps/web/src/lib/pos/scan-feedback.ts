/**
 * Skaner-javob tovushlari — WebAudio, ASSET'SIZ (POS redizayn F3, spec §5.1).
 *
 * Nega WebAudio: audio-fayl kerak emas (offline kiosk qobig'ida yo'qolib
 * qolmaydi), kechikish ~0 (skaner «pip» iga javob darhol eshitiladi).
 *
 * Shartnoma:
 *   · `ok()` — baland qisqa ton: tovar savatga tushdi;
 *   · `notFound()` — past ton ×2: qidiruv/skaner hech narsa topmadi;
 *   · qurilmasiz muhitda (happy-dom testlari, `AudioContext` yo'q) IKKALASI
 *     ham JIM no-op — tovush qulaylik, xatosi savdoni to'xtatmasligi shart.
 *
 * Kontekst YAGONA nusxada kesh qilinadi: brauzerlar sahifaga ~6 ta
 * AudioContext bilan cheklov qo'yadi, har bip'ga yangisini ochish taqiq.
 */

type Note = {
  /** Chastota, Hz. */
  freq: number;
  /** Boshlanish siljishi, soniya (chaqiruv onidan). */
  at: number;
  /** Davomiylik, soniya. */
  dur: number;
};

let cachedCtx: AudioContext | null = null;

function play(notes: Note[]): void {
  try {
    const AC =
      typeof window !== 'undefined'
        ? (window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
        : undefined;
    if (!AC) return;
    cachedCtx ??= new AC();
    const ctx = cachedCtx;
    // Autoplay-siyosati kontekstni `suspended` holatda ochishi mumkin —
    // POS'da har bip foydalanuvchi harakatidan keyin keladi, resume yetadi.
    if (ctx.state === 'suspended') void ctx.resume();
    const t0 = ctx.currentTime;
    for (const n of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = n.freq;
      // Qisqa konvert — boshlanish/tugashdagi «chirt» (click) ni yumshatadi.
      gain.gain.setValueAtTime(0.12, t0 + n.at);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + n.at + n.dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0 + n.at);
      osc.stop(t0 + n.at + n.dur);
    }
  } catch {
    // Tovush chiqmadi — savdo baribir davom etadi (yuqoridagi shartnoma).
  }
}

export const scanFeedback = {
  /** Tovar savatga tushdi — baland qisqa «bip». */
  ok(): void {
    play([{ freq: 1760, at: 0, dur: 0.09 }]);
  },
  /** Topilmadi — past ton ×2 (600ms ichida tugaydi). */
  notFound(): void {
    play([
      { freq: 220, at: 0, dur: 0.14 },
      { freq: 220, at: 0.2, dur: 0.14 },
    ]);
  },
};

/** FAQAT testlar uchun — kesh qilingan kontekstni tashlaydi. */
export function __resetScanFeedbackForTests(): void {
  cachedCtx = null;
}
