import { describe, expect, it } from 'vitest';
import { CLICK_ERROR, clickErrorNote, clickResponse, verifyClickSign } from './click.protocol.js';
import { PAYME_ERROR, paymeError, verifyPaymeAuth } from './payme.protocol.js';
import {
  InitiatePaymentSchema,
  ListGatewayTxSchema,
  PaymentProviderSchema,
  PaymentSourceEntitySchema,
  PaymentTxStatusSchema,
  SavePaymentGatewayConfigSchema,
} from './payment-gateway.schema.js';

describe('PaymentProviderSchema', () => {
  it.each(['payme', 'click', 'uzcard', 'humo', 'octo', 'multicard'])('accepts %s', (p) => {
    expect(PaymentProviderSchema.safeParse(p).success).toBe(true);
  });

  it('rejects unknown', () => {
    expect(PaymentProviderSchema.safeParse('stripe').success).toBe(false);
  });
});

describe('PaymentTxStatusSchema', () => {
  it.each(['pending', 'authorized', 'captured', 'refunded', 'cancelled', 'failed'])(
    'accepts %s',
    (s) => {
      expect(PaymentTxStatusSchema.safeParse(s).success).toBe(true);
    },
  );
});

describe('PaymentSourceEntitySchema', () => {
  it.each(['CustomerOrder', 'InvoiceOut', 'RetailDemand'])('accepts %s', (e) => {
    expect(PaymentSourceEntitySchema.safeParse(e).success).toBe(true);
  });
});

describe('SavePaymentGatewayConfigSchema', () => {
  const base = {
    provider: 'payme' as const,
    name: 'Main Payme',
    merchantId: 'merch-123',
  };

  it('accepts a minimal config (testMode default true)', () => {
    const r = SavePaymentGatewayConfigSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.testMode).toBe(true);
  });

  it('accepts creds bag', () => {
    const r = SavePaymentGatewayConfigSchema.safeParse({
      ...base,
      creds: { secretKey: 'XYZ' },
    });
    expect(r.success).toBe(true);
  });

  it('rejects empty merchantId', () => {
    expect(SavePaymentGatewayConfigSchema.safeParse({ ...base, merchantId: '' }).success).toBe(
      false,
    );
  });
});

describe('InitiatePaymentSchema', () => {
  it('accepts valid payload', () => {
    const r = InitiatePaymentSchema.safeParse({
      provider: 'click',
      sourceEntity: 'CustomerOrder',
      sourceEntityId: '00000000-0000-0000-0000-000000000001',
      amountMinor: 100000,
    });
    expect(r.success).toBe(true);
  });

  it('coerces amountMinor from string', () => {
    const r = InitiatePaymentSchema.safeParse({
      provider: 'payme',
      sourceEntity: 'CustomerOrder',
      sourceEntityId: '00000000-0000-0000-0000-000000000001',
      amountMinor: '500000',
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.amountMinor).toBe(500000);
  });

  it('rejects amountMinor < 1', () => {
    expect(
      InitiatePaymentSchema.safeParse({
        provider: 'payme',
        sourceEntity: 'CustomerOrder',
        sourceEntityId: '00000000-0000-0000-0000-000000000001',
        amountMinor: 0,
      }).success,
    ).toBe(false);
  });
});

describe('ListGatewayTxSchema', () => {
  it('uses default limit 50', () => {
    const r = ListGatewayTxSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.limit).toBe(50);
  });
});

