import { BadRequestException, ConflictException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { diffAdjustments, forwardTarget, rejectTarget } from './supply-approval.fsm.js';

describe('supply-approval FSM — forward', () => {
  it('send: none → awaiting_supplier', () =>
    expect(forwardTarget('send', 'none')).toBe('awaiting_supplier'));
  it('supplier_ok: awaiting_supplier → delivering', () =>
    expect(forwardTarget('supplier_ok', 'awaiting_supplier')).toBe('delivering'));
  it('omborchi_ok: delivering → awaiting_admin', () =>
    expect(forwardTarget('omborchi_ok', 'delivering')).toBe('awaiting_admin'));
  it('admin_ok: awaiting_admin → completed', () =>
    expect(forwardTarget('admin_ok', 'awaiting_admin')).toBe('completed'));
  it("noto'g'ri bosqichda 409", () => {
    expect(() => forwardTarget('admin_ok', 'delivering')).toThrow(ConflictException);
    expect(() => forwardTarget('send', 'completed')).toThrow(ConflictException);
  });
});

describe('supply-approval FSM — reject (back)', () => {
  it('awaiting_supplier → none', () => expect(rejectTarget('awaiting_supplier')).toBe('none'));
  it('delivering → awaiting_supplier', () =>
    expect(rejectTarget('delivering')).toBe('awaiting_supplier'));
  it('awaiting_admin → delivering', () =>
    expect(rejectTarget('awaiting_admin')).toBe('delivering'));
  it("none/completed rad etib bo'lmaydi", () => {
    expect(() => rejectTarget('none')).toThrow(ConflictException);
    expect(() => rejectTarget('completed')).toThrow(ConflictException);
  });
});

describe('supply-approval FSM — diffAdjustments', () => {
  const pos = [
    { id: 'p1', quantity: '10' },
    { id: 'p2', quantity: '5' },
  ];
  it("faqat o'zgargan qatorlar", () => {
    expect(
      diffAdjustments(pos, [
        { positionId: 'p1', quantity: '8' },
        { positionId: 'p2', quantity: '5' },
      ]),
    ).toEqual([{ positionId: 'p1', was: '10', now: '8' }]);
  });
  it("o'zgarish yo'q → []", () =>
    expect(diffAdjustments(pos, [{ positionId: 'p2', quantity: '5' }])).toEqual([]));
  it("noma'lum pozitsiya → BadRequest", () =>
    expect(() => diffAdjustments(pos, [{ positionId: 'x', quantity: '1' }])).toThrow(
      BadRequestException,
    ));
});
