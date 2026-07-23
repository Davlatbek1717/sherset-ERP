'use client';

import { useApiMutation } from '@/hooks/use-api-mutation';
import { api } from '@/lib/api-client';
import { Badge, Button, NativeSelect, formatMoney } from '@moysklad/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

type StageType = 'open' | 'won' | 'lost';

interface OppCard {
  id: string;
  number: string;
  name: string;
  amount: string;
  currency: string;
  status: StageType;
  expectedCloseDate: string | null;
  counterparty: { id: string; name: string } | null;
  contactPerson: { id: string; name: string } | null;
  owner: { id: string; name: string } | null;
}

interface BoardStage {
  id: string;
  name: string;
  type: StageType;
  color: string | null;
  probability: number;
  position: number;
  opportunities: OppCard[];
}

interface BoardResponse {
  pipeline: { id: string; name: string; isDefault: boolean };
  stages: BoardStage[];
}

interface PipelineRef {
  id: string;
  name: string;
  isDefault: boolean;
}

const SELECT_CLASS =
  'h-9 px-3 text-sm bg-[var(--ms-bg-surface)] border border-[var(--ms-border-default)] rounded-[var(--ms-radius-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ms-border-focus)] focus-visible:ring-offset-1 hover:border-[var(--ms-border-strong)]';

function formatDateOnly(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
  });
}

function stageTotal(stage: BoardStage): { count: number; amount: bigint; currency: string } {
  let amount = 0n;
  let currency = 'UZS';
  for (const o of stage.opportunities) {
    amount += BigInt(o.amount);
    currency = o.currency;
  }
  return { count: stage.opportunities.length, amount, currency };
}

