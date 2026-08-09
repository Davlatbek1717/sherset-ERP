/**
 * Shared filter primitives — the single copy of the controls that were
 * hand-duplicated across the list pages: `YesNoSelect` (24 byte-identical
 * private copies), `MultiRefField` (3) and `refFetcher` (3).
 *
 * The behaviour locked here is exactly what the private copies did; these
 * tests are the safety net for the codemod that deleted them.
 */

import { renderWithProviders, screen } from '@/test-utils';
import { fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiGet = vi.fn();
vi.mock('@/lib/api-client', () => ({ api: { get: (p: string) => apiGet(p) } }));

import { YesNoSelect, refFetcher } from './filter-fields';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('YesNoSelect', () => {
  it('renders the blank / «Нет» / «Да» triple in moysklad order', () => {
    renderWithProviders(
      <YesNoSelect value={undefined} onChange={() => undefined} testId="filter-applicable" />,
    );
    const select = screen.getByTestId('filter-applicable') as HTMLSelectElement;
    // Blank first (= «не важно»), then false, then true — the private copies'
    // order. Flipping it would silently change which option a keyboard user
    // lands on first.
    expect([...select.options].map((o) => o.value)).toEqual(['', 'false', 'true']);
  });

  it('shows the empty string for an undefined value (tri-state, not "false")', () => {
    renderWithProviders(
      <YesNoSelect value={undefined} onChange={() => undefined} testId="filter-printed" />,
    );
    expect((screen.getByTestId('filter-printed') as HTMLSelectElement).value).toBe('');
  });

  it('reflects an explicit false (the "no" branch must be distinguishable from unset)', () => {
    renderWithProviders(
      <YesNoSelect value="false" onChange={() => undefined} testId="filter-printed" />,
    );
    expect((screen.getByTestId('filter-printed') as HTMLSelectElement).value).toBe('false');
  });

  it('emits undefined when cleared back to blank (drops the param, not sends false)', () => {
    const onChange = vi.fn();
    renderWithProviders(<YesNoSelect value="true" onChange={onChange} testId="filter-shared" />);
    fireEvent.change(screen.getByTestId('filter-shared'), { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it('emits the literal "true"/"false" strings the list params expect', () => {
    const onChange = vi.fn();
    renderWithProviders(
      <YesNoSelect value={undefined} onChange={onChange} testId="filter-published" />,
    );
    fireEvent.change(screen.getByTestId('filter-published'), { target: { value: 'true' } });
    expect(onChange).toHaveBeenCalledWith('true');
    fireEvent.change(screen.getByTestId('filter-published'), { target: { value: 'false' } });
    expect(onChange).toHaveBeenLastCalledWith('false');
  });

  it('renders without a testId (optional prop — some pages pass none)', () => {
    expect(() =>
      renderWithProviders(<YesNoSelect value={undefined} onChange={() => undefined} />),
    ).not.toThrow();
  });
});

describe('refFetcher', () => {
  it('hits the reference endpoint with an encoded search and the 20-row cap', async () => {
    apiGet.mockResolvedValue({ items: [] });
    await refFetcher('/employees')('Иванов и Ко');
    expect(apiGet).toHaveBeenCalledWith(
      '/employees?search=%D0%98%D0%B2%D0%B0%D0%BD%D0%BE%D0%B2%20%D0%B8%20%D0%9A%D0%BE&limit=20',
    );
  });

  it('maps {id,name} rows to the combobox {value,label} shape', async () => {
    apiGet.mockResolvedValue({ items: [{ id: 'a1', name: 'Ombor 1' }] });
    await expect(refFetcher('/stores')('om')).resolves.toEqual([{ value: 'a1', label: 'Ombor 1' }]);
  });
});
