import { randomBytes } from 'node:crypto';

/**
 * Kassa chekining OCHIQ havolasi (`/p/<token>`) — mijozga ketadigan xabarlar
 * uchun YAGONA manba.
 *
 * 🔴 NEGA ALOHIDA FAYL (2026-08-16): bu mantiq `CounterpartyDebtNotifier` ning
 * private metodi edi va «hisob-kitob cheki» (mijozning butun hisobi) ham aynan
 * shu havolaga muhtoj bo'ldi. Nusxa ko'chirilsa ikkitasi ajralib ketardi —
 * masalan TTL bir joyda o'zgarib, ikkinchisida eski qolardi (repoda o'lchangan
 * bug-klass: «nusxa-ko'chirish bitta shoxni yo'qotadi»).
 *
 * Shartnoma: HECH QACHON otmaydi — havola bo'lmasa xabar baribir ketadi,
 * shunchaki «🧾» qatorisiz.
 */

/** `Publication` va `RetailSale` uchun kerakli minimal Prisma yuzasi. */
export interface ReceiptLinkClient {
  publication: {
    findFirst(args: unknown): Promise<{ token: string } | null>;
    create(args: unknown): Promise<{ token: string }>;
  };
  retailSale: {
    findFirst(args: unknown): Promise<{ ownerId: string | null } | null>;
  };
}

/** Ochiq havola bazasi — sozlanmagan bo'lsa havola UMUMAN yaratilmaydi. */
export function receiptLinkBase(): string | null {
  const base = (process.env.PUBLIC_APP_URL ?? '').trim().replace(/\/+$/, '');
  return base || null;
}

/**
 * Chek uchun ochiq havola: bori qaytariladi, yo'g'i yaratiladi.
 *
 * `null` qaytadigan holatlar (hammasi normal, xato emas):
 *   · `PUBLIC_APP_URL` sozlanmagan;
 *   · chek egasiz (`RetailSale.ownerId` NULL, `Publication.ownerId` esa majburiy);
 *   · har qanday DB xatosi (chaqiruvchi xabarni to'xtatmaydi).
 */
export async function ensureReceiptLink(
  client: ReceiptLinkClient,
  accountId: string,
  docId: string | null | undefined,
): Promise<string | null> {
  if (!docId) return null;
  const base = receiptLinkBase();
  if (!base) return null;
  try {
    const existing = await client.publication.findFirst({
      where: {
        accountId,
        targetType: 'retailsale',
        targetId: docId,
        deletedAt: null,
        revokedAt: null,
      },
      select: { token: true },
    });
    if (existing) return `${base}/p/${existing.token}`;

    const sale = await client.retailSale.findFirst({
      where: { id: docId, accountId },
      select: { ownerId: true },
    });
    if (!sale?.ownerId) return null;

    const days = Number.parseInt(process.env.RECEIPT_LINK_TTL_DAYS ?? '90', 10);
    const expiresAt =
      Number.isFinite(days) && days > 0 ? new Date(Date.now() + days * 86_400_000) : null;
    const created = await client.publication.create({
      data: {
        accountId,
        ownerId: sale.ownerId,
        targetType: 'retailsale',
        targetId: docId,
        token: randomBytes(32).toString('base64url'),
        description: 'Kassa cheki (avtomatik)',
        expiresAt,
      },
      select: { token: true },
    });
    return `${base}/p/${created.token}`;
  } catch {
    return null;
  }
}
