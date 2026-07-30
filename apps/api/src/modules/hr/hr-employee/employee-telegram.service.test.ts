import { describe, expect, it } from 'vitest';
import { EmployeeTelegramService, parseBindToken } from './employee-telegram.service.js';

describe('parseBindToken (pure)', () => {
  it('/start bind_<token> dan tokenni ajratadi', () => {
    expect(parseBindToken('/start bind_abc123')).toBe('abc123');
  });
  it('bind_ prefiksisiz /start → null', () => {
    expect(parseBindToken('/start')).toBeNull();
    expect(parseBindToken('salom')).toBeNull();
    expect(parseBindToken('/start boshqa')).toBeNull();
  });
  it("bo'sh token yoki null/undefined → null", () => {
    expect(parseBindToken('/start bind_')).toBeNull();
    expect(parseBindToken('/start bind_   ')).toBeNull();
    expect(parseBindToken(null)).toBeNull();
    expect(parseBindToken(undefined)).toBeNull();
  });
});

describe('EmployeeTelegramService.bindByToken', () => {
  it('muddat ichidagi token → chatId saqlanadi, token isteʼmol qilinadi', async () => {
    const updates: Array<{ where: unknown; data: Record<string, unknown> }> = [];
    const svc = new EmployeeTelegramService({
      client: {
        employee: {
          findFirst: async () => ({ id: 'e1', name: 'Ali Valiyev' }),
          update: async (args: { where: unknown; data: Record<string, unknown> }) => {
            updates.push(args);
            return {};
          },
        },
      },
    } as never);

    const r = await svc.bindByToken('12345', 'tok');
    expect(r).toEqual({ employeeId: 'e1', name: 'Ali Valiyev' });
    // chat_id saqlandi + token null bo'ldi (qayta ishlatib bo'lmaydi)
    expect(updates).toHaveLength(1);
    expect(updates[0].data).toMatchObject({
      telegramChatId: '12345',
      telegramBindToken: null,
      telegramBindTokenExpiresAt: null,
    });
  });

  it('token topilmasa / muddati o‘tgan → null, hech narsa yozilmaydi', async () => {
    let updateCalled = false;
    const svc = new EmployeeTelegramService({
      client: {
        employee: {
          findFirst: async () => null,
          update: async () => {
            updateCalled = true;
            return {};
          },
        },
      },
    } as never);

    expect(await svc.bindByToken('1', 'x')).toBeNull();
    expect(updateCalled).toBe(false);
  });
});
