import { getAccessToken, useAuth } from '@/lib/auth-store';
import { renderHookWithProviders } from '@/test-utils';
import { useToast } from '@moysklad/ui';
import { QueryClient } from '@tanstack/react-query';
import { act } from '@testing-library/react';
/**
 * useNotificationStream tests — verify the SSE connection lifecycle
 * (connect when user+token ready, skip otherwise, close on unmount)
 * and the message handler that drives the bell badge + toast.
 *
 * EventSource is mocked because happy-dom's implementation doesn't
 * trigger handlers we can pass through; we want a deterministic fake
 * we can drive from the test.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useNotificationStream } from './use-notification-stream';

vi.mock('@/lib/auth-store', () => ({
  useAuth: vi.fn(),
  getAccessToken: vi.fn(),
}));

vi.mock('@moysklad/ui', async () => {
  const actual = await vi.importActual<typeof import('@moysklad/ui')>('@moysklad/ui');
  return {
    ...actual,
    useToast: vi.fn(),
  };
});

const mockedUseAuth = vi.mocked(useAuth);
const mockedGetAccessToken = vi.mocked(getAccessToken);
const mockedUseToast = vi.mocked(useToast);

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  url: string;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  closeFn = vi.fn();

  constructor(url: string, _opts?: EventSourceInit) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  close() {
    this.closeFn();
  }

  /** Simulate the server pushing a message. */
  triggerMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent);
  }

  /** Simulate a malformed payload (the server sent garbage). */
  triggerMalformed() {
    this.onmessage?.({ data: 'not-json' } as MessageEvent);
  }
}

