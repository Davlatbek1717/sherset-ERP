import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import messages from '../../../messages/uz.json';
import { PinKeypad } from '../pin-keypad';

function renderKeypad(props: Partial<React.ComponentProps<typeof PinKeypad>> = {}) {
  const onChange = vi.fn();
  const onSubmit = vi.fn();
  render(
    <NextIntlClientProvider locale="uz" messages={messages}>
      <PinKeypad
        value=""
        onChange={onChange}
        onSubmit={onSubmit}
        disabled={false}
        maxLength={6}
        {...props}
      />
    </NextIntlClientProvider>,
  );
  return { onChange, onSubmit };
}

describe('PinKeypad', () => {
  it('0–9 tugmalari bor', () => {
    renderKeypad();
    for (const d of '0123456789') {
      expect(screen.getByRole('button', { name: d })).toBeTruthy();
    }
  });

  it('raqam bosilsa onChange qo`shilgan qiymat bilan chaqiriladi', () => {
    const { onChange } = renderKeypad({ value: '12' });
    fireEvent.click(screen.getByRole('button', { name: '3' }));
    expect(onChange).toHaveBeenCalledWith('123');
  });

  it('maxLength ga yetganda yangi raqam QO`SHILMAYDI', () => {
    const { onChange } = renderKeypad({ value: '123456', maxLength: 6 });
    fireEvent.click(screen.getByRole('button', { name: '7' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('o`chirish oxirgi raqamni olib tashlaydi', () => {
    const { onChange } = renderKeypad({ value: '123' });
    fireEvent.click(screen.getByRole('button', { name: messages.kassaLogin.backspace }));
    expect(onChange).toHaveBeenCalledWith('12');
  });

  it('bo`sh qiymatda o`chirish xato bermaydi', () => {
    const { onChange } = renderKeypad({ value: '' });
    fireEvent.click(screen.getByRole('button', { name: messages.kassaLogin.backspace }));
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('«Tozalash» butun qiymatni bo`shatadi', () => {
    const { onChange } = renderKeypad({ value: '1234' });
    fireEvent.click(screen.getByRole('button', { name: messages.kassaLogin.clear }));
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('kiritilgan raqamlar OCHIQ ko`rinmaydi (nuqta bilan)', () => {
    renderKeypad({ value: '1234' });
    expect(screen.queryByText('1234')).toBeNull();
  });

  it('disabled bo`lsa raqam bosilmaydi', () => {
    const { onChange } = renderKeypad({ value: '1', disabled: true });
    fireEvent.click(screen.getByRole('button', { name: '5' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('«Kirish» onSubmit chaqiradi', () => {
    const { onSubmit } = renderKeypad({ value: '1234' });
    fireEvent.click(screen.getByRole('button', { name: messages.kassaLogin.submit }));
    expect(onSubmit).toHaveBeenCalled();
  });

  it('4 raqamdan kam bo`lsa «Kirish» o`chirilgan', () => {
    renderKeypad({ value: '12' });
    const btn = screen.getByRole('button', {
      name: messages.kassaLogin.submit,
    }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});
