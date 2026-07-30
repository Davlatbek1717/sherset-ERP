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

/** Bitta o'zgaruvchining barcha qiymatlari, tartib bo'yicha. */
function valuesOf(v: CellRangeVariable): string[] {
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
    const out: string[] = [];
    for (let i = v.from; i <= v.to; i++) out.push(String(i).padStart(pad, '0'));
    return out;
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
  const out: string[] = [];
  for (let c = f; c <= t; c++) out.push(String.fromCharCode(c));
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

  const lists = spec.variables.map((v) => ({ key: v.key, values: valuesOf(v) }));
  let total = 1;
  for (const l of lists) total *= l.values.length;
  if (total > CELL_RANGE_MAX) {
    throw new CellRangeError(`${total} ta yacheyka chiqadi, chegara ${CELL_RANGE_MAX}`);
  }

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
  return out;
}
