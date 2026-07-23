'use client';

import { createContext, useContext } from 'react';
import type * as React from 'react';
import { cn } from '../lib/cn.ts';

/**
 * Compact-layout signal for a meta panel. When a {@link DocumentMetaPanel} is
 * rendered `compact`, it publishes `true` here so every nested
 * {@link DocumentMetaRow} defaults to the fixed-width (left-grouped ~15rem)
 * field layout — without each page having to tag every row `fixedWidth`.
 */
const MetaCompactContext = createContext(false);

/**
 * Meta-data panel — 2-column field grid that sits between the document
 * header and the position table on every moysklad editor.
 *
 * Mirrors moysklad's `<table class="b-operation-form-top">` layout 1:1:
 *
 *   ┌──────────────┬─────────────┬──────────┬─────────────┐
 *   │ * Организация│ [Org ▾]     │   Склад  │ [Store ▾]   │
 *   │              │ [Currency▾] │          │             │
 *   ├──────────────┼─────────────┼──────────┼─────────────┤
 *   │ * Контрагент │ [Agent ▾]+  │  Договор │ [grayed]    │
 *   ├──────────────┼─────────────┼──────────┼─────────────┤
 *   │ Дата приёмки │ [📅]        │   Проект │ [Project ▾]+│
 *   └──────────────┴─────────────┴──────────┴─────────────┘
 *
 * 4-column CSS grid: `auto 1fr auto 1fr` — labels claim only the width
 * they need, fields share the remaining space 50/50. A required field
 * is marked with a red asterisk to the left of the label (moysklad parity).
 *
 * Pages compose like:
 *
 *   <DocumentMetaPanel>
 *     <DocumentMetaRow>
 *       <DocumentMetaField label="Организация" required>{orgPicker}</DocumentMetaField>
 *       <DocumentMetaField label="Склад">{storePicker}</DocumentMetaField>
 *     </DocumentMetaRow>
 *     <DocumentMetaRow>
 *       <DocumentMetaField label="Контрагент" required>{agentPicker}</DocumentMetaField>
 *       <DocumentMetaField label="Договор">{contractPicker}</DocumentMetaField>
 *     </DocumentMetaRow>
 *     <DocumentMetaRow>
 *       <DocumentMetaField label="Валюта документа" required fullWidth>{currencyPicker}</DocumentMetaField>
 *     </DocumentMetaRow>
 *   </DocumentMetaPanel>
 *
 * For rows that hold a single full-width field, set `fullWidth` — the
 * widget cell spans the remaining 3 grid columns so the field stretches
 * across the panel (mirrors moysklad's `b-operation-form-currency` row).
 */
export function DocumentMetaPanel({
  children,
  className,
  testId,
  compact,
}: {
  children: React.ReactNode;
  className?: string;
  testId?: string;
  /**
   * moysklad-parity compact layout (user 2026-07-08 — «inputlar tartibsiz»): cap
   * the panel at ~860px and drop the card border so the meta reads as one
   * continuous white area, while left-grouping each row's field widgets at a
   * fixed ~15rem width (published via {@link MetaCompactContext} → every nested
   * {@link DocumentMetaRow}) instead of stretching them across the viewport.
   * Opt-in so the existing wide `1fr` callers (detail pages) are unchanged.
   */
  compact?: boolean;
}) {
  return (
    <MetaCompactContext.Provider value={!!compact}>
      <div
        className={cn(
          'bg-[var(--ms-bg-surface)] px-4 py-3',
          compact
            ? 'max-w-[860px]'
            : 'rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)]',
          className,
        )}
        data-test-id={testId ?? 'doc-meta-panel'}
      >
        <div className="space-y-2.5">{children}</div>
      </div>
    </MetaCompactContext.Provider>
  );
}

/**
 * One row of meta fields. Renders as a 4-column CSS grid so the
 * children — typically 1 or 2 DocumentMetaFields — fill the row in
 * `[label] [widget] [label] [widget]` order. A single full-width field
 * spans 3 of the 4 columns; the row degenerates gracefully on narrow
 * viewports by stacking via `lg:` breakpoint.
 */
