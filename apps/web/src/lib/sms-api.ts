import { api } from './api-client';

export interface SmsConfig {
  id: string;
  provider: 'eskiz' | 'playmobile' | 'custom';
  email: string;
  senderId: string | null;
  hasPassword: boolean;
  enabled: boolean;
  lastTestedAt: string | null;
  lastTestOk: boolean | null;
  lastTestMsg: string | null;
}

export interface SmsContacts {
  phone: string | null;
  card: string | null;
  cardOwner: string | null;
}

export type TemplateChannel = 'sms' | 'telegram';

/** Kanal-aware xabar shabloni (MessageTemplate kutubxonasi, 2026-07-20 refaktor). */
export interface MessageTemplate {
  id: string;
  channel: TemplateChannel;
  key: string | null;
  name: string;
  body: string;
  enabled: boolean;
  isDefault: boolean;
}

export const smsApi = {
  getConfig: () => api.get<SmsConfig | null>('/sms/config'),
  saveConfig: (body: { provider: string; email: string; password?: string; senderId?: string }) =>
    api.put<SmsConfig>('/sms/config', body),
  deleteConfig: () => api.delete<{ ok: true }>('/sms/config'),
  testConfig: () => api.post<{ ok: boolean; message: string }>('/sms/config/test', {}),
  getContacts: () => api.get<SmsContacts>('/sms/contacts'),
  saveContacts: (body: SmsContacts) => api.put<SmsContacts>('/sms/contacts', body),

  /** Umumiy SMS-tarqatma — tanlangan kontragentlar + qo'lda raqamlar, shablon bilan. */
  broadcast: (body: { templateId: string; counterpartyIds: string[]; phones: string[] }) =>
    api.post<{ queued: number; skipped: Array<{ name: string; phone: string; reason: string }> }>(
      '/sms/broadcast',
      body,
    ),

  /** Bitta erkin SMS (kontragent kartochkasi «Xabar yuborish» → erkin rejim). */
  send: (body: { toPhone: string; body: string; entity?: string; entityId?: string }) =>
    api.post<{ id: string; status: string }>('/sms/send', body),

  /** SMS jurnali — kontragent bo'yicha tarix (entityId filtri, eng yangisi birinchi). */
  logs: (params: { entityId?: string; toPhone?: string; limit?: number }) => {
    const q = new URLSearchParams();
    if (params.entityId) q.set('entityId', params.entityId);
    if (params.toPhone) q.set('toPhone', params.toPhone);
    q.set('limit', String(params.limit ?? 30));
    return api.get<{ items: SmsLog[] }>(`/sms/logs?${q.toString()}`);
  },
};

/** SMS jurnal yozuvi (kontragent tarixi uchun). */
export interface SmsLog {
  id: string;
  toPhone: string;
  body: string;
  status: string; // pending | sending | sent | failed | ...
  createdAt: string;
  sentAt: string | null;
}

/** Xabar shablonlari CRUD (`/message-templates`). */
export const messageTemplateApi = {
  list: (channel?: TemplateChannel) =>
    api.get<MessageTemplate[]>(`/message-templates${channel ? `?channel=${channel}` : ''}`),
  create: (body: {
    channel: TemplateChannel;
    name: string;
    body: string;
    enabled: boolean;
    isDefault: boolean;
  }) => api.post<MessageTemplate>('/message-templates', body),
  update: (
    id: string,
    body: { name?: string; body?: string; enabled?: boolean; isDefault?: boolean },
  ) => api.put<MessageTemplate>(`/message-templates/${id}`, body),
  setDefault: (id: string) => api.put<MessageTemplate>(`/message-templates/${id}/default`, {}),
  remove: (id: string) => api.delete<{ ok: true }>(`/message-templates/${id}`),
};
