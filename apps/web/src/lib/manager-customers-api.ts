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
};
