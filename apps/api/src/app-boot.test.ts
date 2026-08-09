import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Marshrut to'qnashuvi qo'riqchisi — PROD 502 hodisasidan (2026-08-05).
 *
 * BO'LGAN ISH: `manager/kpi` prefiksidagi ikki controllerga bir xil
 * `@Get('metrics')` e'lon qilindi. Fastify ikkinchisida
 * `FST_ERR_DUPLICATED_ROUTE` tashlaydi va **butun API ko'tarilmaydi** —
 * prodda `sherset-v2-api` crash-loop'ga tushib, `/api/v1/*` 502 qaytardi.
 *
 * NEGA HECH BIR GATE TUTMADI:
 *   · typecheck — ikki metod ikki klassda, tur jihatdan mutlaqo to'g'ri;
 *   · biome — hech qanday qoida buzilmagan;
 *   · unit-testlar — servislar to'g'ridan-to'g'ri `new` bilan quriladi,
 *     Nest HTTP qatlami umuman ko'tarilmaydi.
 * Ya'ni xato faqat ILOVA ISHGA TUSHGANDA ko'rinadi.
 *
 * Bu test manba matnini skanlab, har `@Controller(prefix)` + `@Method(path)`
 * juftligini yig'adi va TAKRORLANISHNI topadi. Nest'ni haqiqatan ko'tarish
 * (DB, Redis, cron) test muhitida qimmat va mo'rt — manba-skan esa aynan shu
 * bug-klassni deterministik tutadi.
 */

const MODULES = join(__dirname, 'modules');

/**
 * `@Controller('x')` / `@Get('y')` — dekorator argumentidagi yo'l.
 *
 * ⚠️ Bitta faylda BIR NECHTA `@Controller` bo'lishi mumkin (masalan
 * `payment-gateway.controller.ts` da `payment-gateways` + `payme` + `click`).
 * Shuning uchun fayl `@Controller` bo'yicha bo'laklarga ajratiladi va har
 * route eng yaqin OLDINGI prefiksga biriktiriladi — aks holda begona
 * prefiksga qo'shilib, yolg'on to'qnashuv chiqadi.
 */
