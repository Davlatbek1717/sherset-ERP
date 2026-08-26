/**
 * K5 — bo'lak TARKIBINI kiritish (sanash · priyomka · vozvrat).
 *
 * Bu server yadrosining (`apps/api/src/modules/stock-piece/piece-intake-core.ts`)
 * KLIENT tomondagi ko'zgusi. Ikkinchi nusxa ATAYLAB: ekran omborchiga
 * yozayotgan zahoti «jami: 1220 m» deb ko'rsatishi va sanoq maydonini O'ZI
 * to'ldirishi kerak — har harfda serverga so'rov yuborish qulay ham emas,
 * ishonchli ham emas (aloqasiz omborda ekran o'lik bo'lib qolardi).
 *
 * 🔴 Ikki nusxa jimgina ajralib ketmasligi uchun **sinxronlik testi** bor:
 * `apps/web/src/lib/__tests__/piece-entry.test.ts` va server yadrosining
 * testi AYNI misollar ustida AYNI natijani qulflaydi (repodagi mavjud naqsh —
 * `warehouse-state-core` ↔ `retail-stock-cascade` takrori bilan bir sabab).
 *
 * Bu yerda YOZISH mantiqi YO'Q: klient faqat o'qiydi va yig'indini sanaydi.
 * Reyestrga nima yozilishini SERVER hal qiladi (`planRecount` va boshqalar).
 */

/** Yorliqsiz yangi bo'lak belgisi: `?:150`. */
export const NEW_PIECE_MARK = '?';

const GROUP_SEPARATOR = '+';
const COUNT_SEPARATOR = /[x×*]/i;
const SCALE = 1_000_000n;

export interface PieceEntryGroup {
  kind: 'whole' | 'piece';
  /** `Decimal(20,6)` satri. */
  length: string;
  /** Butun rulonlar soni (bo'lakda doim 1). */
  count: number;
  /** Bo'lak yorlig'i (`BLK-…`) yoki `null` — yangi. `whole` da doim `null`. */
  label: string | null;
}

export interface PieceEntryParse {
  groups: PieceEntryGroup[];
  /** Σ uzunlik — sanoq maydoniga shu yoziladi. */
  total: string;
  /** Jismoniy bo'laklar soni (butun rulonlar ham sanaladi). */
  pieceCount: number;
  /** Xato bo'lgan guruh raqami (1 dan). `null` — hammasi joyida. */
  badGroup: number | null;
}

/** `«250,5»` → `'250.5'`; yaroqsiz bo'lsa `null`. Server bilan AYNI qoida. */
function normalizeLength(raw: string): string | null {
  const t = raw.trim().replace(',', '.').replace(/\s+/g, '');
  if (!t || !/^\d+(\.\d{1,6})?$/.test(t)) return null;
  const [int = '0', frac = ''] = t.split('.');
  const i = int.replace(/^0+(?=\d)/, '');
  if (i.length > 14) return null;
  const f = frac.replace(/0+$/, '');
  return f ? `${i}.${f}` : i;
}

function toMicro(v: string): bigint {
  const [int = '0', frac = ''] = v.split('.');
  return BigInt(int) * SCALE + BigInt(frac.padEnd(6, '0').slice(0, 6));
}

function fromMicro(v: bigint): string {
  const int = v / SCALE;
  const frac = (v % SCALE).toString().padStart(6, '0').replace(/0+$/, '');
  return frac ? `${int}.${frac}` : String(int);
}

/** Yorliq `BLK-` makonidami (server `isPieceLabel` bilan AYNI regex). */
export function isPieceLabel(code: string): boolean {
  return /^BLK-\d{6,}$/.test(code.trim().toUpperCase());
}

/**
 * `«250x3+BLK-000041:200+?:150»` → guruhlar + yig'indi.
 *
 * Xato guruh JIMGINA tashlanmaydi — `badGroup` bilan qaytadi va ekran uni
 * qizil qilib ko'rsatadi. Sabab serverdagi bilan bir xil: Σ sanoq miqdoriga
 * TENG bo'lishi shart, ya'ni tushib qolgan guruh jimgina noto'g'ri qoldiqqa
 * olib borardi.
 */
export function parsePieceEntry(raw: string): PieceEntryParse {
  const groups: PieceEntryGroup[] = [];
  let micro = 0n;
  let pieceCount = 0;
  let badGroup: number | null = null;

  const parts = raw
    .split(GROUP_SEPARATOR)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  for (const [i, part] of parts.entries()) {
    if (part.includes(':')) {
      const sep = part.indexOf(':');
      const labelRaw = part.slice(0, sep).trim();
      const length = normalizeLength(part.slice(sep + 1));
      const label = labelRaw === NEW_PIECE_MARK || labelRaw === '' ? null : labelRaw.toUpperCase();
      if (length === null || (label !== null && !isPieceLabel(label))) {
        badGroup ??= i + 1;
        continue;
      }
      groups.push({ kind: 'piece', length, count: 1, label });
      micro += toMicro(length);
      pieceCount += 1;
      continue;
    }

    const [lengthRaw = '', countRaw] = part.split(COUNT_SEPARATOR).map((s) => s.trim());
    const length = normalizeLength(lengthRaw);
    const count = countRaw === undefined ? 1 : Number(countRaw);
    if (length === null || !Number.isInteger(count) || count < 1 || count > 200) {
      badGroup ??= i + 1;
      continue;
    }
    groups.push({ kind: 'whole', length, count, label: null });
    micro += toMicro(length) * BigInt(count);
    pieceCount += count;
  }

  return { groups, total: fromMicro(micro), pieceCount, badGroup };
}

/** Reyestrdagi FAOL bo'laklardan kanonik kiritish matni (ekran «hozirgi holat»). */
export function buildEntryFromRegistry(
  pieces: ReadonlyArray<{ length: string; whole: boolean; label: string | null }>,
): string {
  const whole = new Map<string, number>();
  const parts: string[] = [];
  for (const p of pieces) {
    if (p.whole) whole.set(p.length, (whole.get(p.length) ?? 0) + 1);
  }
  for (const [length, count] of [...whole.entries()].sort((a, b) => Number(b[0]) - Number(a[0]))) {
    parts.push(count > 1 ? `${length}x${count}` : length);
  }
  for (const p of pieces) {
    if (!p.whole) parts.push(`${p.label ?? NEW_PIECE_MARK}:${p.length}`);
  }
  return parts.join(GROUP_SEPARATOR);
}

/** Σ tarkib sanoq miqdoriga tengmi (server `matchQuantity` bilan AYNI). */
export function entryMatchesQuantity(total: string, quantity: string): boolean {
  const q = normalizeLength(quantity);
  return q !== null && toMicro(total) === toMicro(q);
}
