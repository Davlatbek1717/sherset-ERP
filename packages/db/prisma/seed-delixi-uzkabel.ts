/**
 * Delixi va UzKabel brendlaridan 100 ta tovar seed qilish.
 * Elektr jihozlari — avtomatlar, kabellar, rozеtkalar, kontaktorlar va h.k.
 */
import { PrismaClient } from '../src/generated/index.js';

const prisma = new PrismaClient();
const ACCOUNT_ID = '00000000-0000-0000-0000-000000000001';

// ── Delixi mahsulotlari (60 ta) ──────────────────────────────────────────────
const DELIXI: Product[] = [
  // Avtomat uzgichlar (Circuit Breakers)
  { name: 'Delixi CD30 1P 6A avtomat', code: 'DX-CD30-1P-6A',  buy: 18000,  sale: 25000,  uom: 'dona', folder: 'Avtomatlar' },
  { name: 'Delixi CD30 1P 10A avtomat', code: 'DX-CD30-1P-10A', buy: 18000,  sale: 25000,  uom: 'dona', folder: 'Avtomatlar' },
  { name: 'Delixi CD30 1P 16A avtomat', code: 'DX-CD30-1P-16A', buy: 19000,  sale: 27000,  uom: 'dona', folder: 'Avtomatlar' },
  { name: 'Delixi CD30 1P 20A avtomat', code: 'DX-CD30-1P-20A', buy: 19000,  sale: 27000,  uom: 'dona', folder: 'Avtomatlar' },
  { name: 'Delixi CD30 1P 25A avtomat', code: 'DX-CD30-1P-25A', buy: 20000,  sale: 28000,  uom: 'dona', folder: 'Avtomatlar' },
  { name: 'Delixi CD30 1P 32A avtomat', code: 'DX-CD30-1P-32A', buy: 21000,  sale: 30000,  uom: 'dona', folder: 'Avtomatlar' },
  { name: 'Delixi CD30 2P 16A avtomat', code: 'DX-CD30-2P-16A', buy: 38000,  sale: 52000,  uom: 'dona', folder: 'Avtomatlar' },
  { name: 'Delixi CD30 2P 25A avtomat', code: 'DX-CD30-2P-25A', buy: 40000,  sale: 56000,  uom: 'dona', folder: 'Avtomatlar' },
  { name: 'Delixi CD30 2P 32A avtomat', code: 'DX-CD30-2P-32A', buy: 42000,  sale: 58000,  uom: 'dona', folder: 'Avtomatlar' },
  { name: 'Delixi CD30 3P 16A avtomat', code: 'DX-CD30-3P-16A', buy: 65000,  sale: 90000,  uom: 'dona', folder: 'Avtomatlar' },
  { name: 'Delixi CD30 3P 25A avtomat', code: 'DX-CD30-3P-25A', buy: 68000,  sale: 95000,  uom: 'dona', folder: 'Avtomatlar' },
  { name: 'Delixi CD30 3P 40A avtomat', code: 'DX-CD30-3P-40A', buy: 75000,  sale: 105000, uom: 'dona', folder: 'Avtomatlar' },
  { name: 'Delixi CD30 3P 63A avtomat', code: 'DX-CD30-3P-63A', buy: 90000,  sale: 125000, uom: 'dona', folder: 'Avtomatlar' },

  // Differensial avtomatlar (RCCB / RCBO)
  { name: 'Delixi ELCB 2P 16A 30mA', code: 'DX-ELCB-2P-16-30', buy: 85000,  sale: 118000, uom: 'dona', folder: 'Differensiallar' },
  { name: 'Delixi ELCB 2P 25A 30mA', code: 'DX-ELCB-2P-25-30', buy: 90000,  sale: 125000, uom: 'dona', folder: 'Differensiallar' },
  { name: 'Delixi ELCB 2P 32A 30mA', code: 'DX-ELCB-2P-32-30', buy: 95000,  sale: 132000, uom: 'dona', folder: 'Differensiallar' },
  { name: 'Delixi ELCB 4P 25A 30mA', code: 'DX-ELCB-4P-25-30', buy: 165000, sale: 230000, uom: 'dona', folder: 'Differensiallar' },
  { name: 'Delixi ELCB 4P 40A 30mA', code: 'DX-ELCB-4P-40-30', buy: 180000, sale: 250000, uom: 'dona', folder: 'Differensiallar' },

  // Kontaktorlar
  { name: 'Delixi CJX2-0910 9A kontaktor', code: 'DX-CJX2-0910', buy: 55000,  sale: 78000,  uom: 'dona', folder: 'Kontaktorlar' },
  { name: 'Delixi CJX2-1210 12A kontaktor', code: 'DX-CJX2-1210', buy: 58000,  sale: 82000,  uom: 'dona', folder: 'Kontaktorlar' },
  { name: 'Delixi CJX2-1810 18A kontaktor', code: 'DX-CJX2-1810', buy: 65000,  sale: 92000,  uom: 'dona', folder: 'Kontaktorlar' },
  { name: 'Delixi CJX2-2510 25A kontaktor', code: 'DX-CJX2-2510', buy: 75000,  sale: 105000, uom: 'dona', folder: 'Kontaktorlar' },
  { name: 'Delixi CJX2-4011 40A kontaktor', code: 'DX-CJX2-4011', buy: 115000, sale: 160000, uom: 'dona', folder: 'Kontaktorlar' },
  { name: 'Delixi CJX2-6511 65A kontaktor', code: 'DX-CJX2-6511', buy: 165000, sale: 230000, uom: 'dona', folder: 'Kontaktorlar' },

  // Rozetkalar va kalitlar
  { name: 'Delixi E323 rozetka 16A oq',  code: 'DX-E323-WH',  buy: 8000,   sale: 12000,  uom: 'dona', folder: 'Rozetka va kalitlar' },
  { name: 'Delixi E323 rozetka 16A kulrang', code: 'DX-E323-GR', buy: 8000,  sale: 12000,  uom: 'dona', folder: 'Rozetka va kalitlar' },
  { name: 'Delixi E323 2 ta rozetka oq', code: 'DX-E323-2WH', buy: 14000,  sale: 20000,  uom: 'dona', folder: 'Rozetka va kalitlar' },
  { name: 'Delixi E323 1 kalit oq',      code: 'DX-E323-S1WH', buy: 7000,   sale: 10000,  uom: 'dona', folder: 'Rozetka va kalitlar' },
  { name: 'Delixi E323 2 kalit oq',      code: 'DX-E323-S2WH', buy: 11000,  sale: 15000,  uom: 'dona', folder: 'Rozetka va kalitlar' },
  { name: 'Delixi E323 3 kalit oq',      code: 'DX-E323-S3WH', buy: 14000,  sale: 20000,  uom: 'dona', folder: 'Rozetka va kalitlar' },
  { name: 'Delixi E323 proходной kalit', code: 'DX-E323-SXWH', buy: 10000,  sale: 14000,  uom: 'dona', folder: 'Rozetka va kalitlar' },

  // Faza relesi
  { name: 'Delixi JVR faza relesi 3F', code: 'DX-JVR-3F',  buy: 95000,  sale: 132000, uom: 'dona', folder: 'Rele va taymerlар' },
  { name: 'Delixi JSZ3 taymer relesi',  code: 'DX-JSZ3',    buy: 65000,  sale: 90000,  uom: 'dona', folder: 'Rele va taymerlар' },
  { name: 'Delixi JZX rele 24V DC',     code: 'DX-JZX-24', buy: 22000,  sale: 32000,  uom: 'dona', folder: 'Rele va taymerlар' },
  { name: 'Delixi JZX rele 220V AC',    code: 'DX-JZX-220', buy: 22000,  sale: 32000,  uom: 'dona', folder: 'Rele va taymerlар' },

  // Motor himoyachisi
  { name: 'Delixi T16 motor himoyachisi 1-1.6A',  code: 'DX-T16-1.6',  buy: 85000,  sale: 118000, uom: 'dona', folder: 'Motor himoyachilari' },
  { name: 'Delixi T16 motor himoyachisi 2.5-4A',  code: 'DX-T16-4',    buy: 88000,  sale: 122000, uom: 'dona', folder: 'Motor himoyachilari' },
  { name: 'Delixi T16 motor himoyachisi 6-10A',   code: 'DX-T16-10',   buy: 92000,  sale: 128000, uom: 'dona', folder: 'Motor himoyachilari' },
  { name: 'Delixi T16 motor himoyachisi 10-16A',  code: 'DX-T16-16',   buy: 98000,  sale: 136000, uom: 'dona', folder: 'Motor himoyachilari' },

  // Kabel kanaллар
  { name: 'Delixi kabel kanali 25x16 oq (2m)',  code: 'DX-KK-25x16',  buy: 12000,  sale: 17000,  uom: 'dona', folder: 'Kabel kanallari' },
  { name: 'Delixi kabel kanali 40x25 oq (2m)',  code: 'DX-KK-40x25',  buy: 18000,  sale: 25000,  uom: 'dona', folder: 'Kabel kanallari' },
  { name: 'Delixi kabel kanali 60x40 oq (2m)',  code: 'DX-KK-60x40',  buy: 28000,  sale: 38000,  uom: 'dona', folder: 'Kabel kanallari' },
  { name: 'Delixi kabel kanali 80x60 oq (2m)',  code: 'DX-KK-80x60',  buy: 42000,  sale: 58000,  uom: 'dona', folder: 'Kabel kanallari' },

  // Din-reyka
  { name: 'Delixi din-reyka DIN35 (1m)',  code: 'DX-DIN35-1M',  buy: 8000,   sale: 12000,  uom: 'dona', folder: 'Din reykalar' },
  { name: 'Delixi din-reyka DIN35 (2m)',  code: 'DX-DIN35-2M',  buy: 15000,  sale: 22000,  uom: 'dona', folder: 'Din reykalar' },

  // Voltmetrlar va ampermetrlar
  { name: 'Delixi 85L1 voltmetr 0-500V', code: 'DX-85L1-V500', buy: 55000,  sale: 78000,  uom: 'dona', folder: 'O\'lchov asboblari' },
  { name: 'Delixi 85L1 ampermetr 0-50A', code: 'DX-85L1-A50',  buy: 55000,  sale: 78000,  uom: 'dona', folder: 'O\'lchov asboblari' },
  { name: 'Delixi 85L1 ampermetr 0-100A', code: 'DX-85L1-A100', buy: 58000, sale: 82000,  uom: 'dona', folder: 'O\'lchov asboblari' },
  { name: 'Delixi 85L1 ampermetr 0-200A', code: 'DX-85L1-A200', buy: 62000, sale: 88000,  uom: 'dona', folder: 'O\'lchov asboblari' },

  // Tok transformatorlari
  { name: 'Delixi tok transformatori 100/5A', code: 'DX-TT-100-5',  buy: 35000,  sale: 48000,  uom: 'dona', folder: 'Tok transformatorlari' },
  { name: 'Delixi tok transformatori 200/5A', code: 'DX-TT-200-5',  buy: 42000,  sale: 58000,  uom: 'dona', folder: 'Tok transformatorlari' },
  { name: 'Delixi tok transformatori 300/5A', code: 'DX-TT-300-5',  buy: 48000,  sale: 66000,  uom: 'dona', folder: 'Tok transformatorlari' },
  { name: 'Delixi tok transformatori 400/5A', code: 'DX-TT-400-5',  buy: 55000,  sale: 75000,  uom: 'dona', folder: 'Tok transformatorlari' },
  { name: 'Delixi tok transformatori 600/5A', code: 'DX-TT-600-5',  buy: 65000,  sale: 90000,  uom: 'dona', folder: 'Tok transformatorlari' },

  // Stabilizatorlar
  { name: 'Delixi 5kVA stabilizator',  code: 'DX-STAB-5K',  buy: 850000, sale: 1200000, uom: 'dona', folder: 'Stabilizatorlar' },
  { name: 'Delixi 10kVA stabilizator', code: 'DX-STAB-10K', buy: 1500000, sale: 2100000, uom: 'dona', folder: 'Stabilizatorlar' },
];

