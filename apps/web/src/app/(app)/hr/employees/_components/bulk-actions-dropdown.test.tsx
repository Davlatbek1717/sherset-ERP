import { renderWithProviders, userEvent } from '@/test-utils';
import { screen } from '@testing-library/react';
/**
 * EmployeeBulkActionsDropdown tests — moysklad #employee «Изменить» parity.
 * Source-of-truth: docs/moysklad-reference/employees/states/03-edit-dropdown.png
 * + metadata.json — exactly 3 items: Удалить, Поместить в архив, Извлечь из архива.
 */
import { describe, expect, it } from 'vitest';
import { EmployeeBulkActionsDropdown } from './bulk-actions-dropdown';

const ID = '11111111-1111-1111-1111-111111111111';

describe('EmployeeBulkActionsDropdown', () => {
  it('trigger is disabled with no selection', () => {
    renderWithProviders(
      <EmployeeBulkActionsDropdown
        selectedIds={new Set()}
        archivedView={false}
        onClearSelection={() => {}}
      />,
    );
    // uz bulk_actions.trigger = "O'zgartirish"
    expect(screen.getByRole('button', { name: /O'zgartirish/i })).toBeDisabled();
  });

  it('renders exactly the 3 moysklad-parity items in captured order', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <EmployeeBulkActionsDropdown
        selectedIds={new Set([ID])}
        archivedView={false}
        onClearSelection={() => {}}
      />,
    );
    await user.click(screen.getByRole('button', { name: /O'zgartirish/i }));

    const del = screen.getByTestId('employee-bulk-action-delete');
    const archive = screen.getByTestId('employee-bulk-action-archive');
    const restore = screen.getByTestId('employee-bulk-action-restore');
    for (const el of [del, archive, restore]) expect(el).toBeInTheDocument();

    // moysklad order: Удалить → Поместить в архив → Извлечь из архива.
    expect(del.compareDocumentPosition(archive) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(
      archive.compareDocumentPosition(restore) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    // No copy / mass-edit / merge / move (thinner than products/counterparties).
    expect(screen.queryByTestId('employee-bulk-action-copy')).not.toBeInTheDocument();
    expect(screen.queryByTestId('employee-bulk-action-mass-edit')).not.toBeInTheDocument();
  });

  it('active view enables archive, disables restore (moysklad context-aware)', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <EmployeeBulkActionsDropdown
        selectedIds={new Set([ID])}
        archivedView={false}
        onClearSelection={() => {}}
      />,
    );
    await user.click(screen.getByRole('button', { name: /O'zgartirish/i }));
    expect(screen.getByTestId('employee-bulk-action-archive')).not.toHaveAttribute('data-disabled');
    expect(screen.getByTestId('employee-bulk-action-restore')).toHaveAttribute('data-disabled');
  });

  it('archived view enables restore, disables archive (moysklad context-aware)', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <EmployeeBulkActionsDropdown
        selectedIds={new Set([ID])}
        archivedView={true}
        onClearSelection={() => {}}
      />,
    );
    await user.click(screen.getByRole('button', { name: /O'zgartirish/i }));
    expect(screen.getByTestId('employee-bulk-action-restore')).not.toHaveAttribute('data-disabled');
    expect(screen.getByTestId('employee-bulk-action-archive')).toHaveAttribute('data-disabled');
  });
});
