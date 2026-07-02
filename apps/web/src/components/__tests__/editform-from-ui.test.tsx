import { renderWithProviders, screen, userEvent } from '@/test-utils';
import { EditForm } from '@moysklad/ui';
/**
 * EditForm (from @moysklad/ui) tests — generic form skeleton with
 * title/breadcrumbs + body + Save/Cancel buttons + error alert.
 *
 * Used by simpler edit pages that don't need DetailToolbar (settings,
 * attribute config, simple master-data CRUD).
 *
 * Tests guard the form submission, the loading state on Save (button
 * spinner via Button.loading), the cancel button (handler vs link),
 * the error alert rendering (Error vs string vs null), the labels
 * (uz defaults + custom override), and the children render.
 */
import { describe, expect, it, vi } from 'vitest';

describe('EditForm', () => {
  describe('basic rendering', () => {
    it('renders the title', () => {
      renderWithProviders(
        <EditForm title="My Form" onSubmit={vi.fn()}>
          <div>Body</div>
        </EditForm>,
      );
      expect(screen.getByText('My Form')).toBeInTheDocument();
    });

    it('renders the children inside the form', () => {
      renderWithProviders(
        <EditForm title="x" onSubmit={vi.fn()}>
          <input data-test-id="child-input" />
        </EditForm>,
      );
      expect(screen.getByTestId('child-input')).toBeInTheDocument();
    });

    it('renders a <form> with the default testId "edit-form"', () => {
      const { container } = renderWithProviders(
        <EditForm title="x" onSubmit={vi.fn()}>
          <div />
        </EditForm>,
      );
      const form = container.querySelector('form[data-test-id="edit-form"]');
      expect(form).toBeInTheDocument();
    });

    it('honors custom testId', () => {
      const { container } = renderWithProviders(
        <EditForm title="x" onSubmit={vi.fn()} testId="my-form">
          <div />
        </EditForm>,
      );
      expect(container.querySelector('[data-test-id="my-form"]')).toBeInTheDocument();
    });
  });

  describe('Save button', () => {
    it('renders Save with default uz label "Saqlash"', () => {
      renderWithProviders(
        <EditForm title="x" onSubmit={vi.fn()}>
          <div />
        </EditForm>,
      );
      expect(screen.getByTestId('save-button')).toHaveTextContent('Saqlash');
    });

    it('honors custom saveLabel', () => {
      renderWithProviders(
        <EditForm title="x" onSubmit={vi.fn()} saveLabel="Yaratish">
          <div />
        </EditForm>,
      );
      expect(screen.getByTestId('save-button')).toHaveTextContent('Yaratish');
    });

    it('Save button has type="submit"', () => {
      renderWithProviders(
        <EditForm title="x" onSubmit={vi.fn()}>
          <div />
        </EditForm>,
      );
      expect(screen.getByTestId('save-button')).toHaveAttribute('type', 'submit');
    });
  });

  describe('form submission', () => {
    it('clicking Save calls onSubmit with the FormEvent', async () => {
      const onSubmit = vi.fn((e: React.FormEvent) => {
        e.preventDefault();
      });
      const user = userEvent.setup();
      renderWithProviders(
        <EditForm title="x" onSubmit={onSubmit}>
          <div />
        </EditForm>,
      );
      await user.click(screen.getByTestId('save-button'));
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
  });

  describe('saving state', () => {
    it('Save button shows the loading spinner when saving=true', () => {
      const { container } = renderWithProviders(
        <EditForm title="x" onSubmit={vi.fn()} saving>
          <div />
        </EditForm>,
      );
      // The Button loading state renders an inline spinner span
      const save = screen.getByTestId('save-button');
      expect(save.querySelector('span.animate-spin')).toBeTruthy();
      // Sanity: aria-busy
      expect(save).toHaveAttribute('aria-busy', 'true');
      // Suppress unused 'container' warning
      void container;
    });

    it('Save button is NOT busy when saving=false (default)', () => {
      renderWithProviders(
        <EditForm title="x" onSubmit={vi.fn()}>
          <div />
        </EditForm>,
      );
      expect(screen.getByTestId('save-button')).not.toHaveAttribute('aria-busy', 'true');
    });
  });

  describe('cancel button', () => {
    it('does NOT render cancel by default (no onCancel + no cancelHref)', () => {
      renderWithProviders(
        <EditForm title="x" onSubmit={vi.fn()}>
          <div />
        </EditForm>,
      );
      expect(screen.queryByText('Bekor qilish')).toBeNull();
    });

    it('renders cancel button when onCancel provided', () => {
      renderWithProviders(
        <EditForm title="x" onSubmit={vi.fn()} onCancel={vi.fn()}>
          <div />
        </EditForm>,
      );
      expect(screen.getByText('Bekor qilish')).toBeInTheDocument();
    });

    it('clicking cancel button calls onCancel', async () => {
      const onCancel = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(
        <EditForm title="x" onSubmit={vi.fn()} onCancel={onCancel}>
          <div />
        </EditForm>,
      );
      await user.click(screen.getByRole('button', { name: 'Bekor qilish' }));
      expect(onCancel).toHaveBeenCalled();
    });

    it('renders cancel as <a href> when cancelHref provided', () => {
      renderWithProviders(
        <EditForm title="x" onSubmit={vi.fn()} cancelHref="/items">
          <div />
        </EditForm>,
      );
      const link = screen.getByText('Bekor qilish');
      expect(link.tagName).toBe('A');
      expect(link).toHaveAttribute('href', '/items');
    });

    it('honors custom cancelLabel', () => {
      renderWithProviders(
        <EditForm title="x" onSubmit={vi.fn()} onCancel={vi.fn()} cancelLabel="Orqaga">
          <div />
        </EditForm>,
      );
      expect(screen.getByText('Orqaga')).toBeInTheDocument();
    });
  });

  describe('error alert', () => {
    it('does NOT render alert when error=null', () => {
      renderWithProviders(
        <EditForm title="x" onSubmit={vi.fn()} error={null}>
          <div />
        </EditForm>,
      );
      // No "Xato" title alert present
      expect(screen.queryByText('Xato')).toBeNull();
    });

    it('renders alert with string error', () => {
      renderWithProviders(
        <EditForm title="x" onSubmit={vi.fn()} error="Something went wrong">
          <div />
        </EditForm>,
      );
      expect(screen.getByText('Xato')).toBeInTheDocument();
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });

    it('renders alert with Error.message extracted', () => {
      renderWithProviders(
        <EditForm title="x" onSubmit={vi.fn()} error={new Error('Boom')}>
          <div />
        </EditForm>,
      );
      expect(screen.getByText('Boom')).toBeInTheDocument();
    });
  });

  describe('breadcrumbs + subtitle', () => {
    it('renders breadcrumbs when provided', () => {
      renderWithProviders(
        <EditForm
          title="x"
          onSubmit={vi.fn()}
          breadcrumbs={[
            { label: 'Home', href: '/' },
            { label: 'Items', href: '/items' },
          ]}
        >
          <div />
        </EditForm>,
      );
      expect(screen.getByText('Home')).toBeInTheDocument();
      expect(screen.getByText('Items')).toBeInTheDocument();
    });

    it('renders subtitle when provided', () => {
      renderWithProviders(
        <EditForm title="x" onSubmit={vi.fn()} subtitle="Helpful info">
          <div />
        </EditForm>,
      );
      expect(screen.getByText('Helpful info')).toBeInTheDocument();
    });
  });
});
