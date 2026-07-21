'use client';

import { DetailHeader, DetailToolbar } from '@/components/document-detail';
import { useUserDefaults } from '@/hooks/use-user-defaults';
import { api } from '@/lib/api-client';
import { pinDefaultCustomer } from '@/lib/pin-default-customer';
import {
  CatalogPicker,
  CatalogPickerField,
  FormField,
  FormSection,
  Input,
  NativeSelect,
  type PickerItem,
  Textarea,
} from '@moysklad/ui';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

const SELECT_CLASS =
  'w-full h-9 px-3 text-sm bg-[var(--ms-bg-surface)] border border-[var(--ms-border-default)] rounded-[var(--ms-radius-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ms-border-focus)] focus-visible:ring-offset-1 hover:border-[var(--ms-border-strong)]';

const TEXTAREA_CLASS =
  'w-full min-h-[96px] px-3 py-2 text-sm bg-[var(--ms-bg-surface)] border border-[var(--ms-border-default)] rounded-[var(--ms-radius-default)] hover:border-[var(--ms-border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ms-border-focus)] focus-visible:ring-offset-1 placeholder:text-[var(--ms-text-placeholder)]';

interface CounterpartyRef {
  id: string;
  name: string;
  legalTitle: string | null;
}
interface ContactPersonRef {
  id: string;
  name: string;
  counterparty: { id: string; name: string };
}

const DIRECTIONS = ['in', 'out'] as const;
const CHANNELS = ['call', 'sms', 'email', 'meeting'] as const;
const STATUSES = ['completed', 'missed', 'cancelled', 'scheduled'] as const;

