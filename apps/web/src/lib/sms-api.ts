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

export interface SmsTemplate {
  id: string;
  key: string;
  name: string;
  body: string;
  enabled: boolean;
}

export const smsApi = {
  getConfig: () => api.get<SmsConfig | null>('/sms/config'),
  saveConfig: (body: { provider: string; email: string; password?: string; senderId?: string }) =>
    api.put<SmsConfig>('/sms/config', body),
  deleteConfig: () => api.delete<{ ok: true }>('/sms/config'),
  testConfig: () => api.post<{ ok: boolean; message: string }>('/sms/config/test', {}),
  getContacts: () => api.get<SmsContacts>('/sms/contacts'),
  saveContacts: (body: SmsContacts) => api.put<SmsContacts>('/sms/contacts', body),
  listTemplates: () => api.get<SmsTemplate[]>('/sms/templates'),
  saveTemplate: (key: string, body: { name: string; body: string; enabled: boolean }) =>
    api.put<SmsTemplate>(`/sms/templates/${key}`, body),
};
