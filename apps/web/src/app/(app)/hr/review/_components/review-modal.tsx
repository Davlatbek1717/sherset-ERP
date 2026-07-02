'use client';

/**
 * ReviewModal — tekshiruvchi qarori (decision + comment), moysklad parity.
 *   • approve → izoh IXTIYORIY
 *   • reject  → izoh MAJBURIY (server ham talab qiladi)
 * window.confirm o'rniga (CLAUDE.md qoidasi). Self-contained: approve/reject
 * mutatsiyalari + ['hr-review-pending'] / ['hr-task-logs'] invalidatsiya shu
 * yerda. `review === null` ⇒ hech narsa render qilinmaydi.
 */

import { type HrTaskLogRow, hrTaskReviewApi } from '@/lib/hr-api';
import { Button, Textarea } from '@moysklad/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

export interface ReviewDecision {
  log: HrTaskLogRow;
  decision: 'approve' | 'reject';
}

export interface ReviewModalProps {
  review: ReviewDecision | null;
  onClose: () => void;
}

export function ReviewModal({ review, onClose }: ReviewModalProps) {
  const t = useTranslations('pages.hrReview');
  const qc = useQueryClient();

  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Reset the form whenever a different decision/task modal is opened.
  useEffect(() => {
    setComment('');
    setError(null);
  }, [review?.log.id, review?.decision]);

  const onDone = () => {
    qc.invalidateQueries({ queryKey: ['hr-review-pending'] });
    qc.invalidateQueries({ queryKey: ['hr-task-logs'] });
    onClose();
  };

  const approveMut = useMutation({
    mutationFn: (v: { id: string; comment: string | null }) =>
      hrTaskReviewApi.approve(v.id, v.comment),
    onSuccess: onDone,
    onError: (e) => setError((e as Error).message),
  });
  const rejectMut = useMutation({
    mutationFn: (v: { id: string; comment: string }) => hrTaskReviewApi.reject(v.id, v.comment),
    onSuccess: onDone,
    onError: (e) => setError((e as Error).message),
  });

  if (!review) return null;

  const isReject = review.decision === 'reject';
  const pending = approveMut.isPending || rejectMut.isPending;

  const submit = () => {
    const c = comment.trim();
    if (isReject) {
      if (!c) {
        setError(t('reject_reason_required'));
        return;
      }
      rejectMut.mutate({ id: review.log.id, comment: c });
    } else {
      approveMut.mutate({ id: review.log.id, comment: c || null });
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
      // biome-ignore lint/a11y/useSemanticElements: native <dialog> needs imperative .showModal() which breaks tanstack-query mutation flow; role=dialog + Escape handler matches existing modal pattern in this codebase
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
      data-test-id="hr-review-modal"
    >
      <div className="w-full max-w-md rounded-[var(--ms-radius-lg)] bg-[var(--ms-bg-surface)] p-6 shadow-xl">
        <h2 className="font-semibold text-[var(--ms-text-strong)] text-lg">
          {isReject ? t('reject') : t('approve')}: {review.log.template?.title}
        </h2>
        <p className="mt-1 text-[var(--ms-text-muted)] text-sm">{review.log.employee?.name}</p>
        <div className="mt-4 space-y-1">
          <label htmlFor="hr-review-comment" className="text-[var(--ms-text-muted)] text-xs">
            {isReject ? t('reject_reason_label') : t('comment_optional')}
            {isReject && <span className="text-red-500"> *</span>}
          </label>
          <Textarea
            id="hr-review-comment"
            value={comment}
            onChange={(e) => {
              setComment(e.target.value);
              setError(null);
            }}
            placeholder={
              isReject ? t('reject_reason_placeholder') : t('approve_comment_placeholder')
            }
            rows={4}
            data-test-id="hr-review-comment"
          />
          {error && <div className="text-red-500 text-xs">{error}</div>}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button onClick={submit} disabled={pending} data-test-id="hr-review-submit">
            {isReject ? t('reject') : t('approve')}
          </Button>
        </div>
      </div>
    </div>
  );
}
