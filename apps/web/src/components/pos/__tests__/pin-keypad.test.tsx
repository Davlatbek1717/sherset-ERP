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
        maxLength={4}
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

  /**
   * 🔴 EGASINING JONLI SINOVI (2026-08-12): 5-raqam bosilganda u KIRITILDI,
   * 6-raqam ham. Sabab kirish sahifasidagi `MAX_PIN = 6` edi. Endi chegara
   * AYNAN 4 — bu test 5-bosishni qo'riqlaydi, 7-bosishni emas.
   */
  it('4 raqam kiritilgach 5-raqam QO`SHILMAYDI', () => {
    const { onChange } = renderKeypad({ value: '1234', maxLength: 4 });
    fireEvent.click(screen.getByRole('button', { name: '5' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('«0» ham chegaradan o`tkazmaydi (alohida tugma — o`z yo`li bor)', () => {
    const { onChange } = renderKeypad({ value: '1234', maxLength: 4 });
    fireEvent.click(screen.getByRole('button', { name: '0' }));
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

  /**
   * Nuqtalar soni — kassirning «PIN necha raqamli?» degan yagona ishorasi.
   * Endi u O'ZGARMAS: `maxLength` (= 4) ta. Ilgari u kiritish bilan O'SARDI,
   * chunki server 4–6 ni qabul qilardi; o'sadigan indikator esa «yana raqam
   * bosish mumkin» degan ishora berardi va aynan shu egasini 5–6 raqam
   * kiritishga olib keldi (2026-08-12). Qat'iy 4 ta doira = qat'iy 4 raqam.
   */
  describe('nuqtalar soni', () => {
    const dots = (): number =>
      screen.getByLabelText(messages.kassaLogin.pin_label).querySelectorAll('span').length;

    it.each([
      ['bo`sh', ''],
      ['yarim', '12'],
      ['to`la', '1234'],
    ])('%s qiymatda ham AYNAN 4 ta', (_case, value) => {
      renderKeypad({ value, maxLength: 4 });
      expect(dots()).toBe(4);
    });

    it('to`ldirilgan doiralar soni = kiritilgan raqamlar soni', () => {
      renderKeypad({ value: '12', maxLength: 4 });
      const filled = [
        ...screen.getByLabelText(messages.kassaLogin.pin_label).querySelectorAll('span'),
      ].filter((s) => s.className.includes('bg-[var(--ms-brand-500)]'));
      expect(filled).toHaveLength(2);
    });
  });
});
