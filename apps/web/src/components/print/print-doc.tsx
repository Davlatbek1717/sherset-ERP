'use client';

import { amountInWords } from '@moysklad/money';
import { formatMoney } from '@moysklad/ui';
import { useLocale, useTranslations } from 'next-intl';

export interface PrintDocPosition {
  position: number;
  productName: string;
  productCode: string | null;
  uom: string | null;
  /** Decimal as string, e.g. "5.500" */
  quantity: string;
  /** BigInt as string in tiyin (minor units) */
  priceMinor: string;
  /** BigInt as string in tiyin */
  totalMinor: string;
  /** Discount percent 0..100 */
  discount: string;
  vat: number | null;
  /** BigInt as string */
  vatAmountMinor?: string;
}

export interface PrintParty {
  label: string;
  name: string;
  /** Multi-line text: legal address, INN, account, ... */
  details: string | null;
}

export interface PrintDocProps {
  docTitle: string;
  docNumber: string;
  /** ISO datetime */
  docDate: string;
  organization: PrintParty;
  agent: PrintParty;
  /** Extra party cards after `agent` — a Move prints THREE blocks
   *  (Организация · Со склада · На склад), so the third+ go here. */
  extraParties?: PrintParty[];
  /** Optional ?counterparty / contract / order reference line */
  reference?: string | null;
  positions: PrintDocPosition[];
  currency: string;
  /** Pre-computed totals (BigInt strings in tiyin) */
  subtotalMinor: string;
  vatTotalMinor: string;
  grandTotalMinor: string;
  /** Optional doc note printed below the table */
  description?: string | null;
  /** Lines for the signature block — typically 2: organization + counterparty */
  signatures: { label: string; name: string }[];
  /**
   * Print «Сумма прописью» under the totals. On by default — a UZ/CIS
   * document without the spelled-out total is not a valid primary document
   * (the figure could be altered after signing). Pass `false` only for
   * internal slips that carry no money (e.g. a picking list).
   */
  showAmountInWords?: boolean;
  /** Stamp placeholder («М.П.») next to the issuing signature. */
  showStamp?: boolean;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function PartyCard({ party }: { party: PrintParty }) {
  return (
    <div className="party-card">
      <div className="party-label">{party.label}</div>
      <div className="party-name">{party.name}</div>
      {party.details && <div className="party-detail">{party.details}</div>}
    </div>
  );
}

/**
 * Generic invoice-style print template — used for InvoiceOut, Demand,
 * CustomerOrder, Supply, PurchaseOrder, InvoiceIn (any doc with line
 * items + totals).
 */
export function PrintDoc({
  docTitle,
  docNumber,
  docDate,
  organization,
  agent,
  extraParties,
  reference,
  positions,
  currency,
  subtotalMinor,
  vatTotalMinor,
  grandTotalMinor,
  description,
  signatures,
  showAmountInWords = true,
  showStamp = true,
}: PrintDocProps) {
  const t = useTranslations('pages.print');
  const locale = useLocale() === 'uz' ? 'uz' : 'ru';

  return (
    <>
      <header className="doc-header">
        <h1 className="doc-title">
          {docTitle} № {docNumber}
        </h1>
        <div className="doc-subtitle">
          {t('date')}: {fmtDate(docDate)}
          {reference ? ` · ${reference}` : ''}
        </div>
      </header>

      <div className="org-block">
        <PartyCard party={organization} />
        <PartyCard party={agent} />
        {(extraParties ?? []).map((p) => (
          <PartyCard key={p.label} party={p} />
        ))}
      </div>

      <table className="positions">
        <thead>
          <tr>
            <th style={{ width: '4%' }} className="num">
              №
            </th>
            <th>{t('product')}</th>
            <th style={{ width: '8%' }}>{t('uom')}</th>
            <th style={{ width: '10%' }} className="num">
              {t('quantity')}
            </th>
            <th style={{ width: '14%' }} className="num">
              {t('price')}
            </th>
            <th style={{ width: '8%' }} className="num">
              {t('discount')}
            </th>
            <th style={{ width: '8%' }} className="num">
              {t('vat')}
            </th>
            <th style={{ width: '14%' }} className="num">
              {t('total')}
            </th>
          </tr>
        </thead>
        <tbody>
          {positions.map((p) => (
            <tr key={p.position}>
              <td className="num">{p.position}</td>
              <td>
                {p.productName}
                {p.productCode && (
                  <div style={{ fontSize: 10, color: '#6b7280' }}>{p.productCode}</div>
                )}
              </td>
              <td>{p.uom ?? '—'}</td>
              <td className="num">{p.quantity}</td>
              <td className="num">{formatMoney(BigInt(p.priceMinor), currency)}</td>
              <td className="num">{Number.parseFloat(p.discount).toFixed(0)}%</td>
              <td className="num">{p.vat != null ? `${p.vat}%` : '—'}</td>
              <td className="num">{formatMoney(BigInt(p.totalMinor), currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="totals">
        <table>
          <tbody>
            <tr>
              <td className="label">{t('subtotal')}:</td>
              <td className="value">{formatMoney(BigInt(subtotalMinor), currency)}</td>
            </tr>
            {BigInt(vatTotalMinor) !== 0n && (
              <tr>
                <td className="label">{t('vat')}:</td>
                <td className="value">{formatMoney(BigInt(vatTotalMinor), currency)}</td>
              </tr>
            )}
            <tr className="grand">
              <td className="label">{t('grand_total')}:</td>
              <td className="value">{formatMoney(BigInt(grandTotalMinor), currency)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* «Всего наименований N, на сумму X» — the standard summary line that
          sits between the totals and the spelled-out amount on UZ/CIS forms. */}
      <div className="items-summary">
        {t('items_summary', {
          count: positions.length,
          sum: formatMoney(BigInt(grandTotalMinor), currency),
        })}
      </div>

      {/* «Сумма прописью» — without it the figure could be altered after
          signing, so a primary document is not considered valid. */}
      {showAmountInWords && (
        <div className="amount-in-words">
          <strong>{t('in_words')}:</strong> {amountInWords(grandTotalMinor, currency, locale)}
        </div>
      )}

      {description && (
        <div className="description-block">
          <strong>{t('note')}:</strong> {description}
        </div>
      )}

      <div className="signatures">
        {signatures.map((s, i) => (
          <div key={`${s.label}:${s.name}`}>
            <div className="sig-name">{s.name}</div>
            <div className="sig-line">{s.label}</div>
            {showStamp && i === 0 && <div className="sig-stamp">{t('stamp')}</div>}
          </div>
        ))}
      </div>
    </>
  );
}
