import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Klass-qulf: integratsiya konfiguratsiya-yozuvchilari (`saveConfig` /
 * `upsertConfig` / `updateConfig`) **PATCH-semantikada** bo'lsin —
 * Faza 21 (`INT-13`), Faza Q11 (klass bo'ylab audit).
 *
 * Bug-klass: `X: parsed.X ?? null` uslubi «maydon KELMADI» (`undefined`) va
 * «maydonni TOZALA» (`null`) holatlarini bir xil qiladi. Natijada bitta
 * maydonni yangilagan so'rov qolgan maydonlarni JIMGINA NULL'ga reset qiladi
 * — telegram'da bu `webhookSecret`ni yo'q qilib butun inbound oqimni 401'ga
 * aylantirar edi (Faza 21 hisoboti).
 *
 * To'g'ri naqsh: `...(parsed.X !== undefined ? { X: parsed.X } : {})` —
 * kelmagan maydon TEGILMAYDI. «Ataylab tozalash» yo'li sxemada saqlanadi:
 * bo'sh string (`''`) → `null` (`optionalEmpty` preprocess) ⇒ operator
 * qiymatni baribir o'chira oladi.
 *
 * Qulf **kashfiyot** (discovery) asosida ishlaydi: `apps/api/src/modules`
 * ostidagi HAR QANDAY yangi `*Config` yozuvchisi avtomatik tekshiriladi —
 * ro'yxatga qo'shish shart emas. Ya'ni yangi `saveConfig` `?? null` bilan
 * qo'shilsa, shu test yiqiladi.
 *
 * Skan METOD TANASI bo'yicha (butun fayl bo'yicha EMAS): o'sha fayllarda
 * `create` yo'llari (masalan `email.service.ts` send-log, `sms.service.ts`
 * log yozuvi) `?? null` ni HAQLI ravishda ishlatadi — ular to'liq-tana
 * yaratish, qisman yangilash emas.
 *
 * Non-vacuity (JONLI o'lchandi, Faza Q11): fix'dan oldin qulf uchta joyni
 * ko'rsatib yiqildi — `email.service.ts` (`fromName`, `replyTo`),
 * `sms.service.ts` (`senderId`), `payment-gateway.service.ts` (`callbackUrl`).
 */
const MODULES_DIR = join(import.meta.dirname, '..');

/**
 * Kommentlarni olib tashlaydi — taqiqlangan naqsh faqat HAQIQIY kodga
 * qo'llansin. (Telegram fixining o'z izohi «Ilgari `parsed.webhookUrl ?? null`
 * uslubi…» deb yozadi; xom matn skani buni regressiya deb o'qib qulfni
 * yolg'on-yiqitardi — Faza 21 dagi aynan shu tuzoq.)
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...listTsFiles(full));
      continue;
    }
    if (!entry.endsWith('.ts') || entry.endsWith('.test.ts')) continue;
    out.push(full);
  }
  return out;
}

/** `async saveConfig(` / `async upsertConfig(` / `async updateSmsConfig(` … */
const CONFIG_WRITER_RE = /\basync\s+(?:save|upsert|update)[A-Za-z]*Config\s*\(/g;

/**
 * Metod tanasini `{`…`}` juftligi bo'yicha kesib oladi. String literallar
 * ichidagi qavslar hisobga olinmaydi (aks holda `'{'` tanani buzardi).
 */
function methodBodies(code: string): string[] {
  const bodies: string[] = [];
  CONFIG_WRITER_RE.lastIndex = 0;
  let m: RegExpExecArray | null = CONFIG_WRITER_RE.exec(code);
  while (m !== null) {
    const open = code.indexOf('{', m.index + m[0].length);
    if (open !== -1) {
      let depth = 0;
      let quote: string | null = null;
      let i = open;
      for (; i < code.length; i++) {
        const ch = code[i];
        const prev = code[i - 1];
        if (quote !== null) {
          if (ch === quote && prev !== '\\') quote = null;
          continue;
        }
        if (ch === "'" || ch === '"' || ch === '`') {
          quote = ch;
          continue;
        }
        if (ch === '{') depth++;
        else if (ch === '}') {
          depth--;
          if (depth === 0) break;
        }
      }
      bodies.push(code.slice(open, i + 1));
    }
    m = CONFIG_WRITER_RE.exec(code);
  }
  return bodies;
}

/** `fromName: parsed.fromName ?? null` — INT-13 NULL-reset naqshi. */
const NULL_RESET_RE =
  /[A-Za-z_$][\w$]*\s*:\s*(?:parsed|dto|input|body|r\.data)\.[\w.]+\s*\?\?\s*(?:null|undefined)/g;

/**
 * Ataylab qoldirilgan istisnolar — kalit `<fayl>: <topilgan matn>` (butun
 * fayl EMAS, aynan bitta qator), qiymat SABAB. Fayl darajasida istisno
 * qilinmaydi: aks holda o'sha fayldagi KEYINGI haqiqiy INT-13 jim o'tardi.
 */
const ALLOWLIST = new Map<string, string>([
  [
    'manager/kpi/kpi-config.service.ts: note: input.note ?? null',
    // Bu yerda «qisman yangilash» tushunchasi YO'Q: har saqlash
    // `kpiProfileVersion` ning YANGI qatorini yaratadi (versiyalash), ya'ni
    // saqlanadigan oldingi qiymat yo'q. To'liq-tana create'da `?? null` —
    // to'g'ri naqsh.
    'kpiProfileVersion.create — har safar YANGI versiya qatori, qisman update emas',
  ],
]);

interface Writer {
  rel: string;
  bodies: string[];
}

function discoverWriters(): Writer[] {
  const writers: Writer[] = [];
  for (const file of listTsFiles(MODULES_DIR)) {
    const code = stripComments(readFileSync(file, 'utf8'));
    CONFIG_WRITER_RE.lastIndex = 0;
    if (!CONFIG_WRITER_RE.test(code)) continue;
    writers.push({
      rel: relative(MODULES_DIR, file).split(sep).join('/'),
      bodies: methodBodies(code),
    });
  }
  return writers;
}

describe('config saveConfig — PATCH-semantika klass qulfi (INT-13)', () => {
  const writers = discoverWriters();

  it('kashfiyot vakuum emas — konfiguratsiya-yozuvchilar topildi', () => {
    // Faza Q11 da JONLI o'lchandi: 23 ta fayl (servis + controller). Chegara
    // pastroq qo'yilgan: qulf bitta fayl o'chirilganda emas, kashfiyot
    // BUTUNLAY ishlamay qolganda qichqirsin.
    expect(writers.length).toBeGreaterThanOrEqual(15);
    const rels = writers.map((w) => w.rel);
    expect(rels).toContain('telegram/telegram.service.ts');
    expect(rels).toContain('email/email.service.ts');
    expect(rels).toContain('sms/sms.service.ts');
    expect(rels).toContain('payment-gateway/payment-gateway.service.ts');
    // Tana kesish ishlayotganini tasdiqla (bo'sh tana = jim-o'tkazish).
    for (const w of writers) expect(w.bodies.length).toBeGreaterThan(0);
  });

  it('hech bir konfiguratsiya-yozuvchi `X: parsed.X ?? null` NULL-reset qilmaydi', () => {
    const offenders: string[] = [];
    for (const w of writers) {
      for (const body of w.bodies) {
        NULL_RESET_RE.lastIndex = 0;
        for (const hit of body.matchAll(NULL_RESET_RE)) {
          const key = `${w.rel}: ${hit[0].trim()}`;
          if (ALLOWLIST.has(key)) continue;
          offenders.push(key);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('telegram — namunaviy PATCH naqshi saqlanadi (referens implementatsiya)', () => {
    const code = stripComments(
      readFileSync(join(MODULES_DIR, 'telegram', 'telegram.service.ts'), 'utf8'),
    );
    expect(code).toMatch(
      /\.\.\.\(\s*parsed\.webhookSecret\s*!==\s*undefined\s*\?\s*\{\s*webhookSecret:\s*parsed\.webhookSecret\s*\}\s*:\s*\{\s*\}\s*\)/,
    );
  });
});
