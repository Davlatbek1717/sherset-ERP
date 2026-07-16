'use client';
import { TelegramChatCard } from '@/components/counterparties/telegram-chat-card';
import { CallOutcomeForm } from '@/components/debts/call-outcome-modal';
import { CancelCallModal } from '@/components/debts/cancel-call-modal';
import { ReceiptViewer } from '@/components/debts/receipt-viewer';
import { ReversePaymentModal } from '@/components/debts/reverse-payment-modal';
import { useBackspaceBack } from '@/hooks/use-keyboard-nav';
import {
  DEBT_POLL_MS,
  type DebtNoteRow,
  type DebtPaymentRow,
  debtApi,
  todayAt9InputValue,
} from '@/lib/debt-api';
import {
  Badge,
  Button,
  Container,
  EmptyState,
  Input,
  PageHeader,
  StatCard,
  Textarea,
  formatMoney,
} from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';

/** Bo'limlarni vizual ajratuvchi kartochka (§3.2 — «vizual va funksional jihatdan ajratilgan»). */
function Section({
  title,
  tone,
  children,
  testId,
}: {
  title: string;
  tone: 'notes' | 'cash' | 'card';
  children: React.ReactNode;
  testId: string;
}) {
  const border =
    tone === 'cash'
      ? 'border-l-4 border-l-[var(--ms-success-500)]'
      : tone === 'card'
        ? 'border-l-4 border-l-[var(--ms-info-500)]'
        : 'border-l-4 border-l-[var(--ms-border-strong)]';
  return (
    <section
      data-test-id={testId}
      className={`rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-4 ${border}`}
    >
      <h2 className="mb-3 font-semibold text-sm">{title}</h2>
      {children}
    </section>
  );
}

/**
 * Bitta KANALDAGI to'lovlar ro'yxati (2026-07-13 talab).
 *
 * Naqd bo'limida — naqd to'lovlar, Click bo'limida — Click to'lovlari.
 * Dollarda berilgan naqd uchun asl summa ($) va KURS ham ko'rsatiladi:
 * so'mdagi qiymat qanday chiqqani ko'rinib tursin.
 */
