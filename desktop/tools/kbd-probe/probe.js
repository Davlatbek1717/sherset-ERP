/**
 * QOBIQ KLAVIATURASI — HAQIQIY ELECTRON O'LCHOVI (P6).
 *
 * NEGA BU FAYL BOR: `apps/web/src/__tests__/desktop-touch-keyboard.test.ts`
 * `preload.js` ni happy-dom da yugurtiradi va «qaysi kalit `kbd:key` ga ketdi»
 * ni o'lchaydi. U javob BERA OLMAYDIGAN savol bitta va u eng qimmati edi:
 * **`sendInputEvent({type:'char', keyCode:'ў'})` belgini Chromium'gacha
 * yetkazadimi?** Electron `keyCode` ni Accelerator nomlariga moslashtiradi va
 * lotin bo'lmagan belgi jim tushib qolishi mumkin edi (F3/F4 hisobotlarining
 * 🔴 ochiq xavfi). Bu skript shu savolni HAQIQIY Chromium'da o'lchaydi.
 *
 * QACHON QAYTA YUGURTIRILADI: Electron versiyasi ko'tarilganda yoki klaviatura
 * kaliti yuborish yo'li o'zgarganda — javob o'sha Chromium'ga bog'liq.
 *
 * YUGURTIRISH (Windows):
 *   1. Electron binari kerak. `desktop/node_modules/electron/dist` bo'sh bo'lsa
 *      (pnpm postinstall skriptlarni bloklagan bo'lishi mumkin):
 *        cd desktop && pnpm approve-builds        # yoki keshdagi zip'ni ochish:
 *        unzip "$LOCALAPPDATA/electron/Cache/electron-v<ver>-win32-x64.zip" -d <papka>
 *   2. env -u ELECTRON_RUN_AS_NODE <electron.exe> desktop/tools/kbd-probe/probe.js
 *      (🔴 `ELECTRON_RUN_AS_NODE=1` muhitda bo'lsa electron oddiy node bo'lib
 *       ishga tushadi va `require('electron')` topilmaydi.)
 *   3. Natija: shu papkada `result.json` (stdout Windows GUI ilovasida BO'SH).
 *
 * Oyna ekrandan tashqarida (`x:-2400`) ochiladi, lekin KO'RSATILADI: Electron
 * hujjati bo'yicha `sendInputEvent` fokusdagi oyna talab qiladi.
 */

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const OUT = path.join(__dirname, 'result.json');
const write = (obj) => fs.writeFileSync(OUT, JSON.stringify(obj, null, 2), 'utf8');

process.on('uncaughtException', (e) => {
  write({ fatal: String(e?.stack ?? e) });
  app.exit(1);
});

/** Kirill — RU alifbosi + o'zbek kirilli (`preload.js` KB_CYRILLIC_ROWS dan). */
const CHARS = ['a', 'A', '5', '.', "'", 'ф', 'Ф', 'я', 'ў', 'қ', 'ғ', 'ҳ'];

/**
 * Boshqaruv kalitlari (F5). Savol: `sendInputEvent({type:'keyDown', keyCode})`
 * `<input>` va `<textarea>` ga qanday ta'sir qiladi —
 *   - `Enter`: forma yuboriladimi (`submit`/`keydown` React'ga yetadimi)?
 *   - `Left`/`Right`: kursor siljiydimi (`selectionStart` o'zgaradimi)?
 * Javob Chromium'ga bog'liq, faqat o'lchanadi.
 */
const CONTROL_KEYS = ['Enter', 'Left', 'Right'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.on('window-all-closed', () => app.quit());

// `desktop/main.js` dagi `kbd:key` ishlovchisining NUSXASI. Nusxa ataylab:
// `main.js` ni to'liq yuklash kiosk oynasini ochib, server manzilini so'ragan
// bo'lardi. Ikkalasi bir xil turishini `desktop-touch-keyboard.test.ts` dagi
// «main.js `kbd:key` ni sendInputEvent ga uzatadi» qo'riqchisi ushlab turadi.
ipcMain.on('kbd:key', (_e, key) => {
  const win = BrowserWindow.getAllWindows()[0];
  if (!win || typeof key !== 'string') return;
  if (CONTROL_KEYS.concat('Backspace').includes(key)) {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: key });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: key });
    return;
  }
  if ([...key].length !== 1) return;
  win.webContents.sendInputEvent({ type: 'char', keyCode: key });
});

// Preload yuklanishida SINXRON so'raladi — javobsiz qolsa preload osiladi.
ipcMain.on('app:version', (e) => {
  e.returnValue = '0.0.0-probe';
});

