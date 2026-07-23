'use client';

/**
 * Owner 2026-07-17: the simple «Настроить права» surface — every top-nav
 * module as a row with an on/off Switch (the Уведомления-style toggle) and
 * an expand chevron revealing per-tab Switches. State derives from and
 * writes back ordinary RolePermission cells (see lib/module-permissions),
 * so the existing nav-hiding + server guards enforce it unchanged.
 */

import {
  ALL_ACTIONS,
  MODULE_ACCESS,
  type MatrixCell,
  isModuleOn,
  isTabOn,
  moduleEntities,
  setEntitiesAccess,
} from '@/lib/module-permissions';
import { Icons, Switch } from '@moysklad/ui';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export function ModuleAccessEditor({
  value,
  onChange,
}: {
  value: MatrixCell[];
  onChange: (next: MatrixCell[]) => void;
}) {
  const t = useTranslations();
  const tCard = useTranslations('pages.employee_card');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleExpand = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="flex flex-col" data-testid="module-access-editor">
      <p className="mb-3 text-[13px] text-[var(--ms-text-muted)]">{tCard('rights_simple_hint')}</p>
      {MODULE_ACCESS.map((m) => {
        const on = isModuleOn(value, m);
        const open = expanded.has(m.key);
        const hasTabs = m.tabs.length > 0;
        return (
          <div key={m.key} className="border-[var(--ms-border-default)] border-t last:border-b">
            <div className="flex min-h-[40px] items-center gap-2 px-2">
              <button
                type="button"
                onClick={() => hasTabs && toggleExpand(m.key)}
                aria-expanded={open}
                aria-label={t(m.labelPath as 'nav.sales')}
                className={`flex h-6 w-6 items-center justify-center rounded text-[var(--ms-text-muted)] ${
                  hasTabs ? 'hover:bg-[var(--ms-bg-muted)]' : 'invisible'
                }`}
                data-testid={`module-access-expand-${m.key}`}
              >
                <Icons.down
                  aria-hidden
                  className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`}
                />
              </button>
              <span className="flex-1 text-[14px] text-[var(--ms-text-primary)]">
                {t(m.labelPath as 'nav.sales')}
              </span>
              {m.alwaysOn ? (
                <span className="text-[12px] text-[var(--ms-text-muted)]">
                  {tCard('rights_always_on')}
                </span>
              ) : (
                <Switch
                  checked={on}
                  onCheckedChange={(c) =>
                    onChange(setEntitiesAccess(value, moduleEntities(m), c === true))
                  }
                  data-testid={`module-access-toggle-${m.key}`}
                />
              )}
            </div>
            {open && hasTabs && (
              <div className="flex flex-col pb-2">
                {m.tabs.map((tab) => {
                  const tabOn = isTabOn(value, tab);
                  return (
                    <div
                      key={tab.labelPath}
                      className="flex min-h-[34px] items-center gap-2 py-0.5 pr-2 pl-12"
                    >
                      <span className="flex-1 text-[13px] text-[var(--ms-text-secondary)]">
                        {t(tab.labelPath as 'nav.sales')}
                      </span>
                      <Switch
                        checked={tabOn}
                        onCheckedChange={(c) =>
                          onChange(setEntitiesAccess(value, tab.entities, c === true))
                        }
                        data-testid={`module-access-toggle-${m.key}-${tab.labelPath.split('.').pop()}`}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// re-export for the modal's save path (unchanged wire format)
export type { MatrixCell };
export { ALL_ACTIONS };
