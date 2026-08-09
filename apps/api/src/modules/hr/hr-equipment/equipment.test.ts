import { describe, expect, it } from 'vitest';
import {
  EQUIPMENT_STATUS,
  RETURN_CONDITION,
  assignBlockReason,
  isEquipmentStatus,
  manualStatusBlockReason,
  normalizeInventoryNo,
  statusAfterReturn,
} from './equipment.js';

describe('assignBlockReason — biriktirish qoidalari', () => {
  it('omborda turgan jihoz biriktiriladi', () => {
    expect(assignBlockReason(EQUIPMENT_STATUS.inStock, false)).toBeNull();
  });

  it('birovda turgan jihoz QAYTA biriktirilmaydi', () => {
    // Ikkita ochiq biriktirish = «kimda» savoliga ikki javob; javobgarlik
    // ikkiga bo'linsa, hech kim javobgar bo'lmay qoladi.
    const reason = assignBlockReason(EQUIPMENT_STATUS.assigned, true);
    expect(reason).not.toBeNull();
    expect(reason).toContain('qaytarilmagan');
  });

  it("ta'mirdagi jihoz biriktirilmaydi", () => {
    expect(assignBlockReason(EQUIPMENT_STATUS.repair, false)).not.toBeNull();
  });

  it('hisobdan chiqarilgan va yo`qolgan jihoz biriktirilmaydi', () => {
    expect(assignBlockReason(EQUIPMENT_STATUS.writtenOff, false)).not.toBeNull();
    expect(assignBlockReason(EQUIPMENT_STATUS.lost, false)).not.toBeNull();
  });

  it('ochiq biriktirish holatdan USTUN — holat `in_stock` bo`lsa ham to`sadi', () => {
    // Holat ustuni buzilib qolishi mumkin (qo'lda tahrir, eski ma'lumot);
    // ochiq biriktirish qatori esa FAKT.
    expect(assignBlockReason(EQUIPMENT_STATUS.inStock, true)).not.toBeNull();
  });
});

describe('statusAfterReturn — qaytarish sharti holatni belgilaydi', () => {
  it('soz qaytarilsa omborga qaytadi', () => {
    expect(statusAfterReturn(RETURN_CONDITION.ok)).toBe(EQUIPMENT_STATUS.inStock);
  });

  it('shikastlangan bo`lsa ta`mirga tushadi — darhol boshqa xodimga berilmaydi', () => {
    expect(statusAfterReturn(RETURN_CONDITION.damaged)).toBe(EQUIPMENT_STATUS.repair);
  });

  it('yo`qolgan bo`lsa `lost` bo`ladi va reyestrdan O`CHIRILMAYDI', () => {
    expect(statusAfterReturn(RETURN_CONDITION.lost)).toBe(EQUIPMENT_STATUS.lost);
  });

  it('noma`lum shart soz deb qaraladi (fail-open EMAS: qator baribir yopiladi)', () => {
    expect(statusAfterReturn('xyz')).toBe(EQUIPMENT_STATUS.inStock);
  });
});

describe('manualStatusBlockReason — qo`lda holat o`zgartirish', () => {
  it('biriktirilgan jihozni hisobdan chiqarib bo`lmaydi', () => {
    // Aks holda javobgarlikni jimgina o'chirish yo'li ochilardi: xodimda
    // turgan telefon «hisobdan chiqarildi» bo'lsa, bo'shatish ro'yxati
    // ham, javobgarlik taxtasi ham uni ko'rmay qolardi.
    const reason = manualStatusBlockReason(EQUIPMENT_STATUS.writtenOff, true);
    expect(reason).not.toBeNull();
    expect(reason).toContain('qaytarilsin');
  });

  it('biriktirilmagan jihozni hisobdan chiqarish mumkin', () => {
    expect(manualStatusBlockReason(EQUIPMENT_STATUS.writtenOff, false)).toBeNull();
  });

  it('`assigned` holatini QO`LDA tanlab bo`lmaydi — u biriktirishdan kelib chiqadi', () => {
    // Tizim biladigan bandni qo'lda belgilash taqiqi (bo'shatish ro'yxati
    // bilan bir xil qoida): «kimdaligi» faqat biriktirish qatoridan.
    expect(manualStatusBlockReason(EQUIPMENT_STATUS.assigned, false)).not.toBeNull();
  });

  it('noma`lum holat rad etiladi', () => {
    expect(manualStatusBlockReason('sotildi', false)).not.toBeNull();
  });
});

describe('normalizeInventoryNo', () => {
  it('bo`sh qiymat NULL — bo`sh satr «takroriy inventar raqami» to`qnashuvini yaratardi', () => {
    expect(normalizeInventoryNo('')).toBeNull();
    expect(normalizeInventoryNo('   ')).toBeNull();
    expect(normalizeInventoryNo(null)).toBeNull();
    expect(normalizeInventoryNo(undefined)).toBeNull();
  });

  it('chetlardagi bo`shliqlar olib tashlanadi', () => {
    expect(normalizeInventoryNo('  INV-001 ')).toBe('INV-001');
  });
});

describe('isEquipmentStatus', () => {
  it('faqat ma`lum holatlar', () => {
    expect(isEquipmentStatus('in_stock')).toBe(true);
    expect(isEquipmentStatus('assigned')).toBe(true);
    expect(isEquipmentStatus('yangi')).toBe(false);
  });
});
