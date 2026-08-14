/**
 * POS rejim-komponentlari o'rtasida ULASHILADIGAN UI-tiplar (F1, POS redizayn).
 *
 * Bu — API-kontrakt EMAS (`@moysklad/contracts` emas): shakllar sahifaning
 * o'z proyeksiyalari. Ular ilgari `page.tsx` ichida turardi; rejim-komponentlar
 * ajratilgach bir nechta fayl o'qiydigan bo'ldi va tip YAGONA joyda qolishi
 * uchun shu faylga ko'chdi.
 */

/**
 * Savat qatori — sahifaning O'Z UI holati, API payload emas.
 *
 * `quantity` — **DECIMAL SATR** (`Decimal(20,6)`), `number` EMAS (F8 audit).
 *
 * Server sxemasi `/^\d+(\.\d{1,6})?$/` qabul qiladi, ya'ni og'irlik bilan
 * sotiladigan tovar (yoki zakaz pozitsiyasi) savatga `1.5` bo'lib tushishi
 * MUMKIN. Ilgari bu `number` edi va savat jamisi `BigInt(l.quantity)` bilan
 * hisoblanardi — `BigInt(1.5)` **RangeError** otadi. React render'i ichida
 * otilgan xato butun POS ni OQ EKRANGA aylantiradi: chek ham, pul ham
 * yo'qoladi. Hisob endi `scaleMinorByQty` / `cart-math` orqali — serverning
 * fixed-point yo'li bilan bir xil.
 */
export interface CartLine {
  productId: string;
  productName: string;
  quantity: string;
  priceMinor: bigint;
  /** user-editable price string (major units) */
  priceStr: string;
  availableStock?: number;
  // Kassa TZ §5 — the two floors and the starting price, read off the product
  // card when the line is added. NULL means the card carries no such number;
  // the row then shows «—» and raises no warning, because an absent floor is
  // not evidence that the price is wrong. These are LIVE values for the
  // cashier's benefit — `post()` re-reads and freezes them server-side.
  costMinor: bigint | null;
  wholesaleMinor: bigint | null;
  basePriceMinor: bigint | null;
}

/**
 * F5 — smenani yopishga to'sqinlik qiluvchi chek qatori
 * (`GET /cashier-sessions/:id/unresolved` proyeksiyasi). `sumMinor` — satr
 * (BigInt JSON'da satr bo'lib keladi, `SaleRow` bilan bir xil konvensiya).
 */
export interface UnresolvedSaleRow {
  id: string;
  name: string;
  state: string;
  sumMinor: string;
}

/** Chek ro'yxati qatori — `/retail-sales` list proyeksiyasi (cheklar/navbat). */
export interface SaleRow {
  id: string;
  name: string;
  sumMinor: string;
  moment: string;
  state: string;
  agent: { id: string; name: string } | null;
  session: {
    cashier: { id: string; name: string };
    cashDesk: { name: string; currency: string } | null;
  };
  _count?: { positions: number };
}
