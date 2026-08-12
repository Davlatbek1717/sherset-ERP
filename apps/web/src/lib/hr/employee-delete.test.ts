/**
 * Xodimni o'chirish tasdig'i uchun sof mantiq.
 *
 * NEGA ALOHIDA MODUL: tasdiq oynasi ilgari QAT'IY matn ko'rsatardi
 * («Bu amalni qaytarib bo'lmaydi») — u ikki tomonlama yolg'on edi: amal
 * aslida arxivlash edi (qaytarilardi) va nima yo'qolishi umuman aytilmasdi.
 * Endi matn serverning preflight javobidan quriladi; shu funksiya esa uni
 * ekran render qilmasdan sinash imkonini beradi.
 */

import { describe, expect, it } from 'vitest';
import { describeEmployeeDelete } from './employee-delete';

describe('describeEmployeeDelete', () => {
  it('tarixsiz xodim — o‘chirsa bo‘ladi, sanaladigan narsa yo‘q', () => {
    const out = describeEmployeeDelete({ canDelete: true, blockers: [], cascade: [] });
    expect(out.canDelete).toBe(true);
    expect(out.cascadeText).toBe('');
    expect(out.blockerText).toBe('');
  });

  it('o‘chadigan HR loglari nomi va SONI bilan sanaladi', () => {
    const out = describeEmployeeDelete({
      canDelete: true,
      blockers: [],
      cascade: [
        { key: 'hrKpiDailyLog', label: 'kunlik KPI', count: 17 },
        { key: 'hrAttendance', label: 'davomat', count: 4 },
      ],
    });
    expect(out.cascadeText).toBe('kunlik KPI — 17, davomat — 4');
  });

  it('to‘siqlar ham nomi bilan qaytadi (kassir sababni ko‘rsin)', () => {
    const out = describeEmployeeDelete({
      canDelete: false,
      blockers: [
        { key: 'payroll', label: 'oylik', count: 3 },
        { key: 'cashierSession', label: 'kassa smenasi', count: 1 },
      ],
      cascade: [{ key: 'hrKpiDailyLog', label: 'kunlik KPI', count: 17 }],
    });
    expect(out.canDelete).toBe(false);
    expect(out.blockerText).toBe('oylik — 3, kassa smenasi — 1');
    // To'siq bo'lsa «nima o'chadi» ko'rsatilmaydi — hech narsa o'chmaydi.
    expect(out.cascadeText).toBe('');
  });

  it('🔴 to‘siq bo‘lsa canDelete bayrog‘iga ISHONMAYDI (server bilan ikki qulf)', () => {
    // Buzuq/eskirgan javob: canDelete=true, lekin to'siq ro'yxati bo'sh emas.
    // Ekran o'chirishga ruxsat bersa, server 409 berardi va kassir sababsiz
    // «amal bajarilmadi» ko'rardi.
    const out = describeEmployeeDelete({
      canDelete: true,
      blockers: [{ key: 'payroll', label: 'oylik', count: 1 }],
      cascade: [],
    });
    expect(out.canDelete).toBe(false);
  });

  it('nol yoki manfiy sanoq ro‘yxatga tushmaydi', () => {
    const out = describeEmployeeDelete({
      canDelete: true,
      blockers: [],
      cascade: [
        { key: 'hrAttendance', label: 'davomat', count: 0 },
        { key: 'hrTaskLog', label: 'vazifa jurnali', count: 2 },
      ],
    });
    expect(out.cascadeText).toBe('vazifa jurnali — 2');
  });

  it('javob umuman kelmasa (tarmoq xatosi) — o‘chirishga RUXSAT BERMAYDI', () => {
    // Fail-closed: preflight yiqilsa ekran «tarixsiz» deb taxmin qilmasin.
    const out = describeEmployeeDelete(null);
    expect(out.canDelete).toBe(false);
    expect(out.unknown).toBe(true);
  });
});