/** Klaviatura ildizi — `preload.js` uni `body` ga qo'shadi (eng katta z-index). */
const ROOT = `[...document.body.children].filter((el) => el.style.zIndex === '2147483647').pop()`;

const snapshot = `(() => {
  const root = ${ROOT};
  if (!root) return { present: false };
  const btns = [...root.querySelectorAll('button')];
  return {
    present: true,
    visible: root.style.display !== 'none',
    keys: btns.map((b) => b.textContent),
    keyHeights: [...new Set(btns.map((b) => b.style.height))],
  };
})()`;

const clickKey = (label) => `(() => {
  const root = ${ROOT};
  if (!root) return false;
  const b = [...root.querySelectorAll('button')].find((x) => x.textContent === ${JSON.stringify(label)});
  if (!b) return false;
  b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  b.click();
  return true;
})()`;

const focusField = (id) =>
  `(() => { const el = document.getElementById('${id}'); el.value = ''; el.focus(); return true; })()`;

const readValue = (id) => `document.getElementById('${id}').value`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    x: -2400,
    y: -2400,
    show: true,
    skipTaskbar: true,
    // Prod bilan BIR XIL (main.js:155-162) — sandbox izolyatsiyasi o'lchovga kiradi.
    webPreferences: {
      preload: path.join(__dirname, '..', '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  const js = (code) => win.webContents.executeJavaScript(code);
  const out = {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    directSendInputEvent: [],
    directInsertText: [],
    shellKeyboard: {},
  };

  await win.loadFile(path.join(__dirname, 'page.html'));
  win.focus();
  win.webContents.focus();
  await sleep(400);

  // 🔴 Deterministik boshlanish: `file://` origin'idagi `localStorage` YUGURISHLAR
  // ORASIDA saqlanadi — tozalanmasa probe o'zining oldingi yugurishidan «kirill»
  // holatida boshlanib, «harf layouti» o'lchovini yolg'on qizartiradi.
  await js(
    `(() => { try { window.localStorage.removeItem('sherset.kbd.lang'); } catch { /* storage yo'q */ } return true; })()`,
  );
  await win.loadFile(path.join(__dirname, 'page.html'));
  await sleep(400);
  win.webContents.focus();

  // ── 1) To'g'ridan-to'g'ri belgi yetkazish (preload'siz) ──────────────────
  for (const ch of CHARS) {
    await js(focusField('text'));
    await sleep(60);
    win.webContents.sendInputEvent({ type: 'char', keyCode: ch });
    await sleep(120);
    const value = await js(readValue('text'));
    out.directSendInputEvent.push({ ch, arrived: value === ch, value });
  }

  // Zaxira yo'l (F3 taklifi) — hozirgi yo'l ishlamasa nima bo'lardi.
  for (const ch of CHARS) {
    await js(focusField('text'));
    await sleep(60);
    await win.webContents.insertText(ch);
    await sleep(120);
    const value = await js(readValue('text'));
    out.directInsertText.push({ ch, arrived: value === ch, value });
  }

  // ── 1b) Boshqaruv kalitlari (F5): keyDown/keyUp `<input>` va `<textarea>` da ─
  out.controlKeys = { input: [], textarea: [] };
  for (const key of CONTROL_KEYS) {
    // Maydon `abc` bilan to'ldiriladi, kursor OXIRIDA (3) — `Left` samarasi
    // `selectionStart` 2 ga tushishida ko'rinadi; `Right` oxirida joyida qoladi,
    // shuning uchun u alohida o'rtadan (1) ham o'lchanadi.
    await js(
      `(() => { const el = document.getElementById('ctl'); el.value = 'abc'; el.focus();
         el.setSelectionRange(3, 3); window.__ctl.keydowns.length = 0; window.__ctl.submits = 0;
         return true; })()`,
    );
    await sleep(80);
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: key });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: key });
    await sleep(150);
    const r = await js(
      `(() => { const el = document.getElementById('ctl');
         return { selectionStart: el.selectionStart, value: el.value,
                  keydownSeen: window.__ctl.keydowns.length > 0,
                  keydowns: [...window.__ctl.keydowns],
                  submitSeen: window.__ctl.submits > 0 }; })()`,
    );
    out.controlKeys.input.push({ key, ...r });
  }

  // `Right` o'rtadan: kursor 1 → 2 bo'lsa — siljitadi.
  await js(
    `(() => { const el = document.getElementById('ctl'); el.value = 'abc'; el.focus();
       el.setSelectionRange(1, 1); return true; })()`,
  );
  await sleep(80);
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Right' });
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Right' });
  await sleep(150);
  out.controlKeys.rightFromMiddle = await js(
    `(() => { const el = document.getElementById('ctl');
       return { selectionStart: el.selectionStart, value: el.value }; })()`,
  );

  for (const key of CONTROL_KEYS) {
    await js(
      `(() => { const el = document.getElementById('ta'); el.value = 'abc'; el.focus();
         el.setSelectionRange(3, 3); window.__ctl.keydowns.length = 0; window.__ctl.submits = 0;
         return true; })()`,
    );
    await sleep(80);
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: key });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: key });
    await sleep(150);
    const r = await js(
      `(() => { const el = document.getElementById('ta');
         return { selectionStart: el.selectionStart, value: el.value,
                  keydownSeen: window.__ctl.keydowns.length > 0,
                  keydowns: [...window.__ctl.keydowns],
                  submitSeen: window.__ctl.submits > 0 }; })()`,
    );
    out.controlKeys.textarea.push({ key, ...r });
  }

  // ── 2) BUTUN ZANJIR: haqiqiy preload klaviaturasi orqali ────────────────
  const s = out.shellKeyboard;

  await js(focusField('money'));
  await sleep(250);
  s.moneyLayout = await js(snapshot);
  await js(clickKey('7'));
  await sleep(150);
  await js(clickKey('.'));
  await sleep(150);
  s.moneyTyped = await js(readValue('money'));
  await js(clickKey('⌫'));
  await sleep(200);
  s.moneyAfterBackspace = await js(readValue('money'));

  await js(focusField('text'));
  await sleep(250);
  s.textLayoutIsLetters = await js(`(() => {
    const root = ${ROOT};
    return [...root.querySelectorAll('button')].some((b) => b.textContent === 'q');
  })()`);
  await js(clickKey('РУС'));
  await sleep(200);
  s.cyrillic = {};
  for (const ch of ['ф', 'ў', 'қ', 'ғ', 'ҳ']) {
    await js(focusField('text'));
    await sleep(100);
    const clicked = await js(clickKey(ch));
    await sleep(150);
    s.cyrillic[ch] = { clicked, value: await js(readValue('text')) };
  }

  // Boshqariladigan (React naqshi) maydon — kirill holatda ham QOLADIMI?
  await js(
    `(() => { const el = document.getElementById('controlled'); el.focus(); return true; })()`,
  );
  await sleep(200);
  await js(clickKey('ў'));
  await sleep(200);
  s.controlledState = await js('window.__state()');

  // ── 2b) BUTUN ZANJIR: boshqaruv tugmalari (F5) — preload tugmasi bosilganda
  // kalit `kbd:key` → keyDown/keyUp orqali maydonga yetadimi.
  await js(
    `(() => { const el = document.getElementById('ctl'); el.value = 'abc'; el.focus();
       el.setSelectionRange(3, 3); window.__ctl.keydowns.length = 0; window.__ctl.submits = 0;
       return true; })()`,
  );
  await sleep(250);
  await js(clickKey('◀'));
  await sleep(200);
  const chainAfterLeft = await js(
    `(() => { const el = document.getElementById('ctl');
       return { selectionStart: el.selectionStart, keydowns: [...window.__ctl.keydowns] }; })()`,
  );
  await js(clickKey('⏎'));
  await sleep(200);
  s.controlChain = {
    afterLeft: chainAfterLeft,
    afterEnter: await js(
      '(() => ({ keydowns: [...window.__ctl.keydowns], submits: window.__ctl.submits }))()',
    ),
  };

  // ── 3) PIN maydonlari (P6 «ikki numpad» savoli) ─────────────────────────
  await js(focusField('pin'));
  await sleep(250);
  s.pinLayout = await js(snapshot);
  await js(clickKey('4'));
  await sleep(200);
  s.pinTyped = await js(readValue('pin'));

  // 🔴 readOnly maydon: klaviatura CHIQADI, lekin kalit TUSHMAYDI.
  await js(focusField('pinro'));
  await sleep(250);
  s.readOnlyLayout = await js(snapshot);
  await js(clickKey('4'));
  await sleep(200);
  s.readOnlyTyped = await js(readValue('pinro'));

  // ── 4) Til tanlovi navigatsiyadan keyin tiklanadimi (sandbox localStorage) ─
  s.storedLang = await js(
    `(() => { try { return window.localStorage.getItem('sherset.kbd.lang'); } catch (e) { return 'THREW: ' + e.message; } })()`,
  );
  await win.loadFile(path.join(__dirname, 'page.html'));
  await sleep(400);
  win.webContents.focus();
  await js(focusField('text'));
  await sleep(300);
  s.afterReloadIsCyrillic = await js(`(() => {
    const root = ${ROOT};
    return [...root.querySelectorAll('button')].some((b) => b.textContent === 'й');
  })()`);

  write(out);
  win.destroy();
  app.quit();
});
