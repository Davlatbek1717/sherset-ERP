'use client';

/**
 * Jo'natma chop etish — IKKI shakl, `?form=` bilan tanlanadi:
 *
 *   (default)     A4 «Расходная накладная» — PrintDoc (rekvizit, summa
 *                 propisyu, imzo bloki). Buxgalteriya uchun.
 *   ?form=chek    TOR «TOVAR CHEKI» — ThermalShell + TovarChek, 80mm
 *                 (`?w=58` bilan 58mm). Xaridorga beriladigan chek.
 *
 * TARIX: chek shabloni 2026-07-17 da egasining «Elektro sentr» namunasidan
 * qurilgan va o'sha paytda A4'ni BUTUNLAY almashtirgan edi. climart-adoption
 * (55cf3bf) uni tasodifan o'chirib yuborgan — CSS (`.print-thermal`) va 16 ta
 * `chek_*` tarjima kaliti yetim qolgani shuni ko'rsatadi. Endi ikkalasi ham
 * bor: moysklad ham bitta hujjatga bir nechta chop shakli beradi.
 */

import { PrintDoc, type PrintDocPosition } from '@/components/print/print-doc';
import { PrintShell } from '@/components/print/print-shell';
import { ThermalShell } from '@/components/print/thermal-shell';
import { type ChekPosition, TovarChek } from '@/components/print/tovar-chek';
import { api } from '@/lib/api-client';
import { computePositionTotal, scaleMinorByQty } from '@moysklad/money';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useParams, useSearchParams } from 'next/navigation';

interface PositionDetail {
  id: string;
  position: number;
  quantity: string;
  priceMinor: string;
  discount: string;
  vat: number | null;
  product: { id: string; name: string; code: string | null; uom: string | null } | null;
}

interface DemandDetail {
  id: string;
  name: string;
  moment: string;
  description: string | null;
  sumMinor: string;
  vatEnabled: boolean;
  vatIncluded: boolean;
  agent: {
    id: string;
    name: string;
    legalTitle: string | null;
    legalAddress: string | null;
    phone: string | null;
    uzRequisites?: { inn?: string } | null;
  };
  owner: { id: string; name: string } | null;
  organization: {
    id: string;
    name: string;
    legalTitle: string | null;
    legalAddress: string | null;
    phone: string | null;
    director: string | null;
    directorPosition: string | null;
    chiefAccountant: string | null;
    uzRequisites?: { inn?: string } | null;
  };
  organizationAccount?: {
    accountNumber: string | null;
    bankName: string | null;
    bic: string | null;
  } | null;
  customerOrder: { id: string; name: string } | null;
  positions: PositionDetail[];
}

