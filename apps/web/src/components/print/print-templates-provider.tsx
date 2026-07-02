'use client';

/**
 * «Настройка шаблонов» — moysklad-parity print-template manager. moysklad has NO
 * separate Settings page for templates: they're managed from the document via
 * «Печать ▾ → Настроить», which opens a right-side slide-over. We mirror that
 * exactly — this is the SOLE template-management UI (no /settings page).
 *
 * Root-mounted (survives the «Печать» dropdown closing):
 * `usePrintTemplatesManager().openTemplates(entity)` opens the Drawer scoped to
 * that document type — «Добавить шаблон» (upload .docx/.xlsx), «Скачать» (download
 * the file), «Видимость» toggle, delete. Changes refresh the «Печать» menu.
 */

import { useDestructiveMutation } from '@/hooks/use-destructive-mutation';
import { api } from '@/lib/api-client';
import { Badge, Button, Checkbox, Drawer, Icons } from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { createContext, useContext, useRef, useState } from 'react';

interface PrintTemplatesManager {
  openTemplates: (entity: string) => void;
}
const Ctx = createContext<PrintTemplatesManager | null>(null);

// Tolerant: provider is at the app root; degrade to a no-op if absent (isolated
// unit tests) instead of throwing.
const NOOP_MANAGER: PrintTemplatesManager = { openTemplates: () => {} };

export function usePrintTemplatesManager(): PrintTemplatesManager {
  return useContext(Ctx) ?? NOOP_MANAGER;
}

interface Row {
  id: string;
  name: string;
  format: string;
  enabled: boolean;
}

export function PrintTemplatesProvider({ children }: { children: React.ReactNode }) {
  const t = useTranslations('print_templates_drawer');
  const tEntity = useTranslations('print_entity');
  const qc = useQueryClient();
  const { runDestructive } = useDestructiveMutation();
  const [entity, setEntity] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const open = entity !== null;

  const { data, isLoading } = useQuery<{ items: Row[] }>({
    queryKey: ['pt-drawer', entity],
    enabled: open,
    queryFn: () => api.get(`/print-templates?entity=${entity}&limit=100`),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['pt-drawer', entity] });
    qc.invalidateQueries({ queryKey: ['print-templates-menu', entity] });
  };
  const createMut = useMutation({
    mutationFn: (body: unknown) => api.post('/print-templates', body),
    onSuccess: invalidate,
  });
  const toggleMut = useMutation({
    mutationFn: (v: { id: string; enabled: boolean }) =>
      api.patch(`/print-templates/${v.id}`, { enabled: v.enabled }),
    onSuccess: invalidate,
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/print-templates/${id}`),
    onSuccess: invalidate,
  });

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !entity) return;
    const lower = file.name.toLowerCase();
    const format = lower.endsWith('.xlsx') ? 'xlsx' : lower.endsWith('.docx') ? 'docx' : null;
    if (!format) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      const comma = result.indexOf(',');
      createMut.mutate({
        entity,
        format,
        name: file.name.replace(/\.(docx|xlsx)$/i, ''),
        bodyDocxBase64: comma >= 0 ? result.slice(comma + 1) : result,
        enabled: true,
      });
    };
    reader.readAsDataURL(file);
  };

  const rows = data?.items ?? [];
  // entity label for the drawer subtitle (print_entity has every doc slug).
  const entityLabel = entity ? tEntity(entity as Parameters<typeof tEntity>[0]) : '';

  return (
    <Ctx.Provider value={{ openTemplates: setEntity }}>
      {children}
      <Drawer
        open={open}
        onOpenChange={(o) => !o && setEntity(null)}
        title={t('title')}
        description={entityLabel}
        widthClass="w-[460px]"
        testId="print-templates-drawer"
      >
        <div className="space-y-4 p-4">
          <p className="rounded-[var(--ms-radius-default)] bg-[var(--ms-bg-muted)] px-3 py-2 text-[var(--ms-text-secondary)] text-xs">
            {t('banner')}
          </p>

          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-[var(--ms-text-primary)] text-sm">
              {t('document_section')}
            </h3>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] px-2.5 py-1 text-xs hover:border-[var(--ms-border-strong)]">
              <Icons.upload className="h-3.5 w-3.5" />
              <span>{t('add')}</span>
              <input
                ref={fileRef}
                type="file"
                accept=".docx,.xlsx"
                onChange={onFile}
                className="hidden"
                data-test-id="pt-drawer-add"
              />
            </label>
          </div>

          {isLoading ? (
            <p className="text-[var(--ms-text-muted)] text-sm">{t('loading')}</p>
          ) : rows.length === 0 ? (
            <p className="text-[var(--ms-text-muted)] text-sm">{t('empty')}</p>
          ) : (
            <ul className="divide-y divide-[var(--ms-border-default)] border-[var(--ms-border-default)] border-y">
              {rows.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center gap-2 py-2"
                  data-test-id={`pt-drawer-row-${r.id}`}
                >
                  <label
                    className="inline-flex cursor-pointer items-center"
                    title={t('visible')}
                    aria-label={t('visible')}
                  >
                    <Checkbox
                      checked={r.enabled}
                      onCheckedChange={(v) => toggleMut.mutate({ id: r.id, enabled: !!v })}
                      data-test-id={`pt-drawer-visible-${r.id}`}
                    />
                  </label>
                  <span className="min-w-0 flex-1 truncate text-[var(--ms-text-primary)] text-sm">
                    {r.name}
                  </span>
                  <Badge tone="neutral">{r.format.toUpperCase()}</Badge>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      api.download(`/print-templates/${r.id}/download`, `${r.name}.${r.format}`)
                    }
                    data-test-id={`pt-drawer-download-${r.id}`}
                  >
                    {t('download')}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t('delete')}
                    onClick={() =>
                      runDestructive({
                        title: t('delete_confirm', { name: r.name }),
                        run: () => deleteMut.mutateAsync(r.id),
                      })
                    }
                    data-test-id={`pt-drawer-delete-${r.id}`}
                  >
                    <Icons.delete className="h-4 w-4 text-[var(--ms-action-destructive)]" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Drawer>
    </Ctx.Provider>
  );
}
