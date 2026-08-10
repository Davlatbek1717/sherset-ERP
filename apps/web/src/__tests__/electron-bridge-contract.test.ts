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

  it('kiosk + ramkasiz oyna', () => {
    expect(mainSrc).toMatch(/kiosk\s*:\s*true/);
    expect(mainSrc).toMatch(/frame\s*:\s*false/);
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
