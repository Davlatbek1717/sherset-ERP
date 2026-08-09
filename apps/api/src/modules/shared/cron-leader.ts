/**
 * Cron single-instance qo'riqchisi — INT-08 (Faza 28, 2026-08-09).
 *
 * `deploy/ecosystem.config.cjs` API'ni `instances: 1, exec_mode: 'fork'` bilan
 * ishga tushiradi va navbat-workerlarining to'g'riligi SHU sozlamaga tayanadi.
 * Sozlama bir kun `cluster`/`instances: 'max'` ga o'zgartirilsa, har replikada
 * `@Cron` yonadi. Qator-darajasidagi claim (`outbox-claim.ts`) buni baribir
 * xavfsiz qiladi, lekin bu qo'riqchi ikkinchi qatlam: pm2 cluster rejimida
 * faqat 0-indeksli replika navbatni bo'shatadi.
 *
 * · `NODE_APP_INSTANCE` — pm2 har bir ilova-nusxasiga beradigan 0-asosli
 *   indeks (fork rejimida ham `0`). Boshqa muhitlarda umuman yo'q ⇒ liderr.
 *   `pm_id` ISHLATILMAYDI: u pm2 ichida GLOBAL (api `1`, web `0` bo'lishi
 *   mumkin) — u bilan tekshirish bitta nusxada ham cronlarni o'chirib
 *   qo'yardi.
 * · `CRON_WORKERS_DISABLED=1` — favqulodda o'chirgich (masalan, migratsiya
 *   oynasida navbatni to'xtatib turish).
 */
export function isCronLeader(): boolean {
  if (process.env.CRON_WORKERS_DISABLED === '1') return false;
  const instance = process.env.NODE_APP_INSTANCE;
  if (instance === undefined || instance === '') return true;
  return instance === '0';
}
