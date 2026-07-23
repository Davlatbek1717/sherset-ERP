'use client';

/**
 * «Настройка доступа» — 1:1 with MoySklad's real dialog (owner screenshots,
 * 2026-07-19): the «Настроить права» button on the employee card opens THIS
 * modal — a role dropdown + «Изменить роль» link on top, section tabs down the
 * left (Показатели … Задачи) and the selected section's permission checkboxes
 * on the right; «Сохранить настройки» (green) + «Отменить» at the bottom.
 *
 * Wire format is unchanged: GET /roles/:id → PATCH /roles/:id
 * {version, permissions}. Picking a different role in the dropdown and saving
 * also re-assigns the employee to that role (PUT /roles/employee/:id) — that
 * is where MoySklad keeps role selection, not on the card itself.
 */

import { useApiMutation } from '@/hooks/use-api-mutation';
import {
  ACCESS_SECTIONS,
  ACTION_GROUPS,
  type MatrixCell,
  groupRefs,
  refsOn,
  setRefs,
} from '@/lib/access-sections';
import { api } from '@/lib/api-client';
import { Button, Checkbox, Modal, NativeSelect } from '@moysklad/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

interface RoleDetail {
  id: string;
  name: string;
  isSystem: boolean;
  version: number;
  permissions: MatrixCell[];
}

