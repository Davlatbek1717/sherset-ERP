/**
 * G2 — KONTROL OQIMI QAROR MODULI (sof, I/O yo'q).
 *
 * Egasining qoidasi (2026-08-23): katta omborchi kontrolda SKANERLAMAYDI —
 * yig'ilgan chekni KO'Z bilan tekshirib «To'liq» deydi, kerak bo'lsa tarkibni
 * TAHRIRLAYDI va bu kassirga darhol ko'rinadi.
 *
 * Nega alohida fayl (edit-plan naqshi): navbatga tushish sharti va tahrir
 * qarori servis ichida qolsa hech qachon testda qulflanmaydi. I/O servisda,
 * QAROR shu yerda.
 */

import { computePositionTotal } from '@moysklad/money';
import { formatQty, parseQty } from './retail-sale-edit-plan.js';

// ─── Kontrol navbati ────────────────────────────────────────────────────────

/** RestockTask'ning «yopiq» holatlari — yangi holat qo'shilsa shu yerga. */
const CLOSED_TASK_STATUSES = ['done', 'cancelled'] as const;

/**
 * Chek kontrol navbatiga tushdimi: KAMIDA bitta yig'ish topshirig'i bor va
 * HAMMASI yopilgan.
 *
 * «Kamida bitta» sharti ataylab: `send-to-picking` topshiriqlarni tranzaksiya
 * TASHQARISIDA (best-effort) ochadi, ya'ni flip bilan topshiriq orasida qisqa
 * oyna bor. 0 topshiriqli chek navbatga tushsa, kontrol omborchi hali YIG'MAGAN
 * chekni «To'liq» deb yuborishi mumkin edi. Topshiriqsiz qolgan chek (masalan
 * omborchi sozlanmagan akkaunt) kassirning o'z «tayyor» tugmasi orqali yopiladi
 * (egasi 2026-08-11 yo'li) — u kontrolga muhtoj emas.
 */
export function isControlReady(tasks: ReadonlyArray<{ status: string }>): boolean {
  return (
    tasks.length > 0 &&
    tasks.every((t) => (CLOSED_TASK_STATUSES as readonly string[]).includes(t.status))
  );
}

// ─── Kontrol tahriri ────────────────────────────────────────────────────────

/** Chekning tahrirdan OLDINGI qatori (servis DB'dan o'qib beradi). */
export interface ControlPositionBefore {
  id: string;
  productId: string | null;
  productName: string | null;
  /** Decimal satr (masalan «2» yoki «2.5»). */
  quantity: string;
  priceMinor: bigint;
  /** Decimal satr (foiz, masalan «0» yoki «10»). */
  discount: string;
  sumMinor: bigint;
}

/** Kontrolchi yuborgan qator: qolsin va soni shu bo'lsin. Ro'yxatda yo'q
 *  qator — O'CHIRILADI. */
export interface ControlEditLineInput {
  id: string;
  quantity: string;
}

export interface ControlKeep {
  id: string;
  productId: string | null;
  productName: string | null;
  oldQuantity: string;
  quantity: string;
  sumMinor: bigint;
  changed: boolean;
}

export interface ControlEditPlan {
  /** Bo'sh bo'lmasa tahrir QABUL QILINMAYDI va sabablari shu yerda. */
  refusals: string[];
  keeps: ControlKeep[];
  removed: ControlPositionBefore[];
  /**
   * Rezervdan BO'SHATILADIGAN miqdor (mahsulot kesimida, musbat satr).
   * Kontrol faqat KAMAYTIRADI, shuning uchun rezervga qo'shish yo'q.
   */
  releaseByProduct: Array<{ productId: string; qty: string }>;
  newSumMinor: bigint;
  /** Hech narsa o'zgarmagan — servis yozuvsiz qaytadi. */
  noop: boolean;
}

/**
 * Kontrol tahriri rejasi. HECH QACHON throw qilmaydi — rad sabablari
 * `refusals` da (ular foydalanuvchiga ko'rsatiladigan xabar).
 *
 * 🔴 FAQAT KAMAYTIRISH. Kontrol «yig'ilgan tarkibni haqiqatga moslaydi»:
 * javonda yetmagan tovar chekdan chiqadi yoki kamayadi. KO'PAYTIRISH esa
 * omborchi YIG'MAGAN (va rezerv QILINMAGAN) tovarni chekka qo'shish bo'lardi —
 * bunga yangi yig'ish davri kerak, kontrol tugmasi emas.
 */