export default function OpportunityBoardPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const t = useTranslations('pages.opportunities');
  const tCommon = useTranslations('common');
  const [pipelineId, setPipelineId] = useState<string>('');
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [hoverStageId, setHoverStageId] = useState<string | null>(null);

  const { data: pipelinesData } = useQuery<{ items: PipelineRef[] }>({
    queryKey: ['pipelines-active'],
    queryFn: () => api.get<{ items: PipelineRef[] }>('/pipelines?archived=false&limit=50'),
  });

  const boardKey = ['opportunity-board', pipelineId] as const;
  const { data, isLoading, error } = useQuery<BoardResponse>({
    queryKey: boardKey,
    queryFn: () => {
      const q = pipelineId ? `?pipelineId=${pipelineId}` : '';
      return api.get<BoardResponse>(`/opportunities/board${q}`);
    },
  });

  const transitionMut = useApiMutation({
    mutationFn: ({ id, stageId }: { id: string; stageId: string }) =>
      api.post<unknown>(`/opportunities/${id}/transition`, { stageId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['opportunity-board'] });
      qc.invalidateQueries({ queryKey: ['opportunities'] });
    },
  });

  const handleDrop = (stageId: string) => {
    if (!draggingId) return;
    transitionMut.mutate({ id: draggingId, stageId });
    setDraggingId(null);
    setHoverStageId(null);
  };

  return (
    <div data-test-id="opportunities-board-page" className="flex h-[calc(100vh-7rem)] flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 px-6 pt-6 pb-4">
        <div className="flex items-center gap-3">
          <h1 className="font-semibold text-2xl tracking-tight">{t('board_title')}</h1>
          {data && (
            <Badge tone="neutral">
              {tCommon('records_count', {
                count: data.stages.reduce((sum, s) => sum + s.opportunities.length, 0),
              })}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3">
          <NativeSelect
            value={pipelineId}
            onChange={(e) => setPipelineId(e.target.value)}
            className={SELECT_CLASS}
            data-test-id="field-pipeline"
          >
            <option value="">{tCommon('default')}</option>
            {pipelinesData?.items?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.isDefault ? ` (${tCommon('default')})` : ''}
              </option>
            ))}
          </NativeSelect>
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              router.push('/opportunities/new');
            }}
          >
            {t('create_button')}
          </Button>
        </div>
      </header>

      {isLoading && (
        <div className="px-6 py-8 text-[var(--ms-text-muted)] text-sm">{tCommon('loading')}</div>
      )}
      {error && (
        <div className="px-6 py-8 text-[var(--ms-text-danger)] text-sm">
          {(error as Error).message}
        </div>
      )}

      {data && (
        <div className="min-h-0 flex-1 overflow-x-auto px-6 pb-6">
          <div className="flex h-full gap-3" style={{ minWidth: `${data.stages.length * 280}px` }}>
            {data.stages.map((stage) => {
              const totals = stageTotal(stage);
              const isHover = hoverStageId === stage.id;
              return (
                <div
                  key={stage.id}
                  className={`flex w-[270px] flex-shrink-0 flex-col rounded-[var(--ms-radius-default)] border ${
                    isHover
                      ? 'border-[var(--ms-border-focus)] bg-[var(--ms-bg-muted)]'
                      : 'border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)]'
                  }`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setHoverStageId(stage.id);
                  }}
                  onDragLeave={() => setHoverStageId((s) => (s === stage.id ? null : s))}
                  onDrop={(e) => {
                    e.preventDefault();
                    handleDrop(stage.id);
                  }}
                  data-test-id={`board-column-${stage.id}`}
                >
                  <div
                    className="sticky top-0 z-10 border-[var(--ms-border-default)] border-b px-3 py-2"
                    style={{
                      borderTop: stage.color ? `3px solid ${stage.color}` : undefined,
                      backgroundColor: 'var(--ms-bg-surface)',
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="truncate font-medium text-sm">{stage.name}</h2>
                      <span className="text-[var(--ms-text-muted)] text-[12px] tabular-nums">
                        {totals.count}
                      </span>
                    </div>
                    <div className="text-[var(--ms-text-muted)] text-[12px] tabular-nums">
                      {formatMoney(totals.amount, totals.currency)}
                    </div>
                  </div>

                  <div className="flex-1 space-y-2 overflow-y-auto px-2 py-2">
                    {stage.opportunities.map((o) => (
                      <a
                        key={o.id}
                        href={`/opportunities/${o.id}`}
                        draggable
                        onDragStart={() => setDraggingId(o.id)}
                        onDragEnd={() => setDraggingId(null)}
                        className={`block cursor-grab rounded-[var(--ms-radius-default)] border bg-[var(--ms-bg-surface)] p-3 transition-shadow hover:border-[var(--ms-border-strong)] hover:shadow-sm ${
                          draggingId === o.id ? 'opacity-50' : ''
                        }`}
                        data-test-id={`board-card-${o.id}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-[var(--ms-text-muted)] text-[12px] tabular-nums">
                            {o.number}
                          </span>
                          <span className="font-medium text-sm tabular-nums">
                            {formatMoney(BigInt(o.amount), o.currency)}
                          </span>
                        </div>
                        <h3 className="mt-1 line-clamp-2 font-medium text-sm">{o.name}</h3>
                        {o.counterparty && (
                          <div className="mt-1 truncate text-[var(--ms-text-muted)] text-[11px]">
                            {o.counterparty.name}
                          </div>
                        )}
                        <div className="mt-2 flex items-center gap-2 text-[var(--ms-text-muted)] text-xs">
                          {o.expectedCloseDate && (
                            <span className="tabular-nums">
                              {formatDateOnly(o.expectedCloseDate)}
                            </span>
                          )}
                          {o.owner && (
                            <span className="ml-auto max-w-[100px] truncate">{o.owner.name}</span>
                          )}
                        </div>
                      </a>
                    ))}
                    {stage.opportunities.length === 0 && (
                      <div className="px-1 py-3 text-center text-[var(--ms-text-muted)] text-xs italic">
                        {t('empty_title')}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
