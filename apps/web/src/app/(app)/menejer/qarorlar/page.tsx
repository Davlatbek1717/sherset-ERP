'use client';

import { api } from '@/lib/api-client';
import { type DecisionJournalRow, decisionCsvColumns, moneyText } from '@/lib/decision-journal-csv';
import { decisionSourceTone } from '@/lib/domain-status-tone';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Input,
  NativeSelect,
  Spinner,
  buildCsv,
  csvTimestamp,
  downloadCsv,
} from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

/**
 * Menejer — QAROR JURNALI (4M TZ §8.1/8, bosqich MK21).
 *
 * TZ «qaror jurnali qabul hodisa jurnalidan texnik jihatdan chiqadi — alohida
 * ekran qilinmaydi» degan edi; **egasi ekranni tanladi**. Tanlov ekran haqida,
 * ma'lumot modeli haqida emas: bu sahifa YANGI JADVAL ochmaydi, u to'rtta
 * mavjud append-only hodisa jurnali ustidagi ko'rinish (server tomonda
 * `decision-journal-read-only.test.ts` buni qulflab turadi).
 *
 * Uch halollik qoidasi ekranga ko'chirilgan:
 *  · **Bekor qilingan qaror O'CHMAYDI** — u belgi bilan qoladi, chunki «kim
 *    nima qaror qilgan edi» nizoda aynan shu qatordan o'qiladi.
 *  · **Tizim hodisalari yashirilmaydi** — sukut bo'yicha ko'rsatilmaydi, lekin
 *    soni ekranda turadi va bir belgi bilan ochiladi.
 *  · **Eksport = EKRAN** — fayl shu yerdagi qatorlar massividan quriladi,
 *    ikkinchi so'rov emas, shuning uchun raqamlar farq qila olmaydi.
 */

type DecisionSource = 'daily_kpi' | 'work_item' | 'shift' | 'supply';

interface DecisionResponse {
  rows: DecisionJournalRow[];
  totalCount: number;
  truncated: boolean;
  hiddenSystemCount: number;
  summary: {
    bySource: Array<{ source: DecisionSource; count: number }>;
    byAction: Array<{ action: string; count: number }>;
    voidedCount: number;
  };
  facets: {
    actors: Array<{ actorId: string | null; actorName: string | null; count: number }>;
    actions: Array<{ action: string; count: number }>;
    reasons: Array<{ reasonCode: string; count: number }>;
  };
  from: string;
  to: string;
  cappedSources: DecisionSource[];
  generatedAt: string;
}

const SOURCES: DecisionSource[] = ['daily_kpi', 'work_item', 'shift', 'supply'];

/** `YYYY-MM-DD` (kun boshidan) — brauzer mintaqasidagi YARIM TUN instanti. */
function dayStartIso(day: string): string {
  return new Date(`${day}T00:00:00`).toISOString();
}

