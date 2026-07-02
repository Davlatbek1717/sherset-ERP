'use client';

import * as React from 'react';
import { Modal } from '../feedback/Modal.tsx';
import { Button } from '../primitives/Button.tsx';
import { Checkbox } from '../primitives/Checkbox.tsx';
import { Textarea } from '../primitives/Textarea.tsx';
import { CatalogPickerField } from './CatalogPicker.tsx';

export type MassEditPickerValue = { id: string; label: string } | null;

/**
 * moysklad "Изменить" mass-edit modal. Each row is opt-in: the user
 * ticks a row, fills the field, and on submit only the ticked rows
 * land in the patch. An empty patch is rejected at the call-site
 * (typically by the bulk-actions hook, which forwards to the
 * server-side `assertPatchHasAtLeastOneField`).
 *
 * Owner / project pickers reuse `CatalogPickerField` and require the
 * consuming page to supply an `onPick` opener; the picker modal
 * itself lives in the parent (CatalogPicker is global, not
 * per-modal). Description is a free-text field with the same 4096
 * char cap as the backend schema.
 */

export interface MassEditPatch {
  ownerId?: string | null;
  projectId?: string | null;
  description?: string | null;
}

export interface MassEditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCount: number;
  /** Called when the user clicks "Apply"; only ticked rows are present. */
  onSubmit: (patch: MassEditPatch) => void | Promise<void>;
  submitting?: boolean;

  /** Currently picked owner (null → clear-on-submit). */
  ownerValue: MassEditPickerValue;
  onOwnerPick: () => void;
  onOwnerClear: () => void;

  /** Currently picked project (null → clear-on-submit). */
  projectValue: MassEditPickerValue;
  onProjectPick: () => void;
  onProjectClear: () => void;

  /** i18n strings — consuming page supplies them. */
  labels: {
    title: string;
    subtitle?: string;
    ownerLabel: string;
    projectLabel: string;
    descriptionLabel: string;
    ownerPlaceholder?: string;
    projectPlaceholder?: string;
    descriptionPlaceholder?: string;
    apply: string;
    cancel: string;
    hint?: string;
  };

  /** Hide the project row entirely — used for entities whose backend
   *  schema lacks `projectId` (PriceList, Payroll, ServiceRequest).
   *  Project picker callbacks become inert when this is true. */
  hideProject?: boolean;
  /** Hide the owner row — rare, but mirrors hideProject for entities
   *  without ownerId. */
  hideOwner?: boolean;

  testId?: string;
}

export function MassEditModal({
  open,
  onOpenChange,
  selectedCount,
  onSubmit,
  submitting,
  hideOwner = false,
  hideProject = false,
  ownerValue,
  onOwnerPick,
  onOwnerClear,
  projectValue,
  onProjectPick,
  onProjectClear,
  labels,
  testId = 'mass-edit-modal',
}: MassEditModalProps) {
  const [editOwner, setEditOwner] = React.useState(false);
  const [editProject, setEditProject] = React.useState(false);
  const [editDescription, setEditDescription] = React.useState(false);
  const [description, setDescription] = React.useState('');

  // Reset rows whenever the modal re-opens so a stale tick from a
  // previous open doesn't get silently re-submitted.
  React.useEffect(() => {
    if (open) {
      setEditOwner(false);
      setEditProject(false);
      setEditDescription(false);
      setDescription('');
    }
  }, [open]);

  const handleSubmit = async () => {
    const patch: MassEditPatch = {};
    if (editOwner) patch.ownerId = ownerValue?.id ?? null;
    if (editProject) patch.projectId = projectValue?.id ?? null;
    if (editDescription) patch.description = description.trim() === '' ? null : description;
    await onSubmit(patch);
  };

  const canApply = (editOwner || editProject || editDescription) && !submitting;

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={labels.title}
      description={labels.subtitle ?? `${selectedCount}`}
      widthClass="w-[520px]"
      testId={testId}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            {labels.cancel}
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={!canApply}
            data-test-id={`${testId}-apply`}
          >
            {labels.apply}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {labels.hint ? <p className="text-xs text-[var(--ms-text-muted)]">{labels.hint}</p> : null}

        {hideOwner ? null : (
          <MassEditRow
            checked={editOwner}
            onCheckedChange={setEditOwner}
            label={labels.ownerLabel}
            testId={`${testId}-row-owner`}
          >
            <CatalogPickerField
              value={ownerValue}
              placeholder={labels.ownerPlaceholder ?? '—'}
              onPick={onOwnerPick}
              onClear={onOwnerClear}
              disabled={!editOwner}
              testId={`${testId}-owner-field`}
            />
          </MassEditRow>
        )}

        {hideProject ? null : (
          <MassEditRow
            checked={editProject}
            onCheckedChange={setEditProject}
            label={labels.projectLabel}
            testId={`${testId}-row-project`}
          >
            <CatalogPickerField
              value={projectValue}
              placeholder={labels.projectPlaceholder ?? '—'}
              onPick={onProjectPick}
              onClear={onProjectClear}
              disabled={!editProject}
              testId={`${testId}-project-field`}
            />
          </MassEditRow>
        )}

        <MassEditRow
          checked={editDescription}
          onCheckedChange={setEditDescription}
          label={labels.descriptionLabel}
          testId={`${testId}-row-description`}
        >
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={labels.descriptionPlaceholder ?? ''}
            disabled={!editDescription}
            rows={3}
            maxLength={4096}
            data-test-id={`${testId}-description-field`}
          />
        </MassEditRow>
      </div>
    </Modal>
  );
}

interface MassEditRowProps {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  label: string;
  testId: string;
  children: React.ReactNode;
}

function MassEditRow({ checked, onCheckedChange, label, testId, children }: MassEditRowProps) {
  return (
    <div className="grid grid-cols-[auto_140px_1fr] items-center gap-3" data-test-id={testId}>
      <Checkbox
        checked={checked}
        onCheckedChange={(next) => onCheckedChange(next === true)}
        data-test-id={`${testId}-toggle`}
      />
      <span className="text-sm text-[var(--ms-text-primary)]">{label}</span>
      <div>{children}</div>
    </div>
  );
}
