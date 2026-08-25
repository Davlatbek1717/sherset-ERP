'use client';

import { api } from '@/lib/api-client';
// Q4 — MANBA belgisining rangi UMUMIY lug'atdan (UI Convention 6): AYNAN
// shu xarita `/debts` ro'yxatida ham ishlatiladi, sahifa-lokal nusxa
// ikki ekranni bir kun ayirardi.
import { debtSourceTone } from '@/lib/domain-status-tone';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  NativeSelect,
  Spinner,
  formatMoney,
} from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState } from 'react';

/**
 * Menejer — QARZ UNDIRISH ISH RO'YXATI (4M TZ §8.1/2, bosqich MK16).
 *
 * Bir ekranda: **kimdan qancha** undirish kerak · **necha kun** muddati o'tgan ·
 * **kim javobgar** · **oxirgi aloqa qachon** · **harakat**.
 *
 * ⚠️ **BU EKRAN HECH NARSANI BLOKLAMAYDI** — sotuvni ham, qarz berishni ham
 * to'xtatmaydi (4M TZ §5.1 falsafasi).
 *
 * Uch halollik qoidasi ekranga ko'chirilgan:
 *  · **NULL ≠ 0** — muddat qo'yilmagan qarz «bugun» deb ko'rsatilmaydi, u
 *    alohida «muddatsiz» belgisi oladi (bu o'zi ish: muddat qo'yilishi kerak).
 *  · **Valyutalar qo'shilmaydi** — jam har valyuta uchun alohida.
 *  · **Eslatma bir kunda bir marta** — bugun xabar ketgan qarzning tugmasi
 *    o'chadi va SABABI yoziladi (jimgina o'chib qolmaydi).
 *
 * Yangi jo'natgich yo'q: tugma mavjud SMS/Telegram eslatma yo'lini chaqiradi.
 * Qo'ng'iroq esa qarz kartasida qayd etiladi (havola).
 *
 * 🔴 **Q4 (2026-08-25) — MANBA.** Har qatorda «bu qarz qayerdan keldi»
 * belgisi turadi (kassa cheki / reyestr) va kassa qarzida CHEK RAQAMI
 * havola bo'lib chiqadi. Sarlavhada manba filtri bor; filtr yoqilganda
 * bo'sh holat matni ham SHU kesimni aytadi — aks holda filtr qarzni
 * jimgina yashirgandek ko'rinardi.
 * Reja: `docs/plans/2026-08-25-kassa-qarzi-undirish-reyestri.md` (§Q4).
 */

type CollectionBucket = 'overdue' | 'due_today' | 'upcoming' | 'no_due_date';
type LastContactKind = 'call' | 'reminder' | 'note';
type RemindBlockedReason = 'no_phone' | 'reminded_today';
type Channel = 'sms' | 'telegram';
/**
 * Q4 — qator QAYERDAN keldi. Yopiq ro'yxat server bilan AYNAN bir xil
 * (`manager/collection/debt-collection.ts#CollectionSource`):
 *   `registry`   — qo'lda ochilgan `QRZ-…` yoki adopsiya qatori;
 *   `retailsale` — kassa chekidan avtomatik ochilgan qator.
 */
type CollectionSource = 'registry' | 'retailsale';
/** Filtr holati: `all` — kesim yo'q, serverga umuman uzatilmaydi. */
type SourceFilter = 'all' | CollectionSource;

interface CollectionRow {
  debtId: string;
  debtName: string;
  counterpartyId: string;
  counterpartyName: string;
  counterpartyPhone: string | null;
  totalMinor: string;
  paidMinor: string;
  remainingMinor: string;
  currency: string;
  dueAt: string | null;
  overdueDays: number | null;
  bucket: CollectionBucket;
  problem: boolean;
  responsible: { id: string; name: string; role: 'owner' | 'issuer' } | null;
  lastContactAt: string | null;
  lastContactKind: LastContactKind | null;
  lastCallOutcome: string | null;
  remindedToday: boolean;
  canRemind: boolean;
  remindBlockedReason: RemindBlockedReason | null;
  /** Q4 — manba belgisi. */
  source: CollectionSource;
  /** Q4 — chek id'si (havola manzili) yoki `null`. */
  sourceDocId: string | null;
  /** Q4 — chek raqami (`CHK-…`) yoki `null` (hujjat topilmadi). */
  sourceDocNumber: string | null;
}

