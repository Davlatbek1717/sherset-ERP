'use client';

import { PrintShell } from '@/components/print/print-shell';
import { api } from '@/lib/api-client';
import { currencyDisplayName, formatDate, formatMoney } from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';

/**
 * «Акт сверки взаимных расчётов» — printable reconciliation act.
 *
 * Opened from the counterparty card «Создать акт сверки» → «Печать». Reads the
 * organization / counterparty / period / contract / currency from the query
 * string and renders the standard act (opening balance → chronological
 * movements with Дебет/Кредит → turnover → closing balance) plus a signature
 * block. Data: GET /reports/counterparty-act. Shares the app-wide print.css so
 * it matches every other /print/* document side-by-side.
 */
interface ActRow {
  date: string;
  typeKey: string;
  number: string;
  debitMinor: string;
  creditMinor: string;
}
interface ActParty {
  id: string;
  name: string;
  legalTitle: string | null;
  legalAddress: string | null;
  inn: string | null;
}
interface ActReport {
  organization: ActParty;
  counterparty: ActParty;
  contract: { id: string; name: string } | null;
  from: string | null;
  to: string;
  currency: string;
  openingMinor: string;
  closingMinor: string;
  totalDebitMinor: string;
  totalCreditMinor: string;
  rows: ActRow[];
}

/**
 * `pages.print.act.doc_types` da tarjimasi BOR turlar. Ro'yxat balans
 * jurnalining `docType` reyestriga (`counterparty-balance-doc-types.ts`) mos
 * turadi; bu yerda yo'q tur qatorni yo'qotmaydi (yuqoridagi `docTypeLabel`).
 */
const ACT_DOC_TYPES = new Set([
  'invoiceOut',
  'invoiceIn',
  'paymentIn',
  'paymentOut',
  'cashIn',
  'cashOut',
  'prepayment',
  'prepaymentReturn',
  'adjustment',
  'supply',
  // Faza 13 (`PP-02`): taminotchiga qaytarish endi balans jurnaliga yozadi.
  'purchaseReturn',
  'debt',
  'debtpayment',
  'retailsale',
  // G1: vozvrat pulining kassadan qaytarilishi balans jurnaliga yozadi.
  'returnPayout',
  // G1 (2026-08-25): to'lovning JUFTI — vozvratning o'zi (`salesReturn`,
  // `−sumMinor`). Reyestrda 2026-08-12 dan beri bor, lekin bu ro'yxatga
  // qo'shilmagani uchun akt qatorida xom `salesReturn` satri chiqardi.
  'salesReturn',
  // A1/A2/A3 (2026-08-25) — MIJOZ AVANSINING uch harakati. Uchalasi ham
  // balans jurnaliga yozadi, ya'ni akt-sverkada ALLAQACHON qator bo'lib
  // chiqardi — faqat yorliqsiz (xom `customerPrepay` satri bilan).
  'customerPrepay',
  'salePrepay',
  'customerPrepayRefund',
  'opening',
]);

