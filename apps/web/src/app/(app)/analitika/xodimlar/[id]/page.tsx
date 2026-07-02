'use client';

import { api } from '@/lib/api-client';
import { archivedTone } from '@/lib/archived-tone';
import { systemTone } from '@/lib/domain-status-tone';
import { Badge, Button } from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { StaffForm } from '../_components/staff-form';

interface EmployeeDetail {
  id: string;
  email: string | null;
  name: string;
  fullName: string | null;
  position: string | null;
  phone: string | null;
  username: string | null;
  archived: boolean;
  isChecker: boolean;
  hrRoles: string[];
  lastLoginAt: string | null;
  /** Optimistic-lock token — round-tripped by the edit form on Save. */
  version: number;
  roles: Array<{ id: string; name: string; isSystem: boolean }>;
}

export default function AnalitikaStaffDetailPage() {
  const t = useTranslations('pages.analitika_staff');
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [editing, setEditing] = useState(false);

  const { data, isLoading } = useQuery<EmployeeDetail>({
    queryKey: ['analitika', 'staff-detail', id],
    queryFn: () => api.get<EmployeeDetail>(`/analitika/staff/${id}`),
    enabled: !!id,
  });

  return (
    <div className="space-y-4 p-6">
      <Link
        href="/analitika/xodimlar"
        className="text-[var(--ms-text-brand)] text-sm hover:underline"
      >
        {t('back')}
      </Link>

      {isLoading && <p className="text-[var(--ms-text-muted)] text-sm">{t('loading')}</p>}

      {data && (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="font-semibold text-[var(--ms-text-primary)] text-xl">
                {data.fullName ?? data.name}
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                {data.archived && (
                  <Badge tone={archivedTone(data.archived)}>{t('detail_archived')}</Badge>
                )}
                {data.roles.length > 0 ? (
                  data.roles.map((r) => (
                    <Badge key={r.id} tone={systemTone(r.isSystem)}>
                      {r.name}
                    </Badge>
                  ))
                ) : (
                  <span className="text-[var(--ms-text-muted)] text-xs">{t('roles_none')}</span>
                )}
              </div>
            </div>
            {!editing && (
              <Button variant="secondary" onClick={() => setEditing(true)}>
                {t('edit')}
              </Button>
            )}
          </div>

          {!editing && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Card label={t('detail_position')} value={data.position ?? '—'} />
                <Card label={t('detail_email')} value={data.email ?? '—'} />
                <Card label={t('detail_phone')} value={data.phone ?? '—'} />
                <Card label={t('detail_username')} value={data.username ?? '—'} />
                <Card
                  label={t('detail_last_login')}
                  value={
                    data.lastLoginAt ? new Date(data.lastLoginAt).toLocaleString('ru-RU') : '—'
                  }
                />
                <Card
                  label={t('detail_is_checker')}
                  value={data.isChecker ? t('detail_yes') : t('detail_no')}
                />
              </div>

              {data.hrRoles.length > 0 && (
                <section className="rounded-lg border border-[var(--ms-border)] bg-white p-4">
                  <h2 className="font-medium text-[var(--ms-text-primary)]">
                    {t('detail_hr_roles')}
                  </h2>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {data.hrRoles.map((r) => (
                      <span
                        key={r}
                        className="inline-block rounded border border-[var(--ms-border)] bg-[var(--ms-bg-subtle)] px-2 py-0.5 text-[var(--ms-text-muted)] text-xs"
                      >
                        {r}
                      </span>
                    ))}
                  </div>
                </section>
              )}

              <p className="text-[var(--ms-text-muted)] text-xs">
                <a
                  href={`/hr/employees/${data.id}`}
                  className="text-[var(--ms-text-brand)] hover:underline"
                >
                  {t('hint_hr_link')}
                </a>
              </p>
            </>
          )}

          {editing && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-[var(--ms-text-primary)] text-lg">
                  {t('edit_title')}
                </h2>
                <Button variant="secondary" onClick={() => setEditing(false)}>
                  {t('cancel')}
                </Button>
              </div>
              <StaffForm
                // Re-key on version so that after an optimistic-lock conflict
                // reload (which refetches a higher version) the form remounts
                // and re-seeds from the fresh server copy — the local field
                // state is seeded once via useState, so a prop change alone
                // would not re-hydrate it.
                key={data.version}
                mode="edit"
                staffId={data.id}
                initial={{
                  id: data.id,
                  email: data.email ?? '',
                  name: data.name,
                  fullName: data.fullName ?? '',
                  position: data.position ?? '',
                  phone: data.phone ?? '',
                  username: data.username ?? '',
                  roleIds: data.roles.map((r) => r.id),
                  archived: data.archived,
                  version: data.version,
                }}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--ms-border)] bg-white p-3">
      <div className="text-[10px] text-[var(--ms-text-muted)] uppercase tracking-wider">
        {label}
      </div>
      <div className="mt-1 font-medium text-[var(--ms-text-primary)] text-sm">{value}</div>
    </div>
  );
}
