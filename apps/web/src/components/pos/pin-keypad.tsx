'use client';

import { useTranslations } from 'next-intl';

/**
 * Kassa PIN klaviaturasi — SOF prezentatsion (tarmoq yo'q, holat yo'q).
 *
 * Katta tugmalar sensorli ekran uchun: kassa monitorlari ko'pincha teginishli
 * va kassirda sichqoncha bo'lmaydi.
 */
export interface PinKeypadProps {
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
  disabled: boolean;
  maxLength: number;
}

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;

export function PinKeypad({ value, onChange, onSubmit, disabled, maxLength }: PinKeypadProps) {
  const t = useTranslations('kassaLogin');

  const press = (d: string) => {
    // Chegaraga yetganda JIM e'tiborsiz — xato ko'rsatish kassirni
    // chalg'itardi, u shunchaki ortiqcha bosgan bo'ladi.
    if (disabled || value.length >= maxLength) return;
    onChange(value + d);
  };

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Kiritilgan raqamlar OCHIQ ko'rsatilmaydi — kassa monitorini mijoz ham ko'radi.
          Nuqtalar soni ENDI O'ZGARMAS: aynan `maxLength` ta. Ilgari u kiritish
          bilan o'sardi (server 4–6 ni qabul qilgani uchun) va o'sadigan
          indikator kassirga «yana bosaverish mumkin» degan ishora berardi —
          egasi 2026-08-12 da aynan shunday 5-, keyin 6-raqamni kiritdi.
          Qat'iy N ta doira = qat'iy N raqam, boshqa o'qish yo'q. */}
      <div className="flex h-12 items-center gap-3" aria-label={t('pin_label')}>
        {Array.from({ length: maxLength }, (_, i) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: pozitsiya-indikator, ro'yxat emas
            key={i}
            className={`h-4 w-4 rounded-full border-2 ${
              i < value.length
                ? 'border-[var(--ms-brand-500)] bg-[var(--ms-brand-500)]'
                : 'border-[var(--ms-border-default)]'
            }`}
          />
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {DIGITS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => press(d)}
            disabled={disabled}
            className="h-20 w-20 rounded-[var(--ms-radius-md)] bg-[var(--ms-bg-surface)] font-semibold text-2xl shadow-[var(--ms-shadow-sm)] disabled:opacity-50"
          >
            {d}
          </button>
        ))}

        <button
          type="button"
          onClick={() => !disabled && onChange('')}
          disabled={disabled}
          className="h-20 w-20 rounded-[var(--ms-radius-md)] bg-[var(--ms-bg-muted)] text-sm disabled:opacity-50"
        >
          {t('clear')}
        </button>

        <button
          type="button"
          onClick={() => press('0')}
          disabled={disabled}
          className="h-20 w-20 rounded-[var(--ms-radius-md)] bg-[var(--ms-bg-surface)] font-semibold text-2xl shadow-[var(--ms-shadow-sm)] disabled:opacity-50"
        >
          0
        </button>

        <button
          type="button"
          onClick={() => !disabled && onChange(value.slice(0, -1))}
          disabled={disabled}
          className="h-20 w-20 rounded-[var(--ms-radius-md)] bg-[var(--ms-bg-muted)] text-sm disabled:opacity-50"
        >
          {t('backspace')}
        </button>
      </div>

      <button
        type="button"
        onClick={onSubmit}
        // Uzunlik AYNAN bitta ⇒ «to'liq emas» va «juda uzun» bir shart.
        disabled={disabled || value.length !== maxLength}
        className="h-14 w-full rounded-[var(--ms-radius-md)] bg-[var(--ms-brand-500)] font-semibold text-white disabled:opacity-50"
      >
        {t('submit')}
      </button>
    </div>
  );
}
