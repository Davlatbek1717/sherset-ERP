import { randomBytes } from 'node:crypto';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { encryptHrSession } from '../hr-shared/crypto.util.js';
import type {
  TelegramClientFactory,
  TelegramClientHandle,
} from '../hr-telegram-bridge/telegram-client-factory.js';
import { HrTelegramLoginService } from './hr-telegram-login.service.js';

function makeClient(overrides: Partial<TelegramClientHandle> = {}): TelegramClientHandle {
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    isUserAuthorized: vi.fn().mockResolvedValue(true),
    getEntity: vi.fn(),
    sendMessage: vi.fn(),
    sendCode: vi.fn().mockResolvedValue({ phoneCodeHash: 'code-hash-123' }),
    signIn: vi.fn().mockResolvedValue(undefined),
    checkPassword: vi.fn().mockResolvedValue(undefined),
    saveSession: vi.fn().mockReturnValue('exported-session-string'),
    ...overrides,
  };
}

function makeFactory(client: TelegramClientHandle): TelegramClientFactory {
  return { createClient: vi.fn(() => client) };
}

function makeAccountsSvc(opts: { apiHashEncrypted: string }) {
  return {
    findInternal: vi.fn().mockResolvedValue({
      id: 'tg-1',
      accountId: 'acc1',
      slot: 1,
      phoneNumber: '+998901234567',
      apiId: 12345,
      apiHashEncrypted: opts.apiHashEncrypted,
      sessionEncrypted: null,
    }),
    persistSession: vi.fn().mockResolvedValue({ id: 'tg-1', isActive: true }),
  };
}