export function DocumentMetaRow({
  children,
  fixedWidth,
}: {
  children: React.ReactNode;
  /**
   * moysklad parity: when set, the field widgets are FIXED-WIDTH (~240px) grouped
   * from the LEFT with trailing whitespace — NOT stretched to fill the viewport.
   * Opt-in so the 48 existing `1fr` callers are unchanged. A trailing `1fr` spacer
   * column soaks up the leftover width on the right.
   */
  fixedWidth?: boolean;
}) {
  // A `compact` DocumentMetaPanel ancestor makes fixed-width the DEFAULT (so the
  // page doesn't tag every row); an explicit `fixedWidth` prop still wins.
  const compact = useContext(MetaCompactContext);
  const isFixed = fixedWidth ?? compact;
  // 4-col on md+ — moysklad's b-operation-form-top uses a fixed-width
  // `<table>` regardless of viewport (it's a desktop-first ERP, no
  // mobile breakpoint), so desktop keeps the exact parity layout.
  // Phones (≤767px, owner mobile-TZ 2026-07-18) drop to a 2-col
  // `[label][field]` grid — the 4-col squeeze left each control ~90px
  // («inputs floating mid-screen»); fields now take the full row width.
  return (
    <div
      className={cn(
        // moysklad b-operation-form-top is split into TWO equal horizontal halves —
        // the left field-column and the right field-column. `fixedWidth` keeps that
        // 50/50 split but CAPS each field widget at ~15rem (left-aligned in its half)
        // so the inputs don't stretch to fill the viewport — `[&>div]` targets the
        // DocumentMetaField content cells (the labels are <label>, untouched).
        'grid grid-cols-[auto_1fr] md:grid-cols-[auto_1fr_auto_1fr] items-baseline gap-x-3 gap-y-2',
        isFixed && 'md:[&>div]:max-w-[15rem]',
      )}
    >
      {children}
    </div>
  );
}

export interface DocumentMetaFieldProps {
  label: React.ReactNode;
  required?: boolean;
  /** Right-aligned helper text under the field — used for the
   *  counterparty balance display, MXIK validity hint, etc. */
  helper?: React.ReactNode;
  /** Optional sub-row rendered immediately under the main field
   *  (mirrors moysklad's currency hint under the Организация field). */
  subRow?: React.ReactNode;
  /** Span the remaining 3 grid columns instead of just 1, so a single
   *  field stretches across the panel (e.g. Валюта документа row). */
  fullWidth?: boolean;
  /**
   * Force this field's label into grid column 1, starting a NEW row. Used by the
   * row-aligned meta layout (moysklad b-operation-form-top parity): the LEFT
   * field of every row is marked `startRow` so its sub-row (account / Баланс)
   * extends DOWN within the row instead of pulling the next field up beside it —
   * which is what made «Договор» creep up across from «Организация». No-op
   * outside a multi-column grid. */
  startRow?: boolean;
  /**
   * Field-level validation error (moysklad parity, owner 2026-07-11): the
   * control gets a THICK red outline and this short message renders in red
   * right under it («Поле должно быть заполнено»). Pages set it on a failed
   * save attempt instead of raising a page-wide banner.
   */
  error?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  testId?: string;
}

/**
 * Three INDEPENDENT vertical columns — the true moysklad
 * `b-operation-form-top` layout. Where {@link DocumentMetaRow} pairs
 * fields horizontally (so rows align left↔right), moysklad actually
 * stacks each field group in its own column that flows independently:
 *
 *   ┌── col 1 ───────┬── col 2 ──────┬── col 3 ──────────┐
 *   │ Организация    │ Склад         │ Адрес доставки    │
 *   │   [account]    │ Договор       │ Комментарий       │
 *   │ Контрагент     │ Проект        │                   │
 *   │ План. дата     │               │                   │
 *   │ Валюта         │               │                   │
 *   └────────────────┴───────────────┴───────────────────┘
 *
 * Each column is its own `[label] [control]` grid, so a column with
 * five fields and a column with two fields don't force blank cells on
 * each other (the bug the 4-col DocumentMetaRow had). Stacks to one
 * column under the `lg` breakpoint. Pass {@link DocumentMetaColumn}
 * children, each holding {@link DocumentMetaField}s.
 *
 * Captured pixel-truth (customerorder/edit?new): left/middle control
 * ~200px, right ~280px, label sits to the left, 12px Arial.
 */
