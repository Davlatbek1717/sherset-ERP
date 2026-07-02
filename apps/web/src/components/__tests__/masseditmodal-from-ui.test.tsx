import { renderWithProviders, screen, userEvent } from '@/test-utils';
import { MassEditModal } from '@moysklad/ui';
/**
 * MassEditModal (from @moysklad/ui) tests — moysklad-style "Изменить"
 * mass-edit dialog. Each row is opt-in: the user ticks a row, fills
 * the field, and only ticked rows land in the submit patch. Tests
 * guard the toggle / opt-in contract that keeps the patch from
 * silently overwriting fields the user didn't intend to change.
 */
import { describe, expect, it, vi } from 'vitest';

const baseLabels = {
  title: 'Изменить',
  ownerLabel: 'Masʼul',
  projectLabel: 'Loyiha',
  descriptionLabel: 'Izoh',
  apply: 'Qoʼllash',
  cancel: 'Bekor',
};

function renderModal(overrides: Partial<Parameters<typeof MassEditModal>[0]> = {}) {
  const onSubmit = vi.fn();
  const onOpenChange = vi.fn();
  renderWithProviders(
    <MassEditModal
      open
      onOpenChange={onOpenChange}
      selectedCount={3}
      onSubmit={onSubmit}
      ownerValue={null}
      onOwnerPick={vi.fn()}
      onOwnerClear={vi.fn()}
      projectValue={null}
      onProjectPick={vi.fn()}
      onProjectClear={vi.fn()}
      labels={baseLabels}
      {...overrides}
    />,
  );
  return { onSubmit, onOpenChange };
}

describe('MassEditModal', () => {
  it('renders three opt-in rows (owner, project, description)', () => {
    renderModal();
    expect(screen.getByTestId('mass-edit-modal-row-owner')).toBeInTheDocument();
    expect(screen.getByTestId('mass-edit-modal-row-project')).toBeInTheDocument();
    expect(screen.getByTestId('mass-edit-modal-row-description')).toBeInTheDocument();
  });

  it('disables apply until at least one row is ticked', () => {
    renderModal();
    expect(screen.getByTestId('mass-edit-modal-apply')).toBeDisabled();
  });

  it('enables apply once a row is ticked', async () => {
    renderModal();
    const user = userEvent.setup();
    await user.click(screen.getByTestId('mass-edit-modal-row-description-toggle'));
    expect(screen.getByTestId('mass-edit-modal-apply')).not.toBeDisabled();
  });

  it('submit forwards only ticked fields with explicit null when blank', async () => {
    const { onSubmit } = renderModal();
    const user = userEvent.setup();
    await user.click(screen.getByTestId('mass-edit-modal-row-description-toggle'));
    await user.click(screen.getByTestId('mass-edit-modal-apply'));
    expect(onSubmit).toHaveBeenCalledWith({ description: null });
  });

  it('submit forwards owner id when the owner row is ticked + picker has value', async () => {
    const { onSubmit } = renderModal({
      ownerValue: { id: 'owner-42', label: 'Anvar' },
    });
    const user = userEvent.setup();
    await user.click(screen.getByTestId('mass-edit-modal-row-owner-toggle'));
    await user.click(screen.getByTestId('mass-edit-modal-apply'));
    expect(onSubmit).toHaveBeenCalledWith({ ownerId: 'owner-42' });
  });

  it('submit forwards null for ticked owner with no picker selection (clear-on-submit)', async () => {
    const { onSubmit } = renderModal({ ownerValue: null });
    const user = userEvent.setup();
    await user.click(screen.getByTestId('mass-edit-modal-row-owner-toggle'));
    await user.click(screen.getByTestId('mass-edit-modal-apply'));
    expect(onSubmit).toHaveBeenCalledWith({ ownerId: null });
  });

  it('cancel button calls onOpenChange(false) without invoking onSubmit', async () => {
    const { onSubmit, onOpenChange } = renderModal();
    const user = userEvent.setup();
    await user.click(screen.getByText(baseLabels.cancel));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
