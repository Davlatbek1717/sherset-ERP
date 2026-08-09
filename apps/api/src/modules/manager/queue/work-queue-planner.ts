/**
 * MK06 / 4M TZ §5.1 — NAVBAT DVIGATELINING YADROSI. Sof modul (Prisma'siz).
 *
 * Dvigatel qayta-qayta ishga tushiriladi (menejer «yangilash» bosadi, keyin
 * cron). Shuning uchun uning yagona vazifasi — **nima o'zgardi** ni aniqlash:
 *   1. qaysi nomzod HALI navbatda yo'q (dedup);
 *   2. qaysi mavjud element juda uzoq tegilmay qolgan (eskirish belgisi).
 *
 * ## 🔴 Dvigatel element O'CHIRMAYDI
 * `QueueSyncPlan` da o'chirish maydoni YO'Q va bo'lmaydi (§5.1). Eskirgan
 * element yo'qolsa, «hech kim ko'rmagani» ham u bilan birga yo'qolardi —
 * navbat esa aynan shuni ko'rsatish uchun bor. Belgi qo'yiladi, qator qoladi.
 *
 * ## Yopilgan element QAYTA TUG'ILMAYDI
 * Dedup mavjud elementning HOLATIGA qaramaydi. Menejer «ko'rdim» deb yopgan
 * hodisa ertangi `sync` da qaytib kelsa, navbat hech qachon bo'shamas va §5.3
 * sabab statistikasi bir hodisani o'nlab marta sanardi. (Shu naqsh
 * loop-until-dry halqalarida ham qoida: dedup KO'RILGANLAR bo'yicha, ochiqlar
 * bo'yicha emas.)
 */

import {
  SEVERITY_ORDER,
  type WorkItemCandidate,
  type WorkItemSeverity,
} from './work-item-rules.js';

/**
 * §5.1: «3 kundan ortiq ko'rilmagan yuqoriga chiqadi». TZ'dagi yagona raqam —
 * o'ylab topilmagan.
 */
export const DEFAULT_STALE_AFTER_DAYS = 3;

const DAY_MS = 86_400_000;

/** Ombordagi element — planner uchun kerak bo'lgan minimal qism. */
export interface ExistingWorkItem {
  id: string;
  dedupKey: string;
  status: string;
  /** Belgi allaqachon qo'yilganmi (takror belgilamaslik uchun). */
  staleAt: Date | null;
  /** Element JORIY holatiga qachon kirgani — eskirish shundan sanaladi. */
  statusChangedAt: Date;
}

export interface QueueSyncOptions {
  now: Date;
  staleAfterDays?: number;
}

/**
 * 🔴 Bu tipda o'chirish maydoni YO'Q — qulf testda ham takrorlangan
 * (`/delete|remove|purge|drop/` kalitlari bo'lmasligi tekshiriladi).
 */
export interface QueueSyncPlan {
  /** Navbatga qo'shiladigan yangi nomzodlar. */
  creates: WorkItemCandidate[];
  /** Eskirish BELGISI qo'yiladigan mavjud elementlar. */
  markStaleIds: string[];
  /** Dedup tufayli tashlangan nomzodlar soni — `sync` javobida ko'rinadi. */
  duplicates: number;
}

/**
 * Yopilgan holatlar. Bularda «e'tibordan qoldi» tushunchasi yo'q: ish tugagan.
 */
const CLOSED_STATUSES = new Set(['resolved', 'dismissed', 'escalated']);

export function planQueueSync(
  candidates: ReadonlyArray<WorkItemCandidate>,
  existing: ReadonlyArray<ExistingWorkItem>,
  options: QueueSyncOptions,
): QueueSyncPlan {
  const staleAfterDays = options.staleAfterDays ?? DEFAULT_STALE_AFTER_DAYS;

  // Mavjud kalitlar — HOLATIDAN qat'i nazar (yuqoridagi izoh).
  const known = new Set(existing.map((item) => item.dedupKey));

  const creates: WorkItemCandidate[] = [];
  let duplicates = 0;

  for (const candidate of candidates) {
    if (known.has(candidate.dedupKey)) {
      duplicates += 1;
      continue;
    }
    // Bir yugurish ichidagi takrorni ham shu to'plam tutadi.
    known.add(candidate.dedupKey);
    creates.push(candidate);
  }

  const staleBefore = options.now.getTime() - staleAfterDays * DAY_MS;
  const markStaleIds: string[] = [];

  for (const item of existing) {
    if (item.staleAt) continue; // idempotent
    if (CLOSED_STATUSES.has(item.status)) continue;
    // Qat'iy `<`: aynan chegaradagi element hali eskirmagan.
    if (item.statusChangedAt.getTime() < staleBefore) markStaleIds.push(item.id);
  }

  return { creates, markStaleIds, duplicates };
}

// ── Navbat tartibi ──────────────────────────────────────────────────────────

export interface SortableWorkItem {
  staleAt: Date | null;
  severity: WorkItemSeverity;
  occurredAt: Date;
}

/**
 * §5.1 tartibi: **eskirgani eng tepada** («3 kundan ortiq ko'rilmagan yuqoriga
 * chiqadi»), keyin jiddiyligi, keyin eng yangisi.
 *
 * Nega eskirish jiddiylikdan ustun: navbatning maqsadi «hech narsa e'tibordan
 * qolmasin». Kichik-u unutilgan element katta-yu bugungisidan muhimroq —
 * bugungisini menejer baribir ko'radi.
 *
 * Kirish massivi o'zgartirilmaydi (`toSorted` hali maqsad muhitda yo'q).
 */
export function sortQueue<T extends SortableWorkItem>(items: ReadonlyArray<T>): T[] {
  return [...items].sort((a, b) => {
    const staleDiff = Number(b.staleAt != null) - Number(a.staleAt != null);
    if (staleDiff !== 0) return staleDiff;

    const severityDiff = SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity];
    if (severityDiff !== 0) return severityDiff;

    return b.occurredAt.getTime() - a.occurredAt.getTime();
  });
}
