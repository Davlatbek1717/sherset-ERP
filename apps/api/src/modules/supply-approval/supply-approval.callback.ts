import type { TelegramInlineButton } from '../telegram/telegram.client.js';

export type InlineKeyboard = { inline_keyboard: TelegramInlineButton[][] };

/**
 * Qabul-tasdiqlash Telegram callback-protokoli (Faza B, spec §4). Taminotchi
 * inline-tugmani bosganda callback_data SHU shaklda keladi: `sa:<action>:<supplyId>`.
 *   cfm  — «Tasdiqlash» (1-bosish) → ikki-bosqich so'raladi
 *   cfm2 — «Ha, tasdiqlayman» (2-bosish) → applySupplierDecision(approve)
 *   rej  — «Rad etish» → applySupplierDecision(reject)
 *   cxl  — «Bekor» (ikki-bosqichdan qaytish) → asl tugmalar tiklanadi
 * (uuid=36 + prefiks ≤ 8 = 44 bayt < Telegram 64-bayt limiti.)
 */

// Taminotchi (Faza B): cfm/cfm2/rej/cxl · Omborchi (Faza D2): ocfm/oadj
//   ocfm — «✅ To'g'ri, tasdiqlash» → omborchiConfirm (adjustmentsiz)
//   oadj — «✏️ Son noto'g'ri» → ERP'da tuzatish (bosqich o'zgarmaydi, yo'riqnoma)
export type ApprovalCallbackAction = 'cfm' | 'cfm2' | 'rej' | 'cxl' | 'ocfm' | 'oadj';
const PREFIX = 'sa';
const ACTIONS: readonly ApprovalCallbackAction[] = ['cfm', 'cfm2', 'rej', 'cxl', 'ocfm', 'oadj'];

export function buildCallbackData(action: ApprovalCallbackAction, supplyId: string): string {
  return `${PREFIX}:${action}:${supplyId}`;
}

export function parseCallbackData(
  data: string,
): { action: ApprovalCallbackAction; supplyId: string } | null {
  const parts = data.split(':');
  if (parts.length !== 3 || parts[0] !== PREFIX) return null;
  const action = parts[1] as ApprovalCallbackAction;
  if (!ACTIONS.includes(action)) return null;
  const supplyId = parts[2];
  if (!supplyId) return null;
  return { action, supplyId };
}

/** Yuborilgan xabardagi boshlang'ich tugmalar. */
export function confirmKeyboard(supplyId: string): InlineKeyboard {
  return {
    inline_keyboard: [
      [
        { text: '✅ Tasdiqlash', callback_data: buildCallbackData('cfm', supplyId) },
        { text: '❌ Rad etish', callback_data: buildCallbackData('rej', supplyId) },
      ],
    ],
  };
}

/** Ikki-bosqich — «Aniqmi?» */
export function doubleConfirmKeyboard(supplyId: string): InlineKeyboard {
  return {
    inline_keyboard: [
      [{ text: '✅ Ha, tasdiqlayman', callback_data: buildCallbackData('cfm2', supplyId) }],
      [{ text: '↩︎ Bekor', callback_data: buildCallbackData('cxl', supplyId) }],
    ],
  };
}

/** Omborchi tugmalari (Faza D2) — sonini sanab tasdiq yoki «noto'g'ri»→ERP. */
export function omborchiKeyboard(supplyId: string): InlineKeyboard {
  return {
    inline_keyboard: [
      [
        { text: "✅ To'g'ri, tasdiqlash", callback_data: buildCallbackData('ocfm', supplyId) },
        { text: "✏️ Son noto'g'ri", callback_data: buildCallbackData('oadj', supplyId) },
      ],
    ],
  };
}
