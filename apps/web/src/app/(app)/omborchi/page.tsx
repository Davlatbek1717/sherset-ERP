'use client';

import { usePermissions } from '@/hooks/use-permissions';
import { api } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';
import { formatBinLocation } from '@/lib/bin-location';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle,
  ClipboardCheck,
  Clock,
  ExternalLink,
  HelpCircle,
  Package,
  PackageCheck,
  Printer,
  RefreshCw,
  ScanBarcode,
  Scissors,
  Warehouse,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

interface PickingLine {
  productId: string | null;
  productName: string;
  quantity: string;
  binLocation: string | null;
  // Multi-bin: additional shelves this product also sits on.
  extraBins?: string[];
}
interface PickingSheet {
  skladNo: number | null;
  omborchiName: string | null;
  lines: PickingLine[];
}
interface PickingSheetsResponse {
  sourceName: string | null;
  storeName: string | null;
  sheets: PickingSheet[];
}

interface SaleRow {
  id: string;
  name: string;
  state: string;
  moment: string;
  sumMinor: string;
  agent: { id: string; name: string } | null;
  session: { cashDesk: { name: string; currency: string } };
  _count: { positions: number };
}

interface ProductRow {
  id: string;
  name: string;
  code: string | null;
  locSklad: number | null;
  locPolka: number | null;
  locQavat: number | null;
  locYacheyka: number | null;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit' });
}

