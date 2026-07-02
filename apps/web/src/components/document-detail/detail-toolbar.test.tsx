import { renderWithProviders, userEvent } from '@/test-utils';
import { screen } from '@testing-library/react';
import type { FormEvent } from 'react';
/**
 * DetailToolbar tests — verify the moysklad-parity toolbar renders
 * Save / Close / position counter / 4 dropdowns, with the createMenuItems
 * array driving the "Создать документ" entries (entity-specific).
 */
import { describe, expect, it, vi } from 'vitest';
import { DetailToolbar } from './detail-toolbar';

describe('DetailToolbar', () => {
  const baseProps = {
    isDirty: false,
    isSaving: false,
    onSave: vi.fn(),
    onClose: vi.fn(),
  };

  it('renders Save and Close buttons', () => {
    renderWithProviders(<DetailToolbar {...baseProps} />);
    expect(screen.getByTestId('detail-toolbar-save')).toBeInTheDocument();
    expect(screen.getByTestId('detail-toolbar-close')).toBeInTheDocument();
  });

  it('disables Save when not dirty', () => {
    renderWithProviders(<DetailToolbar {...baseProps} isDirty={false} />);
    expect(screen.getByTestId('detail-toolbar-save')).toBeDisabled();
  });

  it('enables Save when dirty', () => {
    renderWithProviders(<DetailToolbar {...baseProps} isDirty={true} />);
    expect(screen.getByTestId('detail-toolbar-save')).not.toBeDisabled();
  });

  it('shows position counter when provided', () => {
    renderWithProviders(<DetailToolbar {...baseProps} position={{ current: 5, total: 100 }} />);
    expect(screen.getByTestId('detail-toolbar-position')).toBeInTheDocument();
    // toolbar.pager = «{current} из {total}» (moysklad record-nav format).
    expect(screen.getByText(/5 из 100/)).toBeInTheDocument();
  });

  it('renders 3 dropdowns when createMenuItems is empty', () => {
    renderWithProviders(<DetailToolbar {...baseProps} />);
    expect(screen.getByTestId('detail-toolbar-edit-trigger')).toBeInTheDocument();
    expect(screen.queryByTestId('detail-toolbar-create-trigger')).toBeNull();
    expect(screen.getByTestId('detail-toolbar-print-trigger')).toBeInTheDocument();
    expect(screen.getByTestId('detail-toolbar-send-trigger')).toBeInTheDocument();
  });

  it('renders the create dropdown when createMenuItems is non-empty', () => {
    renderWithProviders(
      <DetailToolbar
        {...baseProps}
        createMenuItems={[
          { id: 'demand', label: 'Отгрузки', onSelect: vi.fn() },
          { id: 'invoice-out', label: 'Счёт', onSelect: vi.fn() },
        ]}
      />,
    );
    expect(screen.getByTestId('detail-toolbar-create-trigger')).toBeInTheDocument();
  });

  it('disables a create-menu item when its onSelect is undefined', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <DetailToolbar
        {...baseProps}
        createMenuItems={[
          { id: 'demand', label: 'Отгрузки', onSelect: undefined },
          { id: 'invoice-out', label: 'Счёт', onSelect: vi.fn() },
        ]}
      />,
    );
    await user.click(screen.getByTestId('detail-toolbar-create-trigger'));
    expect(screen.getByTestId('detail-toolbar-create-demand')).toHaveAttribute('data-disabled');
    expect(screen.getByTestId('detail-toolbar-create-invoice-out')).not.toHaveAttribute(
      'data-disabled',
    );
  });

  it('disables a create-menu item when its disabled flag is true', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <DetailToolbar
        {...baseProps}
        createMenuItems={[{ id: 'demand', label: 'Отгрузки', onSelect: vi.fn(), disabled: true }]}
      />,
    );
    await user.click(screen.getByTestId('detail-toolbar-create-trigger'));
    expect(screen.getByTestId('detail-toolbar-create-demand')).toHaveAttribute('data-disabled');
  });

  it('fires the create-menu onSelect when a non-disabled item is clicked', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <DetailToolbar
        {...baseProps}
        createMenuItems={[{ id: 'demand', label: 'Отгрузки', onSelect }]}
      />,
    );
    await user.click(screen.getByTestId('detail-toolbar-create-trigger'));
    await user.click(screen.getByTestId('detail-toolbar-create-demand'));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  describe('«Печать» menu — printMenuItems override (moysklad dynamic menu)', () => {
    it('renders the provided items and drops the default «Бланк документа» item', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <DetailToolbar
          {...baseProps}
          printMenuItems={[
            { id: 'form-abc', label: 'Climart Приход', onSelect: vi.fn() },
            { id: 'standard', label: 'Заказ поставщику', onSelect: vi.fn() },
            { id: 'set', label: 'Комплект…', onSelect: vi.fn() },
            { id: 'configure', label: 'Настроить...', onSelect: vi.fn() },
          ]}
        />,
      );
      await user.click(screen.getByTestId('detail-toolbar-print-trigger'));
      // The account form is listed by name; the default fallback item is gone.
      expect(screen.getByTestId('detail-toolbar-print-form-abc')).toBeInTheDocument();
      expect(screen.getByTestId('detail-toolbar-print-set')).toBeInTheDocument();
      expect(screen.getByTestId('detail-toolbar-print-configure')).toBeInTheDocument();
      expect(screen.queryByTestId('detail-toolbar-print-pdf')).toBeNull();
    });

    it('fires a print item onSelect when clicked', async () => {
      const onSelect = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(
        <DetailToolbar
          {...baseProps}
          printMenuItems={[{ id: 'set', label: 'Комплект…', onSelect }]}
        />,
      );
      await user.click(screen.getByTestId('detail-toolbar-print-trigger'));
      await user.click(screen.getByTestId('detail-toolbar-print-set'));
      expect(onSelect).toHaveBeenCalledTimes(1);
    });
  });

  describe('«Отправить» menu — sendMenuItems override (forms to email)', () => {
    it('renders the provided items and drops the default «По электронной почте» item', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <DetailToolbar
          {...baseProps}
          sendMenuItems={[
            { id: 'form-abc', label: 'Climart Приход', onSelect: vi.fn() },
            { id: 'standard', label: 'Заказ поставщику', onSelect: vi.fn() },
          ]}
        />,
      );
      await user.click(screen.getByTestId('detail-toolbar-send-trigger'));
      expect(screen.getByTestId('detail-toolbar-send-form-abc')).toBeInTheDocument();
      expect(screen.getByTestId('detail-toolbar-send-standard')).toBeInTheDocument();
      expect(screen.queryByTestId('detail-toolbar-send-email')).toBeNull();
    });

    it('fires a send item onSelect when clicked', async () => {
      const onSelect = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(
        <DetailToolbar
          {...baseProps}
          sendMenuItems={[{ id: 'standard', label: 'Заказ поставщику', onSelect }]}
        />,
      );
      await user.click(screen.getByTestId('detail-toolbar-send-trigger'));
      await user.click(screen.getByTestId('detail-toolbar-send-standard'));
      expect(onSelect).toHaveBeenCalledTimes(1);
    });
  });

  it('fires onSave when Save is clicked', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<DetailToolbar {...baseProps} isDirty={true} onSave={onSave} />);
    await user.click(screen.getByTestId('detail-toolbar-save'));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('fires onClose when Close is clicked on a clean form', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<DetailToolbar {...baseProps} onClose={onClose} />);
    await user.click(screen.getByTestId('detail-toolbar-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // Regression guard for the Phase-2 double-create bug: the create pages
  // (products/new, bundles/new, …) wrap the toolbar in <form onSubmit={save}>.
  // If Save/Close default to type="submit", a single click fires BOTH onClick
  // AND the native form submit → the create mutation runs twice → duplicate
  // documents. type="button" makes them pure onClick actions.
  it('Save and Close are type="button" (never implicitly submit a parent form)', () => {
    renderWithProviders(<DetailToolbar {...baseProps} isDirty={true} />);
    expect(screen.getByTestId('detail-toolbar-save')).toHaveAttribute('type', 'button');
    expect(screen.getByTestId('detail-toolbar-close')).toHaveAttribute('type', 'button');
  });

  it('clicking Save inside a <form> does NOT submit the form (no double-create)', async () => {
    const onSave = vi.fn();
    const onSubmit = vi.fn((e: FormEvent) => e.preventDefault());
    const user = userEvent.setup();
    renderWithProviders(
      <form onSubmit={onSubmit}>
        <DetailToolbar {...baseProps} isDirty={true} onSave={onSave} />
      </form>,
    );
    await user.click(screen.getByTestId('detail-toolbar-save'));
    expect(onSave).toHaveBeenCalledTimes(1);
    // The form must NOT receive a submit event from the Save click — otherwise
    // the page's onSubmit save path fires too and the document is created twice.
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('disables Delete when document is locked (onDelete undefined)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DetailToolbar {...baseProps} />);
    await user.click(screen.getByTestId('detail-toolbar-edit-trigger'));
    expect(screen.getByTestId('detail-toolbar-delete')).toHaveAttribute('data-disabled');
  });

  it('renders Delete as destructive', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DetailToolbar {...baseProps} onDelete={vi.fn()} />);
    await user.click(screen.getByTestId('detail-toolbar-edit-trigger'));
    const del = screen.getByTestId('detail-toolbar-delete');
    expect(del.className).toMatch(/destructive/);
  });

  describe('"API\'da ochish" — moysklad raw JSON viewer', () => {
    it('disables the API menu item when apiData is undefined', async () => {
      const user = userEvent.setup();
      renderWithProviders(<DetailToolbar {...baseProps} />);
      await user.click(screen.getByTestId('detail-toolbar-edit-trigger'));
      expect(screen.getByTestId('detail-toolbar-open-api')).toHaveAttribute('data-disabled');
    });

    it('enables the API menu item when apiData is provided', async () => {
      const user = userEvent.setup();
      renderWithProviders(<DetailToolbar {...baseProps} apiData={{ id: 'doc-1', name: 'Demo' }} />);
      await user.click(screen.getByTestId('detail-toolbar-edit-trigger'));
      expect(screen.getByTestId('detail-toolbar-open-api')).not.toHaveAttribute('data-disabled');
    });

    it('renders the JsonViewer modal with the formatted document on click', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <DetailToolbar
          {...baseProps}
          apiData={{ id: 'doc-1', name: 'Demo', sumMinor: '1500000' }}
        />,
      );
      await user.click(screen.getByTestId('detail-toolbar-edit-trigger'));
      await user.click(screen.getByTestId('detail-toolbar-open-api'));

      const body = await screen.findByTestId('json-viewer-body');
      expect(body.textContent).toContain('"id": "doc-1"');
      expect(body.textContent).toContain('"name": "Demo"');
      expect(body.textContent).toContain('"sumMinor": "1500000"');
    });

    it('treats null and empty objects as defined apiData (still enables the item)', async () => {
      const user = userEvent.setup();
      renderWithProviders(<DetailToolbar {...baseProps} apiData={null} />);
      await user.click(screen.getByTestId('detail-toolbar-edit-trigger'));
      expect(screen.getByTestId('detail-toolbar-open-api')).not.toHaveAttribute('data-disabled');
    });
  });

  // moysklad's product-card «...» menu (opt-in props): a three-dot trigger, an
  // archive/restore item between Копировать and Удалить, and no «Открыть в API».
  describe('product-card «...» menu (opt-in)', () => {
    it('hideOpenApi removes the API item from the menu', async () => {
      const user = userEvent.setup();
      renderWithProviders(<DetailToolbar {...baseProps} hideOpenApi onClone={vi.fn()} />);
      await user.click(screen.getByTestId('detail-toolbar-edit-trigger'));
      expect(screen.queryByTestId('detail-toolbar-open-api')).toBeNull();
    });

    it('renders no archive item when neither onArchive nor onRestore is given', async () => {
      const user = userEvent.setup();
      renderWithProviders(<DetailToolbar {...baseProps} onClone={vi.fn()} />);
      await user.click(screen.getByTestId('detail-toolbar-edit-trigger'));
      expect(screen.queryByTestId('detail-toolbar-archive')).toBeNull();
    });

    it('shows «archive» and fires onArchive when not archived', async () => {
      const onArchive = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(
        <DetailToolbar
          {...baseProps}
          editMenuStyle="dots"
          archived={false}
          onArchive={onArchive}
          onRestore={vi.fn()}
        />,
      );
      await user.click(screen.getByTestId('detail-toolbar-edit-trigger'));
      await user.click(screen.getByTestId('detail-toolbar-archive'));
      expect(onArchive).toHaveBeenCalledTimes(1);
    });

    it('shows «restore» and fires onRestore when archived', async () => {
      const onRestore = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(
        <DetailToolbar
          {...baseProps}
          editMenuStyle="dots"
          archived
          onArchive={vi.fn()}
          onRestore={onRestore}
        />,
      );
      await user.click(screen.getByTestId('detail-toolbar-edit-trigger'));
      await user.click(screen.getByTestId('detail-toolbar-archive'));
      expect(onRestore).toHaveBeenCalledTimes(1);
    });
  });
});
