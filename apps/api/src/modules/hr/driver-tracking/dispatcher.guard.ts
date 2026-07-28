import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/auth.schema.js';

/**
 * Dispecher endpoint'lari uchun yengil rol-gate (review #5/#6/#9). JWT'даги
 * `hrRoles` da'vosini o'qiydi — permissions DB/service'ga BOG'LANMAYDI (u hozir
 * parallel sessiya tomonidan refactor qilinmoqda). Field-haydovchi bu endpoint'ларга
 * kira olmasligi kerak (koworker joyini kuzatmaslik uchun).
 *
 * TODO(rol): permissions barqarorlashgach — `@RequireHrPermission('driver-tracking',...)`
 * ga o'tkazilib, DISPATCHER_ROLES kengaytiriladi (masalan 'menejer'/'dispecher').
 */
const DISPATCHER_ROLES: readonly string[] = ['admin'];

@Injectable()
export class DispatcherGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const roles = req.user?.hrRoles ?? [];
    if (roles.some((r) => DISPATCHER_ROLES.includes(r))) return true;
    throw new ForbiddenException('Dispecher huquqi kerak (HR admin)');
  }
}
