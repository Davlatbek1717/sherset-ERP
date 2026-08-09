'use client';

/**
 * «Ertalabki brifing» va «kechki yakun» (4M TZ §8.1/5 · MK19).
 *
 * SAVOL: ertalab **bugun nima muhim** (qotib qolgan ish · SLA buzilishi ·
 * qabul kutayotgan kunlar · zaxira signali), kechqurun **bugun nima bo'ldi**
 * (tushum · smena qabuli · kassa farqi · ochiq qolganlar).
 *
 * 🔴 EKRAN SHARTNOMASI — **«o'lchanmadi» ≠ «nol»** va **«o'lchanmadi» ≠
 * «tinch kun»**. Manba javob bermagan blok `0` bo'lib emas, `—` bo'lib
 * chiziladi, va kun «tinch» deb ATALMAYDI. Brifing aynan «bugun tinch» deb
 * aytish uchun ochiladi — o'lchanmagan manbadan chiqqan xotirjamlik menejerni
 * ekranga ishonishga o'rgatib, keyin bir kuni jimgina aldardi.
 *
 * 🔴 **Har raqam ogohlantirish EMAS.** `measure` bloklari (jarayonda turgan
 * ish · bugungi tushum) hech qachon ogohlantirish rangini olmaydi: 9 ta
 * buyurtma yig'ilayotgani normal ish kuni. Faqat `signal` bloklari diqqat
 * talab qiladi.
 *
 * ⚠️ Panel HECH NARSANI BLOKLAMAYDI va o'zgartirmaydi — faqat ko'rsatadi.
 * Yagona amal — digestni Telegram navbatiga qo'yish (kuniga bir marta).
 */

import {
  type BriefingBlock,
  type BriefingKind,
  type BriefingSnapshot,
  type DataQualityLevel,
  managerBriefingApi,
} from '@/lib/manager-api';
import { Badge, Button, Skeleton, formatMoney } from '@moysklad/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export function BriefingScreen() {
  const t = useTranslations('pages.menejer');

  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-semibold text-[var(--ms-text-strong)] text-xl">{t('br_title')}</h1>
        <p className="text-[var(--ms-text-muted)] text-sm">{t('br_subtitle')}</p>
      </header>

      <BriefingPanel kind="morning" />
      <BriefingPanel kind="evening" />

      <p className="text-[var(--ms-text-muted)] text-xs">{t('br_footer_hint')}</p>
    </div>
  );
}