interface CollectionResponse {
  rows: CollectionRow[];
  summary: {
    byCurrency: Array<{ currency: string; remainingMinor: string; count: number }>;
    overdueCount: number;
    dueTodayCount: number;
    upcomingCount: number;
    noDueDateCount: number;
    problemCount: number;
    /** Q4 — kassa chekidan kelgan qatorlar soni. */
    retailSaleCount: number;
    /** Q4 — reyestrda qo'lda ochilgan qatorlar soni. */
    registryCount: number;
  };
  totalCount: number;
  truncated: boolean;
  generatedAt: string;
}

interface RemindResponse {
  requested: number;
  queued: number;
  journaled: number;
  skipped: Array<{ debtId: string; name: string; reason: string }>;
}

const BUCKET_TONE: Record<CollectionBucket, 'destructive' | 'warning' | 'neutral' | 'info'> = {
  overdue: 'destructive',
  due_today: 'warning',
  upcoming: 'info',
  no_due_date: 'neutral',
};

export default function MenejerUndirishPage() {
  const t = useTranslations('pages.menejerCollection');
  const format = useFormatter();
  const queryClient = useQueryClient();

  const [scope, setScope] = useState<'due' | 'all'>('due');
  const [problemOnly, setProblemOnly] = useState(false);
  // Q4 — manba kesimi. Default `all`: ekran ochilganda menejer HAMMASINI
  // ko'radi (filtr hech qachon qarzni jimgina yashirmaydi).
  const [source, setSource] = useState<SourceFilter>('all');
  const [channel, setChannel] = useState<Channel>('sms');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lastResult, setLastResult] = useState<RemindResponse | null>(null);

  const { data, isLoading } = useQuery<CollectionResponse>({
    queryKey: ['manager-collection', scope, problemOnly, source],
    queryFn: () =>
      api.get<CollectionResponse>(
        `/manager/collection?scope=${scope}${problemOnly ? '&problemOnly=true' : ''}` +
          // `all` serverga UZATILMAYDI — «kesim yo'q» degani, sxemada esa
          // bunday qiymat yo'q (yopiq ro'yxat: registry | retailsale).
          (source === 'all' ? '' : `&source=${source}`),
      ),
    refetchInterval: 300_000,
  });

  const rows = data?.rows ?? [];
  // Faqat YUBORISH MUMKIN bo'lganlar tanlanadi — telefoni yo'q yoki bugun
  // eslatilgan qator tanlanmaydi, shuning uchun tugma yolg'on va'da bermaydi.
  const remindable = rows.filter((r) => r.canRemind);
  const chosen = remindable.filter((r) => selected.has(r.debtId));

  const remind = useMutation<RemindResponse>({
    mutationFn: () =>
      api.post<RemindResponse>('/manager/collection/remind', {
        debtIds: chosen.map((r) => r.debtId),
        channel,
      }),
    onSuccess: (res) => {
      setLastResult(res);
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: ['manager-collection'] });
    },
  });

  const toggle = (debtId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(debtId)) next.delete(debtId);
      else next.add(debtId);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) =>
      prev.size === remindable.length ? new Set() : new Set(remindable.map((r) => r.debtId)),
    );
  };

  const when = (iso: string) =>
    format.dateTime(new Date(iso), {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

  /**
   * O'tkazib yuborilgan qatorning SABABI — o'qiladigan matn.
   *
   * Jo'natgichlar sabab kodlarining YOPIQ ro'yxatini bermaydi:
   * `TelegramService.notifyCounterparty` Telegram xatosining MATNINI ham sabab
   * qilib uzatadi (`reason: msg.slice(0, 200)`), ya'ni kodni oldindan tarjima
   * qilib bo'lmaydi. Kalitni to'g'ridan-to'g'ri `t()` ga berish bu holatda
   * ekranga xom kalit yo'lini chizardi — MK25 QA da aynan shu ko'rindi:
   * «Romashka MChJ — pages.menejerCollection.reason_no_chat».
   *
   * Shuning uchun: kalit bo'lsa — tarjima, bo'lmasa — zaxira matn va kodning
   * O'ZI (kod yashirilsa menejer nosozlikni umuman aniqlay olmaydi).
   */
  const reasonLabel = (code: string): string => {
    const key = `reason_${code}`;
    return t.has(key as never) ? t(key as never) : t('reason_unknown', { code });
  };

  return (
    <div className="flex h-full flex-col gap-4 p-4" data-test-id="menejer-collection-page">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-semibold text-xl">{t('title')}</h1>
          <p className="text-muted-foreground text-sm">{t('subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">{t('scope')}</span>
            <NativeSelect
              value={scope}
              onChange={(e) => setScope(e.target.value as 'due' | 'all')}
              data-test-id="collection-scope"
            >
              <option value="due">{t('scope_due')}</option>
              <option value="all">{t('scope_all')}</option>
            </NativeSelect>
          </label>
          {/* Q4 — MANBA kesimi: «bu qarz qayerdan keldi». */}
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">{t('source')}</span>
            <NativeSelect
              value={source}
              onChange={(e) => setSource(e.target.value as SourceFilter)}
              data-test-id="collection-source"
            >
              <option value="all">{t('source_all')}</option>
              <option value="retailsale">{t('source_retailsale')}</option>
              <option value="registry">{t('source_registry')}</option>
            </NativeSelect>
          </label>
          <label className="flex items-center gap-2 text-xs">
            <Checkbox
              checked={problemOnly}
              onCheckedChange={(v) => setProblemOnly(v === true)}
              data-test-id="collection-problem-only"
            />
            <span>{t('problem_only')}</span>
          </label>
        </div>
      </header>

      {/* Doimiy izoh — ekranning tabiati shu. */}
      <p className="rounded border border-info/40 bg-info/10 px-3 py-2 text-xs">
        {t('no_block_note')}
      </p>

      {data && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          {/* Valyutalar QO'SHILMAYDI — har biri o'z jamida. */}
          {data.summary.byCurrency.map((c) => (
            <span key={c.currency} className="font-medium tabular-nums">
              {t('currency_total', {
                currency: c.currency,
                value: formatMoney(BigInt(c.remainingMinor)),
                count: c.count,
              })}
            </span>
          ))}
          {data.summary.overdueCount > 0 && (
            <Badge tone="destructive">
              {t('overdue_count', { count: data.summary.overdueCount })}
            </Badge>
          )}
          {data.summary.dueTodayCount > 0 && (
            <Badge tone="warning">
              {t('due_today_count', { count: data.summary.dueTodayCount })}
            </Badge>
          )}
          {/* «Muddat qo'yilmagan» — 0 emas, alohida holat. */}
          {data.summary.noDueDateCount > 0 && (
            <Badge tone="neutral">
              {t('no_due_date_count', { count: data.summary.noDueDateCount })}
            </Badge>
          )}
          {data.summary.problemCount > 0 && (
            <Badge tone="neutral">{t('problem_count', { count: data.summary.problemCount })}</Badge>
          )}
          {/* Q4 — «kassadan qancha» soni. Egasining shikoyati aynan shu haqda
              edi: ro'yxatdagi umumiy son o'sganda menejer bir qarashda
              «bu yangi qarz emas, ko'rinmagan qarz endi ko'rinmoqda» degan
              javobni oladi. Nol bo'lsa ko'rsatilmaydi — bo'sh belgi shovqin. */}
          {data.summary.retailSaleCount > 0 && (
            <Badge tone="info" data-test-id="collection-retailsale-count">
              {t('retailsale_count', { count: data.summary.retailSaleCount })}
            </Badge>
          )}
          {data.truncated && (
            <span className="text-muted-foreground">
              {t('truncated', { shown: rows.length, total: data.totalCount })}
            </span>
          )}
        </div>
      )}

      {/* ── HARAKAT paneli ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 rounded border px-3 py-2">
        <Checkbox
          checked={remindable.length > 0 && selected.size === remindable.length}
          onCheckedChange={toggleAll}
          disabled={remindable.length === 0}
          data-test-id="collection-select-all"
        />
        <span className="text-sm">{t('selected_count', { count: chosen.length })}</span>
        <NativeSelect value={channel} onChange={(e) => setChannel(e.target.value as Channel)}>
          <option value="sms">{t('channel_sms')}</option>
          <option value="telegram">{t('channel_telegram')}</option>
        </NativeSelect>
        <Button
          onClick={() => remind.mutate()}
          disabled={chosen.length === 0 || remind.isPending}
          data-test-id="collection-remind"
        >
          {remind.isPending ? t('sending') : t('send_reminder')}
        </Button>
        <span className="text-muted-foreground text-xs">{t('once_a_day_note')}</span>
      </div>

      {/* Natija HALOL: nechta ketdi, nechta ketmadi va NEGA. */}
      {lastResult && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded border px-3 py-2 text-xs">
          <span className="font-medium">{t('result_queued', { count: lastResult.queued })}</span>
          {lastResult.skipped.length > 0 && (
            <span className="text-muted-foreground">
              {t('result_skipped', { count: lastResult.skipped.length })}:{' '}
              {lastResult.skipped
                .map((s) => `${s.name || s.debtId} — ${reasonLabel(s.reason)}`)
                .join(' · ')}
            </span>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex justify-center p-6">
            <Spinner />
          </div>
        ) : rows.length === 0 ? (
          // Q4 — bo'sh holat MANBA kesimini AYTADI. Aks holda menejer
          // «kassa qarzlari» filtri yoqilganini unutib «umuman qarz yo'q»
          // deb o'ylardi — filtr qarzni jimgina yashirgan bo'lardi.
          <EmptyState
            title={t('empty_title')}
            description={
              source === 'retailsale'
                ? t('empty_hint_retailsale')
                : source === 'registry'
                  ? t('empty_hint_registry')
                  : t('empty_hint')
            }
          />
        ) : (
          <Card className="overflow-hidden">
            <ul className="divide-y">
              {rows.map((r) => (
                <li key={r.debtId} className="flex flex-col gap-1 px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <Checkbox
                      checked={selected.has(r.debtId)}
                      onCheckedChange={() => toggle(r.debtId)}
                      disabled={!r.canRemind}
                      data-test-id={`collection-row-${r.debtId}`}
                    />
                    <span className="min-w-0 flex-1">
                      <Link
                        href={`/debts/${r.debtId}`}
                        className="block truncate font-medium hover:underline"
                      >
                        {r.counterpartyName || t('no_counterparty')}
                      </Link>
                      <span className="block truncate text-muted-foreground text-xs">
                        {r.debtName}
                        {' · '}
                        {/* Javobgarsizlik yashirilmaydi — u o'zi tuzatiladigan holat. */}
                        {r.responsible
                          ? `${t(`role_${r.responsible.role}`)}: ${r.responsible.name}`
                          : t('no_responsible')}
                        {' · '}
                        {r.lastContactAt
                          ? t('last_contact', {
                              kind: t(`contact_${r.lastContactKind ?? 'note'}` as never),
                              date: when(r.lastContactAt),
                            })
                          : t('never_contacted')}
                      </span>
                    </span>

                    <span className="text-right tabular-nums">
                      <span className="block font-medium">
                        {formatMoney(BigInt(r.remainingMinor))} {r.currency}
                      </span>
                      <span className="block text-muted-foreground text-xs">
                        {t('of_total', { value: formatMoney(BigInt(r.totalMinor)) })}
                      </span>
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* Q4 — MANBA belgisi va chek raqami havolasi.
                        Raqam `null` bo'lsa (chek topilmadi) faqat belgi
                        qoladi — xom id chizilmaydi. */}
                    <Badge
                      tone={debtSourceTone(r.source)}
                      data-test-id={`collection-source-${r.source}`}
                    >
                      {/* Kalit STATIK yoziladi (dinamik `t(\`…${x}\`)` EMAS):
                          i18n gate faqat statik kalitni ko'radi va MK25 da
                          aynan dinamik kalit ekranda xom yo'l bo'lib chiqqan. */}
                      {r.source === 'retailsale'
                        ? t('source_badge_retailsale')
                        : t('source_badge_registry')}
                    </Badge>
                    {r.source === 'retailsale' && r.sourceDocId && r.sourceDocNumber && (
                      <Link
                        href={`/retail/sales/${r.sourceDocId}`}
                        className="text-info text-xs hover:underline"
                        data-test-id="collection-sale-link"
                      >
                        {r.sourceDocNumber}
                      </Link>
                    )}
                    <Badge tone={BUCKET_TONE[r.bucket]}>
                      {r.overdueDays === null
                        ? t('bucket_no_due_date')
                        : r.overdueDays > 0
                          ? t('overdue_days', { days: r.overdueDays })
                          : r.overdueDays === 0
                            ? t('bucket_due_today')
                            : t('due_in_days', { days: -r.overdueDays })}
                    </Badge>
                    {r.dueAt && (
                      <span className="text-muted-foreground text-xs">
                        {t('due_at', { date: when(r.dueAt) })}
                      </span>
                    )}
                    {r.problem && <Badge tone="destructive">{t('problem')}</Badge>}
                    {/* Tugma nega o'chganini AYTADI. */}
                    {r.remindBlockedReason && (
                      <span className="text-muted-foreground text-xs">
                        {t(`blocked_${r.remindBlockedReason}` as never)}
                      </span>
                    )}
                    <Link href={`/debts/${r.debtId}`} className="text-info text-xs hover:underline">
                      {t('open_call_card')}
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      {/* Qamrov cheklovi OCHIQ yoziladi. */}
      <p className="text-muted-foreground text-xs">{t('scope_note')}</p>
    </div>
  );
}