// ── UzKabel mahsulotlari (40 ta) ─────────────────────────────────────────────
const UZKABEL: Product[] = [
  // NYM kabel (mis, izolatsiyali)
  { name: 'UzKabel NYM 2x1.5 kabel (100m)',  code: 'UK-NYM-2x1.5-100',  buy: 320000,  sale: 450000,  uom: 'rulon', folder: 'NYM kabellar' },
  { name: 'UzKabel NYM 2x2.5 kabel (100m)',  code: 'UK-NYM-2x2.5-100',  buy: 480000,  sale: 670000,  uom: 'rulon', folder: 'NYM kabellar' },
  { name: 'UzKabel NYM 3x1.5 kabel (100m)',  code: 'UK-NYM-3x1.5-100',  buy: 480000,  sale: 670000,  uom: 'rulon', folder: 'NYM kabellar' },
  { name: 'UzKabel NYM 3x2.5 kabel (100m)',  code: 'UK-NYM-3x2.5-100',  buy: 680000,  sale: 950000,  uom: 'rulon', folder: 'NYM kabellar' },
  { name: 'UzKabel NYM 3x4 kabel (100m)',    code: 'UK-NYM-3x4-100',    buy: 980000,  sale: 1380000, uom: 'rulon', folder: 'NYM kabellar' },
  { name: 'UzKabel NYM 3x6 kabel (100m)',    code: 'UK-NYM-3x6-100',    buy: 1380000, sale: 1950000, uom: 'rulon', folder: 'NYM kabellar' },
  { name: 'UzKabel NYM 4x2.5 kabel (100m)',  code: 'UK-NYM-4x2.5-100',  buy: 890000,  sale: 1250000, uom: 'rulon', folder: 'NYM kabellar' },
  { name: 'UzKabel NYM 4x4 kabel (100m)',    code: 'UK-NYM-4x4-100',    buy: 1280000, sale: 1800000, uom: 'rulon', folder: 'NYM kabellar' },
  { name: 'UzKabel NYM 4x6 kabel (100m)',    code: 'UK-NYM-4x6-100',    buy: 1780000, sale: 2500000, uom: 'rulon', folder: 'NYM kabellar' },
  { name: 'UzKabel NYM 5x2.5 kabel (100m)',  code: 'UK-NYM-5x2.5-100',  buy: 1100000, sale: 1550000, uom: 'rulon', folder: 'NYM kabellar' },

  // NYM 1 metr (qayta sotish)
  { name: 'UzKabel NYM 2x1.5 (1m)',  code: 'UK-NYM-2x1.5-1M',  buy: 3200,   sale: 5000,   uom: 'metr', folder: 'NYM kabellar' },
  { name: 'UzKabel NYM 2x2.5 (1m)',  code: 'UK-NYM-2x2.5-1M',  buy: 4800,   sale: 7000,   uom: 'metr', folder: 'NYM kabellar' },
  { name: 'UzKabel NYM 3x1.5 (1m)',  code: 'UK-NYM-3x1.5-1M',  buy: 4800,   sale: 7000,   uom: 'metr', folder: 'NYM kabellar' },
  { name: 'UzKabel NYM 3x2.5 (1m)',  code: 'UK-NYM-3x2.5-1M',  buy: 6800,   sale: 10000,  uom: 'metr', folder: 'NYM kabellar' },
  { name: 'UzKabel NYM 3x4 (1m)',    code: 'UK-NYM-3x4-1M',    buy: 9800,   sale: 14000,  uom: 'metr', folder: 'NYM kabellar' },
  { name: 'UzKabel NYM 3x6 (1m)',    code: 'UK-NYM-3x6-1M',    buy: 13800,  sale: 20000,  uom: 'metr', folder: 'NYM kabellar' },

  // AVVG kabel (alyuminiy)
  { name: 'UzKabel AVVG 2x2.5 (100m)',  code: 'UK-AVVG-2x2.5-100', buy: 180000, sale: 250000, uom: 'rulon', folder: 'AVVG kabellar' },
  { name: 'UzKabel AVVG 2x4 (100m)',    code: 'UK-AVVG-2x4-100',   buy: 240000, sale: 340000, uom: 'rulon', folder: 'AVVG kabellar' },
  { name: 'UzKabel AVVG 3x2.5 (100m)', code: 'UK-AVVG-3x2.5-100', buy: 250000, sale: 350000, uom: 'rulon', folder: 'AVVG kabellar' },
  { name: 'UzKabel AVVG 3x4 (100m)',   code: 'UK-AVVG-3x4-100',   buy: 360000, sale: 500000, uom: 'rulon', folder: 'AVVG kabellar' },
  { name: 'UzKabel AVVG 3x6 (100m)',   code: 'UK-AVVG-3x6-100',   buy: 480000, sale: 670000, uom: 'rulon', folder: 'AVVG kabellar' },
  { name: 'UzKabel AVVG 4x4 (100m)',   code: 'UK-AVVG-4x4-100',   buy: 480000, sale: 670000, uom: 'rulon', folder: 'AVVG kabellar' },
  { name: 'UzKabel AVVG 4x6 (100m)',   code: 'UK-AVVG-4x6-100',   buy: 680000, sale: 950000, uom: 'rulon', folder: 'AVVG kabellar' },
  { name: 'UzKabel AVVG 4x10 (100m)',  code: 'UK-AVVG-4x10-100',  buy: 980000, sale: 1380000,uom: 'rulon', folder: 'AVVG kabellar' },

  // VVG kabel (mis, broneli)
  { name: 'UzKabel VVG 2x1.5 (100m)',  code: 'UK-VVG-2x1.5-100',  buy: 380000, sale: 530000, uom: 'rulon', folder: 'VVG kabellar' },
  { name: 'UzKabel VVG 2x2.5 (100m)',  code: 'UK-VVG-2x2.5-100',  buy: 550000, sale: 770000, uom: 'rulon', folder: 'VVG kabellar' },
  { name: 'UzKabel VVG 3x1.5 (100m)',  code: 'UK-VVG-3x1.5-100',  buy: 530000, sale: 740000, uom: 'rulon', folder: 'VVG kabellar' },
  { name: 'UzKabel VVG 3x2.5 (100m)',  code: 'UK-VVG-3x2.5-100',  buy: 750000, sale: 1050000,uom: 'rulon', folder: 'VVG kabellar' },
  { name: 'UzKabel VVG 3x4 (100m)',    code: 'UK-VVG-3x4-100',    buy: 1100000,sale: 1540000,uom: 'rulon', folder: 'VVG kabellar' },
  { name: 'UzKabel VVG 3x6 (100m)',    code: 'UK-VVG-3x6-100',    buy: 1560000,sale: 2180000,uom: 'rulon', folder: 'VVG kabellar' },
  { name: 'UzKabel VVG 4x2.5 (100m)',  code: 'UK-VVG-4x2.5-100',  buy: 980000, sale: 1380000,uom: 'rulon', folder: 'VVG kabellar' },
  { name: 'UzKabel VVG 4x6 (100m)',    code: 'UK-VVG-4x6-100',    buy: 1980000,sale: 2780000,uom: 'rulon', folder: 'VVG kabellar' },

  // PV1 / PV3 simlar
  { name: 'UzKabel PV1 1.5mm² qizil (100m)',  code: 'UK-PV1-1.5-R', buy: 120000, sale: 170000, uom: 'rulon', folder: 'Simlar' },
  { name: 'UzKabel PV1 1.5mm² ko\'k (100m)',  code: 'UK-PV1-1.5-B', buy: 120000, sale: 170000, uom: 'rulon', folder: 'Simlar' },
  { name: 'UzKabel PV1 2.5mm² qizil (100m)', code: 'UK-PV1-2.5-R', buy: 180000, sale: 250000, uom: 'rulon', folder: 'Simlar' },
  { name: 'UzKabel PV1 2.5mm² ko\'k (100m)', code: 'UK-PV1-2.5-B', buy: 180000, sale: 250000, uom: 'rulon', folder: 'Simlar' },
  { name: 'UzKabel PV1 4mm² sariq-yashil (100m)', code: 'UK-PV1-4-YG', buy: 280000, sale: 390000, uom: 'rulon', folder: 'Simlar' },
  { name: 'UzKabel PV3 6mm² qizil (100m)',   code: 'UK-PV3-6-R',   buy: 420000, sale: 590000, uom: 'rulon', folder: 'Simlar' },
  { name: 'UzKabel PV3 10mm² qizil (100m)',  code: 'UK-PV3-10-R',  buy: 680000, sale: 950000, uom: 'rulon', folder: 'Simlar' },
  { name: 'UzKabel PV3 16mm² qizil (100m)',  code: 'UK-PV3-16-R',  buy: 1080000,sale: 1510000,uom: 'rulon', folder: 'Simlar' },
  { name: 'UzKabel PV3 25mm² qizil (100m)',  code: 'UK-PV3-25-R',  buy: 1680000,sale: 2350000,uom: 'rulon', folder: 'Simlar' },
];

