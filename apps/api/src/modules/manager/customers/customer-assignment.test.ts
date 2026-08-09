import { describe, expect, it } from 'vitest';
import {
  type AuditRowLite,
  distributionSummary,
  ownerChangeEvents,
} from './customer-assignment.js';

/**
 * MK38 — mijoz taqsimoti: egalik TARIXI va havza manzarasi. Sof modul.
 *
 * Tarix uchun yangi jadval ochilmaydi: `audit_log` da `Counterparty` yozuvlari
 * allaqachon bor va ular `{ownerId: {before, after}}` shaklida saqlanadi.
 * Bu modul o'sha xom jurnaldan FAQAT egalik o'zgarishini ajratib beradi.
 */

function audit(over: Partial<AuditRowLite> & { fieldChanges: unknown }): AuditRowLite {
  return {
    id: 'a1',
    userId: 'user-1',
    at: new Date('2026-08-01T10:00:00Z'),
    action: 'update',
    ...over,
  };
}

describe('MK38 — egalik o`zgarishlari jurnali', () => {
  it('egalik o`zgargan yozuv hodisaga aylanadi', () => {
    const events = ownerChangeEvents([
      audit({ fieldChanges: { ownerId: { before: 'emp-1', after: 'emp-2' } } }),
    ]);
    expect(events).toHaveLength(1);
    expect(events[0]?.fromOwnerId).toBe('emp-1');
    expect(events[0]?.toOwnerId).toBe('emp-2');
    expect(events[0]?.actorId).toBe('user-1');
  });

  it('🔴 egalikka tegmagan tahrir jurnalga TUSHMAYDI', () => {
    // Telefon raqami tahriri egalik tarixida ko'rinsa, menejer «mijoz qo'ldan
    // qo'lga o'tgan» degan noto'g'ri xulosaga kelardi.
    const events = ownerChangeEvents([
      audit({ fieldChanges: { phone: { before: '+998', after: '+9989' } } }),
    ]);
    expect(events).toEqual([]);
  });

  it('erkin havzadan biriktirish (`null` → xodim) ham hodisa', () => {
    const events = ownerChangeEvents([
      audit({ fieldChanges: { ownerId: { before: null, after: 'emp-2' } } }),
    ]);
    expect(events[0]?.fromOwnerId).toBeNull();
    expect(events[0]?.toOwnerId).toBe('emp-2');
  });

  it('havzaga qaytarish (xodim → `null`) ham hodisa', () => {
    const events = ownerChangeEvents([
      audit({ fieldChanges: { ownerId: { before: 'emp-1', after: null } } }),
    ]);
    expect(events[0]?.toOwnerId).toBeNull();
  });

  it('buzuq/yo`q `fieldChanges` yozuvni yiqitmaydi — jimgina o`tkazib yuboriladi', () => {
    // `{before, after}` juftligi TO'LIQ bo'lishi shart: yarim yozuvdan
    // «kimdan» ni taxmin qilish jurnalga o'ylab topilgan ma'lumot kiritardi.
    expect(
      ownerChangeEvents([
        audit({ fieldChanges: null }),
        audit({ fieldChanges: 'nonsense' }),
        audit({ fieldChanges: { ownerId: 'emp-2' } }),
        audit({ fieldChanges: { ownerId: { after: 'emp-2' } } }),
      ]),
    ).toEqual([]);
  });

  it('buzuq yozuvlar orasidagi SOG`LOM yozuv baribir chiqadi', () => {
    const events = ownerChangeEvents([
      audit({ fieldChanges: null }),
      audit({ id: 'ok', fieldChanges: { ownerId: { before: null, after: 'emp-2' } } }),
      audit({ fieldChanges: 'nonsense' }),
    ]);
    expect(events.map((e) => e.id)).toEqual(['ok']);
  });

  it('tizim yozgan hodisada aktyor NULL bo`ladi (soxta muallif qo`yilmaydi)', () => {
    const events = ownerChangeEvents([
      audit({ userId: null, fieldChanges: { ownerId: { before: 'emp-1', after: null } } }),
    ]);
    expect(events[0]?.actorId).toBeNull();
  });

  it('bir xil qiymatga «o`zgarish» hodisa emas', () => {
    const events = ownerChangeEvents([
      audit({ fieldChanges: { ownerId: { before: 'emp-1', after: 'emp-1' } } }),
    ]);
    expect(events).toEqual([]);
  });

  it('tartib — eng yangisi tepada (jurnal o`qilishi shunday)', () => {
    const events = ownerChangeEvents([
      audit({
        id: 'old',
        at: new Date('2026-08-01T10:00:00Z'),
        fieldChanges: { ownerId: { before: null, after: 'emp-1' } },
      }),
      audit({
        id: 'new',
        at: new Date('2026-08-05T10:00:00Z'),
        fieldChanges: { ownerId: { before: 'emp-1', after: 'emp-2' } },
      }),
    ]);
    expect(events.map((e) => e.id)).toEqual(['new', 'old']);
  });
});

describe('MK38 — havza manzarasi', () => {
  it('xodim bo`yicha soni va egasizlar alohida sanaladi', () => {
    const s = distributionSummary([
      { ownerId: 'emp-1' },
      { ownerId: 'emp-1' },
      { ownerId: 'emp-2' },
      { ownerId: null },
    ]);
    expect(s.total).toBe(4);
    expect(s.unassigned).toBe(1);
    expect(s.byOwner.get('emp-1')).toBe(2);
    expect(s.byOwner.get('emp-2')).toBe(1);
  });

  it('🔴 egasiz mijozlar xodim sonlariga QO`SHILMAYDI', () => {
    const s = distributionSummary([{ ownerId: null }, { ownerId: null }]);
    expect(s.byOwner.size).toBe(0);
    expect(s.unassigned).toBe(2);
  });

  it('bo`sh ro`yxat — nol, undefined emas', () => {
    const s = distributionSummary([]);
    expect(s).toEqual({ total: 0, unassigned: 0, byOwner: new Map() });
  });
});
