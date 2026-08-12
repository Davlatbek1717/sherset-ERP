import { fireEvent, renderWithProviders, screen, waitFor } from '@/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '../../../messages/uz.json';
import KassaKirishPage from '../page';

/**
 * 🔴 EGASINING JONLI SHIKOYATI (2026-08-12) — SAHIFA DARAJASIDA QAYTA ISHLAB CHIQARISH.
 *
 * «5 marta raqamlarni bosganimda 5 xonalik bo'lib qoldi. Yana bitta
 * bosganimdan keyin 6 ta bo'ldi.»
 *
 * NEGA KOMPONENT TESTI YETMAGAN: `pin-keypad.test.tsx` chegarani TEKSHIRARDI va
 * YASHIL edi — u `maxLength` ni test o'zi uzatadi. Xato esa `PinKeypad` da emas,
 * unga SAHIFA uzatgan sonda (`MAX_PIN = 6`) edi. Ya'ni butun bug-klass komponent
 * testining ko'r nuqtasida yashagan: «to'g'ri komponent + noto'g'ri argument».
 *
 * Shuning uchun bu yerda haqiqiy sahifa render qilinadi va tugmalar HAQIQATAN
 * bosiladi — serverga ketadigan PIN o'lchanadi, prop emas.
 */

const posLogin = vi.fn();
const replace = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));
vi.mock('@/lib/auth-store', () => ({ posLogin: (...a: unknown[]) => posLogin(...a) }));
vi.mock('@/lib/pos-device', () => ({ readPosDevice: () => null }));

const t = messages.kassaLogin;

const press = (label: string) => fireEvent.click(screen.getByRole('button', { name: label }));
const submitBtn = () => screen.getByRole('button', { name: t.submit }) as HTMLButtonElement;
const dots = () => [...screen.getByLabelText(t.pin_label).querySelectorAll('span')];
const filledDots = () => dots().filter((s) => s.className.includes('bg-[var(--ms-brand-500)]'));

describe('/kassa-kirish — PIN AYNAN 4 raqam', () => {
  beforeEach(() => {
    posLogin.mockReset().mockResolvedValue(undefined);
    replace.mockReset();
    renderWithProviders(<KassaKirishPage />);
  });

  it('doiralar HAR DOIM 4 ta (6 ta EMAS)', () => {
    expect(dots()).toHaveLength(4);
  });

  it('🔴 5-bosish HISOBGA OLINMAYDI — 4 ta doira to`la qoladi', () => {
    for (const d of '12345') press(d);
    expect(dots()).toHaveLength(4);
    expect(filledDots()).toHaveLength(4);
  });

  it('🔴 6-bosishdan keyin ham serverga AYNAN 4 raqam ketadi', async () => {
    for (const d of '123456') press(d);
    fireEvent.click(submitBtn());
    await waitFor(() => expect(posLogin).toHaveBeenCalled());
    expect(posLogin).toHaveBeenCalledWith(null, '1234');
  });

  it('«Kirish» 4 raqamgacha o`chirilgan, 4 da yonadi', () => {
    expect(submitBtn().disabled).toBe(true);
    for (const d of '123') press(d);
    expect(submitBtn().disabled).toBe(true);
    press('4');
    expect(submitBtn().disabled).toBe(false);
  });

  it('o`chirish 4 tadan pastga tushiradi va «Kirish» yana o`chadi', () => {
    for (const d of '1234') press(d);
    press(t.backspace);
    expect(filledDots()).toHaveLength(3);
    expect(submitBtn().disabled).toBe(true);
  });
});
