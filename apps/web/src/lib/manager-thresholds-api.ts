/**
 * MK13 — menejer bo'limining SON-CHEGARALARI registri (`manager_rule_configs`).
 *
 * Yozuv sirti MK17 da ochildi: «yo'qolish davri» aynan shu registrdan
 * sozlanadi, ikkinchi sozlama manbai yaratilmadi.
 */

import { api } from './api-client';

export type ManagerThresholdKey =
  | 'KPI_SCORE_CAP'
  | 'BUDGET_WARN_PERCENT'
  | 'LOST_CUSTOMER_DAYS'
  | 'OWNERSHIP_RELEASE_DAYS';

export interface ManagerThreshold {
  key: ManagerThresholdKey;
  value: number;
  unit: 'percent' | 'days';
  min: number;
  max: number;
  defaultValue: number;
  configured: boolean;
  configuredValue: number | null;
  /** `false` = chegara UMUMAN qo'llanmaydi (sukutga qaytish EMAS). */
  enabled: boolean;
  rejectReason: 'unit_mismatch' | 'out_of_range' | 'not_a_number' | null;
  rationale: string;
}

export const managerThresholdsApi = {
  list(): Promise<{ thresholds: ManagerThreshold[] }> {
    return api.get('/manager/thresholds');
  },

  /**
   * `value` va `enabled` ALOHIDA yuboriladi: «davrni o'zgartirish» va
   * «signalni o'chirish» ikki boshqa amal.
   */
  update(
    key: ManagerThresholdKey,
    patch: { value?: number; enabled?: boolean },
  ): Promise<{ thresholds: ManagerThreshold[] }> {
    return api.put(`/manager/thresholds/${key}`, patch);
  },
};
