'use client';

/**
 * MoyskladAgentDropdown — picker for HR-Employee → Employee link.
 *
 * Loads candidate `Employee` rows from `hrEmployeeApi.moyskladAgents()`
 * (the backend filters out already-linked agents + the current employee,
 * if `excludeId` is passed). Selection becomes the `moyskladAgentId`
 * payload field. The "—" (clear) option resets the value to `null`.
 */

import { hrEmployeeApi } from '@/lib/hr-api';
import type { MoyskladAgentOption } from '@/lib/hr-api';
import { NativeSelect } from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

export interface MoyskladAgentDropdownProps {
  value: string | null;
  onChange: (next: string | null) => void;
  excludeId?: string;
  disabled?: boolean;
}

export function MoyskladAgentDropdown({
  value,
  onChange,
  excludeId,
  disabled,
}: MoyskladAgentDropdownProps) {
  const t = useTranslations('pages.hrEmployees');

  const { data: agents = [] } = useQuery<MoyskladAgentOption[]>({
    queryKey: ['hr-moysklad-agents', excludeId ?? null],
    queryFn: () => hrEmployeeApi.moyskladAgents(excludeId),
  });

  return (
    <NativeSelect
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      disabled={disabled}
      aria-label={t('form_moysklad_agent')}
    >
      <option value="">{t('form_moysklad_agent_none')}</option>
      {agents.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
          {a.email ? ` — ${a.email}` : ''}
        </option>
      ))}
    </NativeSelect>
  );
}
