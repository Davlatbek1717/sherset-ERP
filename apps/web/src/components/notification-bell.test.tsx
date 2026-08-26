import { api } from '@/lib/api-client';
import { renderWithProviders, userEvent } from '@/test-utils';
import { screen, waitFor } from '@testing-library/react';
/**
 * NotificationBell tests — verify the bell trigger, badge, popover
 * states (loading skeleton, empty state, list with unread tint), and
 * the click handlers (mark-as-read on item click, mark-all-read).
 *
 * Polishes covered: tabular-nums on badge + relative time, design-system
 * tokens (no raw bg-blue-50 / bg-red-500), icon in empty state, loading
 * skeleton when data is undefined.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationBell } from './notification-bell';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

vi.mock('@/lib/api-client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

const mockedGet = vi.mocked(api.get);
const mockedPost = vi.mocked(api.post);

const baseItem = {
  id: 'n-1',
  kind: 'invoice_paid',
  title: "Schyot to'landi",
  body: "500 000 so'm",
  entity: 'InvoiceOut',
  entityId: 'inv-1',
  readAt: null,
  createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
};

describe('NotificationBell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pushMock.mockClear();
    mockedGet.mockResolvedValue({ items: [], unreadCount: 0, total: 0, nextCursor: undefined });
    mockedPost.mockResolvedValue({});
  });

  it('renders the trigger button with bell icon', async () => {
    renderWithProviders(<NotificationBell />);
    expect(screen.getByTestId('notification-bell-trigger')).toBeInTheDocument();
  });

  it('renders the unread badge with the count when unread > 0', async () => {
    mockedGet.mockResolvedValue({
      items: [baseItem],
      unreadCount: 3,
      total: 3,
      nextCursor: undefined,
    });
    renderWithProviders(<NotificationBell />);
    const badge = await screen.findByTestId('notification-bell-badge');
    expect(badge.textContent).toBe('3');
    expect(badge.className).toContain('tabular-nums');
  });

  it('clamps the badge at 99+ for very large unread counts', async () => {
    mockedGet.mockResolvedValue({ items: [], unreadCount: 247, total: 247, nextCursor: undefined });
    renderWithProviders(<NotificationBell />);
    const badge = await screen.findByTestId('notification-bell-badge');
    expect(badge.textContent).toBe('99+');
  });

  it('hides the badge entirely when unreadCount is 0', async () => {
    renderWithProviders(<NotificationBell />);
    await waitFor(() => expect(mockedGet).toHaveBeenCalled());
    expect(screen.queryByTestId('notification-bell-badge')).toBeNull();
  });

  it('renders the loading skeleton while the unread fetch is pending', async () => {
    let resolveFetch: (value: unknown) => void = () => undefined;
    mockedGet.mockImplementationOnce(
      () =>
        new Promise((res) => {
          resolveFetch = res;
        }),
    );
    const user = userEvent.setup();
    renderWithProviders(<NotificationBell />);
    await user.click(screen.getByTestId('notification-bell-trigger'));
    expect(await screen.findByTestId('notification-bell-loading')).toBeInTheDocument();
    resolveFetch({ items: [], unreadCount: 0, total: 0, nextCursor: undefined });
  });

  it('renders the empty state with an icon when there are no notifications', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NotificationBell />);
    await user.click(screen.getByTestId('notification-bell-trigger'));
    const empty = await screen.findByTestId('notification-bell-empty');
    expect(empty).toBeInTheDocument();
    // BellOff icon is rendered as an SVG inside the empty container.
    expect(empty.querySelector('svg')).not.toBeNull();
  });

  it('renders an item with unread state and brand-tinted background', async () => {
    mockedGet.mockResolvedValue({
      items: [baseItem],
      unreadCount: 1,
      total: 1,
      nextCursor: undefined,
    });
    const user = userEvent.setup();
    renderWithProviders(<NotificationBell />);
    await user.click(screen.getByTestId('notification-bell-trigger'));
    const item = await screen.findByTestId('notification-bell-item-n-1');
    expect(item).toHaveAttribute('data-unread', 'true');
    expect(item.className).toContain('var(--ms-brand-50)');
  });

  it('navigates to the entity URL when an item is clicked (and marks it read)', async () => {
    mockedGet.mockResolvedValue({
      items: [baseItem],
      unreadCount: 1,
      total: 1,
      nextCursor: undefined,
    });
    const user = userEvent.setup();
    renderWithProviders(<NotificationBell />);
    await user.click(screen.getByTestId('notification-bell-trigger'));
    const item = await screen.findByTestId('notification-bell-item-n-1');
    await user.click(item);
    await waitFor(() => {
      expect(mockedPost).toHaveBeenCalledWith('/notifications/mark-read', { ids: ['n-1'] });
    });
    expect(pushMock).toHaveBeenCalledWith('/invoices-out/inv-1');
  });

  /**
   * K6 (2026-08-26) — kunlik bo'lak sverkasi signali. Uning `entityId` si
   * YO'Q (hujjat emas, HISOBOT), shuning uchun havola shartida `entityId`
   * tekshiruvidan OLDIN turishi kerak — aks holda xabar havolasiz qolardi
   * va katta omborchi qayerga borishni bilmasdi.
   */
  it('opens the piece-reconciliation report for the daily piece digest', async () => {
    mockedGet.mockResolvedValue({
      items: [
        {
          ...baseItem,
          kind: 'piece_reconciliation_diff',
          entity: 'PieceReconciliation',
          entityId: null,
        },
      ],
      unreadCount: 1,
      total: 1,
      nextCursor: undefined,
    });
    const user = userEvent.setup();
    renderWithProviders(<NotificationBell />);
    await user.click(screen.getByTestId('notification-bell-trigger'));
    await user.click(await screen.findByTestId('notification-bell-item-n-1'));
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/reports/piece-reconciliation'));
  });

  it('does not call mark-read when the item is already read', async () => {
    const readItem = { ...baseItem, readAt: new Date().toISOString() };
    mockedGet.mockResolvedValue({
      items: [readItem],
      unreadCount: 0,
      total: 1,
      nextCursor: undefined,
    });
    const user = userEvent.setup();
    renderWithProviders(<NotificationBell />);
    await user.click(screen.getByTestId('notification-bell-trigger'));
    const item = await screen.findByTestId('notification-bell-item-n-1');
    await user.click(item);
    expect(mockedPost).not.toHaveBeenCalledWith('/notifications/mark-read', expect.anything());
  });

  it('fires mark-all-read when the header link is clicked', async () => {
    mockedGet.mockResolvedValue({
      items: [baseItem],
      unreadCount: 1,
      total: 1,
      nextCursor: undefined,
    });
    const user = userEvent.setup();
    renderWithProviders(<NotificationBell />);
    await user.click(screen.getByTestId('notification-bell-trigger'));
    const link = await screen.findByTestId('notification-bell-mark-all');
    await user.click(link);
    await waitFor(() => {
      expect(mockedPost).toHaveBeenCalledWith('/notifications/mark-all-read', {});
    });
  });

  it('hides the mark-all-read link when unreadCount is 0', async () => {
    mockedGet.mockResolvedValue({ items: [], unreadCount: 0, total: 0, nextCursor: undefined });
    const user = userEvent.setup();
    renderWithProviders(<NotificationBell />);
    await user.click(screen.getByTestId('notification-bell-trigger'));
    await screen.findByTestId('notification-bell-empty');
    expect(screen.queryByTestId('notification-bell-mark-all')).toBeNull();
  });
});
