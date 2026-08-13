import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ELECTRON KO'PRIGI — SHARTNOMA QO'RIQCHISI (F2).
 *
 * Bug-klassi (xotira: «ombor cheki uch renderer — biri o'zgarsa qolgani jimgina
 * eskiradi»): web tomon `window.electronAPI` dan metod kutadi, exe uni bermaydi.
 * `electronAPI` OPTIONAL bo'lgani uchun typecheck YASHIL qoladi va nosozlik
 * faqat kassada ko'rinadi — chop etish jimgina popup'ga tushadi.
 *
 * F1 agenti aynan shu klassdagi ikkinchi tuzoqni ogohlantirgan:
 * `pos-device.ts` ko'prik metodini topmasa `localStorage` ga TUSHADI — ya'ni
 * qurilma maxfiy kaliti DPAPI o'rniga ochiq brauzer saqlagichiga yoziladi va
 * HECH NARSA shikoyat qilmaydi. Shuning uchun bu qo'riqchi metod nomlarini
 * IKKALA manbadan o'qiydi: `print-agent.ts` (`ElectronBridge`) va
 * `pos-device.ts` (`ShellBridge`).
 *
 * 🔴 Ro'yxat bu faylga QO'LDA ko'chirilmaydi — ikkinchi nusxa eskiradi.
 * Manbadan o'qiladi; parser buzilib qolsa vacuity-testlar (pastda) yiqiladi.
 */

const WEB = process.cwd(); // apps/web
const REPO = join(WEB, '..', '..');

const printAgentSrc = readFileSync(join(WEB, 'src/lib/print-agent.ts'), 'utf8');
const posDeviceSrc = readFileSync(join(WEB, 'src/lib/pos-device.ts'), 'utf8');
const preloadPath = join(REPO, 'desktop/preload.js');
const mainPath = join(REPO, 'desktop/main.js');
// Fayl yo'q bo'lsa butun suite collect-vaqtida qulamasin — u holda manba-parser
// testlari ham «yugurmagan» bo'lib qolardi va sabab ko'rinmasdi.
const readOrEmpty = (p: string): string => (existsSync(p) ? readFileSync(p, 'utf8') : '');

// ─── Mayda skaner: qatorlarni satr/izohsiz va boshlang'ich chuqurlik bilan ───
// Faqat struktura kerak, shuning uchun to'liq parser emas: satr-literal va izoh
// ichidagi qavslar hisobga OLINMAYDI (aks holda `'{'` chuqurlikni buzardi).
interface ScannedLine {
  text: string;
  depth: number;
}

function scanLines(src: string): ScannedLine[] {
  const out: ScannedLine[] = [];
  let depth = 0;
  let lineStartDepth = 0;
  let line = '';
  let mode: 'code' | 'line-comment' | 'block-comment' | 'string' = 'code';
  let quote = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i] as string;
    const next = src[i + 1];
    if (c === '\n') {
      out.push({ text: line, depth: lineStartDepth });
      line = '';
      lineStartDepth = depth;
      if (mode === 'line-comment') mode = 'code';
      i += 1;
      continue;
    }
    if (mode === 'line-comment') {
      i += 1;
      continue;
    }
    if (mode === 'block-comment') {
      if (c === '*' && next === '/') {
        mode = 'code';
        i += 2;
        continue;
      }
      i += 1;
      continue;
    }
    if (mode === 'string') {
      // Satr-literal MATNI saqlanadi (`exposeInMainWorld('electronAPI'` kabi
      // langarlarni topish uchun), lekin qavslari chuqurlikka SANALMAYDI.
      if (c === '\\') {
        line += c + (src[i + 1] ?? '');
        i += 2;
        continue;
      }
      line += c;
      if (c === quote) {
        mode = 'code';
        quote = '';
      }
      i += 1;
      continue;
    }
    // code
    if (c === '/' && next === '/') {
      mode = 'line-comment';
      i += 2;
      continue;
    }
    if (c === '/' && next === '*') {
      mode = 'block-comment';
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      mode = 'string';
      quote = c;
      line += c;
      i += 1;
      continue;
    }
    if (c === '{' || c === '(' || c === '[') depth += 1;
    if (c === '}' || c === ')' || c === ']') depth -= 1;
    line += c;
    i += 1;
  }
  out.push({ text: line, depth: lineStartDepth });
  return out;
}

