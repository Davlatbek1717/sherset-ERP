import { Controller, Get, Inject, Param, Query, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
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
 * Reads: list / detail / metadata / positions sub-collection, with
 * moysklad-style filter=, order=, search=, expand= (incl.
 * expand=positions.assortment). Writes (POST/PUT/DELETE) are deferred to a
 * follow-up — those need Zod validation per slug + business-rule re-routing
 * to entity services.
 */
@Controller('api/remap/1.2')
@UseGuards(ApiTokenGuard)
export class MoyskladCompatController {
  constructor(@Inject(MoyskladCompatService) private readonly svc: MoyskladCompatService) {}

  @Get('entity/:slug/metadata')
  metadata(@Param('slug') slug: string, @Req() req: FastifyRequest) {
    return this.svc.metadata(slug, remapBaseOf(req));
  }

  @Get('entity/:slug')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('slug') slug: string,
    @Query() query: Record<string, string>,
    @Req() req: FastifyRequest,
  ) {
    return this.svc.list(
      user.accountId,
      user.sub,
      slug,
      {
        limit: Number(query.limit ?? 1000),
        offset: Number(query.offset ?? 0),
        expand: query.expand?.split(',').filter(Boolean),
        filter: query.filter,
        order: query.order,
        search: query.search,
      },
      remapBaseOf(req),
    );
  }

  @Get('entity/:slug/:id')
  getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Query() query: Record<string, string>,
    @Req() req: FastifyRequest,
  ) {
    return this.svc.getById(
      user.accountId,
      slug,
      id,
      remapBaseOf(req),
      query.expand?.split(',').filter(Boolean),
    );
  }

  /** moysklad positions sub-collection (supports ?expand=assortment). */
  @Get('entity/:slug/:id/positions')
  positions(
    @CurrentUser() user: AuthenticatedUser,
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Query() query: Record<string, string>,
    @Req() req: FastifyRequest,
  ) {
    return this.svc.positionsList(
      user.accountId,
      slug,
      id,
      {
        limit: Number(query.limit ?? 1000),
        offset: Number(query.offset ?? 0),
        expand: query.expand?.split(',').filter(Boolean),
      },
      remapBaseOf(req),
    );
  }

  /** Discovery — what slugs we currently support. Non-moysklad endpoint
   *  but useful for clients to probe coverage. */
  @Get('_compat/slugs')
  slugs() {
    return { slugs: this.svc.supportedSlugs() };
  }
}

/**
 * Href base derived from the caller's own request so meta.href always
 * matches the URL the client reached us on (env-based hrefs went stale —
 * pm2 keeps an env snapshot; see Biznesjon audit item H: missing /v1).
 * Nginx forwards proto via x-forwarded-proto; Host survives proxying.
 */
function remapBaseOf(req: FastifyRequest): string {
  const proto = (req.headers['x-forwarded-proto'] as string | undefined) ?? req.protocol ?? 'http';
  const host = (req.headers['x-forwarded-host'] as string | undefined) ?? req.headers.host;
  if (!host) return `${process.env.API_BASE_URL ?? 'http://localhost:4000'}/api/remap/1.2`;
  return `${proto.split(',')[0]}://${host.split(',')[0]}/api/v1/api/remap/1.2`;
}