export function AccessSettingsModal({
  open,
  onClose,
  employeeId,
  currentRoleId,
  roles,
  onAssigned,
}: {
  open: boolean;
  onClose: () => void;
  /** null while the employee is not saved yet (/new) — then the dialog only
   *  edits role permissions; the card's own save assigns the role. */
  employeeId: string | null;
  currentRoleId: string | null;
  roles: Array<{ id: string; name: string }>;
  onAssigned: (roleId: string) => void;
}) {
  const t = useTranslations();
  const tCard = useTranslations('pages.employee_card');
  const qc = useQueryClient();

  const [targetRoleId, setTargetRoleId] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState(ACCESS_SECTIONS[0]?.key ?? 'dashboard');
  useEffect(() => {
    if (open) {
      setTargetRoleId(currentRoleId ?? roles[0]?.id ?? null);
      setActiveSection(ACCESS_SECTIONS[0]?.key ?? 'dashboard');
    }
  }, [open, currentRoleId, roles]);

  const roleQuery = useQuery<RoleDetail>({
    queryKey: ['role-detail', targetRoleId],
    queryFn: () => api.get<RoleDetail>(`/roles/${targetRoleId}`),
    enabled: open && targetRoleId != null,
  });

  const [cells, setCells] = useState<MatrixCell[]>([]);
  useEffect(() => {
    if (roleQuery.data) setCells(roleQuery.data.permissions);
  }, [roleQuery.data]);

  const saveMutation = useApiMutation<unknown, Error, void>({
    mutationFn: async () => {
      await api.patch(`/roles/${targetRoleId}`, {
        version: roleQuery.data?.version,
        permissions: cells,
      });
      if (employeeId && targetRoleId && targetRoleId !== currentRoleId) {
        await api.put(`/roles/employee/${employeeId}`, { roleIds: [targetRoleId] });
      }
    },
    successMessage: tCard('rights_saved'),
    onSuccess: () => {
      if (targetRoleId) onAssigned(targetRoleId);
      qc.invalidateQueries({ queryKey: ['role-detail'] });
      qc.invalidateQueries({ queryKey: ['roles'] });
      qc.invalidateQueries({ queryKey: ['employee-card'] });
      onClose();
    },
  });

  const section = ACCESS_SECTIONS.find((s) => s.key === activeSection) ?? ACCESS_SECTIONS[0];
  const loaded = roleQuery.data != null;

  return (
    <Modal
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
      title={tCard('access_title')}
      widthClass="w-[930px]"
      footer={
        // MoySklad keeps these bottom-LEFT: green «Сохранить настройки», then
        // «Отменить» (owner screenshot 2026-07-19).
        <div className="mr-auto flex items-center gap-2">
          <Button
            variant="success"
            onClick={() => saveMutation.mutate()}
            loading={saveMutation.isPending}
            disabled={!loaded}
            data-testid="access-settings-save"
          >
            {tCard('access_save')}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            {tCard('access_cancel')}
          </Button>
        </div>
      }
    >
      <div className="w-full" data-testid="access-settings-modal">
        {/* role picker row — MoySklad keeps role selection HERE, not on the card */}
        <div className="flex items-center gap-4 px-4 pt-3 pb-2">
          <NativeSelect
            value={targetRoleId ?? ''}
            onChange={(e) => setTargetRoleId(e.target.value || null)}
            className="w-[220px]"
            data-testid="access-role-select"
          >
            {roles.length === 0 && <option value="">—</option>}
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </NativeSelect>
          <a
            href="/analitika/sozlamalar/rollar"
            target="_blank"
            rel="noreferrer"
            className="text-[13px] text-[var(--ms-text-brand)] hover:underline"
          >
            {tCard('access_change_role')}
          </a>
        </div>

        <div className="flex min-h-[380px] border-[var(--ms-border-default)] border-t">
          {/* left: section tabs */}
          <div className="flex w-[180px] shrink-0 flex-col gap-0.5 border-[var(--ms-border-default)] border-r py-2">
            {ACCESS_SECTIONS.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setActiveSection(s.key)}
                className={`px-3 py-1.5 text-left text-[13px] ${
                  s.key === section?.key
                    ? 'bg-[var(--ms-bg-hover)] font-semibold text-[var(--ms-text-primary)]'
                    : 'text-[var(--ms-text-secondary)] hover:bg-[var(--ms-bg-muted)]'
                }`}
                data-testid={`access-section-${s.key}`}
              >
                {t(s.labelPath as 'nav.sales')}
              </button>
            ))}
          </div>

          {/* right: the selected section's checkboxes */}
          <div className="max-h-[55vh] flex-1 overflow-auto p-4">
            {!loaded ? (
              <div className="py-6 text-[13px] text-[var(--ms-text-muted)]">…</div>
            ) : section?.rows?.length ? (
              <div className="flex flex-col gap-2.5">
                {section.rows.map((row) => (
                  <label
                    key={row.labelKey}
                    className="flex w-fit cursor-pointer items-center gap-2 text-[13px] text-[var(--ms-text-primary)]"
                  >
                    <Checkbox
                      checked={refsOn(cells, row.refs)}
                      onCheckedChange={(v) => setCells(setRefs(cells, row.refs, v === true))}
                      data-testid={`access-row-${row.refs[0]?.entity}-${row.refs[0]?.action}`}
                    />
                    {tCard(row.labelKey as 'access_title')}
                  </label>
                ))}
              </div>
            ) : section && section.entities.length > 0 ? (
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr>
                    <th aria-hidden className="w-[220px]" />
                    {ACTION_GROUPS.map((g) => (
                      <th
                        key={g.key}
                        className="px-2 pb-2 text-center font-normal text-[12px] text-[var(--ms-text-muted)]"
                      >
                        {tCard(g.labelKey as 'access_title')}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {section.entities.map((e) => (
                    <tr key={e.entity} className="border-[var(--ms-border-default)] border-t">
                      <td className="py-2 pr-2 text-[var(--ms-text-primary)]">
                        {t(e.labelPath as 'nav.sales')}
                      </td>
                      {ACTION_GROUPS.map((g) => (
                        <td key={g.key} className="px-2 py-2 text-center">
                          {g.docOnly && !e.doc ? (
                            <span className="text-[var(--ms-text-muted)]">—</span>
                          ) : (
                            <Checkbox
                              checked={refsOn(cells, groupRefs(e.entity, g))}
                              onCheckedChange={(v) =>
                                setCells(setRefs(cells, groupRefs(e.entity, g), v === true))
                              }
                              data-testid={`access-${e.entity}-${g.key}`}
                            />
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="py-6 text-[13px] text-[var(--ms-text-muted)]">
                {tCard('access_empty_section')}
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
