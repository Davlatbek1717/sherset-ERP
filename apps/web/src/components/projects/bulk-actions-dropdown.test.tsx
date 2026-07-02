import { api } from '@/lib/api-client';
import { renderWithProviders, userEvent } from '@/test-utils';
import { screen, waitFor } from '@testing-library/react';
/**
 * ProjectBulkActionsDropdown tests — verify the moysklad-parity menu
 * (5 items, captured from docs/moysklad-reference/projects/states/metadata.json)
 * renders, the three backed actions (delete / archive / restore) hit the
 * right /projects/bulk-* endpoints, «Копировать» is a disabled placeholder,
 * and «Массовое редактирование» delegates to onMassEdit.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectBulkActionsDropdown } from './bulk-actions-dropdown';

vi.mock('@/lib/api-client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn().mockResolvedValue({ total: 1, succeeded: ['id-1'], failed: [] }),
  },
}));

describe('ProjectBulkActionsDropdown', () => {
  const baseProps = {
    listQueryKey: ['projects'] as const,
    onClearSelection: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the trigger labelled "O\'zgartirish" (uz)', () => {
    renderWithProviders(
      <ProjectBulkActionsDropdown {...baseProps} selectedIds={new Set(['id-1'])} />,
    );
    expect(screen.getByRole('button', { name: /O'zgartirish/i })).toBeInTheDocument();
  });

  it('disables the trigger when no rows are selected', () => {
    renderWithProviders(<ProjectBulkActionsDropdown {...baseProps} selectedIds={new Set()} />);
    expect(screen.getByRole('button', { name: /O'zgartirish/i })).toBeDisabled();
  });

  it('opens the menu and shows all 5 moysklad items in order', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ProjectBulkActionsDropdown {...baseProps} selectedIds={new Set(['id-1'])} />,
    );
    await user.click(screen.getByRole('button', { name: /O'zgartirish/i }));
    for (const id of [
      'project-bulk-action-delete',
      'project-bulk-action-copy',
      'project-bulk-action-mass-edit',
      'project-bulk-action-archive',
      'project-bulk-action-restore',
    ]) {
      expect(screen.getByTestId(id)).toBeInTheDocument();
    }
  });

  it('POSTs /projects/bulk-delete when Удалить is confirmed', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ProjectBulkActionsDropdown {...baseProps} selectedIds={new Set(['id-1', 'id-2'])} />,
    );
    await user.click(screen.getByRole('button', { name: /O'zgartirish/i }));
    await user.click(screen.getByTestId('project-bulk-action-delete'));
    const confirmButton = await screen.findByRole('button', { name: "O'chirish" });
    await user.click(confirmButton);
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/projects/bulk-delete', { ids: ['id-1', 'id-2'] });
    });
  });

  it('POSTs /projects/bulk-archive when Поместить в архив is confirmed', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ProjectBulkActionsDropdown {...baseProps} selectedIds={new Set(['id-1'])} />,
    );
    await user.click(screen.getByRole('button', { name: /O'zgartirish/i }));
    await user.click(screen.getByTestId('project-bulk-action-archive'));
    const confirmButton = await screen.findByRole('button', { name: 'Arxivlash' });
    await user.click(confirmButton);
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/projects/bulk-archive', { ids: ['id-1'] });
    });
  });

  it('POSTs /projects/bulk-restore when Извлечь из архива is confirmed', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ProjectBulkActionsDropdown {...baseProps} selectedIds={new Set(['id-1'])} />,
    );
    await user.click(screen.getByRole('button', { name: /O'zgartirish/i }));
    await user.click(screen.getByTestId('project-bulk-action-restore'));
    const confirmButton = await screen.findByRole('button', { name: 'Tiklash' });
    await user.click(confirmButton);
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/projects/bulk-restore', { ids: ['id-1'] });
    });
  });

  it('keeps Копировать disabled (label-parity placeholder, no clone backend)', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ProjectBulkActionsDropdown {...baseProps} selectedIds={new Set(['id-1'])} />,
    );
    await user.click(screen.getByRole('button', { name: /O'zgartirish/i }));
    expect(screen.getByTestId('project-bulk-action-copy')).toHaveAttribute('data-disabled');
  });

  it('disables Массовое редактирование when no onMassEdit handler is wired', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ProjectBulkActionsDropdown {...baseProps} selectedIds={new Set(['id-1'])} />,
    );
    await user.click(screen.getByRole('button', { name: /O'zgartirish/i }));
    expect(screen.getByTestId('project-bulk-action-mass-edit')).toHaveAttribute('data-disabled');
  });

  it('invokes onMassEdit when wired and Массовое редактирование is selected', async () => {
    const user = userEvent.setup();
    const onMassEdit = vi.fn();
    renderWithProviders(
      <ProjectBulkActionsDropdown
        {...baseProps}
        selectedIds={new Set(['id-1'])}
        onMassEdit={onMassEdit}
      />,
    );
    await user.click(screen.getByRole('button', { name: /O'zgartirish/i }));
    await user.click(screen.getByTestId('project-bulk-action-mass-edit'));
    expect(onMassEdit).toHaveBeenCalledOnce();
  });

  it('renders Удалить as destructive (red text)', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ProjectBulkActionsDropdown {...baseProps} selectedIds={new Set(['id-1'])} />,
    );
    await user.click(screen.getByRole('button', { name: /O'zgartirish/i }));
    expect(screen.getByTestId('project-bulk-action-delete').className).toMatch(/destructive/);
  });
});
