import { BadRequestException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  _resetKeyCache,
  decryptBuffer,
  encryptPassword,
  isEncryptedBuffer,
} from '../email/crypto.js';
import { EdoService } from './edo.service.js';

/**
 * Faza 24 (`INT-06`).
 *
 * Bug: `setPfx` da komment «encrypted at rest» deb turgan holda
 * `data: { pfxCipher: pfxBytes }` — ECP xususiy kaliti DB'ga OCHIQ yozilardi
 * (maydon nomi 'Cipher' bo'lsa ham). Paroli esa yonida shifrlangan turardi.
 * DB dump = soliq hujjatlarini yuridik imzolash imkoni.
 *
 * Shartnoma:
 *   1. yozishda AES-GCM (sarlavhali) — DB'da ochiq bayt qolmaydi;
 *   2. o'qishda deshifr — round-trip aynan;
 *   3. eski (shifrlanmagan) qatorlar o'qilaveradi — migratsiya buzmaydi.
 */

const ACCOUNT_ID = '00000000-0000-0000-0000-0000000000a1';
// DER SEQUENCE bilan boshlanadigan realistik PFX-o'xshash blob.
const PFX = Buffer.concat([
  Buffer.from([0x30, 0x82, 0x0a, 0x1b]),
  Buffer.from('PRIVATE-KEY-MATERIAL'),
]);

function makeService(cfg: Record<string, unknown> | null) {
  const update = vi.fn(async (args: { data: Record<string, unknown> }) => ({
    ...(cfg ?? {}),
    ...args.data,
  }));
  const prisma = {
    client: {
      edoConfig: {
        findUnique: vi.fn(async () => cfg),
        update,
      },
    },
  };
  return { svc: new EdoService(prisma as never), update };
}

function baseConfig(over: Record<string, unknown> = {}) {
  return {
    id: 'cfg-1',
    accountId: ACCOUNT_ID,
    provider: 'didox',
    stir: '300123456',
    orgNameCyrl: 'Test MChJ',
    apiBaseUrl: 'https://didox.uz/api',
    apiTokenCipher: null,
    pfxCipher: null,
    pfxPassCipher: null,
    testMode: true,
    enabled: true,
    lastTestedAt: null,
    lastTestOk: null,
    lastTestMsg: null,
    ...over,
  };
}

describe('EdoService.setPfx — PFX at rest', () => {
  const originalKey = process.env.EMAIL_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.EMAIL_ENCRYPTION_KEY = 'test-key-deterministic';
    _resetKeyCache();
  });

  afterEach(() => {
    if (originalKey === undefined) {
      // biome-ignore lint/performance/noDelete: must REMOVE the env var, not blank it
      delete process.env.EMAIL_ENCRYPTION_KEY;
    } else {
      process.env.EMAIL_ENCRYPTION_KEY = originalKey;
    }
    _resetKeyCache();
  });

  it('DB ga shifrlangan yozadi — ochiq bayt qolmaydi', async () => {
    const { svc, update } = makeService(baseConfig());
    await svc.setPfx(ACCOUNT_ID, PFX, 'pfx-pass');

    const written = update.mock.calls[0]?.[0].data.pfxCipher as Buffer;
    expect(Buffer.isBuffer(written)).toBe(true);
    expect(written.equals(PFX)).toBe(false);
    expect(written.includes(Buffer.from('PRIVATE-KEY-MATERIAL'))).toBe(false);
    expect(isEncryptedBuffer(written)).toBe(true);
    expect(decryptBuffer(written).equals(PFX)).toBe(true);
  });

  it('bayt sonini HAQIQIY (shifrlanmagan) uzunlik bilan qaytaradi', async () => {
    const { svc } = makeService(baseConfig());
    await expect(svc.setPfx(ACCOUNT_ID, PFX, 'pfx-pass')).resolves.toEqual({
      ok: true,
      bytes: PFX.length,
    });
  });
});

