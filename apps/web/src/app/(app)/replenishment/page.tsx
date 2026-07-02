'use client';

import { api } from '@/lib/api-client';
import { useQuery } from '@tanstack/react-query';
import { PackagePlus } from 'lucide-react';

interface ReplItem {
  productId: string;
  name: string;
  code: string | null;
  binLocation: string | null;
  forwardMax: number;
  currentQty: number;
  shortfall: number;
}
interface ReplResponse {
  forwardStore: { id: string; name: string } | null;
  items: ReplItem[];
}

export default function ReplenishmentPage() {
  const { data, isLoading } = useQuery<ReplResponse>({
    queryKey: ['stock-replenishment'],
    queryFn: () => api.get('/stocks/replenishment'),
    refetchInterval: 30_000,
  });

  const items = data?.items ?? [];

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center gap-2">
        <PackagePlus className="h-5 w-5 text-[var(--ms-text-brand)]" />
        <h1 className="font-bold text-lg text-[var(--ms-text-primary)]">To'ldirish kerak</h1>
        {data?.forwardStore && (
          <span className="rounded-full bg-[var(--ms-bg-app)] px-2.5 py-0.5 text-xs text-[var(--ms-text-muted)]">
            Forward ombor: {data.forwardStore.name}
          </span>
        )}
        {items.length > 0 && (
          <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">{items.length}</span>
        )}
      </div>

      <p className="mb-4 text-sm text-[var(--ms-text-muted)]">
        Forward (tez-yig'ish) omboridagi qoldiq <b>forward_max</b> dan past bo'lgan tovarlar — reserve'dan
        to'ldirish kerak.
      </p>

      {isLoading ? (
        <p className="text-sm text-[var(--ms-text-muted)]">Yuklanmoqda...</p>
      ) : !data?.forwardStore ? (
        <p className="text-sm text-[var(--ms-text-muted)]">
          Forward ombor belgilanmagan (Sozlamalar → Omborlar → biror omborni «forward» qiling).
        </p>
      ) : items.length === 0 ? (
        <p className="text-sm text-emerald-600">✓ Hammasi joyida — to'ldirish kerak bo'lgan tovar yo'q.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--ms-border)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--ms-bg-app)] text-[10px] uppercase tracking-widest text-[var(--ms-text-muted)]">
              <tr>
                <th className="px-4 py-2 text-left">Tovar</th>
                <th className="px-4 py-2 text-left">Joylashuv</th>
                <th className="px-4 py-2 text-right">Bor</th>
                <th className="px-4 py-2 text-right">Max</th>
                <th className="px-4 py-2 text-right">Yetishmaydi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--ms-border)]">
              {items.map((it) => (
                <tr key={it.productId} className="hover:bg-[var(--ms-bg-hover)]">
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-[var(--ms-text-primary)]">{it.name}</div>
                    {it.code && <div className="text-xs text-[var(--ms-text-muted)]">{it.code}</div>}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-[var(--ms-text-muted)]">
                    {it.binLocation ?? '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{it.currentQty}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-[var(--ms-text-muted)]">{it.forwardMax}</td>
                  <td className="px-4 py-2.5 text-right font-bold tabular-nums text-amber-600">
                    +{it.shortfall}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
