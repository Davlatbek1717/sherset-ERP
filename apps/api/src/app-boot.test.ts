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