const CONTROLLER_RE = /@Controller\(\s*['"`]([^'"`]*)['"`]\s*\)/g;
const ROUTE_RE = /@(Get|Post|Put|Patch|Delete|All)\(\s*(?:['"`]([^'"`]*)['"`])?\s*\)/g;

function controllerFiles(): string[] {
  return readdirSync(MODULES, { recursive: true, encoding: 'utf8' })
    .filter((p) => p.endsWith('.controller.ts'))
    .map((p) => join(MODULES, p));
}

/** Izohlarni olib tashlaydi — hujjatdagi misol route sifatida sanalmasin. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function norm(prefix: string, path: string): string {
  const joined = `${prefix}/${path}`.replace(/\/+/g, '/').replace(/\/$/, '');
  // `:id` va `:key` bir xil o'rin egallaydi — Fastify ularni ham to'qnash
  // deb hisoblaydi, shuning uchun parametr nomi normallashtiriladi.
  return joined.replace(/:[A-Za-z0-9_]+/g, ':p') || '/';
}

interface Route {
  method: string;
  path: string;
  file: string;
}

function allRoutes(): Route[] {
  const out: Route[] = [];
  for (const file of controllerFiles()) {
    const src = stripComments(readFileSync(file, 'utf8'));
    const shortFile = file.replace(MODULES, '').replace(/\\/g, '/');

    // Fayldagi har `@Controller` ning boshlanish o'rni + prefiksi.
    const anchors = [...src.matchAll(CONTROLLER_RE)].map((m) => ({
      at: m.index ?? 0,
      prefix: m[1] ?? '',
    }));
    if (anchors.length === 0) continue;

    for (const m of src.matchAll(ROUTE_RE)) {
      const at = m.index ?? 0;
      // Eng yaqin OLDINGI `@Controller` — route o'shanga tegishli.
      let owner = anchors[0];
      for (const a of anchors) {
        if (a.at < at) owner = a;
        else break;
      }
      out.push({
        method: m[1] ?? '',
        path: norm(owner?.prefix ?? '', m[2] ?? ''),
        file: shortFile,
      });
    }
  }
  return out;
}

describe('marshrutlar to`qnashmaydi (FST_ERR_DUPLICATED_ROUTE)', () => {
  const routes = allRoutes();

  it('skaner ishlayapti — controllerlar va routelar topildi', () => {
    // Vakuum bo'lmasligi uchun: regex buzilsa ro'yxat bo'shab qoladi va
    // test «to'qnashuv yo'q» deb yashil bo'laverardi.
    expect(routes.length).toBeGreaterThan(300);
    expect(routes.some((r) => r.path === 'manager/kpi/metrics')).toBe(true);
  });

  it('bitta `metod + yo`l` juftligi FAQAT bir marta e`lon qilingan', () => {
    const seen = new Map<string, string[]>();
    for (const r of routes) {
      const key = `${r.method} ${r.path}`;
      seen.set(key, [...(seen.get(key) ?? []), r.file]);
    }
    const duplicates = [...seen.entries()]
      .filter(([, files]) => files.length > 1)
      .map(([key, files]) => `${key} → ${files.join(' + ')}`);

    expect(
      duplicates,
      `Bir xil marshrut ikki joyda e'lon qilingan — API ko'tarilmaydi:\n${duplicates.join('\n')}`,
    ).toEqual([]);
  });

  it('sintetik to`qnashuvni TUTADI (test vakuum emas)', () => {
    const synthetic: Route[] = [
      { method: 'Get', path: 'a/b', file: 'x.controller.ts' },
      { method: 'Get', path: 'a/b', file: 'y.controller.ts' },
    ];
    const seen = new Map<string, number>();
    for (const r of synthetic)
      seen.set(`${r.method} ${r.path}`, (seen.get(`${r.method} ${r.path}`) ?? 0) + 1);
    expect([...seen.values()].some((n) => n > 1)).toBe(true);
  });
});

/**
 * YETIM MODUL qo'riqchisi (2026-08-05 topilmasidan).
 *
 * BO'LGAN ISH: `DebtModule` — 1926 satrlik servis, controller, Telegram/SMS
 * eslatmalari va hisobotlari — `AppModule` ga (va boshqa hech qayerga)
 * IMPORT QILINMAGAN edi. Ya'ni butun qarz funksiyasi o'lik kod bo'lib
 * turgan: prodda `/api/v1/debts` **404** qaytarardi, TZ esa uni «ishlaydi»
 * deb sanardi va kassa §7 aynan shunga tayanardi.
 *
 * NEGA HECH BIR GATE TUTMADI: fayl kompilyatsiya bo'ladi, testlari yashil
 * (servis to'g'ridan-to'g'ri `new` bilan sinaladi), lint jim. Modul
 * ro'yxatdan o'tmagani faqat **ishlayotgan ilovada** — 404 sifatida
 * ko'rinadi. Bu klass: [[climart-dropped-sherset-features]].
 *
 * Qoida: **controller e'lon qilgan har modul ilovaga ulangan bo'lishi shart.**
 * Servis-only modul (controllersiz) bu tekshiruvdan tashqarida — u boshqa
 * modul tomonidan ishlatilishi mumkin.
 */
/** Windows yo'l ajratgichi — regexsiz (yakka `\` yaroqsiz regex). */
const SEP = String.fromCharCode(92);

describe('yetim modul yo`q (controller bor — route ham bor)', () => {
  const SRC = join(__dirname);

  function allModuleFiles(): string[] {
    return readdirSync(join(SRC, 'modules'), { recursive: true, encoding: 'utf8' })
      .filter((p) => p.endsWith('.module.ts'))
      .map((p) => join(SRC, 'modules', p));
  }

  /** Barcha `.ts` manbalar (testlardan tashqari) — havolalarni izlash uchun. */
  function allSources(): string[] {
    return readdirSync(SRC, { recursive: true, encoding: 'utf8' })
      .filter((p) => p.endsWith('.ts') && !p.endsWith('.test.ts'))
      .map((p) => join(SRC, p));
  }

  it('controller e`lon qilgan modul ILOVAGA ULANGAN', () => {
    const modules = new Map<string, { file: string; controllers: string[] }>();
    for (const file of allModuleFiles()) {
      const src = stripComments(readFileSync(file, 'utf8'));
      const name = src.match(/export class (\w+Module)/)?.[1];
      if (!name) continue;
      const block = src.match(/controllers:\s*\[([^\]]*)\]/s)?.[1] ?? '';
      const controllers = block
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);
      if (controllers.length > 0) {
        const rel = file.slice(SRC.length).split(SEP).join('/');
        modules.set(name, { file: rel, controllers });
      }
    }

    // Modul HAQIQATAN ro'yxatdan o'tganmi.
    //
    // ⚠️ «Faylda eslatilgan» YETARLI EMAS: `import { DebtModule } from ...`
    // qatori qolib, `imports: [...]` dan tushib qolishi mumkin — aynan shu
    // holat 2026-08-05 da topildi. Shuning uchun faqat MODUL DEKORATORINING
    // `imports` massivi ichidagi nom hisobga olinadi.
    const registered = new Set<string>();
    for (const file of allSources()) {
      const src = stripComments(readFileSync(file, 'utf8'));
      const selfName = src.match(/export class (\w+Module)/)?.[1];

      // Taxallus bilan import: `import { StoreModule as StoreAdminModule }`.
      // Ro'yxatda LOKAL nom turadi, shuning uchun uni asl nomga qaytaramiz —
      // aks holda tirik modul «yetim» deb yolg'on xabar berilardi.
      const aliasToReal = new Map<string, string>();
      for (const a of src.matchAll(/(\w+Module)\s+as\s+(\w+)/g)) {
        if (a[1] && a[2]) aliasToReal.set(a[2], a[1]);
      }

      // `@Module({ ... imports: [ ... ] ... })` — massiv ichidagi ro'yxat.
      for (const m of src.matchAll(/imports:\s*\[([\s\S]*?)\]/g)) {
        const body = m[1] ?? '';
        const names = [...body.matchAll(/(\w+)/g)].map((x) => x[1] ?? '');
        for (const local of names) {
          const real = aliasToReal.get(local) ?? local;
          if (real !== selfName && modules.has(real)) registered.add(real);
        }
      }
    }

    const orphans = [...modules.entries()]
      .filter(([name]) => !registered.has(name))
      .map(([name, d]) => `${name} (${d.controllers.join(', ')}) — ${d.file}`);

    expect(
      orphans,
      `Bu modullar controller e'lon qilgan, lekin ilovaga ULANMAGAN — ularning
barcha route'lari 404 qaytaradi:
${orphans.join('\n')}`,
    ).toEqual([]);
  });

  it('skaner ishlayapti — controllerli modullar topildi (vakuum emas)', () => {
    const withControllers = allModuleFiles().filter((f) =>
      /controllers:\s*\[\s*\w/.test(stripComments(readFileSync(f, 'utf8'))),
    );
    expect(withControllers.length).toBeGreaterThan(80);
  });
});

/**
 * IN'YEKSIYA-PREMISASI qo'riqchisi (Faza 14, `PP-06` in'yeksiyasidan).
 *
 * BO'LGAN ISH: `SupplyService` ga `PermissionsService` qo'shildi, lekin
 * `SupplyModule.imports` ga `PermissionsModule` yozilmadi — faqat
 * `@Global()` ga tayanildi. Bu HOZIR ishlaydi, biroq @Global izohi o'zi
 * («HrPermissionGuard uchun qo'shildi») uni vaqtinchalik deb ta'riflaydi:
 * kim @Global'ni olib tashlasa, `SupplyService` DI'da hal bo'lmay qoladi va
 * **API umuman ko'tarilmaydi** (prod 502) — [[duplicate-route-prod-502]] bilan
 * bir xil klass.
 *
 * NEGA HECH BIR GATE TUTMAYDI: typecheck uchun `@Inject(X) private x: X` mutlaqo
 * to'g'ri; unit-testlar servisni `new` bilan quradi (DI grafi UMUMAN qurilmaydi);
 * yuqoridagi yetim-modul qo'riqchisi esa faqat controllerli modullarni ko'radi.
 *
 * Qoida: `PermissionsService`ni in'yeksiya qilgan servisning moduli
 * `PermissionsModule`ni OSHKORA import qilsin (yoki servisning o'zini bersin).
 * Loyihadagi 4/4 mavjud iste'molchi allaqachon shunday qiladi.
 */
/**
 * Cross-modul in'yeksiya premisasi. Ro'yxatga servis qo'shilsa, uni
 * in'yeksiya qilgan HAR modul tegishli moduini OSHKORA import qilishi shart —
 * `@Global`ga (yoki «boshqa modul allaqachon import qilgan» tasodifiga)
 * tayanish prod'da «API umuman ko'tarilmaydi» bilan tugaydi.
 */
const INJECTION_PREMISES = [
  {
    service: 'PermissionsService',
    module: 'PermissionsModule',
    minConsumers: 4,
    anchor: '/supply/supply.service.ts',
  },
  // Faza 19 (`INT-02`): gateway capture PaymentIn yozadi.
  {
    service: 'PaymentInService',
    module: 'PaymentInModule',
    minConsumers: 2,
    anchor: '/payment-gateway/payment-gateway.service.ts',
  },
] as const;

describe.each(INJECTION_PREMISES)(
  "in'yeksiya premisasi — $service moduldan ta'minlangan",
  ({ service, module, minConsumers, anchor }) => {
    const MODULES_DIR = join(__dirname, 'modules');

    function serviceFiles(): string[] {
      return readdirSync(MODULES_DIR, { recursive: true, encoding: 'utf8' })
        .filter((p) => p.endsWith('.service.ts') && !p.endsWith('.test.ts'))
        .map((p) => join(MODULES_DIR, p));
    }

    /** Konstruktor in'yeksiyasi — `private readonly x: PermissionsService`. */
    const INJECT_RE = new RegExp(`(?:private|public|protected|readonly)[^;()]*:\\s*${service}\\b`);

    function consumers(): string[] {
      return serviceFiles().filter((f) => INJECT_RE.test(stripComments(readFileSync(f, 'utf8'))));
    }

    it(`${service} in'yeksiya qilgan HAR modul ${module}'ni import qiladi`, () => {
      const unwired: string[] = [];
      for (const file of consumers()) {
        const dir = file.slice(0, file.lastIndexOf(SEP));
        const mods = readdirSync(dir).filter((p) => p.endsWith('.module.ts'));
        if (mods.length === 0) continue; // modulsiz yordamchi papka — tekshirilmaydi
        const ok = mods.some((m) => {
          const src = stripComments(readFileSync(join(dir, m), 'utf8'));
          // O'z moduli servisni PROVIDER sifatida bersa ham yetarli (permissions/ o'zi).
          if (new RegExp(`providers:\\s*\\[[\\s\\S]*?\\b${service}\\b[\\s\\S]*?\\]`).test(src)) {
            return true;
          }
          return new RegExp(`imports:\\s*\\[[\\s\\S]*?\\b${module}\\b[\\s\\S]*?\\]`).test(src);
        });
        if (!ok) unwired.push(file.slice(MODULES_DIR.length).split(SEP).join('/'));
      }

      expect(
        unwired,
        `Bu servislar ${service}'ni in'yeksiya qiladi, lekin moduli
${module}'ni import qilmaydi — @Global bekor qilinsa API ko'tarilmaydi:
${unwired.join('\n')}`,
      ).toEqual([]);
    });

    it("skaner ishlayapti — iste'molchilar topildi (vakuum emas)", () => {
      const found = consumers().map((f) => f.slice(MODULES_DIR.length).split(SEP).join('/'));
      expect(found.length).toBeGreaterThanOrEqual(minConsumers);
      expect(found.some((f) => f.includes(anchor))).toBe(true);
    });
  },
);
