'use client';

/**
 * «Korxona puli qayerda» — pul manzarasi paneli (4M TZ §8.1/1 · MK15).
 *
 * SAVOL: **hozir qayerda qancha pul turibdi** — kassalarda · bank hisoblarida ·
 * mijoz qarzida · ta'minotchi qarzida · haydovchi qo'lida · yo'ldagi tovarda.
 *
 * 🔴 EKRAN SHARTNOMASI — **«hisoblanmadi» ≠ «nol»**. O'lchanmagan blok
 * `0 so'm` bo'lib chizilmaydi, `—` bo'lib chiziladi. Bu mavhum ehtiyotkorlik
 * emas: bank hisobining qoldig'ini daftar Faza 11 gacha umuman yozmagan, ya'ni
 * saqlangan `0` u yerda «o'lchanmagan» degani. «Bankda 0 so'm» degan katak
 * egaga jonli yolg'on aytardi — va u shunga qarab to'lov qarorini qilardi.
 *
 * Xuddi shu sabab bilan **sof qoldiq bitta blok o'lchanmagan bo'lsa `—`**:
 * qolganlarining yig'indisi to'liq raqamdek ko'rinardi.
 *
 * ⚠️ Panel HECH NARSANI BLOKLAMAYDI va o'zgartirmaydi — faqat ko'rsatadi.
 * Shuning uchun bu yerda amal tugmasi ham, filtr ham yo'q: har raqam o'z
 * hisobotidan keladi va o'sha yerda batafsil ko'riladi.
 */

import {
  type DataQualityLevel,
  type MoneyMapBlock,
  type MoneyMapSnapshot,
  managerMoneyMapApi,
} from '@/lib/manager-api';
import { Badge, Skeleton, formatMoney } from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

export function MoneyMapScreen() {
  const t = useTranslations('pages.menejer');

  const { data, isLoading } = useQuery<MoneyMapSnapshot>({
    queryKey: ['manager', 'money-map'],
    queryFn: () => managerMoneyMapApi.snapshot(),
  });

  /**
   * Summa kataklarining YAGONA chizuvchisi.
   *
   * `null` bu yerda — va faqat bu yerda — `—` ga aylanadi, ya'ni birorta
   * katak tasodifan `0 so'm` bo'lib qolishi mumkin emas. Nol qiymat esa
   * ODDIY raqam bo'lib chiziladi: u haqiqiy o'lchov.
   */
  const money = (v: string | null, currency: string): string =>
    v === null ? '—' : formatMoney(v, currency);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-semibold text-[var(--ms-text-strong)] text-xl">{t('mm_title')}</h1>
        <p className="text-[var(--ms-text-muted)] text-sm">{t('mm_subtitle')}</p>
      </header>

      {isLoading || !data ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <>
          {/* ── Yakun: sof qoldiq ──────────────────────────────────────── */}
          <section className="rounded-md border border-[var(--ms-border)] p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h2 className="font-medium text-[var(--ms-text-strong)]">{t('mm_net_title')}</h2>
                <p
                  className="font-semibold text-2xl text-[var(--ms-text-strong)]"
                  data-test-id="mm-net"
                >
                  {money(data.summary.netMinor, data.summary.currency)}
                </p>
              </div>
              <LevelBadge level={data.summary.quality} testId="mm-overall" />
            </div>
            <p className="mt-1 text-[var(--ms-text-muted)] text-xs">
              {data.summary.netMinor === null ? t('mm_net_unmeasured') : t('mm_net_hint')}
            </p>

            {/* Kursi topilmagan pul jamiga QO'SHILMAGAN — u jimgina yo'qolmasin,
                shuning uchun o'z valyutasida alohida ko'rinadi (M-12). */}
            {data.summary.unconvertedByCurrency.length > 0 && (
              <p className="mt-2 text-[var(--ms-text-muted)] text-xs" data-test-id="mm-unconverted">
                {t('mm_unconverted')}:{' '}
                {data.summary.unconvertedByCurrency
                  .map((u) => formatMoney(u.amountMinor, u.currency))
                  .join(' · ')}
              </p>
            )}
          </section>

          {/* ── Bloklar ────────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {data.blocks.map((b) => (
              <BlockCard key={b.key} block={b} currency={data.summary.currency} money={money} />
            ))}
          </div>

          <p className="text-[var(--ms-text-muted)] text-xs">{t('mm_footer_hint')}</p>
        </>
      )}
    </div>
  );
}

function BlockCard({
  block,
  currency,
  money,
}: {
  block: MoneyMapBlock;
  currency: string;
  money: (v: string | null, currency: string) => string;
}) {
  const t = useTranslations('pages.menejer');
  const unmeasured = block.amountMinor === null;

  return (
    <div
      data-test-id={`mm-block-${block.key}`}
      data-direction={block.direction}
      className="rounded-md border border-[var(--ms-border)] p-3"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-medium text-[var(--ms-text)] text-sm">
          {t(`mm_block_${block.key}` as 'mm_block_cash')}
        </h3>
        {/* «To'liq» bayrog'i shovqin qilmasin — faqat diqqat talab qilgani
            ko'rinadi (qisman / hisoblanmadi). */}
        {block.quality !== 'complete' && (
          <LevelBadge level={block.quality} testId={`mm-quality-${block.key}`} />
        )}
      </div>

      <p
        className={`mt-1 font-semibold text-lg ${
          unmeasured ? 'text-[var(--ms-text-muted)]' : 'text-[var(--ms-text-strong)]'
        }`}
        data-test-id={`mm-amount-${block.key}`}
      >
        {money(block.amountMinor, currency)}
      </p>

      {/* Passiv blok — bu pul BIZNIKI emas; yakunda ayiriladi. */}
      {block.direction === 'liability' && (
        <p className="text-[var(--ms-text-muted)] text-xs">{t('mm_liability_hint')}</p>
      )}

      {/* Sabab bitta umumiy matn: blok o'lchanmagan bo'lishining ikki yo'li bor
          (manba javob bermadi / u yerda hech qachon o'lchov bo'lmagan) va
          ekranda ikkalasining ma'nosi bir xil — «bu raqamga tayanma». */}
      {unmeasured && <p className="text-[var(--ms-text-muted)] text-xs">{t('mm_unmeasured')}</p>}

      {block.unconvertedByCurrency.length > 0 && (
        <p className="mt-1 text-[var(--ms-text-muted)] text-xs">
          {t('mm_unconverted')}:{' '}
          {block.unconvertedByCurrency
            .map((u) => formatMoney(u.amountMinor, u.currency))
            .join(' · ')}
        </p>
      )}

      {/* Provenance — «bu raqam qayerdan?». Ikki ekran bir xil raqamni
          ko'rsatishi kerakligi shu yerdan tekshiriladi. */}
      <p
        className="mt-2 text-[10px] text-[var(--ms-text-muted)]"
        data-test-id={`mm-source-${block.key}`}
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
