'use client';

import { api } from '@/lib/api-client';
import { Button, Input, Modal, Textarea } from '@moysklad/ui';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export type SendEmailEntity =
  | 'Counterparty'
  | 'CustomerOrder'
  | 'Demand'
  | 'InvoiceOut'
  | 'Supply'
  | 'PurchaseOrder'
  | 'InvoiceIn'
  | 'PaymentIn'
  | 'PaymentOut'
  | 'SalesReturn'
  | 'PurchaseReturn'
  | 'CashIn'
  | 'CashOut'
  | 'Opportunity';

export interface SendEmailDialogProps {
  open: boolean;
  onClose: () => void;
  entity: SendEmailEntity;
  entityId: string;
  /** Pre-fills the To field, e.g. counterparty.email. */
  defaultTo?: string;
  defaultSubject: string;
  /** HTML body — usually rendered server-side from a print template snippet. */
  defaultBodyHtml: string;
  /**
   * Pre-attached files (already persisted via /attachments or a server-render
   * step). moysklad's «Отправить ▸ <форма>» renders the document through a print
   * form, stores it as an attachment and opens this composer with the PDF
   * attached — these are passed here and their ids ride along in `attachmentIds`.
   */
  initialAttachments?: { id: string; filename: string }[];
}

const TEXTAREA_CLASS =
  'w-full min-h-[160px] px-3 py-2 text-sm bg-[var(--ms-bg-surface)] border border-[var(--ms-border-default)] rounded-[var(--ms-radius-default)] hover:border-[var(--ms-border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ms-border-focus)] focus-visible:ring-offset-1 placeholder:text-[var(--ms-text-placeholder)] font-mono text-xs';

function parseEmails(s: string): string[] {
  return s
    .split(/[,\s;]+/)
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
}

export function SendEmailDialog({
  open,
  onClose,
  entity,
  entityId,
  defaultTo = '',
  defaultSubject,
  defaultBodyHtml,
  initialAttachments = [],
}: SendEmailDialogProps) {
  const t = useTranslations('pages.send_email');
  const tCommon = useTranslations('common');

  const [to, setTo] = useState(defaultTo);
  const [cc, setCc] = useState('');
  const [subject, setSubject] = useState(defaultSubject);
  const [bodyHtml, setBodyHtml] = useState(defaultBodyHtml);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Reset form when dialog opens with new entity
  const reset = () => {
    setTo(defaultTo);
    setCc('');
    setSubject(defaultSubject);
    setBodyHtml(defaultBodyHtml);
    setError(null);
    setSuccess(false);
  };

  const sendMut = useMutation({
    mutationFn: () => {
      const toList = parseEmails(to);
      if (toList.length === 0) throw new Error(t('field_required', { field: t('to') }));
      if (!subject.trim()) throw new Error(t('field_required', { field: t('subject') }));
      if (!bodyHtml.trim()) throw new Error(t('field_required', { field: t('body') }));
      return api.post<{ id: string; status: string }>('/email/send', {
        entity,
        entityId,
        to: toList,
        cc: parseEmails(cc),
        subject,
        bodyHtml,
        attachmentIds: initialAttachments.map((a) => a.id),
      });
    },
    onSuccess: () => {
      setSuccess(true);
      setError(null);
      // Auto-close after a brief success flash
      setTimeout(() => {
        onClose();
        reset();
      }, 1200);
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <Modal
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          onClose();
          reset();
        }
      }}
      title={t('title')}
      widthClass="w-[720px]"
      testId="send-email-dialog"
      footer={
        <>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              onClose();
              reset();
            }}
          >
            {tCommon('cancel')}
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={() => sendMut.mutate()}
            loading={sendMut.isPending}
            data-test-id="send-button"
          >
            {t('send_button')}
          </Button>
        </>
      }
    >
      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
        {error && (
          <div className="rounded border border-[var(--ms-border-destructive,#fecaca)] bg-[var(--ms-bg-destructive-soft,#fef2f2)] px-3 py-2 text-[var(--ms-text-destructive)] text-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded border border-[var(--ms-border-success,#bbf7d0)] bg-[var(--ms-bg-success-soft,#f0fdf4)] px-3 py-2 text-[var(--ms-text-success,#15803d)] text-sm">
            {t('sent_success')}
          </div>
        )}

        <div>
          <label
            htmlFor="send-email-to"
            className="mb-1 block font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide"
          >
            {t('to')}
          </label>
          <Input
            id="send-email-to"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder={t('to_placeholder')}
            data-test-id="email-to"
          />
        </div>

        <div>
          <label
            htmlFor="send-email-cc"
            className="mb-1 block font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide"
          >
            {t('cc')}
          </label>
          <Input
            id="send-email-cc"
            value={cc}
            onChange={(e) => setCc(e.target.value)}
            placeholder="cc@example.com, manager@example.com"
            data-test-id="email-cc"
          />
        </div>

        <div>
          <label
            htmlFor="send-email-subject"
            className="mb-1 block font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide"
          >
            {t('subject')}
          </label>
          <Input
            id="send-email-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            data-test-id="email-subject"
          />
        </div>

        <div>
          <label
            htmlFor="send-email-body"
            className="mb-1 block font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide"
          >
            {t('body')} (HTML)
          </label>
          <Textarea
            id="send-email-body"
            value={bodyHtml}
            onChange={(e) => setBodyHtml(e.target.value)}
            className={TEXTAREA_CLASS}
            data-test-id="email-body"
          />
        </div>

        {initialAttachments.length > 0 && (
          <div data-test-id="email-attachments">
            <span className="mb-1 block font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
              {t('attachments')}
            </span>
            <div className="flex flex-wrap gap-2">
              {initialAttachments.map((a) => (
                <span
                  key={a.id}
                  className="inline-flex items-center gap-1.5 rounded border border-[var(--ms-border-default)] bg-[var(--ms-bg-muted)] px-2 py-1 text-[var(--ms-text-primary)] text-xs"
                >
                  <svg
                    className="h-3.5 w-3.5 text-[var(--ms-text-muted)]"
                    viewBox="0 0 16 16"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M4 2h5l3 3v9H4V2z"
                      stroke="currentColor"
                      strokeWidth="1.2"
                      strokeLinejoin="round"
                    />
                    <path d="M9 2v3h3" stroke="currentColor" strokeWidth="1.2" />
                  </svg>
                  {a.filename}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
