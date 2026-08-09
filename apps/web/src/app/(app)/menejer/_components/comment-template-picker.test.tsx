import type { CommentTemplate, CommentTemplateSuggestResponse } from '@/lib/comment-template-api';
import { renderWithProviders, screen, waitFor } from '@/test-utils';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommentTemplatePicker } from './comment-template-picker';

/**
 * MK20 — shablon tanlagichi (4M TZ §8.1/6).
 *
 * 🔴 EKRAN SHARTNOMASI: shablon **taklif**, buyruq emas. Tanlangach matn
 * izoh maydoniga TUSHADI va o'sha yerda tahrirlanadi; hech qanday amal
 * bloklanmaydi va izoh majburiy bo'lib qolmaydi.
 *
 * Ikkinchi qulf: taklif so'rovi KONTEKST bilan ketadi (amal + qoida) — aks
 * holda menejer «rad etish» oynasida ogohlantirish shablonlarini ko'rardi.
 */

vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const { api } = await import('@/lib/api-client');

function tpl(over: Partial<CommentTemplate> = {}): CommentTemplate {
  return {
    id: 'tpl-1',
    kind: 'rejection',
    locale: 'uz',
    title: 'Dublikat',
    body: 'Bu element dublikat — hodisa allaqachon ko`rilgan.',
    ruleTypes: [],
    actions: [],
    sortOrder: 0,
    usageCount: 0,
    lastUsedAt: null,
    archivedAt: null,
    ...over,
  };
}

function suggestResponse(templates: CommentTemplate[]): CommentTemplateSuggestResponse {
  return { count: templates.length, templates, kinds: ['rejection'], actions: ['dismiss'] };
}

beforeEach(() => {
  vi.mocked(api.get).mockReset();
});

describe('CommentTemplatePicker', () => {
  it('taklif so`rovi KONTEKST bilan ketadi (amal + qoida)', async () => {
    vi.mocked(api.get).mockResolvedValue(suggestResponse([tpl()]));

    renderWithProviders(
      <CommentTemplatePicker action="dismiss" ruleType="BIG_DEBT" onPick={vi.fn()} />,
    );

    await waitFor(() => expect(api.get).toHaveBeenCalled());
    const url = vi.mocked(api.get).mock.calls[0]?.[0] as string;
    expect(url).toContain('action=dismiss');
    expect(url).toContain('ruleType=BIG_DEBT');
  });

  it('shablon tanlansa MATN uzatiladi (id bilan birga — statistika uchun)', async () => {
    const template = tpl();
    vi.mocked(api.get).mockResolvedValue(suggestResponse([template]));
    const onPick = vi.fn();

    renderWithProviders(<CommentTemplatePicker action="dismiss" onPick={onPick} />);

    const select = await screen.findByTestId('comment-template-picker');
    await userEvent.selectOptions(select, template.id);

    expect(onPick).toHaveBeenCalledWith({ templateId: template.id, text: template.body });
  });

  it('tanlov bekor qilinsa havola ham, matn ham tozalanadi', async () => {
    const template = tpl();
    vi.mocked(api.get).mockResolvedValue(suggestResponse([template]));
    const onPick = vi.fn();

    renderWithProviders(<CommentTemplatePicker action="dismiss" onPick={onPick} />);

    const select = await screen.findByTestId('comment-template-picker');
    await userEvent.selectOptions(select, template.id);
    await userEvent.selectOptions(select, '');

    expect(onPick).toHaveBeenLastCalledWith({ templateId: null, text: null });
  });

  it('shablon yo`q bo`lsa tanlagich UMUMAN ko`rinmaydi (bo`sh ro`yxat chalg`itmasin)', async () => {
    vi.mocked(api.get).mockResolvedValue(suggestResponse([]));

    renderWithProviders(<CommentTemplatePicker action="dismiss" onPick={vi.fn()} />);

    await waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(screen.queryByTestId('comment-template-picker')).not.toBeInTheDocument();
  });
});
