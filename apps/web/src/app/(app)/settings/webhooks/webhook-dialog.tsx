'use client';

import { api } from '@/lib/api-client';
import {
  Alert,
  Button,
  Checkbox,
  FormField,
  Input,
  Label,
  Modal,
  NativeSelect,
} from '@moysklad/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

interface WebhookRow {
  id: string;
  entityType: string;
  action: string;
  url: string;
  secretHash: string | null;
  diffType: string | null;
  enabled: boolean;
  authContext: Record<string, unknown> | null;
}

const ENTITY_TYPES = [
  // Documents
  'customerorder',
  'demand',
  'invoiceout',
  'salesreturn',
  'purchaseorder',
  'supply',
  'invoicein',
  'purchasereturn',
  'move',
  'loss',
  'enter',
  'inventory',
  'paymentin',
  'paymentout',
  'cashin',
  'cashout',
  'retailshift',
  'retaildemand',
  'retailsalesreturn',
  // Reference
  'product',
  'variant',
  'bundle',
  'service',
  'productfolder',
  'counterparty',
  'contactperson',
  'organization',
  'store',
  'employee',
  'project',
  'contract',
  'cashdesk',
  'pricetype',
  'currency',
  'state',
  'task',
  'opportunity',
] as const;

const ACTIONS = ['CREATE', 'UPDATE', 'DELETE'] as const;

interface BaseProps {
  onClose: () => void;
  onSaved: () => void;
}
type Props = ({ mode: 'create' } & BaseProps) | ({ mode: 'edit'; id: string } & BaseProps);

export function WebhookDialog(props: Props) {
  const t = useTranslations('pages.webhook_admin');
  const editing = props.mode === 'edit';

  const { data: existing } = useQuery<WebhookRow>({
    queryKey: ['webhooks', editing ? props.id : null],
    queryFn: () => api.get(`/webhook/${props.mode === 'edit' ? props.id : ''}`),
    enabled: editing,
  });

  const [entityType, setEntityType] = useState<string>('customerorder');
  const [actions, setActions] = useState<Set<string>>(new Set(['CREATE', 'UPDATE']));
  const [url, setUrl] = useState('');
  const [secretHash, setSecretHash] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (existing) {
      setEntityType(existing.entityType);
      setActions(new Set(existing.action.split(',')));
      setUrl(existing.url);
      setSecretHash(existing.secretHash ?? '');
      setEnabled(existing.enabled);
    }
  }, [existing]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        entityType,
        action: Array.from(actions),
        url,
        enabled,
      };
      if (secretHash.trim()) payload.secretHash = secretHash.trim();
      else if (editing) payload.secretHash = null;

      if (editing) {
        return api.patch(`/webhook/${props.id}`, payload);
      }
      return api.post('/webhook', payload);
    },
    onSuccess: () => props.onSaved(),
    onError: (e: Error) => setError(e.message),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (actions.size === 0) {
      setError(t('error_no_actions'));
      return;
    }
    if (!url.trim().match(/^https?:\/\//)) {
      setError(t('error_invalid_url'));
      return;
    }
    if (secretHash.trim() && secretHash.trim().length < 8) {
      setError(t('error_short_secret'));
      return;
    }
    saveMut.mutate();
  };

  const toggleAction = (a: string) => {
    const next = new Set(actions);
    if (next.has(a)) next.delete(a);
    else next.add(a);
    setActions(next);
  };

  return (
    <Modal
      open
      onOpenChange={(o) => !o && props.onClose()}
      title={editing ? t('edit_title') : t('create_title')}
      widthClass="w-[520px]"
      testId="webhook-dialog"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={props.onClose}>
            {t('cancel')}
          </Button>
          <Button
            type="submit"
            form="webhook-dialog-form"
            variant="primary"
            disabled={saveMut.isPending}
          >
            {editing ? t('save') : t('create')}
          </Button>
        </>
      }
    >
      <div className="px-5 py-4">
        <form id="webhook-dialog-form" onSubmit={submit} className="space-y-4">
          <FormField id="webhook-entity-field" label={t('field_entity')}>
            <NativeSelect
              id="webhook-entity-field"
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
              disabled={editing}
              data-test-id="webhook-entity"
            >
              {ENTITY_TYPES.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </NativeSelect>
          </FormField>

          <FormField id="webhook-action-field" label={t('field_action')}>
            <div className="flex gap-3">
              {ACTIONS.map((a) => (
                <Label key={a} className="flex items-center gap-1.5 text-sm">
                  <Checkbox
                    checked={actions.has(a)}
                    onCheckedChange={() => toggleAction(a)}
                    data-test-id={`webhook-action-${a}`}
                  />
                  {a}
                </Label>
              ))}
            </div>
          </FormField>

          <FormField id="webhook-url-field" label={t('field_url')}>
            <Input
              id="webhook-url-field"
              type="url"
              placeholder="https://example.com/hook"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              data-test-id="webhook-url"
              required
            />
          </FormField>

          <FormField
            id="webhook-secret-field"
            label={t('field_secret')}
            hint={t('field_secret_hint')}
          >
            <Input
              id="webhook-secret-field"
              type="text"
              placeholder={t('field_secret_placeholder')}
              value={secretHash}
              onChange={(e) => setSecretHash(e.target.value)}
              data-test-id="webhook-secret"
            />
          </FormField>

          <FormField id="webhook-enabled-field">
            <Label className="flex items-center gap-1.5 text-sm">
              <Checkbox
                checked={enabled}
                onCheckedChange={(c) => setEnabled(c === true)}
                data-test-id="webhook-enabled"
              />
              {t('field_enabled')}
            </Label>
          </FormField>

          {error && <Alert tone="destructive">{error}</Alert>}
        </form>
      </div>
    </Modal>
  );
}
