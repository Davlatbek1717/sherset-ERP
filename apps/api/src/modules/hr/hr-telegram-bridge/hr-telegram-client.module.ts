import { Module } from '@nestjs/common';
import { GramjsTelegramClientFactory } from './gramjs-client.factory.js';
import { TELEGRAM_CLIENT_FACTORY, type TelegramClientFactory } from './telegram-client-factory.js';

/**
 * Provides the `TELEGRAM_CLIENT_FACTORY` DI token. Lifted into its own
 * module so both the bridge (adapter) and the account module (login wizard)
 * can consume the same binding without forming a cycle.
 *
 * Switching:
 *   • Production         → GramjsTelegramClientFactory (real `telegram` import)
 *   • HR_TELEGRAM_DISABLED env set  → throws on use; caller must avoid binding
 *     a Gramjs adapter (the bridge module already does this — it binds Noop
 *     instead). The factory itself stays Gramjs because the login wizard
 *     still needs the real client to perform OTP.
 *
 * Tests override this token in the test module — see *.spec wiring.
 */
@Module({
  providers: [
    {
      provide: TELEGRAM_CLIENT_FACTORY,
      useClass: GramjsTelegramClientFactory,
    } satisfies { provide: symbol; useClass: new (...args: never[]) => TelegramClientFactory },
  ],
  exports: [TELEGRAM_CLIENT_FACTORY],
})
export class HrTelegramClientModule {}
