/**
 * Marshrut allowlist'ining SOF yadrosi (DB yo'q, Nest yo'q).
 *
 * Bu modul `kiosk-policy.ts` dan AJRATIB olindi (G5), chunki endi ikkita
 * cheklangan sirt bor: kassa kioski va TSD (omborchi qo'l terminali).
 * Mos-kelish mantig'ini nusxalash bu repoda nomi bor xato-klassi
 * («copy-paste-loses-a-branch»): bir kun kiosk matcher'iga tuzatish kiradi,
 * TSD nusxasi eskirib qoladi va teshik JIMGINA ochiladi. Shuning uchun
 * qoidalar RO'YXATI ikkita, mantiq esa BITTA.
 *
 * Semantika kiosk ro'yxatidan AYNAN ko'chirildi (xulq o'zgarmagan —
 * `kiosk-policy.test.ts` shuni qulflaydi).
 */

/** HTTP metodlari — `*` = hammasi. */
export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | '*';

export interface Rule {
  /**
   * Yo'l prefiksi (`/api/v1` global prefiksisiz).
   *
   * `:` bilan boshlangan segment — **bitta** yo'l segmentiga mos keladi
   * (`/customer-orders/:id/transitions/confirmed`). Bu ataylab regex emas:
   * ro'yxat o'qiladigan qolsin va «`.*` yozib qo'ydim» xatosi bo'lmasin.
   */
  prefix: string;
  methods: readonly Method[];
  why: string;
  /**
   * `true` → AYNAN shu chuqurlik. Ichki yo'llar OCHILMAYDI.
   *
   * Kerak, chunki oddiy prefiks-qoida butun daraxtni ochadi: `/customer-orders`
   * GET qoidasi `:id/related`, `:id/supply-shortfall` va kelajakdagi har
   * qanday yangi sub-resursni ham jimgina ochib yuborardi.
   */
  exact?: boolean;
}

/** Yo'ldan global prefiks va so'rov qatorini olib tashlaydi. */
export function normalizePath(url: string, globalPrefix = '/api/v1'): string {
  const path = url.split('?')[0] ?? '';
  const withoutPrefix = path.startsWith(globalPrefix) ? path.slice(globalPrefix.length) : path;
  // Oxirgi `/` ahamiyatsiz; bo'sh bo'lsa ildiz.
  const trimmed = withoutPrefix.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

/** `/a/b` → `['a','b']` (bo'sh segmentlarsiz). */
function segments(path: string): string[] {
  return path.split('/').filter((s) => s !== '');
}

/**
 * Yo'l qoidaga mos keladimi — **segment chegarasida**.
 *
 * `/products` qoidasi `/products/123` ga mos keladi, lekin `/products-secret`
 * ga MOS KELMAYDI (aks holda o'xshash nomli yangi modul jimgina ochilib
 * qolardi). `:param` segmenti istalgan BITTA segmentga mos keladi;
 * `exact` bo'lsa chuqurlik ham teng bo'lishi shart.
 */
export function matchesPrefix(rule: Rule, path: string): boolean {
  const ruleSegs = segments(rule.prefix);
  const pathSegs = segments(path);
  if (rule.exact ? pathSegs.length !== ruleSegs.length : pathSegs.length < ruleSegs.length) {
    return false;
  }
  return ruleSegs.every((seg, i) =>
    seg.startsWith(':') ? pathSegs[i] !== undefined : seg === pathSegs[i],
  );
}

/**
 * Ro'yxat shu so'rovni ochadimi. **Default-deny:** ro'yxatda yo'q yo'l — YOPIQ.
 */
export function isAllowedBy(rules: readonly Rule[], method: string, path: string): boolean {
  const m = method.toUpperCase();
  return rules.some((rule) => {
    if (!matchesPrefix(rule, path)) return false;
    return rule.methods.includes('*') || rule.methods.includes(m as Method);
  });
}
