import type { ArgumentsHost } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  BAD_REFERENCE_MESSAGE,
  DUPLICATE_VALUE_MESSAGE,
  IN_USE_MESSAGE,
  NOT_FOUND_MESSAGE,
  PrismaExceptionFilter,
} from './prisma-exception.filter.js';

/**
 * Build a Prisma-shaped known-request error the way the live client emits it —
 * the filter only ever reads `.code` and `.message`, so a plain tagged object
 * (mirrors employee-unique.test.ts) is a faithful stand-in without booting the
 * Prisma runtime.
 */
function prismaError(code: string, message = 'db boom') {
  return Object.assign(new Error(message), {
    name: 'PrismaClientKnownRequestError',
    code,
  }) as unknown as import('@moysklad/db').Prisma.PrismaClientKnownRequestError;
}

/** Minimal Fastify-reply + ArgumentsHost double that records the response. */
function makeHost(method: string) {
  const sent: { status?: number; body?: Record<string, unknown> } = {};
  const reply = {
    status(code: number) {
      sent.status = code;
      return {
        send(body: unknown) {
          sent.body = body as Record<string, unknown>;
        },
      };
    },
  };
  const host = {
    switchToHttp: () => ({
      getResponse: () => reply,
      getRequest: () => ({ method }),
    }),
  } as unknown as ArgumentsHost;
  return { host, sent };
}

describe('PrismaExceptionFilter', () => {
  const filter = new PrismaExceptionFilter();

  describe('P2003 / P2014 — foreign-key / required-relation violation', () => {
    it('maps a P2003 on DELETE to 409 Conflict "in use" (was raw 500)', () => {
      const { host, sent } = makeHost('DELETE');
      filter.catch(prismaError('P2003'), host);
      expect(sent.status).toBe(409);
      expect(sent.body).toEqual({
        statusCode: 409,
        error: 'Conflict',
        message: IN_USE_MESSAGE,
      });
    });

    it('maps a P2014 on DELETE to 409 Conflict "in use"', () => {
      const { host, sent } = makeHost('DELETE');
      filter.catch(prismaError('P2014'), host);
      expect(sent.status).toBe(409);
      expect(sent.body?.message).toBe(IN_USE_MESSAGE);
    });

    it('maps a P2003 on POST (create with a non-existent reference) to 400 Bad Request', () => {
      const { host, sent } = makeHost('POST');
      filter.catch(prismaError('P2003'), host);
      expect(sent.status).toBe(400);
      expect(sent.body).toEqual({
        statusCode: 400,
        error: 'Bad Request',
        message: BAD_REFERENCE_MESSAGE,
      });
    });

    it('maps a P2003 on PATCH (update with a non-existent reference) to 400 Bad Request', () => {
      const { host, sent } = makeHost('PATCH');
      filter.catch(prismaError('P2003'), host);
      expect(sent.status).toBe(400);
      expect(sent.body?.message).toBe(BAD_REFERENCE_MESSAGE);
    });

    it('treats the HTTP method case-insensitively (lowercase "delete" still → 409)', () => {
      const { host, sent } = makeHost('delete');
      filter.catch(prismaError('P2003'), host);
      expect(sent.status).toBe(409);
    });
  });

  describe('P2002 — unique-constraint violation (was raw 500)', () => {
    // A unique violation is definitionally a conflict (RFC 7231 §6.5.8), so it
    // maps to 409 regardless of HTTP verb: it can surface on POST (create) or
    // PATCH/PUT (update touching a unique field). Reference creates WITHOUT a
    // pre-check (pipeline, price-list, document-state) used to 500 on a duplicate
    // name; a pre-checked create (store) used to 500 only under a TOCTOU race.
    it('maps a P2002 on POST (duplicate create) to 409 Conflict (was raw 500)', () => {
      const { host, sent } = makeHost('POST');
      filter.catch(prismaError('P2002'), host);
      expect(sent.status).toBe(409);
      expect(sent.body).toEqual({
        statusCode: 409,
        error: 'Conflict',
        message: DUPLICATE_VALUE_MESSAGE,
      });
    });

    it('maps a P2002 on PATCH (update onto a taken unique value) to 409', () => {
      const { host, sent } = makeHost('PATCH');
      filter.catch(prismaError('P2002'), host);
      expect(sent.status).toBe(409);
      expect(sent.body?.message).toBe(DUPLICATE_VALUE_MESSAGE);
    });

    it('maps a P2002 method-independently (even an unusual verb → 409)', () => {
      const { host, sent } = makeHost('PUT');
      filter.catch(prismaError('P2002'), host);
      expect(sent.status).toBe(409);
    });
  });

  describe('P2025 — record not found (was raw 500)', () => {
    // Every direct delete/update pre-checks existence (findById → 404), so the
    // escaping P2025 is the TOCTOU race: a concurrent delete removed the row
    // after this request's pre-check passed. The optimistic-lock handlers catch
    // a version-conflict P2025 in-service (→ 409 OPTIMISTIC_LOCK), an
    // HttpException that never reaches this filter — so only a genuinely-gone
    // target lands here, which is a 404.
    it('maps a P2025 on DELETE to 404 Not Found (was raw 500)', () => {
      const { host, sent } = makeHost('DELETE');
      filter.catch(prismaError('P2025'), host);
      expect(sent.status).toBe(404);
      expect(sent.body).toEqual({
        statusCode: 404,
        error: 'Not Found',
        message: NOT_FOUND_MESSAGE,
      });
    });

    it('maps a P2025 on PATCH (target row gone) to 404 Not Found', () => {
      const { host, sent } = makeHost('PATCH');
      filter.catch(prismaError('P2025'), host);
      expect(sent.status).toBe(404);
      expect(sent.body?.message).toBe(NOT_FOUND_MESSAGE);
    });

    it('maps a P2025 on PUT to 404 Not Found', () => {
      const { host, sent } = makeHost('PUT');
      filter.catch(prismaError('P2025'), host);
      expect(sent.status).toBe(404);
    });

    it('maps a P2025 on POST (create with a non-existent nested connect) to 400 Bad Request', () => {
      const { host, sent } = makeHost('POST');
      filter.catch(prismaError('P2025'), host);
      expect(sent.status).toBe(400);
      expect(sent.body?.message).toBe(BAD_REFERENCE_MESSAGE);
    });
  });

  describe('unmapped codes — preserved as 500, never swallowed', () => {
    it('leaves an unknown Prisma code (P2011 null-constraint) as 500', () => {
      const { host, sent } = makeHost('GET');
      filter.catch(prismaError('P2011'), host);
      expect(sent.status).toBe(500);
      expect(sent.body?.error).toBe('Internal Server Error');
    });

    it('leaves P2000 (value too long) as 500', () => {
      const { host, sent } = makeHost('POST');
      filter.catch(prismaError('P2000'), host);
      expect(sent.status).toBe(500);
    });
  });
});
