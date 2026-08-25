/**
 * G6 — OFLAYN AMALNING IDEMPOTENTLIK KALITI (TSD `ActionQueue`).
 *
 * 🔴 MUAMMO. TSD ombor bo'ylab yuradi va Wi-Fi uziladi. Uzilgan amal
 * navbatda turadi va aloqa tiklangach QAYTA yuboriladi. Lekin uzilish
 * server amalni BAJARGANDAN KEYIN — javob yo'lda ekan — ham bo'lishi
 * mumkin: klient «yetib bormadi» deb biladi, aslida bajarilgan. Kalitsiz
 * qayta yuborish qoldiqni ikki marta siljitardi (`cell-move` 10 dona
 * o'rniga 20; `confirm-scan` bitta tovarning IKKINCHI qatorini yopardi).
 *
 * 🔴 YECHIM VA UNING SHARTI. Klient har amalga bir marta `clientOpId`
 * (UUID) beradi. Da'vo IKKI QADAMDA bo'ladi va ikkalasi ham kerak:
 *
 *  1. **Tranzaksiyadan OLDIN o'qish** (`findClientOp`) — odatiy takror
 *     (aloqa uzilib, klient qayta yuborgan) shu yerda ushlanadi va amal
 *     umuman boshlanmaydi.
 *  2. **Tranzaksiya ICHIDA yozish** (`claimClientOp`) — ikki nusxa AYNI
 *     paytda kelgan poyga uchun. Yozuv effekt bilan BIR tranzaksiyada
 *     bo'lishi shartning O'ZI:
 *      · tashqarida yozilib effekt yiqilsa — kalit «bajarilgan» bo'lib
 *        qolardi va qayta urinish JIM RAD etilardi (ish yo'qoladi, IS-5);
 *      · effektdan KEYIN yozilsa — oradagi qulash kalitni yo'qotardi va
 *        qayta yuborish ikkinchi effektni berardi (ildiz muammoning o'zi).
 *     Bitta tranzaksiyada esa ikkalasi birga qaytadi va qayta yuborish toza.
 *
 * ⚠️ Postgres'da tranzaksiya ichidagi unikal-buzilish butun tranzaksiyani
 * ABORT holatiga o'tkazadi — shuning uchun `claimClientOp` u yerda
 * `DuplicateClientOpError` ni OTADI (davom etib, qatorni o'qib bo'lmaydi)
 * va chaqiruvchi uni tranzaksiyadan TASHQARIDA ushlab, joriy holatni
 * qaytaradi.
 *
 * 🔴 NIMA SAQLANMAYDI: javob tanasi. Takror so'rovga chaqiruvchi joriy
 * holatni QAYTA O'QIB beradi — saqlangan eski nusxa oradagi o'zgarishlarni
 * (masalan kontrol tahririni) yashirardi.
 *
 * Kalit MAJBURIY EMAS: web ekranlari uni yubormaydi (brauzerda navbat yo'q)
 * va ular uchun xulq bir bayt ham o'zgarmaydi.
 */

import { ConflictException } from '@nestjs/common';

/** Prisma klientining bu modulga kerak bo'lgan yagona qismi. */
export interface ClientOpDb {
  clientOperation: {
    findFirst(args: {
      where: { accountId: string; clientOpId: string };
      select: { route: boolean };
    }): Promise<{ route: string } | null>;
    create(args: {
      data: { accountId: string; clientOpId: string; route: string; employeeId?: string | null };
    }): Promise<unknown>;
  };
}

export type ClientOpTx = Pick<ClientOpDb, 'clientOperation'>;

/** Tranzaksiya ichidagi poyga — chaqiruvchi buni TASHQARIDA ushlaydi. */
export class DuplicateClientOpError extends Error {
  constructor() {
    super('client-op duplicate');
    this.name = 'DuplicateClientOpError';
  }
}

/** Prisma unikal-buzilish kodi. */
const P2002 = 'P2002';

function isUniqueViolation(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === P2002;
}

/** Bo'sh/probel kalit — «kalit yo'q» degani (web yo'li). */
export function normalizeClientOpId(raw: string | null | undefined): string | null {
  const key = raw?.trim();
  return key ? key : null;
}

/**
 * Kalit BOSHQA marshrutda ishlatilganini aniqlaydi.
 *
 * Nega kerak: bir xil UUID ikki xil amalga berilsa (klient nosozligi yoki
 * qo'lda `curl`) ikkinchi amal JIMGINA bajarilmay qolardi va omborchi buni
 * bilmasdi — jim yo'qotish, ya'ni IS-5 klassi. Shuning uchun bunday hol
 * 409 bilan BALAND aytiladi.
 */
export function assertSameRoute(existingRoute: string, route: string): void {
  if (existingRoute !== route) {
    throw new ConflictException(
      `Bu amal kaliti boshqa amalda ishlatilgan («${existingRoute}») — yangi kalit bilan yuboring`,
    );
  }
}

/**
 * 1-qadam: tranzaksiyadan OLDIN. Kalit allaqachon bo'lsa `true` qaytadi
 * (amal boshlanmaydi); marshrut mos kelmasa 409 otiladi.
 */
export async function findClientOp(
  db: ClientOpDb,
  args: { accountId: string; clientOpId: string | null; route: string },
): Promise<boolean> {
  if (!args.clientOpId) return false;
  const row = await db.clientOperation.findFirst({
    where: { accountId: args.accountId, clientOpId: args.clientOpId },
    select: { route: true },
  });
  if (!row) return false;
  assertSameRoute(row.route, args.route);
  return true;
}

/**
 * 2-qadam: tranzaksiya ICHIDA. Poygada `DuplicateClientOpError` otadi
 * (tranzaksiya qaytadi) — chaqiruvchi uni tashqarida ushlaydi.
 */
export async function claimClientOp(
  tx: ClientOpTx,
  args: {
    accountId: string;
    clientOpId: string | null;
    route: string;
    employeeId?: string | null;
  },
): Promise<void> {
  if (!args.clientOpId) return;
  try {
    await tx.clientOperation.create({
      data: {
        accountId: args.accountId,
        clientOpId: args.clientOpId,
        route: args.route,
        employeeId: args.employeeId ?? null,
      },
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new DuplicateClientOpError();
    throw e;
  }
}

/** `DuplicateClientOpError` mi (tranzaksiya o'ramidan o'tgan bo'lsa ham). */
export function isDuplicateClientOp(e: unknown): boolean {
  return (
    e instanceof DuplicateClientOpError || (e as Error | null)?.name === 'DuplicateClientOpError'
  );
}

/** Kalit maydonining maksimal uzunligi (sxema bilan bir xil). */
export const CLIENT_OP_ID_MAX = 64;
