import { renderWithProviders, screen, userEvent } from '@/test-utils';
import { Drawer, EmptyState, ErrorState, Skeleton, TableSkeleton } from '@moysklad/ui';
/**
 * Feedback shells (from @moysklad/ui) tests — EmptyState, Skeleton +
 * TableSkeleton, ErrorState, Drawer.
 *
 * These render at the boundaries of every list/detail page (loading,
 * empty, error, side-sheet). Each is a small surface with a focused
 * job; coverage is the same — guard the slots and the ARIA hooks.
 */
import { describe, expect, it, vi } from 'vitest';

describe('EmptyState', () => {
  describe('basic rendering', () => {
    it('renders with the empty-state testId', () => {
      renderWithProviders(<EmptyState title="No items" />);
      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    });

    it('renders the title as <p> with primary text color', () => {
      renderWithProviders(<EmptyState title="My Title" />);
      const title = screen.getByText('My Title');
      expect(title.tagName).toBe('P');
      expect(title.className).toContain('text-[var(--ms-text-primary)]');
    });

    it('does NOT render description by default', () => {
      renderWithProviders(<EmptyState title="x" />);
      expect(screen.queryByText('My description')).toBeNull();
    });

    it('renders description when provided', () => {
      renderWithProviders(<EmptyState title="x" description="My description" />);
      expect(screen.getByText('My description')).toBeInTheDocument();
    });

    it('renders default Inbox icon when no icon prop', () => {
      const { container } = renderWithProviders(<EmptyState title="x" />);
      expect(container.querySelector('svg')).toBeInTheDocument();
    });

    it('renders custom icon when provided', () => {
      renderWithProviders(<EmptyState title="x" icon={<span data-test-id="my-icon">ICON</span>} />);
      expect(screen.getByTestId('my-icon')).toBeInTheDocument();
    });

    it('does NOT render action by default', () => {
      renderWithProviders(<EmptyState title="x" />);
      expect(screen.queryByTestId('my-action')).toBeNull();
    });

    it('renders action slot below the body', () => {
      renderWithProviders(
        <EmptyState title="x" action={<button type="button" data-test-id="my-action">Add</button>} />,
      );
      expect(screen.getByTestId('my-action')).toBeInTheDocument();
    });
  });
});

describe('Skeleton', () => {
  it('renders as <div> with animate-pulse + bg-muted + rounded', () => {
    const { container } = renderWithProviders(<Skeleton className="h-8 w-20" />);
    const div = container.querySelector('div');
    expect(div?.className).toContain('animate-pulse');
    expect(div?.className).toContain('rounded-[var(--ms-radius-sm)]');
    expect(div?.className).toContain('bg-[var(--ms-bg-muted)]');
  });

  it('is aria-hidden (decorative)', () => {
    const { container } = renderWithProviders(<Skeleton />);
    expect(container.querySelector('div')).toHaveAttribute('aria-hidden');
  });

  it('merges user className', () => {
    const { container } = renderWithProviders(<Skeleton className="my-extra" />);
    expect(container.querySelector('div')?.className).toContain('my-extra');
  });
});

describe('TableSkeleton', () => {
  it('renders default 5 rows × 6 cols (1 header row + 5 body rows = 6 row groups)', () => {
    const { container } = renderWithProviders(<TableSkeleton />);
    // Look at the direct children of the outer w-full wrapper, not anywhere
    // — other providers (ToastProvider) inject flex containers in body.
    const wrapper = container.querySelector('div.w-full.space-y-2.p-2');
    const rows = wrapper?.children ?? [];
    expect(rows).toHaveLength(6); // 1 header + 5 body
  });

  it('renders custom rows + cols', () => {
    const { container } = renderWithProviders(<TableSkeleton rows={3} cols={4} />);
    const wrapper = container.querySelector('div.w-full.space-y-2.p-2');
    const rows = wrapper?.children;
    expect(rows).toHaveLength(4); // 1 header + 3 body
    // Each row has 4 skeleton cells
    expect(rows?.[0]?.children.length).toBe(4);
  });

  it('header row uses h-8 cells, body rows use h-6', () => {
    const { container } = renderWithProviders(<TableSkeleton rows={1} cols={1} />);
    const wrapper = container.querySelector('div.w-full.space-y-2.p-2');
    const rows = wrapper?.children;
    const headerCell = rows?.[0]?.firstElementChild;
    const bodyCell = rows?.[1]?.firstElementChild;
    expect(headerCell?.className).toContain('h-8');
    expect(bodyCell?.className).toContain('h-6');
  });
});

