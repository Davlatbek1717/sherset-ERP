'use client';

import { useApiMutation } from '@/hooks/use-api-mutation';
import { useDestructiveMutation } from '@/hooks/use-destructive-mutation';
import { api } from '@/lib/api-client';
import { getAccessToken, useAuth } from '@/lib/auth-store';
import { Button, FormSection, Icons, Modal, StickyHScroll } from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useMemo, useRef, useState } from 'react';

export type AttachmentEntity =
  | 'Counterparty'
  | 'CounterpartyAdjustment'
  | 'CustomerOrder'
  | 'Demand'
  | 'InvoiceOut'
  | 'Prepayment'
  | 'PrepaymentReturn'
  | 'InternalOrder'
  | 'ProcessingOrder'
  | 'Processing'
  | 'Payroll'
  | 'Publication'
  | 'PriceList'
  | 'Supply'
  | 'PurchaseOrder'
  | 'InvoiceIn'
  | 'PaymentIn'
  | 'PaymentOut'
  | 'SalesReturn'
  | 'PurchaseReturn'
  | 'Move'
  | 'Loss'
  | 'Enter'
  | 'Inventory'
  | 'CashIn'
  | 'CashOut'
  | 'Opportunity'
  | 'Product'
  | 'Task'
  | 'CommissionReportOut'
  | 'CommissionReportIn';

interface Attachment {
  id: string;
  filename: string;
  mime: string;
  sizeBytes: number;
  description: string | null;
  createdAt: string;
  uploader: { id: string; name: string } | null;
}

/** A file staged on a create form (no saved entity yet); uploaded after create. */
export interface StagedFile {
  key: string;
  file: File;
  /** When the file was added (ISO) — moysklad shows it in «Дата добавления» before save. */
  addedAt?: string;
  /** Blob preview URL for image files (object URL); shown as a thumbnail. */
  previewUrl?: string;
}

/** Controller for the pre-save «Файлы» tab: files are held locally and POSTed after the
 *  parent record is created (mirrors the staged contacts/banks on /counterparties/new). */
export interface StagedFilesController {
  files: StagedFile[];
  onAdd(files: File[]): void;
  onRemove(key: string): void;
}

export interface AttachmentsSectionProps {
  entity: AttachmentEntity;
  /** Empty/ignored in staged (pre-save) mode. */
  entityId: string;
  /** When true, render WITHOUT the «Файлы» FormSection title (inside a tab already labelled). */
  hideTitle?: boolean;
  /** Pre-save mode: drive the table from a local staged-file list instead of the server. */
  staged?: StagedFilesController;
}

const MAX_BYTES = 10_000_000;
const PAGE_SIZE = 25;

export function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Read failed'));
        return;
      }
      resolve(result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('Read error'));
    reader.readAsDataURL(file);
  });
}

function fileIcon(mime: string): string {
  if (mime.startsWith('image/')) return '🖼';
  if (mime === 'application/pdf') return '📄';
  if (mime.includes('spreadsheet') || mime.includes('excel') || mime === 'text/csv') return '📊';
  if (mime.includes('word') || mime === 'application/msword') return '📝';
  if (mime.startsWith('audio/')) return '🎵';
  if (mime.startsWith('video/')) return '🎬';
  if (mime === 'application/zip' || mime.includes('compressed')) return '🗜';
  return '📎';
}

/** moysklad's «Размер, МБ» column shows the size in megabytes (1 MB = 1 000 000 B,
 *  matching the BE's 10 MB limit), 2 decimals, ru-locale comma separator. */
