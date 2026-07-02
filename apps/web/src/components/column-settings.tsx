'use client';

import { ColumnCustomizer, type ColumnCustomizerProps } from '@moysklad/ui';
import { useTranslations } from 'next-intl';

/**
 * App-level wrapper around the locale-agnostic design-system
 * <ColumnCustomizer>. Injects the localized accessible name and Reset
 * label so every list page's column-settings gear is localized in ONE
 * place instead of each page repeating the strings (or, as before,
 * silently falling back to the hardcoded Latin-uz "Ustunlar" / English
 * "Reset" defaults, which leaked into the wrong locale).
 *
 * moysklad parity (CLAUDE.md §4 grounding): the control is ICON-ONLY —
 * the captures render a gear with the label "Настроить колонки" carried
 * by a `hideLabel` modifier (visible nowhere, used only as the accessible
 * name). So we pass no visible `label`; the localized string lands in
 * `ariaLabel`.
 */
export type ColumnSettingsProps = Omit<
  ColumnCustomizerProps,
  'ariaLabel' | 'resetLabel' | 'rowsPerPageLabel'
>;

/**
 * `label` is optional: omit it for the icon-only gear (the default, used in
 * the table-header slot), or pass a string for a moysklad-parity toolbar
 * «Столбцы» text button (same column-visibility popover, just a visible
 * trigger). Both can coexist on one page sharing the same column state.
 */
export function ColumnSettings({ label, ...props }: ColumnSettingsProps) {
  const t = useTranslations('common');
  return (
    <ColumnCustomizer
      {...props}
      label={label}
      ariaLabel={t('configure_columns')}
      resetLabel={t('columns_reset')}
      rowsPerPageLabel={t('rows_per_page')}
    />
  );
}
