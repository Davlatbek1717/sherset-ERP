import { MoneyInput } from '@moysklad/ui';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

/**
 * MoneyInput `allowEmpty` contract (regression guard for the list «Сумма от/до»
 * filter sweep, 2026-06-10).
 *
 * The list sum-filters store `sumMinorFrom/To` and need to distinguish "no
 * bound" (clear → omit the query param) from "0". Without `allowEmpty`,
 * clearing the field would emit `majorToMinorInput('')` === '0', turning the
 * filter into a silent `≥ 0` that matches every row. `allowEmpty` makes a
 * cleared field emit '' so the caller maps it to `undefined`.
 *
 * The DEFAULT (money entry — price/sum fields) must keep emitting '0' on clear
 * so save-time `sum > 0` validation rejects an emptied amount.
 */
describe('MoneyInput allowEmpty', () => {
  it('displays the major (som) amount for a minor value', () => {
    render(<MoneyInput valueMinor="30000000" onChangeMinor={() => {}} data-test-id="m" />);
    expect((screen.getByTestId('m') as HTMLInputElement).value).toBe('300000');
  });

  it('emits the minor (tiyin) value for a typed major amount', () => {
    const onChange = vi.fn();
    render(<MoneyInput valueMinor="" allowEmpty onChangeMinor={onChange} data-test-id="m" />);
    fireEvent.change(screen.getByTestId('m'), { target: { value: '300000' } });
    expect(onChange).toHaveBeenLastCalledWith('30000000');
  });

  it("allowEmpty: clearing the field emits '' (not '0')", () => {
    const onChange = vi.fn();
    render(
      <MoneyInput valueMinor="30000000" allowEmpty onChangeMinor={onChange} data-test-id="m" />,
    );
    fireEvent.change(screen.getByTestId('m'), { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith('');
  });

  it("default (no allowEmpty): clearing the field emits '0'", () => {
    const onChange = vi.fn();
    render(<MoneyInput valueMinor="30000000" onChangeMinor={onChange} data-test-id="m" />);
    fireEvent.change(screen.getByTestId('m'), { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith('0');
  });

  it("allowEmpty: whitespace-only entry also emits ''", () => {
    const onChange = vi.fn();
    render(<MoneyInput valueMinor="" allowEmpty onChangeMinor={onChange} data-test-id="m" />);
    fireEvent.change(screen.getByTestId('m'), { target: { value: '   ' } });
    expect(onChange).toHaveBeenLastCalledWith('');
  });
});
