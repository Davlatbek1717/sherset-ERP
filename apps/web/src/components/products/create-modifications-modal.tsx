'use client';

/**
 * «Создание модификаций» — generate product variants from characteristics×values
 * (moysklad parity). You pick/enter one or more characteristics (e.g. «Цвет»,
 * «Размер»), give each its values in SEPARATE fields (moysklad: «укажите значения
 * характеристик в отдельных полях, например, красный, синий»), and «Создать
 * модификации» creates every combination (the Cartesian product) via
 * POST /variants/generate.
 *
 * Both the characteristic and value inputs render as moysklad-style dropdowns
 * (a ▾ affordance); the characteristic offers existing names from the account
 * dictionary (GET /characteristics) via a native datalist and accepts new ones.
 * Values use separate fields that grow as you fill the last one. No placeholders
 * (moysklad reference inputs are empty — project rule).
 */

import { api } from '@/lib/api-client';
import { Button, Input } from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

interface AxisDraft {
  id: string;
  name: string;
  /** Value fields. Always ends with an empty "add" slot; trimmed/deduped at submit. */
  values: string[];
}

interface GenerateResult {
  created: number;
  skipped: number;
}

let axisSeq = 0;
const newAxis = (): AxisDraft => {
  axisSeq += 1;
  return { id: `axis-${axisSeq}`, name: '', values: [''] };
};

/** Trimmed, de-duplicated, non-empty values of an axis (what actually generates). */
function realValues(axis: AxisDraft): string[] {
  return [...new Set(axis.values.map((v) => v.trim()).filter((v) => v.length > 0))];
}

/**
 * moysklad-style combo field: a bordered input (DS `--ms-border-strong` resting
 * border, like every moysklad control) with, on the right INSIDE the box, an ✕
 * clear button (shown only when there's text — clears the field) and a ▾
 * dropdown affordance — mirroring moysklad's «Создание модификаций» combos.
 */
function ComboField(props: {
  value: string;
  onChange: (v: string) => void;
  onClear: () => void;
  clearLabel: string;
  list?: string;
  ariaLabel: string;
  testId: string;
}) {
  return (
    <div className="relative">
      <Input
        className="w-full pr-12"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        list={props.list}
        aria-label={props.ariaLabel}
        data-test-id={props.testId}
      />
      <div className="-translate-y-1/2 absolute top-1/2 right-2 flex items-center gap-1.5">
        {props.value && (
          <button
            type="button"
            onClick={props.onClear}
            aria-label={props.clearLabel}
            className="text-[var(--ms-text-muted)] text-xs leading-none hover:text-[var(--ms-text-primary)]"
            data-test-id={`${props.testId}-clear`}
          >
            ✕
          </button>
        )}
        <span className="pointer-events-none text-[9px] text-[var(--ms-text-muted)]" aria-hidden>
          ▼
        </span>
      </div>
    </div>
  );
}

export interface CreateModificationsModalProps {
  productId: string;
  open: boolean;
  onClose(): void;
  /** Called after a successful generate (so the caller can refetch + toast). */
  onCreated(result: GenerateResult): void;
}

