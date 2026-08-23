import { ConfirmProvider, ToastProvider } from '@moysklad/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import uzMessages from '../../../messages/uz.json' with { type: 'json' };

vi.mock('@/lib/api-client', () => ({
  api: {
    get: vi.fn(async () => ({ items: [] })),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@/lib/auth-store', () => ({
  useAuth: vi.fn(() => ({
    user: { id: 'u-1', name: 'Admin' },
    accessToken: 't',
    initialized: true,
  })),
}));

const { useProductForm } = await import('../use-product-form');

function renderForm() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderHook(() => useProductForm(), {
    wrapper: ({ children }) => (
      <NextIntlClientProvider locale="uz" messages={uzMessages as Record<string, unknown>}>
        <QueryClientProvider client={qc}>
          <ToastProvider>
            <ConfirmProvider>{children}</ConfirmProvider>
          </ToastProvider>
        </QueryClientProvider>
      </NextIntlClientProvider>
    ),
  });
}

/**
 * «Неснижаемый остаток» — chegara FAQAT o'zi ko'rinadigan rejimda yuboriladi.
 *
 * 🔴 Bug-class (2026-08-23 auditi): kiritish maydoni faqat `sum` rejimida
 * chiziladi (`product-form-left-cards.tsx`), lekin `buildPayload` chegarani
 * REJIMDAN QAT'I NAZAR yuborardi. Ya'ni foydalanuvchi qiymat kiritib, keyin
 * rejimni «har ombor bo'yicha» ga o'zgartirsa — maydon ko'zdan yo'qoladi-yu,
 * eski chegara baribir saqlanardi. Ekranda ko'rinmaydigan qiymat saqlanishi —
 * «tozaladim» degan ishonchni buzadi.
 */
describe('buildPayload — «Неснижаемый остаток» rejimi', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sum rejimida chegara yuboriladi', () => {
    const { result } = renderForm();
    act(() => {
      result.current.form.setValue('name', 'X');
      result.current.form.setValue('minimumBalance', '5');
    });
    expect(result.current.buildPayload('create').minimumBalanceMinor).toBe('5000');
  });

  it("boshqa rejimda chegara YUBORILMAYDI (ekranda ham yo'q)", () => {
    const { result } = renderForm();
    act(() => {
      result.current.form.setValue('name', 'X');
      result.current.form.setValue('minimumBalance', '5');
      result.current.setMinBalanceMode('perStore');
    });
    expect(result.current.buildPayload('create').minimumBalanceMinor).toBeUndefined();
  });

  it('«same» rejimida ham yuborilmaydi', () => {
    const { result } = renderForm();
    act(() => {
      result.current.form.setValue('name', 'X');
      result.current.form.setValue('minimumBalance', '7');
      result.current.setMinBalanceMode('same');
    });
    expect(result.current.buildPayload('create').minimumBalanceMinor).toBeUndefined();
  });
});
