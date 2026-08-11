/**
 * `window.customerDisplay` — MIJOZ-EKRAN oynasining ko'prigi (spec §6.5).
 *
 * 🔴 Bu `preload.js` DAN ALOHIDA fayl va ataylab shunday: kassir oynasi
 * `window.electronAPI` (chop etish, qurilma kaliti, savat yuborish) bilan
 * ishlaydi, mijoz-ekran oynasi esa faqat savatni QABUL QILADI. Ikkinchi
 * oynaga qurilma kaliti metodlarini bermaslik — kassa siri mijoz turgan
 * ekranga umuman chiqmasligi kafolati.
 *
 * Shartnoma manbasi: `apps/web/src/app/customer-display/page.tsx` →
 * `interface CustomerBridge` (`onCart(cb)`); qo'riqchi —
 * `apps/web/src/__tests__/electron-bridge-contract.test.ts`.
 *
 * 🔴 Yo'nalish PUSH: savat kassir oynasidan `pushCart` → main → shu oynaga
 * `cfd:cart` bilan KELADI. `invoke`/`sendSync` bo'lsa savat hech qachon
 * yangilanmasdi (sahifa bir marta so'ramaydi, obuna bo'ladi).
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('customerDisplay', {
  onCart: (cb) => {
    if (typeof cb !== 'function') return;
    // Payload main tomonda normallashtiriladi ({ lines, discountPct }) —
    // sahifa `p.lines.map(...)` qiladi, `undefined` uni yiqitardi.
    ipcRenderer.on('cfd:cart', (_event, payload) => cb(payload));
  },
});