describe('HrTelegramLoginService', () => {
  let apiHashEncrypted: string;

  beforeAll(() => {
    if (!process.env.HR_SESSION_KEY) {
      process.env.HR_SESSION_KEY = randomBytes(32).toString('base64');
    }
    apiHashEncrypted = encryptHrSession('test-api-hash-1234567890');
  });

  describe('start()', () => {
    let client: TelegramClientHandle;
    let factory: TelegramClientFactory;
    let accounts: ReturnType<typeof makeAccountsSvc>;
    let svc: HrTelegramLoginService;

    beforeEach(() => {
      client = makeClient();
      factory = makeFactory(client);
      accounts = makeAccountsSvc({ apiHashEncrypted });
      // biome-ignore lint/suspicious/noExplicitAny: test wiring
      svc = new HrTelegramLoginService(factory, accounts as any);
    });

    it('connects + requests OTP + returns loginSessionId + codeSent=true', async () => {
      const result = await svc.start('acc1', 'tg-1');
      expect(client.connect).toHaveBeenCalled();
      expect(client.sendCode).toHaveBeenCalledWith({
        apiId: 12345,
        apiHash: 'test-api-hash-1234567890',
        phoneNumber: '+998901234567',
      });
      expect(result.codeSent).toBe(true);
      expect(result.loginSessionId).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('on FloodWaitError → BadRequest + client disconnected', async () => {
      const flood = Object.assign(new Error('FLOOD_WAIT_60'), {
        className: 'FloodWaitError',
        seconds: 60,
      });
      client.sendCode = vi.fn().mockRejectedValue(flood);
      await expect(svc.start('acc1', 'tg-1')).rejects.toThrow(/FLOOD_WAIT/);
      expect(client.disconnect).toHaveBeenCalled();
    });

    it('on apiHash decrypt failure → BadRequest before connecting', async () => {
      accounts.findInternal.mockResolvedValueOnce({
        id: 'tg-1',
        accountId: 'acc1',
        slot: 1,
        phoneNumber: '+998901234567',
        apiId: 12345,
        apiHashEncrypted: 'garbage:garbage:garbage',
        sessionEncrypted: null,
      });
      await expect(svc.start('acc1', 'tg-1')).rejects.toThrow(BadRequestException);
      expect(client.connect).not.toHaveBeenCalled();
    });
  });

  describe('submitCode()', () => {
    let client: TelegramClientHandle;
    let factory: TelegramClientFactory;
    let accounts: ReturnType<typeof makeAccountsSvc>;
    let svc: HrTelegramLoginService;
    let loginSessionId: string;

    beforeEach(async () => {
      client = makeClient();
      factory = makeFactory(client);
      accounts = makeAccountsSvc({ apiHashEncrypted });
      // biome-ignore lint/suspicious/noExplicitAny: test wiring
      svc = new HrTelegramLoginService(factory, accounts as any);
      const { loginSessionId: id } = await svc.start('acc1', 'tg-1');
      loginSessionId = id;
    });

    it('happy path: code submitted → session exported + persisted + ok=true', async () => {
      const result = await svc.submitCode({ loginSessionId, code: '12345' });

      expect(client.signIn).toHaveBeenCalledWith({
        phoneNumber: '+998901234567',
        phoneCodeHash: 'code-hash-123',
        phoneCode: '12345',
      });
      expect(client.saveSession).toHaveBeenCalled();
      expect(accounts.persistSession).toHaveBeenCalledWith(
        'acc1',
        'tg-1',
        'exported-session-string',
      );
      expect(result).toEqual({
        ok: true,
        awaitingPassword: false,
        accountId: 'acc1',
        hrTelegramAccountId: 'tg-1',
      });
    });

    it('2FA flow: SESSION_PASSWORD_NEEDED → ok=false + awaitingPassword=true', async () => {
      const pwNeeded = Object.assign(new Error('SESSION_PASSWORD_NEEDED'), {
        className: 'SessionPasswordNeededError',
      });
      client.signIn = vi.fn().mockRejectedValueOnce(pwNeeded);

      const result = await svc.submitCode({ loginSessionId, code: '12345' });

      expect(result).toEqual({ ok: false, awaitingPassword: true });
      expect(accounts.persistSession).not.toHaveBeenCalled();
    });

    it('2FA: next call with password → checkPassword + session persisted', async () => {
      const pwNeeded = Object.assign(new Error('SESSION_PASSWORD_NEEDED'), {
        className: 'SessionPasswordNeededError',
      });
      client.signIn = vi.fn().mockRejectedValueOnce(pwNeeded);

      await svc.submitCode({ loginSessionId, code: '12345' });
      const result = await svc.submitCode({
        loginSessionId,
        code: '12345',
        password: 'my-2fa-pass',
      });

      expect(client.checkPassword).toHaveBeenCalledWith('my-2fa-pass');
      expect(result.ok).toBe(true);
      expect(accounts.persistSession).toHaveBeenCalled();
    });

    it('2FA: first call provides password upfront → still works in one round', async () => {
      const pwNeeded = Object.assign(new Error('SESSION_PASSWORD_NEEDED'), {
        className: 'SessionPasswordNeededError',
      });
      client.signIn = vi.fn().mockRejectedValueOnce(pwNeeded);

      const result = await svc.submitCode({
        loginSessionId,
        code: '12345',
        password: 'my-2fa-pass',
      });

      expect(client.checkPassword).toHaveBeenCalledWith('my-2fa-pass');
      expect(result.ok).toBe(true);
    });

    it('awaitingPassword state without password → BadRequest', async () => {
      const pwNeeded = Object.assign(new Error('SESSION_PASSWORD_NEEDED'), {
        className: 'SessionPasswordNeededError',
      });
      client.signIn = vi.fn().mockRejectedValueOnce(pwNeeded);

      await svc.submitCode({ loginSessionId, code: '12345' }); // sets awaitingPassword=true
      await expect(
        svc.submitCode({ loginSessionId, code: '12345' }), // missing password
      ).rejects.toThrow(/2FA paroli/);
    });

    it('unknown loginSessionId → Unauthorized', async () => {
      await expect(
        svc.submitCode({ loginSessionId: 'not-a-real-session', code: '12345' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('cancel(): discards session + disconnects client', async () => {
      await svc.cancel(loginSessionId);
      expect(client.disconnect).toHaveBeenCalled();
      // Subsequent submit attempts must fail
      await expect(svc.submitCode({ loginSessionId, code: '12345' })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('FloodWaitError on signIn → BadRequest with retry hint', async () => {
      const flood = Object.assign(new Error('FLOOD_WAIT_30'), {
        className: 'FloodWaitError',
        seconds: 30,
      });
      client.signIn = vi.fn().mockRejectedValueOnce(flood);

      await expect(svc.submitCode({ loginSessionId, code: '12345' })).rejects.toThrow(/FLOOD_WAIT/);
    });
  });
});
