/**
 * QORALAMA (hold order) — savatni keyinroqqa qoldirib turish (2026-08-16, egasi).
 *
 * Kassir bitta mijozning savatini «qoralama»ga olib, ikkinchi mijozga xizmat
 * ko'rsatadi; keyin chipni bosib savatni qaytaradi. Qoralamalar `localStorage`
 * da turadi — sahifa yangilansa/qayta kirilsa yo'qolmaydi. Bu FAQAT ekran
 * holati: serverga hech narsa yozilmaydi (chek `post` bo'lgunicha hujjat yo'q).
 *
 * 🔴 Nega replacer/reviver, maydonma-maydon o'girish emas: savat qatori
 * `bigint` tashiydi va `JSON.stringify` bigint ustida OTADI. Maydon ro'yxatini
 * qo'lda yozsak, `CartLine` ga yangi bigint maydon qo'shilganda bu qatlam jim
 * (yoki baland ovozda, park paytida) buzilardi. Replacer har qanday bigint'ni
 * `{ $bigint: "…" }` ga o'giradi — kelajak maydonlar avtomatik qamrab olinadi
 * (`cart-drafts.test.ts` da qulflangan).
 */

/** Savat qatorining qoralamada saqlanadigan shakli — `CartLine` bilan strukturaviy mos. */
export interface CartDraftLine {
  productId: string;
  productName: string;
  quantity: string;
  priceMinor: bigint;
  priceStr: string;
  availableStock?: number;
  costMinor: bigint | null;
  wholesaleMinor: bigint | null;
  basePriceMinor: bigint | null;
}

export interface CartDraft<L extends CartDraftLine = CartDraftLine> {
  id: string;
  /** Epoch ms — chipda ko'rinadigan vaqt shu yerdan. */
  createdAt: number;
  discountPct: number;
  lines: L[];
}

export const CART_DRAFTS_STORAGE_KEY = 'sherset.pos.drafts';

const BIGINT_TAG = '$bigint';

export function serializeCartDrafts(drafts: readonly CartDraft[]): string {
  return JSON.stringify(drafts, (_k, v) =>
    typeof v === 'bigint' ? { [BIGINT_TAG]: v.toString() } : v,
  );
}

function isDraftLine(v: unknown): v is CartDraftLine {
  if (typeof v !== 'object' || v === null) return false;
  const l = v as Record<string, unknown>;
  return (
    typeof l.productId === 'string' &&
    typeof l.productName === 'string' &&
    typeof l.quantity === 'string' &&
    typeof l.priceMinor === 'bigint'
  );
}

function isDraft(v: unknown): v is CartDraft {
  if (typeof v !== 'object' || v === null) return false;
  const d = v as Record<string, unknown>;
  return (
    typeof d.id === 'string' &&
    typeof d.createdAt === 'number' &&
    typeof d.discountPct === 'number' &&
    Array.isArray(d.lines) &&
    d.lines.every(isDraftLine)
  );
}

/**
 * FAIL-SAFE parse: buzuq/eski/begona JSON hech qachon otmaydi — noto'g'ri
 * shakldagi elementlar tashlanadi, qolganlari qaytadi. POS sahifasi
 * localStorage tarkibiga ishonib OQ EKRANGA tushmasligi shart.
 */
export function parseCartDrafts(raw: string | null): CartDraft[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw, (_k, v) => {
      if (typeof v === 'object' && v !== null) {
        const tagged = (v as Record<string, unknown>)[BIGINT_TAG];
        if (typeof tagged === 'string') return BigInt(tagged);
      }
      return v;
    });
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isDraft);
  } catch {
    return [];
  }
}

/** Qoralama identifikatori — UUID bo'lsa UUID, bo'lmasa vaqt+tasodif. */
export function newDraftId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
