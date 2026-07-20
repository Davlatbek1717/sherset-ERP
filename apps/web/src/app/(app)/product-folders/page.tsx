'use client';

import { useApiMutation } from '@/hooks/use-api-mutation';
import { useDestructiveMutation } from '@/hooks/use-destructive-mutation';
import { api } from '@/lib/api-client';
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Container,
  EmptyState,
  FormField,
  FormSection,
  Icons,
  Input,
  Label,
  PageHeader,
} from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface FolderNode {
  id: string;
  parentId: string | null;
  name: string;
  code: string | null;
  externalCode: string | null;
  pathName: string | null;
  vat: number | null;
  vatEnabled: boolean;
  useParentVat: boolean;
  productCount: number;
  children: FolderNode[];
}

interface TreeResponse {
  items: FolderNode[];
  total: number;
}

function FolderRow({
  node,
  depth,
  onCreateChild,
  onEdit,
  onDelete,
  expandedIds,
  toggle,
}: {
  node: FolderNode;
  depth: number;
  onCreateChild: (parentId: string) => void;
  onEdit: (node: FolderNode) => void;
  onDelete: (node: FolderNode) => void;
  expandedIds: Set<string>;
  toggle: (id: string) => void;
}) {
  const t = useTranslations('pages.product_folders');
  const tCommon = useTranslations('common');
  const hasChildren = node.children.length > 0;
  const expanded = expandedIds.has(node.id);
  const ChevronIcon = expanded ? Icons.down : Icons.right;

  return (
    <>
      <tr
        className="border-[var(--ms-border-default)] border-t transition-colors hover:bg-[var(--ms-bg-hover)]"
        data-test-id={`folder-row-${node.id}`}
      >
        <td className="px-3 py-2">
          <div className="flex items-center gap-1" style={{ paddingLeft: `${depth * 20}px` }}>
            {hasChildren ? (
              <button
                type="button"
                onClick={() => toggle(node.id)}
                className="flex h-5 w-5 items-center justify-center text-[var(--ms-text-muted)] hover:text-[var(--ms-text-primary)]"
                aria-label={expanded ? t('toggle_collapse') : t('toggle_expand')}
              >
                <ChevronIcon className="h-4 w-4" />
              </button>
            ) : (
              <span className="h-5 w-5" aria-hidden />
            )}
            <span className="font-medium">{node.name}</span>
            {node.productCount > 0 && (
              <Badge tone="neutral" className="ml-1">
                {node.productCount}
              </Badge>
            )}
          </div>
        </td>
        <td className="px-3 py-2 text-[var(--ms-text-muted)] text-sm">{node.code ?? '—'}</td>
        <td className="px-3 py-2 text-sm">
          {node.vatEnabled ? `${node.vat ?? 0}%` : t('vat_disabled')}
          {node.useParentVat && (
            <span className="ml-1 text-[var(--ms-text-muted)] text-xs">{t('vat_inherited')}</span>
          )}
        </td>
        <td className="px-3 py-2 text-right">
          <div className="inline-flex gap-1">
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => onCreateChild(node.id)}
              title={t('add_subfolder')}
              data-test-id={`folder-add-child-${node.id}`}
            >
              <Icons.create className="h-4 w-4" />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => onEdit(node)}
              title={tCommon('edit')}
              data-test-id={`folder-edit-${node.id}`}
            >
              <Icons.edit className="h-4 w-4" />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => onDelete(node)}
              title={tCommon('delete')}
              data-test-id={`folder-delete-${node.id}`}
            >
              <Icons.delete className="h-4 w-4 text-[var(--ms-action-destructive)]" />
            </Button>
          </div>
        </td>
      </tr>
      {expanded &&
        node.children.map((child) => (
          <FolderRow
            key={child.id}
            node={child}
            depth={depth + 1}
            onCreateChild={onCreateChild}
            onEdit={onEdit}
            onDelete={onDelete}
            expandedIds={expandedIds}
            toggle={toggle}
          />
        ))}
    </>
  );
}

