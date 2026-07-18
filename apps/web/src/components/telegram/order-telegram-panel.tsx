'use client';

/**
 * Buyurtma/kontragent kartochkasidagi Telegram chat-paneli (Wappi/MoySklad
 * uslubi, 2026-07-17 talab). Skrinshotlarga mos:
 *   • Sarlavha: avatar + Telegram belgisi + kontragent nomi.
 *   • Xabar oqimi (kiruvchi/chiquvchi puffaklar), bo'sh bo'lsa «Chat bo'sh».
 *   • Pastda: matn-input + ✈️ yuborish.
 *
 * Yuborish — shaxsiy raqamdan (MTProto userbot) `POST /telegram/counterparty/
 * :id/send`; o'qish — `GET /telegram/counterparty/:id/thread` (MTProto chiquvchi
 * ∪ Business ikki-tomonlama). Raqam ulanmagan bo'lsa panel «Ulanmagan» deb
 * ogohlantiradi va Sozlamalarga havola beradi. Kiruvchi jonli xabar — keyingi
 * bosqich (MTProto inbound); hozir chiquvchi + mavjud tarix ko'rinadi.
 */

import { api } from '@/lib/api-client';
import { Button } from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Send } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

interface ThreadItem {
  id: string;
  direction: 'in' | 'out';
  text: string;
  status: string | null;
  kind: string;
  autoKind: string | null;
  createdAt: string;
}

interface ThreadResponse {
  counterparty: { id: string; name: string; phone: string | null };
  connected: boolean;
  fromNumber: string | null;
  items: ThreadItem[];
}

/** Avtomatik (hodisa) xabar belgisi — operator qo'lda yozganidan ajralsin. */
const AUTO_BADGE: Record<string, string> = {
  'debt.debt_issued': '🧾',
  'debt.payment': '💵',
  'debt.debt_closed': '✅',
  'debt.reminder': '⏰',
};

export function OrderTelegramPanel({
  counterpartyId,
  counterpartyName,
}: {
  counterpartyId: string;
  counterpartyName?: string;
}) {
  const t = useTranslations('telegram_panel');
  const qc = useQueryClient();
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const QKEY = ['tg-counterparty-thread', counterpartyId];
  const { data, isLoading } = useQuery<ThreadResponse>({
    queryKey: QKEY,
    queryFn: () => api.get<ThreadResponse>(`/telegram/counterparty/${counterpartyId}/thread`),
    enabled: !!counterpartyId,
    // Jonli-ga yaqin — kiruvchi/statuslar yangilanib tursin.
    refetchInterval: 10_000,
  });

  const sendMut = useMutation({
    mutationFn: (text: string) =>
      api.post(`/telegram/counterparty/${counterpartyId}/send`, { text }),
    onSuccess: () => {
      setDraft('');
      qc.invalidateQueries({ queryKey: QKEY });
    },
  });

  // Yangi xabar kelганда pastga suramiz.
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on item count change
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [data?.items.length]);

  const name = data?.counterparty.name ?? counterpartyName ?? '';
  const items = data?.items ?? [];

  const submit = () => {
    const text = draft.trim();
    if (!text || sendMut.isPending) return;
    sendMut.mutate(text);
  };

  return (
    <div
      className="flex h-[440px] flex-col overflow-hidden rounded-[var(--ms-radius-lg)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)]"
      data-test-id="order-telegram-panel"
    >
      {/* Sarlavha — Wappi uslubi: avatar + Telegram belgisi + nom */}
      <div className="flex items-center gap-2.5 border-[var(--ms-border-default)] border-b px-4 py-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#e8f3fc] text-[#2ca5e0]">
          <Send className="-rotate-45 h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-[var(--ms-text-primary)] text-sm">
            {name || t('title')}
          </div>
          {data?.fromNumber && (
            <div className="truncate text-[var(--ms-text-muted)] text-xs">
              {t('from_number', { phone: data.fromNumber })}
            </div>
          )}
        </div>
      </div>

      {/* Ulanmagan ogohlantirish */}
      {data && !data.connected && (
        <div className="border-amber-200 border-b bg-amber-50 px-4 py-2 text-amber-700 text-xs">
          {t('not_connected')}{' '}
          <a href="/hr/settings/telegram" className="font-medium underline">
            {t('connect_link')}
          </a>
        </div>
      )}

      {/* Xabar oqimi */}
      <div
        ref={scrollRef}
        className="flex-1 space-y-2 overflow-y-auto bg-[var(--ms-bg-app)] px-3 py-3"
      >
        {isLoading ? (
          <div className="py-8 text-center text-[var(--ms-text-muted)] text-sm">{t('loading')}</div>
        ) : items.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[var(--ms-text-muted)] text-sm italic">
            {t('empty')}
          </div>
        ) : (
          items.map((m) => {
            const auto = m.autoKind ? AUTO_BADGE[m.autoKind] : null;
            return (
              <div
                key={m.id}
                className={`flex ${m.direction === 'out' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[78%] whitespace-pre-wrap break-words rounded-2xl px-3 py-1.5 text-sm ${
                    m.direction === 'out'
                      ? 'rounded-br-sm bg-[#eaffd6] text-[var(--ms-text-primary)]'
                      : 'rounded-bl-sm bg-[var(--ms-bg-surface)] text-[var(--ms-text-primary)] shadow-sm'
                  }`}
                >
                  {auto && <span className="mr-1">{auto}</span>}
                  {m.text}
                  {m.direction === 'out' && m.status && m.status !== 'sent' && (
                    <span className="ml-1.5 text-[10px] text-[var(--ms-text-muted)]">
                      {t(`status_${m.status}` as 'status_pending')}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Composer */}
      <div className="flex items-center gap-2 border-[var(--ms-border-default)] border-t px-3 py-2.5">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={t('composer_placeholder')}
          disabled={data ? !data.connected : false}
          className="h-9 flex-1 rounded-full border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] px-4 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--ms-border-focus)] disabled:opacity-60"
          data-test-id="order-telegram-input"
        />
        <Button
          size="sm"
          onClick={submit}
          disabled={!draft.trim() || sendMut.isPending || (data ? !data.connected : false)}
          aria-label={t('send')}
          data-test-id="order-telegram-send"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
