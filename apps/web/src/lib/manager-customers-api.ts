/**
 * MK38 — mijoz taqsimoti (4-bo'lim TZ §6) API client.
 *
 * Egalik o'zgarishi `audit_log` ga yoziladi (yangi jadval ochilmagan), tarix
 * shu yerdan o'qiladi.
 */

import { api } from './api-client';

export interface ManagerCustomerRow {
  id: string;
  name: string;
  ownerId: string | null;
  ownerName: string | null;
  phone: string | null;
  updatedAt: string | null;
}

export interface CustomerDistribution {
  total: number;
  /** Egasi YO'Q mijozlar — «erkin havza». */
  unassigned: number;
  owners: Array<{ ownerId: string; name: string; count: number }>;
}

export interface OwnerHistoryEvent {
  id: string;
  at: string;
  actorId: string | null;
  actorName: string | null;
  fromOwnerId: string | null;
  fromOwnerName: string | null;
  toOwnerId: string | null;
  toOwnerName: string | null;
}

/**
 * MK17 — «yo'qolgan mijozlar signali». Sabab kodlari YOPIQ ro'yxat: yorliqlar
 * i18n da (`lc_reason_<code>`), taqsimot esa kod bo'yicha chiziladi.
 */
export const LOST_REASON_CODES = [
  'price',
  'quality',
  'assortment',
  'service',
  'competitor',
  'closed',
  'moved',
  'other',
] as const;
export type LostReasonCode = (typeof LOST_REASON_CODES)[number];

export interface LostCustomerRow {
  counterpartyId: string;
  name: string;
  phone: string | null;
  ownerId: string | null;
  ownerName: string | null;
  firstPurchaseAt: string | null;
  lastPurchaseAt: string | null;
  purchaseCount: number;
  /** `null` = hech qachon xarid qilmagan (NULL ≠ 0). */
  inactiveDays: number | null;
  bucket: 'lost' | 'active' | 'never_purchased';
  reasonCode: LostReasonCode | null;
  reasonRaw: string | null;
  reasonNote: string | null;
  reasonAt: string | null;
  reasonAuthorName: string | null;
  /** F005 egalik taymeri ishga tushsa shu mijoz egasiz qoladi. */
  releaseDue: boolean;
}

export interface LostCustomerSummary {
  lostCount: number;
  activeCount: number;
  neverPurchasedCount: number;
  byOwner: Array<{ ownerId: string | null; ownerName: string | null; lostCount: number }>;
  byReason: Array<{ code: LostReasonCode; count: number }>;
  unmarkedCount: number;
  releaseDueCount: number;
  /** Yo'qolish davri egalik muddatidan uzun — kesim strukturaviy bo'sh chiqadi. */
  ownershipConflict: boolean;
}

export interface LostCustomerConfig {
  lostDays: number;
  lostDaysConfigured: boolean;
  lostSignalEnabled: boolean;
  ownershipReleaseDays: number | null;
  lostDaysRejectReason: string | null;
}

export interface LostCustomerResult {
  rows: LostCustomerRow[];
  summary: LostCustomerSummary;
  config: LostCustomerConfig;
  totalCount: number;
  truncated: boolean;
  generatedAt: string;
}

export interface ReassignResult {
  total: number;
  succeeded: string[];
  failed: Array<{ id: string; error: string }>;
}

export const managerCustomersApi = {
  list(params: {
    ownerId?: string;
    unassigned?: boolean;
    search?: string;
    limit?: number;
  }): Promise<{ rows: ManagerCustomerRow[]; distribution: CustomerDistribution }> {
    const q = new URLSearchParams();
    if (params.ownerId) q.set('ownerId', params.ownerId);
    if (params.unassigned) q.set('unassigned', 'true');
    if (params.search) q.set('search', params.search);
    if (params.limit) q.set('limit', String(params.limit));
    const qs = q.toString();
    return api.get(`/manager/customers${qs ? `?${qs}` : ''}`);
  },

  /** `toOwnerId: null` = erkin havzaga qaytarish (bu ALOHIDA amal). */
  reassign(counterpartyIds: string[], toOwnerId: string | null): Promise<ReassignResult> {
    return api.post('/manager/customers/reassign', { counterpartyIds, toOwnerId });
  },

  ownerHistory(id: string): Promise<{ counterpartyId: string; events: OwnerHistoryEvent[] }> {
    return api.get(`/manager/customers/${id}/owner-history`);
  },

  /** MK17 — yo'qolgan mijozlar signali. */
  lost(params: {
    scope?: 'lost' | 'all';
    ownerId?: string;
    unassigned?: boolean;
    unmarkedOnly?: boolean;
    limit?: number;
  }): Promise<LostCustomerResult> {
    const q = new URLSearchParams();
    if (params.scope) q.set('scope', params.scope);
    if (params.ownerId) q.set('ownerId', params.ownerId);
    if (params.unassigned) q.set('unassigned', 'true');
    if (params.unmarkedOnly) q.set('unmarkedOnly', 'true');
    if (params.limit) q.set('limit', String(params.limit));
    const qs = q.toString();
    return api.get(`/manager/customers/lost${qs ? `?${qs}` : ''}`);
  },

  /** MK17 — ketish sababini belgilash (mijozning izoh jurnaliga yoziladi). */
  markLostReason(
    counterpartyId: string,
    code: LostReasonCode,
    note: string | null,
  ): Promise<{ ok: boolean; noteId: string; at: string; code: string | null }> {
    return api.post('/manager/customers/lost-reason', { counterpartyId, code, note });
  },
};