export default function PrintReconciliationActPage() {
  const sp = useSearchParams();
  const t = useTranslations('pages.print');
  const auto = sp.get('auto') === '1';

  const organizationId = sp.get('organizationId') ?? '';
  const counterpartyId = sp.get('counterpartyId') ?? '';
  const from = sp.get('from') ?? '';
  const to = sp.get('to') ?? '';
  const contractId = sp.get('contractId') ?? '';
  const currency = sp.get('currency') ?? 'UZS';

  const qs = new URLSearchParams();
  qs.set('organizationId', organizationId);
  qs.set('counterpartyId', counterpartyId);
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);
  if (contractId) qs.set('contractId', contractId);
  qs.set('currency', currency);

  const { data, isLoading, isError } = useQuery<ActReport>({
    queryKey: ['counterparty-act', qs.toString()],
    queryFn: () => api.get<ActReport>(`/reports/counterparty-act?${qs.toString()}`),
    enabled: !!organizationId && !!counterpartyId,
  });

  if (!organizationId || !counterpartyId)
    return (
      <div className="print-page" style={{ padding: 24 }}>
        —
      </div>
    );
  if (isLoading)
    return (
      <div className="print-page" style={{ padding: 24 }}>
        …
      </div>
    );
  if (isError || !data)
    return (
      <div className="print-page" style={{ padding: 24 }}>
        {t('act.empty')}
      </div>
    );

  const partyName = (p: ActParty) => p.legalTitle ?? p.name;
  const partyDetails = (p: ActParty) =>
    [p.legalAddress, p.inn ? `STIR: ${p.inn}` : null].filter(Boolean).join('\n') || null;
  // Tiyin string → display number with no currency word; 0 → blank cell (act convention).
  const cell = (minor: string) => {
    const v = BigInt(minor);
    return v === 0n ? '' : formatMoney(v, data.currency, { displayAs: 'none' });
  };
  const signed = (minor: string, side: 'debit' | 'credit') => {
    const v = BigInt(minor);
    if (side === 'debit') return v > 0n ? v.toString() : '0';
    return v < 0n ? (-v).toString() : '0';
  };
  /**
   * Hujjat turi yorlig'i. Faza 10 dan beri `typeKey` — balans jurnalining
   * `docType` qiymati, ya'ni yopiq union EMAS: yangi balans-yozuvchi qo'shilsa
   * bu yerga tarjimasiz tur kelishi mumkin. Bunday holatda qator TUSHIB
   * QOLMAYDI — turning o'zi ko'rsatiladi (saldo baribir to'g'ri).
   */
  const docTypeLabel = (typeKey: string) =>
    ACT_DOC_TYPES.has(typeKey)
      ? t(`act.doc_types.${typeKey}` as 'act.doc_types.invoiceOut')
      : typeKey;

  const closing = BigInt(data.closingMinor);
  const orgName = partyName(data.organization);
  const cpName = partyName(data.counterparty);
  const summary =
    closing > 0n
      ? t('act.summary_debtor', {
          org: orgName,
          cp: cpName,
          amount: formatMoney(closing, data.currency),
        })
      : closing < 0n
        ? t('act.summary_creditor', {
            org: orgName,
            cp: cpName,
            amount: formatMoney(-closing, data.currency),
          })
        : t('act.summary_settled', { org: orgName, cp: cpName });

  const period = from
    ? t('act.period_full', {
        from: formatDate(data.from ?? from),
        to: formatDate(data.to),
      })
    : t('act.period_until', { to: formatDate(data.to) });

  return (
    <PrintShell autoPrint={auto}>
      <div className="doc-header">
        <h1 className="doc-title">{t('act.title')}</h1>
        <div className="doc-subtitle">
          {period}
          {' · '}
          {t('act.between', { org: orgName, cp: cpName })}
          {data.contract ? ` · ${t('act.by_contract', { contract: data.contract.name })}` : ''}
          {` · ${currencyDisplayName(data.currency)}`}
        </div>
      </div>

      <div className="org-block">
        <div className="party-card">
          <div className="party-label">{t('party.organization')}</div>
          <div className="party-name">{orgName}</div>
          {partyDetails(data.organization) ? (
            <div className="party-detail">{partyDetails(data.organization)}</div>
          ) : null}
        </div>
        <div className="party-card">
          <div className="party-label">{t('party.agent')}</div>
          <div className="party-name">{cpName}</div>
          {partyDetails(data.counterparty) ? (
            <div className="party-detail">{partyDetails(data.counterparty)}</div>
          ) : null}
        </div>
      </div>

      <p style={{ fontSize: 11, color: '#374151', margin: '8px 0 0' }}>{t('act.intro')}</p>

      <table className="positions">
        <thead>
          <tr>
            <th>{t('act.col_date')}</th>
            <th>{t('act.col_doc')}</th>
            <th className="num">{t('act.col_debit')}</th>
            <th className="num">{t('act.col_credit')}</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ fontWeight: 600 }}>
            <td colSpan={2}>
              {t('act.opening')}{' '}
              {from
                ? t('act.on_date', { date: formatDate(data.from ?? from) })
                : t('act.from_start')}
            </td>
            <td className="num">{cell(signed(data.openingMinor, 'debit'))}</td>
            <td className="num">{cell(signed(data.openingMinor, 'credit'))}</td>
          </tr>
          {data.rows.length === 0 ? (
            <tr>
              <td colSpan={4} style={{ textAlign: 'center', color: '#6b7280' }}>
                {t('act.no_movements')}
              </td>
            </tr>
          ) : (
            data.rows.map((r, i) => (
              <tr key={`${r.typeKey}-${r.number}-${i}`}>
                <td>{formatDate(r.date)}</td>
                <td>
                  {docTypeLabel(r.typeKey)} № {r.number}
                </td>
                <td className="num">{cell(r.debitMinor)}</td>
                <td className="num">{cell(r.creditMinor)}</td>
              </tr>
            ))
          )}
          <tr style={{ fontWeight: 600 }}>
            <td colSpan={2}>{t('act.turnover')}</td>
            <td className="num">{cell(data.totalDebitMinor)}</td>
            <td className="num">{cell(data.totalCreditMinor)}</td>
          </tr>
          <tr style={{ fontWeight: 700 }}>
            <td colSpan={2}>
              {t('act.closing')} {t('act.on_date', { date: formatDate(data.to) })}
            </td>
            <td className="num">{cell(signed(data.closingMinor, 'debit'))}</td>
            <td className="num">{cell(signed(data.closingMinor, 'credit'))}</td>
          </tr>
        </tbody>
      </table>

      <p style={{ fontSize: 12, margin: '14px 0 0' }}>{summary}</p>

      <div className="signatures">
        <div>
          <div className="sig-name">{t('act.sig_org', { org: orgName })}</div>
          <div className="sig-line">
            {t('signature.director')} / {t('act.sig_stamp')}
          </div>
        </div>
        <div>
          <div className="sig-name">{t('act.sig_cp', { cp: cpName })}</div>
          <div className="sig-line">
            {t('signature.director')} / {t('act.sig_stamp')}
          </div>
        </div>
      </div>
    </PrintShell>
  );
}