const KEY_RE = /^\s*(\w+)\??\s*[:(]/;

/**
 * `header` qatoridan boshlangan blokning ENG YUQORI (eng tashqi) darajasidagi
 * a'zolarini qaytaradi. Ichma-ich obyekt tiplari (masalan `pushCart` payload'i)
 * chuqurroq turgani uchun qamrab olinmaydi.
 */
function topLevelMembers(src: string, header: RegExp): string[] {
  const lines = scanLines(src);
  const at = lines.findIndex((l) => header.test(l.text));
  if (at < 0) return [];
  const base = lines[at]?.depth ?? 0;
  const block: ScannedLine[] = [];
  for (let i = at + 1; i < lines.length; i += 1) {
    const l = lines[i] as ScannedLine;
    if (l.depth <= base) break;
    block.push(l);
  }
  if (block.length === 0) return [];
  const inner = Math.min(...block.map((l) => l.depth));
  const names: string[] = [];
  for (const l of block) {
    if (l.depth !== inner) continue;
    const m = KEY_RE.exec(l.text);
    if (m?.[1]) names.push(m[1]);
  }
  return names;
}

const bridgeMembers = topLevelMembers(printAgentSrc, /interface ElectronBridge\b/);
const deviceMembers = topLevelMembers(posDeviceSrc, /interface ShellBridge\b/);

// ─── F3: mijoz-ekran IKKINCHI ko'prigi ──────────────────────────────────────
// `window.electronAPI` kassir oynasining ko'prigi; mijoz-ekran oynasi esa
// BOSHQA sahifa (`/customer-display`) va BOSHQA preload — u
// `window.customerDisplay.onCart(cb)` ni kutadi. F2 qo'riqchisi buni
// qamramagan edi, ya'ni ko'prik butunlay yo'q bo'lsa ham hech narsa
// shikoyat qilmasdi (ekran jimgina bo'sh turardi).
const customerPagePath = join(WEB, 'src/app/customer-display/page.tsx');
const customerPageSrc = readFileSync(customerPagePath, 'utf8');
const customerMembers = topLevelMembers(customerPageSrc, /interface CustomerBridge\b/);
const preloadCustomerPath = join(REPO, 'desktop/preload-customer.js');

/** Izohlarsiz kod (satr-literallar saqlanadi) — regex izohga tushmasin. */
function codeOf(src: string): string {
  return scanLines(src)
    .map((l) => l.text)
    .join('\n');
}

type IpcKind = 'invoke' | 'send' | 'sendSync' | 'on';
interface IpcUse {
  channel: string;
  kind: IpcKind;
  file: string;
}

/** preload'dagi har bir `ipcRenderer.<kind>('<kanal>'` chaqiruvi. */
function ipcUses(src: string, file: string): IpcUse[] {
  const re = /ipcRenderer\.(invoke|send|sendSync|on)\(\s*'([^']+)'/g;
  const out: IpcUse[] = [];
  for (const m of codeOf(src).matchAll(re)) {
    out.push({ kind: m[1] as IpcKind, channel: m[2] as string, file });
  }
  return out;
}