export function planControlEdit(
  before: ReadonlyArray<ControlPositionBefore>,
  after: ReadonlyArray<ControlEditLineInput>,
): ControlEditPlan {
  const refusals: string[] = [];
  const byId = new Map(before.map((p) => [p.id, p]));

  const seen = new Set<string>();
  for (const line of after) {
    if (seen.has(line.id)) refusals.push(`Qator ikki marta yuborildi: ${line.id}`);
    seen.add(line.id);
    if (!byId.has(line.id)) refusals.push(`Chekda bunday qator yo'q: ${line.id}`);
  }

  if (after.length === 0) {
    refusals.push("Chekda kamida bitta tovar qolishi kerak — bo'sh chek uchun bekor qilish bor");
  }

  const keeps: ControlKeep[] = [];
  for (const line of after) {
    const old = byId.get(line.id);
    if (!old) continue;
    const newQty = parseQty(line.quantity);
    const oldQty = parseQty(old.quantity) ?? 0n;
    const label = old.productName ?? old.productId ?? line.id;
    if (newQty === null) {
      refusals.push(`Noto'g'ri miqdor: «${line.quantity}» (${label})`);
      continue;
    }
    if (newQty === 0n) {
      refusals.push(`Miqdor 0 bo'lishi mumkin emas — qatorni o'chiring (${label})`);
      continue;
    }
    if (newQty > oldQty) {
      refusals.push(
        `«${label}»: ${line.quantity} > ${old.quantity} — kontrol miqdorni OSHIRA olmaydi ` +
          `(yig'ilmagan tovar chekka qo'shilmaydi; kerak bo'lsa kassir yangi chek ochadi)`,
      );
      continue;
    }
    const changed = newQty !== oldQty;
    // Qator summasi AYNAN `computePositions` arifmetikasi bilan qayta
    // hisoblanadi (bir xil primitiv) — narx/chegirma o'zgarmaydi.
    const sumMinor = changed
      ? computePositionTotal(
          {
            quantity: line.quantity,
            priceMinor: old.priceMinor.toString(),
            discount: old.discount || '0',
            vat: null,
          },
          false,
          false,
        ).totalMinor
      : old.sumMinor;
    keeps.push({
      id: old.id,
      productId: old.productId,
      productName: old.productName,
      oldQuantity: old.quantity,
      quantity: line.quantity,
      sumMinor,
      changed,
    });
  }

  const keptIds = new Set(after.map((l) => l.id));
  const removed = before.filter((p) => !keptIds.has(p.id));

  // Rezerv-bo'shatish: kamaygan miqdorlar mahsulot kesimida yig'iladi
  // (o'chirilgan qator = to'liq miqdori bo'shaydi).
  const releaseMap = new Map<string, bigint>();
  const addRelease = (productId: string | null, delta: bigint) => {
    if (!productId || delta <= 0n) return;
    releaseMap.set(productId, (releaseMap.get(productId) ?? 0n) + delta);
  };
  for (const k of keeps) {
    if (!k.changed) continue;
    addRelease(k.productId, (parseQty(k.oldQuantity) ?? 0n) - (parseQty(k.quantity) ?? 0n));
  }
  for (const r of removed) {
    addRelease(r.productId, parseQty(r.quantity) ?? 0n);
  }

  const newSumMinor = keeps.reduce((s, k) => s + k.sumMinor, 0n);
  const noop = refusals.length === 0 && removed.length === 0 && keeps.every((k) => !k.changed);

  return {
    refusals,
    keeps: refusals.length > 0 ? [] : keeps,
    removed: refusals.length > 0 ? [] : removed,
    releaseByProduct:
      refusals.length > 0
        ? []
        : [...releaseMap.entries()].map(([productId, qty]) => ({
            productId,
            qty: formatQty(qty),
          })),
    newSumMinor,
    noop,
  };
}

/**
 * Kassirga boradigan `sale_edited` bildirishnoma matni. Qisqa, lekin QAYSI
 * qatorlar o'zgarganini aytadi — POS toast'ida kassir nimani qayta tekshirishni
 * darhol ko'radi (reja G2.3: «o'zgargan qatorlarni ko'rsatadi»).
 */
export function controlEditNotificationBody(plan: ControlEditPlan): string {
  const parts: string[] = [];
  for (const r of plan.removed) {
    parts.push(`− ${r.productName ?? r.productId ?? r.id}`);
  }
  for (const k of plan.keeps) {
    if (k.changed) {
      parts.push(`${k.productName ?? k.productId ?? k.id}: ${k.oldQuantity} → ${k.quantity}`);
    }
  }
  const MAX = 4;
  const head = parts.slice(0, MAX).join('; ');
  const tail = parts.length > MAX ? ` va yana ${parts.length - MAX} ta` : '';
  return `${head}${tail}`;
}
