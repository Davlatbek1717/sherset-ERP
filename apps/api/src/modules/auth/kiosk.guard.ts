import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { AuthenticatedUser } from './auth.schema.js';
import { UI_MODE, isKioskAllowed, normalizePath } from './kiosk-policy.js';
import { TokenService } from './token.service.js';

/**
 * Kiosk cheklovi — SERVER tomonda (kassa TZ §3.1).
 *
 * TZ ochiq talab qiladi: «Faqat UI yashirish **yetarli emas** (bevosita URL
 * bilan kirish bloklanishi shart)». Chap menyuni yashirish kassirni
 * `/api/v1/reports/profitability` ga `curl` bilan kirishdan to'xtatmaydi —
 * uning tokeni haqiqiy va boshqa hech narsa tekshirmasdi.
 *
 * Qoidalar `kiosk-policy.ts` da (sof modul, testlangan). Bu guard faqat
 * qarorni bajaradi. **Default-deny:** ro'yxatda yo'q yo'l — YOPIQ.
 *
 * ⚠️ NEGA TOKENNI O'ZI O'QIYDI: bu **global** guard va Nest'da global
 * guardlar controller-darajasidagi `JwtAuthGuard` dan OLDIN ishlaydi, ya'ni
 * `req.user` hali to'ldirilmagan bo'ladi. Shuning uchun `Authorization`
 * sarlavhasini o'zi tekshiradi.
 *
 * **Autentifikatsiya bu guardning ishi EMAS:** token yo'q/buzuq bo'lsa u
 * jim o'tkazib yuboradi va `JwtAuthGuard` o'z 401'ini qaytaradi. Bu yerda
 * 401 berish barcha public endpointlarni ham yopib qo'yardi.
 */
@Injectable()
export class KioskGuard implements CanActivate {
  private readonly logger = new Logger(KioskGuard.name);

  constructor(@Inject(TokenService) private readonly tokens: TokenService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    // HTTP bo'lmagan kontekst (WebSocket/cron) — bu guard unga tegishli emas.
    if (ctx.getType() !== 'http') return true;

    const req = ctx.switchToHttp().getRequest<{
      user?: AuthenticatedUser;
      method?: string;
      url?: string;
      headers?: Record<string, string | string[] | undefined>;
      raw?: { url?: string };
    }>();

    const user = req.user ?? (await this.decode(req.headers?.authorization));
    if (!user || user.uiMode !== UI_MODE.kiosk) return true;

    const method = req.method ?? 'GET';
    const path = normalizePath(req.url ?? req.raw?.url ?? '/');
    if (isKioskAllowed(method, path)) return true;

    // Nima bloklangani yoziladi — ro'yxat kamchil bo'lsa logdan ko'rinadi
    // (jimgina 403 ning sababini topib bo'lmasdi).
    this.logger.warn(`Kiosk bloklandi: ${method} ${path} (xodim ${user.sub})`);
    throw new ForbiddenException('Bu bo`lim kassa rejimida mavjud emas');
  }

  /** Tokenni o'qiydi; buzuq bo'lsa `null` — 401 ni `JwtAuthGuard` beradi. */
  private async decode(header: string | string[] | undefined): Promise<AuthenticatedUser | null> {
    const raw = Array.isArray(header) ? header[0] : header;
    if (!raw?.startsWith('Bearer ')) return null;
    try {
      return await this.tokens.verifyAccessToken(raw.slice(7));
    } catch {
      return null;
    }
  }
}
