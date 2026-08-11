'use client';

import { api } from '@/lib/api-client';
import { Button, Input, NativeSelect } from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { type MatrixCell, type MatrixMeta, PermissionMatrix } from './permission-matrix';

/**
 * MK29 shablonlari (`GET /roles/templates`). Ular server registridan keladi —
 * ro'yxat bu yerda NUSXA qilinmaydi.
 */
interface RoleTemplate {
  slug: string;
  seedName: string;
  description: string;
  uiMode: 'full' | 'kiosk';
}

export function NewRoleView() {
  const t = useTranslations('pages.analitika_settings');
  const qc = useQueryClient();
  const router = useRouter();

  const metaQuery = useQuery<MatrixMeta>({
    queryKey: ['roles', 'meta'],
    queryFn: () => api.get<MatrixMeta>('/roles/meta'),
    staleTime: 5 * 60 * 1000,
  });
  const templatesQuery = useQuery<{ items: RoleTemplate[] }>({
    queryKey: ['roles', 'templates'],
    queryFn: () => api.get<{ items: RoleTemplate[] }>('/roles/templates'),
    staleTime: 5 * 60 * 1000,
  });

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [perms, setPerms] = useState<MatrixCell[]>([]);
  // P11 — shablon tanlansa rol matritsasi VA `uiMode` server registridan
  // qo'llanadi. Bu yagona yo'l `uiMode: 'kiosk'` olish uchun: `POST /roles`
  // uni umuman qabul qilmaydi, ya'ni shablonsiz «Kassir» roli har doim
  // butun ERP menyusi bilan chiqardi (kassa TZ §3.1 buzilishi).
  const [templateSlug, setTemplateSlug] = useState('');
  const templates = templatesQuery.data?.items ?? [];
  const selectedTemplate = templates.find((x) => x.slug === templateSlug) ?? null;

  const create = useMutation({
    mutationFn: async () => {
      const created = await api.post<{ id: string; version: number }>('/roles', {
        name: name.trim(),
        description: description.trim() || undefined,
        permissions: perms,
      });
      if (templateSlug && created?.id) {
        await api.post(`/roles/${created.id}/apply-template`, {
          slug: templateSlug,
          version: created.version,
        });
      }
      return created;
    },
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['roles'] });
      if (created?.id) router.push(`/analitika/sozlamalar/rollar/${created.id}`);
    },
  });

  const canSave = name.trim().length > 0 && !create.isPending;

  if (metaQuery.isLoading || !metaQuery.data) {
    return <p className="text-[var(--ms-text-muted)] text-sm">{t('loading')}</p>;
  }

  return (
    <div className="space-y-4">
      <a
        href="/analitika/sozlamalar/rollar"
        className="text-[var(--ms-text-brand)] text-sm hover:underline"
      >
        {t('role_back')}
      </a>

      <section className="rounded-lg border border-[var(--ms-border)] bg-white p-5">
        <h2 className="font-semibold text-[var(--ms-text-primary)] text-lg">
          {t('role_new_title')}
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="block text-[var(--ms-text-muted)]">{t('role_name')}</span>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('role_name_ph')}
              className="mt-1"
              autoFocus
            />
          </label>
          <label className="block text-sm">
            <span className="block text-[var(--ms-text-muted)]">{t('role_desc')}</span>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('role_desc_ph')}
              className="mt-1"
            />
          </label>
          <label className="block text-sm">
            <span className="block text-[var(--ms-text-muted)]">{t('role_template')}</span>
            <NativeSelect
              value={templateSlug}
              onChange={(e) => {
                const slug = e.target.value;
                setTemplateSlug(slug);
                // Nom bo'sh bo'lsa shablon nomidan boshlang'ich qiymat —
                // «Kassir» rolini qidirayotgan egasi uni qo'lda yozmasin.
                const tpl = templates.find((x) => x.slug === slug);
                if (tpl && !name.trim()) setName(tpl.seedName);
              }}
              className="mt-1 w-full"
              data-test-id="role-template-select"
            >
              <option value="">{t('role_template_none')}</option>
              {templates.map((tpl) => (
                <option key={tpl.slug} value={tpl.slug}>
                  {tpl.seedName}
                  {tpl.uiMode === 'kiosk' ? ' — kiosk' : ''}
                </option>
              ))}
            </NativeSelect>
            {selectedTemplate && (
              <span
                className="mt-1 block text-[var(--ms-text-muted)] text-xs"
                data-test-id="role-template-hint"
              >
                {selectedTemplate.description}
                {selectedTemplate.uiMode === 'kiosk' ? ` · ${t('role_template_kiosk')}` : ''}
              </span>
            )}
          </label>
        </div>
      </section>

      {/* Shablon tanlangan bo'lsa quyidagi matritsa QAYTA YOZILADI — buni
          oldindan aytish shart, aks holda admin katakchalarni bexuda belgilaydi. */}
      {selectedTemplate && (
        <p className="text-[var(--ms-text-muted)] text-xs" data-test-id="role-template-overwrite">
          {t('role_template_overwrite')}
        </p>
      )}

      <PermissionMatrix meta={metaQuery.data} value={perms} onChange={setPerms} />

      <div className="-mx-6 sticky bottom-0 z-20 border-[var(--ms-border)] border-t bg-white px-6 py-3 shadow-[0_-2px_8px_rgba(0,0,0,0.04)]">
        <div className="flex items-center justify-end gap-3">
          {/* role="alert" — G1 imtiyoz-oshirish rad javobi (MK40 brauzer-QA'da
              o'lchandi) shu yerda chiqadi; ovozli o'quvchi uni e'lon qilishi
              kerak, aks holda ko'rmaydigan admin «saqlandi» deb o'ylaydi. */}
          {create.isError && (
            <span
              role="alert"
              className="text-[var(--ms-destructive-500)] text-xs"
              data-test-id="role-create-error"
            >
              {(create.error as Error)?.message}
            </span>
          )}
          <Button onClick={() => create.mutate()} disabled={!canSave}>
            {t('role_save')}
          </Button>
        </div>
      </div>
    </div>
  );
}
