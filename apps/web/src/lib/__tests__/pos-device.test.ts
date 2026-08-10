import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearPosDevice, readPosDevice, writePosDevice } from '../pos-device';

const CREDS = { deviceId: 'dev-1', deviceSecret: 'x'.repeat(64), name: '1-kassa' };

beforeEach(() => {
  localStorage.clear();
  // biome-ignore lint/suspicious/noExplicitAny: test uchun ko'prikni olib tashlash
  (window as any).electronAPI = undefined;
});
afterEach(() => vi.restoreAllMocks());

describe('pos-device (brauzer varianti)', () => {
  it('yozilgan ma`lumot o`qiladi', () => {
    writePosDevice(CREDS);
    expect(readPosDevice()).toEqual(CREDS);
  });

  it('hech narsa yozilmagan bo`lsa null', () => {
    expect(readPosDevice()).toBeNull();
  });

  it('buzuq JSON — null, otilmaydi', () => {
    localStorage.setItem('sherset.pos-device', '{buzuq');
    expect(readPosDevice()).toBeNull();
  });

  it('to`liqmas yozuv — null (yarim juftlangan holat kirishga urinmasin)', () => {
    localStorage.setItem('sherset.pos-device', JSON.stringify({ deviceId: 'a' }));
    expect(readPosDevice()).toBeNull();
  });

  it('clear o`chiradi', () => {
    writePosDevice(CREDS);
    clearPosDevice();
    expect(readPosDevice()).toBeNull();
  });
});

describe('pos-device (Electron varianti)', () => {
  it('Electron ko`prigi bor bo`lsa O`SHANDAN o`qiydi, localStorage`dan emas', () => {
    localStorage.setItem('sherset.pos-device', JSON.stringify(CREDS));
    const fromShell = { deviceId: 'shell-dev', deviceSecret: 'y'.repeat(64), name: 'Shell kassa' };
    // biome-ignore lint/suspicious/noExplicitAny: test ko'prigi
    (window as any).electronAPI = { isSherset: true, getDevice: () => fromShell };
    expect(readPosDevice()).toEqual(fromShell);
  });

  it('Electron ko`prigi bor bo`lsa yozuv O`SHANGA ketadi, localStorage`ga emas', () => {
    const setDevice = vi.fn();
    // biome-ignore lint/suspicious/noExplicitAny: test ko'prigi
    (window as any).electronAPI = { isSherset: true, setDevice };
    writePosDevice(CREDS);
    expect(setDevice).toHaveBeenCalledWith(CREDS);
    expect(localStorage.getItem('sherset.pos-device')).toBeNull();
  });
});
