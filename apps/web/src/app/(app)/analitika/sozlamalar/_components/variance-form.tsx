'use client';

import { api } from '@/lib/api-client';
import { Button, Input } from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

interface VarianceConfig {
  greenMaxPct: number;
  yellowMaxPct: number;
}

export function VarianceForm() {
  const t = useTranslations('pages.analitika_settings');
  const qc = useQueryClient();

  const varianceQuery = useQuery<VarianceConfig>({
    queryKey: ['analitika', 'variance'],
    queryFn: () => api.get<VarianceConfig>('/analitika/settings/variance'),
  });
  const [green, setGreen] = useState('');
  const [yellow, setYellow] = useState('');
  useEffect(() => {
    if (varianceQuery.data) {
      setGreen(String(varianceQuery.data.greenMaxPct));
      setYellow(String(varianceQuery.data.yellowMaxPct));
    }
  }, [varianceQuery.data]);

  const saveVariance = useMutation({
    mutationFn: () =>
      api.put('/analitika/settings/variance', {
        greenMaxPct: Number(green),
        yellowMaxPct: Number(yellow),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['analitika', 'variance'] }),
  });

  return (
    <section className="rounded-lg border border-[var(--ms-border)] bg-white p-5">
      <h2 className="font-medium text-[var(--ms-text-primary)]">{t('variance_title')}</h2>
      <p className="mt-1 text-[var(--ms-text-muted)] text-sm">{t('variance_hint')}</p>
      <div className="mt-4 flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--ms-text-muted)]">{t('green_max')}</span>
          <Input
            type="number"
            value={green}
            onChange={(e) => setGreen(e.target.value)}
            className="w-40"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--ms-text-muted)]">{t('yellow_max')}</span>
          <Input
            type="number"
            value={yellow}
            onChange={(e) => setYellow(e.target.value)}
            className="w-40"
          />
        </label>
        <Button onClick={() => saveVariance.mutate()} disabled={saveVariance.isPending}>
          {t('save')}
        </Button>
        {saveVariance.isSuccess && (
          <span className="text-[var(--ms-success-600)] text-sm">{t('saved')}</span>
        )}
        {saveVariance.isError && (
          <span className="text-[var(--ms-destructive-500)] text-sm">
            {(saveVariance.error as Error).message}
          </span>
        )}
      </div>
    </section>
  );
}
