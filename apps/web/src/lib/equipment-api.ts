import { api } from '@/lib/api-client';

/**
 * Jihoz reyestri API-mijozi (MK05 · 4M TZ §6.4).
 *
 * ⚠️ **`holder` ni `status` dan chiqarmang.** Server «kimda» javobini
 * FAQAT ochiq biriktirish qatoridan beradi; `status` — ko'rsatma ustuni.
 * FE'da ikkinchi manba yasash ularni jimgina bir-biridan uzoqlashtirardi.
 *
 * Alohida fayl (`hr-api.ts` ga qo'shilmadi): reyestr mustaqil domen va
 * parallel sessiyalar bilan kesishmasin.
 */

export type EquipmentStatus = 'in_stock' | 'assigned' | 'repair' | 'written_off' | 'lost';
export type ReturnCondition = 'ok' | 'damaged' | 'lost';

export interface EquipmentRow {
  id: string;
  name: string;
  inventoryNo: string | null;
  category: string | null;
  status: EquipmentStatus;
  note: string | null;
  /** Ochiq biriktirishdagi xodim; NULL = hech kimda. */
  holder: { id: string; name: string } | null;
  issuedAt: string | null;
}

export interface EquipmentAssignmentRow {
  id: string;
  issuedAt: string;
  issueNote: string | null;
  /** NULL = qator hamon OCHIQ (jihoz qaytarilmagan). */
  returnedAt: string | null;
  returnCondition: ReturnCondition | null;
  returnNote: string | null;
  employee: { id: string; name: string } | null;
  issuedBy: { id: string; name: string } | null;
  receivedBy: { id: string; name: string } | null;
}

export interface EquipmentDetail extends Omit<EquipmentRow, 'issuedAt'> {
  createdAt: string;
  issuedAt: string | null;
  /** APPEND-ONLY tarix — eng yangisi birinchi. Yopilgan qatorlar YO'QOLMAYDI. */
  history: EquipmentAssignmentRow[];
}

export interface EquipmentListResult {
  items: EquipmentRow[];
  total: number;
}

export const equipmentApi = {
  list: (filter: { status?: string; q?: string; employeeId?: string } = {}) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(filter)) {
      if (v) params.set(k, String(v));
    }
    const qs = params.toString();
    return api.get<EquipmentListResult>(`/hr/equipment${qs ? `?${qs}` : ''}`);
  },

  get: (id: string) => api.get<EquipmentDetail>(`/hr/equipment/${id}`),

  create: (data: { name: string; inventoryNo?: string | null; category?: string | null }) =>
    api.post<{ id: string }>('/hr/equipment', data),

  update: (
    id: string,
    data: { name?: string; inventoryNo?: string | null; category?: string | null; status?: string },
  ) => api.put<{ id: string }>(`/hr/equipment/${id}`, data),

  assign: (id: string, data: { employeeId: string; note?: string | null }) =>
    api.post<EquipmentDetail>(`/hr/equipment/${id}/assign`, data),

  returnItem: (id: string, data: { condition: ReturnCondition; note?: string | null }) =>
    api.post<EquipmentDetail>(`/hr/equipment/${id}/return`, data),
};
