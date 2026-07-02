import { renderWithProviders, screen } from '@/test-utils';
import { CatalogPicker, CatalogPickerField, CatalogPickerLabelsProvider } from '@moysklad/ui';
/**
 * CatalogPicker / CatalogPickerField (from @moysklad/ui) i18n-default tests.
 *
 * These components shipped HARDCODED Uzbek string defaults (search/empty/
 * loading/clear/cancel/close/pick + the field placeholder) that leaked into
 * the RU UI whenever a caller omitted the matching prop — the same design-
 * system-default-leak bug-class already fixed for Modal / ConfirmDialog /
 * EditForm / PositionEditor. The fix injects RU strings at the app root via
 * <CatalogPickerLabelsProvider>; resolve order is
 * explicit-prop → injected-context → Uzbek hard fallback.
 *
 * The hard fallback is asserted with no provider; the injection + override
 * are asserted by wrapping in <CatalogPickerLabelsProvider>.
 */
import { describe, expect, it, vi } from 'vitest';

const RU = {
  searchPlaceholder: 'Поиск',
  createLabel: 'Создать',
  emptyTitle: 'Ничего не найдено',
  emptyDescription: 'Измените запрос или добавьте новую запись',
  loadingLabel: 'Загрузка...',
  clearLabel: 'Очистить',
  cancelLabel: 'Отмена',
  closeLabel: 'Закрыть',
  pickLabel: 'Выбрать',
  fieldPlaceholder: 'Выберите...',
};

const emptyFetcher = async () => [];

describe('CatalogPicker i18n defaults', () => {
  it('falls back to the Uzbek hard defaults with no provider', () => {
    renderWithProviders(
      <CatalogPicker open onClose={vi.fn()} title="T" fetcher={emptyFetcher} onSelect={vi.fn()} />,
    );
    // Close X aria, footer cancel, and empty-state title all leak Uzbek
    // without the injected provider — this is the pre-fix behaviour the
    // hard fallback preserves for tests / storybook.
    expect(screen.getByRole('button', { name: 'Yopish' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bekor qilish' })).toBeInTheDocument();
    expect(screen.getByText('Topilmadi')).toBeInTheDocument();
  });

  it('uses the injected RU defaults from CatalogPickerLabelsProvider', () => {
    renderWithProviders(
      <CatalogPickerLabelsProvider labels={RU}>
        <CatalogPicker open onClose={vi.fn()} title="T" fetcher={emptyFetcher} onSelect={vi.fn()} />
      </CatalogPickerLabelsProvider>,
    );
    expect(screen.getByRole('button', { name: 'Закрыть' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Отмена' })).toBeInTheDocument();
    expect(screen.getByText('Ничего не найдено')).toBeInTheDocument();
    expect(screen.getByText('Измените запрос или добавьте новую запись')).toBeInTheDocument();
    // No Uzbek leaks remain
    expect(screen.queryByText('Topilmadi')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Bekor qilish' })).toBeNull();
  });

  it('explicit emptyTitle prop wins over the injected default', () => {
    renderWithProviders(
      <CatalogPickerLabelsProvider labels={RU}>
        <CatalogPicker
          open
          onClose={vi.fn()}
          title="T"
          fetcher={emptyFetcher}
          onSelect={vi.fn()}
          emptyTitle="Explicit"
        />
      </CatalogPickerLabelsProvider>,
    );
    expect(screen.getByText('Explicit')).toBeInTheDocument();
    expect(screen.queryByText('Ничего не найдено')).toBeNull();
  });
});

describe('CatalogPickerField — no placeholder (moysklad parity) + i18n aria-labels', () => {
  // moysklad reference fields show NO placeholder when empty (the left label
  // names the field). The pick/clear aria-labels stay i18n-resolved.
  it('renders no placeholder and the Uzbek pick aria-label with no provider', () => {
    renderWithProviders(<CatalogPickerField value={null} onPick={vi.fn()} testId="f" />);
    expect(screen.queryByText('Tanlang...')).toBeNull();
    expect(screen.getByRole('button', { name: 'Tanlash' })).toBeInTheDocument();
  });

  it('uses the injected RU pick aria-label and still shows no placeholder', () => {
    renderWithProviders(
      <CatalogPickerLabelsProvider labels={RU}>
        <CatalogPickerField value={null} onPick={vi.fn()} onClear={vi.fn()} testId="f" />
      </CatalogPickerLabelsProvider>,
    );
    expect(screen.getByRole('button', { name: 'Выбрать' })).toBeInTheDocument();
    expect(screen.queryByText('Выберите...')).toBeNull();
    expect(screen.queryByText('Tanlang...')).toBeNull();
  });

  it('renders the injected clear aria-label when a value is set', () => {
    renderWithProviders(
      <CatalogPickerLabelsProvider labels={RU}>
        <CatalogPickerField
          value={{ id: '1', label: 'Picked' }}
          onPick={vi.fn()}
          onClear={vi.fn()}
          testId="f"
        />
      </CatalogPickerLabelsProvider>,
    );
    expect(screen.getByText('Picked')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Очистить' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tozalash' })).toBeNull();
  });

  it('does not render the placeholder prop (moysklad parity: no placeholder)', () => {
    renderWithProviders(
      <CatalogPickerField value={null} placeholder="Explicit ph" onPick={vi.fn()} testId="f" />,
    );
    expect(screen.queryByText('Explicit ph')).toBeNull();
  });
});