describe('verifyPaymeAuth', () => {
  it('accepts Paycom user with matching secret', () => {
    const header = `Basic ${Buffer.from('Paycom:secret123').toString('base64')}`;
    expect(verifyPaymeAuth(header, 'secret123')).toBe(true);
  });

  it('accepts Paycomtest user (sandbox)', () => {
    const header = `Basic ${Buffer.from('Paycomtest:secret').toString('base64')}`;
    expect(verifyPaymeAuth(header, 'secret')).toBe(true);
  });

  it('rejects wrong secret', () => {
    const header = `Basic ${Buffer.from('Paycom:wrong').toString('base64')}`;
    expect(verifyPaymeAuth(header, 'secret')).toBe(false);
  });

  it('rejects wrong username', () => {
    const header = `Basic ${Buffer.from('Hacker:secret').toString('base64')}`;
    expect(verifyPaymeAuth(header, 'secret')).toBe(false);
  });

  it('rejects missing header', () => {
    expect(verifyPaymeAuth(undefined, 'secret')).toBe(false);
  });

  it('rejects non-Basic scheme', () => {
    expect(verifyPaymeAuth('Bearer abc', 'secret')).toBe(false);
  });

  // Faza 21 (`INT-14`): xom `pass === secretKey` da sozlanmagan (bo'sh) sir
  // bo'sh parol bilan MOS kelardi — `'' === ''` ⇒ true. Chaqiruvchi
  // (`payment-gateway.service.ts:184`) `!creds.secretKey` bilan buni to'sadi,
  // lekin funksiyaning o'zi fail-open bo'lmasligi kerak.
  it("bo'sh secretKey hech qachon mos kelmaydi (fail-closed)", () => {
    const header = `Basic ${Buffer.from('Paycom:').toString('base64')}`;
    expect(verifyPaymeAuth(header, '')).toBe(false);
  });
});

describe('paymeError', () => {
  it('builds an error envelope for a known code', () => {
    const err = paymeError(42, PAYME_ERROR.AUTH_FAILED);
    expect(err.error.code).toBe(PAYME_ERROR.AUTH_FAILED);
    expect(err.error.message).toMatchObject({ uz: expect.any(String), ru: expect.any(String) });
    expect(err.id).toBe(42);
  });

  it('falls back to generic message for unknown code', () => {
    const err = paymeError('abc', -99999);
    expect(err.error.code).toBe(-99999);
    expect(err.error.message.en).toBe('Error');
  });
});

describe('verifyClickSign', () => {
  it('matches the documented MD5 signature', () => {
    const params = {
      click_trans_id: 'CT1',
      service_id: 'SRV',
      merchant_trans_id: 'M1',
      amount: '10000',
      action: '0',
      sign_time: '2026-01-01 12:00:00',
      sign_string: '',
    };
    // MD5(CT1 + SRV + KEY + M1 + 10000 + 0 + ts)
    const expected = require('node:crypto')
      .createHash('md5')
      .update('CT1SRVKEYM1100000' + params.sign_time)
      .digest('hex');
    expect(verifyClickSign({ ...params, sign_string: expected }, 'KEY')).toBe(true);
  });

  it('rejects wrong signature', () => {
    expect(
      verifyClickSign(
        {
          click_trans_id: 'CT1',
          service_id: 'SRV',
          merchant_trans_id: 'M1',
          amount: '10000',
          action: '0',
          sign_time: '2026-01-01 12:00:00',
          sign_string: 'wrong',
        },
        'KEY',
      ),
    ).toBe(false);
  });
});

describe('clickResponse', () => {
  it('builds a SUCCESS response', () => {
    const resp = clickResponse('CT1', 'M1', CLICK_ERROR.SUCCESS, 'PREP1');
    expect(resp.error).toBe(0);
    expect(resp.error_note).toBe('Success');
    expect(resp.merchant_prepare_id).toBe('PREP1');
  });

  it('builds an error response', () => {
    const resp = clickResponse('CT1', 'M1', CLICK_ERROR.SIGN_CHECK_FAILED);
    expect(resp.error).toBe(-1);
    expect(resp.error_note).toBe('SIGN CHECK FAILED!');
  });
});

describe('clickErrorNote', () => {
  it.each([
    [0, 'Success'],
    [-1, 'SIGN CHECK FAILED!'],
    [-4, 'Already paid'],
  ])('returns note for code %s', (code, note) => {
    expect(clickErrorNote(code)).toBe(note);
  });

  it('returns Unknown for unknown code', () => {
    expect(clickErrorNote(-99)).toBe('Unknown error');
  });
});
