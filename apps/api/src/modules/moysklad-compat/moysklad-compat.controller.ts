import { Controller, Get, Inject, Param, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { ApiTokenGuard } from './api-token.guard.js';
import { MoyskladCompatService } from './moysklad-compat.service.js';

/**
 * `/api/remap/1.2/*` — drop-in moysklad API compatibility router.
 * Lets external integrations (1C, Telegram bots, custom scripts written
 * for moysklad) talk to our system using the same URL patterns + Bearer
 * token auth + JSON shapes.
 *
 * Coverage so far: list / detail / metadata for the 8 most-used slugs.
 * Writes (POST/PUT/DELETE) are deferred to a follow-up — those need
 * Zod validation per slug + business-rule re-routing to entity services.
 */
@Controller('api/remap/1.2')
@UseGuards(ApiTokenGuard)
export class MoyskladCompatController {
  constructor(@Inject(MoyskladCompatService) private readonly svc: MoyskladCompatService) {}

  @Get('entity/:slug/metadata')
  metadata(@Param('slug') slug: string) {
    return this.svc.metadata(slug);
  }

  @Get('entity/:slug')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('slug') slug: string,
    @Query() query: Record<string, string>,
  ) {
    return this.svc.list(user.accountId, user.sub, slug, {
      limit: Number(query.limit ?? 1000),
      offset: Number(query.offset ?? 0),
      expand: query.expand?.split(',').filter(Boolean),
      filter: query.filter,
      order: query.order,
      search: query.search,
    });
  }

  @Get('entity/:slug/:id')
  getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('slug') slug: string,
    @Param('id') id: string,
  ) {
    return this.svc.getById(user.accountId, slug, id);
  }

  /** Discovery — what slugs we currently support. Non-moysklad endpoint
   *  but useful for clients to probe coverage. */
  @Get('_compat/slugs')
  slugs() {
    return { slugs: this.svc.supportedSlugs() };
  }
}
