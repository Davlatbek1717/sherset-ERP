'use client';

/**
 * «MUAMMOLI QARZDORLAR» (2026-07-14 talab).
 *
 * Operator qo'ng'iroq natijasini belgilaganda mijozni «muammoli» deb ajratib
 * qo'yadi (telefonni ko'tarmaydi, va'da berib bermaydi, janjal qiladi…) va
 * SABAB bilan QAYTA QO'NG'IROQ SANASINI yozadi. Shundan keyin mijoz shu
 * sahifada to'planadi.
 *
 * NEGA ALOHIDA SAHIFA: 587 qarzdor orasida eng og'irlari ko'zdan yo'qoladi.
 * Bu yerda ular ajratib qo'yiladi — boshliq ham, operator ham bir qarashda
 * ko'radi: kim, nega muammoli, qachon qayta qo'ng'iroq qilish kerak.
 *
 * Har qatorda:
 *   • SABAB — nima muammo (keyingi operator o'qib, tayyor bo'lib qo'ng'iroq qiladi)
 *   • QAYTA QO'NG'IROQ SANASI — muddati o'tgan bo'lsa QIZIL bilan ajraladi
 *   • 📞 tugma — qo'ng'iroq natijasini belgilash (odatiy modal)
 *   • ✅ tugma — muammo hal bo'ldi, ro'yxatdan chiqarish
 */

import { CallOutcomeModal } from '@/components/debts/call-outcome-modal';
import { StatusLegend } from '@/components/debts/status-legend';
import { useBackspaceBack } from '@/hooks/use-keyboard-nav';
import { useReturnToRow } from '@/hooks/use-list-memory';
import { DEBT_POLL_MS, type DebtRow, debtApi } from '@/lib/debt-api';
import {
  Badge,
  Button,
  Container,
  EmptyState,
  PageHeader,
  formatMoney,
  useToast,
} from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useCallback, useState } from 'react';

