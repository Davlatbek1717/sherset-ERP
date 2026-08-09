/**
 * MK38 / 4-bo'lim TZ §6 «Mijoz taqsimoti» — egalik tarixi va havza manzarasi.
 * Sof modul (Prisma yo'q, soat yo'q).
 *
 * ## Tarix uchun YANGI jadval ochilmaydi
 * `audit_log` da `Counterparty` yozuvlari allaqachon bor va ular
 * `{ ustun: {before, after} }` shaklida saqlanadi. 2-bo'lim TZ §9 dagi
 * `SalesActivityLog` ham xuddi shu hodisalarni sanaydi — u qurilganda ham bu
 * modul o'sha manbadan o'qishi kerak, IKKINCHI ombor emas
 * ([[decision-journal-view-over-events]] — jurnal = hodisalar ustidagi
 * ko'rinish).
 *
 * ## Faqat EGALIK o'zgarishi
 * Xom auditda telefon, nom, guruh — hammasi bor. Ularni ham ko'rsatish
 * «mijoz qo'ldan qo'lga o'tgan» degan yolg'on taassurot berardi.
 */

export interface AuditRowLite {
  id: string;
  /** `audit_log.user_id` — tizim yozgan bo'lsa NULL bo'lishi mumkin. */
  userId: string | null;
  action: string;
  /** `audit_log.at` — ustun nomi aynan shunday (`createdAt` EMAS). */
  at: Date;
  /** Prisma `Json` — ishonchsiz shakl, shuning uchun qo'riqlab o'qiladi. */
  fieldChanges: unknown;
}

export interface OwnerChangeEvent {
  id: string;
  at: Date;
  /** O'zgartirgan foydalanuvchi. NULL = tizim yozgan. */
  actorId: string | null;
  fromOwnerId: string | null;
  toOwnerId: string | null;
}

/** `{before, after}` juftligini qo'riqlab o'qiydi — buzuq shakl `null` beradi. */
function readChange(value: unknown): { before: unknown; after: unknown } | null {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return null;
  const rec = value as Record<string, unknown>;
  if (!('before' in rec) || !('after' in rec)) return null;
  return { before: rec.before, after: rec.after };
}

function asOwnerId(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

/**
 * Xom audit qatorlaridan FAQAT egalik o'zgarishlari, eng yangisi tepada.
 *
 * Buzuq yoki kutilmagan shakldagi yozuv jimgina o'tkazib yuboriladi: jurnal
 * o'qishi hech qachon 500 bermasligi kerak — u kuzatuv sirti, biznes amali
 * emas.
 */
export function ownerChangeEvents(rows: readonly AuditRowLite[]): OwnerChangeEvent[] {
  const out: OwnerChangeEvent[] = [];
  for (const row of rows) {
    if (row.fieldChanges == null || typeof row.fieldChanges !== 'object') continue;
    const changes = row.fieldChanges as Record<string, unknown>;
    const change = readChange(changes.ownerId);
    if (!change) continue;

    const fromOwnerId = asOwnerId(change.before);
    const toOwnerId = asOwnerId(change.after);
    // Bir xil qiymat — o'zgarish emas (diff buni yozmasligi kerak, lekin
    // tarixiy yozuvlar ishonchsiz).
    if (fromOwnerId === toOwnerId) continue;

    out.push({ id: row.id, at: row.at, actorId: row.userId, fromOwnerId, toOwnerId });
  }
  return out.sort((a, b) => b.at.getTime() - a.at.getTime());
}

export interface DistributionSummary {
  total: number;
  /** Egasi YO'Q mijozlar — «erkin havza». */
  unassigned: number;
  /** Xodim → biriktirilgan mijozlar soni. Egasizlar bu yerda YO'Q. */
  byOwner: Map<string, number>;
}

export function distributionSummary(
  rows: ReadonlyArray<{ ownerId: string | null }>,
): DistributionSummary {
  const byOwner = new Map<string, number>();
  let unassigned = 0;
  for (const row of rows) {
    if (row.ownerId == null) {
      unassigned += 1;
      continue;
    }
    byOwner.set(row.ownerId, (byOwner.get(row.ownerId) ?? 0) + 1);
  }
  return { total: rows.length, unassigned, byOwner };
}
