'use client';

/**
 * Kontragentga xabar yuborish — birlashtirilgan oqim (2026-07-21 talab):
 * Kanal (Telegram / SMS) × Rejim (Shablon / Erkin).
 *  - Shablon: tayyor shablonlar bo'yicha yuboradi
 *    (SMS → /sms/broadcast bitta id; Telegram → /telegram/counterparty/:id/send-template).
 *  - Erkin + Telegram: to'liq ikki-tomonlama chat (OrderTelegramPanel).
 *  - Erkin + SMS: yozish oynasi + shu kontragentga yuborilgan SMS tarixi
 *    (SMS bir tomonlama — chat emas, faqat kompoz + tarix).
 */

import { OrderTelegramPanel } from '@/components/telegram/order-telegram-panel';
import { api } from '@/lib/api-client';
import { messageTemplateApi, smsApi } from '@/lib/sms-api';
import { Button, Modal, useToast } from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

type Channel = 'sms' | 'telegram';
type Mode = 'template' | 'custom';

export function SendMessageModal({
  counterpartyId,
  counterpartyName,
  phone,
  open,
  onClose,
}: {
  counterpartyId: string;
  counterpartyName: string;
  phone: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations('pages.counterparty_message');
  const tc = useTranslations('common');
  const { toast } = useToast();
  const qc = useQueryClient();

  const [channel, setChannel] = useState<Channel>('telegram');
  const [mode, setMode] = useState<Mode>('template');
  const [templateId, setTemplateId] = useState<string | undefined>();
  const [text, setText] = useState('');

  const { data: templates = [] } = useQuery({
    queryKey: ['message-templates', channel],
    queryFn: () => messageTemplateApi.list(channel),
    enabled: open,
  });
  const usable = templates.filter((x) => x.enabled);
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on channel/list change
  useEffect(() => {
    setTemplateId(usable.find((x) => x.isDefault)?.id ?? usable[0]?.id);
  }, [channel, templates]);

  const smsLogs = useQuery({
    queryKey: ['cp-sms-logs', counterpartyId],
    queryFn: () => smsApi.logs({ entityId: counterpartyId, limit: 30 }),
    enabled: open && channel === 'sms' && mode === 'custom',
  });

  const templateMut = useMutation({
    mutationFn: () => {
      if (!templateId) throw new Error(t('err_no_template'));
      return channel === 'sms'
        ? smsApi.broadcast({ templateId, counterpartyIds: [counterpartyId], phones: [] })
        : api.post(`/telegram/counterparty/${counterpartyId}/send-template`, { templateId });
    },
    onSuccess: () => {
      toast.success(t('sent'));
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const smsSendMut = useMutation({
    mutationFn: () => {
      if (!phone) throw new Error(t('err_no_phone'));
      if (!text.trim()) throw new Error(t('err_empty'));
      return smsApi.send({
        toPhone: phone,
        body: text.trim(),
        entity: 'counterparty',
        entityId: counterpartyId,
      });
    },
    onSuccess: () => {
      toast.success(t('sms_queued'));
      setText('');
      qc.invalidateQueries({ queryKey: ['cp-sms-logs', counterpartyId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const items = smsLogs.data?.items ?? [];

  return (
    <Modal
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title={`${t('title')} — ${counterpartyName}`}
      widthClass="w-[560px]"
    >
      <div className="space-y-4 p-1">
        <Seg
          label={t('channel')}
          value={channel}
          onChange={(v) => setChannel(v as Channel)}
          options={[
            { v: 'telegram', l: 'Telegram' },
            { v: 'sms', l: 'SMS' },
          ]}
        />
        <Seg
          label={t('mode')}
          value={mode}
          onChange={(v) => setMode(v as Mode)}
          options={[
            { v: 'template', l: t('mode_template') },
            { v: 'custom', l: t('mode_custom') },
          ]}
        />

        {mode === 'template' ? (
          <div className="space-y-3">
            {usable.length === 0 ? (
              <p className="text-[var(--ms-text-muted)] text-sm">{t('no_templates')}</p>
            ) : (
              <>
                <label className="block font-medium text-[var(--ms-text-secondary)] text-sm">
                  {t('template')}
                  <select
                    value={templateId ?? ''}
                    onChange={(e) => setTemplateId(e.target.value || undefined)}
                    className="mt-1 h-9 w-full rounded-[var(--ms-radius)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] px-2 text-sm"
                    data-test-id="cp-msg-template-select"
                  >
                    {usable.map((tpl) => (
                      <option key={tpl.id} value={tpl.id}>
                        {tpl.name}
                        {tpl.isDefault ? ` · ${t('default')}` : ''}
                      </option>
                    ))}
                  </select>
                </label>
                {templateId && (
                  <pre className="max-h-36 overflow-auto whitespace-pre-wrap rounded-[var(--ms-radius)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-app)] p-2 text-[var(--ms-text-muted)] text-xs">
                    {usable.find((x) => x.id === templateId)?.body}
                  </pre>
                )}
              </>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={onClose}>
                {tc('cancel')}
              </Button>
              <Button
                onClick={() => templateMut.mutate()}
                loading={templateMut.isPending}
                disabled={!templateId}
              >
                {t('send')}
              </Button>
            </div>
          </div>
        ) : channel === 'telegram' ? (
          <div className="h-[440px] overflow-hidden rounded-[var(--ms-radius)] border border-[var(--ms-border-default)]">
            <OrderTelegramPanel
              counterpartyId={counterpartyId}
              counterpartyName={counterpartyName}
            />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="max-h-40 space-y-1 overflow-auto rounded-[var(--ms-radius)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-app)] p-2">
              {items.length === 0 ? (
                <p className="text-[var(--ms-text-muted)] text-xs">{t('sms_no_history')}</p>
              ) : (
                items.map((l) => (
                  <div key={l.id} className="rounded bg-[var(--ms-bg-surface)] p-1.5 text-xs">
                    <div className="text-[var(--ms-text-primary)]">{l.body}</div>
                    <div className="mt-0.5 text-[10px] text-[var(--ms-text-muted)]">
                      {new Date(l.createdAt).toLocaleString()} · {l.status}
                    </div>
                  </div>
                ))
              )}
            </div>
            {!phone && (
              <p className="text-[var(--ms-text-destructive)] text-xs">{t('err_no_phone')}</p>
            )}
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              placeholder={t('sms_placeholder')}
              className="w-full rounded-[var(--ms-radius)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-2 text-sm"
              data-test-id="cp-msg-sms-text"
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={onClose}>
                {tc('cancel')}
              </Button>
              <Button
                onClick={() => smsSendMut.mutate()}
                loading={smsSendMut.isPending}
                disabled={!phone || !text.trim()}
              >
                {t('send')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function Seg({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { v: string; l: string }[];
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-16 shrink-0 font-medium text-[var(--ms-text-secondary)] text-sm">
        {label}
      </span>
      <div className="inline-flex overflow-hidden rounded-[var(--ms-radius)] border border-[var(--ms-border-default)]">
        {options.map((o) => (
          <button
            key={o.v}
            type="button"
            onClick={() => onChange(o.v)}
            className={
              value === o.v
                ? 'bg-[var(--ms-bg-app)] px-3 py-1.5 font-semibold text-[var(--ms-text-brand)] text-sm'
                : 'bg-[var(--ms-bg-surface)] px-3 py-1.5 text-[var(--ms-text-muted)] text-sm'
            }
          >
            {o.l}
          </button>
        ))}
      </div>
    </div>
  );
}