describe('useNotificationStream', () => {
  let toastInfo: ReturnType<typeof vi.fn>;
  let originalEventSource: typeof EventSource | undefined;

  beforeEach(() => {
    FakeEventSource.instances = [];
    toastInfo = vi.fn();
    mockedUseToast.mockReturnValue({
      toast: {
        info: toastInfo,
        success: vi.fn(),
        error: vi.fn(),
        warning: vi.fn(),
      },
    } as unknown as ReturnType<typeof useToast>);
    originalEventSource = (globalThis as { EventSource?: typeof EventSource }).EventSource;
    (globalThis as { EventSource?: unknown }).EventSource =
      FakeEventSource as unknown as typeof EventSource;
  });

  afterEach(() => {
    if (originalEventSource) {
      (globalThis as { EventSource?: typeof EventSource }).EventSource = originalEventSource;
    }
    vi.clearAllMocks();
  });

  it('does NOT open an EventSource when user is null', () => {
    mockedUseAuth.mockReturnValue({
      user: null,
      accessToken: null,
      initialized: true,
    } as ReturnType<typeof useAuth>);
    mockedGetAccessToken.mockReturnValue('tok-1');
    renderHookWithProviders(() => useNotificationStream());
    expect(FakeEventSource.instances).toHaveLength(0);
  });

  it('does NOT open an EventSource when access token is missing', () => {
    mockedUseAuth.mockReturnValue({
      user: { id: 'u1', name: 'Alice', email: 'a@x' },
      accessToken: null,
      initialized: true,
    } as unknown as ReturnType<typeof useAuth>);
    mockedGetAccessToken.mockReturnValue(null);
    renderHookWithProviders(() => useNotificationStream());
    expect(FakeEventSource.instances).toHaveLength(0);
  });

  it('opens an EventSource at /api/v1/notifications/stream with the JWT in the query string', () => {
    mockedUseAuth.mockReturnValue({
      user: { id: 'u1', name: 'Alice', email: 'a@x' },
      accessToken: 'tok-1',
      initialized: true,
    } as unknown as ReturnType<typeof useAuth>);
    mockedGetAccessToken.mockReturnValue('tok-1');
    renderHookWithProviders(() => useNotificationStream());
    expect(FakeEventSource.instances).toHaveLength(1);
    const es = FakeEventSource.instances[0];
    expect(es?.url).toBe('/api/v1/notifications/stream?access_token=tok-1');
  });

  it('URL-encodes JWTs that contain special chars', () => {
    mockedUseAuth.mockReturnValue({
      user: { id: 'u1', name: 'Alice', email: 'a@x' },
    } as unknown as ReturnType<typeof useAuth>);
    mockedGetAccessToken.mockReturnValue('tok with space');
    renderHookWithProviders(() => useNotificationStream());
    const es = FakeEventSource.instances[0];
    expect(es?.url).toContain('access_token=tok%20with%20space');
  });

  it('toasts info on message and invalidates the notifications query', async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
    mockedUseAuth.mockReturnValue({
      user: { id: 'u1', name: 'Alice', email: 'a@x' },
    } as unknown as ReturnType<typeof useAuth>);
    mockedGetAccessToken.mockReturnValue('tok-1');
    renderHookWithProviders(() => useNotificationStream(), { queryClient: qc });

    const es = FakeEventSource.instances[0];
    expect(es).toBeDefined();
    act(() => {
      es!.triggerMessage({
        id: 'evt-1',
        accountId: 'a-1',
        recipientId: 'u1',
        kind: 'order_received',
        title: 'New order!',
        body: 'A new order arrived',
        entity: 'CustomerOrder',
        entityId: 'doc-1',
        createdAt: '2026-04-30T12:00:00Z',
      });
    });

    expect(toastInfo).toHaveBeenCalledWith('New order!', {
      description: 'A new order arrived',
      duration: 6000,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['notifications'] });
  });

  it('falls back to the kind label when body is null', () => {
    mockedUseAuth.mockReturnValue({
      user: { id: 'u1', name: 'Alice', email: 'a@x' },
    } as unknown as ReturnType<typeof useAuth>);
    mockedGetAccessToken.mockReturnValue('tok-1');
    renderHookWithProviders(() => useNotificationStream());

    const es = FakeEventSource.instances[0];
    act(() => {
      es!.triggerMessage({
        id: 'evt-2',
        accountId: 'a-1',
        recipientId: 'u1',
        kind: 'order_received',
        title: 'New order!',
        body: null,
        entity: null,
        entityId: null,
        createdAt: '2026-04-30T12:00:00Z',
      });
    });

    // Verify a toast was called and the description was a string (the
    // kind fallback) — exact translated value depends on i18n bundle.
    expect(toastInfo).toHaveBeenCalled();
    const [, opts] = toastInfo.mock.calls[0] ?? [];
    expect(opts?.description).toBeTypeOf('string');
  });

  it('silently ignores malformed payloads (no toast, no crash)', () => {
    mockedUseAuth.mockReturnValue({
      user: { id: 'u1', name: 'Alice', email: 'a@x' },
    } as unknown as ReturnType<typeof useAuth>);
    mockedGetAccessToken.mockReturnValue('tok-1');
    renderHookWithProviders(() => useNotificationStream());

    const es = FakeEventSource.instances[0];
    act(() => {
      es!.triggerMalformed();
    });

    expect(toastInfo).not.toHaveBeenCalled();
  });

  it('closes the EventSource on unmount', () => {
    mockedUseAuth.mockReturnValue({
      user: { id: 'u1', name: 'Alice', email: 'a@x' },
    } as unknown as ReturnType<typeof useAuth>);
    mockedGetAccessToken.mockReturnValue('tok-1');
    const { unmount } = renderHookWithProviders(() => useNotificationStream());
    const es = FakeEventSource.instances[0];
    expect(es?.closeFn).not.toHaveBeenCalled();
    unmount();
    expect(es?.closeFn).toHaveBeenCalled();
  });

  it('does NOT crash when EventSource is unavailable (SSR / older runtime)', () => {
    (globalThis as { EventSource?: unknown }).EventSource = undefined;
    mockedUseAuth.mockReturnValue({
      user: { id: 'u1', name: 'Alice', email: 'a@x' },
    } as unknown as ReturnType<typeof useAuth>);
    mockedGetAccessToken.mockReturnValue('tok-1');
    expect(() => {
      renderHookWithProviders(() => useNotificationStream());
    }).not.toThrow();
    expect(FakeEventSource.instances).toHaveLength(0);
  });
});
