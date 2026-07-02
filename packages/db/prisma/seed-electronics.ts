/**
 * seed-electronics.ts — 100 ta turli elektronika tovarini lokal bazaga qo'shadi.
 *
 * Ishga tushirish:
 *   pnpm --filter @moysklad/db exec tsx prisma/seed-electronics.ts
 *
 * - Narxlar tiyin (minor units, ×100) — moysklad write-path bilan bir xil.
 * - Hammasi «Elektronika» papkasiga, «Розничная цена» (default) price-type bilan.
 * - Kodlar ELK-001..ELK-100, idempotent upsert (accountId+code unique).
 */
import { PrismaClient } from '../src/generated';

const prisma = new PrismaClient();

// Kategoriya bo'yicha realistik elektronika mahsulotlari (nom + UZS roznichniy narx).
// buyPrice ≈ 78% roznichniy. Narx UZS so'mda; skript ×100 qilib tiyinga aylantiradi.
const CATALOG: Array<{ cat: string; name: string; price: number; country?: string }> = [
  // Smartfonlar
  { cat: 'Smartfon', name: 'Apple iPhone 15 Pro 256GB', price: 14500000, country: 'CN' },
  { cat: 'Smartfon', name: 'Apple iPhone 15 128GB', price: 10900000, country: 'CN' },
  { cat: 'Smartfon', name: 'Samsung Galaxy S24 256GB', price: 11200000, country: 'VN' },
  { cat: 'Smartfon', name: 'Samsung Galaxy A55 128GB', price: 4900000, country: 'VN' },
  { cat: 'Smartfon', name: 'Xiaomi Redmi Note 13 Pro 256GB', price: 3700000, country: 'CN' },
  { cat: 'Smartfon', name: 'Xiaomi 14 512GB', price: 9800000, country: 'CN' },
  { cat: 'Smartfon', name: 'Realme 12 Pro+ 256GB', price: 4500000, country: 'CN' },
  { cat: 'Smartfon', name: 'Tecno Camon 30 256GB', price: 2900000, country: 'CN' },
  { cat: 'Smartfon', name: 'Infinix Note 40 Pro 256GB', price: 2800000, country: 'CN' },
  { cat: 'Smartfon', name: 'Google Pixel 8 128GB', price: 8200000, country: 'CN' },
  // Noutbuklar
  { cat: 'Noutbuk', name: 'Apple MacBook Air M3 13" 256GB', price: 16500000, country: 'CN' },
  { cat: 'Noutbuk', name: 'Apple MacBook Pro 14" M3 512GB', price: 28500000, country: 'CN' },
  { cat: 'Noutbuk', name: 'ASUS VivoBook 15 i5 16GB 512GB', price: 8900000, country: 'CN' },
  { cat: 'Noutbuk', name: 'ASUS ROG Strix G16 RTX4060', price: 19500000, country: 'CN' },
  { cat: 'Noutbuk', name: 'Lenovo IdeaPad Slim 3 Ryzen5', price: 6700000, country: 'CN' },
  { cat: 'Noutbuk', name: 'Lenovo Legion 5 Pro RTX4070', price: 23000000, country: 'CN' },
  { cat: 'Noutbuk', name: 'HP Pavilion 15 i7 16GB', price: 10200000, country: 'CN' },
  { cat: 'Noutbuk', name: 'Dell Inspiron 15 3520 i5', price: 7800000, country: 'CN' },
  { cat: 'Noutbuk', name: 'Acer Aspire 5 Ryzen7 16GB', price: 8400000, country: 'CN' },
  { cat: 'Noutbuk', name: 'MSI Modern 14 i5 512GB', price: 7900000, country: 'CN' },
  // Planshetlar
  { cat: 'Planshet', name: 'Apple iPad 10.9 (2022) 64GB', price: 5900000, country: 'CN' },
  { cat: 'Planshet', name: 'Apple iPad Air M2 128GB', price: 9700000, country: 'CN' },
  { cat: 'Planshet', name: 'Samsung Galaxy Tab S9 256GB', price: 11500000, country: 'VN' },
  { cat: 'Planshet', name: 'Samsung Galaxy Tab A9+ 64GB', price: 2900000, country: 'VN' },
  { cat: 'Planshet', name: 'Xiaomi Pad 6 128GB', price: 4200000, country: 'CN' },
  { cat: 'Planshet', name: 'Lenovo Tab M11 128GB', price: 2600000, country: 'CN' },
  // Televizorlar
  { cat: 'Televizor', name: 'Samsung 55" Crystal UHD 4K', price: 7300000, country: 'RU' },
  { cat: 'Televizor', name: 'Samsung 65" QLED Q70C', price: 13800000, country: 'RU' },
  { cat: 'Televizor', name: 'LG 55" OLED B3', price: 14900000, country: 'RU' },
  { cat: 'Televizor', name: 'LG 50" UHD UR78', price: 5600000, country: 'RU' },
  { cat: 'Televizor', name: 'Xiaomi TV A2 43" FHD', price: 3200000, country: 'CN' },
  { cat: 'Televizor', name: 'Xiaomi TV A Pro 55" 4K', price: 5100000, country: 'CN' },
  { cat: 'Televizor', name: 'Artel 43" Smart FHD', price: 3000000, country: 'UZ' },
  { cat: 'Televizor', name: 'Premier 50" 4K Android TV', price: 4400000, country: 'UZ' },
  // Quloqchinlar
  { cat: 'Quloqchin', name: 'Apple AirPods Pro 2 (USB-C)', price: 3300000, country: 'CN' },
  { cat: 'Quloqchin', name: 'Apple AirPods 3', price: 2400000, country: 'CN' },
  { cat: 'Quloqchin', name: 'Samsung Galaxy Buds2 Pro', price: 2100000, country: 'VN' },
  { cat: 'Quloqchin', name: 'Sony WH-1000XM5 (over-ear)', price: 4900000, country: 'CN' },
  { cat: 'Quloqchin', name: 'JBL Tune 520BT', price: 690000, country: 'CN' },
  { cat: 'Quloqchin', name: 'Xiaomi Redmi Buds 5', price: 450000, country: 'CN' },
  { cat: 'Quloqchin', name: 'Anker Soundcore Life P3', price: 850000, country: 'CN' },
  { cat: 'Quloqchin', name: 'Marshall Major IV', price: 2200000, country: 'CN' },
  // Smart soatlar
  { cat: 'Smart soat', name: 'Apple Watch Series 9 45mm', price: 6200000, country: 'CN' },
  { cat: 'Smart soat', name: 'Apple Watch SE 2 40mm', price: 3600000, country: 'CN' },
  { cat: 'Smart soat', name: 'Samsung Galaxy Watch6 44mm', price: 3900000, country: 'VN' },
  { cat: 'Smart soat', name: 'Xiaomi Watch S3', price: 1600000, country: 'CN' },
  { cat: 'Smart soat', name: 'Amazfit GTR 4', price: 2100000, country: 'CN' },
  { cat: 'Smart soat', name: 'Huawei Watch GT4 46mm', price: 2800000, country: 'CN' },
  // Monitorlar
  { cat: 'Monitor', name: 'Samsung 24" FHD IPS 75Hz', price: 1500000, country: 'CN' },
  { cat: 'Monitor', name: 'Samsung Odyssey G5 27" 165Hz', price: 3400000, country: 'CN' },
  { cat: 'Monitor', name: 'LG 27" UltraGear QHD 144Hz', price: 3900000, country: 'CN' },
  { cat: 'Monitor', name: 'Dell 24" P2422H IPS', price: 2300000, country: 'CN' },
  { cat: 'Monitor', name: 'AOC 27" 2K 75Hz', price: 2600000, country: 'CN' },
  { cat: 'Monitor', name: 'Xiaomi A24i 24" 100Hz', price: 1300000, country: 'CN' },
  // Klaviatura / Sichqoncha
  { cat: 'Klaviatura', name: 'Logitech MX Keys S', price: 1500000, country: 'CN' },
  { cat: 'Klaviatura', name: 'Razer BlackWidow V4', price: 2100000, country: 'CN' },
  { cat: 'Klaviatura', name: 'Keychron K8 Mexanik', price: 1100000, country: 'CN' },
  { cat: 'Klaviatura', name: 'HyperX Alloy Origins', price: 1400000, country: 'CN' },
  { cat: 'Sichqoncha', name: 'Logitech MX Master 3S', price: 1300000, country: 'CN' },
  { cat: 'Sichqoncha', name: 'Razer DeathAdder V3', price: 950000, country: 'CN' },
  { cat: 'Sichqoncha', name: 'Logitech G502 Hero', price: 750000, country: 'CN' },
  { cat: 'Sichqoncha', name: 'A4Tech Bloody W90', price: 320000, country: 'CN' },
  // Routerlar / Tarmoq
  { cat: 'Router', name: 'TP-Link Archer C6 AC1200', price: 480000, country: 'CN' },
  { cat: 'Router', name: 'TP-Link Archer AX55 WiFi6', price: 1100000, country: 'CN' },
  { cat: 'Router', name: 'Xiaomi Router AX3000T', price: 620000, country: 'CN' },
  { cat: 'Router', name: 'Mercusys MR70X WiFi6', price: 540000, country: 'CN' },
  { cat: 'Router', name: 'Keenetic Hopper KN-3810', price: 1400000, country: 'CN' },
  // Kolonkalar
  { cat: 'Kolonka', name: 'JBL Charge 5', price: 2200000, country: 'CN' },
  { cat: 'Kolonka', name: 'JBL Flip 6', price: 1500000, country: 'CN' },
  { cat: 'Kolonka', name: 'Marshall Emberton II', price: 2900000, country: 'CN' },
  { cat: 'Kolonka', name: 'Xiaomi Sound Move', price: 950000, country: 'CN' },
  { cat: 'Kolonka', name: 'Sven PS-485 portativ', price: 420000, country: 'CN' },
  // Power bank / Zaryadlovchi
  { cat: 'Power bank', name: 'Anker PowerCore 20000 mAh', price: 650000, country: 'CN' },
  { cat: 'Power bank', name: 'Xiaomi Power Bank 3 10000', price: 280000, country: 'CN' },
  { cat: 'Power bank', name: 'Baseus Blade 20000 100W', price: 850000, country: 'CN' },
  { cat: 'Zaryadlovchi', name: 'Apple 20W USB-C adapter', price: 290000, country: 'CN' },
  { cat: 'Zaryadlovchi', name: 'Samsung 45W Super Fast', price: 380000, country: 'CN' },
  { cat: 'Zaryadlovchi', name: 'Baseus GaN5 65W', price: 420000, country: 'CN' },
  { cat: 'Zaryadlovchi', name: 'Ugreen Nexode 100W', price: 690000, country: 'CN' },
  // Kameralar
  { cat: 'Kamera', name: 'Canon EOS R50 Kit 18-45', price: 11200000, country: 'JP' },
  { cat: 'Kamera', name: 'Sony Alpha A6400 Body', price: 13500000, country: 'JP' },
  { cat: 'Kamera', name: 'Nikon Z30 Kit 16-50', price: 9800000, country: 'JP' },
  { cat: 'Kamera', name: 'GoPro HERO12 Black', price: 5600000, country: 'CN' },
  { cat: 'Kamera', name: 'DJI Osmo Action 4', price: 4900000, country: 'CN' },
  { cat: 'Kamera', name: 'Insta360 X4', price: 6200000, country: 'CN' },
  // Printer / Ofis
  { cat: 'Printer', name: 'HP LaserJet M111w', price: 1700000, country: 'CN' },
  { cat: 'Printer', name: 'Canon PIXMA G2415 (CISS)', price: 2100000, country: 'VN' },
  { cat: 'Printer', name: 'Epson L3260 (CISS)', price: 2600000, country: 'ID' },
  { cat: 'Printer', name: 'Pantum P2207 lazer', price: 1100000, country: 'CN' },
  // Saqlash / Aksessuar
  { cat: 'SSD', name: 'Samsung 980 NVMe 1TB', price: 1100000, country: 'CN' },
  { cat: 'SSD', name: 'Kingston NV2 500GB NVMe', price: 520000, country: 'CN' },
  { cat: 'SSD', name: 'WD Blue SN580 1TB', price: 1050000, country: 'CN' },
  { cat: 'Flesh', name: 'SanDisk Ultra 128GB USB3', price: 180000, country: 'CN' },
  { cat: 'Xotira karta', name: 'SanDisk Extreme microSD 128GB', price: 220000, country: 'CN' },
  { cat: 'HDD', name: 'Seagate BarraCuda 2TB', price: 950000, country: 'CN' },
  { cat: 'Veb-kamera', name: 'Logitech C920 HD Pro', price: 950000, country: 'CN' },
  { cat: 'Dron', name: 'DJI Mini 4K', price: 4700000, country: 'CN' },
  { cat: "O'yin pristavkasi", name: 'Sony PlayStation 5 Slim', price: 8900000, country: 'JP' },
  { cat: 'Proyektor', name: 'XGIMI Halo+ portativ', price: 9200000, country: 'CN' },
  { cat: 'Monoblok', name: 'Apple iMac 24" M3 256GB', price: 21500000, country: 'CN' },
];