describe('ErrorState', () => {
  describe('basic rendering', () => {
    it('renders role="alert"', () => {
      renderWithProviders(<ErrorState />);
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('uses default uz title "Xato yuz berdi" when no title', () => {
      renderWithProviders(<ErrorState />);
      expect(screen.getByText('Xato yuz berdi')).toBeInTheDocument();
    });

    it('honors custom title', () => {
      renderWithProviders(<ErrorState title="My Error" />);
      expect(screen.getByText('My Error')).toBeInTheDocument();
    });

    it('does NOT render description by default', () => {
      renderWithProviders(<ErrorState />);
      expect(screen.queryByText('My description')).toBeNull();
    });

    it('renders description when provided', () => {
      renderWithProviders(<ErrorState description="My description" />);
      expect(screen.getByText('My description')).toBeInTheDocument();
    });

    it('renders the AlertCircle icon (svg)', () => {
      const { container } = renderWithProviders(<ErrorState />);
      expect(container.querySelector('svg')).toBeInTheDocument();
    });
  });

  describe('retry button', () => {
    it('does NOT render retry button by default', () => {
      renderWithProviders(<ErrorState />);
      expect(screen.queryByText('Qayta urinish')).toBeNull();
    });

    it('renders retry button with default uz label "Qayta urinish"', () => {
      renderWithProviders(<ErrorState onRetry={vi.fn()} />);
      expect(screen.getByRole('button', { name: 'Qayta urinish' })).toBeInTheDocument();
    });

    it('clicking retry calls onRetry', async () => {
      const onRetry = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(<ErrorState onRetry={onRetry} />);
      await user.click(screen.getByRole('button', { name: 'Qayta urinish' }));
      expect(onRetry).toHaveBeenCalled();
    });

    it('honors custom retryLabel', () => {
      renderWithProviders(<ErrorState onRetry={vi.fn()} retryLabel="Try again" />);
      expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    });
  });
});

describe('Drawer', () => {
  describe('open/close behavior', () => {
    it('renders the body when open=true', () => {
      renderWithProviders(
        <Drawer open onOpenChange={vi.fn()} title="Side Panel">
          <div data-test-id="drawer-body">Body</div>
        </Drawer>,
      );
      expect(screen.getByTestId('drawer-body')).toBeInTheDocument();
    });

    it('does NOT render body when open=false', () => {
      renderWithProviders(
        <Drawer open={false} onOpenChange={vi.fn()} title="Side Panel">
          <div data-test-id="drawer-body">Body</div>
        </Drawer>,
      );
      expect(screen.queryByTestId('drawer-body')).toBeNull();
    });

    it('clicking the close X button calls onOpenChange(false)', async () => {
      const onOpenChange = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(
        <Drawer open onOpenChange={onOpenChange} title="x">
          <div>Body</div>
        </Drawer>,
      );
      await user.click(screen.getByRole('button', { name: 'Yopish' }));
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('honors custom closeLabel', () => {
      renderWithProviders(
        <Drawer open onOpenChange={vi.fn()} title="x" closeLabel="Yopish-X">
          <div>Body</div>
        </Drawer>,
      );
      expect(screen.getByRole('button', { name: 'Yopish-X' })).toBeInTheDocument();
    });

    it('hides the close button when hideClose=true', () => {
      renderWithProviders(
        <Drawer open onOpenChange={vi.fn()} title="x" hideClose>
          <div>Body</div>
        </Drawer>,
      );
      expect(screen.queryByRole('button', { name: 'Yopish' })).toBeNull();
    });
  });

  describe('header rendering', () => {
    it('renders the title in the header', () => {
      renderWithProviders(
        <Drawer open onOpenChange={vi.fn()} title="My Drawer Title">
          <div>Body</div>
        </Drawer>,
      );
      expect(screen.getByText('My Drawer Title')).toBeInTheDocument();
    });

    it('renders the description when provided', () => {
      renderWithProviders(
        <Drawer open onOpenChange={vi.fn()} title="x" description="Optional desc">
          <div>Body</div>
        </Drawer>,
      );
      expect(screen.getByText('Optional desc')).toBeInTheDocument();
    });

    it('does NOT render the description when omitted', () => {
      renderWithProviders(
        <Drawer open onOpenChange={vi.fn()} title="x">
          <div>Body</div>
        </Drawer>,
      );
      expect(screen.queryByText('Optional desc')).toBeNull();
    });

    it('renders toolbar slot when provided', () => {
      renderWithProviders(
        <Drawer
          open
          onOpenChange={vi.fn()}
          title="x"
          toolbar={<button type="button" data-test-id="my-tool">Tool</button>}
        >
          <div>Body</div>
        </Drawer>,
      );
      expect(screen.getByTestId('my-tool')).toBeInTheDocument();
    });
  });

  describe('footer slot', () => {
    it('renders the footer when provided', () => {
      renderWithProviders(
        <Drawer
          open
          onOpenChange={vi.fn()}
          title="x"
          footer={<button type="button" data-test-id="save-btn">Save</button>}
        >
          <div>Body</div>
        </Drawer>,
      );
      expect(screen.getByTestId('save-btn')).toBeInTheDocument();
    });

    it('does NOT render the footer when omitted', () => {
      const { container } = renderWithProviders(
        <Drawer open onOpenChange={vi.fn()} title="x">
          <div>Body</div>
        </Drawer>,
      );
      expect(container.querySelector('footer')).toBeNull();
    });
  });

  describe('width control', () => {
    it('uses default w-[400px] when widthClass omitted', () => {
      renderWithProviders(
        <Drawer open onOpenChange={vi.fn()} title="x" testId="d">
          <div>Body</div>
        </Drawer>,
      );
      const drawer = document.body.querySelector('[data-testid="d"]');
      expect(drawer?.className).toContain('w-[400px]');
    });

    it('honors custom widthClass override', () => {
      renderWithProviders(
        <Drawer open onOpenChange={vi.fn()} title="x" testId="d" widthClass="w-[800px]">
          <div>Body</div>
        </Drawer>,
      );
      const drawer = document.body.querySelector('[data-testid="d"]');
      expect(drawer?.className).toContain('w-[800px]');
    });
  });

  describe('a11y baseline', () => {
    it('Escape key closes the drawer (Radix default)', async () => {
      const onOpenChange = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(
        <Drawer open onOpenChange={onOpenChange} title="x">
          <div>Body</div>
        </Drawer>,
      );
      await user.keyboard('{Escape}');
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
