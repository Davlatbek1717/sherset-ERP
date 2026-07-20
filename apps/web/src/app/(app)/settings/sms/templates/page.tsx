'use client';

import { type SmsTemplate, smsApi } from '@/lib/sms-api';
import { smsSegments } from '@/lib/sms-segments';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  FormField,
  Input,
  PageHeader,
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
  const { data } = useQuery<SmsTemplate[]>({
    queryKey: ['sms-templates'],
    queryFn: () => smsApi.listTemplates(),
  });

  const [name, setName] = useState('');
  const [body, setBody] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [activeKey, setActiveKey] = useState<string>('debt_reminder');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const tpl = data?.find((x) => x.key === activeKey) ?? data?.[0];
    if (!tpl) return;
    setActiveKey(tpl.key);
    setName(tpl.name);
    setBody(tpl.body);
    setEnabled(tpl.enabled);
  }, [data, activeKey]);

  const saveMut = useMutation({
    mutationFn: () => smsApi.saveTemplate(activeKey, { name, body, enabled }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sms-templates'] });
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
      <Card className="max-w-2xl space-y-4 p-4">
        <FormField id="tpl-name" label={t('name')}>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </FormField>

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

        <div className="flex items-center gap-2 text-[var(--ms-text-muted)] text-xs">
          <Badge tone={seg.segments > 1 ? 'warning' : 'neutral'}>
            {seg.chars} {t('chars')} · {seg.segments} {t('segments')}
          </Badge>
          {seg.encoding === 'unicode' && <span>unicode (70/SMS)</span>}
        </div>

        <div className="rounded-[var(--ms-radius-default)] bg-[var(--ms-bg-muted)] p-3 text-sm">
          <div className="mb-1 text-[var(--ms-text-muted)] text-xs">{t('preview')}</div>
          {preview(body)}
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
    </div>
  );
}
