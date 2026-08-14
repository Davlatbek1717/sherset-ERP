/**
 * F2 (POS redizayn) — aloqa indikatori hook'i (spec §3.1).
 *
 * Qulflanayotgan shartnomalar:
 *  · YANGI server so'rovi QO'SHILMAYDI — hook mavjud so'rovlar oqimini
 *    (`QueryCache`) kuzatadi, xolos (reja 2.3 sharti);
 *  · network-xato (javob KELMAGAN — `status`siz Error) → `false`;
 *  · HTTP-xato (`status` bor — server JAVOB BERDI, masalan 403) aloqa
 *    uzilishi EMAS — indikator yashil qoladi;
 *  · keyingi muvaffaqiyatli so'rov indikatorni qaytaradi (`true`).
 */

import { renderHookWithProviders, waitFor } from '@/test-utils';
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { useServerLink } from '../use-server-link';

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } },
  });
}

/** `api-client` network-yiqilishi: fetch reject — `.status` YO'Q. */
function networkError() {
  return new Error('fetch failed');
}

/** `api-client` HTTP-xatosi: server javob berdi — `.status` BOR. */
function httpError(status: number) {
  const err = new Error(`HTTP ${status}`);
  (err as Error & { status?: number }).status = status;
  return err;
}

async function fireQuery(qc: QueryClient, key: string, outcome: 'ok' | Error) {
  await qc
    .fetchQuery({
      queryKey: [key, Math.random()],
      queryFn: () => (outcome === 'ok' ? Promise.resolve('data') : Promise.reject(outcome)),
    })
    .catch(() => {
      // Xato oqimi testning o'zi — unhandled rejection bo'lmasin.
    });
}

describe('useServerLink — QueryCache kuzatuvi', () => {
  it('boshlang‘ich holat: aloqa bor deb qabul qilinadi', () => {
    const qc = makeClient();
    const { result } = renderHookWithProviders(() => useServerLink(), { queryClient: qc });
    expect(result.current).toBe(true);
  });

  it('network-xato → false; keyingi muvaffaqiyat → true', async () => {
    const qc = makeClient();
    const { result } = renderHookWithProviders(() => useServerLink(), { queryClient: qc });

    await fireQuery(qc, 'q1', networkError());
    await waitFor(() => expect(result.current).toBe(false));

    await fireQuery(qc, 'q2', 'ok');
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('HTTP-xato (status bor) aloqa uzilishi EMAS — true qoladi', async () => {
    const qc = makeClient();
    const { result } = renderHookWithProviders(() => useServerLink(), { queryClient: qc });

    await fireQuery(qc, 'q3', httpError(403));
    // Server javob berdi — indikator qizarmasligi kerak.
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('HTTP-xato uzilishdan KEYIN kelsa ham indikatorni tiklaydi (server javob berdi)', async () => {
    const qc = makeClient();
    const { result } = renderHookWithProviders(() => useServerLink(), { queryClient: qc });

    await fireQuery(qc, 'q4', networkError());
    await waitFor(() => expect(result.current).toBe(false));

    await fireQuery(qc, 'q5', httpError(409));
    await waitFor(() => expect(result.current).toBe(true));
  });
});