export function CreateModificationsModal({
  productId,
  open,
  onClose,
  onCreated,
}: CreateModificationsModalProps) {
  const t = useTranslations('modifications_modal');
  const tCommon = useTranslations('common');
  const qc = useQueryClient();

  const [axes, setAxes] = useState<AxisDraft[]>([newAxis()]);
  const [error, setError] = useState<string | null>(null);

  // Reset to a single empty axis every time the modal (re)opens.
  useEffect(() => {
    if (open) {
      setAxes([newAxis()]);
      setError(null);
    }
  }, [open]);

  // Escape ATAYLAB tinglanmaydi — yarim to'ldirilgan o'q/qiymatlar tasodifiy
  // tugmadan yo'qolmasin. Yopish: ✕ yoki «Bekor» (`noAccidentalClose`).

  const charsQuery = useQuery<{ items: { id: string; name: string }[] }>({
    queryKey: ['characteristics', 'all'],
    queryFn: () => api.get<{ items: { id: string; name: string }[] }>('/characteristics?limit=500'),
    enabled: open,
    staleTime: 60_000,
  });
  const suggestions = charsQuery.data?.items ?? [];

  const generateMut = useMutation<GenerateResult, Error>({
    mutationFn: () =>
      api.post<GenerateResult>('/variants/generate', {
        productId,
        characteristics: axes
          .map((a) => ({ name: a.name.trim(), values: realValues(a) }))
          .filter((a) => a.name.length > 0 && a.values.length > 0),
      }),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ['variants', 'by-product', productId] });
      onCreated(res);
      onClose();
    },
    onError: (e) => setError(e.message),
  });

  if (!open) return null;

  const setName = (id: string, name: string) =>
    setAxes((prev) => prev.map((a) => (a.id === id ? { ...a, name } : a)));

  // Edit a value field. Filling the last (tail) field appends a fresh empty slot
  // so there's always an empty add-row. Clearing (via the inner ✕) keeps the row
  // empty — moysklad parity (the ✕ blanks the field; the outer ⊗ removes the row).
  const setValueAt = (id: string, index: number, raw: string) =>
    setAxes((prev) =>
      prev.map((a) => {
        if (a.id !== id) return a;
        const values = [...a.values];
        values[index] = raw;
        if (raw.trim() && index === values.length - 1) values.push('');
        return { ...a, values };
      }),
    );

  const removeValueAt = (id: string, index: number) =>
    setAxes((prev) =>
      prev.map((a) => {
        if (a.id !== id) return a;
        const values = a.values.filter((_, i) => i !== index);
        if (values.length === 0 || (values[values.length - 1] ?? '').trim()) values.push('');
        return { ...a, values };
      }),
    );

  const validAxes = axes.filter((a) => a.name.trim().length > 0 && realValues(a).length > 0);
  // Cartesian count of the values across valid axes.
  const comboCount = validAxes.reduce((n, a) => n * realValues(a).length, validAxes.length ? 1 : 0);
  const canSubmit = validAxes.length > 0 && !generateMut.isPending;

  return (
    <div
      className="fixed inset-0 z-[var(--ms-z-popover)] flex items-center justify-center bg-black/30"
      data-test-id="create-modifications-backdrop"
    >
      <div
        className="flex max-h-[88vh] w-[560px] max-w-[94vw] flex-col rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] shadow-[var(--ms-shadow-md)]"
        // biome-ignore lint/a11y/useSemanticElements: controlled modal; native <dialog> needs imperative showModal() incompatible with this render-prop open state
        role="dialog"
        aria-modal="true"
        aria-label={t('title')}
        data-test-id="create-modifications-modal"
      >
        <div className="flex items-center justify-between border-[var(--ms-border-default)] border-b px-5 py-4">
          <h2 className="font-semibold text-[15px] text-[var(--ms-text-primary)]">{t('title')}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={tCommon('close')}
            className="rounded p-1 text-[var(--ms-text-muted)] hover:bg-[var(--ms-bg-muted)]"
            data-test-id="create-modifications-close"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {axes.map((axis) => (
            <div
              key={axis.id}
              className="space-y-3 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] p-3"
              data-test-id="modification-axis"
            >
              <div className="flex items-start gap-2">
                <div className="flex-1 space-y-1">
                  <span className="text-[var(--ms-text-muted)] text-xs">
                    {t('characteristic_hint')}
                  </span>
                  <ComboField
                    value={axis.name}
                    onChange={(v) => setName(axis.id, v)}
                    onClear={() => setName(axis.id, '')}
                    clearLabel={tCommon('clear')}
                    list="modification-characteristics"
                    ariaLabel={t('characteristic_aria')}
                    testId="modification-axis-name"
                  />
                </div>
                {axes.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setAxes((prev) => prev.filter((a) => a.id !== axis.id))}
                    aria-label={t('remove_characteristic')}
                    className="mt-6 rounded p-1 text-[var(--ms-text-muted)] text-lg leading-none hover:text-[var(--ms-text-destructive)]"
                    data-test-id="modification-axis-remove"
                  >
                    ×
                  </button>
                )}
              </div>

              <div className="space-y-1.5">
                <span className="text-[var(--ms-text-muted)] text-xs">{t('values_hint')}</span>
                {axis.values.map((v, i) => {
                  const isLast = i === axis.values.length - 1;
                  return (
                    <div
                      // biome-ignore lint/suspicious/noArrayIndexKey: value fields are positional (the row IS the index); content isn't a stable key while typing
                      key={i}
                      className="flex items-center gap-2"
                    >
                      <div className="flex-1">
                        <ComboField
                          value={v}
                          onChange={(val) => setValueAt(axis.id, i, val)}
                          onClear={() => setValueAt(axis.id, i, '')}
                          clearLabel={tCommon('clear')}
                          ariaLabel={t('value_aria')}
                          testId="modification-value-input"
                        />
                      </div>
                      {!isLast && (
                        <button
                          type="button"
                          onClick={() => removeValueAt(axis.id, i)}
                          aria-label={t('remove_value')}
                          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--ms-bg-muted)] text-[11px] text-[var(--ms-text-muted)] leading-none hover:bg-[var(--ms-action-destructive)] hover:text-white"
                          data-test-id="modification-value-remove"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          <datalist id="modification-characteristics">
            {suggestions.map((s) => (
              <option key={s.id} value={s.name} />
            ))}
          </datalist>

          <Button
            type="button"
            variant="secondary"
            size="md"
            onClick={() => setAxes((prev) => [...prev, newAxis()])}
            data-test-id="modification-add-axis"
          >
            + {t('add_characteristic')}
          </Button>

          {comboCount > 0 && (
            <p className="text-[var(--ms-text-muted)] text-sm" data-test-id="modification-count">
              {t('count_preview', { count: comboCount })}
            </p>
          )}

          {error && (
            <p className="text-[var(--ms-text-destructive)] text-sm" role="alert">
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 border-[var(--ms-border-default)] border-t px-5 py-4">
          <Button
            type="button"
            variant="success"
            size="md"
            disabled={!canSubmit}
            onClick={() => {
              setError(null);
              generateMut.mutate();
            }}
            data-test-id="create-modifications-submit"
          >
            {generateMut.isPending ? tCommon('saving') : t('submit')}
          </Button>
          <Button type="button" variant="tertiary" size="md" onClick={onClose}>
            {tCommon('cancel')}
          </Button>
        </div>
      </div>
    </div>
  );
}
