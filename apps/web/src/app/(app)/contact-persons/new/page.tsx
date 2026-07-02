'use client';

import { DetailHeader, DetailToolbar } from '@/components/document-detail';
import { api } from '@/lib/api-client';
import {
  CatalogPicker,
  CatalogPickerField,
  FormField,
  FormSection,
  Input,
  type PickerItem,
} from '@moysklad/ui';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

interface CounterpartyRef {
  id: string;
  name: string;
  legalTitle: string | null;
}

export default function NewContactPersonPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations('pages.contact_persons');
  const tCommon = useTranslations('common');
  const tForm = useTranslations('form');

  const fromCounterpartyId = searchParams.get('counterpartyId');

  const [counterpartyId, setCounterpartyId] = useState<string | null>(fromCounterpartyId);
  const [counterpartyLabel, setCounterpartyLabel] = useState('');
  const [name, setName] = useState('');
  const [position, setPosition] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [description, setDescription] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prefill counterparty label when ?counterpartyId= passed
  useEffect(() => {
    if (!fromCounterpartyId || counterpartyLabel) return;
    api
      .get<CounterpartyRef>(`/counterparties/${fromCounterpartyId}`)
      .then((cp) => {
        setCounterpartyLabel(cp.name);
      })
      .catch(() => {});
  }, [fromCounterpartyId, counterpartyLabel]);

  const counterpartyFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: CounterpartyRef[] }>(
      `/counterparties?search=${encodeURIComponent(s)}&limit=50`,
    );
    return d.items.map((c) => ({
      id: c.id,
      primary: c.name,
      secondary: c.legalTitle ?? undefined,
    }));
  };

  const createMut = useMutation({
    mutationFn: async () => {
      if (!counterpartyId) throw new Error(t('select_counterparty'));
      if (!name.trim()) throw new Error(tCommon('field_required', { field: t('full_name') }));
      return api.post<{ id: string }>('/contact-persons', {
        counterpartyId,
        name,
        position: position || undefined,
        phone: phone || undefined,
        email: email || undefined,
        description: description || undefined,
      });
    },
    onSuccess: (created) =>
      router.push(
        fromCounterpartyId
          ? `/counterparties/${fromCounterpartyId}`
          : `/contact-persons/${created.id}`,
      ),
    onError: (e: Error) => setError(e.message),
  });

  const handleSave = () => {
    setError(null);
    createMut.mutate();
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleSave();
      }}
      className="flex min-h-screen flex-col bg-[var(--ms-bg-page)]"
      data-test-id="contact-person-new-page"
    >
      <DetailToolbar
        isDirty={!!(name || position || phone || email || description)}
        isSaving={createMut.isPending}
        onSave={handleSave}
        onClose={() =>
          router.push(
            fromCounterpartyId ? `/counterparties/${fromCounterpartyId}` : '/contact-persons',
          )
        }
        createMenuItems={[]}
      />
      <DetailHeader
        titlePrefix=""
        name=""
        moment={new Date().toISOString()}
        stateLabel={tCommon('new_state')}
        stateTone="neutral"
        stateSlug="new"
        applicable={false}
        hideApplicable
        customTitle={t('new_title')}
      />
      {error && (
        <div className="border-[var(--ms-destructive-100)] border-b bg-[var(--ms-destructive-50)] px-4 py-2 text-[var(--ms-text-destructive)] text-sm">
          {error}
        </div>
      )}
      <main className="flex-1 px-4 py-4">
        <div className="space-y-4">
          <FormSection title={tForm('section_main')}>
            <FormField id="counterparty" label={t('counterparty')} required>
              <CatalogPickerField
                value={counterpartyId ? { id: counterpartyId, label: counterpartyLabel } : null}
                placeholder={t('select_counterparty')}
                onPick={() => setPickerOpen(true)}
                onClear={() => {
                  setCounterpartyId(null);
                  setCounterpartyLabel('');
                }}
                disabled={!!fromCounterpartyId}
                testId="field-counterparty"
              />
            </FormField>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormField id="name" label={t('full_name')} required>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                  data-test-id="field-name"
                />
              </FormField>
              <FormField id="position" label={t('position')}>
                <Input
                  value={position}
                  onChange={(e) => setPosition(e.target.value)}
                  placeholder="CFO"
                  data-test-id="field-position"
                />
              </FormField>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormField id="phone" label={t('phone')}>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  type="tel"
                  placeholder="+998 90 123 45 67"
                  data-test-id="field-phone"
                />
              </FormField>
              <FormField id="email" label={t('email')}>
                <Input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  placeholder="name@company.uz"
                  data-test-id="field-email"
                />
              </FormField>
            </div>
            <FormField id="description" label={tCommon('description')}>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                data-test-id="field-description"
              />
            </FormField>
          </FormSection>

          <CatalogPicker
            open={pickerOpen}
            onClose={() => setPickerOpen(false)}
            title={tForm('counterparty_picker_title')}
            fetcher={counterpartyFetcher}
            onSelect={(item) => {
              setCounterpartyId(item.id);
              setCounterpartyLabel(String(item.primary));
            }}
          />
        </div>
      </main>
    </form>
  );
}
