/**
 * Pure data — Delixi & UzKabel product catalog (electrical goods).
 * Shared by the main seed (packages/db/prisma/seed.ts). No Prisma / side
 * effects here so it can be imported without running a seed.
 */
export interface BrandProduct {
  name: string;
  code: string;
  buy: number; // so'm (major units)
  sale: number; // so'm (major units)
  uom: string;
  folder: string;
}

export const DELIXI: BrandProduct[] = [
  // Avtomat uzgichlar (Circuit Breakers)
  { name: 'Delixi CD30 1P 6A avtomat', code: 'DX-CD30-1P-6A', buy: 18000, sale: 25000, uom: 'dona', folder: 'Avtomatlar' },
  { name: 'Delixi CD30 1P 10A avtomat', code: 'DX-CD30-1P-10A', buy: 18000, sale: 25000, uom: 'dona', folder: 'Avtomatlar' },
  { name: 'Delixi CD30 1P 16A avtomat', code: 'DX-CD30-1P-16A', buy: 19000, sale: 27000, uom: 'dona', folder: 'Avtomatlar' },
  { name: 'Delixi CD30 1P 20A avtomat', code: 'DX-CD30-1P-20A', buy: 19000, sale: 27000, uom: 'dona', folder: 'Avtomatlar' },
  { name: 'Delixi CD30 1P 25A avtomat', code: 'DX-CD30-1P-25A', buy: 20000, sale: 28000, uom: 'dona', folder: 'Avtomatlar' },
  { name: 'Delixi CD30 1P 32A avtomat', code: 'DX-CD30-1P-32A', buy: 21000, sale: 30000, uom: 'dona', folder: 'Avtomatlar' },
  { name: 'Delixi CD30 2P 16A avtomat', code: 'DX-CD30-2P-16A', buy: 38000, sale: 52000, uom: 'dona', folder: 'Avtomatlar' },
  { name: 'Delixi CD30 2P 25A avtomat', code: 'DX-CD30-2P-25A', buy: 40000, sale: 56000, uom: 'dona', folder: 'Avtomatlar' },
  { name: 'Delixi CD30 2P 32A avtomat', code: 'DX-CD30-2P-32A', buy: 42000, sale: 58000, uom: 'dona', folder: 'Avtomatlar' },
  { name: 'Delixi CD30 3P 16A avtomat', code: 'DX-CD30-3P-16A', buy: 65000, sale: 90000, uom: 'dona', folder: 'Avtomatlar' },
  { name: 'Delixi CD30 3P 25A avtomat', code: 'DX-CD30-3P-25A', buy: 68000, sale: 95000, uom: 'dona', folder: 'Avtomatlar' },
  { name: 'Delixi CD30 3P 40A avtomat', code: 'DX-CD30-3P-40A', buy: 75000, sale: 105000, uom: 'dona', folder: 'Avtomatlar' },
  { name: 'Delixi CD30 3P 63A avtomat', code: 'DX-CD30-3P-63A', buy: 90000, sale: 125000, uom: 'dona', folder: 'Avtomatlar' },
  // Differensial avtomatlar (RCCB / RCBO)
  { name: 'Delixi ELCB 2P 16A 30mA', code: 'DX-ELCB-2P-16-30', buy: 85000, sale: 118000, uom: 'dona', folder: 'Differensiallar' },
  { name: 'Delixi ELCB 2P 25A 30mA', code: 'DX-ELCB-2P-25-30', buy: 90000, sale: 125000, uom: 'dona', folder: 'Differensiallar' },
  { name: 'Delixi ELCB 2P 32A 30mA', code: 'DX-ELCB-2P-32-30', buy: 95000, sale: 132000, uom: 'dona', folder: 'Differensiallar' },
  { name: 'Delixi ELCB 4P 25A 30mA', code: 'DX-ELCB-4P-25-30', buy: 165000, sale: 230000, uom: 'dona', folder: 'Differensiallar' },
  { name: 'Delixi ELCB 4P 40A 30mA', code: 'DX-ELCB-4P-40-30', buy: 180000, sale: 250000, uom: 'dona', folder: 'Differensiallar' },
  // Kontaktorlar
  { name: 'Delixi CJX2-0910 9A kontaktor', code: 'DX-CJX2-0910', buy: 55000, sale: 78000, uom: 'dona', folder: 'Kontaktorlar' },
  { name: 'Delixi CJX2-1210 12A kontaktor', code: 'DX-CJX2-1210', buy: 58000, sale: 82000, uom: 'dona', folder: 'Kontaktorlar' },
  { name: 'Delixi CJX2-1810 18A kontaktor', code: 'DX-CJX2-1810', buy: 65000, sale: 92000, uom: 'dona', folder: 'Kontaktorlar' },
  { name: 'Delixi CJX2-2510 25A kontaktor', code: 'DX-CJX2-2510', buy: 75000, sale: 105000, uom: 'dona', folder: 'Kontaktorlar' },
  { name: 'Delixi CJX2-4011 40A kontaktor', code: 'DX-CJX2-4011', buy: 115000, sale: 160000, uom: 'dona', folder: 'Kontaktorlar' },
  { name: 'Delixi CJX2-6511 65A kontaktor', code: 'DX-CJX2-6511', buy: 165000, sale: 230000, uom: 'dona', folder: 'Kontaktorlar' },
  // Rozetkalar va kalitlar
  { name: 'Delixi E323 rozetka 16A oq', code: 'DX-E323-WH', buy: 8000, sale: 12000, uom: 'dona', folder: 'Rozetka va kalitlar' },
  { name: 'Delixi E323 rozetka 16A kulrang', code: 'DX-E323-GR', buy: 8000, sale: 12000, uom: 'dona', folder: 'Rozetka va kalitlar' },
  { name: 'Delixi E323 2 ta rozetka oq', code: 'DX-E323-2WH', buy: 14000, sale: 20000, uom: 'dona', folder: 'Rozetka va kalitlar' },
  { name: 'Delixi E323 1 kalit oq', code: 'DX-E323-S1WH', buy: 7000, sale: 10000, uom: 'dona', folder: 'Rozetka va kalitlar' },
  { name: 'Delixi E323 2 kalit oq', code: 'DX-E323-S2WH', buy: 11000, sale: 15000, uom: 'dona', folder: 'Rozetka va kalitlar' },
  { name: 'Delixi E323 3 kalit oq', code: 'DX-E323-S3WH', buy: 14000, sale: 20000, uom: 'dona', folder: 'Rozetka va kalitlar' },
  { name: 'Delixi E323 protxodnoy kalit', code: 'DX-E323-SXWH', buy: 10000, sale: 14000, uom: 'dona', folder: 'Rozetka va kalitlar' },
  // Faza relesi
  { name: 'Delixi JVR faza relesi 3F', code: 'DX-JVR-3F', buy: 95000, sale: 132000, uom: 'dona', folder: 'Rele va taymerlar' },
  { name: 'Delixi JSZ3 taymer relesi', code: 'DX-JSZ3', buy: 65000, sale: 90000, uom: 'dona', folder: 'Rele va taymerlar' },
  { name: 'Delixi JZX rele 24V DC', code: 'DX-JZX-24', buy: 22000, sale: 32000, uom: 'dona', folder: 'Rele va taymerlar' },
  { name: 'Delixi JZX rele 220V AC', code: 'DX-JZX-220', buy: 22000, sale: 32000, uom: 'dona', folder: 'Rele va taymerlar' },
  // Motor himoyachisi
  { name: 'Delixi T16 motor himoyachisi 1-1.6A', code: 'DX-T16-1.6', buy: 85000, sale: 118000, uom: 'dona', folder: 'Motor himoyachilari' },
  { name: 'Delixi T16 motor himoyachisi 2.5-4A', code: 'DX-T16-4', buy: 88000, sale: 122000, uom: 'dona', folder: 'Motor himoyachilari' },
  { name: 'Delixi T16 motor himoyachisi 6-10A', code: 'DX-T16-10', buy: 92000, sale: 128000, uom: 'dona', folder: 'Motor himoyachilari' },
  { name: 'Delixi T16 motor himoyachisi 10-16A', code: 'DX-T16-16', buy: 98000, sale: 136000, uom: 'dona', folder: 'Motor himoyachilari' },
  // Kabel kanallar
  { name: 'Delixi kabel kanali 25x16 oq (2m)', code: 'DX-KK-25x16', buy: 12000, sale: 17000, uom: 'dona', folder: 'Kabel kanallari' },
  { name: 'Delixi kabel kanali 40x25 oq (2m)', code: 'DX-KK-40x25', buy: 18000, sale: 25000, uom: 'dona', folder: 'Kabel kanallari' },
  { name: 'Delixi kabel kanali 60x40 oq (2m)', code: 'DX-KK-60x40', buy: 28000, sale: 38000, uom: 'dona', folder: 'Kabel kanallari' },
  { name: 'Delixi kabel kanali 80x60 oq (2m)', code: 'DX-KK-80x60', buy: 42000, sale: 58000, uom: 'dona', folder: 'Kabel kanallari' },
];

