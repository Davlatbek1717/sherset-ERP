import { api } from '../api-client';

/**
 * P05 (2026-08-13, egasi) — chek oxiridagi «Sizning qarzingiz» uchun qoldiq.
 *
 * Manba — `GET /debts/pos/summary/:agentId?currency=UZS` → `payableMinor`
 * («bitta halol raqam», xotira `pos-customer-card-one-number`). Chop post()'dan
 * KEYIN chaqiriladi, kam to'lov qarzi balansga allaqachon yozilgan — ya'ni bu
 * aynan «qolgan qoldiq». Ikkala chop-nuqta (agent-yo'l `printReceiptViaAgent`
 * va brauzer-popup `/print/retail-sale/[id]`) SHU bitta helper'ni ishlatadi —
 * ikki nusxa jimgina ajralib ketmasin.
 *
 * 🔴 FAIL-OPEN: so'rov yiqilsa `null` («o'lchanmagan», 0 EMAS) — qarz qatori
 * chizilmaydi, lekin chek TO'XTAMAYDI.
 */
export async function fetchDebtAfter(agentId: string): Promise<bigint | null> {
  try {
    const r = await api.get<{ payableMinor?: string | null }>(
      `/debts/pos/summary/${agentId}?currency=UZS`,
    );
    return r.payableMinor != null ? BigInt(r.payableMinor) : null;
  } catch {
    return null;
  }
}
