'use client';

import { type MessageTemplate, messageTemplateApi, smsApi } from '@/lib/sms-api';
import { Button, Modal, NativeSelect, Textarea, useToast } from '@moysklad/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';

/**
 * Umumiy SMS-tarqatma modali — tanlangan kontragentlar (ro'yxatdan checkbox) +
 * qo'lda kiritilgan raqamlar, tayyor shablon bilan. Backend `POST /sms/broadcast`.
 */
export function SmsBroadcastModal({
  counterpartyIds,
  open,
  onClose,
}: {
  counterpartyIds: string[];
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations('pages.sms_broadcast');
  const tCommon = useTranslations('common');
  const { toast } = useToast();
  const [templateId, setTemplateId] = useState('');
  const [manualText, setManualText] = useState('');

  const { data: templates = [] } = useQuery<MessageTemplate[]>({
    queryKey: ['message-templates', 'sms'],
    queryFn: () => messageTemplateApi.list('sms'),
    enabled: open,
  });
  const usable = useMemo(() => templates.filter((x) => x.enabled), [templates]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: default when list loads
  useEffect(() => {
    if (!templateId && usable.length) {
      setTemplateId(usable.find((x) => x.isDefault)?.id ?? usable[0]?.id ?? '');
    }
  }, [usable]);

  // Qo'lda kiritilgan raqamlar — bo'sh joy/vergul/yangi qator bilan ajratiladi.
  const phones = useMemo(
    () =>
      manualText
        .split(/[\s,;]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    [manualText],
  );
  const total = counterpartyIds.length + phones.length;

  const mut = useMutation({
    mutationFn: () => smsApi.broadcast({ templateId, counterpartyIds, phones }),
    onSuccess: (r) => {
      const parts = [t('result_queued', { count: r.queued })];
      if (r.skipped.length > 0) parts.push(t('result_skipped', { count: r.skipped.length }));
      const msg = parts.join(' · ');
      if (r.queued > 0) toast.success(msg);
      else toast.warning(msg);
      setManualText('');
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Modal open={open} onOpenChange={(v) => !v && onClose()} title={t('title')}>
      <div className="space-y-4 p-1">
        <div className="text-sm">
          {t('selected_counterparties')}: <b>{counterpartyIds.length}</b>
        </div>

        <div className="space-y-1">
          <label htmlFor="bc-template" className="block font-medium text-sm">
            {t('template')}
          </label>
          {/* DS NativeSelect — MASTER-TODO #12. */}
          <NativeSelect
            id="bc-template"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            data-test-id="broadcast-template"
          >
            {usable.length === 0 && <option value="">{t('no_template')}</option>}
            {usable.map((tpl) => (
              <option key={tpl.id} value={tpl.id}>
                {tpl.name}
                {tpl.isDefault ? ' ★' : ''}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div className="space-y-1">
          <label htmlFor="bc-manual" className="block font-medium text-sm">
            {t('manual_numbers')}
          </label>
          {/* DS Textarea — MASTER-TODO #12. min-h kept: this box is a
              free-text recipient list, deliberately taller than the default. */}
          <Textarea
            id="bc-manual"
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
            placeholder={t('manual_placeholder')}
            className="min-h-[70px]"
            data-test-id="broadcast-manual"
          />
          <div className="text-[var(--ms-text-muted)] text-xs">{t('manual_hint')}</div>
        </div>

        <div className="text-sm">
          {t('total_recipients')}: <b>{total}</b>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {tCommon('cancel')}
          </Button>
          <Button
            onClick={() => mut.mutate()}
            loading={mut.isPending}
            disabled={total === 0 || !templateId}
            data-test-id="broadcast-send"
          >
            {t('send')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