/** main.js tomonidagi registratsiyalar (`handle`/`on`) va renderer'ga yuborishlar. */
function mainChannels(src: string): { handle: Set<string>; on: Set<string>; send: Set<string> } {
  const code = codeOf(src);
  const grab = (re: RegExp) => new Set([...code.matchAll(re)].map((m) => m[1] as string));
  return {
    handle: grab(/ipcMain\.handle\(\s*'([^']+)'/g),
    on: grab(/ipcMain\.on\(\s*'([^']+)'/g),
    send: grab(/\.send\(\s*'([^']+)'/g),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
describe('shartnoma manbasi o`qildi (vacuity qo`riqchisi)', () => {
  // Parser buzilsa quyidagi testlar BO'SH ro'yxat ustida «o'tib» ketardi.
  it('print-agent.ts dagi ElectronBridge a`zolari topildi', () => {
    expect(bridgeMembers.length).toBeGreaterThanOrEqual(7);
    // Eski exe shartnomasining langarlari (spec §6.3).
    expect(bridgeMembers).toEqual(
      expect.arrayContaining([
        'isSherset',
        'version',
        'listPrinters',
        'printSheet',
        'pushCart',
        'toggleCustomerDisplay',
        'customerDisplayStatus',
      ]),
    );
    // Ichki payload maydonlari (`lines`, `discountPct`) tashqi a'zo EMAS.
    expect(bridgeMembers).not.toContain('discountPct');
  });

  it('pos-device.ts dagi ShellBridge a`zolari topildi (F1 ogohlantirishi)', () => {
    expect(deviceMembers).toEqual(
      expect.arrayContaining(['getDevice', 'setDevice', 'clearDevice']),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('desktop/preload.js — window.electronAPI', () => {
  const preloadSrc = readOrEmpty(preloadPath);
  const exposed = topLevelMembers(preloadSrc, /exposeInMainWorld\(\s*'electronAPI'/);

  it('fayl mavjud', () => {
    expect(existsSync(preloadPath), `topilmadi: ${preloadPath}`).toBe(true);
  });

  it('contextBridge orqali ochiladi (window.electronAPI = … TAQIQ)', () => {
    expect(preloadSrc).toContain('contextBridge.exposeInMainWorld');
    expect(exposed.length).toBeGreaterThanOrEqual(10);
  });

  for (const name of [...new Set([...bridgeMembers, ...deviceMembers])]) {
    it(`«${name}» berilgan`, () => {
      expect(exposed).toContain(name);
    });
  }

  it('isSherset = true (web `el?.isSherset` bilan qobiqni taniydi)', () => {
    expect(preloadSrc).toMatch(/isSherset\s*:\s*true/);
  });

  it('version satr sifatida beriladi', () => {
    expect(preloadSrc).toMatch(/version\s*:/);
  });

  /**
   * 🔴 `pos-device.ts:44-47` — `el.getDevice()` natijasi DARHOL tekshiriladi
   * (`isComplete`), ya'ni Promise QAYTARSA qurilma HECH QACHON topilmaydi va
   * ekran abadiy «juftlanmagan» bo'lib qoladi. Shuning uchun qurilma metodlari
   * sinxron IPC (`sendSync`) bilan berilishi SHART.
   */
  for (const name of ['getDevice', 'setDevice', 'clearDevice']) {
    it(`«${name}» sinxron (async emas, sendSync)`, () => {
      const re = new RegExp(`${name}\\s*:\\s*([^,]*?)ipcRenderer\\.(\\w+)`, 's');
      const m = re.exec(preloadSrc);
      expect(m, `${name} preload'da ipcRenderer bilan ulanmagan`).not.toBeNull();
      expect(m?.[1]).not.toMatch(/\basync\b/);
      expect(m?.[2]).toBe('sendSync');
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
describe('desktop/main.js — kiosk oyna qattiqligi (spec §6.2)', () => {
  const mainSrc = readOrEmpty(mainPath);

  it('fayl mavjud', () => {
    expect(existsSync(mainPath), `topilmadi: ${mainPath}`).toBe(true);
  });

  it('preload.js oynaga ULANGAN (aks holda ko`prik hech qachon paydo bo`lmaydi)', () => {
    expect(mainSrc).toMatch(/preload\s*:\s*[^\n]*preload\.js/);
  });

  it('contextIsolation yoqilgan, nodeIntegration yoqilmagan', () => {
    expect(mainSrc).toMatch(/contextIsolation\s*:\s*true/);
    expect(mainSrc).not.toMatch(/nodeIntegration\s*:\s*true/);
  });

  /**
   * Kiosk qattiqligi JUFTLASHGA BOG'LANGAN (2026-08-11 da o'zgardi).
   *
   * Ilgari bu yerda `kiosk: true` LITERAL talab qilinardi. Real monoblokda
   * ma'lum bo'ldiki, u holat sozlashni imkonsiz qiladi: kiosk oyna hamma
   * narsaning ustida turgani uchun Windows ekran klaviaturasi input bosilganda
   * orqaga o'tib ketardi, ilova esa o'z klaviaturasini bermaydi ⇒ klaviaturasiz
   * qurilmada na server manzilini, na juftlash parolini kiritib bo'lardi.
   *
   * Yangi shartnoma: sozlash bosqichi oddiy oynada, KASSIR bosqichi kiosk'da.
   * Test shu bog'liqlikni qulflaydi — kimdir `kiosk: false` deb qo'yib qo'ysa
   * (yoki bog'liqlikni butunlay olib tashlasa) yiqiladi.
   */
  it('kiosk + ramkasizlik SOZLANGANLIK holatiga bog`langan (literal `true` emas)', () => {
    expect(mainSrc).toMatch(/const\s+configured\s*=\s*!!\s*serverBase\(\)/);
    expect(mainSrc).toMatch(/kiosk\s*:\s*configured/);
    expect(mainSrc).toMatch(/frame\s*:\s*!configured/);
    // Kiosk hech qachon o'chirilgan holda QOTIRILMASIN.
    expect(mainSrc).not.toMatch(/kiosk\s*:\s*false/);
  });

  it('sozlangach kiosk rejimiga QAYTA ISHGA TUSHISH bilan o`tiladi', () => {
    // `setKiosk(true)` yetarli emas: `frame` ish paytida olib tashlanmaydi,
    // ya'ni yarim-kiosk oyna qolardi (kassir uni sudrab/yopib qo'yardi).
    expect(mainSrc).toMatch(/app\.relaunch\(\)/);
    expect(mainSrc).toMatch(/win\??\.isKiosk\(\)/);
  });

  it('yopish qo`riqchisi KIOSK holatida ishlaydi (kassir Alt+F4 bilan chiqmasin)', () => {
    expect(mainSrc).toMatch(
      /if\s*\(!allowQuit\s*&&\s*win\?\.isKiosk\(\)\)\s*e\.preventDefault\(\)/,
    );
  });

  /**
   * Klaviaturasiz chiqish yo'li (2026-08-11 qarzi yopildi): kiosk oynadan
   * yagona chiqish `Ctrl+Alt+Shift+Q` edi — sensorli monoblokda klaviatura
   * yo'q, ya'ni ilovani UMUMAN yopib bo'lmasdi.
   */
  it('chiqish imosi TASDIQ dialogi orqali o`tadi (main tomoni)', () => {
    expect(mainSrc).toMatch(/ipcMain\.on\(\s*'shell:request-quit'/);
    expect(mainSrc).toMatch(/showMessageBox/);
  });

  /**
   * Imo AYNAN preload'da bo'lishi shart: web ilova `script-src 'self'` CSP
   * bilan keladi, ya'ni `executeJavaScript` bilan sahifaga ekilgan imo o'sha
   * siyosatga tayanib qolardi (o'lchanmagan). Preload CSP'ga bo'ysunmaydi.
   */
  it('imo PRELOAD da (CSP ta`sir qilmaydi) va PASSIV', () => {
    const preload = readOrEmpty(preloadPath);
    expect(preload).toContain('installExitGesture');
    expect(preload).toMatch(/ipcRenderer\.send\(\s*'shell:request-quit'\s*\)/);
    expect(preload).toMatch(/pointerdown/);
    // Sahifa tugmalarini to'smasligi — IMO hodisani bekor QILMAYDI.
    // 🔴 Tekshiruv AYNAN `installExitGesture` tanasiga qaraydi: butun fayl
    // bo'yicha qidirilsa ekran klaviaturasidan yiqilardi — u tugmalarida
    // `mousedown` ni ataylab bekor qiladi (fokus maydonda qolishi uchun,
    // aks holda bosilgan harf hech qayerga tushmaydi).
    const gesture = preload.slice(
      preload.indexOf('function installExitGesture'),
      preload.indexOf('function installTouchKeyboard'),
    );
    expect(gesture.length).toBeGreaterThan(200);
    expect(gesture).not.toMatch(/\.preventDefault\s*\(/);
    expect(mainSrc).not.toMatch(/executeJavaScript\(\s*EXIT_GESTURE/);
  });

  it('yagona nusxa qulfi bor', () => {
    expect(mainSrc).toContain('requestSingleInstanceLock');
  });

  it('menyu o`chirilgan', () => {
    expect(mainSrc).toMatch(/setApplicationMenu\(null\)/);
  });

  it('server manzili kodga QOTIRILMAGAN (device-store dan o`qiladi)', () => {
    // Spec §3.2 — domen build/konfiguratsiyadan keladi, manbada emas.
    const hardcoded = mainSrc.match(/https?:\/\/[a-z0-9.-]+/gi) ?? [];
    const allowed = /localhost|127\.0\.0\.1/;
    expect(hardcoded.filter((u) => !allowed.test(u))).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('desktop/preload-customer.js — window.customerDisplay (F3)', () => {
  const src = readOrEmpty(preloadCustomerPath);
  const exposed = topLevelMembers(src, /exposeInMainWorld\(\s*'customerDisplay'/);

  it('shartnoma manbasi o`qildi (vacuity)', () => {
    // `customer-display/page.tsx:40-47` dagi `interface CustomerBridge`.
    expect(customerMembers).toEqual(expect.arrayContaining(['onCart']));
  });

  it('fayl mavjud', () => {
    expect(existsSync(preloadCustomerPath), `topilmadi: ${preloadCustomerPath}`).toBe(true);
  });

  it('contextBridge orqali ochiladi', () => {
    expect(src).toContain('contextBridge.exposeInMainWorld');
    expect(exposed.length).toBeGreaterThanOrEqual(1);
  });

  for (const name of customerMembers) {
    it(`«${name}» berilgan`, () => {
      expect(exposed).toContain(name);
    });
  }

  it('onCart PUSH yo`nalishida (main → oyna, `ipcRenderer.on`)', () => {
    // `onCart` — obuna, so'rov emas: savat kassirdan kelganda main uni
    // oynaga YUBORADI. `invoke`/`sendSync` bo'lsa savat hech qachon kelmaydi.
    const uses = ipcUses(src, 'preload-customer.js');
    expect(uses.length).toBeGreaterThanOrEqual(1);
    expect(uses.every((u) => u.kind === 'on')).toBe(true);
  });

  it('nodeIntegration talab qilmaydi (`require` faqat electron uchun)', () => {
    const requires = [...codeOf(src).matchAll(/require\(\s*'([^']+)'/g)].map((m) => m[1]);
    expect(requires).toEqual(['electron']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('IPC kanallari: preload ↔ main.js (yo`nalish bilan)', () => {
  const mainSrc = readOrEmpty(mainPath);
  const uses = [
    ...ipcUses(readOrEmpty(preloadPath), 'preload.js'),
    ...ipcUses(readOrEmpty(preloadCustomerPath), 'preload-customer.js'),
  ];
  const reg = mainChannels(mainSrc);

  it('preload`larda kanallar topildi (vacuity)', () => {
    expect(uses.length).toBeGreaterThanOrEqual(12);
  });

  for (const u of uses) {
    it(`«${u.channel}» (${u.kind}, ${u.file}) main.js da ulangan`, () => {
      if (u.kind === 'invoke') {
        // invoke ↔ handle. `ipcMain.on` bo'lsa Promise HECH QACHON tugamaydi.
        expect(reg.handle.has(u.channel), `ipcMain.handle('${u.channel}') yo'q`).toBe(true);
      } else if (u.kind === 'on') {
        // Renderer obunasi — main SHU kanalga yuborishi shart.
        expect(reg.send.has(u.channel), `main hech qachon '${u.channel}' yubormaydi`).toBe(true);
      } else {
        // send/sendSync ↔ ipcMain.on
        expect(reg.on.has(u.channel), `ipcMain.on('${u.channel}') yo'q`).toBe(true);
      }
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
describe('desktop/main.js — chop etish (F3, spec §6.4)', () => {
  const mainSrc = readOrEmpty(mainPath);
  const code = codeOf(mainSrc);

  it('F2 ning «hali ulanmagan» zaglushkasi olib tashlangan', () => {
    expect(mainSrc).not.toMatch(/hali ulanmagan/);
  });

  it('printerlar ro`yxati ASINXRON API bilan olinadi', () => {
    // Sinxron `webContents.getPrinters()` Electron 25+ da OLIB TASHLANGAN —
    // uni ishlatgan qobiq ishga tushganda yiqiladi.
    expect(code).toContain('getPrintersAsync');
    expect(code).not.toMatch(/getPrinters\s*\(\s*\)/);
  });

  it('drayver orqali JIM bosiladi (dialogsiz, tanlangan printerga)', () => {
    expect(code).toMatch(/webContents\.print\(/);
    expect(code).toMatch(/silent\s*:\s*true/);
    expect(code).toMatch(/deviceName/);
  });

  it('preload uzatgan payload maydonlari main.js da o`qiladi', () => {
    // preload: invoke('print:sheet', { printerName, html, pageSizeMicrons })
    for (const field of ['printerName', 'html', 'pageSizeMicrons']) {
      expect(code, `payload maydoni «${field}» main.js da yo'q`).toContain(field);
    }
  });

  it('pageSize drayverga uzatiladi (label/senik o`lchami yo`qolmasin)', () => {
    expect(code).toMatch(/pageSize/);
  });

  it('xatoda ham {ok:false, error} qaytadi (jim muvaffaqiyatsizlik TAQIQ)', () => {
    expect(code).toMatch(/ok\s*:\s*false/);
    expect(code).toMatch(/ok\s*:\s*true/);
  });

  it('🔴 K16 — balandlik SHRIFT yuklangandan KEYIN o`lchanadi', () => {
    // Web-shrift kech kelsa `scrollHeight` kichik chiqadi va chek OXIRI
    // kesiladi — qog'ozda ko'rinadi, hech bir test tutmaydi.
    const at = mainSrc.indexOf('function resolvePageSize');
    expect(at, 'resolvePageSize topilmadi').toBeGreaterThan(0);
    const body = mainSrc.slice(at, at + 1200);
    expect(body).toContain('document.fonts');
  });

  it('shrift kutish CHEKLANGAN (buzuq shrift chekni to`xtatmasin)', () => {
    const at = mainSrc.indexOf('FONTS_TIMEOUT_MS');
    expect(at, 'shrift kutish vaqti chegarasi yo`q').toBeGreaterThan(0);
  });

  it('🔴 K17 — chop popup`i BITTA (oynalar to`planmaydi)', () => {
    const at = mainSrc.indexOf('function openInternalPopup');
    expect(at).toBeGreaterThan(0);
    const body = mainSrc.slice(at, at + 900);
    expect(body, 'ochiq popup qayta ishlatilmaydi').toContain('isDestroyed()');
    expect(body).toContain("'closed'");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('desktop/main.js — mijoz-ekran (F3, spec §6.5)', () => {
  const mainSrc = readOrEmpty(mainPath);
  const code = codeOf(mainSrc);

  it('ikkinchi ekran displeylar ro`yxatidan aniqlanadi', () => {
    expect(code).toContain('getAllDisplays');
  });

  it('mijoz-oyna `/customer-display` sahifasini ochadi', () => {
    expect(code).toContain('/customer-display');
  });

  it('mijoz-oynaga preload-customer.js ULANGAN', () => {
    // Ulanmasa `window.customerDisplay` paydo bo'lmaydi va sahifa
    // BroadcastChannel zaxirasiga tushadi (Electron'da u kassir oynasi
    // bilan bog'lanmaydi) — ekran jimgina bo'sh qoladi.
    expect(code).toMatch(/preload\s*:\s*[^\n]*preload-customer\.js/);
  });

  it('tashqi ekran yo`q bo`lsa {open:false, error} (shartnoma)', () => {
    expect(code).toMatch(/open\s*:\s*false\s*,\s*\n?\s*error/);
  });

  it('mijoz-oyna ramkasiz', () => {
    expect(code).toMatch(/frame\s*:\s*false/);
  });

  it('alohida `partition` BERILMAYDI (umumiy cookie sessiyasi kerak)', () => {
    // `customer-display/page.tsx` `refresh()` bilan umumiy sessiya
    // cookie'sidan token oladi — alohida partition uni uzib qo'yadi.
    expect(code).not.toMatch(/partition\s*:/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('uch qatlamli chop-etish fallback buzilmagan (F3 shart)', () => {
  it('HTTP print-agent qatlami print-agent.ts da qoldi', () => {
    expect(printAgentSrc).toContain('127.0.0.1:17777');
    expect(printAgentSrc).toMatch(/export async function agentPrint\b/);
  });

  it('Electron yo`q bo`lsa HTTP agentga tushiladi (ikkala tarmoq)', () => {
    // `el ? el.printSheet(...) : agentPrint(...)` — shox yo'qolsa brauzerda
    // chop etish o'ladi.
    const branches = printAgentSrc.match(/await agentPrint\(/g) ?? [];
    expect(branches.length).toBeGreaterThanOrEqual(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F2 (K05) yordamchilari — desktop faylini o'qish (yo'q bo'lsa bo'sh satr,
// suite collect-vaqtida qulamasin).
const desktopFile = (name: string): string => join(REPO, 'desktop', name);
const read = readOrEmpty;

describe('desktop/logger.js — qurilma logi FAYLGA (K05)', () => {
  const loggerSrc = read(desktopFile('logger.js'));

  it('fayl mavjud', () => {
    expect(loggerSrc.length, 'desktop/logger.js topilmadi').toBeGreaterThan(0);
  });

  it('userData ichiga yozadi (qurilmada topiladigan joy)', () => {
    expect(loggerSrc).toContain("app.getPath('userData')");
    expect(loggerSrc).toContain('appendFileSync');
  });

  it('rotatsiya bor — kassa diski to`lmasin', () => {
    expect(loggerSrc).toContain('MAX_BYTES');
    expect(loggerSrc).toContain('renameSync');
  });

  it('updater xatolari endi FAYLGA ketadi (console emas)', () => {
    const updater = read(desktopFile('updater.js'));
    expect(updater).toContain("require('./logger')");
    expect(updater).toMatch(/logger\.write\(\s*'updater'/);
  });

  it('main.js chop va offline nosozliklarini yozadi', () => {
    const main = read(desktopFile('main.js'));
    expect(main).toContain("require('./logger')");
    expect(main).toMatch(/logger\.write\(\s*'print'/);
    expect(main).toMatch(/logger\.write\(\s*'shell'/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('kiosk qattiqligi — qurilma o`zi ko`tariladi (F4)', () => {
  const main = read(desktopFile('main.js'));
  const preload = read(desktopFile('preload.js'));

  it('K08 — Windows`ga kirganda o`zi ochiladi', () => {
    expect(main).toContain('setLoginItemSettings');
    // Dev mashinada yoqilmasin — dasturchining tizimiga yozib qo'ymasin.
    const at = main.indexOf('setLoginItemSettings');
    expect(main.slice(Math.max(0, at - 300), at)).toContain('isPackaged');
  });

  it('K09 — ekran uxlamaydi', () => {
    expect(main).toContain('powerSaveBlocker');
    expect(main).toContain('prevent-display-sleep');
  });

  it('K10 — sensorli zoom qulflangan (layout buzilmasin)', () => {
    expect(preload).toContain('setVisualZoomLevelLimits');
  });

  it('🔴 K11 — render yiqilishida CHEKSIZ qayta yuklash YO`Q', () => {
    const at = main.indexOf("'render-process-gone'");
    expect(at, 'render-process-gone ishlovchisi yo`q').toBeGreaterThan(0);
    const handler = main.slice(at, at + 700);
    expect(handler, 'chegara yo`q — cheksiz sikl').toContain('RELOAD_LIMIT');
    expect(handler).toContain('showOffline');
  });

  it('K12 — watchdog skripti repo`da', () => {
    const wd = read(join(REPO, 'desktop', 'tools', 'watchdog', 'kassa-watchdog.ps1'));
    expect(wd.length, 'kassa-watchdog.ps1 topilmadi').toBeGreaterThan(0);
    expect(wd).toContain('Sherset Kassa');
  });
});
