'use client';

/**
 * §3.5 — «BUGUNGI QO'NG'IROQLAR».
 *
 * Faqat keyingi aloqa sanasi bugunga to'g'ri keladigan mijozlar (manbasidan
 * qat'i nazar — operator yozganmi yoki kassir §3.3 da qarz berishda yozganmi).
 * Soat bo'yicha O'SISH tartibida (eng erta vaqt yuqorida) — server shunday
 * qaytaradi.
 *
 * Muddati o'tib ketganlar ham ro'yxatda turadi va QIZIL bilan ajratiladi
 * (TZ: «Muddati o'tib ketgan qo'ng'iroqlar ro'yxatda rangda ajratib ko'rsatiladi»).
 *
 * Operator qo'ng'iroq qilib bo'lgach, ALOHIDA SAHIFAGA O'TMASDAN shu yerdan
 * yangi izoh + keyingi sanani kiritadi — TZ ning aniq talabi.
 */

import { CallOutcomeModal } from '@/components/debts/call-outcome-modal';
import { useBackspaceBack } from '@/hooks/use-keyboard-nav';
import { useReturnToRow } from '@/hooks/use-list-memory';
import { DEBT_POLL_MS, type DebtRow, debtApi, todayAt9InputValue } from '@/lib/debt-api';
import {
  Badge,
  Button,
  Container,
  EmptyState,
  Input,
  Modal,
  PageHeader,
  Textarea,
  formatMoney,
} from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useCallback, useState } from 'react';

export default function DebtCallsPage() {
  const t = useTranslations('pages.debts');
  // Backspace → orqaga («Ro'yxatga qaytish» bosmasdan; matn maydonlarida ishlamaydi).
  useBackspaceBack();
  const qc = useQueryClient();

  const [active, setActive] = useState<DebtRow | null>(null);
  const [callTarget, setCallTarget] = useState<DebtRow | null>(null);
  const [text, setText] = useState('');
  const [nextAt, setNextAt] = useState('');
  const [error, setError] = useState<string | null>(null);

  const calls = useQuery({
    queryKey: ['debts', 'calls'],
    queryFn: () => debtApi.todayCalls(),
    // §3.8 — mijoz kassada to'lasa, qator ro'yxatdan o'zi yo'qoladi va operator
    // bekorga qo'ng'iroq qilmaydi.
    refetchInterval: DEBT_POLL_MS,
  });

  const saveNote = useMutation({
    mutationFn: (v: { id: string; text: string; nextContactAt: string | null }) =>
      debtApi.addNote(v.id, { text: v.text, nextContactAt: v.nextContactAt }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['debts'] });
      close();
    },
    onError: (e: Error) => setError(e.message),
  });

  function open(row: DebtRow) {
    setActive(row);
    setText('');
    setNextAt(todayAt9InputValue());
    setError(null);
  }
  function close() {
    setActive(null);
    setError(null);
  }

  const rows = calls.data?.rows ?? [];

  // Kartochkadan qaytganda — oxirgi ochilgan qatorga surish + yoritish
  // (2026-07-13: navbat yo'qolmasin, «kimga telefon qilayotgandim?»).
  const { remember, highlightId } = useReturnToRow(
    'debts-calls',
    Boolean(calls.data),
    useCallback((id: string) => `[data-test-id="call-row-${id}"]`, []),
  );

  return (
    <Container size="full">
      <PageHeader
        title={t('tab_calls')}
        subtitle={t('subtitle')}
        actions={
          <Button variant="secondary" asChild>
            <Link href="/debts">{t('back_to_list')}</Link>
          </Button>
        }
      />

      {rows.length === 0 && !calls.isLoading ? (
        <EmptyState title={t('empty_calls')} />
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((r) => (
            <div
              key={r.id}
              data-test-id={`call-row-${r.id}`}
              className={[
                'flex flex-wrap items-center gap-4 rounded-[var(--ms-radius-default)] border p-3',
                // §3.5 — muddati o'tgan qator QIZIL ramka + fon bilan ajraladi.
                r.overdue
                  ? 'border-[var(--ms-destructive-200)] bg-[var(--ms-destructive-50)]'
                  : 'border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)]',
                // Orqaga qaytilgan qator — qisqa vaqt sariq bilan yoritiladi.
                r.id === highlightId
                  ? 'ring-2 ring-[var(--ms-warning-400)] transition-shadow duration-500'
                  : '',
              ].join(' ')}
            >
              {/* Qo'ng'iroq vaqti */}
              <div className="w-[92px] shrink-0 font-semibold tabular-nums">
                {r.nextContactAt
                  ? new Date(r.nextContactAt).toLocaleTimeString('ru-RU', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : '—'}
                {r.overdue && (
                  <Badge tone="destructive" className="mt-1 block w-fit">
                    {t('badge_overdue')}
                  </Badge>
                )}
              </div>

              {/* Mijoz + telefon */}
              <div className="min-w-[180px] flex-1">
                <Link
                  href={`/debts/${r.id}`}
                  onClick={() => remember(r.id)}
                  className="font-medium text-[var(--ms-text-brand)] hover:underline"
                >
                  {r.counterpartyName ?? '—'}
                </Link>
                <div className="text-[var(--ms-text-secondary)] text-sm tabular-nums">
                  {r.phone ?? '—'}
                </div>
              </div>

              {/* Oxirgi izoh */}
              <div className="min-w-[200px] flex-[2] text-[var(--ms-text-secondary)] text-sm">
                {r.lastNote ?? '—'}
              </div>

              {/* Qolgan qarz */}
              <div className="w-[150px] shrink-0 text-right">
                <div className="font-semibold tabular-nums">
                  {formatMoney(r.remainingMinor, r.currency)}
                </div>
                <div className="text-[var(--ms-text-secondary)] text-xs">
                  {t('remaining_label')}
                </div>
              </div>

              {/* «Qo'ng'iroq qilindi» — natija tugmasi (2026-07-12); eski izoh
                  modali ham qoladi (natijasiz oddiy izoh uchun). */}
              <Button size="sm" onClick={() => setCallTarget(r)} data-test-id={`call-mark-${r.id}`}>
                📞 {t('call_button')}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => open(r)}
                data-test-id={`call-note-${r.id}`}
              >
                {t('note_save')}
              </Button>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={active !== null}
        onOpenChange={(o) => !o && close()}
        title={`${t('section_notes')} — ${active?.counterpartyName ?? ''}`}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={close}>
              {t('cancel')}
            </Button>
            <Button
              loading={saveNote.isPending}
              disabled={text.trim().length === 0}
              onClick={() =>
                active &&
                saveNote.mutate({
                  id: active.id,
                  text: text.trim(),
                  nextContactAt: nextAt ? new Date(nextAt).toISOString() : null,
                })
              }
              data-test-id="call-note-save"
            >
              {t('note_save')}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('note_placeholder')}
            rows={4}
            data-test-id="call-note-text"
          />
          <div>
            <div className="mb-1 text-[var(--ms-text-secondary)] text-sm">
              {t('field_next_contact')}
            </div>
            {/* TZ §3.4: sana VA ANIQ VAQT — shuning uchun datetime-local
                (DatePicker faqat sanani beradi, vaqtni emas). */}
            <Input
              type="datetime-local"
              value={nextAt}
              onChange={(e) => setNextAt(e.target.value)}
              data-test-id="call-note-next"
            />
          </div>
          {error && <div className="text-[var(--ms-text-destructive)] text-sm">{error}</div>}
        </div>
      </Modal>

      {/* «Qo'ng'iroq qilindi» — natija modali (umumiy komponent) */}
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