export default function DebtProblemsPage() {
  const t = useTranslations('pages.debts');
  useBackspaceBack();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [callTarget, setCallTarget] = useState<DebtRow | null>(null);

  const list = useQuery({
    queryKey: ['debts', 'problems'],
    queryFn: () => debtApi.list({ scope: 'problem', limit: 200 }),
    // Boshqa operator muammoni yopsa — ro'yxat o'zi yangilanadi.
    refetchInterval: DEBT_POLL_MS,
  });

  const resolve = useMutation({
    mutationFn: (id: string) => debtApi.setProblem(id, { problem: false }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['debts'] });
      toast.success(t('problem_resolve'));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = list.data?.rows ?? [];

  const { remember, highlightId } = useReturnToRow(
    'debts-problems',
    Boolean(list.data),
    useCallback((id: string) => `[data-test-id="problem-row-${id}"]`, []),
  );

  const when = (iso: string) =>
    new Date(iso).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  return (
    <Container size="full">
      <PageHeader
        title={t('problems_title')}
        subtitle={t('problems_subtitle')}
        actions={
          <Button variant="secondary" asChild>
            <Link href="/debts">{t('back_to_list')}</Link>
          </Button>
        }
      />

      {/* Jami — boshliq bir qarashda ko'rsin */}
      {rows.length > 0 && (
        <div className="mb-4 inline-flex items-center gap-2 rounded-[var(--ms-radius-default)] border border-[var(--ms-row-unpaid-accent)] bg-[var(--ms-row-unpaid-bg)] px-4 py-2">
          <span className="font-semibold text-lg tabular-nums" data-test-id="problems-total">
            {rows.length}
          </span>
          <span className="text-[var(--ms-text-secondary)] text-sm">{t('kpi_problem')}</span>
          <span className="ml-3 font-semibold tabular-nums">
            {formatMoney(
              rows.reduce((a, r) => a + BigInt(r.remainingMinor), 0n).toString(),
              rows[0]?.currency,
            )}
          </span>
        </div>
      )}

      <StatusLegend items={['not_paid', 'partial', 'callback']} />

      {rows.length === 0 && !list.isLoading ? (
        <EmptyState title={t('problems_empty')} />
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((r) => (
            <div
              key={r.id}
              data-test-id={`problem-row-${r.id}`}
              className={[
                'rounded-[var(--ms-radius-default)] border border-l-[3px] p-3',
                // Muammoli — doim qizil chap chiziq; muddati o'tgan bo'lsa fon ham
                r.overdue
                  ? 'border-[var(--ms-row-unpaid-accent)] border-l-[var(--ms-row-unpaid-accent)] bg-[var(--ms-row-unpaid-bg)]'
                  : 'border-[var(--ms-border-default)] border-l-[var(--ms-row-unpaid-accent)] bg-[var(--ms-bg-surface)]',
                r.id === highlightId
                  ? 'ring-2 ring-[var(--ms-warning-500)] transition-shadow duration-500'
                  : '',
              ].join(' ')}
            >
              <div className="flex flex-wrap items-start gap-4">
                {/* Mijoz + telefon */}
                <div className="min-w-[190px] flex-1">
                  <Link
                    href={`/debts/${r.id}`}
                    onClick={() => remember(r.id)}
                    className="font-medium text-[var(--ms-text-brand)] hover:underline"
                  >
                    {r.counterpartyName ?? r.name}
                  </Link>
                  <div className="text-[var(--ms-text-secondary)] text-sm tabular-nums">
                    {r.phone ?? '—'}
                  </div>
                </div>

                {/* Qoldiq */}
                <div className="w-[150px] shrink-0 text-right">
                  <div className="font-semibold tabular-nums">
                    {formatMoney(r.remainingMinor, r.currency)}
                  </div>
                  <div className="text-[var(--ms-text-secondary)] text-xs">
                    {t('remaining_label')}
                  </div>
                </div>

                {/* Qayta qo'ng'iroq sanasi — muddati o'tgan bo'lsa qizil belgi */}
                <div className="w-[170px] shrink-0">
                  <div className="text-[var(--ms-text-muted)] text-xs">
                    {t('field_next_contact')}
                  </div>
                  <div className="tabular-nums">
                    {r.nextContactAt ? when(r.nextContactAt) : '—'}
                  </div>
                  {r.overdue && (
                    <Badge tone="destructive" className="mt-1 w-fit">
                      {t('badge_overdue')}
                    </Badge>
                  )}
                </div>

                {/* Amallar */}
                <div className="flex shrink-0 flex-col gap-1.5">
                  <Button size="sm" onClick={() => setCallTarget(r)} data-test-id={`pcall-${r.id}`}>
                    📞 {t('call_button')}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={resolve.isPending && resolve.variables === r.id}
                    onClick={() => {
                      if (window.confirm(t('problem_resolve_confirm'))) resolve.mutate(r.id);
                    }}
                    data-test-id={`presolve-${r.id}`}
                  >
                    {t('problem_resolve')}
                  </Button>
                </div>
              </div>

              {/* SABAB — eng muhim ma'lumot, alohida qatorda ko'zga tashlansin */}
              <div className="mt-2 rounded-[var(--ms-radius-sm)] bg-[var(--ms-bg-muted)] px-2.5 py-1.5 text-sm">
                <span className="font-medium text-[var(--ms-text-muted)] text-xs">
                  {t('problem_reason')}:{' '}
                </span>
                {r.problemReason ?? '—'}
                {r.problemAt && (
                  <span className="ml-2 text-[var(--ms-text-muted)] text-xs tabular-nums">
                    · {t('problem_since')}: {when(r.problemAt)}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {callTarget && (
        <CallOutcomeModal
          debtId={callTarget.id}
          debtorName={callTarget.counterpartyName ?? callTarget.name}
          remainingMinor={callTarget.remainingMinor}
          open={callTarget !== null}
          onClose={() => setCallTarget(null)}
        />
      )}
    </Container>
  );
}
