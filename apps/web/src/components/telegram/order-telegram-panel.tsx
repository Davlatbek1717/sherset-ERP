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
 * ∪ ikki-tomonlama — Business HAM, MTProto kiruvchi HAM, 2026-07-20 Phase 1).
 * Raqam ulanmagan bo'lsa panel «Ulanmagan» deb ogohlantiradi va Sozlamalarga
 * havola beradi. 10s'da polling — mijoz javobi jonli ko'rinishga yaqin keladi.
 *
 * CHEK RASMI (2026-07-20): mijoz yuborgan rasm/hujjat/ovoz `attachmentId`
 * bilan keladi (outbox — bizning chiquvchimiz, unda hech qachon biriktirma
 * bo'lmaydi). debts/[id] sahifasi eski TelegramChatCard o'rniga shu panelni
 * ishlatadi — chek ko'rinishi shart, shuning uchun ReceiptViewer shu yerga
 * ham ko'chirildi (telegram-chat-card.tsx bilan bir xil uslub).
 *
 * FORWARD KO'RSATKICHI (2026-07-20, Phase 2): `fwdFromName` bo'lsa — Telegram
 * o'zidagi "Переслано от: X" uslubida balonning ustiga chiqadi.
 */

import { ReceiptViewer } from '@/components/debts/receipt-viewer';
import { api } from '@/lib/api-client';
import { Button, Input } from '@moysklad/ui';
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
  attachmentId: string | null;
  fileName: string | null;
  mimeType: string | null;
  /** Forward qilingan xabar bo'lsa — asl jo'natuvchi nomi (2026-07-20, Phase 2). */
  fwdFromName: string | null;
  createdAt: string;
}

interface ThreadResponse {
  counterparty: { id: string; name: string; phone: string | null };
  connected: boolean;
  fromNumber: string | null;
  items: ThreadItem[];
  /** To'liq-tarix backfill holati (2026-07-20) — panel banner ko'rsatishi uchun. */
  backfill: { status: string; messagesImported: number } | null;
  /** Eskiroq xabarlar bormi (scroll-back). */
  hasMore: boolean;
  /** Joriy sahifadagi eng eski xabar vaqti (before-kursor). */
  oldestCursor: string | null;
}

interface TelegramProfile {
  counterparty: { id: string; name: string; phone: string | null };
  /** Ulangan raqam bormi (yo'q bo'lsa lookup imkonsiz). */
  available: boolean;
  /** Kontragent telefoni Telegram'da topildimi. */
  found: boolean;
  name?: string;
  username?: string;
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
  // Ochilgan chek/rasm (telegram-chat-card.tsx bilan bir xil uslub).
  const [receiptId, setReceiptId] = useState<string | null>(null);

  // Ko'rsatiladigan xabar soni — «eski xabarlarni yuklash» oshiradi (eng yangi N,
  // eskiga qarab o'sadi). Backend 200'da cheklaydi (undan uzun tarix uchun cap).
  const [limit, setLimit] = useState(50);
  const QKEY = ['tg-counterparty-thread', counterpartyId, limit];
  const { data, isLoading } = useQuery<ThreadResponse>({
    queryKey: QKEY,
    queryFn: () =>
      api.get<ThreadResponse>(`/telegram/counterparty/${counterpartyId}/thread?limit=${limit}`),
    enabled: !!counterpartyId,
    // Jonli-ga yaqin — kiruvchi/statuslar yangilanib tursin.
    refetchInterval: 10_000,
  });