interface Product {
  name: string;
  code: string;
  buy: number;  // so'm
  sale: number; // so'm
  uom: string;
  folder: string;
}

async function main() {
  console.log('🌱 Delixi & UzKabel tovarlar seed qilinmoqda...\n');

  // Mavjud ma'lumotlarni olish
  const priceType = await prisma.priceType.findFirst({
    where: { accountId: ACCOUNT_ID },
  });
  if (!priceType) throw new Error('PriceType topilmadi! Avval asosiy seed ishlating.');

  const admin = await prisma.employee.findFirst({
    where: { accountId: ACCOUNT_ID, email: 'admin@demo.local' },
  });
  if (!admin) throw new Error('Admin topilmadi!');

  const group = await prisma.group.findFirst({
    where: { accountId: ACCOUNT_ID },
  });

  const store = await prisma.store.findFirst({
    where: { accountId: ACCOUNT_ID },
  });

  // Asosiy papka yaratish
  const delixi_folder = await prisma.productFolder.upsert({
    where: { accountId_code: { accountId: ACCOUNT_ID, code: 'DELIXI' } },
    update: {},
    create: { accountId: ACCOUNT_ID, name: 'Delixi', code: 'DELIXI', ownerId: admin.id },
  });

  const uzkabel_folder = await prisma.productFolder.upsert({
    where: { accountId_code: { accountId: ACCOUNT_ID, code: 'UZKABEL' } },
    update: {},
    create: { accountId: ACCOUNT_ID, name: 'UzKabel', code: 'UZKABEL', ownerId: admin.id },
  });

  // Subfolder cache
  const subfolders = new Map<string, string>();

  async function getSubfolder(brandFolderId: string, brandName: string, subName: string): Promise<string> {
    const key = `${brandName}/${subName}`;
    if (subfolders.has(key)) return subfolders.get(key)!;

    const full = `${brandName} — ${subName}`;
    const sfCode = full.replace(/[^A-Z0-9]/gi, '').slice(0, 20).toUpperCase();
    const sf = await prisma.productFolder.upsert({
      where: { accountId_code: { accountId: ACCOUNT_ID, code: sfCode } },
      update: {},
      create: {
        accountId: ACCOUNT_ID,
        name: full,
        code: sfCode,
        ownerId: admin.id,
        parentId: brandFolderId,
      },
    });
    subfolders.set(key, sf.id);
    return sf.id;
  }

  let created = 0;
  const toMinor = (som: number) => BigInt(som) * 100n;

  // Delixi tovarlarini yaratish
  for (const p of DELIXI) {
    const folderId = await getSubfolder(delixi_folder.id, 'Delixi', p.folder);
    await prisma.product.upsert({
      where: { accountId_code: { accountId: ACCOUNT_ID, code: p.code } },
      update: {
        name: p.name,
        buyPrice: toMinor(p.buy),
        salePrices: [{ priceTypeId: priceType.id, value: toMinor(p.sale).toString(), currencyCode: 'UZS' }],
      },
      create: {
        accountId: ACCOUNT_ID,
        ownerId: admin.id,
        groupId: group?.id ?? null,
        productFolderId: folderId,
        name: p.name,
        code: p.code,
        uom: p.uom,
        kind: 'product',
        country: p.name.startsWith('Delixi') ? 'CN' : 'UZ',
        buyPrice: toMinor(p.buy),
        buyPriceCurrency: 'UZS',
        salePrices: [{ priceTypeId: priceType.id, value: toMinor(p.sale).toString(), currencyCode: 'UZS' }],
      },
    });
    created++;
    process.stdout.write(`\r  ✓ ${created} ta yaratildi`);
  }

  // UzKabel tovarlarini yaratish
  for (const p of UZKABEL) {
    const folderId = await getSubfolder(uzkabel_folder.id, 'UzKabel', p.folder);
    await prisma.product.upsert({
      where: { accountId_code: { accountId: ACCOUNT_ID, code: p.code } },
      update: {
        name: p.name,
        buyPrice: toMinor(p.buy),
        salePrices: [{ priceTypeId: priceType.id, value: toMinor(p.sale).toString(), currencyCode: 'UZS' }],
      },
      create: {
        accountId: ACCOUNT_ID,
        ownerId: admin.id,
        groupId: group?.id ?? null,
        productFolderId: folderId,
        name: p.name,
        code: p.code,
        uom: p.uom,
        kind: 'product',
        country: 'UZ',
        buyPrice: toMinor(p.buy),
        buyPriceCurrency: 'UZS',
        salePrices: [{ priceTypeId: priceType.id, value: toMinor(p.sale).toString(), currencyCode: 'UZS' }],
      },
    });
    created++;
    process.stdout.write(`\r  ✓ ${created} ta yaratildi`);
  }

  // Stok yaratish (agar ombor bo'lsa)
  if (store) {
    console.log(`\n\n  📦 Stok yozuvlari yaratilmoqda (ombor: ${store.name})...`);
    const products = await prisma.product.findMany({
      where: { accountId: ACCOUNT_ID },
      select: { id: true },
    });

    for (const prod of products) {
      const qty = Math.floor(Math.random() * 91) + 10; // 10–100 dona
      await prisma.stock.upsert({
        where: {
          accountId_storeId_assortmentKind_assortmentId: {
            accountId: ACCOUNT_ID,
            storeId: store.id,
            assortmentKind: 'product',
            assortmentId: prod.id,
          },
        },
        update: { qty },
        create: {
          accountId: ACCOUNT_ID,
          storeId: store.id,
          assortmentKind: 'product',
          assortmentId: prod.id,
          qty,
          reservedQty: 0,
          costBalanceMinor: 0n,
        },
      });
    }
    console.log(`  ✓ ${products.length} ta mahsulot uchun stok yaratildi`);
  }

  // Joylashuv ma'lumotlarini tayinlash (sklad-polka-qavat-yacheyka)
  // Delixi → Sklad 1, UzKabel → Sklad 2
  // Har bir papka o'z polka-qavat adresiga ega; yacheyka papka ichida 1 dan boshlanadi
  console.log('\n  📍 Joylashuv ma\'lumotlari tayinlanmoqda...');

  const FOLDER_LOCS: Record<string, { sklad: number; polka: number; qavat: number }> = {
    // Delixi — Sklad 1
    'Avtomatlar':           { sklad: 1, polka: 1, qavat: 1 },
    'Differensiallar':      { sklad: 1, polka: 1, qavat: 2 },
    'Kontaktorlar':         { sklad: 1, polka: 2, qavat: 1 },
    'Rozetka va kalitlar':  { sklad: 1, polka: 2, qavat: 2 },
    'Rele va taymerlар':    { sklad: 1, polka: 3, qavat: 1 },
    'Motor himoyachilari':  { sklad: 1, polka: 3, qavat: 2 },
    'Kabel kanallari':      { sklad: 1, polka: 4, qavat: 1 },
    'Din reykalar':         { sklad: 1, polka: 4, qavat: 2 },
    'O\'lchov asboblari':   { sklad: 1, polka: 5, qavat: 1 },
    'Tok transformatorlari':{ sklad: 1, polka: 5, qavat: 2 },
    'Stabilizatorlar':      { sklad: 1, polka: 6, qavat: 1 },
    // UzKabel — Sklad 2
    'NYM kabellar':         { sklad: 2, polka: 1, qavat: 1 },
    'AVVG kabellar':        { sklad: 2, polka: 2, qavat: 1 },
    'VVG kabellar':         { sklad: 2, polka: 2, qavat: 2 },
    'Simlar':               { sklad: 2, polka: 3, qavat: 1 },
  };

  // Subfolder name → loc mapping
  // ProductFolder.name = "Delixi — Avtomatlar" yoki "UzKabel — NYM kabellar" formatida
  // Papkalar bo'yicha mahsulotlarni guruhlang va yacheyka tayinlang
  const yacheykaCounts: Record<string, number> = {};

  const allProducts = await prisma.product.findMany({
    where: { accountId: ACCOUNT_ID },
    select: { id: true, productFolderId: true },
  });

  const folderIds = [...new Set(allProducts.map(p => p.productFolderId).filter(Boolean))];
  const folders = await prisma.productFolder.findMany({
    where: { id: { in: folderIds as string[] } },
    select: { id: true, name: true },
  });
  const folderMap = new Map(folders.map(f => [f.id, f.name]));

  let locUpdated = 0;
  for (const prod of allProducts) {
    if (!prod.productFolderId) continue;
    const folderFullName = folderMap.get(prod.productFolderId) ?? '';
    // "Delixi — Avtomatlar" → "Avtomatlar"; "UzKabel — NYM kabellar" → "NYM kabellar"
    const subName = folderFullName.includes(' — ')
      ? folderFullName.split(' — ').slice(1).join(' — ')
      : folderFullName;

    const loc = FOLDER_LOCS[subName];
    if (!loc) continue;

    yacheykaCounts[subName] = (yacheykaCounts[subName] ?? 0) + 1;
    const yacheyka = yacheykaCounts[subName];

    await prisma.product.update({
      where: { id: prod.id },
      data: {
        locSklad: loc.sklad,
        locPolka: loc.polka,
        locQavat: loc.qavat,
        locYacheyka: yacheyka,
      },
    });
    locUpdated++;
  }
  console.log(`  ✓ ${locUpdated} ta mahsulotga joylashuv tayinlandi`);

  const total = await prisma.product.count({ where: { accountId: ACCOUNT_ID } });
  console.log(`\n✅ Tayyor! Jami ${total} ta mahsulot DB da.`);
  console.log(`   Delixi: ${DELIXI.length} ta | UzKabel: ${UZKABEL.length} ta`);
  console.log(`   Sklad 1 (Delixi) — 11 polka | Sklad 2 (UzKabel) — 3 polka`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
