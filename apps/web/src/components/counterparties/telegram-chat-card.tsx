'use client';

/**
 * «Telegram» card on the counterparty detail page (Sherset custom).
 *
 * Shows the Telegram Business conversation bound to this counterparty and a
 * send box — messages go out FROM THE OWNER'S OWN NAME (Telegram Business
 * connection, not a visible bot). If no chat is bound yet, offers to bind one
 * of the unbound incoming chats.
 */

import { api } from '@/lib/api-client';
import { Button, Input, NativeSelect } from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface BusinessStatus {
  configured: boolean;
  botUsername: string | null;
  webhookSet: boolean;
  connected: boolean;
  businessUserName: string | null;
}

interface ChatRow {
  id: string;
  chatId: string;
  name: string;
  username: string | null;
  counterparty: { id: string; name: string } | null;
  lastMessageAt: string | null;
}

interface MessageRow {
  id: string;
  direction: 'in' | 'out';
  text: string;
  senderName: string | null;
  /** 'text' | 'photo' | 'document' | 'voice' | 'video' | 'contact' */
  kind: string;
  /** Rasm/hujjat bo'lsa — `/api/v1/attachments/:id/raw` orqali ochiladi. */
  attachmentId: string | null;
  fileName: string | null;
  mimeType: string | null;
  /** Avtomatik xabar bo'lsa sababi: 'debt_issued' | 'payment' | ... */
  autoKind: string | null;
  createdAt: string;
}

/** Avtomatik xabar belgisi — operator qo'lda yozganidan ajralsin. */
const AUTO_BADGE: Record<string, string> = {
  debt_issued: '🧾 Qarz yozildi',
  payment: "💵 To'lov",
  debt_closed: '✅ Qarz yopildi',
  reminder: '⏰ Eslatma',
};