function PaymentLines({
  payments,
  currency,
  emptyLabel,
  testPrefix,
  onOpenReceipt,
  onReverse,
}: {
  payments: DebtPaymentRow[];
  currency: string;
  emptyLabel: string;
  testPrefix: string;
  /** Chekni modal oynada ochadi (havola 401 berardi — token yuborilmasdi). */
  onOpenReceipt: (attachmentId: string) => void;
  /** STORNO (2026-07-16) — «Qaytarish» modalini ochadi. */
  onReverse: (payment: DebtPaymentRow) => void;
}) {
  const t = useTranslations('pages.debts');

  if (payments.length === 0) {
    return (
      <div
        className="rounded-[var(--ms-radius-sm)] bg-[var(--ms-bg-muted)] p-2 text-center text-[var(--ms-text-muted)] text-xs"
        data-test-id={`${testPrefix}-payments-empty`}
      >
        {emptyLabel}
      </div>
    );
  }

  const fmtUsd = (cents: string) => `${(Number(cents) / 100).toFixed(2)} $`;
  // Kurs DB'da ×10000 saqlanadi (12 800,50 so'm → 128 005 000).
  const fmtRate = (rate: string) => (Number(rate) / 10_000).toLocaleString('ru-RU');

  return (
    <div className="flex flex-col gap-1.5" data-test-id={`${testPrefix}-payments`}>
      {payments.map((p) => (
        <div
          key={p.id}
          data-test-id={`${testPrefix}-payment-${p.id}`}
          className={`rounded-[var(--ms-radius-sm)] border px-2.5 py-2 text-xs ${
            p.reversedAt
              ? // QAYTARILGAN to'lov — xira va qizil hoshiyali: hisobga kirmasligi
                // bir qarashda ko'rinsin, lekin tarixdan yo'qolmasin.
                'border-[var(--ms-destructive-300)] bg-[var(--ms-bg-muted)] opacity-75'
              : 'border-[var(--ms-border-default)] bg-[var(--ms-bg-muted)]'
          }`}
        >
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span
              className={`font-semibold text-sm tabular-nums ${p.reversedAt ? 'line-through' : ''}`}
            >
              {formatMoney(p.amountMinor, currency)}
            </span>
            <span className="text-[var(--ms-text-secondary)] tabular-nums">
              {new Date(p.createdAt).toLocaleString('ru-RU', {
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
            {p.receivedByName && (
              <span className="text-[var(--ms-text-secondary)]">· {p.receivedByName}</span>
            )}
            {p.reversedAt ? (
              <Badge tone="destructive">{t('reversed_badge')}</Badge>
            ) : (
              // STORNO tugmasi — kichik va chetda: asosiy oqimga xalaqit bermaydi,
              // lekin xato summa kiritilganda darhol qo'l ostida.
              <button
                type="button"
                onClick={() => onReverse(p)}
                className="ml-auto text-[var(--ms-text-destructive)] hover:underline"
                data-test-id={`${testPrefix}-reverse-${p.id}`}
              >
                ↩︎ {t('reverse_payment')}
              </button>
            )}
          </div>

          {/* Kim, qachon va NEGA qaytargani — nizoda birinchi savol shu */}
          {p.reversedAt && (
            <div className="mt-0.5 text-[var(--ms-text-destructive)]">
              {t('reversed_badge')}: {p.reversedByName ?? '—'} ·{' '}
              {new Date(p.reversedAt).toLocaleString('ru-RU', {
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              })}
              {p.reverseReason && <> · {p.reverseReason}</>}
            </div>
          )}

          {/* DOLLARDA berilgan naqd — asl summa va kurs (so'm qayerdan chiqqani) */}
          {p.currency === 'USD' && p.amountOriginalMinor && (
            <div className="mt-0.5 text-[var(--ms-text-secondary)] tabular-nums">
              {t('payment_original')}: <b>{fmtUsd(p.amountOriginalMinor)}</b>
              {p.exchangeRate && (
                <>
                  {' · '}
                  {t('payment_rate')}: <b>{fmtRate(p.exchangeRate)}</b>
                </>
              )}
            </div>
          )}

          {p.comment && <div className="mt-0.5 text-[var(--ms-text-secondary)]">{p.comment}</div>}

          {/* Click cheki — MODAL oynada ochiladi (2026-07-14).
              Ilgari bu oddiy <a href> edi va 401 qaytarardi: rasm API'si token
              talab qiladi, havola esa uni yubormaydi ⇒ chek umuman ochilmasdi. */}
          {p.attachmentId && (
            <button
              type="button"
              onClick={() => onOpenReceipt(p.attachmentId as string)}
              className="mt-0.5 inline-block text-[var(--ms-text-brand)] hover:underline"
              data-test-id={`${testPrefix}-shot-${p.id}`}
            >
              🧾 {t('view_screenshot')}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export default function DebtProfilePage() {
  const t = useTranslations('pages.debts');
  // Backspace → orqaga («Ro'yxatga qaytish» bosmasdan; matn maydonlarida ishlamaydi).
  useBackspaceBack();
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();

  const debt = useQuery({
    queryKey: ['debts', 'detail', id],
    queryFn: () => debtApi.get(id),
    refetchInterval: DEBT_POLL_MS,
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['debts'] });

  // ── 1) Izoh / qo'ng'iroq (§3.4) ───────────────────────────────────────────
  const [noteText, setNoteText] = useState('');
  const [noteNext, setNoteNext] = useState(todayAt9InputValue());
  // Ochilgan chek (2026-07-14) — null bo'lsa modal yopiq.
  const [receiptId, setReceiptId] = useState<string | null>(null);
  // QAYTARILAYOTGAN to'lov (storno, 2026-07-16) — null bo'lsa modal yopiq.
  const [reversing, setReversing] = useState<DebtPaymentRow | null>(null);
  // BEKOR QILINAYOTGAN qo'ng'iroq natijasi (2026-07-16) — null bo'lsa modal yopiq.
  const [cancelingNote, setCancelingNote] = useState<DebtNoteRow | null>(null);
  // «Qo'ng'iroq qilindi» natija modali (2026-07-12).
  const [noteErr, setNoteErr] = useState<string | null>(null);

  const addNote = useMutation({
    mutationFn: () =>
      debtApi.addNote(id, {
        text: noteText.trim(),
        nextContactAt: noteNext ? new Date(noteNext).toISOString() : null,
      }),
    onSuccess: () => {
      setNoteText('');
      setNoteNext(todayAt9InputValue());
      setNoteErr(null);
      invalidate();
    },
    onError: (e: Error) => setNoteErr(e.message),
  });

  // 2026-07-14: bu yerda IKKITA to'lov formasining holati va mutatsiyalari
  // (addCash / addCard) turardi. Endi to'lov QO'NG'IROQ NATIJASI formasidan
  // kiritiladi (CallOutcomeForm) — bitta joyda, bitta oqim. Server tarafdagi
  // /payments va /card-payments endpointlari o'z holicha qoladi (boshqa
  // ekranlar ishlatishi mumkin), faqat bu sahifadan chaqirilmaydi.

  const d = debt.data;
  const isPaid = d?.status === 'paid';

  // To'lovlarni KANAL bo'yicha ajratamiz (2026-07-13 talab): naqd bo'limida
  // naqd to'lovlar, Click bo'limida Click to'lovlari ko'rinsin.
  //   cash / terminal / manual_close → NAQD bo'limi
  //     (manual_close — eski «qo'ng'iroqda yopildi» yozuvlari; ular ham naqd
  //      tarafda turadi, chunki Click emas va cheki yo'q)
  //   card_screenshot                → CLICK/KARTA bo'limi
  const cashPayments = (d?.payments ?? []).filter((p) => p.method !== 'card_screenshot');
  const cardPayments = (d?.payments ?? []).filter((p) => p.method === 'card_screenshot');

  const roleLabel = (r: DebtNoteRow['authorRole']) =>
    r === 'cashier'
      ? t('author_cashier')
      : r === 'operator'
        ? t('author_operator')
        : t('author_admin');

  const kindLabel = (k: DebtNoteRow['kind']) =>
    k === 'debt_issue'
      ? t('kind_debt_issue')
      : k === 'payment'
        ? t('kind_payment')
        : t('kind_call');

  const when = (iso: string) =>
    new Date(iso).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  return (
    <Container>
      <PageHeader
        title={d?.counterpartyName ?? t('title')}
        subtitle={d ? `${d.name} · ${d.phone ?? '—'}` : undefined}
        actions={
          <Button variant="secondary" asChild>
            <Link href="/debts">{t('back_to_list')}</Link>
          </Button>
        }
      />

      {/* Qarz holati */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label={t('col_total')} value={formatMoney(d?.totalMinor ?? '0', d?.currency)} />
        <StatCard
          label={t('col_paid')}
          value={formatMoney(d?.paidMinor ?? '0', d?.currency)}
          tone="success"
        />
        <StatCard
          label={t('col_remaining')}
          value={formatMoney(d?.remainingMinor ?? '0', d?.currency)}
          tone={isPaid ? 'success' : 'destructive'}
          hint={isPaid ? t('paid_full') : undefined}
        />
      </div>

      {d?.overdue && (
        <div className="mb-4">
          <Badge tone="destructive">{t('badge_overdue')}</Badge>
        </div>
      )}

      {/* ─── §3.2: uchta ALOHIDA bo'lim ─────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* 1) Izoh / qo'ng'iroq — operator + kassir */}
        <Section title={t('section_notes')} tone="notes" testId="section-notes">
          <div className="flex flex-col gap-2">
            {/* 2026-07-14: bu yerda «📞 Qo'ng'iroq qilindi» tugmasi bor edi —
                u modal ochardi. Endi natija formasi yonma-yon TURADI, tugma
                keraksiz. Bu bo'lim faqat ERKIN IZOH uchun qoladi. */}
            <Textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder={t('note_placeholder')}
              rows={3}
              data-test-id="note-text"
            />
            <div>
              <div className="mb-1 text-[var(--ms-text-secondary)] text-xs">
                {t('field_next_contact')}
              </div>
              <Input
                type="datetime-local"
                value={noteNext}
                onChange={(e) => setNoteNext(e.target.value)}
                data-test-id="note-next"
              />
            </div>
            <Button
              loading={addNote.isPending}
              disabled={noteText.trim().length === 0}
              onClick={() => addNote.mutate()}
              data-test-id="note-save"
            >
              {t('note_save')}
            </Button>
            {noteErr && <div className="text-[var(--ms-text-destructive)] text-sm">{noteErr}</div>}
          </div>
        </Section>

        {/* ─── 2) QO'NG'IROQ NATIJASI — joyida (2026-07-14 talab) ───────────
            Ilgari bu yerda IKKITA alohida to'lov formasi turardi (kassa +
            karta), natijani belgilash uchun esa «📞 Qo'ng'iroq qilindi»
            tugmasini bosib MODAL ochish kerak edi. Ya'ni bitta suhbat uchun
            uch xil joy — operator adashardi.

            Endi hammasi BITTA formada: to'ladi / qisman / to'lamadi / qayta
            qo'ng'iroq · naqd yoki Click · summa, valyuta, kurs, chek rasmi ·
            keyingi qo'ng'iroq sanasi · muammoli mijoz belgisi.
            Qabul qilingan to'lovlar pastdagi NAQD va CLICK bo'limlarida
            ko'rinadi (o'sha yerda). */}
        <Section title={t('call_modal_title')} tone="cash" testId="section-call">
          <CallOutcomeForm
            debtId={id}
            debtorName={d?.counterpartyName ?? ''}
            remainingMinor={d?.remainingMinor}
            onSaved={invalidate}
          />
        </Section>

        {/* ─── 3) QABUL QILINGAN TO'LOVLAR ──────────────────────────────────
            Naqd va Click alohida — mijoz «men Clickda to'lagandim» desa,
            operator darhol o'sha bo'limdan tekshiradi. */}
        <Section title={t('section_payments')} tone="card" testId="section-payments">
          <div className="flex flex-col gap-3">
            <div>
              <div className="mb-1 font-medium text-[var(--ms-text-muted)] text-xs">
                {t('section_cash')}
              </div>
              <PaymentLines
                payments={cashPayments}
                currency={d?.currency ?? 'UZS'}
                emptyLabel={t('payments_empty')}
                testPrefix="cash"
                onOpenReceipt={setReceiptId}
                onReverse={setReversing}
              />
            </div>
            <div>
              <div className="mb-1 font-medium text-[var(--ms-text-muted)] text-xs">
                {t('section_card')}
              </div>
              <PaymentLines
                payments={cardPayments}
                currency={d?.currency ?? 'UZS'}
                emptyLabel={t('payments_empty')}
                testPrefix="card"
                onOpenReceipt={setReceiptId}
                onReverse={setReversing}
              />
            </div>
          </div>
        </Section>
      </div>

      {/* ─── TELEGRAM CHAT ────────────────────────────────────────────────
          Operator qo'ng'iroq qilayotganda mijoz bilan Telegram'da nima
          yozilganini SHU YERDA ko'radi: yuborilgan xabarlar, mijoz javobi va
          u yuborgan CHEK RASMI. Alohida sahifaga o'tish shart emas. */}
      {d?.counterpartyId && (
        <section className="mt-6">
          <TelegramChatCard counterpartyId={d.counterpartyId} />
        </section>
      )}

      {/* ─── Muloqot tarixi (§3.4: xronologik, oxirgisi yuqorida) ────────── */}
      <section className="mt-6">
        <h2 className="mb-2 font-semibold text-sm">{t('section_history')}</h2>
        {d && d.notes.length > 0 ? (
          <div className="flex flex-col gap-2">
            {d.notes.map((n) => (
              <div
                key={n.id}
                data-test-id={`note-${n.id}`}
                className={`rounded-[var(--ms-radius-default)] border p-3 ${
                  n.canceledAt
                    ? // BEKOR QILINGAN natija — xira va qizil hoshiyali: hisobga
                      // kirmasligi bir qarashda ko'rinsin, lekin tarixdan yo'qolmasin.
                      'border-[var(--ms-destructive-300)] bg-[var(--ms-bg-muted)] opacity-75'
                    : 'border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)]'
                }`}
              >
                <div className="mb-1 flex flex-wrap items-center gap-2 text-[var(--ms-text-secondary)] text-xs">
                  <Badge tone="neutral">{kindLabel(n.kind)}</Badge>
                  {/* §3.4 — har yozuv xodim ismi VA ROLI bilan belgilanadi */}
                  <span className="font-medium">{n.authorName ?? '—'}</span>
                  <span>· {roleLabel(n.authorRole)}</span>
                  <span className="tabular-nums">· {when(n.createdAt)}</span>
                  {n.nextContactAt && (
                    <span className="tabular-nums">
                      · {t('field_next_contact')}: {when(n.nextContactAt)}
                    </span>
                  )}
                  {n.canceledAt ? (
                    <Badge tone="destructive">{t('note_canceled_badge')}</Badge>
                  ) : (
                    n.kind === 'call' &&
                    n.outcome && (
                      // NATIJANI BEKOR QILISH (2026-07-16) — kichik va chetda:
                      // asosiy oqimga xalaqit bermaydi, xato natijada qo'l ostida.
                      <button
                        type="button"
                        onClick={() => setCancelingNote(n)}
                        className="ml-auto text-[var(--ms-text-destructive)] hover:underline"
                        data-test-id={`note-cancel-${n.id}`}
                      >
                        ↩︎ {t('cancel_call_action')}
                      </button>
                    )
                  )}
                </div>
                <div className={`text-sm ${n.canceledAt ? 'line-through' : ''}`}>{n.text}</div>
                {/* Kim, qachon va NEGA bekor qilgani — nizoda birinchi savol shu */}
                {n.canceledAt && (
                  <div className="mt-0.5 text-[var(--ms-text-destructive)] text-xs">
                    {t('note_canceled_badge')}: {n.canceledByName ?? '—'} ·{' '}
                    {new Date(n.canceledAt).toLocaleString('ru-RU', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    {n.cancelReason && <> · {n.cancelReason}</>}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title={t('note_empty')} />
        )}
      </section>
      {/* CHEK — modal oynada (havola 401 berardi, endi token bilan yuklanadi) */}
      <ReceiptViewer
        attachmentId={receiptId}
        title={d?.counterpartyName ?? undefined}
        open={receiptId !== null}
        onClose={() => setReceiptId(null)}
      />
      {/* TO'LOVNI QAYTARISH — storno (2026-07-16): sabab majburiy, tarixda qoladi */}
      <ReversePaymentModal
        debtId={id}
        payment={reversing}
        open={reversing !== null}
        onClose={() => setReversing(null)}
        onReversed={invalidate}
      />
      {/* QO'NG'IROQ NATIJASINI BEKOR QILISH (2026-07-16): to'ladi/qisman/
          to'lamadi/qayta qo'ng'iroq — xato belgi shu yerdan qaytariladi;
          natija to'lov yaratgan bo'lsa, to'lov ham birga storno bo'ladi */}
      <CancelCallModal
        debtId={id}
        note={cancelingNote}
        open={cancelingNote !== null}
        onClose={() => setCancelingNote(null)}
        onCanceled={invalidate}
      />
    </Container>
  );
}
