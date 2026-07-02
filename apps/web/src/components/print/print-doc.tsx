'use client';

import { formatMoney } from '@moysklad/ui';
import { useTranslations } from 'next-intl';

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
  reference,
  positions,
  currency,
  subtotalMinor,
  vatTotalMinor,
  grandTotalMinor,
  description,
  signatures,
}: PrintDocProps) {
  const t = useTranslations('pages.print');

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

      {description && (
        <div className="description-block">
          <strong>{t('note')}:</strong> {description}
        </div>
      )}

      <div className="signatures">
        {signatures.map((s, i) => (
          <div key={i}>
            <div className="sig-name">{s.name}</div>
            <div className="sig-line">{s.label}</div>
          </div>
        ))}
      </div>
    </>
  );
}