  // Panel birinchi ochilganda backfill hali so'ralmagan bo'lsa — to'liq tarixni
  // navbatga qo'yamiz (ulangan userbot bo'lsa). Bir marta (backfill null→bor bo'lgach to'xtaydi).
  const syncMut = useMutation({
    mutationFn: () => api.post(`/telegram/counterparty/${counterpartyId}/sync`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tg-counterparty-thread', counterpartyId] }),
  });
  // biome-ignore lint/correctness/useExhaustiveDependencies: trigger once when backfill missing
  useEffect(() => {
    if (data && data.backfill === null && data.connected && !syncMut.isPending) {
      syncMut.mutate();
    }
  }, [data?.backfill, data?.connected]);

  // Kontragent Telegram profilini AVTOMATIK topish (bir marta, panel ochilganda).
  // Jonli MTProto getEntity — polling QILINMAYDI (FLOOD_WAIT'dan saqlanish).
  const profileQuery = useQuery<TelegramProfile>({
    queryKey: ['tg-counterparty-profile', counterpartyId],
    queryFn: () =>
      api.get<TelegramProfile>(`/telegram/counterparty/${counterpartyId}/telegram-profile`),
    enabled: !!counterpartyId,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const profile = profileQuery.data;

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
      {/* Sarlavha — Wappi uslubi: avatar + Telegram belgisi + AVTO-topilgan profil */}
      <div className="flex items-center gap-2.5 border-[var(--ms-border-default)] border-b px-4 py-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#e8f3fc] text-[#2ca5e0]">
          <Send className="-rotate-45 h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-[var(--ms-text-primary)] text-sm">
            {/* Telegram'da topilgan ism ustun; bo'lmasa kontragent nomi. */}
            {profile?.found && profile.name ? profile.name : name || t('title')}
          </div>
          <div className="truncate text-[var(--ms-text-muted)] text-xs">
            {profileQuery.isLoading ? (
              t('profile_checking')
            ) : profile?.available && profile.found ? (
              // Topildi — @username (bo'lsa)
              profile.username ? (
                <span className="text-[#2ca5e0]">@{profile.username}</span>
              ) : (
                t('profile_found')
              )
            ) : profile?.available && !profile.found ? (
              // «Контакт не найден в Telegram» (Wappi holati)
              <span className="italic">{t('profile_not_found')}</span>
            ) : data?.fromNumber ? (
              t('from_number', { phone: data.fromNumber })
            ) : null}
          </div>
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
        {/* To'liq-tarix backfill holati (2026-07-20) */}
        {data?.backfill && data.backfill.status !== 'done' && (
          <div
            className="mx-auto w-fit rounded-full bg-[var(--ms-bg-surface)] px-3 py-1 text-center text-[var(--ms-text-muted)] text-xs"
            data-test-id="tg-backfill-banner"
          >
            {data.backfill.status === 'error'
              ? t('backfill_error')
              : t('backfill_loading', { count: data.backfill.messagesImported })}
          </div>
        )}
        {/* Eski xabarlarni yuklash (scroll-back; backend 200'da cheklaydi) */}
        {data?.hasMore && limit < 200 && (
          <button
            type="button"
            onClick={() => setLimit((l) => Math.min(l + 50, 200))}
            className="mx-auto block text-[var(--ms-text-brand)] text-xs underline"
            data-test-id="tg-load-older"
          >
            {t('load_older')}
          </button>
        )}
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
                  {m.fwdFromName && (
                    <div
                      className="mb-0.5 truncate font-medium text-[11px] text-[var(--ms-text-brand)] italic"
                      data-test-id={`order-tg-fwd-${m.id}`}
                    >
                      {t('forwarded_from', { name: m.fwdFromName })}
                    </div>
                  )}
                  {auto && <span className="mr-1">{auto}</span>}
                  {m.attachmentId && m.kind !== 'text' && (
                    <button
                      type="button"
                      onClick={() => setReceiptId(m.attachmentId as string)}
                      className="mb-1 block text-[var(--ms-text-brand)] underline"
                      data-test-id={`order-tg-file-${m.id}`}
                    >
                      {m.kind === 'photo'
                        ? `🧾 ${m.fileName ?? 'chek'}`
                        : (m.fileName ?? t('open_file'))}
                    </button>
                  )}
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
        <Input
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
          className="h-9 w-auto flex-1 rounded-full px-4 text-sm focus:ring-1 focus:ring-[var(--ms-border-focus)] disabled:opacity-60"
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

      {/* Mijoz yuborgan chek/rasm — modal oynada (token bilan yuklanadi) */}
      <ReceiptViewer
        attachmentId={receiptId}
        title={name || undefined}
        open={receiptId !== null}
        onClose={() => setReceiptId(null)}
      />
    </div>
  );
}
