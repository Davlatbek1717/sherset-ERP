/**
 * RetailSale FSM — yagona o'tish jadvali (TZ 1-bo'lim §4).
 *
 * ```
 *                  send-to-picking            mark-ready              post
 *   [draft] ─────────────────────► [picking] ──────────► [ready] ─────────────► [posted]
 *      │                               │                    │                      │
 *      │ cancel                        │ cancel             │ cancel               │ refund
 *      ▼                               ▼                    ▼                      ▼
 *  [cancelled]                    [cancelled]          [cancelled]            [refunded]
 * ```
 *
 * Nega alohida modul: `post`/`cancel` ruxsat etilgan holatlar SERVISDA ikki
 * joyda ishlatiladi — oldindan tekshiruv (`BadRequest`) va tranzaksiya ichidagi
 * CAS qo'riqchisi (`updateMany WHERE state IN (...)` → `count = 0` bo'lsa 409).
 * Ular ajralib qolsa qo'riqchi yo tor (haqiqiy o'tishni bloklaydi) yo keng
 * (poyga o'tib ketadi) bo'ladi. Bitta manba shu farqni ildizdan yopadi va
 * mocksiz test qilinadi (`compute-positions` / `retail-payment` naqshi).
 *
 * 2026-08-02 da to'ldirildi: `picking`/`ready` enum'ga qo'shilgan edi
 * (`f6cc310`, To'lqin 0.1) — POS ro'yxatlari to'ldi, LEKIN `post()` hamon faqat
 * `draft` ni qabul qilardi va `cancel()` ham. Ya'ni omborchi yig'ib «tayyor»
 * bosgach kassirning to'lov tugmasi 400 qaytarardi va yig'ilayotgan chekni
 * bekor qilib ham bo'lmasdi — zanjir boshi ochilgan, oxiri berk edi.
 */

export type RetailSaleTransition = 'post' | 'cancel' | 'send-to-picking' | 'mark-ready';

/**
 * `post` — to'lov. `draft` (yig'ishsiz tez sotuv) yoki `ready` (omborchi
 * yig'ib bo'lgan) dan. `picking` dan ATAYLAB yo'q: tovar hali yig'ilmagan,
 * kassir pul olmasligi kerak.
 */
const POSTABLE = ['draft', 'ready'] as const;

/** `cancel` — to'lovgacha bo'lgan har qanday holatdan (TZ §4 diagrammasi). */
const CANCELLABLE = ['draft', 'picking', 'ready'] as const;

const SENDABLE_TO_PICKING = ['draft'] as const;

const MARKABLE_READY = ['picking'] as const;

const ALLOWED_FROM: Record<RetailSaleTransition, readonly string[]> = {
  post: POSTABLE,
  cancel: CANCELLABLE,
  'send-to-picking': SENDABLE_TO_PICKING,
  'mark-ready': MARKABLE_READY,
};

/** O'tish uchun ruxsat etilgan boshlang'ich holatlar. */
export function allowedFrom(transition: RetailSaleTransition): readonly string[] {
  return ALLOWED_FROM[transition];
}

export function canTransition(state: string, transition: RetailSaleTransition): boolean {
  return ALLOWED_FROM[transition].includes(state);
}

/**
 * Rad etish xabari — holat nomlari xabarda ko'rinadi, chunki bu 400 to'g'ridan
 * to'g'ri kassirning ekranida chiqadi va qaysi holat kutilganini aytishi kerak.
 */
export function transitionRejection(state: string, transition: RetailSaleTransition): string {
  return `Cannot ${transition} a sale in state '${state}' (allowed: ${ALLOWED_FROM[transition].join(', ')})`;
}
