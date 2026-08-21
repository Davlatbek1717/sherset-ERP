import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PermissionsService } from './permissions.service.js';
import { PERMISSION_ENTITIES } from './permissions.types.js';
import type { PermissionAction, PermissionEntity, PermissionScope } from './permissions.types.js';

// The web app gates its top-nav MODULES on this matrix (settings → Сотрудники
// «Настроить права»): a module hides when every mapped entity's view scope is
// NO. So the exported universe must cover every module's document types, not
// just the original 7 master-data entities. resolveScope() reads the cached
// per-employee permission map (5-min TTL) — widening this list is in-memory
// work per request, not extra queries.
/**
 * `GET /permissions/me` qaytaradigan entity ro'yxati = **kanonik**
 * `PERMISSION_ENTITIES`.
 *
 * 🔴 Ilgari bu yerda QO'LDA yozilgan alohida ro'yxat turardi va u kanonikdan
 * ajralib ketgan edi: 95 entity o'rniga 52 tasi qaytardi — `contract`,
 * `pipeline`, `mxik`, `pricetype`, `debt*`, `currency`, `variant`,
 * `saleschannel` va yana 35 tasi umuman yo'q edi. Hech narsa «buzilmagani»
 * uchun 43 entity'lik ko'r nuqta jimgina yashab keldi: FE
 * (`use-permissions.ts`) noma'lum entity'ni fail-open deb hisoblaydi, ya'ni
 * cheklangan xodim ko'ra olmaydigan bo'limni menyuda ko'rib turadi va faqat
 * bosganda 403 oladi.
 *
 * Ikkinchi nusxa saqlamaymiz — drift shundan tug'ilgan edi. Qamrovni
 * `permissions.controller.test.ts` qulflaydi.
 */
const ENTITIES: readonly PermissionEntity[] = PERMISSION_ENTITIES;
const ACTIONS: PermissionAction[] = ['view', 'create', 'update', 'delete', 'approve', 'print'];

@Controller('permissions')
@UseGuards(JwtAuthGuard)
export class PermissionsController {
  constructor(@Inject(PermissionsService) private readonly permissions: PermissionsService) {}

  /** Returns full permission map for the current user — used by Web to gate UI. */
  @Get('me')
  async getMine(@CurrentUser() user: AuthenticatedUser) {
    const matrix: Record<string, Record<string, PermissionScope>> = {};
    for (const entity of ENTITIES) {
      matrix[entity] = {};
      for (const action of ACTIONS) {
        matrix[entity][action] = await this.permissions.resolveScope(user.sub, entity, action);
      }
    }
    return { matrix };
  }
}
