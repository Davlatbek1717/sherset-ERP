'use client';

/**
 * MK20 / 4M TZ §8.1/6 — IZOH SHABLONLARI SOZLAMASI.
 *
 * Menejer o'z matnlarini shu yerda yozadi. Uch tur: rad etish · tuzatma ·
 * ogohlantirish.
 *
 * 🔴 EKRAN SHARTNOMASI: shablon o'chirilmaydi, **arxivlanadi**. Jurnaldagi
 * eski izohlarga bu hech qanday ta'sir qilmaydi — u yerda matnning NUSXASI
 * turadi (BE `comment-templates.ts`). Ekran shuni ochiq aytadi, aks holda
 * menejer «arxivlasam eski qarorlar buziladimi?» deb qo'rqib turardi.
 *
 * Boshlang'ich shablonlar SEED QILINMAYDI: tayyor matn jurnalga jimgina
 * ko'chib, hech kim yozmagan gap rasmiy izohga aylanardi.
 */

import {
  type CommentTemplate,
  type CommentTemplateInput,
  type CommentTemplateKind,
  commentTemplateApi,
} from '@/lib/comment-template-api';
import { Badge, Button, Checkbox, Input, NativeSelect, Skeleton, Textarea } from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';

const KINDS: CommentTemplateKind[] = ['rejection', 'correction', 'warning'];

interface DraftState extends CommentTemplateInput {
  id: string | null;
}

function emptyDraft(locale: string): DraftState {
  return { id: null, kind: 'rejection', locale, title: '', body: '', sortOrder: 0 };
}