describe('EdoService.loadSignerMaterial — o`qish yo`li', () => {
  const originalKey = process.env.EMAIL_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.EMAIL_ENCRYPTION_KEY = 'test-key-deterministic';
    _resetKeyCache();
  });

  afterEach(() => {
    if (originalKey === undefined) {
      // biome-ignore lint/performance/noDelete: must REMOVE the env var, not blank it
      delete process.env.EMAIL_ENCRYPTION_KEY;
    } else {
      process.env.EMAIL_ENCRYPTION_KEY = originalKey;
    }
    _resetKeyCache();
  });

  it('round-trip: yozilgan PFX aynan qaytadi', async () => {
    const writer = makeService(baseConfig());
    await writer.svc.setPfx(ACCOUNT_ID, PFX, 'pfx-pass');
    const stored = writer.update.mock.calls[0]?.[0].data as {
      pfxCipher: Buffer;
      pfxPassCipher: string;
    };

    const { svc } = makeService(baseConfig(stored));
    const material = await svc.loadSignerMaterial(ACCOUNT_ID);
    expect(material.pfx.equals(PFX)).toBe(true);
    expect(material.pass).toBe('pfx-pass');
  });

  it('eski SHIFRLANMAGAN qator o`qilaveradi (migratsiya buzilmaydi)', async () => {
    const { svc } = makeService(
      baseConfig({ pfxCipher: PFX, pfxPassCipher: encryptPassword('legacy-pass') }),
    );
    const material = await svc.loadSignerMaterial(ACCOUNT_ID);
    expect(material.pfx.equals(PFX)).toBe(true);
    expect(material.legacyPlaintext).toBe(true);
  });

  it('PFX yuklanmagan bo`lsa aniq xato', async () => {
    const { svc } = makeService(baseConfig());
    await expect(svc.loadSignerMaterial(ACCOUNT_ID)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('EdoService.sign — regress', () => {
  const originalKey = process.env.EMAIL_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.EMAIL_ENCRYPTION_KEY = 'test-key-deterministic';
    _resetKeyCache();
  });

  afterEach(() => {
    if (originalKey === undefined) {
      // biome-ignore lint/performance/noDelete: must REMOVE the env var, not blank it
      delete process.env.EMAIL_ENCRYPTION_KEY;
    } else {
      process.env.EMAIL_ENCRYPTION_KEY = originalKey;
    }
    _resetKeyCache();
  });

  function signService(cfg: Record<string, unknown>, submission: Record<string, unknown>) {
    const submissionUpdate = vi.fn(async (args: { data: Record<string, unknown> }) => ({
      ...submission,
      ...args.data,
    }));
    const prisma = {
      client: {
        edoConfig: { findUnique: vi.fn(async () => cfg), update: vi.fn() },
        edoSubmission: {
          findFirst: vi.fn(async () => submission),
          update: submissionUpdate,
        },
      },
    };
    return { svc: new EdoService(prisma as never), submissionUpdate };
  }

  const draft = {
    id: 'sub-1',
    accountId: ACCOUNT_ID,
    status: 'draft',
    xmlBody: '<EHF/>',
  };

  it('PFX yo`q bo`lsa imzolamaydi', async () => {
    const { svc } = signService(baseConfig(), draft);
    await expect(svc.sign(ACCOUNT_ID, 'sub-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('shifrlangan PFX bilan imzolaydi (deshifr yo`li tirik)', async () => {
    const writer = makeService(baseConfig());
    await writer.svc.setPfx(ACCOUNT_ID, PFX, 'pfx-pass');
    const stored = writer.update.mock.calls[0]?.[0].data as Record<string, unknown>;

    const { svc, submissionUpdate } = signService(baseConfig(stored), draft);
    await svc.sign(ACCOUNT_ID, 'sub-1');
    expect(submissionUpdate.mock.calls[0]?.[0].data.status).toBe('signed');
  });
});