export const UZKABEL: BrandProduct[] = [
  // NYM kabel (mis, izolatsiyali)
  { name: 'UzKabel NYM 2x1.5 kabel (100m)', code: 'UK-NYM-2x1.5-100', buy: 320000, sale: 450000, uom: 'rulon', folder: 'NYM kabellar' },
  { name: 'UzKabel NYM 2x2.5 kabel (100m)', code: 'UK-NYM-2x2.5-100', buy: 480000, sale: 670000, uom: 'rulon', folder: 'NYM kabellar' },
  { name: 'UzKabel NYM 3x1.5 kabel (100m)', code: 'UK-NYM-3x1.5-100', buy: 480000, sale: 670000, uom: 'rulon', folder: 'NYM kabellar' },
  { name: 'UzKabel NYM 3x2.5 kabel (100m)', code: 'UK-NYM-3x2.5-100', buy: 680000, sale: 950000, uom: 'rulon', folder: 'NYM kabellar' },
  { name: 'UzKabel NYM 3x4 kabel (100m)', code: 'UK-NYM-3x4-100', buy: 980000, sale: 1380000, uom: 'rulon', folder: 'NYM kabellar' },
  { name: 'UzKabel NYM 3x6 kabel (100m)', code: 'UK-NYM-3x6-100', buy: 1380000, sale: 1950000, uom: 'rulon', folder: 'NYM kabellar' },
  { name: 'UzKabel NYM 4x2.5 kabel (100m)', code: 'UK-NYM-4x2.5-100', buy: 890000, sale: 1250000, uom: 'rulon', folder: 'NYM kabellar' },
  { name: 'UzKabel NYM 4x4 kabel (100m)', code: 'UK-NYM-4x4-100', buy: 1280000, sale: 1800000, uom: 'rulon', folder: 'NYM kabellar' },
  { name: 'UzKabel NYM 4x6 kabel (100m)', code: 'UK-NYM-4x6-100', buy: 1780000, sale: 2500000, uom: 'rulon', folder: 'NYM kabellar' },
  { name: 'UzKabel NYM 5x2.5 kabel (100m)', code: 'UK-NYM-5x2.5-100', buy: 1100000, sale: 1550000, uom: 'rulon', folder: 'NYM kabellar' },
  // AVVG kabel (alyuminiy)
  { name: 'UzKabel AVVG 2x2.5 (100m)', code: 'UK-AVVG-2x2.5-100', buy: 180000, sale: 250000, uom: 'rulon', folder: 'AVVG kabellar' },
  { name: 'UzKabel AVVG 2x4 (100m)', code: 'UK-AVVG-2x4-100', buy: 240000, sale: 340000, uom: 'rulon', folder: 'AVVG kabellar' },
  { name: 'UzKabel AVVG 3x2.5 (100m)', code: 'UK-AVVG-3x2.5-100', buy: 250000, sale: 350000, uom: 'rulon', folder: 'AVVG kabellar' },
  { name: 'UzKabel AVVG 3x4 (100m)', code: 'UK-AVVG-3x4-100', buy: 360000, sale: 500000, uom: 'rulon', folder: 'AVVG kabellar' },
  { name: 'UzKabel AVVG 3x6 (100m)', code: 'UK-AVVG-3x6-100', buy: 480000, sale: 670000, uom: 'rulon', folder: 'AVVG kabellar' },
  { name: 'UzKabel AVVG 4x4 (100m)', code: 'UK-AVVG-4x4-100', buy: 480000, sale: 670000, uom: 'rulon', folder: 'AVVG kabellar' },
  { name: 'UzKabel AVVG 4x6 (100m)', code: 'UK-AVVG-4x6-100', buy: 680000, sale: 950000, uom: 'rulon', folder: 'AVVG kabellar' },
  { name: 'UzKabel AVVG 4x10 (100m)', code: 'UK-AVVG-4x10-100', buy: 980000, sale: 1380000, uom: 'rulon', folder: 'AVVG kabellar' },
  // VVG kabel (mis)
  { name: 'UzKabel VVG 2x1.5 (100m)', code: 'UK-VVG-2x1.5-100', buy: 380000, sale: 530000, uom: 'rulon', folder: 'VVG kabellar' },
  { name: 'UzKabel VVG 2x2.5 (100m)', code: 'UK-VVG-2x2.5-100', buy: 550000, sale: 770000, uom: 'rulon', folder: 'VVG kabellar' },
  { name: 'UzKabel VVG 3x1.5 (100m)', code: 'UK-VVG-3x1.5-100', buy: 530000, sale: 740000, uom: 'rulon', folder: 'VVG kabellar' },
  { name: 'UzKabel VVG 3x2.5 (100m)', code: 'UK-VVG-3x2.5-100', buy: 750000, sale: 1050000, uom: 'rulon', folder: 'VVG kabellar' },
  { name: 'UzKabel VVG 3x4 (100m)', code: 'UK-VVG-3x4-100', buy: 1100000, sale: 1540000, uom: 'rulon', folder: 'VVG kabellar' },
  { name: 'UzKabel VVG 3x6 (100m)', code: 'UK-VVG-3x6-100', buy: 1560000, sale: 2180000, uom: 'rulon', folder: 'VVG kabellar' },
  { name: 'UzKabel VVG 4x2.5 (100m)', code: 'UK-VVG-4x2.5-100', buy: 980000, sale: 1380000, uom: 'rulon', folder: 'VVG kabellar' },
  { name: 'UzKabel VVG 4x6 (100m)', code: 'UK-VVG-4x6-100', buy: 1980000, sale: 2780000, uom: 'rulon', folder: 'VVG kabellar' },
  // PV1 / PV3 simlar
  { name: "UzKabel PV1 1.5mm² qizil (100m)", code: 'UK-PV1-1.5-R', buy: 120000, sale: 170000, uom: 'rulon', folder: 'Simlar' },
  { name: "UzKabel PV1 1.5mm² ko'k (100m)", code: 'UK-PV1-1.5-B', buy: 120000, sale: 170000, uom: 'rulon', folder: 'Simlar' },
  { name: "UzKabel PV1 2.5mm² qizil (100m)", code: 'UK-PV1-2.5-R', buy: 180000, sale: 250000, uom: 'rulon', folder: 'Simlar' },
  { name: "UzKabel PV1 2.5mm² ko'k (100m)", code: 'UK-PV1-2.5-B', buy: 180000, sale: 250000, uom: 'rulon', folder: 'Simlar' },
  { name: "UzKabel PV1 4mm² sariq-yashil (100m)", code: 'UK-PV1-4-YG', buy: 280000, sale: 390000, uom: 'rulon', folder: 'Simlar' },
  { name: "UzKabel PV3 6mm² qizil (100m)", code: 'UK-PV3-6-R', buy: 420000, sale: 590000, uom: 'rulon', folder: 'Simlar' },
  { name: "UzKabel PV3 10mm² qizil (100m)", code: 'UK-PV3-10-R', buy: 680000, sale: 950000, uom: 'rulon', folder: 'Simlar' },
  { name: "UzKabel PV3 16mm² qizil (100m)", code: 'UK-PV3-16-R', buy: 1080000, sale: 1510000, uom: 'rulon', folder: 'Simlar' },
  { name: "UzKabel PV3 25mm² qizil (100m)", code: 'UK-PV3-25-R', buy: 1680000, sale: 2350000, uom: 'rulon', folder: 'Simlar' },
];

// The 50 products the main seed stocks in the warehouses — 30 Delixi + 20 UzKabel.
export const CATALOG_50: BrandProduct[] = [...DELIXI.slice(0, 30), ...UZKABEL.slice(0, 20)];
