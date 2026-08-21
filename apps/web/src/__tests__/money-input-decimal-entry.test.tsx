import { MoneyInput } from '@moysklad/ui';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

/**
 * Tiyin (kasr) kiritish — 2026-08-21, egasi: «(. va ,) dan keyin nechi tiyin
 * bo'lishini yozish umuman ishlamayapti».
 *
 * Maydon dam olish holatida «1 000,00» ko'rsatadi, ya'ni ikkita tiyin raqami
 * ALLAQACHON bor. Fokus olganda matn tanlanmasa, foydalanuvchi oxiriga bosib
 * yozgan har bir belgi kesilib ketardi (kasr 2 xonaga cheklangan) — tashqaridan
 * bu «umuman ishlamayapti» bo'lib ko'rinardi.
 *
 * Shartnoma: fokusda butun qiymat TANLANADI, ya'ni foydalanuvchi «1000,50» deb
 * yozsa u eski qiymat ustiga yoziladi va tiyin joyiga tushadi.
 */
describe('MoneyInput — tiyin kiritish', () => {
  it('fokus olganda butun qiymat tanlanadi (ustiga yozish mumkin)', () => {
    render(<MoneyInput valueMinor="100000" onChangeMinor={() => {}} data-test-id="m" />);
    const el = screen.getByTestId('m') as HTMLInputElement;
    const select = vi.spyOn(el, 'select');
    fireEvent.focus(el);
    expect(select).toHaveBeenCalled();
  });

  it('«1000,50» yozilsa 100050 tiyin chiqadi', () => {
    const onChange = vi.fn();
    render(<MoneyInput valueMinor="100000" onChangeMinor={onChange} data-test-id="m" />);
    fireEvent.change(screen.getByTestId('m'), { target: { value: '1000,50' } });
    expect(onChange).toHaveBeenLastCalledWith('100050');
  });

  it('«1000.50» (nuqta bilan) ham bir xil ishlaydi', () => {
    const onChange = vi.fn();
    render(<MoneyInput valueMinor="0" onChangeMinor={onChange} data-test-id="m" />);
    fireEvent.change(screen.getByTestId('m'), { target: { value: '1000.50' } });
    expect(onChange).toHaveBeenLastCalledWith('100050');
  });

  it("ekranda ko'rinayotgan matn aynan o'sha tiyinni beradi (ajralish yo'q)", () => {
    const onChange = vi.fn();
    render(<MoneyInput valueMinor="100000" onChangeMinor={onChange} data-test-id="m" />);
    const el = screen.getByTestId('m') as HTMLInputElement;
    // Oxiriga ortiqcha belgi qo'shilgan holat — ilgari ekran «1 000,00»,
    // qiymat esa 100001 yoki 0 bo'lib ketardi.
    fireEvent.change(el, { target: { value: '1 000,005' } });
    expect(onChange).toHaveBeenLastCalledWith('100000');
    // Guruhlash probeli ko'rinmas belgi (ingichka/nbsp) — turini qat'iy
    // qulflamaymiz, faqat RAQAMLAR mos kelishini tekshiramiz.
    expect(el.value.replace(/\s/g, ' ')).toBe('1 000,00');
  });
});
