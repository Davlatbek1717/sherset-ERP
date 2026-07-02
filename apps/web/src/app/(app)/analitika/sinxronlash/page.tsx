'use client';

import { Button } from '@moysklad/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

type JobKey = 'partners' | 'items' | 'purchases' | 'sales' | 'all';

interface JobDef {
  key: JobKey;
  label: string;
  description: string;
  /** React-query keys to invalidate when this job runs. */
  invalidate: string[][];
}

/**
 * Sinxronlash sahifa — ref'da REGOS connector cron job triggerlari edi
 * (`sync-view.tsx`, 310 satr). Bizning loyihada "REGOS = mahalliy baza"
 * qarori bo'yicha har "ish" mos react-query keshini invalidate qiladi va
 * yangi ma'lumotni qayta yuklaydi. Tashqi sinxron emas — kesh refresh.
 */
export default function AnalitikaSyncPage() {
  const t = useTranslations('pages.analitika_sync');
  const qc = useQueryClient();
  const [lastRun, setLastRun] = useState<Record<JobKey, Date | null>>({
    partners: null,
    items: null,
    purchases: null,
    sales: null,
    all: null,
  });
  const [running, setRunning] = useState<JobKey | null>(null);

  const jobs: JobDef[] = [
    {
      key: 'partners',
      label: t('job_partners'),
      description: t('job_partners_desc'),
      invalidate: [
        ['analitika', 'cp-list'],
        ['analitika', 'cp-analysis'],
      ],
    },
    {
      key: 'items',
      label: t('job_items'),
      description: t('job_items_desc'),
      invalidate: [
        ['analitika', 'items'],
        ['analitika', 'items-stats'],
        ['analitika', 'items-groups'],
        ['analitika', 'count-products'],
        ['analitika', 'product-cart'],
      ],
    },
    {
      key: 'purchases',
      label: t('job_purchases'),
      description: t('job_purchases_desc'),
      invalidate: [
        ['analitika', 'orders'],
        ['analitika', 'order'],
        ['analitika', 'counts'],
        ['analitika', 'count-summary'],
        ['analitika', 'report'],
      ],
    },
    {
      key: 'sales',
      label: t('job_sales'),
      description: t('job_sales_desc'),
      invalidate: [['analitika']],
    },
    {
      key: 'all',
      label: t('job_all'),
      description: t('job_all_desc'),
      invalidate: [['analitika']],
    },
  ];

  const runJob = async (job: JobDef) => {
    setRunning(job.key);
    try {
      for (const key of job.invalidate) {
        await qc.invalidateQueries({ queryKey: key });
      }
      setLastRun((prev) => ({ ...prev, [job.key]: new Date() }));
    } finally {
      setRunning(null);
    }
  };

  const fmt = (d: Date | null): string => {
    if (!d) return t('never_refreshed');
    const elapsed = (Date.now() - d.getTime()) / 1000;
    if (elapsed < 5) return t('refreshed_just_now');
    return d.toLocaleString('ru-RU');
  };

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="font-bold text-2xl text-[var(--ms-text-primary)] tracking-tight">
          {t('title')}
        </h1>
        <p className="mt-1 text-[var(--ms-text-muted)] text-sm">{t('subtitle')}</p>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900 text-xs">
        {t('explain')}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {jobs.map((job) => {
          const busy = running === job.key;
          return (
            <div
              key={job.key}
              className="flex flex-col gap-3 rounded-lg border border-[var(--ms-border)] bg-white p-4"
            >
              <div>
                <h3 className="font-semibold text-[var(--ms-text-primary)]">{job.label}</h3>
                <p className="mt-1 text-[var(--ms-text-muted)] text-xs">{job.description}</p>
              </div>
              <div className="text-[10px] text-[var(--ms-text-muted)] uppercase tracking-wider">
                {t('last_refreshed')}: {fmt(lastRun[job.key])}
              </div>
              <Button
                onClick={() => runJob(job)}
                disabled={running !== null}
                className="self-start"
              >
                {busy ? t('refreshing') : t('refresh_btn')}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
