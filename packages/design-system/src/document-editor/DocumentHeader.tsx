'use client';

import { Calendar } from 'lucide-react';
import type * as React from 'react';
import { useEffect, useState } from 'react';
import { Icons } from '../icons/action-icons.ts';
import { cn } from '../lib/cn.ts';
import { DatePicker } from '../primitives/DatePicker.tsx';
import { DropdownMenu } from '../primitives/DropdownMenu.tsx';

/** `YYYY-MM-DD` → moysklad `DD.MM.YYYY`. */
function formatDdMmYyyy(iso: string): string {
  const [y, m, d] = iso.split('-');
  return d && m && y ? `${d}.${m}.${y}` : iso;
}

/** moysklad `DD.MM.YYYY` (typed) → `YYYY-MM-DD`, or null if not a valid date. */
function parseDdMmYyyy(s: string): string | null {
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s.trim());
  if (!m) return null;
  const dn = Number(m[1]);
  const mn = Number(m[2]);
  if (mn < 1 || mn > 12 || dn < 1 || dn > 31) return null;
  return `${m[3]}-${String(mn).padStart(2, '0')}-${String(dn).padStart(2, '0')}`;
}

/**
 * Document header — the row immediately under the toolbar that
 * displays "Заказ поставщику № __ от <date> [Status ▾] [✓ Проведено]
 * [✓ Ожидание]". Mirrors moysklad's b-document-editor-header.
 *
 * The number field is editable (placeholder explains it auto-fills on
 * save when blank); the date is a required input. Status is a
 * coloured pill picker; Проведено / Ожидание are inline checkboxes
 * with help-icon tooltips.
 *
 * Pages with no FSM (e.g. Move) hide status by passing
 * `statusOptions={undefined}`. Pages without "Ожидание" semantics
 * (most non-procurement docs) hide that checkbox by omitting
 * `onWaitingChange`.
 */
export interface DocumentStatusOption {
  value: string;
  label: string;
  /** Hex colour for the pill bg. Falls back to neutral grey. */
  color?: string;
}

export interface DocumentHeaderProps {
  /** Document type label, e.g. «Заказ поставщику», «Приёмка». */
  documentTypeLabel: React.ReactNode;
  /** Auto-assigned number; empty string until user types. */
  number: string;
  onNumberChange?: (value: string) => void;
  numberPlaceholder?: string;
  /** Tooltip on the «№» field («leave blank to auto-number»). Localised via
   *  useDocumentEditorLabels — was a hardcoded Latin-Uzbek literal that leaked
   *  into the RU locale. */
  numberTooltip?: string;

  /** Document moment (ISO date string). */
  date: string;
  onDateChange?: (value: string) => void;

  /** FSM status. Omit `statusOptions` to hide the pill. */
  status?: string;
  statusOptions?: DocumentStatusOption[];
  onStatusChange?: (value: string) => void;
  statusLabel?: React.ReactNode;
  /** moysklad «Настроить...» — when set, the status popup shows a footer item that
   *  opens the account's status-management settings. Used by pages whose «Статус»
   *  lists ACCOUNT-DEFINED statuses (e.g. purchase orders) so the admin can add a
   *  status straight from the dropdown — even when the list is empty (grey
   *  «Статус»). Omitted on FSM-only pages → no footer item. */
  onConfigureStatuses?: () => void;
  configureStatusesLabel?: React.ReactNode;

  /** Payment-status pill (moysklad «Не оплачено» outline pill that sits left
   *  of the doc-status dropdown on sales/purchase orders). Omit to hide.
   *  Localize from the page (e.g. detail_header.not_paid). */
  paymentLabel?: React.ReactNode;
  /**
   * Payment state — drives the pill's indicator dot (moysklad parity):
   *   'unpaid'  → orange OUTLINE ring  «Не оплачено»
   *   'partial' → filled ORANGE dot     «Частично оплачено»
   *   'paid'    → filled GREEN dot       «Оплачено»
   * Defaults to 'unpaid' (the historical single-state behaviour). The page owns
   * the threshold (paid ≥ total → paid; 0 < paid < total → partial; else unpaid).
   */
  paymentTone?: 'unpaid' | 'partial' | 'paid';

  /** «Запросить оплату» button (moysklad outline button right of the payment
   *  pill). Rendered only when `onRequestPayment` is provided; the page wires
   *  it to its own flow (e.g. save → open the payment-in form). */
  requestPaymentLabel?: React.ReactNode;
  onRequestPayment?: () => void;

