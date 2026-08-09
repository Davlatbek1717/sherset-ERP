'use client';

import { useApiMutation } from '@/hooks/use-api-mutation';
import { useDestructiveMutation } from '@/hooks/use-destructive-mutation';
import { usePermissions } from '@/hooks/use-permissions';
import { api } from '@/lib/api-client';
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  type DataTableColumn,
  FormField,
  Icons,
  Input,
  ListView,
  Modal,
  useToast,
} from '@moysklad/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

/**
 * Настройки → Токены — long-lived integration tokens for the moysklad
 * compat router (`/api/remap/1.2`), Faza Q14.
 *
 * Faza 24 taught `ApiTokenGuard` to enforce `ApiToken.scopes`, but no screen
 * ever existed to SET them (`api-token.controller.ts` promised this page in a
 * comment). Every token in the wild therefore carries `scopes: []`, which the
 * documented scope contract treats as FULL ACCESS — so this page has to do two
 * jobs, not one: mint scoped tokens, and make the unscoped ones visible.
 *
 * FE permission gating here is convenience only — `usePermissions` is
 * fail-open by design (it shows everything while the matrix loads). The real
 * lock is `@RequirePermission({entity:'settings'})` on every handler of
 * `/admin/api-tokens`, covered by `api-token.controller.test.ts`.
 *
 * The server never returns a token's secret after creation (the row stores a
 * SHA-256 hash and `list()` does not even select it), so the plaintext is
 * shown exactly once, in the post-create dialog.
 */

interface ApiTokenRow {
  id: string;
  name: string;
  scopes: string[];
  expiresAt: string | null;
  lastUsedAt: string | null;
  ipAddress: string | null;
  createdAt: string;
  employee: { id: string; name: string; email: string } | null;
}

interface ScopeRegistry {
  slugs: string[];
  actions: string[];
}

interface CreatedToken {
  id: string;
  token: string;
  name: string;
}

/** Per-slug checkbox pair → the wire scope string the server validates. */
type SlugGrant = { read: boolean; write: boolean };

function grantsToScopes(grants: Record<string, SlugGrant>): string[] {
  const out: string[] = [];
  for (const [slug, g] of Object.entries(grants)) {
    // Bare slug = read+write; `:write` implies read (api-token.scope.ts).
    if (g.read && g.write) out.push(slug);
    else if (g.write) out.push(`${slug}:write`);
    else if (g.read) out.push(`${slug}:read`);
  }
  return out;
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString();
}

