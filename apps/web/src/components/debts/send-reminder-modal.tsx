'use client';

import { debtApi } from '@/lib/debt-api';
import { Button, Modal, useToast } from '@moysklad/ui';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export function SendReminderModal({
  ids,
  open,
  onClose,
}: {
  ids: string[];
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations('pages.debt_reminders');
  const tCommon = useTranslations('common');
  const { toast } = useToast();
  const [channel, setChannel] = useState<'sms' | 'telegram'>('sms');

  const mut = useMutation({
    mutationFn: () => debtApi.bulkReminders(ids, channel),
    onSuccess: (r) => {
      const parts = [t('result_queued', { count: r.queued })];
      if (r.skipped.length > 0) parts.push(t('result_skipped', { count: r.skipped.length }));
      const msg = parts.join(' · ');
      if (r.queued > 0) toast.success(msg);
      else toast.warning(msg);
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Modal open={open} onOpenChange={(v) => !v && onClose()} title={t('modal_title')}>
      <div className="space-y-4 p-1">
        <div className="text-sm">
          {t('recipients')}: <b>{ids.length}</b>
        </div>
        <fieldset className="space-y-2">
          <legend className="mb-1 font-medium text-sm">{t('channel')}</legend>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="radio"
              name="reminder-channel"
              checked={channel === 'sms'}
              onChange={() => setChannel('sms')}
            />
            {t('channel_sms')}
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="radio"
              name="reminder-channel"
              checked={channel === 'telegram'}
              onChange={() => setChannel('telegram')}
            />
            {t('channel_telegram')}
          </label>
        </fieldset>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {tCommon('cancel')}
          </Button>
          <Button onClick={() => mut.mutate()} loading={mut.isPending} disabled={ids.length === 0}>
            {t('confirm')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
