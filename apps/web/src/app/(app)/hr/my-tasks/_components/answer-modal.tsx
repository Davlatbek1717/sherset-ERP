'use client';

/**
 * AnswerModal — xodim vazifaga javob beradi. responseType bo'yicha:
 *   • 'text'        → matn maydoni (bo'sh bo'lmasligi shart)
 *   • 'yes_no'/etc. → Ha / Yo'q tugmalari
 * Self-contained: javob mutatsiyasi + ['hr-my-tasks'] invalidatsiya shu yerda.
 * `log === null` ⇒ hech narsa render qilinmaydi.
 */

import { type HrTaskLogRow, hrTaskSendApi } from '@/lib/hr-api';
import { Button, Textarea } from '@moysklad/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

export interface AnswerModalProps {
  /** Log being answered, or null to render nothing. */
  log: HrTaskLogRow | null;
  onClose: () => void;
}

export function AnswerModal({ log, onClose }: AnswerModalProps) {
  const t = useTranslations('pages.hrMyTasks');
  const qc = useQueryClient();

  const [answerText, setAnswerText] = useState('');
  const [answerError, setAnswerError] = useState<string | null>(null);

  // Reset the form whenever a different task's modal is opened.
  useEffect(() => {
    setAnswerText('');
    setAnswerError(null);
  }, [log?.id]);

  const answerMut = useMutation({
    mutationFn: (v: { id: string; type: 'yes' | 'no' | 'text'; text?: string }) =>
      hrTaskSendApi.answer(v.id, { type: v.type, text: v.text ?? null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr-my-tasks'] });
      onClose();
    },
    onError: (e) => setAnswerError((e as Error).message),
  });

  if (!log) return null;

  const submitText = () => {
    const text = answerText.trim();
    if (!text) {
      setAnswerError(t('answer_text_required'));
      return;
    }
    answerMut.mutate({ id: log.id, type: 'text', text });
  };

  const submitYesNo = (type: 'yes' | 'no') => answerMut.mutate({ id: log.id, type });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      // Tasodifiy yopilish yo'q: fonga bosish ham, Esc ham oynani yopmaydi —
      // faqat oynaning o'z tugmalari (@moysklad/ui `noAccidentalClose` bilan
      // bir xil shartnoma; egasining jonli sinovi, 2026-08-12).
      // biome-ignore lint/a11y/useSemanticElements: native <dialog> needs imperative .showModal() which breaks tanstack-query mutation flow; role=dialog; oyna faqat o‘z tugmalari bilan yopiladi (Esc/fon YO‘Q)
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
      data-test-id="hr-my-tasks-answer-modal"
    >
      <div className="w-full max-w-md rounded-[var(--ms-radius-lg)] bg-[var(--ms-bg-surface)] p-6 shadow-xl">
        <h2 className="font-semibold text-[var(--ms-text-strong)] text-lg">
          {log.template?.title}
        </h2>

        {log.template?.responseType === 'text' ? (
          <div className="mt-4 space-y-1">
            <Textarea
              value={answerText}
              onChange={(e) => {
                setAnswerText(e.target.value);
                setAnswerError(null);
              }}
              placeholder={t('answer_text_placeholder')}
              rows={5}
              data-test-id="hr-my-tasks-answer-text-input"
            />
            {answerError && <div className="text-red-500 text-xs">{answerError}</div>}
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={onClose}>
                {t('cancel')}
              </Button>
              <Button
                onClick={submitText}
                disabled={answerMut.isPending}
                data-test-id="hr-my-tasks-answer-text-submit"
              >
                {t('submit')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {answerError && <div className="text-red-500 text-sm">{answerError}</div>}
            <div className="flex flex-col gap-2">
              <Button
                onClick={() => submitYesNo('yes')}
                disabled={answerMut.isPending}
                data-test-id="hr-my-tasks-answer-yes"
              >
                {t('answer_yes')}
              </Button>
              <Button
                variant="secondary"
                onClick={() => submitYesNo('no')}
                disabled={answerMut.isPending}
                data-test-id="hr-my-tasks-answer-no"
              >
                {t('answer_no')}
              </Button>
            </div>
            <div className="flex justify-end">
              <Button variant="secondary" onClick={onClose}>
                {t('cancel')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