export default function ApiTokensPage() {
  const t = useTranslations('pages.api_tokens');
  const tCommon = useTranslations('common');
  const { canView } = usePermissions();
  const qc = useQueryClient();
  const { runDestructive } = useDestructiveMutation();
  const { toast } = useToast();

  const [createOpen, setCreateOpen] = useState(false);
  const [createdToken, setCreatedToken] = useState<CreatedToken | null>(null);

  const allowed = canView('settings');

  const { data, isLoading, error, refetch } = useQuery<ApiTokenRow[]>({
    queryKey: ['api-tokens'],
    queryFn: () => api.get<ApiTokenRow[]>('/admin/api-tokens'),
    enabled: allowed,
  });

  const rows = useMemo(() => data ?? [], [data]);
  const fullAccessCount = rows.filter(
    (r) => r.scopes.length === 0 || r.scopes.includes('*'),
  ).length;

  const revokeMut = useApiMutation({
    mutationFn: (id: string) => api.delete(`/admin/api-tokens/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['api-tokens'] });
    },
  });

  const columns: DataTableColumn<ApiTokenRow>[] = [
    {
      key: 'name',
      header: t('col_name'),
      width: '220px',
      cell: (r) => <span className="font-medium text-[var(--ms-text-primary)]">{r.name}</span>,
      cellText: (r) => r.name,
    },
    {
      key: 'scopes',
      header: t('col_scopes'),
      cell: (r) =>
        // Empty list = full access (documented contract). Never render this as
        // a neutral blank cell — an admin must SEE that the token is unscoped.
        r.scopes.length === 0 ? (
          <Badge tone="warning" data-test-id={`api-token-full-access-${r.id}`}>
            {t('full_access_badge')}
          </Badge>
        ) : (
          <div className="flex flex-wrap gap-1">
            {r.scopes.map((s) => (
              <Badge key={s} tone={s === '*' ? 'warning' : 'neutral'}>
                {s}
              </Badge>
            ))}
          </div>
        ),
      cellText: (r) => (r.scopes.length === 0 ? '*' : r.scopes.join(' ')),
    },
    {
      key: 'employee',
      header: t('col_owner'),
      width: '180px',
      cell: (r) => <span className="text-[var(--ms-text-muted)]">{r.employee?.name ?? '—'}</span>,
      cellText: (r) => r.employee?.name ?? '',
    },
    {
      key: 'expiresAt',
      header: t('col_expires'),
      width: '130px',
      cell: (r) => <span>{r.expiresAt ? formatDate(r.expiresAt) : t('never_expires')}</span>,
      cellText: (r) => (r.expiresAt ? formatDate(r.expiresAt) : ''),
    },
    {
      key: 'lastUsedAt',
      header: t('col_last_used'),
      width: '150px',
      cell: (r) => (
        <span className="text-[var(--ms-text-muted)]">
          {r.lastUsedAt ? formatDate(r.lastUsedAt) : t('never_used')}
        </span>
      ),
      cellText: (r) => (r.lastUsedAt ? formatDate(r.lastUsedAt) : ''),
    },
    {
      key: 'createdAt',
      header: t('col_created'),
      width: '130px',
      cell: (r) => <span className="text-[var(--ms-text-muted)]">{formatDate(r.createdAt)}</span>,
      cellText: (r) => formatDate(r.createdAt),
    },
    {
      key: 'actions',
      header: '',
      width: '80px',
      align: 'right',
      cell: (r) => (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          data-test-id={`api-token-revoke-${r.id}`}
          aria-label={t('revoke_action')}
          onClick={() =>
            runDestructive({
              title: t('revoke_confirm', { name: r.name }),
              description: t('revoke_warning'),
              confirmLabel: t('revoke_action'),
              run: () => revokeMut.mutateAsync(r.id),
            })
          }
        >
          <Icons.delete className="h-4 w-4 text-[var(--ms-action-destructive)]" />
        </Button>
      ),
    },
  ];

  if (!allowed) {
    return (
      <div className="px-8 py-6" data-testid="api-tokens-forbidden">
        <Alert tone="destructive" title={t('no_permission_title')}>
          {t('no_permission_desc')}
        </Alert>
      </div>
    );
  }

  return (
    <>
      <ListView
        testId="api-tokens-page"
        title={t('title')}
        subtitle={t('subtitle')}
        onCreate={() => setCreateOpen(true)}
        createLabel={t('create_button')}
        columns={columns}
        rows={rows}
        keyField="id"
        rowTestId={(r) => `api-token-row-${r.id}`}
        total={rows.length}
        limit={rows.length || 1}
        loading={isLoading}
        error={error as Error | null}
        onRetry={() => refetch()}
        emptyTitle={t('empty_title')}
        emptyDescription={t('empty_description')}
        headerSlot={
          fullAccessCount > 0 ? (
            <div className="px-6 pb-3" data-test-id="api-tokens-full-access-notice">
              <Alert tone="warning">{t('full_access_notice', { count: fullAccessCount })}</Alert>
            </div>
          ) : undefined
        }
      />
      {createOpen && (
        <CreateTokenDialog
          onClose={() => setCreateOpen(false)}
          onCreated={(tok) => {
            setCreateOpen(false);
            setCreatedToken(tok);
            qc.invalidateQueries({ queryKey: ['api-tokens'] });
          }}
        />
      )}
      {createdToken && (
        <Modal
          open
          onOpenChange={() => setCreatedToken(null)}
          title={t('created_title')}
          testId="api-token-created-dialog"
          footer={
            <Button type="button" onClick={() => setCreatedToken(null)}>
              {tCommon('close')}
            </Button>
          }
        >
          <div className="space-y-3">
            <Alert tone="warning">{t('created_warning')}</Alert>
            <div className="flex items-center gap-2">
              <code
                className="flex-1 break-all rounded bg-[var(--ms-bg-muted)] px-2 py-1.5 font-mono text-sm"
                data-test-id="api-token-plaintext"
              >
                {createdToken.token}
              </code>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                data-test-id="api-token-copy"
                onClick={() => {
                  navigator.clipboard?.writeText(createdToken.token);
                  toast.success(tCommon('copied'));
                }}
              >
                <Icons.copy className="mr-1 h-3.5 w-3.5" />
                {t('copy')}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

function CreateTokenDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (token: CreatedToken) => void;
}) {
  const t = useTranslations('pages.api_tokens');
  const tCommon = useTranslations('common');

  const [name, setName] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [fullAccess, setFullAccess] = useState(false);
  const [grants, setGrants] = useState<Record<string, SlugGrant>>({});
  const [filter, setFilter] = useState('');

  // The slug vocabulary comes from the server (`compat-slugs.ts`), not a
  // hardcoded frontend list — otherwise the matrix and the create-time
  // validator drift apart and the admin gets a 400 for a checkbox we offered.
  const { data: registry } = useQuery<ScopeRegistry>({
    queryKey: ['api-token-scopes'],
    queryFn: () => api.get<ScopeRegistry>('/admin/api-tokens/scopes'),
  });

  const slugs = registry?.slugs ?? [];
  const visible = filter.trim()
    ? slugs.filter((s) => s.includes(filter.trim().toLowerCase()))
    : slugs;

  const scopes = fullAccess ? ['*'] : grantsToScopes(grants);

  const createMut = useApiMutation({
    mutationFn: () =>
      api.post<CreatedToken>('/admin/api-tokens', {
        name: name.trim(),
        scopes,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      }),
    onSuccess: (tok) => onCreated(tok),
  });

  const toggle = (slug: string, key: keyof SlugGrant) =>
    setGrants((prev) => {
      const cur = prev[slug] ?? { read: false, write: false };
      const next = { ...cur, [key]: !cur[key] };
      // `:write` implies read on the server — keep the boxes honest.
      if (key === 'write' && next.write) next.read = true;
      if (key === 'read' && !next.read) next.write = false;
      return { ...prev, [slug]: next };
    });

  return (
    <Modal
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={t('create_title')}
      widthClass="w-[640px]"
      testId="api-token-create-dialog"
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            {tCommon('cancel')}
          </Button>
          <Button
            type="button"
            data-test-id="api-token-create-submit"
            disabled={!name.trim() || createMut.isPending}
            onClick={() => createMut.mutate()}
          >
            {tCommon('create')}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <FormField id="api-token-name" label={t('field_name')} required>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('field_name_placeholder')}
            data-test-id="api-token-name"
          />
        </FormField>

        <FormField id="api-token-expires" label={t('field_expires')}>
          <Input
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            data-test-id="api-token-expires"
          />
        </FormField>

        <div className="space-y-2">
          <div className="font-medium text-[var(--ms-text-primary)] text-sm">
            {t('scopes_title')}
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={fullAccess}
              onCheckedChange={(v) => setFullAccess(v === true)}
              data-test-id="api-token-full-access"
            />
            <span>{t('scope_all')}</span>
          </label>

          {/* Empty scope list is NOT "no access" — the documented contract
              says it is FULL access (legacy tokens would otherwise die). The
              admin must be told, not silently handed a master key. */}
          {scopes.length === 0 && (
            <Alert tone="warning" data-test-id="api-token-empty-scopes-warning">
              {t('full_access_empty_warning')}
            </Alert>
          )}

          {!fullAccess && (
            <>
              <Input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder={t('scope_filter_placeholder')}
                data-test-id="api-token-scope-filter"
              />
              <div className="max-h-[280px] overflow-y-auto rounded border border-[var(--ms-border-default)]">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-[var(--ms-bg-muted)]">
                    <tr>
                      <th className="px-3 py-1.5 text-left font-medium">{t('scope_col_entity')}</th>
                      <th className="w-20 px-3 py-1.5 text-center font-medium">
                        {t('scope_read')}
                      </th>
                      <th className="w-20 px-3 py-1.5 text-center font-medium">
                        {t('scope_write')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((slug) => {
                      const g = grants[slug] ?? { read: false, write: false };
                      return (
                        <tr key={slug} className="border-[var(--ms-border-subtle)] border-t">
                          <td className="px-3 py-1 font-mono text-xs">{slug}</td>
                          <td className="px-3 py-1 text-center">
                            <Checkbox
                              checked={g.read}
                              onCheckedChange={() => toggle(slug, 'read')}
                              data-test-id={`api-token-scope-${slug}-read`}
                            />
                          </td>
                          <td className="px-3 py-1 text-center">
                            <Checkbox
                              checked={g.write}
                              onCheckedChange={() => toggle(slug, 'write')}
                              data-test-id={`api-token-scope-${slug}-write`}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {scopes.length > 0 && (
            <div className="flex flex-wrap gap-1" data-test-id="api-token-scope-preview">
              {scopes.map((s) => (
                <Badge key={s} tone={s === '*' ? 'warning' : 'neutral'}>
                  {s}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