export default function PrintDemandPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const auto = searchParams.get('auto') === '1';
  const form = searchParams.get('form');
  // Chek eni — 80mm default (Xprinter), `?w=58` tor lenta uchun.
  const widthMm = searchParams.get('w') === '58' ? 58 : 80;
  const t = useTranslations('pages.print');

  const { data, isLoading } = useQuery<DemandDetail>({
    queryKey: ['demand', id],
    queryFn: () => api.get<DemandDetail>(`/demands/${id}`),
  });

  if (isLoading) return <div style={{ padding: 24 }}>Loading...</div>;
  if (!data) return <div style={{ padding: 24 }}>Not found</div>;

  // ── ?form=chek — xaridorga beriladigan TOR chek ──────────────────────────
  if (form === 'chek') {
    // Chegirmasiz yalpi (narx × miqdor) — chekdagi «Chegirma» qatori uchun.
    let grossMinor = 0n;
    const chekPositions: ChekPosition[] = data.positions.map((p) => {
      const c = computePositionTotal(p, data.vatEnabled, data.vatIncluded);
      grossMinor += scaleMinorByQty(BigInt(p.priceMinor), p.quantity);
      return {
        position: p.position,
        name: p.product?.name ?? '—',
        code: p.product?.code ?? null,
        uom: p.product?.uom ?? null,
        quantity: p.quantity,
        priceMinor: p.priceMinor,
        sumMinor: c.totalMinor.toString(),
      };
    });
    return (
      <ThermalShell widthMm={widthMm} autoPrint={auto}>
        <TovarChek
          title={t('chek_title_sale')}
          docNumber={data.name}
          docDate={data.moment}
          orgName={data.organization.legalTitle ?? data.organization.name}
          orgPhone={data.organization.phone}
          sellerName={data.owner?.name ?? null}
          buyerName={data.agent.legalTitle ?? data.agent.name}
          buyerPhone={data.agent.phone}
          comment={data.description}
          reference={
            data.customerOrder
              ? `${t('doc_title.customer_order')} ${data.customerOrder.name}`
              : null
          }
          positions={chekPositions}
          totalMinor={data.sumMinor}
          subtotalMinor={grossMinor.toString()}
          widthMm={widthMm}
        />
      </ThermalShell>
    );
  }

  let subtotalMinor = 0n;
  let vatTotalMinor = 0n;
  const positions: PrintDocPosition[] = data.positions.map((p) => {
    const c = computePositionTotal(p, data.vatEnabled, data.vatIncluded);
    subtotalMinor += c.baseMinor;
    vatTotalMinor += c.vatAmountMinor;
    return {
      position: p.position,
      productName: p.product?.name ?? '—',
      productCode: p.product?.code ?? null,
      uom: p.product?.uom ?? null,
      quantity: p.quantity,
      priceMinor: p.priceMinor,
      totalMinor: c.totalMinor.toString(),
      discount: p.discount,
      vat: p.vat,
      vatAmountMinor: c.vatAmountMinor.toString(),
    };
  });

  return (
    <PrintShell autoPrint={auto}>
      <PrintDoc
        docTitle={t('doc_title.demand')}
        docNumber={data.name}
        docDate={data.moment}
        organization={{
          label: t('party.organization'),
          name: data.organization.legalTitle ?? data.organization.name,
          // Full requisites — a printed primary document must identify the
          // issuer by STIR and bank, not just by name (the form used to print
          // the legal address alone even though the API returns all of this).
          details:
            [
              data.organization.legalAddress,
              data.organization.uzRequisites?.inn
                ? `${t('req.inn')}: ${data.organization.uzRequisites.inn}`
                : null,
              data.organizationAccount?.accountNumber
                ? `${t('req.account')}: ${data.organizationAccount.accountNumber}`
                : null,
              data.organizationAccount?.bankName,
              data.organizationAccount?.bic
                ? `${t('req.mfo')}: ${data.organizationAccount.bic}`
                : null,
              data.organization.phone ? `${t('req.phone')}: ${data.organization.phone}` : null,
            ]
              .filter(Boolean)
              .join('\n') || null,
        }}
        agent={{
          label: t('party.agent'),
          name: data.agent.legalTitle ?? data.agent.name,
          details:
            [
              data.agent.legalAddress,
              data.agent.uzRequisites?.inn
                ? `${t('req.inn')}: ${data.agent.uzRequisites.inn}`
                : null,
            ]
              .filter(Boolean)
              .join('\n') || null,
        }}
        reference={
          data.customerOrder ? `${t('doc_title.customer_order')} ${data.customerOrder.name}` : null
        }
        positions={positions}
        currency="UZS"
        subtotalMinor={subtotalMinor.toString()}
        vatTotalMinor={vatTotalMinor.toString()}
        grandTotalMinor={data.sumMinor}
        description={data.description}
        // moysklad/UZ practice: the issuing side signs by NAME and POSITION
        // (director, then chief accountant when the account records one), the
        // receiving side signs blank. Previously both lines just repeated the
        // company name, which is not a usable signature block.
        signatures={[
          {
            label: data.organization.directorPosition ?? t('signature.issued_by'),
            name: data.organization.director ?? data.organization.name,
          },
          ...(data.organization.chiefAccountant
            ? [
                {
                  label: t('signature.accountant'),
                  name: data.organization.chiefAccountant,
                },
              ]
            : []),
          { label: t('signature.received_by'), name: data.agent.name },
        ]}
      />
    </PrintShell>
  );
}
