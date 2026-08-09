import { describe, expect, it } from 'vitest';
import { stuckDocHref, stuckDuration } from './stuck-doc-link.js';

describe('stuckDocHref', () => {
  it('yig`ish qatori BUYURTMAGA emas, yig`ish varaqasiga olib boradi', () => {
    // `refId` = `MsPickList.id`; `/customer-orders/<id>` begona hujjat ochardi.
    expect(stuckDocHref('customerorder', 'pl-1')).toBe('/pick-lists/pl-1');
  });

  it('har qo`llab-quvvatlanadigan tur o`z marshrutiga tushadi', () => {
    expect(stuckDocHref('supply', 's-1')).toBe('/supplies/s-1');
    expect(stuckDocHref('cashiersession', 'c-1')).toBe('/retail/sessions/c-1');
    expect(stuckDocHref('demand', 'd-1')).toBe('/demands/d-1');
    expect(stuckDocHref('paymentin', 'p-1')).toBe('/payments-in/p-1');
    expect(stuckDocHref('paymentout', 'p-2')).toBe('/payments-out/p-2');
    expect(stuckDocHref('cashin', 'k-1')).toBe('/cash-in/k-1');
    expect(stuckDocHref('cashout', 'k-2')).toBe('/cash-out/k-2');
  });

  it('detal sahifasi yo`q tur uchun havola YO`Q (noto`g`ri havola 404 dan battar)', () => {
    expect(stuckDocHref('servicerequest', 'r-1')).toBeNull();
    expect(stuckDocHref('unknown', 'x-1')).toBeNull();
  });
});

describe('stuckDuration', () => {
  it('48 soatgacha — soatda', () => {
    expect(stuckDuration(5.4)).toEqual({ unit: 'hours', value: 5 });
    expect(stuckDuration(47.6)).toEqual({ unit: 'hours', value: 48 });
  });

  it('48 soatdan boshlab — kunda', () => {
    expect(stuckDuration(48)).toEqual({ unit: 'days', value: 2 });
    expect(stuckDuration(73)).toEqual({ unit: 'days', value: 3 });
  });

  it('juda kichik oshish «0 soat» bo`lib ko`rinmaydi', () => {
    // 0 «kechikish yo'q» degan ma'no berardi — qator esa ro'yxatda turibdi.
    expect(stuckDuration(0.2)).toEqual({ unit: 'hours', value: 1 });
  });
});