  /** Проведено flag — moysklad's «posted» semantics. */
  applicable?: boolean;
  onApplicableChange?: (value: boolean) => void;
  applicableLabel?: React.ReactNode;
  applicableHelp?: React.ReactNode;
  /** Render «Проведено» but DISABLED (moysklad still SHOWS the checkbox on a
   *  terminal doc, e.g. a cancelled one — it just can't be toggled). */
  applicableDisabled?: boolean;

  /** Ожидание flag — procurement-only «waiting for delivery». */
  waiting?: boolean;
  onWaitingChange?: (value: boolean) => void;
  waitingLabel?: React.ReactNode;
  waitingHelp?: React.ReactNode;
  waitingDisabled?: boolean;

  /** Optional content pinned to the RIGHT edge of the header row (pushed there
   *  with `ml-auto`). moysklad shows the «Владелец» owner/access popover here on
   *  document detail pages; /new uses DocumentEditor's own rightSlot instead. */
  rightSlot?: React.ReactNode;

  testId?: string;
  className?: string;
}

function HelpIcon({ tooltip }: { tooltip?: React.ReactNode }) {
  if (!tooltip) return null;
  return (
    <span
      className="ml-1 inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-current text-[10px] text-[var(--ms-text-muted)]"
      title={typeof tooltip === 'string' ? tooltip : undefined}
      aria-label={typeof tooltip === 'string' ? tooltip : undefined}
    >
      ?
    </span>
  );
}

/** Readable text colour on a coloured pill: dark on light bg, white on dark
 *  bg (moysklad uses YIQ luminance — same trick). */
