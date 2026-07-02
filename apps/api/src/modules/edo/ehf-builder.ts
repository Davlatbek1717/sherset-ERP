/**
 * EHF (Electronic Invoice / Электрон Фактура) XML builder.
 *
 * Produces the XML payload Soliq.uz / Didox expects for an outbound
 * tax invoice. Schema is the simplified moysklad-1C-style envelope
 * documented at https://didox.uz/api-docs and Soliq's e-faktura PDF.
 *
 * Key fields:
 *   FacturaDoc — root, with FacturaId (uuid), FacturaNo, FacturaDate,
 *                FacturaType (1=usual, 2=corrective, 3=cancel)
 *   SellerTin / BuyerTin — 9 or 14-digit STIR
 *   ProductList — line items with NDS calculations
 *   Sum/NDS/SumWithNDS totals
 *
 * This builder is pure (no IO). The signer + sender are separate
 * services so each can be unit-tested in isolation.
 */

export type FacturaType = 1 | 2 | 3;
export type NdsRate = 0 | 12 | 15;

export interface EhfParty {
  /** STIR (TIN) — 9 or 14 digits. */
  tin: string;
  /** Cyrillic name as registered with Soliq. */
  nameCyrl: string;
  /** Optional district code (mahalliy davlat MFI kodi). */
  districtCode?: string;
  /** Optional street + house. */
  address?: string;
  /** Optional bank account + MFI for invoice header. */
  bankAccount?: string;
  bankMfo?: string;
}

export interface EhfPosition {
  /** 1-based line number. */
  ordNo: number;
  /** MXIK catalogue code (Soliq's mandatory product classifier). */
  mxik: string;
  /** Display name. */
  name: string;
  /** Unit-of-measure code (Soliq UoM dictionary; '108' = pieces, etc.). */
  measureCode: string;
  /** Quantity (decimal, max 6 fractional digits). */
  count: string;
  /** Unit price excluding NDS, in tiyin. */
  priceMinor: bigint;
  /** Sum excluding NDS = count × price. */
  sumMinor: bigint;
  /** NDS rate (%). */
  ndsRate: NdsRate;
  /** NDS amount in tiyin. */
  ndsSumMinor: bigint;
  /** Total = sumMinor + ndsSumMinor. */
  totalMinor: bigint;
}

export interface EhfPayload {
  facturaId: string;
  facturaNo: string;
  facturaDate: Date;
  facturaType: FacturaType;
  /** Optional contract reference (договор/шартнома). */
  contractNo?: string;
  contractDate?: Date;
  seller: EhfParty;
  buyer: EhfParty;
  positions: EhfPosition[];
  /** Override totals if pre-computed; otherwise builder sums positions. */
  totalSumMinor?: bigint;
  totalNdsMinor?: bigint;
  totalWithNdsMinor?: bigint;
}

/** Format a tiyin bigint into "12345.67" decimal string for Soliq XML. */
export function tiyinToDecimal(amount: bigint): string {
  const negative = amount < 0n;
  const abs = negative ? -amount : amount;
  const major = abs / 100n;
  const minor = abs % 100n;
  const minorStr = minor.toString().padStart(2, '0');
  return `${negative ? '-' : ''}${major}.${minorStr}`;
}

/** Format a date as YYYY-MM-DD (Soliq XML expects this). */
export function formatDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** XML-escape a string value. */
function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function tag(name: string, value: string | number | undefined): string {
  if (value === undefined || value === '') return '';
  const v = typeof value === 'string' ? xmlEscape(value) : String(value);
  return `<${name}>${v}</${name}>`;
}

function partyXml(role: 'Seller' | 'Buyer', party: EhfParty): string {
  return [
    `<${role}>`,
    tag('Tin', party.tin),
    tag('Name', party.nameCyrl),
    tag('DistrictCode', party.districtCode),
    tag('Address', party.address),
    tag('Account', party.bankAccount),
    tag('Mfo', party.bankMfo),
    `</${role}>`,
  ].join('');
}

function positionXml(p: EhfPosition): string {
  return [
    '<Position>',
    tag('OrdNo', p.ordNo),
    tag('Mxik', p.mxik),
    tag('Name', p.name),
    tag('MeasureCode', p.measureCode),
    tag('Count', p.count),
    tag('Price', tiyinToDecimal(p.priceMinor)),
    tag('Sum', tiyinToDecimal(p.sumMinor)),
    tag('NdsRate', p.ndsRate),
    tag('NdsSum', tiyinToDecimal(p.ndsSumMinor)),
    tag('Total', tiyinToDecimal(p.totalMinor)),
    '</Position>',
  ].join('');
}

/**
 * Compute totals from positions if not pre-supplied. Returns BigInts so
 * callers can decide rounding in their layer.
 */
export function sumPositions(positions: EhfPosition[]): {
  sum: bigint;
  nds: bigint;
  total: bigint;
} {
  let sum = 0n;
  let nds = 0n;
  let total = 0n;
  for (const p of positions) {
    sum += p.sumMinor;
    nds += p.ndsSumMinor;
    total += p.totalMinor;
  }
  return { sum, nds, total };
}

/**
 * Build the unsigned EHF XML. Caller signs the output (GOST detached
 * signature) and submits to provider.
 */
export function buildEhfXml(payload: EhfPayload): string {
  const totals =
    payload.totalSumMinor != null && payload.totalNdsMinor != null
      ? {
          sum: payload.totalSumMinor,
          nds: payload.totalNdsMinor,
          total: payload.totalWithNdsMinor ?? payload.totalSumMinor + payload.totalNdsMinor,
        }
      : sumPositions(payload.positions);

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<FacturaDoc>',
    tag('FacturaId', payload.facturaId),
    tag('FacturaNo', payload.facturaNo),
    tag('FacturaDate', formatDate(payload.facturaDate)),
    tag('FacturaType', payload.facturaType),
    payload.contractNo ? tag('ContractNo', payload.contractNo) : '',
    payload.contractDate ? tag('ContractDate', formatDate(payload.contractDate)) : '',
    partyXml('Seller', payload.seller),
    partyXml('Buyer', payload.buyer),
    '<ProductList>',
    payload.positions.map(positionXml).join(''),
    '</ProductList>',
    tag('Sum', tiyinToDecimal(totals.sum)),
    tag('NdsSum', tiyinToDecimal(totals.nds)),
    tag('TotalWithNds', tiyinToDecimal(totals.total)),
    '</FacturaDoc>',
  ]
    .filter(Boolean)
    .join('');
}