/** Tanlangan oxirgi kun ham KIRSIN: server oralig'i yarim-ochiq [from, to). */
function dayAfterIso(day: string): string {
  const d = new Date(`${day}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return d.toISOString();
}

function isoDay(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function MenejerQarorlarPage() {
  const t = useTranslations('pages.managerDecisions');
  // Navbat elementining sub'ekti — QOIDA TURI: nomlari MK07 da allaqachon
  // tarjima qilingan, shuning uchun ikkinchi nusxa yaratilmaydi.
  const tQueue = useTranslations('pages.managerQueue');
  const format = useFormatter();

  /** Kunlik-KPI holat lug'ati — MK03 da tarjima qilingan, nusxa olinmaydi. */
  const tKpi = useTranslations('pages.menejer');

  /**
   * Sabab kodi — kalit bo'lmasa xom kalit yo'li («pages.managerDecisions.
   * reason_…») chizilmaydi, KODNING O'ZI qoladi. Sabab kodlari serverdan
   * keladi va ro'yxati yopiq emas.
   */
  const reasonLabel = (code: string): string => {
    const key = `reason_${code}`;
    return t.has(key as never) ? t(key as never) : code;
  };

  /**
   * Holat yorlig'i — MANBA bo'yicha. Jurnal bir necha manbani birlashtiradi va
   * ularning holat lug'atlari BOSHQA-BOSHQA: `daily_kpi` da `escalated` =
   * «Egada», `work_item` da esa «Egaga chiqarilgan». Ikkalasi ham allaqachon
   * tarjima qilingan, shuning uchun bu yerda uchinchi nusxa OCHILMAYDI —
   * mavjud lug'at tanlanadi (`tQueue` ham xuddi shu sabab bilan olingan).
   *
   * Lug'ati yo'q manba (`shift`, `supply`) yoki yangi holat — xom kod bo'lib
   * qoladi: tarjima qarzi ko'rinib turadi, ekran esa buzilmaydi. Ilgari bu
   * yerda holat UMUMAN tarjima qilinmasdi (MK25 QA topdi).
   *
   * `src` ataylab `string` — simda (`DecisionJournalRow.source`) u shunday
   * keladi, ya'ni server yangi manba qo'shsa bu yer qulab tushmaydi.
   */
  const stateLabel = (src: string, code: string): string => {
    if (src === 'daily_kpi') {
      const key = `state_${code}`;
      return tKpi.has(key as never) ? tKpi(key as never) : code;
    }
    if (src === 'work_item') {
      const key = `status_${code}`;
      return tQueue.has(key as never) ? tQueue(key as never) : code;
    }
    return code;
  };

  const today = new Date();
  const monthAgo = new Date(today.getTime() - 29 * 86_400_000);

  const [from, setFrom] = useState(isoDay(monthAgo));
  const [to, setTo] = useState(isoDay(today));
  const [source, setSource] = useState<DecisionSource | ''>('');
  const [actorId, setActorId] = useState('');
  const [action, setAction] = useState('');
  const [reasonCode, setReasonCode] = useState('');
  const [includeSystem, setIncludeSystem] = useState(false);

  const params = useMemo(() => {
    const p = new URLSearchParams();
    p.set('from', dayStartIso(from));
    p.set('to', dayAfterIso(to));
    if (source) p.set('sources', source);
    if (actorId) p.set('actorId', actorId);
    if (action) p.set('action', action);
    if (reasonCode) p.set('reasonCode', reasonCode);
    if (includeSystem) p.set('includeSystem', 'true');
    return p.toString();
  }, [from, to, source, actorId, action, reasonCode, includeSystem]);

  const { data, isLoading } = useQuery<DecisionResponse>({
    queryKey: ['manager-decisions', params],
    queryFn: () => api.get<DecisionResponse>(`/manager/decisions?${params}`),
  });

  const rows = data?.rows ?? [];

  const when = (iso: string) =>
    format.dateTime(new Date(iso), {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const subjectText = (r: DecisionJournalRow) => {
    if (!r.subjectLabel) return t('no_subject');
    // Faqat navbat elementining yorlig'i kalit (qoida turi) — qolganlari matn.
    return r.source === 'work_item' ? tQueue(`rule_${r.subjectLabel}` as never) : r.subjectLabel;
  };

  /**
   * Eksport EKRANDAGI massivdan — ikkinchi so'rov yo'q, shuning uchun fayldagi
   * qatorlar soni ekrandagi bilan farq qila olmaydi (ustunlar
   * `decision-journal-csv.test.ts` da qulflangan).
   */
  const exportCsv = () => {
    const csv = buildCsv(
      decisionCsvColumns(
        (key) => t(key as never),
        (iso) => when(iso),
      ),
      rows,
    );
    downloadCsv(`qarorlar-${from}_${to}-${csvTimestamp()}.csv`, csv);
  };

  return (
    <div className="flex h-full flex-col gap-4 p-4" data-test-id="menejer-decisions-page">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-semibold text-xl">{t('title')}</h1>
          <p className="text-muted-foreground text-sm">{t('subtitle')}</p>
        </div>
        <Button
          type="button"
          variant="tertiary"
          onClick={exportCsv}
          disabled={rows.length === 0}
          data-test-id="decisions-export"
        >
          {t('export_csv')}
        </Button>
      </header>

      {/* Ekranning tabiati — doimiy izoh. */}
      <p className="rounded border border-info/40 bg-info/10 px-3 py-2 text-xs">
        {t('source_note')}
      </p>

      {/* ── FILTRLAR ───────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-3 rounded border px-3 py-2">
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">{t('filter_from')}</span>
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            data-test-id="decisions-from"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">{t('filter_to')}</span>
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            data-test-id="decisions-to"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">{t('filter_source')}</span>
          <NativeSelect
            value={source}
            onChange={(e) => setSource(e.target.value as DecisionSource | '')}
            data-test-id="decisions-source"
          >
            <option value="">{t('filter_source_all')}</option>
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {t(`source_${s}` as never)}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">{t('filter_actor')}</span>
          <NativeSelect
            value={actorId}
            onChange={(e) => setActorId(e.target.value)}
            data-test-id="decisions-actor"
          >
            <option value="">{t('filter_actor_all')}</option>
            {/* Variantlar davr oynasidan — aktyor tanlansa ham ro'yxat toraymaydi. */}
            {(data?.facets.actors ?? [])
              .filter((a) => a.actorId)
              .map((a) => (
                <option key={a.actorId} value={a.actorId as string}>
                  {a.actorName ?? t('no_actor_name')} ({a.count})
                </option>
              ))}
          </NativeSelect>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">{t('filter_action')}</span>
          <NativeSelect
            value={action}
            onChange={(e) => setAction(e.target.value)}
            data-test-id="decisions-action"
          >
            <option value="">{t('filter_action_all')}</option>
            {(data?.facets.actions ?? []).map((a) => (
              <option key={a.action} value={a.action}>
                {t(`action_${a.action}` as never)} ({a.count})
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">{t('filter_reason')}</span>
          <NativeSelect
            value={reasonCode}
            onChange={(e) => setReasonCode(e.target.value)}
            data-test-id="decisions-reason"
          >
            <option value="">{t('filter_reason_all')}</option>
            {(data?.facets.reasons ?? []).map((r) => (
              <option key={r.reasonCode} value={r.reasonCode}>
                {t(`reason_${r.reasonCode}` as never)} ({r.count})
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="flex items-center gap-2 text-xs">
          <Checkbox
            checked={includeSystem}
            onCheckedChange={(v) => setIncludeSystem(v === true)}
            data-test-id="decisions-include-system"
          />
          <span>{t('show_system')}</span>
        </label>
      </div>

      {/* ── JAMLAR — hammasi EKRANDAGI qatorlar haqida ─────────────────────── */}
      {data && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <span className="font-medium tabular-nums">
            {t('total_count', { count: rows.length })}
          </span>
          {data.summary.voidedCount > 0 && (
            <Badge tone="neutral">
              {t('voided_badge')}: {data.summary.voidedCount}
            </Badge>
          )}
          {/* Yashirilgan tizim hodisalari JIM qolmaydi. */}
          {data.hiddenSystemCount > 0 && (
            <span className="text-muted-foreground text-xs">
              {t('hidden_system', { count: data.hiddenSystemCount })}
            </span>
          )}
          {data.truncated && (
            <span className="text-muted-foreground text-xs">
              {t('truncated', { shown: rows.length, total: data.totalCount })}
            </span>
          )}
          {/* Manba o'qish chegarasi — oshkora aytiladi. */}
          {data.cappedSources.length > 0 && (
            <span className="text-warning text-xs">
              {t('capped_sources', {
                sources: data.cappedSources.map((s) => t(`source_${s}` as never)).join(', '),
              })}
            </span>
          )}
          <span className="text-muted-foreground text-xs">{t('export_note')}</span>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex justify-center p-6">
            <Spinner />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState title={t('empty_title')} description={t('empty_hint')} />
        ) : (
          <Card className="overflow-hidden">
            <ul className="divide-y">
              {rows.map((r) => (
                <li
                  key={r.key}
                  className="flex flex-col gap-1 px-3 py-2 text-sm"
                  data-test-id={`decision-row-${r.key}`}
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {when(r.occurredAt)}
                    </span>
                    <Badge tone={decisionSourceTone(r.source)}>
                      {t(`source_${r.source}` as never)}
                    </Badge>
                    <span className="font-medium">{t(`action_${r.action}` as never)}</span>
                    {/* Bekor qilingan qaror KO'RINIB QOLADI — o'chirilmaydi. */}
                    {r.voided && (
                      <Badge tone="destructive" title={t('voided_hint')}>
                        {t('voided_badge')}
                      </Badge>
                    )}
                    <span className="min-w-0 flex-1 truncate text-muted-foreground text-xs">
                      {subjectText(r)}
                      {r.subjectEmployeeName ? ` · ${r.subjectEmployeeName}` : ''}
                    </span>
                    {r.money.length > 0 && (
                      <span className="text-right text-xs tabular-nums">{moneyText(r.money)}</span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-xs">
                    {/* Ism topilmasa ID qoladi — «Tizim» deb yozilmaydi. */}
                    <span>
                      {r.actorName ?? r.actorId ?? t('no_actor_name')} ·{' '}
                      {t(`actor_${r.actorType}` as never)}
                    </span>
                    <span>
                      {stateLabel(r.source, r.fromState)} → {stateLabel(r.source, r.toState)}
                    </span>
                    <span>{r.reasonCode ? reasonLabel(r.reasonCode) : t('no_reason')}</span>
                    {r.comment && <span className="min-w-0 truncate">«{r.comment}»</span>}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}
