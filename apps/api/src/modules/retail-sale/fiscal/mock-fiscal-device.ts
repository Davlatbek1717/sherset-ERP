import type {
  BarcodeScannerPort,
  FiscalDevicePort,
  FiscalResult,
  FiscalSaleRequest,
  ScannedCode,
} from './fiscal-device.port.js';

/**
 * `FISCAL_ENABLED` — honest gate. Defaults to false: no certified UZ
 * ОФД/ВЧ driver exists, so the system runs NON-FISCAL. Reading it from
 * env keeps the seam real without faking certification. Even if set
 * true, the only available device is the mock (still not certified) —
 * see getFiscalDevice().
 */
export const FISCAL_ENABLED = process.env.FISCAL_ENABLED === 'true';

/**
 * Mock fiscal device. Every result is explicitly `fiscal:false,
 * mock:true` — it can NEVER be mistaken for a certified fiscal
 * document. It does not talk to any ОФД, never throws as if real, and
 * never persists a fiscal sign. Exists so the integration seam is
 * exercisable in dev/test without fabricating fiscalization.
 */
export class MockFiscalDevice implements FiscalDevicePort {
  readonly isCertified = false;

  private mockResult(tag: string): FiscalResult {
    return {
      fiscal: false,
      mock: true,
      reason: 'mock-device',
      pseudoDocNumber: `MOCK-${tag}-${Date.now()}`,
    };
  }

  async registerSale(req: FiscalSaleRequest): Promise<FiscalResult> {
    return this.mockResult(`SALE-${req.retailSaleId}`);
  }
  async registerRefund(req: FiscalSaleRequest): Promise<FiscalResult> {
    return this.mockResult(`REFUND-${req.retailSaleId}`);
  }
  async openFiscalShift(cashierSessionId: string): Promise<FiscalResult> {
    return this.mockResult(`OPEN-${cashierSessionId}`);
  }
  async closeFiscalShift(cashierSessionId: string): Promise<FiscalResult> {
    return this.mockResult(`CLOSE-${cashierSessionId}`);
  }
}

/**
 * Disabled device — used when FISCAL_ENABLED=false. Surfaces
 * `fiscal:false, reason:'fiscal-disabled'` so a non-fiscal sale is
 * never silently presented as fiscalized.
 */
export class DisabledFiscalDevice implements FiscalDevicePort {
  readonly isCertified = false;
  private disabled(): FiscalResult {
    return { fiscal: false, mock: false, reason: 'fiscal-disabled' };
  }
  async registerSale(): Promise<FiscalResult> {
    return this.disabled();
  }
  async registerRefund(): Promise<FiscalResult> {
    return this.disabled();
  }
  async openFiscalShift(): Promise<FiscalResult> {
    return this.disabled();
  }
  async closeFiscalShift(): Promise<FiscalResult> {
    return this.disabled();
  }
}

/**
 * Factory. There is NO certified driver in this codebase, so:
 *   - FISCAL_ENABLED=false → DisabledFiscalDevice (non-fiscal, honest).
 *   - FISCAL_ENABLED=true  → MockFiscalDevice (still NOT certified —
 *     for dev/test only; results stay mock-marked).
 * A real certified driver would be wired here in a future, certified
 * step — deliberately absent (rule #1: no fabricated fiscalization).
 */
export function getFiscalDevice(): FiscalDevicePort {
  return FISCAL_ENABLED ? new MockFiscalDevice() : new DisabledFiscalDevice();
}

/**
 * Pure barcode parser (no hardware). Classifies common retail
 * symbologies by shape; UZ КИЗ/Маркировка (DataMatrix) is detected by
 * the GS1 AI prefix. Unknown → 'unknown' (never throws).
 */
export class BarcodeScanner implements BarcodeScannerPort {
  parse(raw: string): ScannedCode {
    const v = raw.trim();
    if (v.length === 0) return { raw: v, symbology: 'unknown' };
    if (/^\d{13}$/.test(v)) return { raw: v, symbology: 'ean13' };
    // GS1 DataMatrix (КИЗ/Маркировка) typically starts with AI (01).
    if (v.startsWith('01') && v.length > 20) return { raw: v, symbology: 'datamatrix' };
    if (/^https?:\/\//i.test(v)) return { raw: v, symbology: 'qr' };
    if (/^[\x20-\x7F]+$/.test(v)) return { raw: v, symbology: 'code128' };
    return { raw: v, symbology: 'unknown' };
  }
}