function pillTextColor(hex?: string): string {
  if (!hex) return 'inherit';
  const c = hex.replace('#', '');
  if (c.length < 6) return 'inherit';
  const r = Number.parseInt(c.slice(0, 2), 16);
  const g = Number.parseInt(c.slice(2, 4), 16);
  const b = Number.parseInt(c.slice(4, 6), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 160 ? '#1c2030' : '#ffffff';
}

/**
 * Document «Статус» — moysklad parity. The trigger is a coloured pill showing
 * the current status name; clicking it opens moysklad's `b-color-list-box-popup`
 * (captured 2026-04-30, customerorder/i-dropdown-status.dom.html): a vertical
 * list of `item-status` rows, each a `b-color-square` colour chip + label.
 *
 * Previously a native `<select>` — the trigger pill matched, but its OPEN list
 * was the browser-native white dropdown (no colour chips), the documented
 * pixel gap. API is unchanged, so every document /new form (~28) inherits the
 * colour-chip popup with no per-page edits.
 */
function StatusPill({
  status,
  options,
  onChange,
  label,
  onConfigure,
  configureLabel,
}: {
  status?: string;
  options?: DocumentStatusOption[];
  onChange?: (v: string) => void;
  label?: React.ReactNode;
  onConfigure?: () => void;
  configureLabel?: React.ReactNode;
}) {
  // Render the pill when there are options OR a «Настроить» entry (an empty
  // account-status list still needs the grey «Статус» pill + the configure
  // link). Only a page that passes neither (a pure no-status doc, e.g. Move)
  // hides the pill entirely.
  if (!options && !onConfigure) return null;
  const current = options?.find((o) => o.value === status);
  const bg = current?.color ?? '#ffffff';
  const fg = pillTextColor(current?.color);
  return (
    <span className="inline-flex items-center gap-2">
      {label && <span className="text-[var(--ms-text-muted)] text-sm">{label}</span>}
      <DropdownMenu
        align="start"
        testId="doc-header-status-popup"
        trigger={
          <button
            type="button"
            className="inline-flex h-[var(--ms-control-h)] items-center gap-1 rounded-[var(--ms-radius-sm)] border border-[var(--ms-border-default)] px-2 font-medium text-[12px] focus:outline-none focus:ring-2 focus:ring-[var(--ms-text-brand)]"
            style={{ backgroundColor: bg, color: fg }}
            data-test-id="doc-header-status"
          >
            <span>{current?.label ?? 'Статус'}</span>
            <Icons.down className="h-3.5 w-3.5" aria-hidden />
          </button>
        }
      >
        {options?.map((o) => (
          <DropdownMenu.Item
            key={o.value}
            onSelect={() => onChange?.(o.value)}
            testId={`doc-header-status-option-${o.value}`}
            icon={
              <span
                className="block h-3 w-3 rounded-sm border border-[var(--ms-border-default)]"
                style={{ backgroundColor: o.color ?? '#9ca3af' }}
                aria-hidden
              />
            }
          >
            {o.label}
          </DropdownMenu.Item>
        ))}
        {onConfigure && (
          <>
            {options && options.length > 0 && <DropdownMenu.Separator />}
            <DropdownMenu.Item onSelect={onConfigure} testId="doc-header-status-configure">
              {configureLabel ?? 'Настроить...'}
            </DropdownMenu.Item>
          </>
        )}
      </DropdownMenu>
    </span>
  );
}

export function DocumentHeader({
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
  paymentLabel,
  paymentTone = 'unpaid',
  requestPaymentLabel,
  onRequestPayment,
  applicable,
  onApplicableChange,
  applicableLabel,
  applicableHelp,
  applicableDisabled,
  waiting,
  onWaitingChange,
  waitingLabel,
  waitingHelp,
  waitingDisabled,
  rightSlot,
  testId,
  className,
}: DocumentHeaderProps) {
  // moysklad «от»: the date sub-field is a typeable DD.MM.YYYY box AND a
  // calendar icon. Local state lets the user type freely; a valid parse commits
  // to the wire value, an external date change (or blur on bad input) resyncs.
  const isoDate = date.slice(0, 10);
  const [dateText, setDateText] = useState(isoDate ? formatDdMmYyyy(isoDate) : '');
  useEffect(() => {
    setDateText(isoDate ? formatDdMmYyyy(isoDate) : '');
  }, [isoDate]);
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-3 border-[var(--ms-border-default)] border-b bg-[var(--ms-bg-surface)] px-4 py-3',
        className,
      )}
      data-test-id={testId ?? 'doc-header'}
    >
      <span className="font-semibold text-[var(--ms-text-primary)] text-lg">
        {documentTypeLabel}
        <span className="ml-1 text-[var(--ms-text-muted)]">№</span>
      </span>
      {onNumberChange ? (
        // /new: the «№» is an editable box (blank → auto-numbered on save).
        <input
          type="text"
          value={number}
          onChange={(e) => onNumberChange(e.target.value)}
          placeholder={numberPlaceholder ?? 'Авто'}
          className="h-[var(--ms-control-h)] w-24 rounded-[var(--ms-radius-sm)] border border-[var(--ms-border-default)] px-2 text-[12px] tabular-nums focus:outline-none focus:ring-2 focus:ring-[var(--ms-text-brand)]"
          data-test-id="doc-header-number"
          title={numberTooltip ?? "Avtomatik raqam o'rnatish uchun maydonni bo'sh qoldiring"}
        />
      ) : (
        // Saved doc (detail): moysklad shows the assigned number as plain bold text
        // «00011» — not a bordered box.
        <span
          className="font-semibold text-[15px] text-[var(--ms-text-primary)] tabular-nums"
          data-test-id="doc-header-number"
        >
          {number}
        </span>
      )}
      <span className="text-[var(--ms-text-muted)] text-sm">от</span>
      {/* moysklad «от» = ONE bordered field "DD.MM.YYYY HH:MM" (24-hour) with a
          calendar icon on the LEFT. The icon+date is the calendar trigger; the
          time is an inline borderless field inside the same box. Recombined to
          the `YYYY-MM-DDTHH:MM` wire value onDateChange already expects.
          (A native <input type="datetime-local"> renders US MM/DD/YYYY + AM/PM
          on en-US browsers, and split DatePicker+time read as two boxes — both
          parity breaks vs moysklad's single field.) */}
      <div
        className="inline-flex h-[var(--ms-control-h)] items-center overflow-hidden rounded-[var(--ms-radius-sm)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] focus-within:ring-2 focus-within:ring-[var(--ms-text-brand)]"
        data-test-id="doc-header-date"
      >
        <DatePicker
          value={isoDate || null}
          onChange={(d) => onDateChange?.(`${d ?? isoDate}T${date.slice(11, 16) || '00:00'}`)}
          locale="ru-RU"
          clearable={false}
          trigger={
            <button
              type="button"
              aria-label="Открыть календарь"
              data-test-id="doc-header-date-picker"
              className="inline-flex h-full items-center pr-0.5 pl-2 text-[var(--ms-text-muted)] hover:text-[var(--ms-text-primary)] focus:outline-none"
            >
              <Calendar className="h-3.5 w-3.5 shrink-0" />
            </button>
          }
        />
        <input
          type="text"
          inputMode="numeric"
          value={dateText}
          onChange={(e) => {
            setDateText(e.target.value);
            const iso = parseDdMmYyyy(e.target.value);
            if (iso) onDateChange?.(`${iso}T${date.slice(11, 16) || '00:00'}`);
          }}
          onBlur={() => setDateText(isoDate ? formatDdMmYyyy(isoDate) : '')}
          placeholder="дд.мм.гггг"
          aria-label="Дата документа"
          className="h-full w-[74px] border-0 bg-transparent px-0.5 text-[12px] tabular-nums focus:outline-none focus:ring-0"
          data-test-id="doc-header-date-input"
        />
        <input
          type="text"
          inputMode="numeric"
          value={date.slice(11, 16)}
          onChange={(e) => {
            const t = e.target.value.replace(/[^\d:]/g, '').slice(0, 5);
            onDateChange?.(`${isoDate}T${t}`);
          }}
          placeholder="чч:мм"
          aria-label="Время"
          className="h-full w-12 border-0 bg-transparent px-1 text-center text-[12px] tabular-nums focus:outline-none focus:ring-0"
          data-test-id="doc-header-time"
        />
      </div>
      {paymentLabel && (
        // moysklad payment pill — outline pill (border #ccc, radius 3px, ~26px) to
        // the left of the doc-status dropdown. The indicator dot encodes the state:
        // «Не оплачено» = orange outline ring · «Частично оплачено» = filled orange ·
        // «Оплачено» = filled green (moysklad shows the pill in ALL THREE states, not
        // just while unpaid).
        <span
          className="inline-flex h-[26px] items-center gap-1.5 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] px-2.5 text-[var(--ms-text-primary)] text-sm"
          data-test-id="doc-header-payment"
          data-payment-tone={paymentTone}
        >
          <span
            className={cn(
              'inline-block h-2.5 w-2.5 rounded-full border',
              paymentTone === 'paid'
                ? 'border-[var(--ms-action-success)] bg-[var(--ms-action-success)]'
                : paymentTone === 'partial'
                  ? 'border-[var(--ms-warning-500)] bg-[var(--ms-warning-500)]'
                  : 'border-[var(--ms-text-warning)]',
            )}
            aria-hidden
          />
          {paymentLabel}
        </span>
      )}
      {onRequestPayment && (
        // moysklad «Запросить оплату» — plain outline button (border #ccc, ~26px,
        // padding 10px, dark text) right of the «Не оплачено» pill. The page
        // wires the action (e.g. save → open the payment-in form); never a
        // dead button.
        <button
          type="button"
          onClick={onRequestPayment}
          className="inline-flex h-[26px] items-center rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] px-2.5 text-[var(--ms-text-primary)] text-sm hover:bg-[var(--ms-bg-hover)]"
          data-test-id="doc-header-request-payment"
        >
          {requestPaymentLabel}
        </button>
      )}
      <StatusPill
        status={status}
        options={statusOptions}
        onChange={onStatusChange}
        label={statusLabel}
        onConfigure={onConfigureStatuses}
        configureLabel={configureStatusesLabel}
      />
      {onApplicableChange && (
        // moysklad parity: the help «?» sits BEFORE the checkbox («? ☑ Проведено»),
        // not after the label. Kept OUTSIDE the <label> so clicking it doesn't toggle.
        <span className="ml-2 inline-flex items-center gap-1 text-sm">
          <HelpIcon tooltip={applicableHelp} />
          <label className="inline-flex items-center gap-1">
            <input
              type="checkbox"
              checked={!!applicable}
              onChange={(e) => onApplicableChange(e.target.checked)}
              disabled={applicableDisabled}
              className="h-4 w-4"
              data-test-id="doc-header-applicable"
            />
            {applicableLabel ?? 'Проведено'}
          </label>
        </span>
      )}
      {onWaitingChange && (
        <span className="inline-flex items-center gap-1 text-sm">
          <HelpIcon tooltip={waitingHelp} />
          <label className="inline-flex items-center gap-1">
            <input
              type="checkbox"
              checked={!!waiting}
              onChange={(e) => onWaitingChange(e.target.checked)}
              disabled={waitingDisabled}
              className="h-4 w-4"
              data-test-id="doc-header-waiting"
            />
            {waitingLabel ?? 'Ожидание'}
          </label>
        </span>
      )}
      {rightSlot && <div className="ml-auto">{rightSlot}</div>}
    </div>
  );
}