export function CommentTemplateSettings() {
  const t = useTranslations('pages.commentTemplates');
  const locale = useLocale();
  const qc = useQueryClient();

  const [showArchived, setShowArchived] = useState(false);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['comment-templates', showArchived],
    queryFn: () => commentTemplateApi.list({ includeArchived: showArchived }),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['comment-templates'] });
    // Tanlagich ham yangilanadi: yangi shablon darhol taklifda ko'rinsin.
    void qc.invalidateQueries({ queryKey: ['comment-template-suggest'] });
  };

  const onError = (e: unknown) => setError(e instanceof Error ? e.message : String(e));

  const save = useMutation({
    mutationFn: (d: DraftState) => {
      const payload: CommentTemplateInput = {
        kind: d.kind,
        locale: d.locale,
        title: d.title.trim(),
        body: d.body.trim(),
        sortOrder: d.sortOrder ?? 0,
      };
      return d.id ? commentTemplateApi.update(d.id, payload) : commentTemplateApi.create(payload);
    },
    onSuccess: () => {
      setDraft(null);
      setError(null);
      invalidate();
    },
    onError,
  });

  const archive = useMutation({
    mutationFn: (id: string) => commentTemplateApi.archive(id),
    onSuccess: invalidate,
    onError,
  });

  const restore = useMutation({
    mutationFn: (id: string) => commentTemplateApi.restore(id),
    onSuccess: invalidate,
    onError,
  });

  const templates: CommentTemplate[] = data?.templates ?? [];

  return (
    <div data-test-id="comment-template-settings">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-semibold text-[var(--ms-text-primary)] text-lg">{t('title')}</h1>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-[var(--ms-text-primary)] text-sm">
            <Checkbox
              checked={showArchived}
              onCheckedChange={(next) => setShowArchived(next === true)}
              data-test-id="comment-template-show-archived"
            />
            {t('show_archived')}
          </label>
          <Button
            size="sm"
            onClick={() => setDraft(emptyDraft(locale))}
            data-test-id="comment-template-add"
          >
            {t('add')}
          </Button>
        </div>
      </div>

      <p className="mb-3 text-[var(--ms-text-muted)] text-xs">{t('hint')}</p>

      {error && (
        <p className="mb-3 text-red-600 text-xs" data-test-id="comment-template-error">
          {error}
        </p>
      )}

      {draft && (
        <div
          className="mb-4 flex flex-col gap-2 rounded border border-[var(--ms-border)] p-3"
          data-test-id="comment-template-form"
        >
          <div className="flex flex-wrap gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[var(--ms-text-muted)] text-xs">{t('field_kind')}</span>
              <NativeSelect
                value={draft.kind}
                aria-label={t('field_kind')}
                className="w-44"
                data-test-id="comment-template-kind"
                onChange={(e) =>
                  setDraft({ ...draft, kind: e.target.value as CommentTemplateKind })
                }
              >
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {t(`kind_${k}`)}
                  </option>
                ))}
              </NativeSelect>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[var(--ms-text-muted)] text-xs">{t('field_locale')}</span>
              <NativeSelect
                value={draft.locale}
                aria-label={t('field_locale')}
                className="w-28"
                data-test-id="comment-template-locale"
                onChange={(e) => setDraft({ ...draft, locale: e.target.value })}
              >
                <option value="uz">uz</option>
                <option value="ru">ru</option>
              </NativeSelect>
            </label>

            <label className="flex min-w-[220px] flex-1 flex-col gap-1">
              <span className="text-[var(--ms-text-muted)] text-xs">{t('field_title')}</span>
              <Input
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                data-test-id="comment-template-title"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-[var(--ms-text-muted)] text-xs">{t('field_body')}</span>
            <Textarea
              value={draft.body}
              rows={4}
              /* BE `MAX_COMMENT_LENGTH` bilan bir xil — uzunroq matn jurnalga
                 kesilib tushardi. */
              maxLength={2000}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              data-test-id="comment-template-body"
            />
          </label>

          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={save.isPending || !draft.title.trim() || !draft.body.trim()}
              onClick={() => save.mutate(draft)}
              data-test-id="comment-template-save"
            >
              {t('save')}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setDraft(null)}>
              {t('cancel')}
            </Button>
          </div>
        </div>
      )}

      {isLoading && <Skeleton className="h-24 w-full" />}

      {!isLoading && templates.length === 0 && (
        <div className="rounded border border-[var(--ms-border)] p-6 text-center">
          <p className="font-medium text-[var(--ms-text-primary)] text-sm">{t('empty_title')}</p>
          <p className="mt-1 text-[var(--ms-text-muted)] text-xs">{t('empty_hint')}</p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {templates.map((x) => (
          <div
            key={x.id}
            className="rounded border border-[var(--ms-border)] p-3"
            data-test-id={`comment-template-row-${x.id}`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{t(`kind_${x.kind}`)}</Badge>
              <span className="font-medium text-[var(--ms-text-primary)] text-sm">{x.title}</span>
              <span className="text-[var(--ms-text-muted)] text-xs">{x.locale}</span>
              {x.archivedAt && (
                <Badge tone="neutral" data-test-id={`comment-template-archived-${x.id}`}>
                  {t('archived_badge')}
                </Badge>
              )}
              <span className="ml-auto text-[var(--ms-text-muted)] text-xs">
                {t('usage', { count: x.usageCount })}
              </span>
            </div>

            <p className="mt-2 whitespace-pre-wrap text-[var(--ms-text-primary)] text-sm">
              {x.body}
            </p>

            <div className="mt-2 flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  setDraft({
                    id: x.id,
                    kind: x.kind,
                    locale: x.locale,
                    title: x.title,
                    body: x.body,
                    sortOrder: x.sortOrder,
                  })
                }
                data-test-id={`comment-template-edit-${x.id}`}
              >
                {t('edit')}
              </Button>
              {x.archivedAt ? (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={restore.isPending}
                  onClick={() => restore.mutate(x.id)}
                  data-test-id={`comment-template-restore-${x.id}`}
                >
                  {t('restore')}
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={archive.isPending}
                  onClick={() => archive.mutate(x.id)}
                  data-test-id={`comment-template-archive-${x.id}`}
                >
                  {t('archive')}
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
