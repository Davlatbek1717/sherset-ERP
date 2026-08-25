import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { AuthenticatedUser } from './auth.schema.js';
import { normalizePath } from './route-allowlist.js';
import { TokenService } from './token.service.js';
import { DEVICE_MODE_TSD, isTsdAllowed } from './tsd-policy.js';

/**
 * TSD cheklovi — SERVER tomonda (G-reja G5).
 *
 * `KioskGuard` bilan bir xil naqsh va bir xil sabab: terminaldagi token
 * haqiqiy, ya'ni faqat ilovada tugmani ko'rsatmaslik hech narsani himoya
 * qilmaydi — `curl` bilan istalgan endpoint ochiq bo'lardi. Qoidalar
 * `tsd-policy.ts` da (sof modul), bu guard faqat qarorni bajaradi.
 *
 * **Ikkala guard MUSTAQIL ishlaydi va ikkalasi ham qo'llaniladi.** Agar
 * omborchining roli kiosk bo'lsa (amalda bo'lmasligi kerak), so'rov IKKALA
 * ro'yxatdan ham o'tishi shart — bu ataylab: ikkita cheklovning kesishmasi
 * har doim ikkalasidan tor, ya'ni fail-closed.
 *
 * ⚠️ NEGA TOKENNI O'ZI O'QIYDI: `KioskGuard` dagi bilan aynan bir sabab —
 * global guardlar controller-darajasidagi `JwtAuthGuard` dan OLDIN ishlaydi,
 * ya'ni `req.user` hali to'ldirilmagan bo'ladi.
 *
 * **Autentifikatsiya bu guardning ishi EMAS:** token yo'q/buzuq bo'lsa jim
 * o'tkazib yuboradi va `JwtAuthGuard` o'z 401'ini qaytaradi.
 */
@Injectable()
export class TsdGuard implements CanActivate {
  private readonly logger = new Logger(TsdGuard.name);

  constructor(@Inject(TokenService) private readonly tokens: TokenService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== 'http') return true;

    const req = ctx.switchToHttp().getRequest<{
      user?: AuthenticatedUser;
      method?: string;
      url?: string;
      headers?: Record<string, string | string[] | undefined>;
      raw?: { url?: string };
    }>();

    const user = req.user ?? (await this.decode(req.headers?.authorization));
    if (!user || user.deviceMode !== DEVICE_MODE_TSD) return true;

    const method = req.method ?? 'GET';
    const path = normalizePath(req.url ?? req.raw?.url ?? '/');
    if (isTsdAllowed(method, path)) return true;

    // Nima bloklangani yoziladi — ro'yxat kamchil bo'lsa logdan ko'rinadi.
    this.logger.warn(`TSD bloklandi: ${method} ${path} (xodim ${user.sub})`);
    throw new ForbiddenException('Bu bo`lim terminalda mavjud emas');
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
