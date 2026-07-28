'use client';

import * as React from 'react';
import { cn } from '../lib/cn.ts';
import { Button } from '../primitives/Button.tsx';

export interface WizardStep {
  key: string;
  /** Visible step label (e.g. "Yuklash", "Ustunlar", "Ko'rib chiqish"). */
  label: React.ReactNode;
  /** Optional sub-title shown only on the active step. */
  description?: React.ReactNode;
}

export interface WizardProps {
  steps: WizardStep[];
  /** Index of the active step (0-based). */
  activeIndex: number;
  /** Body content for the active step — fully controlled by parent. */
  children: React.ReactNode;

  /** "Back" button — hidden when undefined or on first step (default: shown after step 0). */
  onBack?: () => void;
  backLabel?: React.ReactNode;
  backDisabled?: boolean;

  /** "Next" button — hidden when undefined. Disabled state is parent-controlled (e.g. while validation is pending). */
  onNext?: () => void;
  nextLabel?: React.ReactNode;
  nextDisabled?: boolean;
  /** Renders the next button as the brand "Finish" tone — used on the terminal commit step. */
  finishVariant?: boolean;

  /** Optional secondary action shown left of Back (e.g. "Bekor qilish" / "Cancel"). */
  onCancel?: () => void;
  cancelLabel?: React.ReactNode;

  /** Disable all step-circle clicks (default: true — strict forward flow). */
  stepsClickable?: boolean;
  /** Called when a step circle is clicked (only fires when stepsClickable). */
  onStepClick?: (index: number) => void;

  className?: string;
  testId?: string;
}

/**
 * Multi-step wizard chrome. Pure presentational — parent owns state
 * (active step, validation, async work) and decides when to advance.
 *
 * Layout: [stepper bar] / [active step content] / [Cancel | Back | Next].
 *
 * The stepper renders all steps with completion / active / pending states;
 * step labels stay visible at every stage so the operator sees how many
 * stages remain. Stepper is read-only by default to enforce sequential
 * validation (set stepsClickable to allow back-navigation by click).
 */
export function Wizard({
  steps,
  activeIndex,
  children,
  onBack,
  backLabel = 'Orqaga',
  backDisabled = false,
  onNext,
  nextLabel = 'Keyingi',
  nextDisabled = false,
  finishVariant = false,
  onCancel,
  cancelLabel = 'Bekor qilish',
  stepsClickable = false,
  onStepClick,
  className,
  testId,
}: WizardProps) {
  const safeIndex = Math.min(Math.max(activeIndex, 0), steps.length - 1);
  const activeStep = steps[safeIndex]!;

  return (
    <div
      className={cn(
        'rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)]',
        className,
      )}
      data-test-id={testId}
    >
      {/* Stepper */}
      {/* `role="list"` is NOT redundant in practice: Safari/VoiceOver strips list
          semantics from any list whose `list-style` is none, and Tailwind preflight
          sets exactly that. Removing the role would silently drop the "list, 4 items"
          announcement for the stepper. */}
      <ol
        className="flex items-center gap-2 border-b border-[var(--ms-border-default)] px-4 py-3 overflow-x-auto"
        // biome-ignore lint/a11y/useSemanticElements: this IS the semantic element — the rule only fires because of the explicit role
        // biome-ignore lint/a11y/noRedundantRoles: deliberate Safari list-semantics restoration, see the comment above the element
        role="list"
      >
        {steps.map((step, i) => {
          const status: 'done' | 'active' | 'pending' =
            i < safeIndex ? 'done' : i === safeIndex ? 'active' : 'pending';
          const clickable = stepsClickable && i <= safeIndex && i !== safeIndex;
          return (
            <React.Fragment key={step.key}>
              <li className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={!clickable}
                  onClick={() => clickable && onStepClick?.(i)}
                  className={cn(
                    'inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold tabular-nums transition-colors',
                    status === 'done' && 'bg-[var(--ms-bg-brand)] text-[var(--ms-text-on-brand)]',
                    status === 'active' &&
                      'bg-[var(--ms-bg-brand)] text-[var(--ms-text-on-brand)] ring-2 ring-[var(--ms-bg-brand)] ring-offset-2 ring-offset-[var(--ms-bg-surface)]',
                    status === 'pending' && 'bg-[var(--ms-bg-muted)] text-[var(--ms-text-muted)]',
                    clickable ? 'cursor-pointer hover:opacity-80' : 'cursor-default',
                  )}
                  aria-current={status === 'active' ? 'step' : undefined}
                  data-test-id={`wizard-step-${step.key}`}
                >
                  {status === 'done' ? '✓' : i + 1}
                </button>
                <span
                  className={cn(
                    'text-sm whitespace-nowrap',
                    status === 'active'
                      ? 'font-semibold text-[var(--ms-text-primary)]'
                      : 'text-[var(--ms-text-muted)]',
                  )}
                >
                  {step.label}
                </span>
              </li>
              {i < steps.length - 1 && (
                <span
                  aria-hidden
                  className={cn(
                    'h-px w-6 shrink-0',
                    i < safeIndex ? 'bg-[var(--ms-bg-brand)]' : 'bg-[var(--ms-border-default)]',
                  )}
                />
              )}
            </React.Fragment>
          );
        })}
      </ol>

      {/* Active step body */}
      <div className="px-4 py-5">
        {activeStep.description && (
          <p className="text-sm text-[var(--ms-text-muted)] mb-4">{activeStep.description}</p>
        )}
        {children}
      </div>

      {/* Footer */}
      {(onCancel || onBack || onNext) && (
        <div className="flex items-center justify-between border-t border-[var(--ms-border-default)] px-4 py-3">
          <div>
            {onCancel && (
              <Button variant="ghost" size="sm" onClick={onCancel} data-test-id="wizard-cancel">
                {cancelLabel}
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {onBack && safeIndex > 0 && (
              <Button
                variant="secondary"
                size="sm"
                onClick={onBack}
                disabled={backDisabled}
                data-test-id="wizard-back"
              >
                {backLabel}
              </Button>
            )}
            {onNext && (
              <Button
                variant={finishVariant ? 'primary' : 'primary'}
                size="sm"
                onClick={onNext}
                disabled={nextDisabled}
                data-test-id="wizard-next"
              >
                {nextLabel}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