async function main() {
  console.log(`🌱 Elektronika seed: ${CATALOG.length} ta tovar...`);

  // Demo account (JWT'dan: 00000000-0000-0000-0000-000000000001) — nomi bo'yicha topamiz.
  const account =
    (await prisma.account.findFirst({ where: { name: 'Demo Organization' } })) ??
    (await prisma.account.findFirst());
  if (!account) throw new Error('Account topilmadi — avval `pnpm db:seed` ishlating.');

  const admin = await prisma.employee.findFirst({
    where: { accountId: account.id, email: 'admin@demo.local' },
  });

  const retailType =
    (await prisma.priceType.findFirst({
      where: { accountId: account.id, isDefault: true },
    })) ??
    (await prisma.priceType.findFirst({ where: { accountId: account.id } }));
  if (!retailType) throw new Error('PriceType topilmadi — avval `pnpm db:seed` ishlating.');

  const store = await prisma.store.findFirst({ where: { accountId: account.id } });
  if (!store) throw new Error('Store (ombor) topilmadi — avval `pnpm db:seed` ishlating.');

  const folder = await prisma.productFolder.upsert({
    where: { accountId_code: { accountId: account.id, code: 'ELEKTRONIKA' } },
    update: {},
    create: {
      accountId: account.id,
      name: 'Elektronika',
      code: 'ELEKTRONIKA',
      pathName: 'Elektronika',
      vat: 12,
      vatEnabled: true,
    },
  });
  console.log('  ✓ Papka:', folder.name);

  let i = 0;
  for (const item of CATALOG) {
    i++;
    const code = `ELK-${String(i).padStart(3, '0')}`;
    const salePriceTiyin = BigInt(Math.round(item.price)) * 100n; // so'm → tiyin
    const buyPriceTiyin = (salePriceTiyin * 78n) / 100n; // ≈78% tannarx
    // Ombordagi joylashuv (NN-NN-NN-NN = sklad-polka-qavat-yacheyka) — har xil
    // sklad va qavatlarga taqsimlangan, deterministik.
    const locSklad = 1 + (i % 3); // omborlar: 1..3
    const locQavat = 1 + (i % 5); // qavatlar: 1..5
    const locPolka = 1 + (i % 20); // polkalar: 1..20
    const locYacheyka = 1 + (i % 50); // yacheykalar: 1..50
    const prod = await prisma.product.upsert({
      where: { accountId_code: { accountId: account.id, code } },
      update: {
        name: item.name,
        buyPrice: buyPriceTiyin,
        salePrices: [{ priceTypeId: retailType.id, value: salePriceTiyin.toString() }],
        productFolderId: folder.id,
        locSklad,
        locPolka,
        locQavat,
        locYacheyka,
      },
      create: {
        accountId: account.id,
        ownerId: admin?.id ?? null,
        productFolderId: folder.id,
        name: item.name,
        code,
        article: code,
        kind: 'product',
        description: `${item.cat} — Elektronika`,
        country: item.country ?? null,
        buyPrice: buyPriceTiyin,
        salePrices: [{ priceTypeId: retailType.id, value: salePriceTiyin.toString() }],
        vat: 12,
        vatEnabled: true,
        useParentVat: false,
        uom: 'шт',
        locSklad,
        locPolka,
        locQavat,
        locYacheyka,
        minimumBalanceMinor: 0n,
      },
    });
    // Ombordagi qoldiq (son) — 5..199 oralig'ida, deterministik.
    const qty = ((i * 13) % 195) + 5;
    const costBalanceMinor = BigInt(qty) * buyPriceTiyin; // weighted-average tannarx
    await prisma.stock.upsert({
      where: {
        accountId_storeId_assortmentKind_assortmentId: {
          accountId: account.id,
          storeId: store.id,
          assortmentKind: 'product',
          assortmentId: prod.id,
        },
      },
      update: { qty, costBalanceMinor },
      create: {
        accountId: account.id,
        storeId: store.id,
        assortmentKind: 'product',
        assortmentId: prod.id,
        qty,
        reservedQty: 0,
        costBalanceMinor,
      },
    });

    if (i % 20 === 0)
      console.log(
        `  … ${i}/${CATALOG.length} (${prod.code}, joy=${locSklad}-${locPolka}-${locQavat}-${locYacheyka}, qoldiq=${qty})`,
      );
  }

  const total = await prisma.product.count({
    where: { accountId: account.id, productFolderId: folder.id, deletedAt: null },
  });
  const stockAgg = await prisma.stock.aggregate({
    where: { accountId: account.id, storeId: store.id },
    _sum: { qty: true },
  });
  console.log(`🎉 Tayyor. «Elektronika» papkasida jami ${total} ta tovar.`);
  console.log(`   Ombor «${store.name}» — umumiy qoldiq: ${stockAgg._sum.qty ?? 0} dona.`);
}

main()
  .catch((e) => {
    console.error('❌ Xato:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
