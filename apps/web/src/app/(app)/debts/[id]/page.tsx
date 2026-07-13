'use client';

/**
 * §3.2 — MIJOZ PROFILI.
 *
 * TZ ning aniq talabi: uch funksiya bir-biridan ALOHIDA (interfeysda
 * aralashtirilmagan holda) joylashadi, «toki xodimlar bir-birining vazifasiga
 * tegishli bo'lmagan amalni bajarmasin»:
 *
 *   1. «Izoh / qo'ng'iroq»              — operator + kassir  (§3.4)
 *   2. «To'lov qabul qilish (kassa)»    — FAQAT kassir       (§3.6)
 *   3. «Karta orqali to'lov (screenshot)» — FAQAT operator   (§3.7)
 *
 * Ruxsat SERVERDA kuchga ega (RBAC: debtpayment / debtcardpayment). Bu yerdagi
 * ajratma — vizual va xato-oldini-olish qatlami: xodim noto'g'ri bo'limga
 * yozmasligi uchun. Ruxsati yo'q bo'lim 403 qaytaradi va shu kartochkada
 * xato ko'rsatiladi (yashirilmaydi — chunki FE rolni bilmaydi, server biladi).
 *
 * §3.8 real-time: profil `refetchInterval` bilan yangilanadi — kassada
 * to'lov bo'lsa, operator ekranida qoldiq o'zi kamayadi.
 */

import { CallOutcomeModal } from '@/components/debts/call-outcome-modal';
import {
  DEBT_POLL_MS,
  type DebtNoteRow,
  type DebtPaymentRow,
  debtApi,
  fileToBase64,
  nowInputValue,
  screenshotUrl,
  todayAt9InputValue,
} from '@/lib/debt-api';
import {
  Badge,
  Button,
  Container,
  EmptyState,
  Input,
  MoneyInput,
  NativeSelect,
  PageHeader,
  StatCard,
  Textarea,
  formatMoney,
} from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

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

