/**
 * Payme (paycom.uz) JSON-RPC merchant protocol — V1.
 *
 * Payme calls into our backend with these methods:
 *   1. CheckPerformTransaction — verify the order can be paid
 *   2. CreateTransaction       — register a new payment in 'created' state
 *   3. PerformTransaction      — confirm the payment
 *   4. CancelTransaction       — refund / void
 *   5. CheckTransaction        — status lookup
 *   6. GetStatement            — list transactions in a window
 *
 * Spec: https://developer.help.paycom.uz/protokol-merchant-api/
 *
 * Auth: HTTP Basic with merchant id (`Paycom`) + secret key as the
 * password. We verify the Authorization header on every call.
 *
 * Error envelope:
 *   { jsonrpc: "2.0", error: { code, message, data? }, id }
 *
 * Numbers stick to integer tiyin throughout — Payme treats amount as
 * integer minor units (1 sum = 100 tiyin).
 */

export interface PaymeRpcRequest<P = unknown> {
  jsonrpc?: '2.0';
  id: number | string;
  method: string;
  params: P;
}

export interface PaymeRpcResult<T> {
  jsonrpc: '2.0';
  id: number | string;
  result: T;
}

export interface PaymeRpcError {
  jsonrpc: '2.0';
  id: number | string;
  error: {
    code: number;
    message: { uz: string; ru: string; en: string };
    data?: string;
  };
}

/** Payme well-known error codes. */
export const PAYME_ERROR = {
  /** -31050: order not found / not paid yet. */
  TX_NOT_FOUND: -31003,
  /** -31051: order not paid yet — used by CheckPerformTransaction. */
  ORDER_NOT_FOUND: -31050,
  /** -31001: invalid amount. */
  INVALID_AMOUNT: -31001,
  /** -31008: cannot perform — order in non-payable state. */
  CANNOT_PERFORM: -31008,
  /** -32504: auth failed. */
  AUTH_FAILED: -32504,
  /** -32400: invalid request shape. */
  INVALID_REQUEST: -32400,
} as const;

const ERROR_MESSAGES: Record<number, { uz: string; ru: string; en: string }> = {
  [PAYME_ERROR.TX_NOT_FOUND]: {
    uz: 'Tranzaksiya topilmadi',
    ru: 'Транзакция не найдена',
    en: 'Transaction not found',
  },
  [PAYME_ERROR.ORDER_NOT_FOUND]: {
    uz: 'Buyurtma topilmadi',
    ru: 'Заказ не найден',
    en: 'Order not found',
  },
  [PAYME_ERROR.INVALID_AMOUNT]: {
    uz: "Notog'ri summa",
    ru: 'Неверная сумма',
    en: 'Invalid amount',
  },
  [PAYME_ERROR.CANNOT_PERFORM]: {
    uz: "Operatsiyani bajarib bo'lmaydi",
    ru: 'Операция невозможна',
    en: 'Cannot perform operation',
  },
  [PAYME_ERROR.AUTH_FAILED]: {
    uz: 'Avtorizatsiya xatosi',
    ru: 'Ошибка авторизации',
    en: 'Authorization failed',
  },
  [PAYME_ERROR.INVALID_REQUEST]: {
    uz: "Notog'ri so'rov",
    ru: 'Неверный запрос',
    en: 'Invalid request',
  },
};

export function paymeError(id: number | string, code: number, data?: string): PaymeRpcError {
  return {
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message: ERROR_MESSAGES[code] ?? {
        uz: 'Xatolik',
        ru: 'Ошибка',
        en: 'Error',
      },
      data,
    },
  };
}

/**
 * Verify Payme HTTP Basic header. Payme sends Authorization: Basic
 * base64("Paycom:<secretKey>"). The username is always "Paycom" (or
 * "Paycomtest" for sandbox).
 *
 * Returns true on match. Caller throws PAYME_ERROR.AUTH_FAILED on false.
 */
export function verifyPaymeAuth(authHeader: string | undefined, secretKey: string): boolean {
  if (!authHeader || !authHeader.startsWith('Basic ')) return false;
  const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf-8');
  const colon = decoded.indexOf(':');
  if (colon === -1) return false;
  const user = decoded.slice(0, colon);
  const pass = decoded.slice(colon + 1);
  if (user !== 'Paycom' && user !== 'Paycomtest') return false;
  return pass === secretKey;
}

// ---- Method param shapes ---------------------------------------------

export interface CheckPerformTransactionParams {
  amount: number;
  account: { order_id: string };
}

export interface CreateTransactionParams {
  id: string;
  time: number;
  amount: number;
  account: { order_id: string };
}

export interface PerformTransactionParams {
  id: string;
}

export interface CancelTransactionParams {
  id: string;
  reason: number;
}

export interface CheckTransactionParams {
  id: string;
}

export interface GetStatementParams {
  from: number;
  to: number;
}

// ---- Method result shapes -------------------------------------------

export interface CheckPerformTransactionResult {
  allow: boolean;
}

export interface CreateTransactionResult {
  create_time: number;
  transaction: string;
  state: 1; // 1 = created
}

export interface PerformTransactionResult {
  transaction: string;
  perform_time: number;
  state: 2; // 2 = performed
}

export interface CancelTransactionResult {
  transaction: string;
  cancel_time: number;
  state: -1 | -2; // -1 = cancelled before perform, -2 = cancelled after
}

export interface CheckTransactionResult {
  create_time: number;
  perform_time: number;
  cancel_time: number;
  transaction: string;
  state: -2 | -1 | 1 | 2;
  reason: number | null;
}
