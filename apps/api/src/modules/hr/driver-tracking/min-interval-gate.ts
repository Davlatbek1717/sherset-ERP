/**
 * Minimal-oraliq darvozasi — chaqiruvlarni KETMA-KET va belgilangan oraliq
 * bilan o'tkazadi.
 *
 * Nominatim foydalanish siyosati (operations.osmfoundation.org) buni MAJBURIY
 * qiladi: «an absolute maximum of 1 request per second» va so'rovlar bitta
 * oqimda (single thread) borishi kerak. Buzilsa IP bloklanadi — ya'ni bu
 * optimizatsiya emas, ishlash sharti.
 *
 * Nega oddiy `setTimeout` yetmaydi: ikki dispecher bir vaqtda «Topish» bossa
 * ikki so'rov PARALLEL ketardi. Darvoza navbatni zanjir qilib ushlab turadi —
 * har chaqiruv oldingisining tugashini VA oxirgi so'rovdan `minIntervalMs`
 * o'tishini kutadi.
 *
 * Vaqt manbai in'ektsiya qilinadi (`now`/`sleep`) — test soat kutmasdan
 * oraliqni tekshira oladi.
 */
export interface MinIntervalGateOptions {
  minIntervalMs: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export class MinIntervalGate {
  private readonly minIntervalMs: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  /** Navbat zanjiri — har yangi chaqiruv oxirgisining ustiga ulanadi. */
  private tail: Promise<unknown> = Promise.resolve();
  private lastStartedAt = Number.NEGATIVE_INFINITY;

  constructor(opts: MinIntervalGateOptions) {
    this.minIntervalMs = opts.minIntervalMs;
    this.now = opts.now ?? (() => Date.now());
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  /**
   * `fn`ni navbatga qo'yadi. Chaqiruvchi `fn` natijasini oladi; `fn` xato
   * tashlasa u chaqiruvchiga yetadi, LEKIN navbat buzilmaydi (keyingi
   * chaqiruvlar baribir ishlaydi — aks holda bitta tarmoq xatosi geokoderni
   * butunlay o'ldirardi).
   */
  run<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.tail.then(async () => {
      const wait = this.lastStartedAt + this.minIntervalMs - this.now();
      if (wait > 0) await this.sleep(wait);
      this.lastStartedAt = this.now();
      return fn();
    });
    // Zanjir xatoni YUTADI (`catch`), natija esa chaqiruvchiga xatosi bilan
    // boradi — shu ikkisini ajratmasak, bitta rad etilgan promise butun
    // navbatni to'xtatib qo'yardi.
    this.tail = result.catch(() => undefined);
    return result;
  }
}
