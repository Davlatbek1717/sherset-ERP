import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, type JwtSignOptions } from '@nestjs/jwt';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { resolveSecret } from './boot-secrets.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { KioskGuard } from './kiosk.guard.js';
import { PosPinService } from './pos-pin.service.js';
import { TokenService } from './token.service.js';

/**
 * `JWT_ACCESS_TTL` comes from the environment, so it is a plain `string` at
 * compile time — but @nestjs/jwt v11 narrowed `signOptions.expiresIn` to
 * `number | ms.StringValue` (a template-literal union like `'15m'` / `'2 days'`).
 * A bare cast would silence the checker AND let a typo through: `jsonwebtoken`
 * treats an unparseable TTL as… nothing useful, and the mistake would only
 * surface as tokens with a wrong lifetime — a security-relevant, silent failure.
 *
 * So: validate the ms-format at boot and fail loudly instead.
 * (MASTER-TODO #117c — surfaced by the Nest 10→11 upgrade.)
 */
const MS_FORMAT =
  /^\d+(\.\d+)?\s*(ms|s|m|h|d|w|y|sec|secs|second|seconds|min|mins|minute|minutes|hr|hrs|hour|hours|day|days|week|weeks|year|years)?$/i;

function parseTtl(raw: string | undefined, fallback: string, varName: string) {
  const value = raw ?? fallback;
  if (!MS_FORMAT.test(value.trim())) {
    throw new Error(
      `${varName}="${value}" is not a valid duration (expected e.g. "15m", "7d", "3600"). ` +
        'Refusing to boot with an unparseable token lifetime.',
    );
  }
  return value.trim() as NonNullable<JwtSignOptions['expiresIn']>;
}

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (cs: ConfigService) => ({
        // AUTH-02: prod'da sir majburiy — jim dev-fallback = auth-bypass.
        secret: resolveSecret({
          name: 'JWT_SECRET',
          value: cs.get<string>('JWT_SECRET'),
          devFallback: 'dev-secret-change-in-prod',
          nodeEnv: process.env.NODE_ENV,
        }),
        signOptions: {
          expiresIn: parseTtl(cs.get<string>('JWT_ACCESS_TTL'), '15m', 'JWT_ACCESS_TTL'),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, TokenService, JwtAuthGuard, PosPinService, KioskGuard],
  exports: [AuthService, TokenService, JwtAuthGuard, KioskGuard],
})
export class AuthModule {}
