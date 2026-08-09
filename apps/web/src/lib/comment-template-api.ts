/**
 * MK20 / 4M TZ §8.1/6 — shablon izohlar API client.
 *
 * 🔴 Ekran shablon tanlaganda jurnalga **matn** ketadi: `templateId` faqat
 * «qaysi shablon ishlatildi» statistikasi uchun uzatiladi, jurnal esa matnning
 * NUSXASINI saqlaydi (BE `comment-templates.ts`). Shuning uchun bu yerda
 * hech qanday «shablonni keyin o'qib olamiz» yo'li yo'q — matn har doim
 * so'rov tanasida ketadi.
 */

import { api } from './api-client';

export type CommentTemplateKind = 'rejection' | 'correction' | 'warning';

export interface CommentTemplate {
  id: string;
  kind: CommentTemplateKind;
  locale: string;
  title: string;
  body: string;
  ruleTypes: string[];
  actions: string[];
  sortOrder: number;
  usageCount: number;
  lastUsedAt: string | null;
  archivedAt: string | null;
  createdBy?: { id: string; name: string } | null;
}

export interface CommentTemplateListResponse {
  count: number;
  templates: CommentTemplate[];
}

export interface CommentTemplateSuggestResponse extends CommentTemplateListResponse {
  /** Turlar/amallar BE dan keladi — ekran o'z nusxasini saqlamaydi (MK07 sabog'i). */
  kinds: CommentTemplateKind[];
  actions: string[];
}

export interface CommentTemplateInput {
  kind: CommentTemplateKind;
  locale: string;
  title: string;
  body: string;
  ruleTypes?: string[];
  actions?: string[];
  sortOrder?: number;
}

const BASE = '/manager/comment-templates';

export const commentTemplateApi = {
  list: (params: { kind?: string; includeArchived?: boolean } = {}) => {
    const q = new URLSearchParams();
    if (params.kind) q.set('kind', params.kind);
    if (params.includeArchived) q.set('includeArchived', 'true');
    const qs = q.toString();
    return api.get<CommentTemplateListResponse>(`${BASE}${qs ? `?${qs}` : ''}`);
  },

  suggest: (params: { action?: string; ruleType?: string; locale?: string } = {}) => {
    const q = new URLSearchParams();
    if (params.action) q.set('action', params.action);
    if (params.ruleType) q.set('ruleType', params.ruleType);
    if (params.locale) q.set('locale', params.locale);
    const qs = q.toString();
    return api.get<CommentTemplateSuggestResponse>(`${BASE}/suggest${qs ? `?${qs}` : ''}`);
  },

  create: (input: CommentTemplateInput) => api.post<CommentTemplate>(BASE, input),

  update: (id: string, patch: Partial<CommentTemplateInput>) =>
    api.patch<CommentTemplate>(`${BASE}/${id}`, patch),

  /** ARXIVLASH — qator o'chirilmaydi. */
  archive: (id: string) => api.delete<CommentTemplate>(`${BASE}/${id}`),

  restore: (id: string) => api.post<CommentTemplate>(`${BASE}/${id}/restore`, {}),
};
