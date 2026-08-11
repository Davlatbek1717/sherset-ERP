'use client';

/**
 * Kassa PIN-kodini ADMIN tomonidan qo'yish / o'chirish.
 *
 * 🔴 NEGA KERAK (2026-08-11, egasi real qurilmada urildi): PIN'ni qo'yadigan
 * yagona endpoint `POST /auth/pos-pin` edi va u FAQAT o'ziga ishlardi
 * (`user.sub`). Kassir esa kiosk rejimida — sozlamalarga umuman kira olmaydi.
 * Natijada yangi kassir qo'shilganda PIN qo'yadigan joy HECH QAYERDA yo'q edi:
 * PIN faqat ops-skript bilan yozilardi. Endi xodim kartasida.
 *
 * Naqsh `reset-password-modal.tsx` dan olingan (admin xodimga parol qo'yadi) —
 * ikkalasi bir xil daraja: kassa hisobiga kirish yo'li.
 */

import { useApiMutation } from '@/hooks/use-api-mutation';
import { api } from '@/lib/api-client';
import { Button, Input, Modal } from '@moysklad/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

/** Server sxemasi bilan bir xil: 4–6 raqam (`SetEmployeePosPinSchema`). */
const PIN_RE = /^\d{4,6}$/;

export function PosPinModal({
  open,
  onOpenChange,
  employeeId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId: string;
}) {
  const t = useTranslations('pages.employee_card');
  const tCommon = useTranslations('common');
  const qc = useQueryClient();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);

  // PIN QIYMATI hech qachon qaytmaydi — faqat bor/yo'q. Xesh qaytarilsa
  // uni ekrandan o'qib olish mumkin bo'lardi.
  const { data } = useQuery<{ hasPin: boolean }>({
    queryKey: ['employee-pos-pin', employeeId],
    queryFn: () => api.get(`/auth/pos-pin/employee/${employeeId}`),
    enabled: open,
  });

  useEffect(() => {
    if (open) {
      setPin('');
      setError(null);
    }
  }, [open]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['employee-pos-pin', employeeId] });
  };

  const save = useApiMutation<unknown, Error, void>({
    mutationFn: () => api.post(`/auth/pos-pin/employee/${employeeId}`, { pin }),
    successMessage: t('pos_pin_saved'),
    onSuccess: () => {
      invalidate();
      onOpenChange(false);
    },
  });

  // `pin: null` = o'chirish (server shartnomasi). Xodim ketganda uning
  // kassaga kirish yo'li yopilishi kerak.
  const clear = useApiMutation<unknown, Error, void>({
    mutationFn: () => api.post(`/auth/pos-pin/employee/${employeeId}`, { pin: null }),
    successMessage: t('pos_pin_cleared'),
    onSuccess: () => {
      invalidate();
      onOpenChange(false);
    },
  });

  function submit() {
    if (!PIN_RE.test(pin)) {
      setError(t('pos_pin_invalid'));
      return;
    }
    setError(null);
    save.mutate();
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={t('pos_pin_title')}>
      <div className="flex flex-col gap-3">
        <p className="text-[13px] text-[var(--ms-text-muted)]">{t('pos_pin_hint')}</p>

        <div className="text-[13px]">
          {t('pos_pin_status')}:{' '}
          <b>{data?.hasPin ? t('pos_pin_status_set') : t('pos_pin_status_none')}</b>
        </div>

        <Input
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="1234"
          inputMode="numeric"
          autoComplete="off"
          data-testid="employee-pos-pin-input"
        />

        {error && <p className="text-[13px] text-[var(--ms-text-danger)]">{error}</p>}

        <div className="flex justify-between gap-2">
          <Button
            variant="secondary"
            onClick={() => clear.mutate()}
            disabled={!data?.hasPin || clear.isPending}
            data-testid="employee-pos-pin-clear"
          >
            {t('pos_pin_clear')}
          </Button>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              {tCommon('cancel')}
            </Button>
            <Button onClick={submit} disabled={save.isPending} data-testid="employee-pos-pin-save">
              {tCommon('save')}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
