/**
 * AUTH-02 boot-guard: prod'da imzo-sirlar (JWT_SECRET, COOKIE_SECRET) env'da
 * bo'lishi MAJBURIY. Ilgari `?? 'dev-secret-change-in-prod'` jim fallback edi —
 * env unutilsa API ishlayveradi, lekin har kim ma'lum sir bilan istalgan admin
 * JWT'sini qalbaki imzolay oladi (to'liq auth-bypass, barcha tenantlar).
 * parseTtl (auth.module.ts) kabi: noto'g'ri konfiguratsiya = boot'da baland
 * ovozda yiqilish, jim tuzoq emas.
 */
export function resolveSecret(opts: {
  name: string;
  value: string | undefined;
  devFallback: string;
  /** Testlar uchun in'yeksiya; chaqiruvchilar process.env.NODE_ENV uzatadi. */
  nodeEnv: string | undefined;
}): string {
  if (opts.nodeEnv === 'production') {
    if (!opts.value || opts.value === opts.devFallback) {
      throw new Error(
        `${opts.name} is not set (or still the dev fallback) while NODE_ENV=production. ` +
          'Refusing to boot: a well-known signing secret means anyone can forge tokens. ' +
          `Set a strong random ${opts.name} in the environment.`,
      );
    }
    return opts.value;
  }
  return opts.value || opts.devFallback;
}
