'use client';

/**
 * Suhbat va ogohlantirish jurnali (4M.4 · menejer TZ §6.2) — MK04.
 *
 * ⚠️ **APPEND-ONLY**: yozuv tahrirlanmaydi va o'chirilmaydi. O'chirib
 * bo'ladigan ogohlantirish — ogohlantirish emas: noqulay yozuvni keyin
 * yo'qotish imkoni bo'lsa, jurnalning butun ma'nosi yo'qoladi. Xato yozuv
 * `void` qilinadi — u ro'yxatda ko'rinib turadi, faqat hisobga kirmaydi.
 *
 * ⚠️ Naqsh belgisi (`hasWarningPattern`) va oyna/chegara SERVERDAN keladi,
 * bu yerda QAYTA sanalmaydi: `items` ichida bekor qilingan yozuvlar ham bor
 * (ular ko'rinishi SHART), shuning uchun ro'yxatdan sanash soxta «naqsh»
 * chiqarardi.
 */

import { type EmployeeCard, type EmployeeNoteKind, hrEmployeeApi } from '@/lib/hr-api';
import { Badge, Button, EmptyState, Modal, NativeSelect, Textarea, useToast } from '@moysklad/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

type Notes = EmployeeCard['notes'];
type Note = Notes['items'][number];

const KINDS: EmployeeNoteKind[] = ['talk', 'warning', 'praise'];

export interface NoteJournalProps {
  employeeId: string;
  notes: Notes;
}

export function NoteJournal({ employeeId, notes }: NoteJournalProps) {
  const t = useTranslations('pages.hrEmployees');
  const tCommon = useTranslations('common');
  const { toast } = useToast();
  const qc = useQueryClient();

  const [kind, setKind] = useState<EmployeeNoteKind>('talk');
  const [text, setText] = useState('');
  /** Bekor qilinayotgan yozuv — modal shundan ochiladi. */
  const [voiding, setVoiding] = useState<Note | null>(null);
  const [voidReason, setVoidReason] = useState('');

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['hr-employee-card', employeeId] });
  };

  const addMut = useMutation({
    mutationFn: () => hrEmployeeApi.addNote(employeeId, { kind, text: text.trim() }),
    onSuccess: () => {
      toast.success(t('note_add_done'));
      setText('');
      refresh();
    },
    onError: (e: Error) => toast.error(tCommon('action_failed'), { description: e.message }),
  });

  const voidMut = useMutation({
    mutationFn: (note: Note) => hrEmployeeApi.voidNote(note.id, voidReason.trim() || null),
    onSuccess: () => {
      toast.success(t('note_void_done'));
      setVoiding(null);
      setVoidReason('');
      refresh();
    },
    onError: (e: Error) => toast.error(tCommon('action_failed'), { description: e.message }),
  });

  return (
    <section
      data-test-id="note-journal"
      className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-4"
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="font-semibold text-[var(--ms-text-strong)] text-sm">
          {t('note_journal_title')}
        </h2>
        {/* Naqsh belgisi — menejer aynan shu chegarada boshqa qaror qabul qiladi. */}
        {notes.hasWarningPattern && (
          <Badge tone="destructive" data-test-id="note-warning-pattern">
            {t('note_pattern', { count: notes.activeWarnings, days: notes.windowDays })}
          </Badge>
        )}
      </div>
      <p className="mb-3 text-[var(--ms-text-muted)] text-xs">{t('note_journal_hint')}</p>

      {/* Xulosa: maqtov ham sanaladi — jurnal faqat salbiy bo'lmasin. */}
      <div className="mb-3 flex flex-wrap gap-2 text-xs">
        <Badge tone="neutral">
          {t('note_kind_talk')}: {notes.talkCount}
        </Badge>
        <Badge tone={notes.warningCount > 0 ? 'warning' : 'neutral'}>
          {t('note_kind_warning')}: {notes.warningCount}
        </Badge>
        <Badge tone={notes.praiseCount > 0 ? 'success' : 'neutral'}>
          {t('note_kind_praise')}: {notes.praiseCount}
        </Badge>
      </div>

      {/* ── Yangi yozuv ─────────────────────────────────────────────── */}
      <div className="mb-4 space-y-2">
        <NativeSelect
          value={kind}
          onChange={(e) => setKind(e.target.value as EmployeeNoteKind)}
          data-test-id="note-add-kind"
        >
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {t(`note_kind_${k}` as never)}
            </option>
          ))}
        </NativeSelect>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('note_add_placeholder')}
          rows={2}
          data-test-id="note-add-text"
        />
        <div className="flex justify-end">
          <Button
            onClick={() => addMut.mutate()}
            disabled={addMut.isPending || text.trim() === ''}
            data-test-id="note-add-submit"
          >
            {t('note_add')}
          </Button>
        </div>
      </div>

      {/* ── Jurnal ──────────────────────────────────────────────────── */}
      {notes.items.length === 0 ? (
        // «0 ta yozuv» emas: hech qachon yozilmagani bilan «hammasi joyida»
        // bir xil ko'rinmasligi kerak.
        <EmptyState title={t('note_journal_empty')} data-test-id="note-journal-empty" />
      ) : (
        <ul className="divide-y divide-[var(--ms-border-default)]">
          {notes.items.map((n) => (
            <NoteRow key={n.id} note={n} onVoid={() => setVoiding(n)} t={t} />
          ))}
        </ul>
      )}

      <Modal
        open={voiding !== null}
        onOpenChange={(v) => {
          if (!v) setVoiding(null);
        }}
        title={t('note_void_title')}
        description={t('note_void_description')}
        testId="note-void-dialog"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setVoiding(null)}>
              {tCommon('cancel')}
            </Button>
            <Button
              variant="destructive"
              loading={voidMut.isPending}
              onClick={() => voiding && voidMut.mutate(voiding)}
              data-test-id="note-void-confirm"
            >
              {t('note_void')}
            </Button>
          </div>
        }
      >
        <Textarea
          value={voidReason}
          onChange={(e) => setVoidReason(e.target.value)}
          placeholder={t('note_void_reason_placeholder')}
          rows={2}
          data-test-id="note-void-reason"
        />
      </Modal>
    </section>
  );
}

