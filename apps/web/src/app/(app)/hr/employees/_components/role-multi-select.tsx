'use client';

/**
 * RoleMultiSelect — HR-Employee modal role picker.
 *
 * Renders chips of currently selected `HrRole.value`s above a dropdown
 * trigger. The dropdown lists every role from `hrRoleApi.list()` with a
 * leading checkbox and ends with an inline "+ Yangi rol qo'shish" form
 * (value + label) that calls `hrRoleApi.create()` and pre-selects the
 * new role on success.
 *
 * Controlled component — parent owns `value: string[]` and `onChange`.
 */

import { hrRoleApi } from '@/lib/hr-api';
import type { HrRole } from '@/lib/hr-api';
import { Button, Input } from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

export interface RoleMultiSelectProps {
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}

export function RoleMultiSelect({ value, onChange, disabled }: RoleMultiSelectProps) {
  const t = useTranslations('pages.hrEmployees');
  const tRoles = useTranslations('pages.hrRoles');
  const qc = useQueryClient();

  const [open, setOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newValue, setNewValue] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const { data: roles = [] } = useQuery<HrRole[]>({
    queryKey: ['hr-roles'],
    queryFn: () => hrRoleApi.list(),
  });

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
        setShowCreate(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const createMut = useMutation({
    mutationFn: (data: { value: string; label: string }) => hrRoleApi.create(data),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['hr-roles'] });
      onChange([...new Set([...value, created.value])]);
      setNewValue('');
      setNewLabel('');
      setShowCreate(false);
      setCreateError(null);
    },
    onError: (e: Error) => setCreateError(e.message),
  });

  const toggle = (roleValue: string) => {
    if (value.includes(roleValue)) {
      onChange(value.filter((v) => v !== roleValue));
    } else {
      onChange([...value, roleValue]);
    }
  };

  const remove = (roleValue: string) => onChange(value.filter((v) => v !== roleValue));

  const labelOf = (roleValue: string): string =>
    roles.find((r) => r.value === roleValue)?.label ?? roleValue;

  return (
    <div ref={wrapperRef} className="relative">
      {/* Trigger container — chips and open button are siblings to avoid
          nesting interactive elements (button-in-button is invalid). */}
      <div
        className="flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] px-2 py-1.5 text-sm focus-within:ring-2 focus-within:ring-[var(--ms-border-focus)]"
        data-disabled={disabled || undefined}
      >
        {value.length === 0 && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => !disabled && setOpen((v) => !v)}
            className="flex-1 text-left text-[var(--ms-text-muted)] disabled:opacity-50"
            aria-haspopup="listbox"
            aria-expanded={open}
          >
            {t('form_roles')}…
          </button>
        )}
        {value.map((v) => (
          <span
            key={v}
            className="inline-flex items-center gap-1 rounded bg-[var(--ms-bg-muted)] px-1.5 py-0.5 text-xs"
          >
            {labelOf(v)}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                remove(v);
              }}
              className="cursor-pointer text-[var(--ms-text-muted)] hover:text-[var(--ms-text-primary)]"
              aria-label={t('role_remove_aria', { role: labelOf(v) })}
            >
              ×
            </button>
          </span>
        ))}
        {value.length > 0 && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => !disabled && setOpen((v) => !v)}
            className="ml-auto text-[var(--ms-text-muted)] disabled:opacity-50"
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-label={t('role_picker_toggle')}
          >
            ▾
          </button>
        )}
      </div>

      {open && (
        <div className="absolute z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] shadow-[var(--ms-shadow-lg)]">
          <ul className="py-1">
            {roles.map((r) => {
              const selected = value.includes(r.value);
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => toggle(r.value)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-[var(--ms-bg-hover)]"
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      readOnly
                      tabIndex={-1}
                      className="pointer-events-none"
                    />
                    <span className="flex-1">{r.label}</span>
                    {r.isDefault && (
                      <span className="text-[10px] text-[var(--ms-text-muted)] uppercase">
                        {tRoles('type_default')}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="border-[var(--ms-border-default)] border-t p-2">
            {!showCreate ? (
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="w-full rounded px-2 py-1 text-left text-[var(--ms-text-brand)] text-sm hover:bg-[var(--ms-bg-hover)]"
              >
                + {tRoles('create_button')}
              </button>
            ) : (
              <div className="space-y-2">
                <Input
                  type="text"
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  placeholder={tRoles('form_value')}
                />
                <Input
                  type="text"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder={tRoles('form_label')}
                />
                {createError && (
                  <div className="text-[var(--ms-text-destructive)] text-xs">{createError}</div>
                )}
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    disabled={!newValue.trim() || !newLabel.trim() || createMut.isPending}
                    onClick={() =>
                      createMut.mutate({ value: newValue.trim(), label: newLabel.trim() })
                    }
                    className="flex-1 text-xs"
                  >
                    {tRoles('save')}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setShowCreate(false);
                      setCreateError(null);
                    }}
                    className="flex-1 text-xs"
                  >
                    {tRoles('cancel')}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
