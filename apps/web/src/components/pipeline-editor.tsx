'use client';

import { Button, Icons, Input, NativeSelect } from '@moysklad/ui';
import { useTranslations } from 'next-intl';

export type StageDraft = {
  id?: string;
  name: string;
  type: 'open' | 'won' | 'lost';
  probability: number;
  color: string | null;
};

export interface PipelineEditorProps {
  stages: StageDraft[];
  onChange: (stages: StageDraft[]) => void;
}

const SELECT_CLASS =
  'w-full h-9 px-3 text-sm bg-[var(--ms-bg-surface)] border border-[var(--ms-border-default)] rounded-[var(--ms-radius-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ms-border-focus)] focus-visible:ring-offset-1 hover:border-[var(--ms-border-strong)]';

const STAGE_TYPES: StageDraft['type'][] = ['open', 'won', 'lost'];

const PRESET_COLORS = [
  '#94A3B8',
  '#3B82F6',
  '#F59E0B',
  '#8B5CF6',
  '#10B981',
  '#EF4444',
  '#0EA5E9',
  '#EC4899',
  '#14B8A6',
  '#F97316',
];

function newDefaultStage(): StageDraft {
  const c = PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)] ?? null;
  return { name: '', type: 'open', probability: 50, color: c };
}

export function PipelineEditor({ stages, onChange }: PipelineEditorProps) {
  const t = useTranslations('pages.pipelines');
  const tCommon = useTranslations('common');

  const update = (idx: number, patch: Partial<StageDraft>) => {
    const next = stages.slice();
    const stage = next[idx];
    if (!stage) return;
    next[idx] = { ...stage, ...patch };
    onChange(next);
  };

  const remove = (idx: number) => {
    const next = stages.slice();
    next.splice(idx, 1);
    onChange(next);
  };

  const move = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= stages.length) return;
    const next = stages.slice();
    const a = next[idx];
    const b = next[target];
    if (!a || !b) return;
    next[idx] = b;
    next[target] = a;
    onChange(next);
  };

  const add = () => {
    onChange([...stages, newDefaultStage()]);
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[2fr_1fr_120px_140px_auto_auto] gap-2 px-3 py-1 font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
        <span>{t('stage.name')}</span>
        <span>{t('stage.type')}</span>
        <span>{t('stage.probability')}</span>
        <span>{t('stage.color')}</span>
        <span />
        <span />
      </div>

      {stages.map((s, idx) => (
        <div
          key={s.id ?? `new-${idx}`}
          className="grid grid-cols-[2fr_1fr_120px_140px_auto_auto] items-center gap-2"
          data-test-id={`stage-row-${idx}`}
        >
          <Input
            value={s.name}
            onChange={(e) => update(idx, { name: e.target.value })}
            placeholder={t('stage_name_placeholder')}
            data-test-id={`stage-name-${idx}`}
          />
          <NativeSelect
            value={s.type}
            onChange={(e) => update(idx, { type: e.target.value as StageDraft['type'] })}
            className={SELECT_CLASS}
            data-test-id={`stage-type-${idx}`}
          >
            {STAGE_TYPES.map((tt) => (
              <option key={tt} value={tt}>
                {t(`stage_types.${tt}`)}
              </option>
            ))}
          </NativeSelect>
          <Input
            type="number"
            min={0}
            max={100}
            value={s.probability}
            onChange={(e) => update(idx, { probability: Number(e.target.value) })}
            data-test-id={`stage-prob-${idx}`}
          />
          <div className="flex items-center gap-1">
            <Input
              type="color"
              value={s.color ?? '#94A3B8'}
              onChange={(e) => update(idx, { color: e.target.value })}
              className="!h-9 !w-12 !p-1 cursor-pointer"
              data-test-id={`stage-color-${idx}`}
            />
            <Input
              type="text"
              value={s.color ?? ''}
              onChange={(e) => update(idx, { color: e.target.value || null })}
              placeholder="#3B82F6"
              className="flex-1 text-xs tabular-nums"
            />
          </div>
          <div className="flex gap-1">
            <Button
              type="button"
              size="sm"
              variant="tertiary"
              onClick={() => move(idx, -1)}
              disabled={idx === 0}
              aria-label={tCommon('move_up')}
              data-test-id={`stage-up-${idx}`}
            >
              ↑
            </Button>
            <Button
              type="button"
              size="sm"
              variant="tertiary"
              onClick={() => move(idx, 1)}
              disabled={idx === stages.length - 1}
              aria-label={tCommon('move_down')}
              data-test-id={`stage-down-${idx}`}
            >
              ↓
            </Button>
          </div>
          <Button
            type="button"
            size="sm"
            variant="tertiary"
            onClick={() => remove(idx)}
            disabled={stages.length === 1}
            aria-label={tCommon('delete_row')}
            data-test-id={`stage-remove-${idx}`}
          >
            <Icons.delete className="h-4 w-4" />
          </Button>
        </div>
      ))}

      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={add}
        disabled={stages.length >= 20}
        data-test-id="add-stage"
      >
        <Icons.create className="h-4 w-4" />
        {t('add_stage')}
      </Button>
    </div>
  );
}
