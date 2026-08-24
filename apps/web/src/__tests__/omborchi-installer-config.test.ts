import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * OMBORCHI .EXE — KONFIGURATSIYA QO'RIQCHISI (ombor-restrukturizatsiya F8).
 *
 * «Sherset Omborchi» kassa bilan BITTA kod bazasidan yig'iladi
 * (`desktop/`, rejim `mode.js`), lekin ALOHIDA dastur: o'z appId, o'z
 * ikonkasi, o'z yangilanish kanali (`/downloads/omborchi/`), o'z versiya
 * qatori (`omborchi.builder.json` → `extraMetadata.version`).
 *
 * Bug-klassi kassa qo'riqchisidagi bilan bir xil («uch renderer — biri
 * o'zgarsa qolgani jimgina eskiradi»): kanal yo'li, artifact nomi va rejim
 * markeri bir nechta faylda qo'lda yozilgan — biri o'zgarsa yangilanish
 * jimgina kelmay qo'yadi yoki omborchi .exe'si kassa bo'lib ochiladi.
 *
 * 🔴 Eng xavfli regress ALOHIDA qulflanadi: omborchi qobig'i web tomonda
 * KASSA deb tanilsa, .exe ichida /kassa-kirish PIN ekrani ochiladi va
 * katta omborchi tizimga umuman kira olmaydi.
 */

const WEB = process.cwd(); // apps/web
const REPO = join(WEB, '..', '..');
const desktopFile = (name: string): string => join(REPO, 'desktop', name);
const read = (p: string): string => (existsSync(p) ? readFileSync(p, 'utf8') : '');

/** Omborchi yangilanish kanali — kassanikidan FARQLI katalog. */
const UPDATE_PATH = '/downloads/omborchi/';
const KASSA_UPDATE_PATH = '/downloads/desktop/';
const ARTIFACT_TEMPLATE = 'Sherset-Omborchi-Setup-${version}.exe';
const ICON_PATH = 'build/icon-omborchi.ico';
const MODE_MARKER = '--sherset-shell-mode=';

/** Izohsiz kod — da'volar izoh matnidan yashil bo'lib qolmasin. */
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const builderRaw = read(desktopFile('omborchi.builder.json'));
const pkgRaw = read(desktopFile('package.json'));
const modeSrc = read(desktopFile('mode.js'));
const updaterSrc = read(desktopFile('updater.js'));
const mainSrc = read(desktopFile('main.js'));
const preloadSrc = read(desktopFile('preload.js'));
const posDeviceSrc = read(join(WEB, 'src/lib/pos-device.ts'));
const assetsGuardSrc = read(desktopFile('check-build-assets.js'));
const readme = read(desktopFile('README.md'));

interface BuilderConfig {
  appId?: string;
  productName?: string;
  directories?: { output?: string };
  extraMetadata?: { name?: string; productName?: string; version?: string; shersetMode?: string };
  win?: { icon?: string; artifactName?: string };
  nsis?: { oneClick?: boolean; perMachine?: boolean };
  publish?: Array<{ provider?: string; url?: string }>;
}

