'use client';

/**
 * HR Employee detail — main tab.
 *
 * Three tabs: «Asosiy ma'lumotlar» (this page), «Vakolatlar» (→ permissions/),
 * «Oylik» (→ salary/). Tabs are real subroutes so the URL is shareable.
 *
 * Loads via `hrEmployeeApi.findOne(id)` and renders a read-only info grid
 * with a header «Tahrirlash» button that opens EmployeeModal.
 */

import { hrEmployeeApi, hrRoleApi } from '@/lib/hr-api';
import type { HrEmployeeDetail, HrRole } from '@/lib/hr-api';
import { Avatar, Badge, Button, ErrorState, Skeleton, useConfirm, useToast } from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { EmployeeModal } from '../_components/employee-modal';
import { TabBar } from '../_components/tab-bar';

export default function HrEmployeeDetailPage() {
  const t = useTranslations('pages.hrEmployees');
  const tCommon = useTranslations('common');
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { confirm } = useConfirm();
  const { toast } = useToast();

  const id = params.id;
  const [editOpen, setEditOpen] = useState(false);

  const { data, isLoading, error, refetch } = useQuery<HrEmployeeDetail>({
    queryKey: ['hr-employee', id],
    queryFn: () => hrEmployeeApi.findOne(id),
    enabled: !!id,
  });

  const { data: roles = [] } = useQuery<HrRole[]>({
    queryKey: ['hr-roles'],
    queryFn: () => hrRoleApi.list(),
  });

  const deleteMut = useMutation({
    mutationFn: () => hrEmployeeApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr-employees'] });
      toast.success(tCommon('saved'));
      router.push('/hr/employees');
    },
    onError: (e: Error) => toast.error(tCommon('action_failed'), { description: e.message }),
  });

  const handleDelete = async () => {
    if (!data) return;
    const ok = await confirm({
      title: t('delete_confirm'),
      description: `${data.name} — ${t('delete_confirm_desc')}`,
      confirmLabel: tCommon('delete'),
      tone: 'destructive',
    });
    if (ok) deleteMut.mutate();
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <ErrorState
        title={tCommon('not_found')}
        description={(error as Error | undefined)?.message}
        onRetry={() => refetch()}
      />
    );
  }

  const initials = data.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .join('');
  const labelOfRole = (value: string) => roles.find((r) => r.value === value)?.label ?? value;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/hr/employees"
            className="text-[var(--ms-text-muted)] text-sm hover:text-[var(--ms-text-brand)]"
          >
            ← {t('detail_back')}
          </Link>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() => setEditOpen(true)}
            data-test-id="hr-employee-detail-edit"
          >
            {t('action_edit')}
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={deleteMut.isPending}
            data-test-id="hr-employee-detail-delete"
          >
            {t('action_delete')}
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <Avatar name={data.name} initials={initials} size="xl" />
        <div>
          <h1 className="font-semibold text-2xl text-[var(--ms-text-strong)]">{data.name}</h1>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {data.hrRoles.map((v) => (
              <Badge key={v} tone="neutral">
                {labelOfRole(v)}
              </Badge>
            ))}
            {data.isChecker && <Badge tone="brand">{t('form_checker')}</Badge>}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <TabBar employeeId={data.id} active="main" />

      {/* Info card */}
      <div className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-4">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <InfoRow label={t('form_email')} value={data.email || t('detail_no_email')} />
          <InfoRow label={t('form_phone')} value={data.phone || t('detail_no_phone')} />
          <InfoRow label={t('form_telegram')} value={data.telegramPhone || tCommon('none')} />
          <InfoRow
            label={t('form_department')}
            value={data.department || t('detail_no_department')}
          />
          <InfoRow
            label={t('set_password_username')}
            value={data.username || t('detail_no_username')}
          />
          <InfoRow
            label={t('detail_last_login')}
            value={
              data.lastLoginAt ? new Date(data.lastLoginAt).toLocaleString() : t('detail_never')
            }
          />
          <InfoRow
            label={t('detail_created_at')}
            value={new Date(data.createdAt).toLocaleString()}
          />
          <InfoRow
            label={t('form_moysklad_agent')}
            value={data.moyskladAgentId ? data.moyskladAgentId : t('detail_no_agent')}
          />
        </dl>
      </div>

      <EmployeeModal open={editOpen} onOpenChange={setEditOpen} mode="edit" initialValues={data} />
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
        {label}
      </dt>
      <dd className="text-[var(--ms-text-primary)] text-sm">{value}</dd>
    </div>
  );
}
