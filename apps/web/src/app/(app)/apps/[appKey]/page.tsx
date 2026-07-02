'use client';

import { api } from '@/lib/api-client';
import { Badge, Button, Container, PageHeader, Textarea } from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BarChart3,
  Bot,
  Handshake,
  type LucideIcon,
  MessageSquare,
  Puzzle,
  Receipt,
  Webhook,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

// Mirrors the appKey → Lucide icon map used on the marketplace grid; kept
// inline so the detail page stays self-contained.
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

function resolveKey(nameKey: string): string {
  const parts = nameKey.split('.');
  return parts.slice(-2).join('.');
}

const TEXTAREA_CLASS =
  'w-full min-h-[160px] px-3 py-2 text-sm bg-[var(--ms-bg-surface)] border border-[var(--ms-border-default)] rounded-[var(--ms-radius-default)] hover:border-[var(--ms-border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ms-border-focus)] focus-visible:ring-offset-1 placeholder:text-[var(--ms-text-placeholder)] font-mono';

export default function AppDetailPage() {
  const tCommon = useTranslations('common');
  const params = useParams<{ appKey: string }>();
  const appKey = params?.appKey ?? '';
  const router = useRouter();
  const qc = useQueryClient();
  const t = useTranslations('pages.apps');
  const tKeys = useTranslations('pages.app_keys');

  const [configText, setConfigText] = useState('');
  const [configError, setConfigError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const { data: apps, isLoading } = useQuery<AvailableApp[]>({
    queryKey: ['app-installs-available'],
    queryFn: () => api.get<AvailableApp[]>('/app-installs/available'),
  });

  const app = apps?.find((a) => a.appKey === appKey);

  useEffect(() => {
    if (!app) return;
    setConfigText(app.config ? JSON.stringify(app.config, null, 2) : '');
  }, [app]);

  const saveMut = useMutation({
    mutationFn: () => {
      setConfigError(null);
      setSaveSuccess(false);
      const trimmed = configText.trim();
      let config: Record<string, unknown> | null = null;
      if (trimmed) {
        try {
          config = JSON.parse(trimmed) as Record<string, unknown>;
        } catch {
          setConfigError(t('invalid_json'));
          throw new Error(t('invalid_json'));
        }
      }
      return api.patch(`/app-installs/${appKey}/config`, { config });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['app-installs-available'] });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    },
    onError: (e: Error) => setActionError(e.message),
  });

  const uninstallMut = useMutation({
    mutationFn: () => api.delete(`/app-installs/${appKey}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['app-installs-available'] });
      router.push('/apps');
    },
    onError: (e: Error) => setActionError(e.message),
  });

  if (isLoading) {
    return (
      <Container size="md" className="py-4">
        <div className="text-[var(--ms-text-muted)] text-sm">{tCommon('loading')}</div>
      </Container>
    );
  }

  if (!app) {
    return (
      <Container size="md" className="py-4">
        <div className="mb-4 flex items-center gap-2 text-[var(--ms-text-muted)] text-sm">
          <a href="/apps" className="hover:underline">
            {t('title')}
          </a>
          <span>/</span>
          <span>{appKey}</span>
        </div>
        <div className="text-[var(--ms-text-muted)] text-sm">Ilova topilmadi: {appKey}</div>
      </Container>
    );
  }

  const nameKey = resolveKey(app.nameKey) as Parameters<typeof tKeys>[0];
  const descKey = resolveKey(app.descriptionKey) as Parameters<typeof tKeys>[0];
  const appName = tKeys(nameKey);

  if (!app.installed) {
    return (
      <Container size="md" className="py-4">
        <div className="mb-4 flex items-center gap-2 text-[var(--ms-text-muted)] text-sm">
          <a href="/apps" className="hover:underline">
            {t('title')}
          </a>
          <span>/</span>
          <span>{appName}</span>
        </div>
        <div className="py-12 text-center">
          <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-md bg-[var(--ms-bg-muted)] text-[var(--ms-text-brand)]">
            {(() => {
              const Icon = APP_ICONS[app.appKey] ?? Puzzle;
              return <Icon className="h-8 w-8" aria-hidden />;
            })()}
          </div>
          <h2 className="mb-2 font-semibold text-xl">{appName}</h2>
          <p className="mb-6 text-[var(--ms-text-muted)] text-sm">{tKeys(descKey)}</p>
          <p className="text-[var(--ms-text-muted)] text-sm">
            Ilovani sozlash uchun avval uni o&apos;rnating.
          </p>
          <a
            href="/apps"
            className="mt-2 block text-[var(--ms-text-brand)] text-sm hover:underline"
          >
            ← {t('title')}
          </a>
        </div>
      </Container>
    );
  }

  return (
    <Container size="md" className="py-4">
      <div className="mb-4 flex items-center gap-2 text-[var(--ms-text-muted)] text-sm">
        <a href="/apps" className="hover:underline">
          {t('title')}
        </a>
        <span>/</span>
        <span className="text-[var(--ms-text-primary)]">{appName}</span>
      </div>

      <div className="mb-6 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-md bg-[var(--ms-bg-muted)] text-[var(--ms-text-brand)]">
            {(() => {
              const Icon = APP_ICONS[app.appKey] ?? Puzzle;
              return <Icon className="h-7 w-7" aria-hidden />;
            })()}
          </div>
          <div>
            <PageHeader title={appName} subtitle={tKeys(descKey)} />
          </div>
        </div>
        <Badge tone="success">{t('enabled_badge')}</Badge>
      </div>

      {actionError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-600 text-sm">
          {actionError}
        </div>
      )}

      {saveSuccess && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-green-700 text-sm">
          {t('config_saved')}
        </div>
      )}

      {/* Config section */}
      <div className="mb-4 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-5">
        <h3 className="mb-1 font-semibold text-sm">{t('config_title')}</h3>
        <p className="mb-3 text-[var(--ms-text-muted)] text-xs">{t('config_hint')}</p>
        <Textarea
          value={configText}
          onChange={(e) => {
            setConfigText(e.target.value);
            setConfigError(null);
          }}
          className={TEXTAREA_CLASS}
          placeholder={'{\n  "apiKey": "...",\n  "chatId": "..."\n}'}
          data-test-id="config-textarea"
        />
        {configError && <p className="mt-1 text-red-600 text-xs">{configError}</p>}
        <div className="mt-3">
          <Button
            variant="primary"
            size="sm"
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending}
          >
            {saveMut.isPending ? '...' : t('config_save')}
          </Button>
        </div>
      </div>

      {/* Uninstall section */}
      <div className="rounded-[var(--ms-radius-default)] border border-red-200 bg-[var(--ms-bg-surface)] p-5">
        <h3 className="mb-1 font-semibold text-red-700 text-sm">{t('danger_zone')}</h3>
        <p className="mb-3 text-[var(--ms-text-muted)] text-xs">{t('uninstall_description')}</p>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => {
            setActionError(null);
            uninstallMut.mutate();
          }}
          disabled={uninstallMut.isPending}
        >
          {uninstallMut.isPending ? '...' : t('uninstall_button')}
        </Button>
      </div>
    </Container>
  );
}