export function TelegramChatCard({ counterpartyId }: { counterpartyId: string }) {
  const t = useTranslations('telegram_chat');
  const qc = useQueryClient();
  const [draft, setDraft] = useState('');
  const [bindChatId, setBindChatId] = useState('');

  const { data: status } = useQuery<BusinessStatus>({
    queryKey: ['tg-business-status'],
    queryFn: () => api.get<BusinessStatus>('/telegram/business-status'),
    staleTime: 60_000,
  });

  const { data: bound } = useQuery<{ items: ChatRow[] }>({
    queryKey: ['tg-chats', counterpartyId],
    queryFn: () =>
      api.get<{ items: ChatRow[] }>(`/telegram/chats?counterpartyId=${counterpartyId}`),
    enabled: !!status?.configured,
  });
  const chat = bound?.items?.[0] ?? null;

  const { data: unbound } = useQuery<{ items: ChatRow[] }>({
    queryKey: ['tg-chats-unbound'],
    queryFn: () => api.get<{ items: ChatRow[] }>('/telegram/chats?unbound=true'),
    enabled: !!status?.configured && bound != null && !chat,
  });

  const { data: messages } = useQuery<{ items: MessageRow[] }>({
    queryKey: ['tg-messages', chat?.id],
    queryFn: () =>
      api.get<{ items: MessageRow[] }>(`/telegram/chats/${chat?.id}/messages?limit=30`),
    enabled: !!chat,
    refetchInterval: 10_000,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['tg-chats', counterpartyId] });
    qc.invalidateQueries({ queryKey: ['tg-chats-unbound'] });
    if (chat) qc.invalidateQueries({ queryKey: ['tg-messages', chat.id] });
  };

  const bindMut = useMutation({
    mutationFn: (id: string) => api.put(`/telegram/chats/${id}/bind`, { counterpartyId }),
    onSuccess: invalidate,
  });
  const unbindMut = useMutation({
    mutationFn: (id: string) => api.put(`/telegram/chats/${id}/bind`, { counterpartyId: null }),
    onSuccess: invalidate,
  });
  const sendMut = useMutation({
    mutationFn: (text: string) => api.post(`/telegram/chats/${chat?.id}/send`, { text }),
    onSuccess: () => {
      setDraft('');
      invalidate();
    },
  });

  // Not configured at all — quiet hint only (settings are an admin concern).
  if (!status?.configured) {
    return (
      <Card title={t('title')}>
        <p className="text-[var(--ms-text-muted)] text-xs">{t('not_configured')}</p>
      </Card>
    );
  }

  return (
    <Card
      title={t('title')}
      badge={
        status.connected ? (status.businessUserName ?? t('connected')) : t('business_not_connected')
      }
      badgeTone={status.connected ? 'ok' : 'warn'}
    >
      {!chat && (
        <div className="space-y-2">
          <p className="text-[var(--ms-text-muted)] text-xs">{t('no_chat_bound')}</p>
          {(unbound?.items?.length ?? 0) > 0 && (
            <div className="flex gap-2">
              <NativeSelect
                value={bindChatId}
                onChange={(e) => setBindChatId(e.target.value)}
                className="h-8 flex-1 text-sm"
                data-test-id="tg-bind-select"
              >
                <option value="">{t('pick_chat')}</option>
                {unbound?.items?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.username ? ` (@${c.username})` : ''}
                  </option>
                ))}
              </NativeSelect>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={!bindChatId || bindMut.isPending}
                onClick={() => bindMut.mutate(bindChatId)}
                data-test-id="tg-bind-btn"
              >
                {t('bind')}
              </Button>
            </div>
          )}
        </div>
      )}

      {chat && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-medium text-sm">
              {chat.name}
              {chat.username && (
                <span className="ml-1 text-[var(--ms-text-muted)] text-xs">@{chat.username}</span>
              )}
            </span>
            <button
              type="button"
              className="text-[var(--ms-text-muted)] text-xs hover:text-[var(--ms-text-destructive)] hover:underline"
              onClick={() => unbindMut.mutate(chat.id)}
              data-test-id="tg-unbind-btn"
            >
              {t('unbind')}
            </button>
          </div>

          <div
            className="max-h-64 space-y-1.5 overflow-y-auto rounded-[var(--ms-radius-default)] bg-[var(--ms-bg-app)] p-2"
            data-test-id="tg-messages"
          >
            {(messages?.items?.length ?? 0) === 0 && (
              <p className="py-4 text-center text-[var(--ms-text-muted)] text-xs">
                {t('no_messages')}
              </p>
            )}
            {messages?.items?.map((m) => (
              <div key={m.id} className={m.direction === 'out' ? 'flex justify-end' : 'flex'}>
                <div
                  className={`max-w-[85%] rounded-lg px-2.5 py-1.5 text-sm ${
                    m.direction === 'out'
                      ? 'bg-[var(--ms-row-callback-bg)] text-[var(--ms-text-primary)]'
                      : 'border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] text-[var(--ms-text-primary)]'
                  }`}
                  data-test-id={`tg-msg-${m.id}`}
                >
                  {/* Avtomatik xabar — operator yozganidan ajralib tursin */}
                  {m.autoKind && (
                    <div className="mb-1 font-medium text-[10px] text-[var(--ms-text-muted)]">
                      {AUTO_BADGE[m.autoKind] ?? m.autoKind}
                    </div>
                  )}

                  {/* CHEK RASMI (2026-07-13): ilgari media umuman saqlanmasdi.
                      Endi mijoz yuborgan chek shu yerda ko'rinadi — bosilsa
                      to'liq o'lchamda ochiladi. */}
                  {m.kind === 'photo' && m.attachmentId && (
                    <a
                      href={`/api/v1/attachments/${m.attachmentId}/raw`}
                      target="_blank"
                      rel="noreferrer"
                      data-test-id={`tg-photo-${m.id}`}
                    >
                      {/* next/image emas: rasm bizning API'dan oqim bo'lib keladi */}
                      <img
                        src={`/api/v1/attachments/${m.attachmentId}/raw`}
                        alt={m.fileName ?? 'chek'}
                        className="mb-1 max-h-56 rounded border border-[var(--ms-border-default)]"
                      />
                    </a>
                  )}

                  {/* Hujjat / ovoz / video — havola bilan */}
                  {m.kind !== 'photo' && m.kind !== 'text' && m.attachmentId && (
                    <a
                      href={`/api/v1/attachments/${m.attachmentId}/raw`}
                      target="_blank"
                      rel="noreferrer"
                      className="mb-1 block text-[var(--ms-text-brand)] underline"
                      data-test-id={`tg-file-${m.id}`}
                    >
                      {m.fileName ?? t('open_file')}
                    </a>
                  )}

                  <div className="whitespace-pre-wrap break-words">{m.text}</div>
                  <div className="mt-0.5 text-[10px] text-[var(--ms-text-muted)] tabular-nums">
                    {new Date(m.createdAt).toLocaleString('ru-RU', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <Input
              value={draft}
              placeholder={status.connected ? t('write_placeholder') : t('business_not_connected')}
              disabled={!status.connected || sendMut.isPending}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && draft.trim()) sendMut.mutate(draft.trim());
              }}
              data-test-id="tg-send-input"
            />
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={!status.connected || !draft.trim() || sendMut.isPending}
              onClick={() => sendMut.mutate(draft.trim())}
              data-test-id="tg-send-btn"
            >
              {t('send')}
            </Button>
          </div>
          {sendMut.error != null && (
            <p className="text-[var(--ms-text-destructive)] text-xs">
              {(sendMut.error as Error).message}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

function Card({
  title,
  badge,
  badgeTone,
  children,
}: {
  title: string;
  badge?: string;
  badgeTone?: 'ok' | 'warn';
  children: React.ReactNode;
}) {
  return (
    <section
      className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-4"
      data-test-id="cp-card-telegram"
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold text-[var(--ms-text-primary)] text-sm">{title}</h3>
        {badge && (
          <span
            // Dark mode: ilgari bg-green-50/text-green-700 QATTIQ yozilgan edi va
            // qorong'i fonda o'qib bo'lmasdi. Endi tema o'zgaruvchilari.
            className={`rounded px-1.5 py-0.5 text-[11px] ${
              badgeTone === 'ok'
                ? 'bg-[var(--ms-row-paid-bg)] text-[var(--ms-row-paid-accent)]'
                : 'bg-[var(--ms-row-partial-bg)] text-[var(--ms-row-partial-accent)]'
            }`}
          >
            {badge}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}