export default function DebtProfilePage() {
  const t = useTranslations('pages.debts');
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
  // «Qo'ng'iroq qilindi» natija modali (2026-07-12).
  const [callOpen, setCallOpen] = useState(false);
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

  // ── 2) Kassa to'lovi (§3.6) — FAQAT KASSIR ────────────────────────────────
  const [cashMinor, setCashMinor] = useState('0');
  const [cashMethod, setCashMethod] = useState<'cash' | 'terminal'>('cash');
  const [cashComment, setCashComment] = useState('');
  const [cashNext, setCashNext] = useState(nowInputValue());
  // 2026-07-12 aniqlik: default sahifa OCHILGAN payt emas, TO'LOV PAYTIDAGI
  // ayni vaqt bo'lishi kerak. Kassir qo'l tegizmaguncha maydon har 30s da
  // hozirgi vaqtga yangilanib turadi (jonli soat); qo'lda o'zgartirsa — to'xtaydi.
  const [cashNextDirty, setCashNextDirty] = useState(false);
  useEffect(() => {
    if (cashNextDirty) return;
    setCashNext(nowInputValue());
    const tick = setInterval(() => setCashNext(nowInputValue()), 30_000);
    return () => clearInterval(tick);
  }, [cashNextDirty]);
  const [cashErr, setCashErr] = useState<string | null>(null);

  const addCash = useMutation({
    mutationFn: () =>
      debtApi.addCashPayment(id, {
        amountMinor: cashMinor,
        method: cashMethod,
        comment: cashComment.trim() || undefined,
        nextContactAt: cashNext ? new Date(cashNext).toISOString() : null,
      }),
    onSuccess: () => {
      setCashMinor('0');
      setCashComment('');
      setCashNext(nowInputValue());
      setCashNextDirty(false);
      setCashErr(null);
      invalidate();
    },
    onError: (e: Error) => setCashErr(e.message),
  });

  // ── 3) Karta (screenshot) to'lovi (§3.7) — FAQAT OPERATOR ─────────────────
  const [cardMinor, setCardMinor] = useState('0');
  const [cardFile, setCardFile] = useState<File | null>(null);
  const [cardComment, setCardComment] = useState('');
  const [cardErr, setCardErr] = useState<string | null>(null);

  const addCard = useMutation({
    mutationFn: async () => {
      if (!cardFile) throw new Error(t('card_upload'));
      const base64 = await fileToBase64(cardFile);
      return debtApi.addCardPayment(id, {
        amountMinor: cardMinor,
        screenshotBase64: base64,
        filename: cardFile.name,
        mime: cardFile.type || 'image/png',
        comment: cardComment.trim() || undefined,
      });
    },
    onSuccess: () => {
      setCardMinor('0');
      setCardFile(null);
      setCardComment('');
      setCardErr(null);
      invalidate();
    },
    onError: (e: Error) => setCardErr(e.message),
  });

  const d = debt.data;
  const isPaid = d?.status === 'paid';

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

  const methodLabel = (m: DebtPaymentRow['method']) =>
    m === 'cash'
      ? t('method_cash')
      : m === 'terminal'
        ? t('method_terminal')
        : m === 'manual_close'
          ? t('method_manual_close')
          : t('method_card_screenshot');

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
            {/* «Qo'ng'iroq qilindi» + natija — kartochkaning o'zida (2026-07-12) */}
            <Button
              variant="secondary"
              onClick={() => setCallOpen(true)}
              data-test-id="detail-call-btn"
            >
              📞 {t('call_button')}
            </Button>
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

        {/* 2) Kassa to'lovi — FAQAT KASSIR (§3.6) */}
        <Section title={t('section_cash')} tone="cash" testId="section-cash">
          <div className="flex flex-col gap-2">
            <div>
              <div className="mb-1 text-[var(--ms-text-secondary)] text-xs">{t('cash_amount')}</div>
              <MoneyInput
                valueMinor={cashMinor}
                onChangeMinor={setCashMinor}
                disabled={isPaid}
                data-test-id="cash-amount"
              />
            </div>
            <div>
              <div className="mb-1 text-[var(--ms-text-secondary)] text-xs">{t('cash_method')}</div>
              <NativeSelect
                value={cashMethod}
                onChange={(e) => setCashMethod(e.target.value as 'cash' | 'terminal')}
                disabled={isPaid}
                data-test-id="cash-method"
              >
                <option value="cash">{t('method_cash')}</option>
                <option value="terminal">{t('method_terminal')}</option>
              </NativeSelect>
            </div>

            {/* §3.6 — qisman to'lovda izoh + keyingi sana MAJBURIY (server ham tekshiradi) */}
            <div className="rounded-[var(--ms-radius-sm)] bg-[var(--ms-bg-muted)] p-2 text-[var(--ms-text-secondary)] text-xs">
              {t('partial_warning')}
            </div>
            <Textarea
              value={cashComment}
              onChange={(e) => setCashComment(e.target.value)}
              placeholder={t('field_comment')}
              rows={2}
              disabled={isPaid}
              data-test-id="cash-comment"
            />
            <Input
              type="datetime-local"
              value={cashNext}
              onChange={(e) => {
                setCashNextDirty(true);
                setCashNext(e.target.value);
              }}
              disabled={isPaid}
              data-test-id="cash-next"
            />

            <Button
              variant="success"
              loading={addCash.isPending}
              disabled={isPaid || cashMinor === '0' || cashMinor === ''}
              onClick={() => addCash.mutate()}
              data-test-id="cash-submit"
            >
              {t('cash_submit')}
            </Button>
            {cashErr && (
              <div className="text-[var(--ms-text-destructive)] text-sm" data-test-id="cash-error">
                {cashErr}
              </div>
            )}
          </div>
        </Section>

        {/* 3) Karta (screenshot) to'lovi — FAQAT OPERATOR (§3.7) */}
        <Section title={t('section_card')} tone="card" testId="section-card">
          <div className="flex flex-col gap-2">
            <div>
              <div className="mb-1 text-[var(--ms-text-secondary)] text-xs">{t('card_amount')}</div>
              <MoneyInput
                valueMinor={cardMinor}
                onChangeMinor={setCardMinor}
                disabled={isPaid}
                data-test-id="card-amount"
              />
            </div>

            {/* TZ §3.7 — «tizim buni avtomatik tekshirmaydi» */}
            <div className="rounded-[var(--ms-radius-sm)] bg-[var(--ms-bg-muted)] p-2 text-[var(--ms-text-secondary)] text-xs">
              {t('card_hint')}
            </div>

            <div>
              <div className="mb-1 text-[var(--ms-text-secondary)] text-xs">{t('card_upload')}</div>
              <Input
                type="file"
                accept="image/*"
                disabled={isPaid}
                onChange={(e) => setCardFile(e.target.files?.[0] ?? null)}
                data-test-id="card-file"
              />
              {cardFile && (
                <div className="mt-1 text-[var(--ms-text-secondary)] text-xs">{cardFile.name}</div>
              )}
            </div>

            <Textarea
              value={cardComment}
              onChange={(e) => setCardComment(e.target.value)}
              placeholder={t('field_comment')}
              rows={2}
              disabled={isPaid}
              data-test-id="card-comment"
            />

            <Button
              loading={addCard.isPending}
              disabled={isPaid || cardMinor === '0' || cardMinor === '' || cardFile === null}
              onClick={() => addCard.mutate()}
              data-test-id="card-submit"
            >
              {t('card_submit')}
            </Button>
            {cardErr && (
              <div className="text-[var(--ms-text-destructive)] text-sm" data-test-id="card-error">
                {cardErr}
              </div>
            )}
          </div>
        </Section>
      </div>

      {/* ─── To'lovlar tarixi (§3.7: manba ajratib ko'rsatiladi) ─────────── */}
      <section className="mt-6">
        <h2 className="mb-2 font-semibold text-sm">{t('section_payments')}</h2>
        {d && d.payments.length > 0 ? (
          <div className="flex flex-col gap-2">
            {d.payments.map((p) => (
              <div
                key={p.id}
                data-test-id={`payment-${p.id}`}
                className="flex flex-wrap items-center gap-3 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-3"
              >
                <span className="w-[140px] shrink-0 font-semibold tabular-nums">
                  {formatMoney(p.amountMinor, d.currency)}
                </span>
                <Badge tone={p.method === 'card_screenshot' ? 'info' : 'success'}>
                  {methodLabel(p.method)}
                </Badge>
                {/* §3.8 — «qayerdan qabul qilingani» */}
                <span className="text-[var(--ms-text-secondary)] text-sm">
                  {p.sourceName ?? '—'}
                </span>
                <span className="text-[var(--ms-text-secondary)] text-sm">
                  {p.receivedByName ?? '—'} · {roleLabel(p.receivedByRole)}
                </span>
                <span className="text-[var(--ms-text-secondary)] text-sm tabular-nums">
                  {when(p.createdAt)}
                </span>
                {p.comment && <span className="text-sm">{p.comment}</span>}
                {/* §3.7 — chek istalgan vaqt ochib ko'riladi (nizoli holat) */}
                {p.attachmentId && (
                  <a
                    href={screenshotUrl(p.attachmentId)}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-auto text-[var(--ms-text-brand)] text-sm hover:underline"
                    data-test-id={`screenshot-${p.id}`}
                  >
                    {t('view_screenshot')}
                  </a>
                )}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title={t('empty')} />
        )}
      </section>

      {/* ─── Muloqot tarixi (§3.4: xronologik, oxirgisi yuqorida) ────────── */}
      <section className="mt-6">
        <h2 className="mb-2 font-semibold text-sm">{t('section_history')}</h2>
        {d && d.notes.length > 0 ? (
          <div className="flex flex-col gap-2">
            {d.notes.map((n) => (
              <div
                key={n.id}
                data-test-id={`note-${n.id}`}
                className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-3"
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
                </div>
                <div className="text-sm">{n.text}</div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title={t('note_empty')} />
        )}
      </section>

      {/* «Qo'ng'iroq qilindi» — natija modali (umumiy komponent) */}
      <CallOutcomeModal
        debtId={id}
        debtorName={d?.counterpartyName ?? ''}
        remainingMinor={d?.remainingMinor}
        open={callOpen}
        onClose={() => setCallOpen(false)}
      />
    </Container>
  );
}
