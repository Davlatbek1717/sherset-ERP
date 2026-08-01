'use client';

import type * as React from 'react';
import { cn } from '../lib/cn.ts';
import { DocumentHeader, type DocumentHeaderProps } from './DocumentHeader.tsx';
import { DocumentToolbar, type DocumentToolbarProps } from './DocumentToolbar.tsx';

/**
 * Outer shell for moysklad-parity document editors. Composes the
 * top toolbar (Сохранить / Закрыть / 4 dropdowns) + the document
 * header (number, date, status, checkboxes), then yields the
 * remaining vertical real-estate to the page through `children`.
 *
 * Pages compose like:
 *   <DocumentEditor
 *     {...toolbarProps}
 *     {...headerProps}
 *   >
 *     <DocumentMetaPanel>...fields...</DocumentMetaPanel>
 *     <PositionTable ... />
 *     <DocumentTotalsPanel ... />
 *     <DocumentTasksPanel ... />
 *     <DocumentFilesPanel ... />
 *   </DocumentEditor>
 *
 * Why a shell instead of free composition? Two invariants we want to
 * enforce across every document type:
 *   1. The toolbar is always at the top, header always immediately
 *      below it. Pages cannot accidentally reorder them or omit one.
 *   2. The error banner is rendered in a single, predictable spot
 *      (immediately under the header) so users know where to look
 *      when a save fails.
 */
export interface DocumentEditorProps
  extends Omit<DocumentToolbarProps, 'testId'>,
    Omit<DocumentHeaderProps, 'testId'> {
  /** Content slot — meta panel, position table, totals, tasks, files. */
  children: React.ReactNode;
  /** Optional notice rendered BETWEEN the toolbar and the header (moysklad's green-check
   *  info line, e.g. «Позиции документа содержат повторяющиеся товары»). Omit to hide. */
  noticeSlot?: React.ReactNode;
  /** Validation / save error — rendered inline above the content. */
  error?: string | null;
  /** Title for the error banner. Localize via the web app's
   *  useDocumentEditorLabels() hook — the default is the historical
   *  Uzbek-latin string kept for backwards compatibility. */
  errorTitle?: React.ReactNode;
  /** Label for the error banner's retry button (same localization note). */
  errorRetryLabel?: string;
  /** Optional retry handler for the error banner. */
  onErrorRetry?: () => void;
  /** Outer test id for E2E. */
  testId?: string;
  /** Outer wrapper className. */
  className?: string;
}

export function DocumentEditor({
  // Toolbar props
  onSave,
  saving,
  saveDisabled,
  saveLabel,
  onClose,
  closeLabel,
  modifyMenu,
  modifyLabel,
  createDocMenu,
  createDocLabel,
  hideCreateDoc,
  printMenu,
  printLabel,
  sendMenu,
  sendLabel,
  trailingSlot,
  rightSlot,
  // Header props
  documentTypeLabel,
  number,
  onNumberChange,
  numberPlaceholder,
  numberTooltip,
  date,
  onDateChange,
  status,
  statusOptions,
  onStatusChange,
  statusLabel,
  onConfigureStatuses,
  configureStatusesLabel,
  dateSeparatorLabel,
  openCalendarLabel,
  datePlaceholder,
  dateAriaLabel,
  timePlaceholder,
  timeAriaLabel,
  statusFallbackLabel,
  paymentLabel,
  paymentTone,
  requestPaymentLabel,
  onRequestPayment,
  applicable,
  onApplicableChange,
  applicableLabel,
  applicableHelp,
  applicableDisabled,
  reserve,
  onReserveChange,
  reserveLabel,
  reserveHelp,
  reserveDisabled,
  waiting,
  onWaitingChange,
  waitingLabel,
  waitingHelp,
  waitingDisabled,
  // Editor wrapper
  children,
  noticeSlot,
  error,

  testId,
  className,
}: DocumentEditorProps) {
  return (
    <div
      // moysklad parity (user 2026-06-20): the document form sits on a solid WHITE
      // background (the `--ms-bg-canvas` token was never defined → it fell through to
      // the grey app bg, giving the «grey behind a white card» look). moysklad's form
      // area is plain white with paddings + subtle structural lines.
      className={cn('flex min-h-full flex-col bg-[var(--ms-bg-surface)]', className)}
      data-test-id={testId ?? 'doc-editor'}
    >
      <DocumentToolbar
        onSave={onSave}
        saving={saving}
        saveDisabled={saveDisabled}
        saveLabel={saveLabel}
        onClose={onClose}
        closeLabel={closeLabel}
        modifyMenu={modifyMenu}
        modifyLabel={modifyLabel}
        createDocMenu={createDocMenu}
        createDocLabel={createDocLabel}
        hideCreateDoc={hideCreateDoc}
        printMenu={printMenu}
        printLabel={printLabel}
        sendMenu={sendMenu}
        sendLabel={sendLabel}
        trailingSlot={trailingSlot}
        rightSlot={rightSlot}
      />
      {noticeSlot}
      <DocumentHeader
        documentTypeLabel={documentTypeLabel}
        number={number}
        onNumberChange={onNumberChange}
        numberPlaceholder={numberPlaceholder}
        numberTooltip={numberTooltip}
        date={date}
        onDateChange={onDateChange}
        status={status}
        statusOptions={statusOptions}
        onStatusChange={onStatusChange}
        statusLabel={statusLabel}
        onConfigureStatuses={onConfigureStatuses}
        configureStatusesLabel={configureStatusesLabel}
        dateSeparatorLabel={dateSeparatorLabel}
        openCalendarLabel={openCalendarLabel}
        datePlaceholder={datePlaceholder}
        dateAriaLabel={dateAriaLabel}
        timePlaceholder={timePlaceholder}
        timeAriaLabel={timeAriaLabel}
        statusFallbackLabel={statusFallbackLabel}
        paymentLabel={paymentLabel}
        paymentTone={paymentTone}
        requestPaymentLabel={requestPaymentLabel}
        onRequestPayment={onRequestPayment}
        applicable={applicable}
        onApplicableChange={onApplicableChange}
        applicableLabel={applicableLabel}
        applicableHelp={applicableHelp}
        applicableDisabled={applicableDisabled}
        reserve={reserve}
        onReserveChange={onReserveChange}
        reserveLabel={reserveLabel}
        reserveHelp={reserveHelp}
        reserveDisabled={reserveDisabled}
        waiting={waiting}
        onWaitingChange={onWaitingChange}
        waitingLabel={waitingLabel}
        waitingHelp={waitingHelp}
        waitingDisabled={waitingDisabled}
      />
      {/* moysklad parity (owner 2026-07-11, grounded on his live screenshot):
          validation errors are a SMALL inline «✖ message» line under the toolbar
          — never the old full-width banner («katta banner» complaint). The
          field itself carries the thick red highlight (DocumentMetaField error
          prop); this line is the compact global echo moysklad shows under
          «Сохранить». errorTitle/onErrorRetry are intentionally ignored. */}
      {error && (
        <div
          className="flex items-center gap-1.5 px-4 pt-2 font-medium text-[13px] text-[var(--ms-text-destructive)]"
          data-test-id="doc-editor-error"
        >
          <span
            aria-hidden
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--ms-text-destructive)] font-bold text-[10px] text-white leading-none"
          >
            ✕
          </span>
          {error}
        </div>
      )}
      <div className="flex-1 px-4 py-3">{children}</div>
    </div>
  );
}