function formatMb(bytes: number): string {
  return (bytes / 1_000_000).toLocaleString('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDateTime(iso: string): string {
  // moysklad format «24.06.2026 10:06» — date + time, NO comma between them.
  const d = new Date(iso);
  const date = d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  return `${date} ${time}`;
}

/** Unified row shape — server attachment or a staged (pre-save) local file. */
interface DisplayRow {
  key: string;
  filename: string;
  mime: string;
  sizeBytes: number;
  createdAt: string | null;
  uploaderName: string | null;
  isImage: boolean;
  /** Blob object-URL for STAGED images (no auth needed); null for saved files (use authedRaw). */
  previewUrl: string | null;
  staged: boolean;
}

/**
 * AttachmentsSection — moysklad «Файлы» tab parity.
 *
 * A sortable file table (Наименование · Размер, МБ · Дата добавления · Сотрудник) with a
 * «N-M из Total» pager and a «⊕ Файл» add button below it — the exact layout moysklad shows.
 * On a SAVED record (entityId) it lists/uploads/deletes via the generic /attachments API.
 * Before save (the `staged` controller) it works fully too — files are held locally and the
 * parent create-form POSTs them after the record exists. Filenames link to the binary endpoint
 * (PDFs/images inline, rest download); rows delete via a confirm dialog (instant un-stage when
 * staged); drag-drop onto the table also adds files. Shared by every entity's «Файлы» tab.
 */
export function AttachmentsSection({
  entity,
  entityId,
  hideTitle,
  staged,
}: AttachmentsSectionProps) {
  const qc = useQueryClient();
  const t = useTranslations('pages.attachments');
  const tCommon = useTranslations('common');
  const { user } = useAuth();
  const { runDestructive } = useDestructiveMutation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  // «Наименование» sort (moysklad ▲▼). null = default (createdAt desc from the BE / staged order).
  const [nameSort, setNameSort] = useState<'asc' | 'desc' | null>(null);
  const [page, setPage] = useState(0);
  // The file open in the preview lightbox (moysklad shows files in a modal, not a download).
  const [preview, setPreview] = useState<DisplayRow | null>(null);

  const queryKey = ['attachments', entity, entityId] as const;
  const { data, isLoading } = useQuery<{ items: Attachment[] }>({
    queryKey,
    enabled: !staged && !!entityId,
    queryFn: () =>
      api.get<{ items: Attachment[] }>(`/attachments?entity=${entity}&entityId=${entityId}`),
  });

  const uploadMut = useMutation({
    mutationFn: async (file: File) => {
      if (file.size > MAX_BYTES) {
        throw new Error(t('error_too_large', { size: (MAX_BYTES / 1_000_000).toFixed(0) }));
      }
      const dataBase64 = await readFileAsBase64(file);
      return api.post<Attachment>('/attachments', {
        entity,
        entityId,
        filename: file.name,
        mime: file.type || 'application/octet-stream',
        dataBase64,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
    onError: (e: Error) => setError(e.message),
  });

  const deleteMut = useApiMutation({
    mutationFn: (id: string) => api.delete<{ ok: true }>(`/attachments/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const triggerPicker = () => fileInputRef.current?.click();

  const addFiles = async (files: FileList | File[]) => {
    setError(null);
    const list = Array.from(files);
    if (staged) {
      const tooBig = list.find((f) => f.size > MAX_BYTES);
      if (tooBig) {
        setError(t('error_too_large', { size: (MAX_BYTES / 1_000_000).toFixed(0) }));
      }
      staged.onAdd(list.filter((f) => f.size <= MAX_BYTES));
    } else {
      for (const file of list) {
        try {
          await uploadMut.mutateAsync(file);
        } catch {
          // Error surfaced via onError; continue with next file.
        }
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handlePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    void addFiles(files);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) void addFiles(files);
  };

  // Unified rows from either the staged local list or the server query.
  const allRows: DisplayRow[] = useMemo(() => {
    if (staged) {
      // moysklad fills «Дата добавления» (when added) + «Сотрудник» (current user) immediately,
      // even before the file is uploaded on save.
      return staged.files.map((s) => {
        const mime = s.file.type || 'application/octet-stream';
        const isImage = mime.startsWith('image/');
        return {
          key: s.key,
          filename: s.file.name,
          mime,
          sizeBytes: s.file.size,
          createdAt: s.addedAt ?? null,
          uploaderName: user?.name ?? null,
          isImage,
          // blob object-URL for ANY staged file — thumbnail (images) + local download (the name).
          previewUrl: s.previewUrl ?? null,
          staged: true,
        };
      });
    }
    return (data?.items ?? []).map((a) => ({
      key: a.id,
      filename: a.filename,
      mime: a.mime,
      sizeBytes: a.sizeBytes,
      createdAt: a.createdAt,
      uploaderName: a.uploader?.name ?? null,
      isImage: a.mime.startsWith('image/'),
      previewUrl: null,
      staged: false,
    }));
  }, [staged, data, user]);

  const sorted = useMemo(() => {
    if (!nameSort) return allRows;
    const dir = nameSort === 'asc' ? 1 : -1;
    return [...allRows].sort((a, b) => dir * a.filename.localeCompare(b.filename, 'ru'));
  }, [allRows, nameSort]);

  const total = sorted.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visible = sorted.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  // moysklad shows «1-1 из 0» on the empty table (from/to default to 1).
  const from = total ? safePage * PAGE_SIZE + 1 : 1;
  const to = total ? safePage * PAGE_SIZE + visible.length : 1;

  const toggleNameSort = () =>
    setNameSort((s) => (s === 'asc' ? 'desc' : s === 'desc' ? null : 'asc'));
  // moysklad shows the ▲/▼ arrow ONLY on the actively-sorted column (nothing at rest).
  const sortArrow = nameSort === 'asc' ? '▲' : nameSort === 'desc' ? '▼' : '';

  const removeRow = (row: DisplayRow) => {
    if (row.staged) {
      staged?.onRemove(row.key);
      return;
    }
    runDestructive({
      title: tCommon('delete_confirm', { name: row.filename }),
      run: () => deleteMut.mutateAsync(row.key),
    });
  };

  // Native browser requests (<img>, download <a>, <iframe>) can't send the Bearer header — the
  // access token lives in memory. The /attachments/:id/raw guard accepts a ?access_token= query
  // fallback exactly for this; append the current token.
  const authedRaw = (id: string) =>
    `/api/v1/attachments/${id}/raw?access_token=${encodeURIComponent(getAccessToken() ?? '')}`;
  // Image src for a row: staged → its blob object-URL (no auth); saved → the authed raw URL.
  const imgSrc = (row: DisplayRow) => (row.staged ? row.previewUrl : authedRaw(row.key));

  const headCls =
    'h-9 px-3 text-left font-medium text-[var(--ms-text-link)] text-xs whitespace-nowrap';
  const pagerBtn =
    'flex h-6 w-6 items-center justify-center rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] text-[var(--ms-text-muted)] hover:bg-[var(--ms-bg-muted)] disabled:cursor-not-allowed disabled:opacity-40';

  const body = (
    <div>
      {error && (
        <div className="mb-2 text-[var(--ms-text-destructive)] text-sm" role="alert">
          {error}
        </div>
      )}

      {/* Drag-drop upload affordance (moysklad parity); the «+ Файл» button below is the
          keyboard-accessible upload path. */}
      <StickyHScroll
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`border-[var(--ms-border-strong)] border-y transition-colors ${
          isDragging
            ? 'bg-[var(--ms-bg-muted)] ring-2 ring-[var(--ms-border-focus)] ring-inset'
            : ''
        }`}
        data-test-id="attachment-table"
      >
        <table className="w-full text-sm">
          <thead>
            {/* moysklad: a thin BLUE rule under the (blue) column headers. */}
            <tr className="border-[var(--ms-text-brand)] border-b-2">
              <th className={headCls}>
                <button
                  type="button"
                  onClick={toggleNameSort}
                  className="inline-flex items-center gap-1 hover:underline"
                  data-test-id="attachment-sort-name"
                >
                  {t('col_name')}
                  {sortArrow && (
                    <span aria-hidden className="text-[10px] text-[var(--ms-text-muted)]">
                      {sortArrow}
                    </span>
                  )}
                </button>
              </th>
              <th className={`${headCls} w-28`}>{t('size_mb')}</th>
              <th className={`${headCls} w-44`}>{t('uploaded_at')}</th>
              <th className={`${headCls} w-44`}>{t('uploaded_by')}</th>
              <th className={`${headCls} w-10`} aria-label={tCommon('actions')} />
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr
                key={row.key}
                className="group border-[var(--ms-border-default)] border-b last:border-b-0"
                data-test-id={`attachment-${row.key}`}
              >
                <td className="px-3 py-1.5">
                  {/* moysklad: click the THUMBNAIL → visual preview; click the NAME → download. */}
                  <div className="inline-flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPreview(row)}
                      aria-label={row.filename}
                      className="shrink-0"
                      data-test-id={`attachment-open-${row.key}`}
                    >
                      {row.isImage && imgSrc(row) ? (
                        <img
                          src={imgSrc(row) ?? ''}
                          alt=""
                          className="h-6 w-6 rounded-sm object-cover"
                        />
                      ) : (
                        <span aria-hidden>{fileIcon(row.mime)}</span>
                      )}
                    </button>
                    {/* moysklad: clicking the NAME downloads — saved files from the raw endpoint,
                        staged (pre-save) files straight from the local blob object-URL. */}
                    <a
                      href={row.staged ? (row.previewUrl ?? '#') : authedRaw(row.key)}
                      download={row.filename}
                      className="text-[var(--ms-text-link)] underline-offset-2 hover:underline"
                      data-test-id={`attachment-name-${row.key}`}
                    >
                      {row.filename}
                    </a>
                  </div>
                </td>
                <td className="px-3 py-1.5 text-[var(--ms-text-muted)] tabular-nums">
                  {formatMb(row.sizeBytes)}
                </td>
                <td className="px-3 py-1.5 text-[var(--ms-text-muted)] tabular-nums">
                  {row.createdAt ? formatDateTime(row.createdAt) : '—'}
                </td>
                <td className="max-w-[200px] truncate px-3 py-1.5 text-[var(--ms-text-muted)]">
                  {row.uploaderName ?? '—'}
                </td>
                <td className="px-2 py-1.5 text-right">
                  <button
                    type="button"
                    onClick={() => removeRow(row)}
                    disabled={!row.staged && deleteMut.isPending}
                    aria-label={tCommon('delete')}
                    className="text-[var(--ms-text-muted)] opacity-0 transition-opacity hover:text-[var(--ms-text-destructive)] group-hover:opacity-100"
                    data-test-id={`attachment-delete-${row.key}`}
                  >
                    <Icons.delete className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </StickyHScroll>

      {/* «N-M из Total» pager (moysklad shows «1-1 из 0» even when empty). */}
      <div className="mt-1 flex items-center gap-2 text-[var(--ms-text-muted)] text-xs">
        <button
          type="button"
          className={pagerBtn}
          disabled={safePage <= 0}
          onClick={() => setPage(0)}
          aria-label="first"
        >
          «
        </button>
        <button
          type="button"
          className={pagerBtn}
          disabled={safePage <= 0}
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          aria-label="prev"
        >
          ‹
        </button>
        <span data-test-id="attachment-range">{t('range', { from, to, total })}</span>
        <button
          type="button"
          className={pagerBtn}
          disabled={safePage >= pageCount - 1}
          onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
          aria-label="next"
        >
          ›
        </button>
        <button
          type="button"
          className={pagerBtn}
          disabled={safePage >= pageCount - 1}
          onClick={() => setPage(pageCount - 1)}
          aria-label="last"
        >
          »
        </button>
      </div>

      <div className="mt-3">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={triggerPicker}
          loading={uploadMut.isPending}
          data-test-id="attachment-add"
        >
          <Icons.createCircle className="h-4 w-4 text-[var(--ms-text-link)]" />
          {t('add_file')}
        </Button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handlePicked}
        data-test-id="attachment-file-input"
      />

      {isLoading && (
        <div className="mt-2 text-[var(--ms-text-muted)] text-xs">{tCommon('loading')}</div>
      )}

      {/* moysklad file lightbox: click a row → preview the file in a modal (image / PDF inline),
          with a «Скачать» action — instead of forcing a download. */}
      {preview && (
        <Modal
          open
          onOpenChange={(o) => !o && setPreview(null)}
          title={preview.filename}
          widthClass="w-[820px]"
          testId="attachment-preview"
          footer={
            preview.staged ? (
              <span className="text-[var(--ms-text-muted)] text-xs">{t('preview_after_save')}</span>
            ) : (
              <a
                href={authedRaw(preview.key)}
                download={preview.filename}
                className="inline-flex h-[var(--ms-control-h)] items-center gap-2 rounded-[var(--ms-radius-default)] bg-[var(--ms-bg-brand)] px-4 text-sm text-white hover:opacity-90"
                data-test-id="attachment-download"
              >
                <Icons.download className="h-4 w-4" />
                {t('download')}
              </a>
            )
          }
        >
          <div className="flex max-h-[72vh] items-center justify-center overflow-auto bg-[var(--ms-bg-muted)] p-2">
            {preview.isImage && imgSrc(preview) ? (
              <img
                src={imgSrc(preview) ?? ''}
                alt={preview.filename}
                className="max-h-[68vh] max-w-full object-contain"
              />
            ) : preview.mime === 'application/pdf' && !preview.staged ? (
              <iframe
                src={authedRaw(preview.key)}
                title={preview.filename}
                className="h-[68vh] w-full border-0"
              />
            ) : (
              <div className="flex flex-col items-center gap-2 py-10 text-[var(--ms-text-muted)]">
                <span className="text-4xl" aria-hidden>
                  {fileIcon(preview.mime)}
                </span>
                <span className="text-sm">{t('preview_unavailable')}</span>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );

  if (hideTitle) return body;
  return <FormSection title={t('section_title')}>{body}</FormSection>;
}
