import { afterEach, describe, expect, it, vi } from 'vitest';
import { phoneGatewaySend, toE164 } from './phone-gateway.client.js';

describe('toE164', () => {
  it('UZ raqamni +998 formatiga keltiradi', () => {
    expect(toE164('+998901234567')).toBe('+998901234567');
    expect(toE164('998901234567')).toBe('+998901234567');
    expect(toE164('901234567')).toBe('+998901234567');
  });
});

describe('phoneGatewaySend', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sms-gate.app formatida POST qiladi (textMessage.text + phoneNumbers)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 202,
      json: async () => ({ id: 'msg-1', state: 'Pending' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const r = await phoneGatewaySend(
      { username: 'user', password: 'pass' },
      { phone: '+998901112233', text: 'Salom' },
    );

    expect(r.id).toBe('msg-1');
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.sms-gate.app/3rdparty/v1/messages');
    expect(opts.method).toBe('POST');
    expect(opts.headers.Authorization).toBe(`Basic ${Buffer.from('user:pass').toString('base64')}`);
    const body = JSON.parse(opts.body);
    expect(body.textMessage.text).toBe('Salom');
    expect(body.phoneNumbers).toEqual(['+998901112233']);
  });

  it('xato javobда throw qiladi', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({ message: 'bad' }) }),
    );
    await expect(
      phoneGatewaySend({ username: 'u', password: 'x' }, { phone: '+998901112233', text: 'hi' }),
    ).rejects.toThrow();
  });

  it("o'z-hosting baseUrl'ni ishlatadi", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 202,
      json: async () => ({ id: 'x' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    await phoneGatewaySend(
      { username: 'u', password: 'p', baseUrl: 'http://192.168.1.5:8080/v1/' },
      { phone: '998901112233', text: 't' },
    );
    expect(fetchMock.mock.calls[0][0]).toBe('http://192.168.1.5:8080/v1/messages');
  });
});