export default function ProductFoldersPage() {
  const t = useTranslations('pages.product_folders');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const qc = useQueryClient();
  const { runDestructive } = useDestructiveMutation();
  const { data, isLoading, error, refetch } = useQuery<TreeResponse>({
    queryKey: ['product-folders', 'tree'],
    queryFn: () => api.get<TreeResponse>('/product-folders/tree'),
  });

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const toggle = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Form state
  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null);
  const [editing, setEditing] = useState<FolderNode | null>(null);
  const [parentId, setParentId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [externalCode, setExternalCode] = useState('');
  const [vat, setVat] = useState('12');
  const [useParentVat, setUseParentVat] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);

  const resetForm = () => {
    setFormMode(null);
    setEditing(null);
    setParentId(null);
    setName('');
    setCode('');
    setExternalCode('');
    setVat('12');
    setUseParentVat(true);
    setFormError(null);
  };

  const onCreateRoot = () => {
    resetForm();
    setFormMode('create');
    setParentId(null);
  };

  const onCreateChild = (pid: string) => {
    resetForm();
    setFormMode('create');
    setParentId(pid);
  };

  const onEdit = (node: FolderNode) => {
    resetForm();
    setFormMode('edit');
    setEditing(node);
    setName(node.name);
    setCode(node.code ?? '');
    setExternalCode(node.externalCode ?? '');
    setVat(node.vat != null ? String(node.vat) : '');
    setUseParentVat(node.useParentVat);
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload = {
        name,
        code: code || undefined,
        externalCode: externalCode || undefined,
        parentId,
        vat: vat ? Number(vat) : null,
        useParentVat,
        vatEnabled: true,
      };
      if (formMode === 'edit' && editing) {
        return api.patch(`/product-folders/${editing.id}`, payload);
      }
      return api.post('/product-folders', payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['product-folders'] });
      resetForm();
    },
    onError: (err: Error) => setFormError(err.message),
  });

  const deleteMut = useApiMutation({
    mutationFn: (id: string) => api.delete(`/product-folders/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['product-folders'] }),
  });

  const onDelete = (node: FolderNode) => {
    const hasContent = node.productCount > 0 || node.children.length > 0;
    void runDestructive({
      title: t('delete_confirm_title', { name: node.name }),
      description: hasContent ? t('delete_blocked') : tCommon('action_irreversible'),
      run: () => deleteMut.mutateAsync(node.id),
    });
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setFormError(tCommon('field_required', { field: tFields('name') }));
      return;
    }
    // Guard the free-text VAT field before the Number() coercion at the
    // payload site (mirrors the products regex guard): a stray non-numeric
    // char would otherwise send NaN to the API and surface as a raw 400.
    if (!useParentVat && vat.trim() !== '' && !/^\d+$/.test(vat.trim())) {
      setFormError(t('number_invalid'));
      return;
    }
    setFormError(null);
    saveMut.mutate();
  };

  return (
    <Container size="full" className="space-y-4 py-4" data-test-id="product-folders-page">
      <PageHeader
        title={t('title')}
        subtitle={data ? tCommon('records_count', { count: data.total }) : undefined}
        actions={
          <Button onClick={onCreateRoot} data-test-id="folder-create-root">
            <Icons.create className="h-4 w-4" />
            {t('create_button')}
          </Button>
        }
      />

      {error && (
        <Alert tone="destructive">
          {(error as Error).message}
          <Button size="sm" variant="secondary" onClick={() => refetch()} className="ml-2">
            {tCommon('retry')}
          </Button>
        </Alert>
      )}

      {formMode && (
        <FormSection
          title={formMode === 'edit' ? tCommon('edit') : t('create_button')}
          description={parentId && editing?.pathName ? editing.pathName : undefined}
        >
          {formError && <Alert tone="destructive">{formError}</Alert>}
          <form onSubmit={submit} className="space-y-3" data-test-id="folder-form">
            <FormField id="name" label={tFields('name')} required>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                data-test-id="folder-name"
                invalid={!name.trim() && !!formError}
                autoFocus
              />
            </FormField>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <FormField id="code" label={tFields('code')}>
                <Input
                  id="code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  data-test-id="folder-code"
                />
              </FormField>
              <FormField id="externalCode" label={tFields('external_code')}>
                <Input
                  id="externalCode"
                  value={externalCode}
                  onChange={(e) => setExternalCode(e.target.value)}
                  data-test-id="folder-external-code"
                />
              </FormField>
              <FormField id="vat" label={`${tFields('vat')} (%)`}>
                <Input
                  id="vat"
                  inputMode="numeric"
                  value={vat}
                  onChange={(e) => setVat(e.target.value)}
                  disabled={useParentVat}
                  data-test-id="folder-vat"
                />
              </FormField>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="useParentVat"
                checked={useParentVat}
                onCheckedChange={(v) => setUseParentVat(v === true)}
              />
              <Label htmlFor="useParentVat">{t('use_parent_vat')}</Label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={resetForm}>
                {tCommon('cancel')}
              </Button>
              <Button type="submit" loading={saveMut.isPending} data-test-id="folder-save">
                <Icons.save className="h-4 w-4" />
                {tCommon('save')}
              </Button>
            </div>
          </form>
        </FormSection>
      )}

      <div className="overflow-hidden rounded-[var(--ms-radius-md)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--ms-bg-muted)]">
            <tr>
              <th className="h-9 px-3 text-left font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                {tFields('name')}
              </th>
              <th className="h-9 w-40 px-3 text-left font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                {tFields('code')}
              </th>
              <th className="h-9 w-32 px-3 text-left font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                {tFields('vat')}
              </th>
              <th className="h-9 w-32 px-3 text-right font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                {tCommon('actions')}
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={4} className="py-6 text-center text-[var(--ms-text-muted)] text-sm">
                  {tCommon('loading')}
                </td>
              </tr>
            ) : data?.items.length === 0 ? (
              <tr>
                <td colSpan={4}>
                  <EmptyState
                    title={tCommon('no_records')}
                    action={
                      <Button onClick={onCreateRoot}>
                        <Icons.create className="h-4 w-4" />
                        {t('create_button')}
                      </Button>
                    }
                  />
                </td>
              </tr>
            ) : (
              data?.items.map((node) => (
                <FolderRow
                  key={node.id}
                  node={node}
                  depth={0}
                  onCreateChild={onCreateChild}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  expandedIds={expandedIds}
                  toggle={toggle}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </Container>
  );
}
