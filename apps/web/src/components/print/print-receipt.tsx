'use client';

import { formatMoney } from '@moysklad/ui';
import { useTranslations } from 'next-intl';
import type { PrintParty } from './print-doc';

export interface PrintReceiptProps {
  docTitle: string;
  docNumber: string;
  docDate: string;
  organization: PrintParty;
  agent: PrintParty;
  /** BigInt as string in tiyin */
  amountMinor: string;
  currency: string;
  /** Optional purpose / "На что" */
  purpose?: string | null;
  description?: string | null;
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
 * Receipt-style print template — used for PaymentIn / PaymentOut /
 * CashIn / CashOut. Single amount, no line items, prominent total.
 */
export function PrintReceipt({
  docTitle,
  docNumber,
  docDate,
  organization,
  agent,
  amountMinor,
  currency,
  purpose,
  description,
  signatures,
}: PrintReceiptProps) {
  const t = useTranslations('pages.print');

  return (
    <>
      <header className="doc-header">
        <h1 className="doc-title">
          {docTitle} № {docNumber}
        </h1>
        <div className="doc-subtitle">
          {t('date')}: {fmtDate(docDate)}
        </div>
      </header>

      <div className="org-block">
        <PartyCard party={organization} />
        <PartyCard party={agent} />
      </div>

      <div className="receipt-amount">{formatMoney(BigInt(amountMinor), currency)}</div>
      <div className="receipt-amount-words">{t('amount_label', { currency })}</div>

      {purpose && (
        <div className="description-block">
          <strong>{t('purpose')}:</strong> {purpose}
        </div>
      )}

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