export function DocumentMetaColumns({
  children,
  className,
  testId,
}: {
  children: React.ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <div
      className={cn(
        // moysklad parity (user 2026-06-20): the meta is ONE continuous form, NOT
        // bordered cards. Dropped the card outline (rounded + border) so the
        // main-meta block and the custom-fields block read as a single white area
        // like moysklad — the user flagged the «3 bo'lim» (3 boxes) split.
        'bg-[var(--ms-bg-surface)] px-4 py-3',
        className,
      )}
      data-test-id={testId ?? 'doc-meta-panel'}
    >
      {/* Fixed ~320px columns grouped from the LEFT (not stretched to fill) —
          moysklad's columns sit at x≈161/517/927 with trailing space on the
          right, NOT spread evenly across the viewport. */}
      <div className="grid grid-cols-1 gap-x-8 gap-y-2 lg:grid-cols-[repeat(3,minmax(0,320px))]">
        {children}
      </div>
    </div>
  );
}

/**
 * One column inside {@link DocumentMetaColumns}: a `[label] [control]`
 * 2-col grid that stacks its DocumentMetaFields vertically and aligns
 * to the top (`content-start`) so short columns don't stretch.
 */
export function DocumentMetaColumn({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        // moysklad meta is tight: label sits ~1px from its control, rows ~32px.
        // (live customerorder/edit?new: label-right≈161, control-x≈162.)
        'grid grid-cols-[minmax(72px,auto)_1fr] content-start items-baseline gap-x-1 gap-y-1.5',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function DocumentMetaField({
  label,
  required,
  helper,
  subRow,
  fullWidth,
  startRow,
  error,
  children,
  className,
  testId,
}: DocumentMetaFieldProps) {
  return (
    <>
      {/* moysklad marks required fields with a red asterisk BEFORE the label
          (live-confirmed: `.gwt-Label::before` content "*", colour rgb(255,0,0)
          on customerorder/edit?new — Организация / Контрагент / Валюта). */}
      {/* biome-ignore lint/a11y/noLabelWithoutControl: composite ERP field —
          the label sits in its own grid cell beside a custom picker/widget
          (CatalogPickerField, NativeSelect, …), not wrapping a native input;
          htmlFor can't target a composite control. Visual label by design. */}
      <label
        data-required={required ? '' : undefined}
        className={cn(
          // moysklad parity (measured 2026-06-20): field labels are #222 (text-primary),
          // weight 400 — black + thin, NOT the light grey muted we had. The user flagged
          // «barcha yozuvlar kulrang»; labels must read sharp/dark like moysklad.
          'whitespace-nowrap pt-1 text-right text-[12px] text-[var(--ms-text-primary)] leading-tight',
          (fullWidth || startRow) && 'col-start-1',
          className,
        )}
        data-test-id={testId ? `${testId}-label` : undefined}
      >
        {required && <span className="mr-0.5 text-[var(--ms-text-destructive)]">*</span>}
        {label}
      </label>
      <div className={cn('min-w-0', fullWidth && 'col-span-1 md:col-span-3')} data-test-id={testId}>
        {/* Thick, unmistakable red outline on the control when invalid — the
            owner explicitly rejected a thin border («shunchaki ingichka
            chegara emas»). ring-2 + ring-offset keeps the control's own
            border/radius intact underneath. */}
        <div
          className={cn(
            error && 'rounded-[var(--ms-radius-default)] ring-2 ring-[var(--ms-text-destructive)]',
          )}
        >
          {children}
        </div>
        {error && (
          <div
            className="mt-1 font-medium text-[12px] text-[var(--ms-text-destructive)]"
            data-test-id={testId ? `${testId}-error` : 'meta-field-error'}
          >
            {error}
          </div>
        )}
        {subRow && <div className="mt-1.5">{subRow}</div>}
        {helper && <div className="mt-1 text-[var(--ms-text-muted)] text-xs">{helper}</div>}
      </div>
    </>
  );
}
