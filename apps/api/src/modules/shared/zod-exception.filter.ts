import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus } from '@nestjs/common';
import { ZodError } from 'zod';

interface FastifyReplyLike {
  status: (code: number) => { send: (body: unknown) => void };
}

/**
 * Global filter: a Zod `.parse()` failure is INVALID USER INPUT, not a
 * server fault. Without this, every `Schema.parse(body)` that throws
 * surfaced as HTTP 500 across the whole API (measured: /boms,
 * /processing-orders, /processing-processes, …). Map it to 400 with a
 * readable `path: message` list, matching Nest's BadRequest envelope
 * so clients see one consistent error shape.
 *
 * Services that already `safeParse → BadRequestException` are
 * unaffected (they throw an HttpException, not a ZodError).
 */
@Catch(ZodError)
export class ZodExceptionFilter implements ExceptionFilter {
  catch(exception: ZodError, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<FastifyReplyLike>();
    const message =
      exception.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ') ||
      'Validation failed';
    reply.status(HttpStatus.BAD_REQUEST).send({
      statusCode: HttpStatus.BAD_REQUEST,
      error: 'Bad Request',
      message,
    });
  }
}
