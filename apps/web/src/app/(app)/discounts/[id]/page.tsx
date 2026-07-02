'use client';

import { useApiMutation } from '@/hooks/use-api-mutation';
import { useConflictReload } from '@/hooks/use-conflict-reload';
import { useDestructiveMutation } from '@/hooks/use-destructive-mutation';
import { useEditFormLabels } from '@/hooks/use-edit-form-labels';
import { api } from '@/lib/api-client';
import { isOptimisticConflict } from '@/lib/optimistic-lock';
import {
  Button,
  EditForm,
  FormField,
  FormSection,
  Input,
  NativeSelect,
  Textarea,
} from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

interface DiscountDetail {
  id: string;
  name: string;
  kind: string;
  active: boolean;
  allAgents: boolean;
  allProducts: boolean;
  agentTags: string[];
  rules: unknown;
  earnRateUzsToPoint: string | null;
  spendRatePointsToUzs: string | null;
  maxPaidRatePercents: number | null;
  earnWhileRedeeming: boolean;
  archived: boolean;
  version: number;
}

/**
 * Discount edit page.
 *
 * UX trade-off: `rules` exposed as a raw JSON textarea for v1.
 * Kind-specific builders (tier ladders for accumulative, product picker
 * for product discounts) are deferred to a future sprint.
 */
export default function EditDiscountPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const t = useTranslations('pages.discount_admin');
  const tCommon = useTranslations('common');
  const tForm = useTranslations('form');
  const editFormLabels = useEditFormLabels();

  const [name, setName] = useState('');
  const [kind, setKind] = useState('special');
  const [active, setActive] = useState(true);
  const [rulesText, setRulesText] = useState('');
  const [rulesError, setRulesError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery<DiscountDetail>({
    queryKey: ['discount', id],
    queryFn: () => api.get<DiscountDetail>(`/discounts/${id}`),
    enabled: !!id,
  });

  useEffect(() => {
    if (!data) return;
    setName(data.name);
    setKind(data.kind);
    setActive(data.active);
    setRulesText(data.rules ? JSON.stringify(data.rules, null, 2) : '');
  }, [data]);

  const onConflict = useConflictReload(['discount', id]);
  const updateMut = useApiMutation({
    onConflict,
    mutationFn: () => {
      if (!data) throw new Error('not loaded');
      if (!name.trim()) throw new Error(t('name_required'));
      let rules: unknown = undefined;
      if (rulesText.trim()) {
        try {
          rules = JSON.parse(rulesText);
          setRulesError(null);
        } catch {
          const msg = t('rules_invalid_json');
          setRulesError(msg);
          throw new Error(msg);
        }
      }
      return api.patch<DiscountDetail>(`/discounts/${id}`, {
        version: data.version,
        name,
        kind,
        active,
        ...(rules !== undefined ? { rules } : {}),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['discount', id] });
      qc.invalidateQueries({ queryKey: ['discounts'] });
      setError(null);
    },
    onError: (e: Error) => {
      if (!isOptimisticConflict(e)) setError(e.message);
    },
  });

  const archiveMut = useMutation({
    mutationFn: () => api.post<DiscountDetail>(`/discounts/${id}/archive`, {}),
    onSuccess: () => router.push('/discounts'),
    onError: (e: Error) => setError(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: () => api.delete<unknown>(`/discounts/${id}`),
    onSuccess: () => router.push('/discounts'),
    onError: (e: Error) => setError(e.message),
  });

  const { runDestructive } = useDestructiveMutation();

  if (isLoading) {
    return <div className="p-6 text-[var(--ms-text-muted)] text-sm">{tCommon('loading')}</div>;
  }
  if (!data) {
    return <div className="p-6 text-[var(--ms-text-muted)] text-sm">{tCommon('not_found')}</div>;
  }

  return (
    <EditForm
      {...editFormLabels}
      testId="discounts-edit-page"
      title={data.name}
      breadcrumbs={[{ label: t('title'), href: '/discounts' }, { label: data.name }]}
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        updateMut.mutate();
      }}
      cancelHref="/discounts"
      saving={updateMut.isPending}
      error={error}
    >
      <div className="flex justify-end gap-2">
        {!data.archived && (
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              runDestructive({
                title: t('archive_confirm', { name: data.name }),
                run: () => archiveMut.mutateAsync(),
              })
            }
            loading={archiveMut.isPending}
          >
            {tCommon('archive')}
          </Button>
        )}
        <Button
          type="button"
          variant="destructive"
          onClick={() =>
            runDestructive({
              title: tCommon('delete_confirm', { name: data.name }),
              run: () => deleteMut.mutateAsync(),
            })
          }
          loading={deleteMut.isPending}
        >
          {tCommon('delete')}
        </Button>
      </div>

      <FormSection title={tForm('section_main')}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField id="name" label={t('col_name')} required>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-test-id="field-name"
            />
          </FormField>
          <FormField id="kind" label={t('col_kind')} required>
            <NativeSelect
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              data-test-id="field-kind"
            >
              <option value="special">{t('kind_special')}</option>
              <option value="accumulative">{t('kind_accumulative')}</option>
              <option value="personal">{t('kind_personal')}</option>
              <option value="product">{t('kind_product')}</option>
              <option value="agent">{t('kind_agent')}</option>
            </NativeSelect>
          </FormField>
        </div>
        <FormField id="active" label={t('col_active')}>
          <NativeSelect
            value={active ? 'true' : 'false'}
            onChange={(e) => setActive(e.target.value === 'true')}
            data-test-id="field-active"
          >
            <option value="true">{t('active_yes')}</option>
            <option value="false">{t('active_no')}</option>
          </NativeSelect>
        </FormField>
      </FormSection>

      <FormSection title={t('rules_section')}>
        <p className="mb-2 text-[var(--ms-text-muted)] text-sm">{t('rules_hint')}</p>
        <FormField id="rules" label={t('col_rules')}>
          <Textarea
            id="rules"
            value={rulesText}
            onChange={(e) => {
              setRulesText(e.target.value);
              setRulesError(null);
            }}
            rows={8}
            placeholder="{}"
            data-test-id="field-rules"
            className="bg-[var(--ms-bg-base)] font-mono"
          />
          {rulesError && (
            <p className="mt-1 text-[var(--ms-destructive-600)] text-xs">{rulesError}</p>
          )}
        </FormField>
      </FormSection>
    </EditForm>
  );
}
