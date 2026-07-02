'use client';

// Settings → Users → employee access rights.
// Profile is read-only here (full profile editing lives in the HR dashboard,
// /hr/employees). This page owns RBAC role assignment: it reads the employee
// (GET /hr/employees/:id), the available roles (GET /roles) and the employee's
// current roles (GET /roles/employee/:id), and saves a replace-set via
// PUT /roles/employee/:id { roleIds }.

import { api } from '@/lib/api-client';
import { Badge, Button, Checkbox, useToast } from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

interface EmployeeDetail {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  username: string | null;
  department: string | null;
  lastLoginAt: string | null;
}

interface RoleRow {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  memberCount: number;
}

export default function UserDetailPage() {
  const t = useTranslations('pages.user_admin');
  const tCommon = useTranslations('common');
  const { toast } = useToast();
  const qc = useQueryClient();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const { data: employee, isLoading } = useQuery<EmployeeDetail>({
    queryKey: ['settings-user', id],
    queryFn: () => api.get<EmployeeDetail>(`/hr/employees/${id}`),
    enabled: !!id,
  });

  const { data: rolesData } = useQuery<{ items: RoleRow[] }>({
    queryKey: ['roles'],
    queryFn: () => api.get<{ items: RoleRow[] }>('/roles'),
  });

  const { data: assigned } = useQuery<{ roleIds: string[] }>({
    queryKey: ['settings-user-roles', id],
    queryFn: () => api.get<{ roleIds: string[] }>(`/roles/employee/${id}`),
    enabled: !!id,
  });

  const roles = rolesData?.items ?? [];

  // Local selection, seeded from the server once the assignment loads.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (assigned?.roleIds) setSelected(new Set(assigned.roleIds));
  }, [assigned?.roleIds]);

  const initial = useMemo(() => new Set(assigned?.roleIds ?? []), [assigned?.roleIds]);
  const dirty = useMemo(() => {
    if (selected.size !== initial.size) return true;
    for (const r of selected) if (!initial.has(r)) return true;
    return false;
  }, [selected, initial]);

  const saveMut = useMutation({
    mutationFn: () =>
      api.put<{ roleIds: string[] }>(`/roles/employee/${id}`, { roleIds: [...selected] }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings-user-roles', id] });
      qc.invalidateQueries({ queryKey: ['roles'] });
      toast.success(tCommon('saved'));
    },
    onError: (e: Error) => toast.error(tCommon('action_failed'), { description: e.message }),
  });

  const toggle = (roleId: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(roleId)) next.delete(roleId);
      else next.add(roleId);
      return next;
    });

  if (isLoading) {
    return <div className="p-6 text-[var(--ms-text-muted)] text-sm">{tCommon('loading')}</div>;
  }
  if (!employee) {
    return <div className="p-6 text-[var(--ms-text-muted)] text-sm">{tCommon('not_found')}</div>;
  }

  return (
    <div className="mx-auto max-w-2xl p-6" data-test-id="user-detail-page">
      <nav className="mb-4 text-[var(--ms-text-muted)] text-sm">
        <a
          href="/settings/users"
          className="underline-offset-2 hover:text-[var(--ms-text-brand)] hover:underline"
        >
          {t('title')}
        </a>
        <span className="mx-2">/</span>
        <span className="text-[var(--ms-text-primary)]">{employee.name}</span>
      </nav>

      <h1 className="mb-4 font-semibold text-[var(--ms-text-primary)] text-xl">{employee.name}</h1>

      {/* Profile (read-only — edit in the HR dashboard) */}
      <div className="mb-6 divide-y divide-[var(--ms-border-default)] rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)]">
        <Row label={t('col_name')} value={employee.name} />
        <Row label={t('col_email')} value={employee.email} />
        <Row label={t('col_phone')} value={employee.phone ?? '—'} />
        <Row label={t('col_login')} value={employee.username ?? '—'} />
        <Row
          label={t('col_last_login')}
          value={employee.lastLoginAt ? new Date(employee.lastLoginAt).toLocaleString() : '—'}
        />
      </div>

      {/* RBAC role assignment */}
      <section data-test-id="user-roles-section">
        <h2 className="mb-1 font-semibold text-[var(--ms-text-strong)] text-lg">
          {t('col_roles')}
        </h2>
        <p className="mb-3 text-[var(--ms-text-muted)] text-sm">{t('roles_hint')}</p>

        {roles.length === 0 ? (
          <p className="text-[var(--ms-text-muted)] text-sm">{t('roles_not_available')}</p>
        ) : (
          <div className="divide-y divide-[var(--ms-border-default)] rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)]">
            {roles.map((role) => (
              <label
                key={role.id}
                className="flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-[var(--ms-bg-subtle)]"
                data-test-id={`role-option-${role.id}`}
              >
                <Checkbox
                  className="mt-0.5"
                  checked={selected.has(role.id)}
                  onCheckedChange={() => toggle(role.id)}
                />
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="font-medium text-[var(--ms-text-primary)] text-sm">
                      {role.name}
                    </span>
                    {role.isSystem && <Badge tone="neutral">{tCommon('system')}</Badge>}
                  </span>
                  {role.description && (
                    <span className="block text-[var(--ms-text-muted)] text-xs">
                      {role.description}
                    </span>
                  )}
                </span>
              </label>
            ))}
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <Button
            onClick={() => saveMut.mutate()}
            disabled={!dirty || saveMut.isPending}
            data-test-id="user-roles-save"
          >
            {tCommon('save')}
          </Button>
        </div>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4 px-4 py-3">
      <span className="w-36 shrink-0 text-[var(--ms-text-muted)] text-sm">{label}</span>
      <span className="text-[var(--ms-text-primary)] text-sm">{value}</span>
    </div>
  );
}
