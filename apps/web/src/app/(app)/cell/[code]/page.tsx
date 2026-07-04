'use client';

import { api } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, ChevronRight, Loader2, MapPin, Package } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { CellScanInput } from '../_components/cell-scan-input';

interface CellItemBalance {
  storeId: string;
  storeName: string | null;
  qty: string;
}

interface CellItem {
  id: string;
  name: string;
  code: string | null;
  article: string | null;
  uom: string | null;
  archived: boolean;
  source: 'primary' | 'extra';
  note: string | null;
  totalQty: number;
  balances: CellItemBalance[];
}

interface CellContentsResponse {
  cell: { code: string; sklad: number; polka: number; qavat: number; yacheyka: number };
  items: CellItem[];
}

/**
 * Yacheyka kartochkasi — skanerlangan yacheykada qaysi tovarlar turishi va
 * ularning qoldig'i. Har tovar /scan/<id> sahifasiga olib boradi (to'liq
 * ma'lumot + ombor kesimi). Tepadagi input keyingi yacheykani uzluksiz
 * skanerlash uchun.
 */
export default function CellContentsPage() {
  const { code } = useParams<{ code: string }>();
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user === null) router.replace('/login');
  }, [user, router]);

  const { data, isLoading, error } = useQuery<CellContentsResponse>({
    queryKey: ['cell-contents', code],
    queryFn: () => api.get(`/products/cell/${code}`),
    enabled: !!code && !!user,
  });

  if (isLoading) {
    return (
      <div className="flex h-[calc(100dvh-58px)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--ms-text-muted)]" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex h-[calc(100dvh-58px)] flex-col items-center justify-center gap-3 px-6">
        <AlertCircle className="h-10 w-10 text-red-400" />
        <p className="text-center text-[var(--ms-text-muted)] text-sm">
          Yacheyka kodi noto&apos;g&apos;ri yoki o&apos;qib bo&apos;lmadi
        </p>
        <div className="w-full max-w-sm">
          <CellScanInput />
        </div>
      </div>
    );
  }

  const { cell, items } = data;

  return (
    <div className="flex h-[calc(100dvh-58px)] flex-col overflow-y-auto">
      {/* Hero — yacheyka manzili */}
      <div className="border-[var(--ms-border)] border-b bg-[var(--ms-bg-surface)] px-5 py-5">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-100">
            <MapPin className="h-6 w-6 text-amber-600" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="font-bold font-mono text-[var(--ms-text-primary)] text-xl tracking-widest">
              {cell.code}
            </h1>
            <p className="mt-0.5 text-[var(--ms-text-muted)] text-sm">
              Sklad {cell.sklad} · Polka {cell.polka} · Etaj {cell.qavat} · Yacheyka {cell.yacheyka}
            </p>
          </div>
          <span className="rounded-full bg-blue-100 px-2.5 py-0.5 font-bold text-blue-700 text-xs">
            {items.length} tovar
          </span>
        </div>
        <div className="mt-3">
          <CellScanInput autoFocus={false} />
        </div>
      </div>

      {/* Tovarlar */}
      <div className="flex-1 space-y-3 px-4 py-4">
        {items.length === 0 ? (
          <div className="rounded-2xl border border-[var(--ms-border)] bg-[var(--ms-bg-surface)] px-4 py-10 text-center text-[var(--ms-text-muted)] text-sm">
            Bu yacheykaga hozircha tovar biriktirilmagan
          </div>
        ) : (
          items.map((item) => (
            <Link
              key={item.id}
              href={`/scan/${item.id}`}
              className="block rounded-2xl border border-[var(--ms-border)] bg-[var(--ms-bg-surface)] px-4 py-3 transition-colors hover:border-blue-300"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100">
                  <Package className="h-5 w-5 text-blue-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-[var(--ms-text-primary)] text-sm leading-tight">
                    {item.name}
                  </div>
                  <div className="mt-0.5 text-[var(--ms-text-muted)] text-xs">
                    {item.code ? (
                      <>
                        Kod: <span className="font-mono font-semibold">{item.code}</span>
                      </>
                    ) : null}
                    {item.article ? <> · Artikul: {item.article}</> : null}
                    {item.source === 'extra' ? <> · qo&apos;shimcha joy</> : null}
                    {item.note ? <> · {item.note}</> : null}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <span
                    className={`font-bold tabular-nums text-base ${
                      item.totalQty <= 0
                        ? 'text-red-500'
                        : item.totalQty <= 5
                          ? 'text-amber-500'
                          : 'text-emerald-600'
                    }`}
                  >
                    {item.totalQty}
                  </span>
                  <span className="text-[var(--ms-text-muted)] text-xs">{item.uom ?? 'ta'}</span>
                  <ChevronRight className="h-4 w-4 text-[var(--ms-text-muted)]" />
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