function NoteRow({
  note,
  onVoid,
  t,
}: {
  note: Note;
  onVoid: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const voided = note.voidedAt !== null;
  return (
    <li data-test-id={`note-row-${note.id}`} className="flex flex-wrap gap-2 py-2 text-sm">
      <Badge
        tone={note.kind === 'warning' ? 'warning' : note.kind === 'praise' ? 'success' : 'neutral'}
        data-test-id={`note-kind-${note.id}`}
      >
        {t(`note_kind_${note.kind}` as never)}
      </Badge>
      <div className="min-w-0 flex-1">
        {/* Bekor qilingan matn CHIZILADI, lekin O'CHIRILMAYDI — tarixda qoladi. */}
        <p
          className={
            voided
              ? 'text-[var(--ms-text-muted)] line-through'
              : 'text-[var(--ms-text-primary)] whitespace-pre-wrap'
          }
        >
          {note.text}
        </p>
        <p className="text-[var(--ms-text-muted)] text-xs">
          {formatStamp(note.createdAt)}
          {note.author ? ` · ${note.author.name}` : ''}
        </p>
        {voided && (
          <p
            className="text-[var(--ms-text-muted)] text-xs"
            data-test-id={`note-voided-${note.id}`}
          >
            {t('note_voided', {
              at: formatStamp(note.voidedAt),
              by: note.voidedBy?.name ?? '—',
            })}
            {note.voidReason ? ` — «${note.voidReason}»` : ''}
          </p>
        )}
      </div>
      {/* O'chirish tugmasi YO'Q — faqat bekor qilish, va faqat bir marta. */}
      {!voided && (
        <button
          type="button"
          onClick={onVoid}
          data-test-id={`note-void-${note.id}`}
          className="self-start text-[var(--ms-text-muted)] text-xs underline hover:text-[var(--ms-text-brand)]"
        >
          {t('note_void')}
        </button>
      )}
    </li>
  );
}

function formatStamp(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
