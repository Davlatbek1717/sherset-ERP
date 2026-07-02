'use client';

import type * as React from 'react';
import { Alert } from '../feedback/Alert.tsx';
import { Icons } from '../icons/action-icons.ts';
import { Container } from '../layout/Container.tsx';
import { PageHeader } from '../layout/PageHeader.tsx';
import { Breadcrumb, type BreadcrumbItem } from '../navigation/Breadcrumb.tsx';
import { Button } from '../primitives/Button.tsx';

export interface EditFormProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  breadcrumbs?: BreadcrumbItem[];
  onSubmit: (e: React.FormEvent) => void;
  onCancel?: () => void;
  cancelHref?: string;
  saving?: boolean;
  error?: Error | string | null;
  saveLabel?: string;
  cancelLabel?: string;
  /**
   * Title for the destructive error Alert. Locale-agnostic component, so the
   * caller passes a localized string (web app: {...useEditFormLabels()}). The
   * default is the Uzbek fallback — RU callers MUST pass errorTitle or the
   * banner leaks Uzbek «Xato» into the RU UI.
   */
  errorTitle?: string;
  children: React.ReactNode;
  testId?: string;
}

export function EditForm({
  title,
  subtitle,
  breadcrumbs,
  onSubmit,
  onCancel,
  cancelHref,
  saving,
  error,
  saveLabel = 'Saqlash',
  cancelLabel = 'Bekor qilish',
  errorTitle = 'Xato',
  children,
  testId,
}: EditFormProps) {
  const errMessage = error instanceof Error ? error.message : error || null;
  const SaveIcon = Icons.save;
  return (
    <Container size="md" className="py-4">
      <form onSubmit={onSubmit} className="space-y-4" data-test-id={testId ?? 'edit-form'}>
        <PageHeader
          title={title}
          subtitle={subtitle}
          breadcrumbs={breadcrumbs ? <Breadcrumb items={breadcrumbs} /> : undefined}
        />

        {errMessage && (
          <Alert tone="destructive" title={errorTitle}>
            {errMessage}
          </Alert>
        )}

        {children}

        <div className="flex items-center justify-end gap-2 pt-2">
          {(onCancel || cancelHref) &&
            (cancelHref ? (
              <a
                href={cancelHref}
                className="inline-flex items-center justify-center h-9 px-4 text-sm font-medium rounded-[var(--ms-radius-default)] bg-[var(--ms-bg-surface)] text-[var(--ms-text-primary)] border border-[var(--ms-border-strong)] hover:bg-[var(--ms-bg-hover)] transition-colors"
              >
                {cancelLabel}
              </a>
            ) : (
              <Button variant="secondary" type="button" onClick={onCancel}>
                {cancelLabel}
              </Button>
            ))}
          <Button type="submit" loading={saving} data-test-id="save-button">
            <SaveIcon className="w-4 h-4" />
            {saveLabel}
          </Button>
        </div>
      </form>
    </Container>
  );
}
