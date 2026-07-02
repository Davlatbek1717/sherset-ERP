'use client';

import { useAuth } from '@/lib/auth-store';
import { api } from '@/lib/api-client';
import { formatBinLocation } from '@/lib/bin-location';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  AlertCircle,
  Archive,
  Box,
  Loader2,
  MapPin,
  Package,
  Tag,
  Warehouse,
} from 'lucide-react';

interface ProductDetail {
  id: string;
  name: string;
  code: string | null;
  article: string | null;
  description: string | null;
  uom: string | null;
  weightG: number | null;
  volumeML: number | null;
  vat: string | null;
  locSklad: number | null;
  locPolka: number | null;
  locQavat: number | null;
  locYacheyka: number | null;
  group: { id: string; name: string } | null;
  productFolder: { id: string; name: string; pathName: string } | null;
  supplier: { id: string; name: string } | null;
}

interface StoreBalance {
  storeId: string;
  storeName: string | null;
  qty: string;
  reservedQty: string;
}

interface ScanResponse {
  product: ProductDetail;
  balances: StoreBalance[];
  totalQty: number;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-[var(--ms-border)] last:border-0">
      <span className="text-sm text-[var(--ms-text-muted)] shrink-0">{label}</span>
      <span className="text-sm font-medium text-[var(--ms-text-primary)] text-right">{value}</span>
    </div>
  );
}

export default function ScanPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user === null) router.replace('/login');
  }, [user, router]);

  const { data, isLoading, error } = useQuery<ScanResponse>({
    queryKey: ['scan', id],
    queryFn: () => api.get(`/products/${id}/scan`),
    enabled: !!id && !!user,
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
        <p className="text-center text-sm text-[var(--ms-text-muted)]">
          Tovar topilmadi
        </p>
      </div>
    );
  }

  const { product, balances, totalQty } = data;
  const binLabel = formatBinLocation(product);
  const hasBin = product.locSklad != null;

  return (
    <div className="flex h-[calc(100dvh-58px)] flex-col overflow-y-auto">
      {/* Hero */}
      <div className="bg-[var(--ms-bg-surface)] border-b border-[var(--ms-border)] px-5 py-5">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-100">
            <Package className="h-6 w-6 text-blue-600" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold leading-tight text-[var(--ms-text-primary)]">
              {product.name}
            </h1>
            {product.code && (
              <p className="mt-0.5 text-sm text-[var(--ms-text-muted)]">
                Kod: <span className="font-mono font-semibold">{product.code}</span>
              </p>
            )}
            {product.article && (
              <p className="text-sm text-[var(--ms-text-muted)]">
                Artikul: <span className="font-semibold">{product.article}</span>
              </p>
            )}
          </div>
        </div>

        {/* Bin location badge */}
        {hasBin && (
          <div className="mt-3 inline-flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-4 py-2">
            <MapPin className="h-4 w-4 text-amber-600 shrink-0" />
            <span className="font-mono text-base font-bold text-amber-800 tracking-widest">
              {binLabel}
            </span>
          </div>
        )}
      </div>

      <div className="flex-1 px-4 py-4 space-y-4">
        {/* Stock balances */}
        <div className="rounded-2xl border border-[var(--ms-border)] bg-[var(--ms-bg-surface)] overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 bg-[var(--ms-bg-app)] border-b border-[var(--ms-border)]">
            <Warehouse className="h-4 w-4 text-[var(--ms-text-muted)]" />
            <span className="text-xs font-bold uppercase tracking-wide text-[var(--ms-text-muted)]">
              Qoldiq
            </span>
            <span className="ml-auto rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-700">
              Jami: {totalQty}
            </span>
          </div>

          {balances.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-[var(--ms-text-muted)]">
              Hech bir ombordan ma&apos;lumot yo&apos;q
            </div>
          ) : (
            <div className="divide-y divide-[var(--ms-border)]">
              {balances.map((b) => {
                const qty = Number(b.qty);
                const reserved = Number(b.reservedQty);
                const available = qty - reserved;
                return (
                  <div key={b.storeId} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-[var(--ms-text-primary)]">
                        {b.storeName ?? 'Ombor'}
                      </div>
                      {reserved > 0 && (
                        <div className="text-xs text-[var(--ms-text-muted)]">
                          {reserved} ta band
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <div
                        className={`text-lg font-bold tabular-nums ${
                          available <= 0
                            ? 'text-red-500'
                            : available <= 5
                              ? 'text-amber-500'
                              : 'text-emerald-600'
                        }`}
                      >
                        {available}
                      </div>
                      {reserved > 0 && (
                        <div className="text-xs text-[var(--ms-text-muted)] tabular-nums">
                          / {qty}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Characteristics */}
        <div className="rounded-2xl border border-[var(--ms-border)] bg-[var(--ms-bg-surface)] overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 bg-[var(--ms-bg-app)] border-b border-[var(--ms-border)]">
            <Tag className="h-4 w-4 text-[var(--ms-text-muted)]" />
            <span className="text-xs font-bold uppercase tracking-wide text-[var(--ms-text-muted)]">
              Tasniflar
            </span>
          </div>
          <div className="px-4">
            <Row label="O'lchov birligi" value={product.uom} />
            <Row label="Guruh" value={product.group?.name} />
            <Row label="Katalog" value={product.productFolder?.pathName} />
            <Row label="Yetkazuvchi" value={product.supplier?.name} />
            <Row label="QQS" value={product.vat ? `${product.vat}%` : null} />
            <Row
              label="Og'irlik"
              value={product.weightG ? `${product.weightG} g` : null}
            />
            <Row
              label="Hajm"
              value={product.volumeML ? `${product.volumeML} ml` : null}
            />
            {product.description && (
              <div className="py-2.5">
                <p className="text-xs text-[var(--ms-text-muted)] mb-1">Tavsif</p>
                <p className="text-sm text-[var(--ms-text-primary)]">{product.description}</p>
              </div>
            )}
            {!product.uom && !product.group && !product.productFolder &&
              !product.supplier && !product.vat && !product.weightG &&
              !product.volumeML && !product.description && (
              <div className="py-4 text-center text-sm text-[var(--ms-text-muted)]">
                Tasniflar kiritilmagan
              </div>
            )}
          </div>
        </div>

        {/* ID for reference */}
        <div className="rounded-xl border border-[var(--ms-border)] bg-[var(--ms-bg-surface)] px-4 py-3 flex items-center gap-2">
          <Box className="h-4 w-4 shrink-0 text-[var(--ms-text-muted)]" />
          <span className="font-mono text-xs text-[var(--ms-text-muted)] break-all">{id}</span>
          <Archive className="h-3 w-3 shrink-0 text-transparent" />
        </div>
      </div>
    </div>
  );
}
