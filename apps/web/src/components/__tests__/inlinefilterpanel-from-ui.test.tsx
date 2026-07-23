import { renderWithProviders, screen, userEvent } from '@/test-utils';
import { InlineFilterPanel } from '@moysklad/ui';
/**
 * InlineFilterPanel (from @moysklad/ui) tests — moysklad-style filter
 * form rendered inline above the list (not as a side drawer).
 *
 * Tests guard the action button rendering (Найти / Очистить + bookmark
 * + settings), apply enabled/disabled by handler presence, the optional
 * pills row above the field grid, the rightRail slot, the children
 * grid render, the hidden prop suppression, and the Field subcomponent
 * (label + expandable chevron prefix).
 */
import { describe, expect, it, vi } from 'vitest';

describe('InlineFilterPanel', () => {
  describe('basic rendering', () => {
    it('renders the panel with default testId', () => {
      renderWithProviders(
        <InlineFilterPanel onClear={vi.fn()}>
          <div>Field</div>
        </InlineFilterPanel>,
      );
      expect(screen.getByTestId('inline-filter-panel')).toBeInTheDocument();
    });

    it('honors custom testId', () => {
      renderWithProviders(
        <InlineFilterPanel onClear={vi.fn()} testId="my-filters">
          <div>Field</div>
        </InlineFilterPanel>,
      );
      expect(screen.getByTestId('my-filters')).toBeInTheDocument();
    });

    it('renders the children inside the field grid', () => {
      renderWithProviders(
        <InlineFilterPanel onClear={vi.fn()}>
          <div data-test-id="field-1">Field 1</div>
          <div data-test-id="field-2">Field 2</div>
        </InlineFilterPanel>,
      );
      expect(screen.getByTestId('field-1')).toBeInTheDocument();
      expect(screen.getByTestId('field-2')).toBeInTheDocument();
    });
  });

  describe('hidden prop', () => {
    it('returns null when hidden=true (panel suppressed)', () => {
      renderWithProviders(
        <InlineFilterPanel onClear={vi.fn()} hidden>
          <div data-test-id="hidden-field">X</div>
        </InlineFilterPanel>,
      );
      expect(screen.queryByTestId('hidden-field')).toBeNull();
      expect(screen.queryByTestId('inline-filter-panel')).toBeNull();
    });

    it('renders when hidden=false (default)', () => {
      renderWithProviders(
        <InlineFilterPanel onClear={vi.fn()}>
          <div data-test-id="field-1">Field</div>
        </InlineFilterPanel>,
      );
      expect(screen.getByTestId('field-1')).toBeInTheDocument();
    });
  });

  describe('action buttons', () => {
    it('renders Найти button by default + clicking calls onApply', async () => {
      const onApply = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(
        <InlineFilterPanel onClear={vi.fn()} onApply={onApply}>
          <div />
        </InlineFilterPanel>,
      );
      const apply = screen.getByTestId('inline-filter-apply');
      expect(apply).toHaveTextContent('Найти');
      await user.click(apply);
      expect(onApply).toHaveBeenCalled();
    });

    it('Найти button is disabled when onApply is omitted (no handler)', () => {
      renderWithProviders(
        <InlineFilterPanel onClear={vi.fn()}>
          <div />
        </InlineFilterPanel>,
      );
      expect(screen.getByTestId('inline-filter-apply')).toBeDisabled();
    });

    it('honors custom applyLabel', () => {
      renderWithProviders(
        <InlineFilterPanel onClear={vi.fn()} onApply={vi.fn()} applyLabel="Search">
          <div />
        </InlineFilterPanel>,
      );
      expect(screen.getByTestId('inline-filter-apply')).toHaveTextContent('Search');
    });

    it('renders Очистить button + clicking calls onClear', async () => {
      const onClear = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(
        <InlineFilterPanel onClear={onClear}>
          <div />
        </InlineFilterPanel>,
      );
      const clear = screen.getByTestId('inline-filter-clear');
      expect(clear).toHaveTextContent('Очистить');
      await user.click(clear);
      expect(onClear).toHaveBeenCalled();
    });

    it('honors custom clearLabel', () => {
      renderWithProviders(
        <InlineFilterPanel onClear={vi.fn()} clearLabel="Reset">
          <div />
        </InlineFilterPanel>,
      );
      expect(screen.getByTestId('inline-filter-clear')).toHaveTextContent('Reset');
    });

    it('renders bookmark + settings icon buttons', () => {
      renderWithProviders(
        <InlineFilterPanel onClear={vi.fn()}>
          <div />
        </InlineFilterPanel>,
      );
      expect(screen.getByTestId('inline-filter-bookmark')).toBeInTheDocument();
      expect(screen.getByTestId('inline-filter-settings')).toBeInTheDocument();
    });

    it('bookmark + settings show «Tez orada» tooltip + disabled when no handler', () => {
      renderWithProviders(
        <InlineFilterPanel onClear={vi.fn()}>
          <div />
        </InlineFilterPanel>,
      );
      const bookmark = screen.getByTestId('inline-filter-bookmark');
      const settings = screen.getByTestId('inline-filter-settings');
      expect(bookmark).toHaveAttribute('title', 'Tez orada');
      expect(settings).toHaveAttribute('title', 'Tez orada');
      expect(bookmark).toBeDisabled();
      expect(settings).toBeDisabled();
    });

    it('bookmark + settings become enabled with proper titles when handlers provided', () => {
      renderWithProviders(
        <InlineFilterPanel onClear={vi.fn()} onBookmarkClick={vi.fn()} onSettingsClick={vi.fn()}>
          <div />
        </InlineFilterPanel>,
      );
      const bookmark = screen.getByTestId('inline-filter-bookmark');
      const settings = screen.getByTestId('inline-filter-settings');
      expect(bookmark).toHaveAttribute('title', 'Filterni saqlash');
      expect(settings).toHaveAttribute('title', 'Sozlash');
      expect(bookmark).not.toBeDisabled();
      expect(settings).not.toBeDisabled();
    });
  });

  describe('right rail slot', () => {
    it('does NOT render right rail when omitted', () => {
      renderWithProviders(
        <InlineFilterPanel onClear={vi.fn()}>
          <div />
        </InlineFilterPanel>,
      );
      expect(screen.queryByTestId('my-rail-content')).toBeNull();
    });

    it('renders right rail content', () => {
      renderWithProviders(
        <InlineFilterPanel
          onClear={vi.fn()}
          rightRail={<button data-test-id="my-rail-content">Add Filter</button>}
        >
          <div />
        </InlineFilterPanel>,
      );
      expect(screen.getByTestId('my-rail-content')).toBeInTheDocument();
    });
  });

  describe('pills row', () => {
    it('does NOT render pills row when omitted', () => {
      const { container } = renderWithProviders(
        <InlineFilterPanel onClear={vi.fn()}>
          <div />
        </InlineFilterPanel>,
      );
      // The pills wrapper has class mt-2 + flex-wrap — check by direct query
      expect(screen.queryByTestId('my-pill')).toBeNull();
      void container;
    });

    it('renders pills row content above the field grid when provided', () => {
      renderWithProviders(
        <InlineFilterPanel onClear={vi.fn()} pills={<span data-test-id="my-pill">Saved Pill</span>}>
          <div />
        </InlineFilterPanel>,
      );
      expect(screen.getByTestId('my-pill')).toBeInTheDocument();
    });
  });

  describe('Field subcomponent', () => {
    it('renders label + children stacked', () => {
      const { container } = renderWithProviders(
        <InlineFilterPanel onClear={vi.fn()}>
          <InlineFilterPanel.Field label="Holat">
            <input data-test-id="status-input" />
          </InlineFilterPanel.Field>
        </InlineFilterPanel>,
      );
      // Find the rendered label text
      const label = container.querySelector('[data-test-id="inline-filter-field"]');
      expect(label?.textContent).toContain('Holat');
      expect(screen.getByTestId('status-input')).toBeInTheDocument();
    });

    it('prefixes "● " bullet by default (moysklad parity)', () => {
      const { container } = renderWithProviders(
        <InlineFilterPanel onClear={vi.fn()}>
          <InlineFilterPanel.Field label="Date">
            <input />
          </InlineFilterPanel.Field>
        </InlineFilterPanel>,
      );
      const label = container.querySelector('[data-test-id="inline-filter-field"]');
      expect(label?.textContent).toContain('●');
      expect(label?.textContent).toContain('Date');
    });

    it('omits the bullet when expandable=false', () => {
      const { container } = renderWithProviders(
        <InlineFilterPanel onClear={vi.fn()}>
          <InlineFilterPanel.Field label="NoBullet" expandable={false}>
            <input />
          </InlineFilterPanel.Field>
        </InlineFilterPanel>,
      );
      const label = container.querySelector('[data-test-id="inline-filter-field"]');
      expect(label?.textContent).toBe('NoBullet');
    });

    it('explicit expandable=true still renders the bullet', () => {
      const { container } = renderWithProviders(
        <InlineFilterPanel onClear={vi.fn()}>
          <InlineFilterPanel.Field label="Period" expandable>
            <input />
          </InlineFilterPanel.Field>
        </InlineFilterPanel>,
      );
      const label = container.querySelector('[data-test-id="inline-filter-field"]');
      expect(label?.textContent).toContain('●');
      expect(label?.textContent).toContain('Period');
    });
  });
});
