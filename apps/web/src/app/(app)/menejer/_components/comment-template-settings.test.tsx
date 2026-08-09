import type { CommentTemplate } from '@/lib/comment-template-api';
import { renderWithProviders, screen, waitFor } from '@/test-utils';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommentTemplateSettings } from './comment-template-settings';

/**
 * MK20 — shablon sozlamasi ekrani.
 *
 * 🔴 Ikki shartnoma:
 *   1. shablon **arxivlanadi**, o'chirilmaydi (`DELETE` chaqirilsa ham u
 *      serverda arxivlash — ekran arxiv belgisini ko'rsatishi shart);
 *   2. matn maydoni ERKIN — hech qanday «tanlangan shablonni o'zgartirib
 *      bo'lmaydi» qulf yo'q.
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
    body: 'Bu element dublikat.',
    ruleTypes: [],
    actions: [],
    sortOrder: 0,
    usageCount: 4,
    lastUsedAt: null,
    archivedAt: null,
    ...over,
  };
}

beforeEach(() => {
  vi.mocked(api.get).mockReset();
  vi.mocked(api.post).mockReset();
  vi.mocked(api.delete).mockReset();
});

describe('CommentTemplateSettings', () => {
  it('shablon ro`yxati chiziladi (matn to`liq ko`rinadi)', async () => {
    vi.mocked(api.get).mockResolvedValue({ count: 1, templates: [tpl()] });

    renderWithProviders(<CommentTemplateSettings />);

    expect(await screen.findByText('Dublikat')).toBeInTheDocument();
    expect(screen.getByText('Bu element dublikat.')).toBeInTheDocument();
  });

  it('arxivlangan shablon BELGI bilan ko`rinadi va tiklash tugmasi beriladi', async () => {
    vi.mocked(api.get).mockResolvedValue({
      count: 1,
      templates: [tpl({ archivedAt: '2026-08-01T00:00:00.000Z' })],
    });

    renderWithProviders(<CommentTemplateSettings />);

    expect(await screen.findByTestId('comment-template-archived-tpl-1')).toBeInTheDocument();
    expect(screen.getByTestId('comment-template-restore-tpl-1')).toBeInTheDocument();
    expect(screen.queryByTestId('comment-template-archive-tpl-1')).not.toBeInTheDocument();
  });

  it('yangi shablon MATNI serverga to`liq yuboriladi', async () => {
    vi.mocked(api.get).mockResolvedValue({ count: 0, templates: [] });
    vi.mocked(api.post).mockResolvedValue(tpl());

    renderWithProviders(<CommentTemplateSettings />);

    await userEvent.click(await screen.findByTestId('comment-template-add'));
    await userEvent.type(screen.getByTestId('comment-template-title'), 'Chegirma');
    await userEvent.type(
      screen.getByTestId('comment-template-body'),
      'Chegirma menejer tomonidan tasdiqlangan.',
    );
    await userEvent.click(screen.getByTestId('comment-template-save'));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    const [, payload] = vi.mocked(api.post).mock.calls[0] as [string, Record<string, unknown>];
    expect(payload.title).toBe('Chegirma');
    expect(payload.body).toBe('Chegirma menejer tomonidan tasdiqlangan.');
  });

  it('bo`sh sarlavha/matn bilan saqlash tugmasi o`chiq (bo`sh shablon yaratilmaydi)', async () => {
    vi.mocked(api.get).mockResolvedValue({ count: 0, templates: [] });

    renderWithProviders(<CommentTemplateSettings />);

    await userEvent.click(await screen.findByTestId('comment-template-add'));
    expect(screen.getByTestId('comment-template-save')).toBeDisabled();
  });
});