function nowLocalDateTime(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function NewCallPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations('pages.calls');
  const tCommon = useTranslations('common');
  const tForm = useTranslations('form');
  const userDefaults = useUserDefaults();

  const fromCounterpartyId = searchParams.get('counterpartyId');

  const [counterpartyId, setCounterpartyId] = useState<string | null>(fromCounterpartyId);
  const [counterpartyLabel, setCounterpartyLabel] = useState('');
  const [contactPersonId, setContactPersonId] = useState<string | null>(null);
  const [contactPersonLabel, setContactPersonLabel] = useState('');
  const [direction, setDirection] = useState<(typeof DIRECTIONS)[number]>('out');
  const [channel, setChannel] = useState<(typeof CHANNELS)[number]>('call');
  const [status, setStatus] = useState<(typeof STATUSES)[number]>('completed');
  const [startedAt, setStartedAt] = useState(nowLocalDateTime);
  const [durationSec, setDurationSec] = useState('');
  const [externalNumber, setExternalNumber] = useState('');
  const [summary, setSummary] = useState('');
  const [pickerCp, setPickerCp] = useState(false);
  const [pickerPerson, setPickerPerson] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!fromCounterpartyId || counterpartyLabel) return;
    api
      .get<CounterpartyRef>(`/counterparties/${fromCounterpartyId}`)
      .then((cp) => {
        setCounterpartyLabel(cp.name);
      })
      .catch(() => {});
  }, [fromCounterpartyId, counterpartyLabel]);

  // When counterparty changes (or clears), drop selected contact person
  useEffect(() => {
    setContactPersonId(null);
    setContactPersonLabel('');
  }, [counterpartyId]);

  const counterpartyFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: CounterpartyRef[] }>(
      `/counterparties?search=${encodeURIComponent(s)}&limit=50`,
    );
    const items = d.items.map((c) => ({
      id: c.id,
      primary: c.name,
      secondary: c.legalTitle ?? undefined,
    }));
    return pinDefaultCustomer(
      items,
      userDefaults.data?.defaultCustomer,
      s,
      tForm('pinned_default'),
    );
  };

  const contactPersonFetcher = useMemo(
    () =>
      async (s: string): Promise<PickerItem[]> => {
        if (!counterpartyId) return [];
        const d = await api.get<{ items: ContactPersonRef[] }>(
          `/contact-persons?counterpartyId=${counterpartyId}&search=${encodeURIComponent(s)}&limit=50`,
        );
        return d.items.map((p) => ({ id: p.id, primary: p.name }));
      },
    [counterpartyId],
  );

  const createMut = useMutation({
    mutationFn: async () => {
      if (!startedAt) throw new Error(`${t('started_at')} majburiy`);
      const body: Record<string, unknown> = {
        direction,
        channel,
        status,
        startedAt: new Date(startedAt).toISOString(),
        ...(counterpartyId ? { counterpartyId } : {}),
        ...(contactPersonId ? { contactPersonId } : {}),
        ...(durationSec ? { durationSec: Number(durationSec) } : {}),
        ...(externalNumber ? { externalNumber } : {}),
        ...(summary ? { summary } : {}),
      };
      return api.post<{ id: string }>('/calls', body);
    },
    onSuccess: (created) =>
      router.push(
        fromCounterpartyId ? `/counterparties/${fromCounterpartyId}` : `/calls/${created.id}`,
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
      data-test-id="call-new-page"
    >
      <DetailToolbar
        isDirty={!!(startedAt || externalNumber || summary)}
        isSaving={createMut.isPending}
        onSave={handleSave}
        onClose={() =>
          router.push(fromCounterpartyId ? `/counterparties/${fromCounterpartyId}` : '/calls')
        }
        createMenuItems={[]}
      />
      <DetailHeader
        titlePrefix="Qo'ng'iroq"
        name=""
        moment={new Date().toISOString()}
        stateLabel="Yangi"
        stateTone="neutral"
        stateSlug="new"
        applicable={false}
        hideApplicable
        customTitle="Yangi qo'ng'iroq"
      />
      {error && (
        <div className="border-[var(--ms-destructive-100)] border-b bg-[var(--ms-destructive-50)] px-4 py-2 text-[var(--ms-text-destructive)] text-sm">
          {error}
        </div>
      )}
      <main className="flex-1 px-4 py-4">
        <div className="space-y-4">
          <FormSection title={tForm('section_main')}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <FormField id="direction" label={t('direction')} required>
                <NativeSelect
                  id="direction"
                  value={direction}
                  onChange={(e) => setDirection(e.target.value as (typeof DIRECTIONS)[number])}
                  className={SELECT_CLASS}
                  data-test-id="field-direction"
                >
                  {DIRECTIONS.map((d) => (
                    <option key={d} value={d}>
                      {t(`directions.${d}`)}
                    </option>
                  ))}
                </NativeSelect>
              </FormField>
              <FormField id="channel" label={t('channel')} required>
                <NativeSelect
                  id="channel"
                  value={channel}
                  onChange={(e) => setChannel(e.target.value as (typeof CHANNELS)[number])}
                  className={SELECT_CLASS}
                  data-test-id="field-channel"
                >
                  {CHANNELS.map((c) => (
                    <option key={c} value={c}>
                      {t(`channels.${c}`)}
                    </option>
                  ))}
                </NativeSelect>
              </FormField>
              <FormField id="status" label={t('status')} required>
                <NativeSelect
                  id="status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as (typeof STATUSES)[number])}
                  className={SELECT_CLASS}
                  data-test-id="field-status"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {t(`statuses.${s}`)}
                    </option>
                  ))}
                </NativeSelect>
              </FormField>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormField id="startedAt" label={t('started_at')} required>
                <Input
                  type="datetime-local"
                  value={startedAt}
                  onChange={(e) => setStartedAt(e.target.value)}
                  data-test-id="field-started-at"
                />
              </FormField>
              <FormField id="duration" label={t('duration_sec')}>
                <Input
                  type="number"
                  min={0}
                  max={86400}
                  value={durationSec}
                  onChange={(e) => setDurationSec(e.target.value)}
                  placeholder="0"
                  data-test-id="field-duration"
                />
              </FormField>
            </div>

            <FormField id="counterparty" label={t('counterparty')}>
              <CatalogPickerField
                value={counterpartyId ? { id: counterpartyId, label: counterpartyLabel } : null}
                placeholder={t('select_counterparty')}
                onPick={() => setPickerCp(true)}
                onClear={() => {
                  setCounterpartyId(null);
                  setCounterpartyLabel('');
                }}
                disabled={!!fromCounterpartyId}
                testId="field-counterparty"
              />
            </FormField>

            <FormField id="contactPerson" label={t('contact_person')}>
              <CatalogPickerField
                value={contactPersonId ? { id: contactPersonId, label: contactPersonLabel } : null}
                placeholder={t('select_contact_person')}
                onPick={() => counterpartyId && setPickerPerson(true)}
                onClear={() => {
                  setContactPersonId(null);
                  setContactPersonLabel('');
                }}
                disabled={!counterpartyId}
                testId="field-contact-person"
              />
            </FormField>

            <FormField id="externalNumber" label={t('external_number')}>
              <Input
                value={externalNumber}
                onChange={(e) => setExternalNumber(e.target.value)}
                placeholder="+998 90 123 45 67"
                data-test-id="field-external-number"
              />
            </FormField>

            <FormField id="summary" label={t('summary')}>
              <Textarea
                id="summary"
                rows={4}
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder={tCommon('description')}
                className={TEXTAREA_CLASS}
                data-test-id="field-summary"
              />
            </FormField>
          </FormSection>

          <CatalogPicker
            open={pickerCp}
            onClose={() => setPickerCp(false)}
            title={tForm('counterparty_picker_title')}
            fetcher={counterpartyFetcher}
            onSelect={(item) => {
              setCounterpartyId(item.id);
              setCounterpartyLabel(String(item.primary));
            }}
          />
          <CatalogPicker
            open={pickerPerson}
            onClose={() => setPickerPerson(false)}
            title={t('select_contact_person')}
            fetcher={contactPersonFetcher}
            onSelect={(item) => {
              setContactPersonId(item.id);
              setContactPersonLabel(String(item.primary));
            }}
          />
        </div>
      </main>
    </form>
  );
}
