/**
 * Click (click.uz) merchant protocol — V1.
 *
 * Click uses two-stage callback flow:
 *   1. PREPARE — Click confirms order can be paid
 *   2. COMPLETE — Click reports payment success/failure
 *
 * Both come as POST x-www-form-urlencoded with these fields:
 *   click_trans_id, service_id, click_paydoc_id, merchant_trans_id,
 *   amount, action (0=PREPARE, 1=COMPLETE), error, error_note,
 *   sign_time, sign_string
 *
 * Signature verification (MD5):
 *   md5(click_trans_id + service_id + secret_key + merchant_trans_id +
 *       amount + action + sign_time)
 *
 * Spec: https://docs.click.uz/click-api/
 */

import { createHash } from 'node:crypto';

export type ClickAction = 0 | 1; // 0 = PREPARE, 1 = COMPLETE

export interface ClickCallbackParams {
  click_trans_id: string;
  service_id: string;
  click_paydoc_id: string;
  merchant_trans_id: string;
  amount: string;
  action: string;
  error: string;
  error_note?: string;
  sign_time: string;
  sign_string: string;
  /** Only present on COMPLETE callback. */
  merchant_prepare_id?: string;
}

export interface ClickResponse {
  click_trans_id: string;
  merchant_trans_id: string;
  /** On PREPARE success this is our internal order/prepare id. */
  merchant_prepare_id?: string;
  error: number;
  error_note: string;
}

/** Click well-known error codes. */
export const CLICK_ERROR = {
  SUCCESS: 0,
  SIGN_CHECK_FAILED: -1,
  INCORRECT_AMOUNT: -2,
  ACTION_NOT_FOUND: -3,
  ALREADY_PAID: -4,
  USER_NOT_FOUND: -5,
  TRANSACTION_NOT_FOUND: -6,
  FAILED_TO_UPDATE_USER: -7,
  ERROR_IN_REQUEST_FROM_CLICK: -8,
  TRANSACTION_CANCELLED: -9,
} as const;

const ERROR_NOTES: Record<number, string> = {
  [CLICK_ERROR.SUCCESS]: 'Success',
  [CLICK_ERROR.SIGN_CHECK_FAILED]: 'SIGN CHECK FAILED!',
  [CLICK_ERROR.INCORRECT_AMOUNT]: 'Incorrect amount',
  [CLICK_ERROR.ACTION_NOT_FOUND]: 'Action not found',
  [CLICK_ERROR.ALREADY_PAID]: 'Already paid',
  [CLICK_ERROR.USER_NOT_FOUND]: 'User not found',
  [CLICK_ERROR.TRANSACTION_NOT_FOUND]: 'Transaction does not exist',
  [CLICK_ERROR.FAILED_TO_UPDATE_USER]: 'Failed to update user',
  [CLICK_ERROR.ERROR_IN_REQUEST_FROM_CLICK]: 'Error in request from click',
  [CLICK_ERROR.TRANSACTION_CANCELLED]: 'Transaction cancelled',
};

export function clickErrorNote(code: number): string {
  return ERROR_NOTES[code] ?? 'Unknown error';
}

/**
 * Verify the MD5 signature on an inbound Click callback.
 *
 *   md5(click_trans_id + service_id + secret_key + merchant_trans_id +
 *       amount + action + sign_time)
 *
 * Note: secret_key is sandwiched between service_id and merchant_trans_id.
 */
export function verifyClickSign(
  params: Pick<
    ClickCallbackParams,
    | 'click_trans_id'
    | 'service_id'
    | 'merchant_trans_id'
    | 'amount'
    | 'action'
    | 'sign_time'
    | 'sign_string'
  >,
  secretKey: string,
): boolean {
  const expected = createHash('md5')
    .update(
      [
        params.click_trans_id,
        params.service_id,
        secretKey,
        params.merchant_trans_id,
        params.amount,
        params.action,
        params.sign_time,
      ].join(''),
    )
    .digest('hex');
  return expected === params.sign_string;
}

/**
 * Click `amount` (so'mda, o'nlik STRING — masalan `'19.99'`) → tiyin BigInt.
 *
 * Faza 19 (`INT-03`). Ilgari summa `Number(amount) * 100` bilan solishtirilardi;
 * IEEE754'da bu ba'zi qiymatlarda butun songa TUSHMAYDI va qat'iy `!==`
 * to'g'ri to'lovni «Incorrect amount» bilan rad etardi. O'lchangan misollar:
 *   0.29 → 28.999999999999996 · 8.29 → 828.9999999999999 · 19.99 → 1998.9999999999998
 * (audit hisobotidagi `115.23` misoli esa aslida aniq 11523 beradi — bug-klass
 * real, lekin uni ko'rsatadigan qiymatlar boshqa).
 *
 * Shuning uchun bu yerda float UMUMAN qatnashmaydi: string butun/kasr qismga
 * bo'linadi, kasr 2 xonaga to'ldiriladi/yaxlitlanadi va BigInt yig'iladi.
 * Yaroqsiz format (`'abc'`, bo'sh, manfiy) → `null` — chaqiruvchi buni
 * INCORRECT_AMOUNT deb qaytaradi, NaN jimgina o'tib ketmaydi.
 */
export function parseClickAmountToMinor(raw: string | number | undefined | null): bigint | null {
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim();
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const dot = s.indexOf('.');
  const whole = dot === -1 ? s : s.slice(0, dot);
  const frac = dot === -1 ? '' : s.slice(dot + 1);
  const minor = BigInt(whole) * 100n + BigInt(frac.padEnd(2, '0').slice(0, 2));
  // 2 xonadan ortiq kasr — yarim-yuqoriga yaxlitlash (provider odatda 2 xona
  // yuboradi; bu faqat himoya qatlami).
  const third = frac.length > 2 ? Number(frac[2]) : 0;
  return third >= 5 ? minor + 1n : minor;
}

/** Build a Click response envelope. */
export function clickResponse(
  click_trans_id: string,
  merchant_trans_id: string,
  errorCode: number,
  merchant_prepare_id?: string,
): ClickResponse {
  return {
    click_trans_id,
    merchant_trans_id,
    merchant_prepare_id,
    error: errorCode,
    error_note: clickErrorNote(errorCode),
  };
}
