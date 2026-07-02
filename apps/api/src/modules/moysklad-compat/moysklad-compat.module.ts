import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { ApiTokenController } from './api-token.controller.js';
import { ApiTokenGuard } from './api-token.guard.js';
import { ApiTokenService } from './api-token.service.js';
import { MoyskladCompatController } from './moysklad-compat.controller.js';
import { MoyskladCompatService } from './moysklad-compat.service.js';

/**
 * Houses three things:
 *   1. ApiToken CRUD admin (`/admin/api-tokens`) — issue + revoke
 *   2. ApiTokenGuard — Bearer-token auth used by the compat router
 *   3. /api/remap/1.2/* — moysklad-compatible read API
 *
 * Imports AuthModule so we share TokenService for fallback JWT verification.
 */
@Module({
  imports: [AuthModule],
  controllers: [MoyskladCompatController, ApiTokenController],
  providers: [PrismaService, ApiTokenService, ApiTokenGuard, MoyskladCompatService],
})
export class MoyskladCompatModule {}
