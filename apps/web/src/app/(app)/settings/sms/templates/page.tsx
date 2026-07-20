'use client';

import { type MessageTemplate, type TemplateChannel, messageTemplateApi } from '@/lib/sms-api';
import { smsSegments } from '@/lib/sms-segments';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  FormField,
  Input,
  PageHeader,
  SegmentedControl,
  useToast,
} from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

const VARS = [
  'counterparty.name',
  'debt.remainingFormatted',
  'debt.totalFormatted',
  'company.phone',
  'company.card',
  'company.cardOwner',
];

// Preview uchun namuna kontekst — server render bilan bir xil o'zgaruvchilar.
function preview(body: string): string {
  const ctx: Record<string, string> = {
    'counterparty.name': 'Akmal aka',
    'debt.remainingFormatted': '1 250 000',
    'debt.totalFormatted': '2 000 000',
    'company.phone': '+998915748800',
    'company.card': '9860 1201 2532 1642',
    'company.cardOwner': 'Ilhom Ziyaviddinov',
  };
  return body.replace(/\{\{=\s*([\w.]+)\s*\}\}/g, (_m, k) => ctx[k] ?? `{{= ${k} }}`);
}

export default function SmsTemplatesPage() {
  const qc = useQueryClient();
  const t = useTranslations('pages.sms_templates');
  const { toast } = useToast();

  const [channel, setChannel] = useState<TemplateChannel>('sms');
  const { data } = useQuery<MessageTemplate[]>({
    queryKey: ['message-templates', channel],
    queryFn: () => messageTemplateApi.list(channel),
  });

  const [activeId, setActiveId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [body, setBody] = useState('');
  const [enabled, setEnabled] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Kanal o'zgarganda yoki ro'yxat yangilanganda — default (yoki birinchi) shablonni tanla.
  useEffect(() => {
    if (!data || data.length === 0) {
      setActiveId(null);
      return;
    }
    const current = data.find((x) => x.id === activeId);
    const tpl = current ?? data.find((x) => x.isDefault) ?? data[0];
    if (!tpl) return;
    setActiveId(tpl.id);
    setName(tpl.name);
    setBody(tpl.body);
    setEnabled(tpl.enabled);
  }, [data, activeId]);

  const active = data?.find((x) => x.id === activeId) ?? null;

  const saveMut = useMutation({
    mutationFn: () => {
      if (!activeId) throw new Error(t('none'));
      return messageTemplateApi.update(activeId, { name, body, enabled });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['message-templates'] });
      toast.success(t('saved'));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setDefaultMut = useMutation({
    mutationFn: () => {
      if (!activeId) throw new Error(t('none'));
      return messageTemplateApi.setDefault(activeId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['message-templates'] });
      toast.success(t('saved'));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const insertVar = (v: string) => {
    const el = textareaRef.current;
    const token = `{{= ${v} }}`;
    if (!el) {
      setBody((b) => b + token);
      return;
    }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    setBody(body.slice(0, start) + token + body.slice(end));
  };

  const seg = smsSegments(preview(body));

  return (
    <div className="p-6">
      <PageHeader title={t('title')} subtitle={t('description')} />

      <div className="mb-4 max-w-2xl">
        <SegmentedControl<TemplateChannel>
          value={channel}
          onChange={(v) => {
            setChannel(v);
            setActiveId(null);
          }}
          options={[
            { value: 'sms', label: t('channel_sms') },
            { value: 'telegram', label: t('channel_telegram') },
          ]}
        />
      </div>

      {data && data.length > 1 && (
        <div className="mb-3 flex max-w-2xl flex-wrap gap-1">
          {data.map((tpl) => (
            <Button
              key={tpl.id}
              type="button"
              variant={tpl.id === activeId ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setActiveId(tpl.id)}
            >
              {tpl.name}
              {tpl.isDefault ? ' ★' : ''}
            </Button>
          ))}
        </div>
      )}

      {!active ? (
        <Card className="max-w-2xl p-4 text-[var(--ms-text-muted)] text-sm">{t('none')}</Card>
      ) : (
        <Card className="max-w-2xl space-y-4 p-4">
          <div className="flex items-center gap-2">
            <FormField id="tpl-name" label={t('name')} className="flex-1">
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </FormField>
            {active.isDefault ? (
              <Badge tone="success">{t('is_default')}</Badge>
            ) : (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setDefaultMut.mutate()}
                loading={setDefaultMut.isPending}
              >
                {t('set_default')}
              </Button>
            )}
          </div>

          <div className="flex flex-wrap gap-1">
            {VARS.map((v) => (
              <Button
                key={v}
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => insertVar(v)}
              >
                {`{{ ${v} }}`}
              </Button>
            ))}
          </div>

          <FormField id="tpl-body" label={t('body')}>
            <textarea
              ref={textareaRef}
              className="min-h-[120px] w-full rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-3 text-sm"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </FormField>

          {channel === 'sms' && (
            <div className="flex items-center gap-2 text-[var(--ms-text-muted)] text-xs">
              <Badge tone={seg.segments > 1 ? 'warning' : 'neutral'}>
                {seg.chars} {t('chars')} · {seg.segments} {t('segments')}
              </Badge>
              {seg.encoding === 'unicode' && <span>unicode (70/SMS)</span>}
            </div>
          )}

          <div className="rounded-[var(--ms-radius-default)] bg-[var(--ms-bg-muted)] p-3 text-sm">
            <div className="mb-1 text-[var(--ms-text-muted)] text-xs">{t('preview')}</div>
            <div className="whitespace-pre-wrap">{preview(body)}</div>
          </div>

          <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox checked={enabled} onCheckedChange={(v) => setEnabled(!!v)} />
            <span>{t('enabled')}</span>
          </label>

          <div>
            <Button type="button" onClick={() => saveMut.mutate()} loading={saveMut.isPending}>
              {t('save')}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
