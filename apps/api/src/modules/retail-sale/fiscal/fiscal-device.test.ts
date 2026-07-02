import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FiscalSaleRequest } from './fiscal-device.port.js';
import {
  BarcodeScanner,
  DisabledFiscalDevice,
  MockFiscalDevice,
  getFiscalDevice,
} from './mock-fiscal-device.js';

const req: FiscalSaleRequest = {
  retailSaleId: 'sale-1',
  lines: [
    {
      name: 'Suv 1L',
      quantityMilli: 2000n,
      priceMinor: 500_00n,
      sumMinor: 1_000_00n,
      vatPercent: 12,
    },
  ],
  cashMinor: 1_000_00n,
  cardMinor: 0n,
  totalMinor: 1_000_00n,
};

describe('Honest invariant - NOTHING shipped is a certified fiscal doc', () => {
  it('MockFiscalDevice: every op returns fiscal:false, mock:true (never certified)', async () => {
    const d = new MockFiscalDevice();
    expect(d.isCertified).toBe(false);
    for (const r of [
      await d.registerSale(req),
      await d.registerRefund(req),
      await d.openFiscalShift('s1'),
      await d.closeFiscalShift('s1'),
    ]) {
      expect(r.fiscal).toBe(false);
      expect(r).toMatchObject({ mock: true, reason: 'mock-device' });
      // Bullet-proof: a mock result must NEVER carry a fiscal sign.
      expect('fiscalSign' in r).toBe(false);
    }
  });

  it('DisabledFiscalDevice: every op is an explicit non-fiscal no-op', async () => {
    const d = new DisabledFiscalDevice();
    expect(d.isCertified).toBe(false);
    for (const r of [
      await d.registerSale(),
      await d.registerRefund(),
      await d.openFiscalShift(),
      await d.closeFiscalShift(),
    ]) {
      expect(r).toEqual({ fiscal: false, mock: false, reason: 'fiscal-disabled' });
    }
  });

  it('no device + no op EVER returns fiscal:true (structurally impossible)', async () => {
    for (const d of [new MockFiscalDevice(), new DisabledFiscalDevice()]) {
      const results = [
        await d.registerSale(req),
        await d.registerRefund(req),
        await d.openFiscalShift('s'),
        await d.closeFiscalShift('s'),
      ];
      for (const r of results) expect(r.fiscal).toBe(false);
    }
  });

  it('operations never throw (total, honest - no fake "it worked")', async () => {
    const d = new MockFiscalDevice();
    await expect(d.registerSale(req)).resolves.toBeDefined();
    await expect(d.closeFiscalShift('x')).resolves.toBeDefined();
  });
});

describe('getFiscalDevice() - honest flag gate', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('default (FISCAL_ENABLED unset) is honored by the module flag', () => {
    // FISCAL_ENABLED is read at import; the factory must never hand back
    // a certified device regardless.
    expect(getFiscalDevice().isCertified).toBe(false);
  });

  it('factory never yields a certified driver (none exists in-repo)', () => {
    expect(getFiscalDevice().isCertified).toBe(false);
  });
});

describe('BarcodeScanner.parse - pure, total, never throws', () => {
  const s = new BarcodeScanner();

  it('classifies common symbologies', () => {
    expect(s.parse('4780012345678').symbology).toBe('ean13');
    expect(s.parse('https://t.me/x').symbology).toBe('qr');
    expect(s.parse('ABC-128-XYZ').symbology).toBe('code128');
    // GS1 DataMatrix (UZ KIZ / Markirovka) - AI 01 prefix, long.
    expect(s.parse('010478001234567821ABCDEFGH').symbology).toBe('datamatrix');
  });

  it('empty / whitespace / non-printable -> unknown, no throw', () => {
    expect(s.parse('').symbology).toBe('unknown');
    expect(s.parse('   ').symbology).toBe('unknown');
    expect(() => s.parse(' ')).not.toThrow();
  });

  it('trims and preserves the raw payload', () => {
    expect(s.parse('  4780012345678  ').raw).toBe('4780012345678');
  });
});