function SaleCard({
  sale,
  onDone,
  myZone,
}: { sale: SaleRow; onDone: () => void; myZone: number | null }) {
  const [expanded, setExpanded] = useState(false);
  const qc = useQueryClient();

  const { data: sheets, isLoading: sheetsLoading } = useQuery<PickingSheetsResponse>({
    queryKey: ['picking-sheets', 'retailsale', sale.id],
    queryFn: () => api.get(`/restock-tasks/picking-sheets/retailsale/${sale.id}`),
    enabled: expanded,
  });

  // Show only this omborchi's sklad sheet; if myZone is unknown show all.
  const visibleSheets =
    myZone != null
      ? (sheets?.sheets ?? []).filter((s) => s.skladNo === myZone)
      : (sheets?.sheets ?? []);

  const readyMut = useMutation({
    mutationFn: () => api.post(`/retail-sales/${sale.id}/mark-ready`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['omborchi-picking'] });
      onDone();
    },
  });

  const isReady = sale.state === 'ready';

  return (
    <div
      className={`rounded-2xl border-2 bg-[var(--ms-bg-surface)] shadow-sm transition-all ${
        isReady ? 'border-emerald-300' : 'border-[var(--ms-border)]'
      }`}
    >
      <div className="flex items-center gap-3 p-4">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
            isReady ? 'bg-emerald-100' : 'bg-orange-100'
          }`}
        >
          {isReady ? (
            <CheckCircle className="h-5 w-5 text-emerald-600" />
          ) : (
            <Package className="h-5 w-5 text-orange-500" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-bold text-[var(--ms-text-primary)]">{sale.name}</span>
            {isReady && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                TAYYOR
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-[var(--ms-text-muted)]">
            <Clock className="h-3 w-3" />
            <span>
              {fmtDate(sale.moment)} {fmtTime(sale.moment)}
            </span>
            <span>·</span>
            <span>{sale._count.positions} ta tovar</span>
            {sale.agent && (
              <>
                <span>·</span>
                <span>{sale.agent.name}</span>
              </>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() =>
              window.open(
                `/print/picking/${sale.id}?source=retailsale&auto=1`,
                '_blank',
                'width=520,height=800',
              )
            }
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--ms-border)] text-[var(--ms-text-muted)] hover:bg-[var(--ms-bg-hover)]"
            title="Picking sheet chop etish"
          >
            <Printer className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-[var(--ms-border)] px-3 text-xs font-medium text-[var(--ms-text-muted)] hover:bg-[var(--ms-bg-hover)]"
          >
            {expanded ? 'Yopish' : "Ko'rish"}
          </button>

          {!isReady && (
            <button
              type="button"
              onClick={() => readyMut.mutate()}
              disabled={readyMut.isPending}
              className="flex h-9 items-center gap-1.5 rounded-lg bg-emerald-500 px-4 text-sm font-semibold text-white hover:bg-emerald-600 active:scale-95 disabled:opacity-50 transition-all"
            >
              {readyMut.isPending ? '...' : '✓ Tayyor'}
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-[var(--ms-border)] px-4 pb-4 pt-3">
          {sheetsLoading ? (
            <p className="text-center text-sm text-[var(--ms-text-muted)] py-4">Yuklanmoqda...</p>
          ) : visibleSheets.length === 0 ? (
            <p className="text-center text-sm text-[var(--ms-text-muted)] py-4">
              Ma'lumot topilmadi
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {visibleSheets.map((sheet) => (
                <div
                  key={sheet.skladNo ?? 'no-sklad'}
                  className="rounded-xl border border-[var(--ms-border)] overflow-hidden"
                >
                  <div className="flex items-center gap-2 bg-[var(--ms-bg-app)] px-3 py-2">
                    <span className="text-xs font-bold uppercase tracking-wide text-[var(--ms-text-muted)]">
                      Sklad {sheet.skladNo != null ? String(sheet.skladNo).padStart(2, '0') : '—'}
                    </span>
                    {sheet.omborchiName && (
                      <>
                        <span className="text-[var(--ms-text-muted)]">·</span>
                        <span className="text-xs font-semibold text-[var(--ms-text-primary)]">
                          {sheet.omborchiName}
                        </span>
                      </>
                    )}
                  </div>
                  <div className="divide-y divide-[var(--ms-border)]">
                    {sheet.lines.map((line, li) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: positional
                      <div key={li} className="flex items-center gap-3 px-3 py-2.5">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1">
                            <span className="text-sm font-medium text-[var(--ms-text-primary)]">
                              {line.productName}
                            </span>
                            {line.productId && (
                              <Link
                                href={`/scan/${line.productId}`}
                                target="_blank"
                                className="shrink-0 text-[var(--ms-text-muted)] hover:text-blue-500"
                              >
                                <ExternalLink className="h-3 w-3" />
                              </Link>
                            )}
                          </div>
                          {line.binLocation && (
                            <div className="mt-0.5 font-mono text-xs text-[var(--ms-text-muted)]">
                              {line.binLocation}
                            </div>
                          )}
                          {line.extraBins && line.extraBins.length > 0 && (
                            <div className="mt-0.5 font-mono text-[10px] text-[var(--ms-text-muted)]">
                              yana: {line.extraBins.join(' · ')}
                            </div>
                          )}
                        </div>
                        <div className="shrink-0 rounded-lg bg-[var(--ms-bg-app)] px-3 py-1 text-sm font-bold tabular-nums text-[var(--ms-text-primary)]">
                          × {Number(line.quantity)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function OmborchiPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { can } = usePermissions();
  const myId = user?.id;

  // Find current user's zone from sklad-keepers
  const { data: keepersData } = useQuery<{ items: Array<{ skladNo: number; employeeId: string }> }>(
    {
      queryKey: ['sklad-keepers'],
      queryFn: () => api.get('/sklad-keepers'),
      enabled: !!myId,
    },
  );
  const myZone = keepersData?.items.find((k) => k.employeeId === myId)?.skladNo ?? null;

  // Picking orders — filtered by assigneeId (via RestockTask) if zone is assigned.
  // G2: `assigneeOpen=1` — faqat OCHIQ topshiriqlar. Omborchi «Tayyor» bosgach
  // chek uning ro'yxatidan chiqadi (endi u KATTA OMBORCHI kontrol navbatida —
  // flip'ni kontrol qiladi, servisdagi markReady izohi).
  const pickingParams = myId
    ? `state=picking&limit=50&assigneeId=${myId}&assigneeOpen=1`
    : 'state=picking&limit=50';
  const readyParams = myId ? `state=ready&limit=20&assigneeId=${myId}` : 'state=ready&limit=20';

  const { data: pickingData, isLoading } = useQuery<{ items: SaleRow[]; total: number }>({
    queryKey: ['omborchi-picking', myId],
    queryFn: () => api.get(`/retail-sales?${pickingParams}`),
    refetchInterval: 8000,
    enabled: !!myId,
  });

  const { data: readyData } = useQuery<{ items: SaleRow[]; total: number }>({
    queryKey: ['omborchi-ready', myId],
    queryFn: () => api.get(`/retail-sales?${readyParams}`),
    refetchInterval: 8000,
    enabled: !!myId,
  });

  // Products in this omborchi's zone
  const { data: productsData } = useQuery<{ items: ProductRow[]; total: number }>({
    queryKey: ['omborchi-zone-products', myZone],
    queryFn: () => api.get(`/products?locSklad=${myZone}&limit=200&sortBy=name&sortDir=asc`),
    enabled: myZone != null,
  });

  const picking = pickingData?.items ?? [];
  const ready = readyData?.items ?? [];
  const zoneProducts = productsData?.items ?? [];

  // Play a chime when new picking orders arrive.
  const prevPickingCount = useRef<number | null>(null);
  useEffect(() => {
    const count = picking.length;
    if (prevPickingCount.current !== null && count > prevPickingCount.current) {
      try {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.12);
        gain.gain.setValueAtTime(0.4, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.5);
      } catch {}
    }
    prevPickingCount.current = count;
  }, [picking.length]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['omborchi-picking'] });
    qc.invalidateQueries({ queryKey: ['omborchi-ready'] });
  };

  return (
    <div className="flex h-[calc(100dvh-58px)] flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--ms-border)] px-6 py-3">
        <div>
          <h1 className="text-lg font-bold text-[var(--ms-text-primary)]">Omborchi paneli</h1>
          <p className="text-xs text-[var(--ms-text-muted)]">
            {myZone != null
              ? `Sklad ${myZone} — faqat sizga biriktirilgan buyurtmalar`
              : "Barcha yig'ish buyurtmalari"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* G2 — kontrol ekrani faqat katta omborchida (`retailcontrol`).
              `can` fail-open (matritsa yuklanguncha true) — haqiqiy qulf
              serverda; oddiy omborchi bossa 403 xabarini ko'radi. */}
          {can('retailcontrol', 'view') && (
            <Link
              href="/omborchi/kontrol"
              className="flex items-center gap-1.5 rounded-lg border border-sky-300 px-3 py-2 text-xs font-semibold text-sky-700 hover:bg-sky-50"
            >
              <ClipboardCheck className="h-3.5 w-3.5" />
              Kontrol
            </Link>
          )}
          {/* G3 — vozvrat qabuli ham faqat katta omborchida (`returnacceptance`). */}
          {can('returnacceptance', 'view') && (
            <Link
              href="/omborchi/vozvrat"
              className="flex items-center gap-1.5 rounded-lg border border-emerald-300 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
            >
              <PackageCheck className="h-3.5 w-3.5" />
              Vozvrat qabuli
            </Link>
          )}
          {/* K2 (2026-08-25) — bo'lak reyestri ham faqat katta omborchida
              (`piecetracking`). Kabel/sim/shlang: butun rulonlar va bo'laklar. */}
          {can('piecetracking', 'view') && (
            <Link
              href="/omborchi/bolaklar"
              className="flex items-center gap-1.5 rounded-lg border border-violet-300 px-3 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-50"
            >
              <Scissors className="h-3.5 w-3.5" />
              Bo'laklar
            </Link>
          )}
          {/* K6 (2026-08-26) — bayroq bo'yicha qaror kutayotgan tovarlar.
              Yangi «m» nomenklatura shu ro'yxatdan o'tmasa unutilib ketadi. */}
          {can('piecetracking', 'view') && (
            <Link
              href="/omborchi/hal-qilinmagan"
              className="flex items-center gap-1.5 rounded-lg border border-amber-300 px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-50"
            >
              <HelpCircle className="h-3.5 w-3.5" />
              Hal qilinmagan
            </Link>
          )}
          <a
            href="/cell"
            className="flex items-center gap-1.5 rounded-lg border border-[var(--ms-border)] px-3 py-2 text-xs font-medium text-[var(--ms-text-muted)] hover:bg-[var(--ms-bg-hover)]"
          >
            <ScanBarcode className="h-3.5 w-3.5" />
            Yacheyka skaneri
          </a>
          <button
            type="button"
            onClick={refresh}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--ms-border)] px-3 py-2 text-xs font-medium text-[var(--ms-text-muted)] hover:bg-[var(--ms-bg-hover)]"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Yangilash
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-8">
        {/* Picking orders */}
        <div>
          <div className="mb-3 flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-orange-400" />
            <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--ms-text-muted)]">
              Yig'ilishi kerak
            </h2>
            {picking.length > 0 && (
              <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-bold text-orange-700">
                {picking.length}
              </span>
            )}
          </div>

          {isLoading ? (
            <div className="py-8 text-center text-sm text-[var(--ms-text-muted)]">
              Yuklanmoqda...
            </div>
          ) : picking.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-[var(--ms-border)] py-12 text-center">
              <Package className="mx-auto mb-2 h-8 w-8 text-[var(--ms-text-muted)] opacity-40" />
              <p className="text-sm text-[var(--ms-text-muted)]">Hozircha buyurtma yo'q</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {picking.map((sale) => (
                <SaleCard
                  key={sale.id}
                  sale={sale}
                  myZone={myZone}
                  onDone={() => qc.invalidateQueries({ queryKey: ['omborchi-ready'] })}
                />
              ))}
            </div>
          )}
        </div>

        {/* Ready (kassir kutmoqda) */}
        {ready.length > 0 && (
          <div>
            <div className="mb-3 flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-emerald-400" />
              <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--ms-text-muted)]">
                Tayyor — kassir kutmoqda
              </h2>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">
                {ready.length}
              </span>
            </div>
            <div className="flex flex-col gap-3">
              {ready.map((sale) => (
                <SaleCard key={sale.id} sale={sale} myZone={myZone} onDone={() => {}} />
              ))}
            </div>
          </div>
        )}

        {/* Zone products */}
        {myZone != null && (
          <div>
            <div className="mb-3 flex items-center gap-2">
              <Warehouse className="h-4 w-4 text-[var(--ms-text-muted)]" />
              <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--ms-text-muted)]">
                Sklad {myZone} — tovarlar
              </h2>
              {zoneProducts.length > 0 && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">
                  {productsData?.total ?? zoneProducts.length}
                </span>
              )}
            </div>

            {zoneProducts.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-[var(--ms-border)] py-8 text-center">
                <p className="text-sm text-[var(--ms-text-muted)]">
                  Bu sklad bo'sh yoki tovarlar joylashuvi belgilanmagan
                </p>
              </div>
            ) : (
              <div className="rounded-2xl border border-[var(--ms-border)] bg-[var(--ms-bg-surface)] overflow-hidden">
                <div className="divide-y divide-[var(--ms-border)]">
                  {zoneProducts.map((p) => (
                    <div key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-[var(--ms-text-primary)] truncate">
                          {p.name}
                        </div>
                        {p.code && (
                          <div className="text-xs text-[var(--ms-text-muted)]">{p.code}</div>
                        )}
                      </div>
                      <div className="shrink-0 font-mono text-xs font-bold text-[var(--ms-text-secondary)] tabular-nums">
                        {formatBinLocation(p)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
