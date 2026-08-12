import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * KASSA INSTALLER + AVTOYANGILANISH — KONFIGURATSIYA QO'RIQCHISI (F4, spec §8).
 *
 * Bug-klassi (xotira: «ombor cheki uch renderer — biri o'zgarsa qolgani jimgina
 * eskiradi»): yangilanish kanalining yo'li `/downloads/desktop/` **besh joyda**
 * qo'lda yozilgan — updater kodi, electron-builder `publish` bloki, uchta nginx
 * konfiguratsiyasi va ikkita hujjat. Biri o'zgarsa qolgani jim eskiradi va
 * natija kassada ko'rinadi: yangilanish hech qachon kelmaydi, hech narsa
 * shikoyat qilmaydi (electron-updater 404 ni jim yutadi — kassirni bezovta
 * qilmaslik uchun ataylab shunday).
 *
 * Ikkinchi qulflanadigan shartnoma (spec §8.3): yangilanish **savdo o'rtasida
 * o'rnatilmaydi**. `autoInstallOnAppQuit` va `update-downloaded` ishlovchisi
 * shuni buzishi mumkin — ikkalasi ham bir qatorlik o'zgarish, hech bir
 * typecheck/biome ko'rmaydi.
 *
 * 🔴 Bu yerdagi qiymatlar — YAGONA MANBA. Konfiguratsiya o'zgarsa test qizaradi
 * va o'zgartiruvchi hamma joyni ko'radi.
 *
 * Yorliq: bu **strukturaviy** qo'riqchi. `.exe` HECH QACHON yig'ilmagan
 * (F4 sessiyasida electron/electron-builder o'rnatilmadi) — real installer
 * xulqi Phase-2 (F12) da o'lchanadi.
 */

const WEB = process.cwd(); // apps/web
const REPO = join(WEB, '..', '..');
const desktopFile = (name: string): string => join(REPO, 'desktop', name);

/** Yangilanish kanalining yo'li — serverning ildizidan. */
const UPDATE_PATH = '/downloads/desktop/';
/** electron-updater `generic` provider shu nomdagi manifestni so'raydi. */
const UPDATE_MANIFEST = 'latest.yml';
/** electron-builder shabloni — `${version}` LITERAL qolishi shart. */
const ARTIFACT_TEMPLATE = 'Sherset-Kassa-Setup-${version}.exe';
/** Spec §8.3 — har 4 soatda tekshiriladi. */
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
/** Ikonka yo'li — binar fayl, repo'da YO'Q (operator qo'shadi). */
const ICON_PATH = 'build/icon.ico';

const NGINX_CONFS = [
  'nginx-sherset.biznesjon.uz.conf',
  'nginx-climart.biznesjon.uz.conf',
  'nginx-climartgroup.uz.conf',
];

interface NsisConfig {
  oneClick?: boolean;
  perMachine?: boolean;
  allowToChangeInstallationDirectory?: boolean;
}
interface WinConfig {
  target?: unknown;
  icon?: string;
  artifactName?: string;
}
interface PublishConfig {
  provider?: string;
  url?: string;
}
interface BuildConfig {
  appId?: string;
  productName?: string;
  directories?: { output?: string; buildResources?: string };
  files?: string[];
  win?: WinConfig;
  nsis?: NsisConfig;
  publish?: PublishConfig | PublishConfig[];
}
interface DesktopPkg {
  version?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  build?: BuildConfig;
}

const read = (p: string): string => (existsSync(p) ? readFileSync(p, 'utf8') : '');

/**
 * Izohlarni olib tashlaydi. 🔴 Mutatsiya sinovida topilgan: xulq-shartnomasi
 * (`autoInstallOnAppQuit = false`) fayl boshidagi JSDoc'da ham AYNAN shu matn
 * bilan yozilgan edi — kodni `true` ga o'zgartirganda test YASHIL qolardi,
 * chunki regex izohga tushardi. Xulq testlari faqat KOD ustida ishlaydi.
 */
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const pkgRaw = read(desktopFile('package.json'));
const updaterSrc = read(desktopFile('updater.js'));
const updaterCode = stripComments(updaterSrc);
const mainSrc = read(desktopFile('main.js'));
const mainCode = stripComments(mainSrc);
const readme = read(desktopFile('README.md'));
const assetsGuardSrc = read(desktopFile('check-build-assets.js'));
const deployDoc = read(join(REPO, 'deploy', 'DEPLOY-sherset.md'));

// ─────────────────────────────────────────────────────────────────────────────
describe('desktop/package.json — parse bo`ladi va electron-builder bloki bor', () => {
  it('JSON sifatida parse bo`ladi', () => {
    expect(pkgRaw.length, 'desktop/package.json bo`sh yoki topilmadi').toBeGreaterThan(0);
    expect(() => JSON.parse(pkgRaw) as DesktopPkg).not.toThrow();
  });

  it('`build` bloki mavjud (konfiguratsiya package.json ICHIDA — README §sabab)', () => {
    const pkg = JSON.parse(pkgRaw) as DesktopPkg;
    expect(pkg.build, '`build` bloki yo`q').toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('electron-builder — NSIS (spec §8.1)', () => {
  const pkg = JSON.parse(pkgRaw || '{}') as DesktopPkg;
  const build = pkg.build ?? {};

  it('appId va productName berilgan', () => {
    expect(build.appId, 'appId yo`q — Windows ilovani tanimaydi').toMatch(/^[a-z0-9.]+$/i);
    expect(build.productName).toBe('Sherset Kassa');
  });

  it('win target — nsis', () => {
    expect(JSON.stringify(build.win?.target ?? [])).toContain('nsis');
  });

  it('NSIS: oneClick=false, perMachine=FALSE (per-user — UAC yo`q)', () => {
    // 🔴 NIYAT O'ZGARDI (2026-08-13). Eski niyat: «perMachine:false — boshqa
    // Windows profilida ilova YO'Q bo'lib qoladi». Kassa monoblokida profil
    // BITTA, eski niyat esa har yangilanishda UAC so'rardi va kassirda admin
    // huquqi yo'q ⇒ avtoyangilanish AMALDA HECH QACHON o'rnatilmasdi (K03).
    // Per-user o'rnatma UAC'ni butunlay olib tashlaydi.
    expect(build.nsis?.oneClick).toBe(false);
    expect(build.nsis?.perMachine).toBe(false);
  });

  it('artifact nomi — spec dagi shablon, `${version}` LITERAL', () => {
    expect(build.win?.artifactName).toBe(ARTIFACT_TEMPLATE);
  });

  it('ikonka yo`li konfiguratsiyada ko`rsatilgan', () => {
    expect(build.win?.icon).toBe(ICON_PATH);
  });

  it('imzolash sertifikati repo`ga YOZILMAGAN (spec §8.2 — 1-versiya imzosiz)', () => {
    const raw = pkgRaw.toLowerCase();
    expect(raw).not.toContain('certificatepassword');
    expect(raw).not.toContain('certificatefile');
    expect(raw).not.toContain('certificatesubjectname');
  });

  it('yig`ish scripti oldin asset qo`riqchisini yugurtiradi', () => {
    const dist = pkg.scripts?.dist ?? '';
    expect(dist, '`dist` scripti yo`q').toContain('check-build-assets.js');
    expect(dist).toContain('electron-builder');
    expect(assetsGuardSrc, 'check-build-assets.js topilmadi').toContain(ICON_PATH);
  });

  it('electron-builder devDependency sifatida qoladi (monorepo`ga tortilmaydi)', () => {
    const pkgJson = JSON.parse(pkgRaw || '{}') as DesktopPkg;
    expect(pkgJson.devDependencies?.['electron-builder']).toBeDefined();
    expect(pkgJson.dependencies?.['electron-updater']).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('yangilanish kanali — bitta yo`l, besh joyda BIR XIL', () => {
  const pkg = JSON.parse(pkgRaw || '{}') as DesktopPkg;
  const publish = pkg.build?.publish;
  const publishList = Array.isArray(publish) ? publish : publish ? [publish] : [];

  it('1/5 — electron-builder `publish`: generic provider + kanal yo`li', () => {
    expect(publishList.length, '`build.publish` yo`q').toBeGreaterThan(0);
    expect(publishList[0]?.provider).toBe('generic');
    expect(publishList[0]?.url ?? '').toContain(UPDATE_PATH);
  });

  it('2/5 — desktop/updater.js runtime feed URL', () => {
    expect(updaterSrc.length, 'desktop/updater.js topilmadi').toBeGreaterThan(0);
    // Izohda emas, KODda bo'lsin — izoh feed URL'ini yasamaydi.
    expect(updaterCode).toContain(`'${UPDATE_PATH}'`);
  });

  it('3/5 — nginx `location` uchala konfiguratsiyada', () => {
    for (const conf of NGINX_CONFS) {
      const src = read(join(REPO, 'deploy', conf));
      expect(src.length, `${conf} topilmadi`).toBeGreaterThan(0);
      expect(src, `${conf}: location ${UPDATE_PATH} yo'q`).toContain(`location ${UPDATE_PATH}`);
    }
  });

  it('4/5 — desktop/README.md operator yo`riqnomasi', () => {
    expect(readme).toContain(UPDATE_PATH);
    expect(readme).toContain(UPDATE_MANIFEST);
  });

  it('5/5 — deploy/DEPLOY-sherset.md deploy qadami', () => {
    expect(deployDoc).toContain(UPDATE_PATH);
    expect(deployDoc).toContain(UPDATE_MANIFEST);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('versiya drifti — raqam FAQAT package.json da', () => {
  const pkg = JSON.parse(pkgRaw || '{}') as DesktopPkg;
  const version = pkg.version ?? '';

  it('versiya semver ko`rinishida', () => {
    expect(version).toMatch(/^\d+\.\d+\.\d+(-[\w.]+)?$/);
  });

  it('README dagi installer fayl nomi package.json versiyasi bilan MOS', () => {
    const expected = `Sherset-Kassa-Setup-${version}.exe`;
    expect(readme, `README da ${expected} yo'q — versiya ko'tarilganda ham yangilanadi`).toContain(
      expected,
    );
  });

  it('updater.js versiyani QOTIRMAYDI (app.getVersion() dan oladi)', () => {
    // Qotirilgan versiya = updater o'zini eski deb hisoblamaydi va yangilanish
    // hech qachon kelmaydi; hech narsa shikoyat qilmaydi.
    expect(updaterCode).not.toMatch(/['"`]\d+\.\d+\.\d+/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('avtoyangilanish xulqi (spec §8.3)', () => {
  it('izohsiz manba vacuity emas', () => {
    // `stripComments` buzilib bo'sh natija bersa pastdagi «yo'q» tekshiruvlari
    // yolg'on-yashil bo'lardi.
    expect(updaterCode).toContain('function installOnQuit');
    expect(mainCode).toContain('function quitShell');
  });

  it('fonda yuklab olinadi', () => {
    expect(updaterCode).toMatch(/autoDownload\s*=\s*true/);
    expect(updaterCode).not.toMatch(/autoDownload\s*=\s*false/);
  });

  it('🔴 o`z-o`zidan chiqishda o`rnatilmaydi — autoInstallOnAppQuit=false', () => {
    expect(updaterCode).toMatch(/autoInstallOnAppQuit\s*=\s*false/);
    expect(updaterCode, 'Electron o`zi o`rnatadi — savdo o`rtasida!').not.toMatch(
      /autoInstallOnAppQuit\s*=\s*true/,
    );
  });

  it('🔴 `update-downloaded` ishlovchisi quitAndInstall CHAQIRMAYDI', () => {
    const at = updaterCode.indexOf("'update-downloaded'");
    expect(at, "'update-downloaded' ishlovchisi yo'q").toBeGreaterThan(0);
    const nextOn = updaterCode.indexOf('.on(', at + 1);
    const handler = updaterCode.slice(at, nextOn > at ? nextOn : at + 400);
    expect(handler.length, 'ishlovchi tanasi topilmadi (vacuity)').toBeGreaterThan(40);
    expect(handler, 'yangilanish savdo o`rtasida o`rnatiladi!').not.toContain('quitAndInstall');
  });

  it('🔴 quitAndInstall manbada AYNAN BIR MARTA (yagona o`rnatish nuqtasi)', () => {
    // Ikki chaqiruv = ikki xil bayroq to'plami = biri jimgina eskiradi.
    const calls = updaterCode.match(/quitAndInstall/g) ?? [];
    expect(calls.length, 'quitAndInstall chaqiruvi soni').toBe(1);
    const fnAt = updaterCode.indexOf('function runInstaller');
    expect(fnAt, 'runInstaller topilmadi').toBeGreaterThan(0);
    expect(updaterCode.indexOf('quitAndInstall')).toBeGreaterThan(fnAt);
  });

  it('ikkala yo`l ham runInstaller orqali o`tadi (chiqish + boot)', () => {
    expect(updaterCode).toMatch(/function installOnQuit\(\)\s*\{\s*return runInstaller\(false\)/);
    expect(updaterCode).toMatch(/function installOnBoot\(\)\s*\{\s*return runInstaller\(true\)/);
  });

  it('🔴 boot yo`li ilovani QAYTA OCHADI, chiqish yo`li yo`q', () => {
    // isForceRunAfter=false bo'lsa yangilangan kassa o'chiq qoladi va kimdir
    // yorliqni bosishi kerak (K02).
    expect(updaterCode).toContain('installOnBoot');
    expect(updaterCode).not.toMatch(/quitAndInstall\(true,\s*false\)/);
  });

  it('main.js «Chiqish» yo`lida o`rnatishni chaqiradi', () => {
    const at = mainCode.indexOf('function quitShell');
    expect(at, 'quitShell topilmadi').toBeGreaterThan(0);
    const body = mainCode.slice(at, at + 400);
    expect(body, 'quitShell installOnQuit ni chaqirmaydi').toContain('installOnQuit()');
    // O'rnatish `app.quit()` dan OLDIN — aks holda jarayon yopilib, installer
    // hech qachon ishga tushmaydi.
    expect(body.indexOf('installOnQuit()')).toBeLessThan(body.indexOf('app.quit()'));
  });

  it('🔴 boot`da o`rnatish FAQAT kirish ekranida (savdo o`rtasida emas)', () => {
    // Kassir PIN kiritib savdoga o'tgan bo'lsa yangilanish keyingi bootga qoladi.
    expect(mainCode).toContain('waitForPending');
    expect(mainCode).toContain('installOnBoot');
    const at = mainCode.indexOf('installOnBoot');
    const around = mainCode.slice(Math.max(0, at - 500), at);
    expect(around, 'boot o`rnatish kirish-ekrani sharti bilan qo`riqlanmagan').toMatch(
      /onEntryScreen\(\)/,
    );
  });

  it('har 4 soatda tekshiriladi', () => {
    const match = updaterCode.match(/CHECK_INTERVAL_MS\s*=\s*([^;]+);/);
    expect(match, 'CHECK_INTERVAL_MS yo`q').not.toBeNull();
    // Ifodani hisoblaymiz (`4 * 60 * 60 * 1000`) — matnni solishtirish
    // formatlash o'zgarishida yolg'on qizil berardi.
    const value = Number(new Function(`return (${match?.[1]});`)());
    expect(value).toBe(CHECK_INTERVAL_MS);
  });

  it('server domeni updater.js ga QOTIRILMAGAN (spec §3.2)', () => {
    const urls = updaterSrc.match(/https?:\/\/[a-z0-9.-]+/gi) ?? [];
    expect(urls.filter((u) => !/localhost|127\.0\.0\.1/.test(u))).toEqual([]);
  });

  it('dev rejimda ishga tushmaydi (app-update.yml yo`q — jim xato bo`lardi)', () => {
    expect(updaterCode).toContain('app.isPackaged');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('build/icon.ico — binar, repo`da yo`q (halol hujjat)', () => {
  it('README ikonka yo`lini va uni kim qo`shishini yozadi', () => {
    expect(readme).toContain(ICON_PATH);
  });

  it('README SmartScreen ogohlantirishini tushuntiradi (imzosiz .exe, spec §8.2)', () => {
    expect(readme).toContain('SmartScreen');
  });

  it('asset qo`riqchisi ikonka yo`qligida ANIQ xato beradi', () => {
    expect(assetsGuardSrc).toContain('process.exit(1)');
    expect(assetsGuardSrc).toContain(ICON_PATH);
  });
});
