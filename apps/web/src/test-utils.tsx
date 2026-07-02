/**
 * Test render helpers — wrap components with the same providers they
 * see in production (NextIntl, react-query, ConfirmProvider, ToastProvider).
 *
 * Use:
 *   render(<MyComponent ... />)
 *
 * If a test needs custom messages, pass `{ messages: { ... } }`.
 */
import { ConfirmProvider, ToastProvider } from '@moysklad/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  type RenderHookOptions,
  type RenderOptions,
  render,
  renderHook,
} from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement, ReactNode } from 'react';
import uzMessages from './messages/uz.json' with { type: 'json' };

interface AllProvidersProps {
  children: ReactNode;
  messages?: Record<string, unknown>;
  queryClient?: QueryClient;
}

function AllProviders({ children, messages, queryClient }: AllProvidersProps) {
  const qc =
    queryClient ??
    new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
        mutations: { retry: false },
      },
    });
  return (
    <NextIntlClientProvider locale="uz" messages={messages ?? (uzMessages as Record<string, unknown>)}>
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <ConfirmProvider>{children}</ConfirmProvider>
        </ToastProvider>
      </QueryClientProvider>
    </NextIntlClientProvider>
  );
}

interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  messages?: Record<string, unknown>;
  queryClient?: QueryClient;
}

export function renderWithProviders(ui: ReactElement, options: CustomRenderOptions = {}) {
  const { messages, queryClient, ...rtlOptions } = options;
  return render(ui, {
    wrapper: ({ children }) => (
      <AllProviders messages={messages} queryClient={queryClient}>
        {children}
      </AllProviders>
    ),
    ...rtlOptions,
  });
}

interface RenderHookCustomOptions<Props> extends Omit<RenderHookOptions<Props>, 'wrapper'> {
  messages?: Record<string, unknown>;
  queryClient?: QueryClient;
}

/**
 * Hook-flavoured analogue of `renderWithProviders`. Use when testing
 * a hook that depends on the toast/confirm/intl/query providers
 * (every hook that calls `useToast`, `useTranslations`, or
 * `useMutation` does).
 */
export function renderHookWithProviders<Result, Props>(
  callback: (props: Props) => Result,
  options: RenderHookCustomOptions<Props> = {},
) {
  const { messages, queryClient, ...rtlOptions } = options;
  return renderHook(callback, {
    wrapper: ({ children }) => (
      <AllProviders messages={messages} queryClient={queryClient}>
        {children}
      </AllProviders>
    ),
    ...rtlOptions,
  });
}

export * from '@testing-library/react';
export { default as userEvent } from '@testing-library/user-event';
