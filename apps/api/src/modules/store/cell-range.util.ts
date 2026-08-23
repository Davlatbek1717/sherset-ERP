/**
 * Yacheyka diapazon-generatori — retseptni nomlar ro'yxatiga yoyadi.
 *
 * SOF funksiya: DB ham, NestJS ham yo'q. Butun yoyish mantig'i FAQAT shu yerda —
 * FE hech qachon nomlarni o'zi hosil qilmaydi, aks holda oldindan ko'rish va
 * haqiqiy yaratish ajralib ketardi (bu loyihada qayta-qayta chiqqan bug-klass).
 */

/** Bitta amalda yaratsa bo'ladigan maksimal yacheyka soni. */
export const CELL_RANGE_MAX = 5000;

/** Yacheyka nomi uchun DB chegarasi (`StoreCell.name` = VarChar(255)). */
const MAX_NAME_LEN = 255;

/** Foydalanuvchi xatosi — servis buni 400 ga aylantiradi. */
export class CellRangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CellRangeError';
  }
}

export interface CellRangeNumberVariable {
  key: string;
  kind: 'number';
  from: number;
  to: number;
  /** Nol bilan to'ldirish uzunligi (0–6). 0/undefined ⇒ to'ldirilmaydi. */
  pad?: number;
}

export interface CellRangeLetterVariable {
  key: string;
  kind: 'letter';
  /** Bitta harf A–Z (kichik harf ham qabul qilinadi). */
  from: string;
  to: string;
}

export type CellRangeVariable = CellRangeNumberVariable | CellRangeLetterVariable;

export interface CellRangeSpec {
  /** Masalan `{qator}-{stellaj}-{polka}`. */
  template: string;
  variables: CellRangeVariable[];
  /** Qaysi o'zgaruvchi zona nomi bo'ladi; null ⇒ zonasiz. */
  zoneFrom: string | null;
}

export interface ExpandedCell {
  name: string;
  zoneName: string | null;
}

const PLACEHOLDER = /\{([^{}]+)\}/g;

/**
 * Bitta o'zgaruvchining VALIDATSIYASI + qiymatlar SONI — massiv QURMASDAN.
 *
 * Sanoq ataylab arifmetik: `CELL_RANGE_MAX` tekshiruvi massivlar qurilishidan
 * OLDIN bajarilishi shart. Aks holda `num('a', 1, 50_000_000)` da 5000 chegarasiga
 * yetguncha 50 million satrli massiv yaratilib, Node event loop bloklanadi yoki
 * xotira tugaydi. Task 2 Zod sxemasida `to` uchun yuqori chegara YO'Q, ya'ni
 * foydalanuvchining oddiy yozuv xatosi (`999999`) serverni osib qo'yishi mumkin edi.
 *
 * Butun validatsiya SHU YERDA — `valuesOf` faqat shuni chaqiradi, shuning uchun
 * xato xabarlari bitta joyda va o'zgarmasdan qoladi.
 */
function countOf(v: CellRangeVariable): number {
  if (v.kind === 'number') {
    if (!Number.isInteger(v.from) || !Number.isInteger(v.to)) {
      throw new CellRangeError(`«${v.key}»: chegaralar butun son bo'lishi kerak`);
    }
    if (v.from < 0) throw new CellRangeError(`«${v.key}»: manfiy son bo'lmaydi`);
    if (v.from > v.to) {
      throw new CellRangeError(`«${v.key}»: boshlanish (${v.from}) tugashdan (${v.to}) katta`);
    }
    const pad = v.pad ?? 0;
    if (!Number.isInteger(pad) || pad < 0 || pad > 6) {
      throw new CellRangeError(`«${v.key}»: nol-to'ldirish 0 dan 6 gacha bo'lishi kerak`);
    }
    return v.to - v.from + 1;
  }

  const from = String(v.from).toUpperCase();
  const to = String(v.to).toUpperCase();
  if (from.length !== 1 || to.length !== 1) {
    throw new CellRangeError(`«${v.key}»: harf diapazoni bitta harfdan iborat bo'lishi kerak`);
  }
  const a = 'A'.charCodeAt(0);
  const z = 'Z'.charCodeAt(0);
  const f = from.charCodeAt(0);
  const t = to.charCodeAt(0);
  if (f < a || f > z || t < a || t > z) {
    throw new CellRangeError(`«${v.key}»: faqat A–Z harflari`);
  }
  if (f > t) throw new CellRangeError(`«${v.key}»: boshlanish (${from}) tugashdan (${to}) katta`);
  return t - f + 1;
}

/**
 * Bitta o'zgaruvchining barcha qiymatlari, tartib bo'yicha.
 * Validatsiya `countOf` da — bu yerda faqat qurish.
 * Faqat `CELL_RANGE_MAX` tekshiruvidan KEYIN chaqirilishi kerak.
 */
