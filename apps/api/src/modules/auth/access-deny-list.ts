import { TtlCache } from '../report/ttl-cache.util.js';

/**
 * **Access-token deny-list (Faza Q12 — `AUTH-05` qoldig'i).**
 *
 * ### Muammo
 * Faza 23 offboarding tranzaksiyasida refresh-tokenlarni bekor qildi, lekin
 * xodim qo'lidagi **amaldagi access-JWT** faqat imzo va `exp` bilan
 * tekshirilardi. `JWT_ACCESS_TTL` default `15m` (`auth.module.ts`) ⇒
 * bo'shatilgan xodim yana 15 daqiqa to'liq ishlay olardi. Media-token
 * (Faza Q13) TTL'i 60 daqiqa — ta'sir oynasi undan ham kattaroq.
 *
 * ### Nega TTL qisqartirilmadi
 * TTL'ni 1-2 daqiqaga tushirish har `<img>`/tab uchun refresh-bo'ronini va
 * sezilarli UX qarzini beradi, muammoni esa faqat kichraytiradi — yopmaydi.
 * Deny-list uni **noldan** yopadi va TTL'ga tegmaydi.
 *
 * ### Manba — DB, kesh faqat tezlatgich
 * Deny-holat DB'dan o'qiladi (`employee.archived` +
 * `employee_offboardings.completed_at`), ya'ni **jarayon restart'ida
 * yo'qolmaydi**. Har so'rovda ikki `findUnique` qilmaslik uchun natija
 * `TtlCache` da qisqa muddat (default 30 s) turadi — Faza 26 (PERF-06)
 * naqshi; API `instances: 1` (`deploy/ecosystem.config.cjs`) bo'lgani uchun
 * in-process kesh = jarayon keshi, ikkinchi replika yo'q.
 *
 * ### «Floor» — keshdan tez yo'l
 * `TokenService.revokeAllForEmployee` bekor qilinganda in-process
 * `floors` yozuvini qo'yadi. Shu tufayli bekor qilish kesh TTL'ini
 * kutmasdan **darhol** kuchga kiradi va offboarding tranzaksiyasi hali
 * COMMIT bo'lmagan bo'lsa ham fail-closed tomonga xato qiladi (rollback
 * bo'lsa foydalanuvchi qayta login qiladi — teskarisi xavfsizlik teshigi).
 * Floor jarayonga xos; DB manbasi (offboarding) restart'dan keyin ham
 * qoladi, floor esa retention oynasidan keyin keraksiz — undan eski `iat`li
 * har qanday access-token allaqachon `exp` bo'yicha o'lgan.
 *
 * ### Fail-closed / fail-open chegarasi
 *  - `archived` ⇒ **shartsiz** rad. Arxivlangan xodim login ham
 *    (`auth.service.ts:43`), refresh ham (`auth.service.ts:169`) qila
 *    olmaydi ⇒ uning yaroqli tokeni bo'lishi mumkin emas.
 *  - Xodim DB'da umuman yo'q ⇒ rad (o'chirilgan xodim tokeni o'lik).
 *  - Bekor qilish BOR, lekin token'da `iat` YO'Q ⇒ **rad** (fail-closed):
 *    tokenning bekor qilishdan KEYIN chiqarilganini isbotlab bo'lmaydi.
 *    Bu faqat bekor qilingan xodimga tegadi — `iat`siz eski tokenlar
 *    bo'shatilmagan xodimlarda hech nima sezmaydi.
 *  - **Loader xatosi (DB blip) ⇒ ruxsat** (fail-open). Aks holda DB'ning
 *    bir soniyalik uzilishi butun tizimni 401 qilib, FE'ni hammani
 *    logout qilishga majbur qilardi — mavjudlik zarari xavfsizlik
 *    foydasidan katta. Bu holatda ham in-process floor'lar kuchda qoladi.
 */

export interface EmployeeAccessState {
  /** Xodim arxivlangan (yoki DB'da yo'q) — kirish shartsiz yopiq. */
  archived: boolean;
  /** Kirish bekor qilingan payt (offboarding yakuni). `null` = bekor qilinmagan. */
  revokedAt: Date | null;
}

export type AccessStateLoader = (employeeId: string) => Promise<EmployeeAccessState>;

/** Deny-holat keshi. Bekor qilish DB orqali eng ko'pi shuncha kechikadi. */
export const DENY_LIST_TTL_MS = 30_000;

/**
 * Floor yozuvlari shuncha vaqt saqlanadi. Har qanday access/media token
 * bundan avvalgi `iat` bilan allaqachon `exp` bo'yicha o'lik (access 15 daq,
 * media 60 daq) ⇒ eski floor hech narsani himoya qilmaydi.
 */
const FLOOR_RETENTION_MS = 24 * 60 * 60 * 1000;

/** Floor xaritasi shu chegaradan oshsagina tozalash yuguradi (arzon yo'l). */
const FLOOR_PRUNE_THRESHOLD = 256;

export class AccessDenyList {
  private readonly cache: TtlCache<EmployeeAccessState>;
  private readonly floors = new Map<string, number>();

  constructor(
    private readonly load: AccessStateLoader,
    ttlMs: number = DENY_LIST_TTL_MS,
    maxEntries = 2000,
  ) {
    this.cache = new TtlCache<EmployeeAccessState>(ttlMs, maxEntries);
  }

  /** Bekor qilish momentini in-process qayd etadi (monoton: faqat oldinga). */
  markRevoked(employeeId: string, atMs: number = Date.now()): void {
    const prev = this.floors.get(employeeId) ?? 0;
    if (atMs > prev) this.floors.set(employeeId, atMs);
    this.pruneFloors(atMs);
  }

  /**
   * `true` ⇒ token bekor qilingan (chaqiruvchi 401 beradi).
   * @param iatSec token `iat` da'vosi (UNIX sekund) yoki `undefined`.
   */
  async isRevoked(employeeId: string, iatSec: number | undefined): Promise<boolean> {
    let state: EmployeeAccessState;
    try {
      state = await this.cache.getOrLoad(employeeId, () => this.load(employeeId));
    } catch {
      // DB blip butun tizimni logout qilmasin — faqat floor'lar qoladi.
      state = { archived: false, revokedAt: null };
    }
    if (state.archived) return true;

    const revokedMs = Math.max(state.revokedAt?.getTime() ?? 0, this.floors.get(employeeId) ?? 0);
    if (!(revokedMs > 0)) return false; // NaN-xavfsiz: bekor qilish yo'q ⇒ ruxsat
    if (typeof iatSec !== 'number' || !Number.isFinite(iatSec)) return true; // fail-closed
    return iatSec * 1000 < revokedMs;
  }

  /** Testlar / kelajakdagi oshkora invalidatsiya uchun. */
  clear(): void {
    this.cache.clear();
    this.floors.clear();
  }

  private pruneFloors(nowMs: number): void {
    if (this.floors.size < FLOOR_PRUNE_THRESHOLD) return;
    for (const [key, at] of this.floors) {
      if (nowMs - at > FLOOR_RETENTION_MS) this.floors.delete(key);
    }
  }
}
