/**
 * POS rejim-komponentlari o'rtasida ULASHILADIGAN UI-tiplar (F1, POS redizayn).
 *
 * Bu — API-kontrakt EMAS (`@moysklad/contracts` emas): shakllar sahifaning
 * o'z proyeksiyalari. Ular ilgari `page.tsx` ichida turardi; rejim-komponentlar
 * ajratilgach bir nechta fayl o'qiydigan bo'ldi va tip YAGONA joyda qolishi
 * uchun shu faylga ko'chdi.
 */

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
