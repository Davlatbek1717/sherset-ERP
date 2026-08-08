import { ConflictException } from '@nestjs/common';

/**
 * Atomik holat-«claim» — hujjat o'tkazishlaridagi TOCTOU poygasini yopadi.
 *
 * MUAMMO (M-01 / DUP-01, 2026-08-08 auditi)
 * -----------------------------------------
 * Pul-hujjat servislari (payment-in/out, cash-in/out, invoice-out/in,
 * counterparty-adjustment) `post()/unpost()/cancel()` da holatni `$transaction`
 * dan TASHQARIDA o'qib tekshirar, so'ng tranzaksiya ichida ko'r-ko'rona
 * `update({ where: { id, accountId } })` bilan flip qilardi — WHERE'da state
 * sharti YO'Q, izolyatsiya default (ReadCommitted). Ikki parallel «Провести»
 * (double-click / retry / ikki operator) ikkalasi ham `draft` ni ko'radi va
 * ikkalasi ham o'tadi ⇒ kontragent balansi 2×, invoice `payedSum` 2×, kassa
 * balansi 2× buziladi va buni HECH NARSA sezmaydi.
 *
 * Aynan shu bug stock oilasida (demand `dd33fac5`, supply/sales-return/
 * purchase-return `0b525f80`) yopilgan: tranzaksiya ichidagi BIRINCHI amal
 * sifatida shartli `updateMany WHERE state=<kutilgan>` yuboriladi. U qator
 * yozuv-qulfini oladi, shuning uchun raqib tranzaksiya shu yerda kutadi va
 * qulf bo'shagach `count === 0` ni ko'radi ⇒ toza 409. Claim tranzaksiya
 * ICHIDA bo'lgani uchun keyingi xato (masalan overdraft) uni ham rollback
 * qiladi. Bu fayl o'sha naqshni pul-oilasi uchun bitta joyga chiqaradi.
 *
 * NEGA STRING `model` EMAS, balki delegat uzatiladi: `tx['paymentIn']` kabi
 * indekslash Prisma delegat-tiplari birlashmasini «chaqirib bo'lmaydigan»
 * qilib qo'yadi (union call-signature). Chaqiruv joyi `tx.paymentIn` bo'lib
 * qolgani uchun manba-skaner (transition-toctou-class.test.ts) uni baribir
 * model bo'yicha tanib oladi.
 */

/**
 * Pul-hujjat o'tkazishlari uchun tranzaksiya sozlamasi.
 *
 * `Serializable` + `withSerializationRetry` juftligi stock oilasidagi
 * (move/enter/demand) o'lchangan intizomning aynan o'zi: konflikt navbatga
 * qo'yilmaydi, tranzaksiya 40001/P2034 bilan bekor bo'ladi va faqat XAVFSIZ
 * (to'liq rollback bo'lgan) yo'l qayta uriniladi. `timeout` ham stock oilasi
 * bilan bir xil — 15s.
 */
export const MONEY_TX_OPTS = {
  isolationLevel: 'Serializable',
  timeout: 15000,
} as const;

/**
 * Prisma delegatining bizga kerakli yagona qismi. Strukturaviy tip — har
 * qanday `tx.<model>` shu shaklga tushadi.
 */
export interface StateClaimDelegate {
  updateMany(args: {
    where: { id: string; accountId: string; state: { in: string[] } };
    data: { state: string };
  }): Promise<{ count: number }>;
}

export interface TransitionClaimOptions {
  id: string;
  accountId: string;
  /** Ruxsat etilgan boshlang'ich holatlar (cancel uchun snapshot holati). */
  fromStates: readonly string[];
  toState: string;
  /** 409 matni. Berilmasa umumiy domen-neytral xabar ishlatiladi. */
  message?: string;
}

/**
 * Hujjat holatini atomik «egallab oladi».
 *
 * Tranzaksiya ichidagi BIRINCHI amal sifatida chaqirilishi SHART — aks holda
 * undan oldingi yozuvlar (balans deltalari) poygada ikki marta qo'llanadi.
 *
 * @throws ConflictException — `count === 0` (holat kutilganidan boshqa: raqib
 *   allaqachon o'tkazgan/bekor qilgan, yoki hujjat boshqa tenantniki).
 */
export async function transitionWithClaim(
  delegate: StateClaimDelegate,
  opts: TransitionClaimOptions,
): Promise<void> {
  const claim = await delegate.updateMany({
    where: { id: opts.id, accountId: opts.accountId, state: { in: [...opts.fromStates] } },
    data: { state: opts.toState },
  });
  if (claim.count === 0) {
    throw new ConflictException(
      opts.message ??
        `Hujjat holati o'zgargan (kutilgan: ${opts.fromStates.join(' | ')}) — qayta yuklang`,
    );
  }
}
