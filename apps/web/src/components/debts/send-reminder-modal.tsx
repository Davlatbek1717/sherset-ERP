'use client';

import { debtApi } from '@/lib/debt-api';
import { messageTemplateApi } from '@/lib/sms-api';
import { Button, Modal, NativeSelect, RadioGroup, useToast } from '@moysklad/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

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
  const [templateId, setTemplateId] = useState<string | undefined>();

  // Tanlangan kanal shablonlari (kutubxona). Modal ochiq bo'lgandagina yuklanadi.
  const { data: templates = [] } = useQuery({
    queryKey: ['message-templates', channel],
    queryFn: () => messageTemplateApi.list(channel),
    enabled: open,
  });
  const usable = templates.filter((x) => x.enabled);

  // Kanal o'zgarganда yoki ro'yxat kelganда — default (yoki birinchi) shablonni tanlab qo'yamiz.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on channel/list change
  useEffect(() => {
    setTemplateId(usable.find((x) => x.isDefault)?.id ?? usable[0]?.id);
  }, [channel, templates]);

  const mut = useMutation({
    mutationFn: () => debtApi.bulkReminders(ids, channel, templateId),
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
          <RadioGroup
            name="reminder-channel"
            value={channel}
            onChange={setChannel}
            ariaLabel={t('channel')}
            options={[
              { value: 'sms', label: t('channel_sms') },
              { value: 'telegram', label: t('channel_telegram') },
            ]}
          />
        </fieldset>

        {/* Shablon tanlagich — tanlangan kanalда shablon bo'lsa. Bo'sh bo'lsa
            (shablon yo'q) backend default/fallback ishlatadi. */}
        {usable.length > 0 && (
          <div className="space-y-1">
            <label
              htmlFor="reminder-template"
              className="block font-medium text-[var(--ms-text-secondary)] text-sm"
            >
              {t('template')}
            </label>
            {/* DS NativeSelect — MASTER-TODO #12. */}
            <NativeSelect
              id="reminder-template"
              value={templateId ?? ''}
              onChange={(e) => setTemplateId(e.target.value || undefined)}
              data-test-id="reminder-template-select"
            >
              {usable.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.name}
                  {tpl.isDefault ? ` · ${t('template_default')}` : ''}
                </option>
              ))}
            </NativeSelect>
          </div>
        )}

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