function BriefingPanel({ kind }: { kind: BriefingKind }) {
  const t = useTranslations('pages.menejer');
  const [sendError, setSendError] = useState<string | null>(null);

  const { data, isLoading } = useQuery<BriefingSnapshot>({
    queryKey: ['manager', 'briefing', kind],
    queryFn: () => managerBriefingApi.snapshot(kind),
  });

  const send = useMutation({
    mutationFn: () => managerBriefingApi.sendTelegram(kind),
    onMutate: () => setSendError(null),
    // Xato JIM yutilmaydi: «yuborildi» deb ko'rsatib, aslida ketmagan xabar
    // eng yomon holat bo'lardi (menejer kutib qoladi).
    onError: (e: unknown) => setSendError(e instanceof Error ? e.message : String(e)),
  });

  return (
    <section
      className="rounded-md border border-[var(--ms-border)] p-3"
      data-test-id={`br-panel-${kind}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-medium text-[var(--ms-text-strong)]">{t(`br_${kind}_title`)}</h2>
          <p className="text-[var(--ms-text-muted)] text-sm">{t(`br_${kind}_hint`)}</p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          disabled={!data || send.isPending}
          onClick={() => send.mutate()}
          data-test-id={`br-send-${kind}`}
        >
          {send.isPending ? t('br_sending') : t('br_send')}
        </Button>
      </div>

      {isLoading || !data ? (
        <Skeleton className="mt-3 h-40 w-full" />
      ) : (
        <>
          <StatusLine snapshot={data} kind={kind} />

          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
            {data.blocks.map((b) => (
              <BlockCard key={b.key} block={b} currency={data.currency} />
            ))}
          </div>
        </>
      )}

      {/* Yuborish natijasi — dublikat XATO emas: takror bosish jazolanmaydi,
          lekin ikkinchi xabar ham ketmaydi. */}
      {send.data && (
        <p className="mt-2 text-[var(--ms-text-muted)] text-xs" data-test-id={`br-sent-${kind}`}>
          {send.data.skipped === 'duplicate' ? t('br_duplicate') : t('br_sent')}
        </p>
      )}
      {sendError && (
        <p className="mt-2 text-[var(--ms-danger)] text-xs" data-test-id={`br-send-error-${kind}`}>
          {sendError}
        </p>
      )}
    </section>
  );
}

function StatusLine({ snapshot, kind }: { snapshot: BriefingSnapshot; kind: BriefingKind }) {
  const t = useTranslations('pages.menejer');
  const { status, attentionCount } = snapshot.summary;

  const tone = status === 'quiet' ? 'success' : status === 'attention' ? 'warning' : 'neutral';

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <Badge tone={tone} data-test-id={`br-status-${kind}`} data-status={status}>
        {t(`br_status_${status}` as 'br_status_quiet')}
      </Badge>
      {/* 🔴 Jami — bitta signal o'lchanmagan bo'lsa `—`: yarim yig'indi to'liq
          raqamdek ko'rinardi va aynan shu raqamga qarab kun rejalashtirilardi. */}
      <span className="text-[var(--ms-text-muted)] text-sm" data-test-id={`br-count-${kind}`}>
        {t('br_attention_count')}: {attentionCount === null ? '—' : attentionCount}
      </span>
      <span className="text-[var(--ms-text-muted)] text-xs">{snapshot.businessDate}</span>
    </div>
  );
}

function BlockCard({ block, currency }: { block: BriefingBlock; currency: string }) {
  const t = useTranslations('pages.menejer');
  const unmeasured = block.count === null && block.amountMinor === null;

  return (
    <div
      data-test-id={`br-block-${block.key}`}
      data-role={block.role}
      data-attention={block.attention ? 'true' : 'false'}
      className={`rounded-md border p-3 ${
        block.attention ? 'border-[var(--ms-warning)]' : 'border-[var(--ms-border)]'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-medium text-[var(--ms-text)] text-sm">
          {t(`br_block_${block.key}` as 'br_block_stuck')}
        </h3>
        {/* «To'liq» bayrog'i shovqin qilmasin — faqat diqqat talab qilgani. */}
        {block.quality !== 'complete' && (
          <LevelBadge level={block.quality} testId={`br-quality-${block.key}`} />
        )}
      </div>

      <p
        className={`mt-1 font-semibold text-lg ${
          unmeasured ? 'text-[var(--ms-text-muted)]' : 'text-[var(--ms-text-strong)]'
        }`}
        data-test-id={`br-count-value-${block.key}`}
      >
        {block.count === null ? '—' : block.count}
      </p>

      {/* Pul o'lchovi bor bloklar (zaxira signali · tushum) — ikkinchi qator. */}
      {block.amountMinor !== null && (
        <p className="text-[var(--ms-text)] text-sm" data-test-id={`br-amount-${block.key}`}>
          {formatMoney(block.amountMinor, currency)}
        </p>
      )}

      {/* `measure` — kontekst raqami, ogohlantirish EMAS. */}
      {block.role === 'measure' && (
        <p className="text-[var(--ms-text-muted)] text-xs">{t('br_measure_hint')}</p>
      )}

      {unmeasured && <p className="text-[var(--ms-text-muted)] text-xs">{t('br_unmeasured')}</p>}

      {/* Provenance — «bu raqam qayerdan?». Ikki ekran bir xil raqamni
          ko'rsatishi kerakligi shu yerdan tekshiriladi. */}
      <p
        className="mt-2 text-[10px] text-[var(--ms-text-muted)]"
        data-test-id={`br-source-${block.key}`}
      >
        {block.source}
      </p>
    </div>
  );
}

function LevelBadge({ level, testId }: { level: DataQualityLevel; testId: string }) {
  const t = useTranslations('pages.menejer');
  const tone = level === 'complete' ? 'success' : level === 'partial' ? 'warning' : 'neutral';
  return (
    <Badge tone={tone} data-test-id={testId} data-level={level}>
      {t(`dq_level_${level}` as 'dq_level_complete')}
    </Badge>
  );
}
