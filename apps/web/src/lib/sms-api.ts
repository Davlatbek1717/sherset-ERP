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
};

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
