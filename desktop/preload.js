/**
 * `window.electronAPI` — ESKI EXE SHARTNOMASI (spec §6.3).
 *
 * 🔴 Bu ro'yxat ikkita web faylidan kelib chiqadi va ular bilan
 * `apps/web/src/__tests__/electron-bridge-contract.test.ts` qo'riqchisi orqali
 * bog'langan:
 *   - `apps/web/src/lib/print-agent.ts` → `interface ElectronBridge`
 *     (isSherset, version, listPrinters, printSheet, pushCart,
 *      toggleCustomerDisplay, customerDisplayStatus)
 *   - `apps/web/src/lib/pos-device.ts`  → `interface ShellBridge`
 *     (getDevice, setDevice, clearDevice)
 * Metod tushib qolsa web tomon JIMGINA zaxira yo'lga tushadi: chop etish
 * brauzer popup'iga, qurilma kaliti esa DPAPI o'rniga `localStorage` ga.
 *
 * 🔴 Qurilma metodlari SINXRON (`sendSync`): `pos-device.ts` natijani darhol
 * tekshiradi, Promise unga «juftlanmagan» bo'lib ko'rinadi.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Web qobiqni shu bayroq bilan taniydi (`print-agent.ts:67`, `pos-device.ts:29`).
  isSherset: true,
  version: ipcRenderer.sendSync('app:version'),

  // ── Chop etish (F3 da main.js tomonda to'ldiriladi) ──────────────────────
  listPrinters: () => ipcRenderer.invoke('print:list'),
  printSheet: (printerName, html, pageSizeMicrons) =>
    ipcRenderer.invoke('print:sheet', { printerName, html, pageSizeMicrons }),

  // ── Mijoz-ekran (F3) ─────────────────────────────────────────────────────
  pushCart: (payload) => ipcRenderer.send('cfd:push', payload),
  toggleCustomerDisplay: () => ipcRenderer.invoke('cfd:toggle'),
  customerDisplayStatus: () => ipcRenderer.invoke('cfd:status'),

  // ── Qurilma kaliti (DPAPI, device-store.js) ──────────────────────────────
  getDevice: () => ipcRenderer.sendSync('device:get'),
  setDevice: (creds) => ipcRenderer.sendSync('device:set', creds),
  clearDevice: () => ipcRenderer.sendSync('device:clear'),
});

/**
 * Qobiqning O'Z sahifalari (setup.html / offline.html) uchun alohida ko'prik.
 * Web ilovasi buni ishlatmaydi — shuning uchun `electronAPI` shartnomasiga
 * aralashtirilmaydi.
 */
contextBridge.exposeInMainWorld('shersetShell', {
  getServerUrl: () => ipcRenderer.sendSync('config:get-server-url'),
  saveServerUrl: (url) => ipcRenderer.invoke('config:set-server-url', url),
  retry: () => ipcRenderer.invoke('shell:retry'),
  quit: () => ipcRenderer.send('shell:quit'),
});