function valuesOf(v: CellRangeVariable): string[] {
  const count = countOf(v);
  const out: string[] = [];

  if (v.kind === 'number') {
    const pad = v.pad ?? 0;
    for (let i = v.from; i <= v.to; i++) out.push(String(i).padStart(pad, '0'));
    return out;
  }

  const f = String(v.from).toUpperCase().charCodeAt(0);
  for (let i = 0; i < count; i++) out.push(String.fromCharCode(f + i));
  return out;
}

/**
 * Retseptni yoyadi. Tartib: BIRINCHI o'zgaruvchi eng sekin aylanadi
 * (`01-A-1, 01-A-2, 01-B-1 …`) — inson kutgan tartib.
 */
export function expandCellRange(spec: CellRangeSpec): ExpandedCell[] {
  if (spec.variables.length === 0) {
    throw new CellRangeError("Kamida bitta o'zgaruvchi kerak");
  }

  const keys = spec.variables.map((v) => v.key);
  const dup = keys.find((k, i) => keys.indexOf(k) !== i);
  if (dup) throw new CellRangeError(`«${dup}» o'zgaruvchisi ikki marta e'lon qilingan`);

  const used = new Set<string>();
  for (const m of spec.template.matchAll(PLACEHOLDER)) {
    // 1-guruh regexda doim ishtirok etadi; tekshiruv faqat noUncheckedIndexedAccess uchun.
    const k = m[1];
    if (k !== undefined) used.add(k);
  }

  for (const u of used) {
    if (!keys.includes(u)) throw new CellRangeError(`«${u}» uchun diapazon berilmagan`);
  }
  for (const k of keys) {
    if (!used.has(k)) throw new CellRangeError(`«${k}» o'zgaruvchisi shablonda ishlatilmagan`);
  }
  if (spec.zoneFrom !== null && !keys.includes(spec.zoneFrom)) {
    throw new CellRangeError(`Zona uchun «${spec.zoneFrom}» o'zgaruvchisi topilmadi`);
  }

  // AVVAL sanaymiz (validatsiya + arifmetika, massivsiz), KEYIN quramiz —
  // aks holda chegaradan oshib ketgan diapazon tekshiruvga yetguncha xotirani yeydi.
  const counts = spec.variables.map(countOf);
  let total = 1;
  for (const c of counts) total *= c;
  if (total > CELL_RANGE_MAX) {
    throw new CellRangeError(`${total} ta yacheyka chiqadi, chegara ${CELL_RANGE_MAX}`);
  }

  // Endi xavfsiz: `total` <= CELL_RANGE_MAX, ya'ni har massiv ham shu chegara ichida.
  const lists = spec.variables.map((v) => ({ key: v.key, values: valuesOf(v) }));

  const out: ExpandedCell[] = [];
  for (let i = 0; i < total; i++) {
    let rem = i;
    const picked: Record<string, string> = {};
    // Oxirgi o'zgaruvchi eng tez ⇒ birinchisi eng sekin.
    for (let v = lists.length - 1; v >= 0; v--) {
      const list = lists[v];
      if (list === undefined) continue;
      // `rem % length` doim diapazon ichida — `?? ''` faqat tip uchun.
      picked[list.key] = list.values[rem % list.values.length] ?? '';
      rem = Math.floor(rem / list.values.length);
    }
    // Har placeholder yuqorida validatsiyadan o'tgan ⇒ `picked[k]` doim mavjud.
    const name = spec.template.replace(PLACEHOLDER, (_, k: string) => picked[k] ?? '');
    if (name.length > MAX_NAME_LEN) {
      throw new CellRangeError(`Nom ${MAX_NAME_LEN} belgidan uzun: «${name.slice(0, 40)}…»`);
    }
    out.push({ name, zoneName: spec.zoneFrom ? (picked[spec.zoneFrom] ?? null) : null });
  }

  // Takroriy nom — jimgina dedup QILINMAYDI, ataylab XATO tashlanadi.
  //
  // Ajratuvchisiz shablon to'qnashuv beradi: `{a}{b}` da a=1,b=11 va a=11,b=1
  // ikkalasi ham «111» chiqaradi. Agar jim dedup qilsak, foydalanuvchi 144 ta
  // yacheyka so'rab 142 tasini olardi va NEGA ekanini bilmasdi — dryRun ko'rsatgan
  // son haqiqiy `created` dan farq qilib ketardi (bu dizaynning kalit xossasi).
  // Xato esa uni to'g'ri yechimga yo'naltiradi: `{a}-{b}` deb ajratuvchi qo'yish.
  const seen = new Set<string>();
  for (const cell of out) {
    if (seen.has(cell.name)) {
      throw new CellRangeError(
        `Shablon takroriy nom beradi («${cell.name}»). O'zgaruvchilar orasiga ajratuvchi qo'shing, masalan «{a}-{b}».`,
      );
    }
    seen.add(cell.name);
  }

  return out;
}

