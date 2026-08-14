'use client';

/**
 * F2 (POS redizayn) — server bilan aloqa indikatori (spec §3.1).
 *
 * YANGI so'rov/ping QO'SHILMAYDI: POS sahifasida polling allaqachon bor
 * (tayyor/jarayonda cheklar 8s, tovar setkasi 60s) — hook shu oqimning
 * natijalarini `QueryCache` orqali kuzatadi, xolos.
 *
 * «Aloqa yo'q» ta'rifi TARMOQ darajasida: `api-client` HTTP-xatoga `.status`
 * qo'yadi (server JAVOB BERDI — masalan 403/409), network-yiqilishda esa
 * fetch o'zi `status`siz Error otadi. Faqat ikkinchisi indikatorni
 * qizartiradi — aks holda oddiy ruxsat-xatosi «server yo'q» degan yolg'on
 * signal bo'lardi.
 */

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

export function useServerLink(): boolean {
  const qc = useQueryClient();
  const [ok, setOk] = useState(true);

  useEffect(() => {
    return qc.getQueryCache().subscribe((event) => {
      if (event.type !== 'updated') return;
      if (event.action.type === 'success') {
        setOk(true);
      } else if (event.action.type === 'error') {
        const err = event.action.error as (Error & { status?: number }) | undefined;
        // `status` bor = server javob berdi (HTTP-xato) — aloqa joyida.
        setOk(err?.status != null);
      }
    });
  }, [qc]);

  return ok;
}
