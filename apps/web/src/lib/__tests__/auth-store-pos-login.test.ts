import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAccessToken, posLogin } from '../auth-store';

const CREDS = { deviceId: 'dev-1', deviceSecret: 'x'.repeat(64), name: '1-kassa' };

afterEach(() => vi.restoreAllMocks());

describe('posLogin', () => {
  it('to`g`ri PIN → token saqlanadi va user qaytadi', async () => {
    const user = { id: 'emp-1', name: 'Kassir', uiMode: 'kiosk' };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ accessToken: 'jwt-1', user, device: CREDS }),
      }),
    );
    const out = await posLogin(CREDS, '4321');
    expect(out).toEqual(user);
    expect(getAccessToken()).toBe('jwt-1');
  });

  it('so`rov tanasida qurilma kaliti VA pin ketadi', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ accessToken: 'jwt-1', user: {}, device: CREDS }),
    });
    vi.stubGlobal('fetch', fetchMock);
    await posLogin(CREDS, '4321');
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({ deviceId: 'dev-1', deviceSecret: 'x'.repeat(64), pin: '4321' });
    // Cookie'lar kerak: refresh/media shu orqali o'rnatiladi.
    expect(init.credentials).toBe('include');
    // Qurilma NOMI serverga yuborilmaydi — sxema (PosLoginSchema) uni kutmaydi.
    expect(body.name).toBeUndefined();
  });

  it('401 → server xabari bilan xato otiladi', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ message: 'PIN noto`g`ri' }),
      }),
    );
    await expect(posLogin(CREDS, '0000')).rejects.toThrow(/PIN/);
  });

  it('423 (qurilma qulflangan) → xabar uzatiladi', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 423,
        json: async () => ({ message: 'Qurilma vaqtincha qulflangan (14 daqiqa qoldi)' }),
      }),
    );
    await expect(posLogin(CREDS, '0000')).rejects.toThrow(/qulflangan/);
  });

  it('xato javob tanasi buzuq bo`lsa HTTP kodi bilan xato otiladi', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error('not json');
        },
      }),
    );
    await expect(posLogin(CREDS, '0000')).rejects.toThrow(/500/);
  });
});