// ───────────────────────────────────────────────────────────────────────────
// Yangi omborni raqamlashtirish (F3, reja 2026-08-23)
// ───────────────────────────────────────────────────────────────────────────

/** Bitta stelaj retsepti: nechta qavat va har qavatda nechta o'rin. */
export interface WarehouseStelajSpec {
  qavatlar: number;
  orinlar: number;
}

export interface WarehouseNumberingSpec {
  /** Ombor raqami, 1–2 xonali («3» ham qabul qilinadi → «03»). */
  warehouseNo: string;
  /** Stelajlar tartib bilan: 1-element = stelaj 01, 2-element = stelaj 02 … */
  stelajlar: WarehouseStelajSpec[];
}

/**
 * Kod segmentlari 2 xonali (`NN-SS-QQ-OO`), shuning uchun har o'lcham 99 dan
 * oshmaydi — kattaroq qiymat kod semantikasini buzardi (uch xonali segment).
 */
const MAX_SEGMENT = 99;

/**
 * Ombor retseptini `NN-SS-QQ-OO` yacheykalarga yoyadi; zona = stelaj, nomi
 * `NN-SS` (masalan «03-01»).
 *
 * Zona nomi ATAYLAB `SS` emas: yacheykalar hozircha yagona umumiy Store ichida
 * yaratiladi (F5 split'igacha) va yalang'och «01» u yerdagi eski, chalkash
 * zonalarga yopishib ketardi. F4/F5 zonalarni baribir kodning 2-segmentidan
 * qayta chiqaradi, shuning uchun bu nom vaqtinchalik va zararsiz.
 *
 * Yoyish `expandCellRange` orqali — nomlash (pad, tartib) mavjud diapazon
 * generatori bilan AYNAN bir xil bo'lishi kafolatlanadi.
 */
export function expandWarehouseNumbering(spec: WarehouseNumberingSpec): ExpandedCell[] {
  const rawNo = spec.warehouseNo.trim();
  if (!/^\d{1,2}$/.test(rawNo)) {
    throw new CellRangeError("Ombor raqami 1–2 xonali son bo'lishi kerak (masalan 03)");
  }
  const no = Number(rawNo);
  if (no < 1) throw new CellRangeError('Ombor raqami 01 dan boshlanadi');

  if (spec.stelajlar.length === 0) throw new CellRangeError('Kamida bitta stelaj kerak');
  if (spec.stelajlar.length > MAX_SEGMENT) {
    throw new CellRangeError(`Stelajlar soni ${MAX_SEGMENT} dan oshmaydi (kod 2 xonali)`);
  }

  // AVVAL arifmetik sanaymiz (massivsiz) — expandCellRange'dagi bilan bir xil
  // sabab: chegaradan oshgan retsept xotira yemasdan rad etilsin.
  let total = 0;
  for (const [i, s] of spec.stelajlar.entries()) {
    const label = `${i + 1}-stelaj`;
    if (!Number.isInteger(s.qavatlar) || s.qavatlar < 1 || s.qavatlar > MAX_SEGMENT) {
      throw new CellRangeError(`${label}: qavatlar soni 1–${MAX_SEGMENT} oralig'ida bo'lsin`);
    }
    if (!Number.isInteger(s.orinlar) || s.orinlar < 1 || s.orinlar > MAX_SEGMENT) {
      throw new CellRangeError(`${label}: o'rinlar soni 1–${MAX_SEGMENT} oralig'ida bo'lsin`);
    }
    total += s.qavatlar * s.orinlar;
  }
  if (total > CELL_RANGE_MAX) {
    throw new CellRangeError(`${total} ta yacheyka chiqadi, chegara ${CELL_RANGE_MAX}`);
  }

  const nn = String(no).padStart(2, '0');
  const out: ExpandedCell[] = [];
  for (const [i, s] of spec.stelajlar.entries()) {
    const ss = String(i + 1).padStart(2, '0');
    const zoneName = `${nn}-${ss}`;
    const cells = expandCellRange({
      template: '{ombor}-{stelaj}-{qavat}-{orin}',
      variables: [
        { key: 'ombor', kind: 'number', from: no, to: no, pad: 2 },
        { key: 'stelaj', kind: 'number', from: i + 1, to: i + 1, pad: 2 },
        { key: 'qavat', kind: 'number', from: 1, to: s.qavatlar, pad: 2 },
        { key: 'orin', kind: 'number', from: 1, to: s.orinlar, pad: 2 },
      ],
      zoneFrom: null,
    });
    for (const c of cells) out.push({ name: c.name, zoneName });
  }
  return out;
}
