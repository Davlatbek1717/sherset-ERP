'use client';

import { CounterpartyFieldRow } from '@/components/counterparty-form-layout';
import { useApiMutation } from '@/hooks/use-api-mutation';
import { api } from '@/lib/api-client';
import { archivedTone } from '@/lib/archived-tone';
import { Badge, Button, FormSection, Icons, Input, Textarea } from '@moysklad/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface ContactPerson {
  id: string;
  name: string;
  position: string | null;
  phone: string | null;
  email: string | null;
  description: string | null;
  version: number;
  archived: boolean;
}

interface Draft {
  name: string;
  position: string;
  phone: string;
  email: string;
  description: string;
}
const toDraft = (c: ContactPerson): Draft => ({
  name: c.name,
  position: c.position ?? '',
  phone: c.phone ?? '',
  email: c.email ?? '',
  description: c.description ?? '',
});
const EMPTY_DRAFT: Draft = { name: '', position: '', phone: '', email: '', description: '' };
const toPayload = (d: Draft) => ({
  name: d.name.trim(),
  position: d.position.trim() || undefined,
  phone: d.phone.trim() || undefined,
  email: d.email.trim() || undefined,
  description: d.description.trim() || undefined,
});

export interface ContactPersonsSectionProps {
  counterpartyId: string;
  /** When embedded inside a card (the «Контактные лица» CounterpartyFormCard), render
   *  the inner content without the own FormSection chrome. */
  bare?: boolean;
}

/**
 * «Контактные лица» on the counterparty detail page. moysklad shows each contact as a full
 * editable card (ФИО/Должность/Телефон/Электронный адрес/Комментарий); editing a card and
 * pressing «Сохранить» PATCHes it (optimistic version), «+ Контактное лицо» adds a blank
 * card (POST), and ✕ deletes. Mirrors the /counterparties/new staged-contact cards.
 */