// ─────────────────────────────────────────────────────────────────────────────
describe('omborchi.builder.json — alohida dastur konfiguratsiyasi', () => {
  it('JSON sifatida parse bo`ladi', () => {
    expect(builderRaw.length, 'omborchi.builder.json topilmadi').toBeGreaterThan(0);
    expect(() => JSON.parse(builderRaw) as BuilderConfig).not.toThrow();
  });

  const cfg = JSON.parse(builderRaw || '{}') as BuilderConfig;

  it('appId va productName KASSANIKIDAN FARQLI', () => {
    expect(cfg.appId).toBe('uz.sherset.omborchi');
    expect(cfg.productName).toBe('Sherset Omborchi');
    const kassaPkg = JSON.parse(pkgRaw || '{}') as {
      build?: { appId?: string; productName?: string };
    };
    expect(cfg.appId).not.toBe(kassaPkg.build?.appId);
    expect(cfg.productName).not.toBe(kassaPkg.build?.productName);
  });

  it('🔴 extraMetadata rejim va identifikatsiyani beradi (mode.js shuni o`qiydi)', () => {
    expect(cfg.extraMetadata?.shersetMode).toBe('omborchi');
    // name/productName paketlangan package.json ga yoziladi — userData katalogi
    // (%APPDATA%) kassanikidan ajratiladi, konfiguratsiyalar aralashmaydi.
    expect(cfg.extraMetadata?.name).toBe('sherset-omborchi');
    expect(cfg.extraMetadata?.productName).toBe('Sherset Omborchi');
  });

  it('o`z versiya qatori — semver (kassa versiyasidan mustaqil)', () => {
    expect(cfg.extraMetadata?.version ?? '').toMatch(/^\d+\.\d+\.\d+(-[\w.]+)?$/);
  });

  it('artifact nomi — omborchi shabloni, `${version}` LITERAL', () => {
    expect(cfg.win?.artifactName).toBe(ARTIFACT_TEMPLATE);
  });

  it('o`z ikonkasi (kassaniki bilan almashmasin)', () => {
    expect(cfg.win?.icon).toBe(ICON_PATH);
  });

  it('NSIS: oneClick=false, perMachine=false (per-user — UAC yo`q, kassa naqshi)', () => {
    expect(cfg.nsis?.oneClick).toBe(false);
    expect(cfg.nsis?.perMachine).toBe(false);
  });

  it('chiqish katalogi kassanikidan alohida (dist bir-birini o`chirmasin)', () => {
    expect(cfg.directories?.output).toBe('dist-omborchi');
    expect(cfg.directories?.output).not.toBe('dist');
  });

  it('publish: generic provider + omborchi kanali', () => {
    const pub = cfg.publish ?? [];
    expect(pub.length).toBeGreaterThan(0);
    expect(pub[0]?.provider).toBe('generic');
    expect(pub[0]?.url ?? '').toContain(UPDATE_PATH);
    expect(pub[0]?.url ?? '').not.toContain(KASSA_UPDATE_PATH);
  });

  it('imzolash sertifikati repo`ga YOZILMAGAN', () => {
    const raw = builderRaw.toLowerCase();
    expect(raw).not.toContain('certificatepassword');
    expect(raw).not.toContain('certificatefile');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('yig`ish scripti va asset qo`riqchisi', () => {
  it('package.json da dist:omborchi bor va omborchi konfiguratsiyasini oladi', () => {
    const pkg = JSON.parse(pkgRaw || '{}') as { scripts?: Record<string, string> };
    const script = pkg.scripts?.['dist:omborchi'] ?? '';
    expect(script, 'dist:omborchi scripti yo`q').toContain('check-build-assets.js omborchi');
    expect(script).toContain('--config omborchi.builder.json');
  });

  it('asset qo`riqchisi omborchi ikonkasini talab qiladi', () => {
    expect(assetsGuardSrc).toContain(ICON_PATH);
    expect(assetsGuardSrc).toContain('process.exit(1)');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('desktop/mode.js — rejim manbasi', () => {
  it('fayl mavjud va package.json `shersetMode` maydonini o`qiydi', () => {
    expect(modeSrc.length, 'desktop/mode.js topilmadi').toBeGreaterThan(0);
    expect(stripComments(modeSrc)).toContain('shersetMode');
  });

  it('sukut — kassa (marker yo`q eski build xulqi o`zgarmaydi)', () => {
    expect(stripComments(modeSrc)).toMatch(/['"]kassa['"]/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('yangilanish kanali — rejimga qarab, kassaniki bilan ARALASHMAYDI', () => {
  it('updater.js ikkala kanal yo`lini rejim bo`yicha tanlaydi', () => {
    const code = stripComments(updaterSrc);
    expect(code).toContain(`'${UPDATE_PATH}'`);
    expect(code).toContain(`'${KASSA_UPDATE_PATH}'`);
    expect(code).toMatch(/mode\.isOmborchi\s*\?/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('desktop/main.js — omborchi oynasi', () => {
  const code = stripComments(mainSrc);

  it('kirish nuqtasi rejimga qarab: /omborchi yoki /kassa-kirish', () => {
    expect(code).toMatch(/mode\.isOmborchi\s*\?\s*'\/omborchi'\s*:\s*'\/kassa-kirish'/);
  });

  it('🔴 rejim preload`ga additionalArguments bilan beriladi (sandbox package.json o`qiy olmaydi)', () => {
    expect(code).toContain('additionalArguments');
    expect(code).toContain(MODE_MARKER);
  });

  it('omborchi oynasi KIOSK EMAS (kiosk faqat kassa shoxida)', () => {
    // Omborchi shoxi alohida BrowserWindow chaqiruvida, `kiosk:` KALITISIZ.
    const at = code.indexOf('mode.isOmborchi\n    ? new BrowserWindow');
    const atInline = code.search(/mode\.isOmborchi\s*\?\s*new BrowserWindow/);
    expect(Math.max(at, atInline), 'omborchi oyna shoxi topilmadi').toBeGreaterThan(0);
    // `kiosk: false` literal taqiqlangan (kassa qo'riqchisi bilan bir xil).
    expect(code).not.toMatch(/kiosk\s*:\s*false/);
  });

  it('omborchi yopilishida ham yangilanish o`rnatiladi (quitShell yo`li)', () => {
    const at = code.indexOf("win.on('close'");
    expect(at).toBeGreaterThan(0);
    const body = code.slice(at, at + 400);
    expect(body).toContain('mode.isOmborchi');
    expect(body).toContain('quitShell()');
  });

  it('kamera skaneri uchun media ruxsati FAQAT o`z serverimizga', () => {
    expect(code).toContain('setPermissionRequestHandler');
    const at = code.indexOf('setPermissionRequestHandler');
    const around = code.slice(Math.max(0, at - 300), at + 300);
    expect(around).toContain('serverBase');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('desktop/preload.js — shellKind va kiosk-yordamchilar gate`i', () => {
  const code = stripComments(preloadSrc);

  it('shellKind electronAPI orqali beriladi', () => {
    expect(code).toMatch(/shellKind\s*:\s*SHELL_MODE/);
  });

  it('rejim additionalArguments markeridan o`qiladi', () => {
    expect(code).toContain(MODE_MARKER);
  });

  it('🔴 omborchi rejimida kiosk-yordamchilar O`RNATILMAYDI', () => {
    const at = code.indexOf('function installShellHelpers');
    expect(at).toBeGreaterThan(0);
    const body = code.slice(at, at + 400);
    expect(body).toMatch(/SHELL_MODE\s*===\s*'omborchi'/);
    // Gate yordamchilardan OLDIN turadi.
    expect(body.indexOf("'omborchi'")).toBeLessThan(body.indexOf('installTouchKeyboard'));
  });

  it('isSherset baribir true qoladi (chop etish ko`prigi ishlashi uchun)', () => {
    expect(code).toMatch(/isSherset\s*:\s*true/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('🔴 web: omborchi qobig`i KASSA deb tanilmaydi (pos-device.ts)', () => {
  const code = stripComments(posDeviceSrc);

  it('isShersetShell omborchi turini chiqarib tashlaydi', () => {
    const at = code.indexOf('export function isShersetShell');
    expect(at).toBeGreaterThan(0);
    const body = code.slice(at, at + 300);
    expect(body).toMatch(/shellKind\s*!==\s*'omborchi'/);
  });

  it('ShellBridge interfeysida shellKind maydoni bor (contract-test preload`ni tekshiradi)', () => {
    expect(code).toMatch(/shellKind\?\s*:/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('versiya drifti — README omborchi bo`limi', () => {
  const cfg = JSON.parse(builderRaw || '{}') as BuilderConfig;

  it('README dagi omborchi installer nomi builder versiyasi bilan MOS', () => {
    const expected = `Sherset-Omborchi-Setup-${cfg.extraMetadata?.version}.exe`;
    expect(readme, `README da ${expected} yo'q — versiya ko'tarilganda ham yangilanadi`).toContain(
      expected,
    );
  });

  it('README omborchi kanalini hujjatlaydi', () => {
    expect(readme).toContain(UPDATE_PATH);
  });
});
