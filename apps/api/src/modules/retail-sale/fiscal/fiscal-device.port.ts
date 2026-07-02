/**
 * Fiscal device + barcode scanner — INTEGRATION SEAM ONLY.
 *
 * ⚠️ HONEST SCOPE (PARITY-AUDIT §103, rule #1): this is the adapter
 * *contract* a certified UZ fiscal driver (ОФД / виртуальная касса)
 * and a hardware barcode scanner would implement. It is NOT a working
 * fiscalization. Real fiscalization requires:
 *   - a certified UZ ОФД/ВЧ provider integration,
 *   - device drivers + hardware,
 *   - regulatory certification.
 * None of that is implemented. The only concrete implementation shipped
 * is `MockFiscalDevice` (explicitly mock-marked). `FISCAL_ENABLED`
 * defaults to false → the system runs NON-FISCAL and says so; it never
 * claims a real fiscal receipt was issued.
 *
 * All money is tiyin (BigInt). No `any`. Every operation returns a
 * typed, discriminated result — a disabled/mock device must surface
 * `fiscal: false`/`mock: true`, never a silent success that looks
 * certified.
 */

export interface FiscalLine {
  /** Item label as printed on the fiscal receipt. */
  name: string;
  /** Quantity ×1000 (matches the codebase qty convention). */
  quantityMilli: bigint;
  /** Unit price in tiyin. */
  priceMinor: bigint;
  /** Line total in tiyin (after discount). */
  sumMinor: bigint;
  /** VAT rate percent (null = no VAT). */
  vatPercent: number | null;
}

export interface FiscalSaleRequest {
  retailSaleId: string;
  lines: FiscalLine[];
  cashMinor: bigint;
  cardMinor: bigint;
  totalMinor: bigint;
}

/**
 * Result of a fiscal operation. Discriminated so callers cannot mistake
 * a non-fiscal/mock outcome for a certified fiscal document.
 */
export type FiscalResult =
  | {
      /** A real, certified fiscal document was issued. NEVER returned by
       *  the shipped code (no certified driver exists). */
      fiscal: true;
      mock: false;
      fiscalDocNumber: string;
      fiscalSign: string;
      ofdRegisteredAt: string;
    }
  | {
      /** Mock driver — clearly NOT a fiscal document. */
      fiscal: false;
      mock: true;
      reason: 'mock-device';
      pseudoDocNumber: string;
    }
  | {
      /** Fiscalization disabled (FISCAL_ENABLED=false) — non-fiscal sale. */
      fiscal: false;
      mock: false;
      reason: 'fiscal-disabled';
    };

export interface FiscalDevicePort {
  /** True only for a certified driver. Mock/disabled → false. */
  readonly isCertified: boolean;
  registerSale(req: FiscalSaleRequest): Promise<FiscalResult>;
  registerRefund(req: FiscalSaleRequest): Promise<FiscalResult>;
  openFiscalShift(cashierSessionId: string): Promise<FiscalResult>;
  closeFiscalShift(cashierSessionId: string): Promise<FiscalResult>;
}

/** A scanned code from a hardware barcode/QR scanner (FE-fed). */
export interface ScannedCode {
  /** Raw symbology payload (EAN-13, Code-128, DataMatrix/КИЗ, …). */
  raw: string;
  symbology: 'ean13' | 'code128' | 'datamatrix' | 'qr' | 'unknown';
}

export interface BarcodeScannerPort {
  /** Parse a raw scanner payload into a typed code. Pure, no hardware. */
  parse(raw: string): ScannedCode;
}
