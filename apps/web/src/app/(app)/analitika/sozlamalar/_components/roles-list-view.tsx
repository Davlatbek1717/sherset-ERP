'use client';

import { api } from '@/lib/api-client';
import { systemTone } from '@/lib/domain-status-tone';
import { Badge } from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import Link from 'next/link';

interface RoleRow {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  memberCount: number;
}

interface ListResponse {
  items: RoleRow[];
}

export function RolesListView() {
  const t = useTranslations('pages.analitika_settings');
  const { data, isLoading } = useQuery<ListResponse>({
    queryKey: ['roles', 'list'],
    queryFn: () => api.get<ListResponse>('/roles'),
  });
  const items = data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="font-semibold text-[var(--ms-text-primary)] text-lg">
            {t('roles_title')}
          </h2>
          <p className="mt-1 text-[var(--ms-text-muted)] text-sm">{t('roles_hint')}</p>
        </div>
        <Link
          href="/analitika/sozlamalar/rollar/yangi"
          className="rounded-md bg-[var(--ms-text-brand)] px-3 py-1.5 font-semibold text-sm text-white hover:opacity-90"
        >
          + {t('role_new_btn')}
        </Link>
      </div>

      <div className="overflow-x-auto rounded-lg border border-[var(--ms-border)] bg-white">
        <table className="w-full text-sm">
          <thead className="bg-[var(--ms-bg-subtle)] text-[var(--ms-text-muted)] text-xs uppercase">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">{t('role_name')}</th>
              <th className="px-3 py-2 text-left font-semibold">{t('role_desc')}</th>
              <th className="w-32 px-3 py-2 text-center font-semibold">{t('role_members')}</th>
              <th className="w-32 px-3 py-2 text-center font-semibold">⏷</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--ms-border)]">
            {items.map((r) => (
              <tr key={r.id} className="hover:bg-[var(--ms-bg-subtle)]">
                <td className="px-3 py-2">
                  <Link
                    href={`/analitika/sozlamalar/rollar/${r.id}`}
                    className="font-semibold text-[var(--ms-text-primary)] hover:text-[var(--ms-text-brand)] hover:underline"
                  >
                    {r.name}
                  </Link>
                </td>
                <td className="px-3 py-2 text-[var(--ms-text-muted)] text-xs">
                  {r.description ?? '—'}
                </td>
                <td className="px-3 py-2 text-center tabular-nums">{r.memberCount}</td>
                <td className="px-3 py-2 text-center">
                  <Badge tone={systemTone(r.isSystem)}>
                    {r.isSystem ? t('role_system') : t('role_custom')}
                  </Badge>
                </td>
              </tr>
            ))}
            {!isLoading && items.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-12 text-center text-[var(--ms-text-muted)]">
                  {t('roles_empty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
