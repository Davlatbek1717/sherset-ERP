'use client';

import { api } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';
import { Badge, Button, Container, PageHeader } from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BarChart3,
  Bot,
  Globe,
  Handshake,
  type LucideIcon,
  MessageSquare,
  Puzzle,
  Receipt,
  Webhook,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

// Per-appKey icon map. Each integration shipped with an emoji at the API
// boundary; we render a Lucide line icon here so the marketplace matches
// the rest of the moysklad.uz iconography. Fallback to a generic Puzzle
// icon for any future appKey that hasn't been mapped yet.
const APP_ICONS: Record<string, LucideIcon> = {
  telegram_bot: Bot,
  sms_eskiz: MessageSquare,
  webhook_export: Webhook,
  soliq_bot: Receipt,
  crm_amocrm: Handshake,
  analytics_metrika: BarChart3,
};

interface AvailableApp {
  appKey: string;
  iconEmoji: string;
  nameKey: string;
  descriptionKey: string;
  installed: boolean;
  enabled: boolean;
  config: Record<string, unknown> | null;
  installedAt: string | null;
  installId: string | null;
}

// Map backend nameKey/descriptionKey to i18n keys for the frontend
function resolveKey(nameKey: string): string {
  // nameKey looks like "pages.app_keys.telegram_bot.name"
  // We split and use the last two segments: e.g., "telegram_bot.name"
  const parts = nameKey.split('.');
  return parts.slice(-2).join('.');
}

export default function AppsMarketplacePage() {
  const tCommon = useTranslations('common');
  const t = useTranslations('pages.apps');
  const tKeys = useTranslations('pages.app_keys');
  const { user } = useAuth();
  const qc = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  const { data: apps, isLoading } = useQuery<AvailableApp[]>({
    queryKey: ['app-installs-available'],
    queryFn: () => api.get<AvailableApp[]>('/app-installs/available'),
    enabled: !!user,
  });

  const installMut = useMutation({
    mutationFn: (appKey: string) => api.post('/app-installs', { appKey }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['app-installs-available'] });
      setActionError(null);
    },
    onError: (e: Error) => setActionError(e.message),
    onSettled: () => setPendingKey(null),
  });

  const uninstallMut = useMutation({
    mutationFn: (appKey: string) => api.delete(`/app-installs/${appKey}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['app-installs-available'] });
      setActionError(null);
    },
    onError: (e: Error) => setActionError(e.message),
    onSettled: () => setPendingKey(null),
  });

  const handleInstall = (appKey: string) => {
    setActionError(null);
    setPendingKey(appKey);
    installMut.mutate(appKey);
  };

  const handleUninstall = (appKey: string) => {
    setActionError(null);
    setPendingKey(appKey);
    uninstallMut.mutate(appKey);
  };

  if (isLoading) {
    return (
      <Container size="md" className="py-4">
        <div className="text-[var(--ms-text-muted)] text-sm">{tCommon('loading')}</div>
      </Container>
    );
  }

  return (
    <Container size="md" className="py-4">
      <PageHeader title={t('title')} subtitle={t('description')} />

      {actionError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-600 text-sm">
          {actionError}
        </div>
      )}

      {/* Built-in solutions — NOT part of the installable marketplace above.
          moysklad has no «Онлайн-торговля» navbar tab (grounded 2026-06-23); it
          exposes e-commerce as an integration under «Решения». So this is the
          entry point into /ecommerce (channels + orders), which now belongs to
          the apps module. User decision 2026-06-23: «Решения ostiga ko'chirish». */}
      <section className="mt-2" data-test-id="apps-builtin">
        <h2 className="mb-3 font-semibold text-base">{t('builtin_title')}</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <a
            href="/ecommerce"
            className="flex flex-col gap-3 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-5 transition-colors hover:border-[var(--ms-border-strong)]"
            data-test-id="builtin-ecommerce"
          >
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-[var(--ms-bg-muted)] text-[var(--ms-text-brand)]">
              <Globe className="h-6 w-6" aria-hidden />
            </div>
            <div>
              <h3 className="mb-1 font-semibold text-base">{t('ecommerce_name')}</h3>
              <p className="text-[var(--ms-text-muted)] text-sm">{t('ecommerce_desc')}</p>
            </div>
            <span className="mt-auto inline-flex h-8 items-center justify-center rounded-lg border border-[var(--ms-border-default)] px-3 font-medium text-sm">
              {t('open_button')}
            </span>
          </a>
        </div>
      </section>

      <h2 className="mt-6 mb-3 font-semibold text-base">{t('marketplace_title')}</h2>
      <div
        className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
        data-test-id="apps-marketplace"
      >
        {apps?.map((app) => {
          const nameKey = resolveKey(app.nameKey) as Parameters<typeof tKeys>[0];
          const descKey = resolveKey(app.descriptionKey) as Parameters<typeof tKeys>[0];
          const isBusy = pendingKey === app.appKey;

          return (
            <div
              key={app.appKey}
              className="flex flex-col gap-3 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-5"
              data-test-id={`app-card-${app.appKey}`}
            >
              <div className="flex items-start justify-between">
                {(() => {
                  const Icon = APP_ICONS[app.appKey] ?? Puzzle;
                  return (
                    <div className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-[var(--ms-bg-muted)] text-[var(--ms-text-brand)]">
                      <Icon className="h-6 w-6" aria-hidden />
                    </div>
                  );
                })()}
                {app.installed && <Badge tone="success">{t('enabled_badge')}</Badge>}
              </div>

              <div>
                <h2 className="mb-1 font-semibold text-base">{tKeys(nameKey)}</h2>
                <p className="text-[var(--ms-text-muted)] text-sm">{tKeys(descKey)}</p>
              </div>

              <div className="mt-auto flex gap-2">
                {!app.installed ? (
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={() => handleInstall(app.appKey)}
                    loading={isBusy}
                    className="flex-1"
                    data-test-id={`install-btn-${app.appKey}`}
                  >
                    {t('install_button')}
                  </Button>
                ) : (
                  <>
                    <a
                      href={`/apps/${app.appKey}`}
                      className="flex h-8 flex-1 items-center justify-center rounded-lg border border-[var(--ms-border-default)] font-medium text-sm transition-colors hover:border-[var(--ms-border-strong)]"
                      data-test-id={`configure-btn-${app.appKey}`}
                    >
                      {t('configure_button')}
                    </a>
                    <button
                      type="button"
                      onClick={() => handleUninstall(app.appKey)}
                      disabled={isBusy}
                      className="h-8 rounded-lg border border-red-200 px-3 text-red-600 text-sm transition-colors hover:bg-red-50 disabled:opacity-50"
                      data-test-id={`uninstall-btn-${app.appKey}`}
                    >
                      {isBusy ? '...' : t('uninstall_button')}
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Container>
  );
}