export function ContactPersonsSection({ counterpartyId, bare }: ContactPersonsSectionProps) {
  const qc = useQueryClient();
  const t = useTranslations('pages.contact_persons');
  // «Электронный адрес» / «Комментарий» — reuse the counterparty form labels (moysklad parity).
  const tCp = useTranslations('pages.counterparty_new');
  const tCommon = useTranslations('common');

  const { data, isLoading } = useQuery<{ items: ContactPerson[] }>({
    queryKey: ['contact-persons-of', counterpartyId],
    queryFn: () =>
      api.get<{ items: ContactPerson[] }>(
        `/contact-persons?counterpartyId=${counterpartyId}&limit=50`,
      ),
  });
  const items = data?.items ?? [];

  // Per-card edit drafts (id → Draft) — present only once the user touches a card. newDraft
  // is the blank «+ Контактное лицо» card (null when not adding).
  const [edits, setEdits] = useState<Record<string, Draft>>({});
  const [newDraft, setNewDraft] = useState<Draft | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['contact-persons-of', counterpartyId] });
    qc.invalidateQueries({ queryKey: ['contact-persons'] });
    qc.invalidateQueries({ queryKey: ['counterparty', counterpartyId] });
  };

  const createMut = useApiMutation({
    mutationFn: (d: Draft) => api.post('/contact-persons', { counterpartyId, ...toPayload(d) }),
    onSuccess: () => {
      setNewDraft(null);
      invalidate();
    },
  });
  const updateMut = useApiMutation({
    mutationFn: ({ id, version, d }: { id: string; version: number; d: Draft }) =>
      api.patch(`/contact-persons/${id}`, { version, ...toPayload(d) }),
    onSuccess: (_res, vars) => {
      setEdits((prev) => {
        const next = { ...prev };
        delete next[vars.id];
        return next;
      });
      invalidate();
    },
  });
  const deleteMut = useApiMutation({
    mutationFn: (id: string) => api.delete(`/contact-persons/${id}`),
    onSuccess: () => {
      invalidate();
      setConfirmingId(null);
    },
  });

  const draftOf = (c: ContactPerson): Draft => edits[c.id] ?? toDraft(c);
  const patchEdit = (c: ContactPerson, patch: Partial<Draft>) =>
    setEdits((prev) => ({ ...prev, [c.id]: { ...(prev[c.id] ?? toDraft(c)), ...patch } }));

  // A reusable 5-field card body (label-LEFT, mirrors moysklad + /new staged cards).
  const cardFields = (d: Draft, onChange: (patch: Partial<Draft>) => void, idPrefix: string) => (
    <>
      <CounterpartyFieldRow
        label={
          <>
            <span className="text-[var(--ms-text-destructive)]">*</span> {t('full_name')}
          </>
        }
      >
        <Input
          value={d.name}
          onChange={(e) => onChange({ name: e.target.value })}
          data-test-id={`${idPrefix}-name`}
        />
      </CounterpartyFieldRow>
      <CounterpartyFieldRow label={t('position')}>
        <Input
          value={d.position}
          onChange={(e) => onChange({ position: e.target.value })}
          data-test-id={`${idPrefix}-position`}
        />
      </CounterpartyFieldRow>
      <CounterpartyFieldRow label={t('phone')}>
        <Input
          value={d.phone}
          onChange={(e) => onChange({ phone: e.target.value })}
          data-test-id={`${idPrefix}-phone`}
        />
      </CounterpartyFieldRow>
      <CounterpartyFieldRow label={tCp('email_label')}>
        <Input
          type="email"
          value={d.email}
          onChange={(e) => onChange({ email: e.target.value })}
          data-test-id={`${idPrefix}-email`}
        />
      </CounterpartyFieldRow>
      <CounterpartyFieldRow label={tCp('description_label')}>
        <Textarea
          value={d.description}
          onChange={(e) => onChange({ description: e.target.value })}
          data-test-id={`${idPrefix}-description`}
        />
      </CounterpartyFieldRow>
    </>
  );

  const body = (
    <div className="space-y-3">
      {isLoading && (
        <div className="py-2 text-[var(--ms-text-muted)] text-xs">{tCommon('loading')}</div>
      )}

      {/* Existing contacts — editable cards. */}
      {items.map((c) => {
        const d = draftOf(c);
        const dirty = !!edits[c.id];
        return (
          <div
            key={c.id}
            className="relative space-y-2 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-3 pt-7"
            data-test-id={`contact-card-${c.id}`}
          >
            {c.archived && (
              <Badge tone={archivedTone(c.archived)} className="absolute top-2 left-3">
                {tCommon('archived')}
              </Badge>
            )}
            {confirmingId === c.id ? (
              <div className="absolute top-1.5 right-2 flex gap-1">
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => deleteMut.mutate(c.id)}
                  loading={deleteMut.isPending}
                  data-test-id={`contact-confirm-delete-${c.id}`}
                >
                  {tCommon('delete')}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmingId(null)}>
                  {tCommon('cancel')}
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingId(c.id)}
                className="absolute top-1.5 right-2 text-[var(--ms-text-muted)] hover:text-[var(--ms-text-destructive)]"
                aria-label={tCommon('delete')}
                data-test-id={`contact-delete-${c.id}`}
              >
                ×
              </button>
            )}
            {cardFields(d, (patch) => patchEdit(c, patch), `contact-edit-${c.id}`)}
            {dirty && (
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setEdits((prev) => {
                      const next = { ...prev };
                      delete next[c.id];
                      return next;
                    })
                  }
                >
                  {tCommon('cancel')}
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  disabled={!d.name.trim() || updateMut.isPending}
                  onClick={() => updateMut.mutate({ id: c.id, version: c.version, d })}
                  data-test-id={`contact-save-${c.id}`}
                >
                  {tCommon('save')}
                </Button>
              </div>
            )}
          </div>
        );
      })}

      {/* «+ Контактное лицо» — a blank card to add. */}
      {newDraft ? (
        <div
          className="space-y-2 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-3"
          data-test-id="contact-new-card"
        >
          {cardFields(
            newDraft,
            (patch) => setNewDraft((d) => ({ ...(d ?? EMPTY_DRAFT), ...patch })),
            'contact-new',
          )}
          {(createMut.error as Error | null) && (
            <p className="text-[var(--ms-text-destructive)] text-xs">
              {(createMut.error as Error).message}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setNewDraft(null)}>
              {tCommon('cancel')}
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={!newDraft.name.trim() || createMut.isPending}
              onClick={() => createMut.mutate(newDraft)}
              data-test-id="contact-new-add"
            >
              {tCommon('add')}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setNewDraft(EMPTY_DRAFT)}
          data-test-id="add-contact-person"
        >
          <Icons.create className="h-4 w-4" />
          {t('create_button')}
        </Button>
      )}
    </div>
  );

  if (bare) return body;
  return <FormSection title={t('title')}>{body}</FormSection>;
}
