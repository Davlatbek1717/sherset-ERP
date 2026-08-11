#!/usr/bin/env node
/**
 * ops-set-stock-1000.mjs — har ombordagi har tovar qoldig'ini berilgan songa
 * (default 1000) TENGLASHTIRADI — «Inventarizatsiya» hujjatlari orqali.
 *
 * Nega to'g'ridan-to'g'ri `Stock` jadvaliga yozilmaydi: `qty` bilan birga
 * `costBalanceMinor` (tan narx balansi) ham siljishi kerak. Qo'lda yozilsa
 * birlik tan narxi (costBalanceMinor / qty) buziladi va butun foyda/marja
 * hisoboti yolg'on chiqadi. Inventory `post` esa farqni buyPrice bazasida
 * to'g'ri kitobga oladi (inventory.service.ts → computeVarianceLine).
 *
 * Yugurtirish (API ishlab turgan bo'lsin):
 *   node scripts/ops-set-stock-1000.mjs
 *   node scripts/ops-set-stock-1000.mjs --qty=500 --dry-run
 *   node scripts/ops-set-stock-1000.mjs --chunk=250
 */

const API = process.env.API_URL ?? 'http://localhost:4000/api/v1';
const EMAIL = process.env.API_EMAIL ?? 'admin@demo.local';
const PASSWORD = process.env.API_PASSWORD ?? 'admin123';

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const QTY = String(arg('qty', '1000'));
const CHUNK = Number(arg('chunk', '500'));
const DRY = process.argv.includes('--dry-run');
/**
 * Qaysi omborga yozish (nom yoki id; bo'sh = HAMMASI).
 *
 * 🔴 2026-08-11 da qo'shildi. Filtrsiz skript HAR omborga `QTY` yozadi va
 * katalog/POS ekrani omborlar YIG'INDISINI ko'rsatgani uchun ikki omborli
 * bazada 1000 emas, 2000 chiqadi. Egasi «aniq 1000, oshmasin ham kam ham
 * bo'lmasin» deganda aynan shu tuzoqqa tushilgan edi.
 */
const STORE = String(arg('store', ''));

let token = '';

/**
 * Dev-serverni `tsx watch` boshqaradi — parallel sessiya API faylini tahrir
 * qilsa qayta yuklanadi va o'sha onda ulanish uziladi. Ulanish xatosi butun
 * yugurtirishni to'xtatmasin: server qaytguncha kutamiz. HTTP 4xx/5xx esa
 * haqiqiy xato — darhol otiladi.
 */
async function call(path, { method = 'GET', body } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      const res = await fetch(`${API}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        // Fastify `application/json` da bo'sh tanani rad etadi — tanasiz
        // POST (masalan `transitions/post`) uchun `{}` yuboriladi.
        ...(body || method !== 'GET' ? { body: JSON.stringify(body ?? {}) } : {}),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`${method} ${path} → HTTP ${res.status}: ${text.slice(0, 300)}`);
      return text ? JSON.parse(text) : null;
    } catch (e) {
      if (!/fetch failed|ECONNREFUSED|socket hang up/i.test(e.message)) throw e;
      lastErr = e;
      process.stdout.write(`    ↻ server qayta yuklanmoqda, kutamiz (${attempt}/10)\r`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error(`${method} ${path} — server javob bermadi: ${lastErr?.message}`);
}

async function main() {
  console.log(`📊 Qoldiqni ${QTY} ga tenglashtirish${DRY ? ' (DRY-RUN)' : ''}`);

  // Prod'da parol emas, tayyor token uzatiladi (API_TOKEN) — box'da
  // JWT_SECRET bilan imzolanadi, chunki admin paroli bizda yo'q.
  if (process.env.API_TOKEN) {
    token = process.env.API_TOKEN;
  } else {
    const auth = await call('/auth/login', {
      method: 'POST',
      body: { email: EMAIL, password: PASSWORD },
    });
    token = auth.accessToken;
  }

  const orgs = await call('/organizations?limit=5');
  const org = orgs.items?.[0];
  if (!org) throw new Error('Tashkilot topilmadi');

  const allStores = await call('/stores?limit=100');
  if (!allStores.items?.length) throw new Error('Ombor topilmadi');
  const stores = STORE
    ? { items: allStores.items.filter((s) => s.id === STORE || s.name === STORE) }
    : allStores;
  if (!stores.items.length) {
    throw new Error(
      `«${STORE}» ombori topilmadi. Mavjudlari: ${allStores.items.map((s) => s.name).join(', ')}`,
    );
  }
  console.log(`  Tashkilot: ${org.name} · Omborlar: ${stores.items.map((s) => s.name).join(', ')}`);

  // Arxivlanmagan tovarlar (arxiv qoldig'ini ko'tarish ma'nosiz).
  const productIds = [];
  for (let page = 1; ; page++) {
    const d = await call(`/products?limit=250&page=${page}&archived=false`);
    const items = d.items ?? [];
    if (items.length === 0) break;
    productIds.push(...items.map((p) => p.id));
    if (productIds.length >= (d.total ?? 0)) break;
  }
  console.log(`  Arxivlanmagan tovarlar: ${productIds.length}`);
  if (productIds.length === 0) throw new Error('Tovar topilmadi');

  const chunks = [];
  for (let i = 0; i < productIds.length; i += CHUNK) chunks.push(productIds.slice(i, i + CHUNK));

  let docs = 0;
  let positions = 0;
  for (const store of stores.items) {
    console.log(`\n  🏬 ${store.name} — ${chunks.length} ta hujjat`);
    for (const [i, ids] of chunks.entries()) {
      if (DRY) {
        docs++;
        positions += ids.length;
        continue;
      }
      const inv = await call('/inventories', {
        method: 'POST',
        body: {
          organizationId: org.id,
          storeId: store.id,
          description: `Ops: qoldiqni ${QTY} ga tenglashtirish (${i + 1}/${chunks.length})`,
          positions: ids.map((id) => ({
            assortmentKind: 'product',
            assortmentId: id,
            actualQty: QTY,
          })),
        },
      });
      await call(`/inventories/${inv.id}/transitions/post`, { method: 'POST' });
      docs++;
      positions += ids.length;
      console.log(`    ✓ ${inv.name ?? inv.id} — ${ids.length} pozitsiya post qilindi`);
    }
  }

  console.log(`\n✅ Hujjatlar: ${docs} · pozitsiyalar: ${positions}`);
  if (DRY) return;

  // Tekshiruv — bir necha tovar qoldig'i haqiqatan QTY bo'ldimi.
  const store = stores.items[0];
  const check = await call(`/stocks?storeId=${store.id}&limit=5`).catch(() => null);
  if (check?.items?.length) {
    console.log('  Namuna qoldiqlar:');
    for (const row of check.items.slice(0, 5)) {
      console.log(`    ${row.name ?? row.assortmentId}: ${row.stock ?? row.qty}`);
    }
  }
}

main().catch((e) => {
  console.error('❌', e.message);
  process.exitCode = 1;
});
