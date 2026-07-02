import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { type Observable, map } from 'rxjs';

/**
 * Global response interceptor — strips the `accountId` tenant field
 * from every JSON response before it leaves the server.
 *
 * Why:
 *   The tenant ID isn't business data — it's an internal pivot the
 *   server uses for row-level isolation (RLS). Leaking it to clients
 *   gives no value (the user already authenticates into one tenant
 *   via JWT) and unnecessarily exposes infrastructure-shaped data
 *   that could feed cross-tenant probing if any other guard ever
 *   regresses. Moysklad's own API doesn't return account_id either.
 *
 * Strategy:
 *   Walk the response object recursively and delete any key named
 *   `accountId`. Mutates in place to avoid copying large lists.
 *
 * Performance:
 *   O(N) on the size of the response, which is what JSON.stringify
 *   already does, so the overhead is one extra pass — negligible
 *   compared to network or DB time.
 */
@Injectable()
export class StripTenantInterceptor implements NestInterceptor {
  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map((data) => stripAccountId(data)));
  }
}

function stripAccountId(value: unknown): unknown {
  if (Array.isArray(value)) {
    for (const item of value) {
      stripAccountId(item);
    }
    return value;
  }
  if (value && typeof value === 'object') {
    // Plain object — strip the field and recurse into the rest.
    const obj = value as Record<string, unknown>;
    if ('accountId' in obj) {
      // biome-ignore lint/performance/noDelete: must remove the key entirely (not set undefined) so accountId never leaks into JSON responses
      delete obj.accountId;
    }
    for (const k of Object.keys(obj)) {
      stripAccountId(obj[k]);
    }
  }
  return value;
}
