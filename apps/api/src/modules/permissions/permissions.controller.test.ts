import { describe, expect, it, vi } from 'vitest';
import { PermissionsController } from './permissions.controller.js';
import { PERMISSION_ENTITIES } from './permissions.types.js';

/**
 * `GET /permissions/me` — FE gating matritsasi (2026-08-21).
 *
 * 🔴 Bu test nima uchun bor: kontroller o'zining QO'LDA yozilgan entity
 * ro'yxatini ushlab turardi va u kanonik `PERMISSION_ENTITIES` dan ajralib
 * ketgan edi — 95 dan 52 tasi qaytardi, **43 tasi umuman yo'q** edi
 * (`contract`, `pipeline`, `mxik`, `pricetype`, `debt*`, `currency`,
 * `variant`, `saleschannel`…).
 *
 * Oqibati jim: `use-permissions.ts` noma'lum entity'ni **fail-open** deb
 * hisoblaydi (`scope === undefined` ⇒ ko'rinadi), shuning uchun hech narsa
 * «buzilmaydi» — cheklangan xodim ko'ra olmaydigan bo'limlarni menyuda
 * ko'raveradi va bosganda 403 oladi. Ya'ni ruxsat qatlami o'sha 43 entity
 * uchun BUTUNLAY KO'R.
 *
 * Shartnoma: endpoint HAR DOIM kanonik ro'yxatning hammasini qaytaradi.
 */
describe('GET /permissions/me — matritsa qamrovi', () => {
  function makeController() {
    const resolveScope = vi.fn().mockResolvedValue('ALL');
    const ctrl = new PermissionsController({ resolveScope } as never);
    return { ctrl, resolveScope };
  }

  it('kanonik PERMISSION_ENTITIES ning HAMMASINI qaytaradi', async () => {
    const { ctrl } = makeController();
    const { matrix } = await ctrl.getMine({ sub: 'emp-1' } as never);
    const missing = PERMISSION_ENTITIES.filter((e) => !(e in matrix));
    expect(missing).toEqual([]);
    expect(Object.keys(matrix)).toHaveLength(PERMISSION_ENTITIES.length);
  });

  it('har entity uchun oltita amalni ham beradi', async () => {
    const { ctrl } = makeController();
    const { matrix } = await ctrl.getMine({ sub: 'emp-1' } as never);
    for (const entity of PERMISSION_ENTITIES) {
      expect(Object.keys(matrix[entity]).sort()).toEqual([
        'approve',
        'create',
        'delete',
        'print',
        'update',
        'view',
      ]);
    }
  });

  it("ro'yxatdan tashqari entity qo'shmaydi (kanonik = yagona manba)", async () => {
    const { ctrl } = makeController();
    const { matrix } = await ctrl.getMine({ sub: 'emp-1' } as never);
    const canonical = new Set<string>(PERMISSION_ENTITIES);
    expect(Object.keys(matrix).filter((e) => !canonical.has(e))).toEqual([]);
  });
});
