'use client';

import { RasmiyashtirishModal } from '@/components/pos/rasmilashtirish-modal';
import { useDestructiveMutation } from '@/hooks/use-destructive-mutation';
import { useFillViewport } from '@/hooks/use-fill-viewport';
import { api } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';
import { printPickingViaAgent, printReceiptViaAgent } from '@/lib/print-agent';
import {
  resolveDefaultSalePrice,
  resolveDefaultSalePriceOrZero,
  resolveWholesaleSalePrice,
  usePriceTypeIds,
} from '@/lib/sale-price';
import {
  Money,
  classifyPrice,
  lineProfitMinor,
  marginPercent,
  markdownMinor,
  sumCostMinor,
} from '@moysklad/money';
import { isCurrencyCode } from '@moysklad/money/currencies';
import { Badge, Button, Input, formatMoney, useToast } from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, Clock, Receipt, Search, Settings, ShoppingCart, User } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────

interface CashDesk {
  id: string;
  name: string;
  currency: string;
}
interface Store {
  id: string;
  name: string;
}
interface Organization {
  id: string;
  name: string;
}

interface CurrentSession {
  id: string;
  state: 'open' | 'closed';
  openedAt: string;
  cashier: { id: string; name: string };
  cashDesk: CashDesk | null;
  store: Store | null;
  organization: Organization;
  salesCount: number;
  salesSumMinor: string;
  openingCashMinor: string;
}

interface ProductRow {
  id: string;
  name: string;
  code: string | null;
  buyPrice: string | null;
  salePrices?: Array<{ priceTypeId: string; value: string }> | null;
  stock?: { onHand: string; reserved: string; available: string } | null;
}

interface CartLine {
  productId: string;
  productName: string;
  quantity: number;
  priceMinor: bigint;
  priceStr: string; // user-editable price string (major units)
  availableStock?: number;
  // Kassa TZ §5 — the two floors and the starting price, read off the product
  // card when the line is added. NULL means the card carries no such number;
  // the row then shows «—» and raises no warning, because an absent floor is
  // not evidence that the price is wrong. These are LIVE values for the
  // cashier's benefit — `post()` re-reads and freezes them server-side.
  costMinor: bigint | null;
  wholesaleMinor: bigint | null;
  basePriceMinor: bigint | null;
}

interface ListResponse<T> {
  items: T[];
  total: number;
}

/**
 * Minor-unit string → bigint, preserving the "not set" case as null.
 * Deliberately NOT `?? 0n`: a zero cost reads as «this was free to us» and
 * yields a 100% margin, which is precisely the false number the cart exists to
 * stop showing (kassa TZ §5.3).
 */
function toMinorOrNull(value: string | null | undefined): bigint | null {
  if (value == null || value === '') return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

// ── Open Shift Form ─────────────────────────────────────────────────────────

interface MineResponse {
  smena: {
    id: string;
    name: string;
    schedule: { name: string; startTime: string; endTime: string };
    organization: { id: string; name: string };
  } | null;
  withinShift: boolean;
}

function OpenShiftForm() {
  const tRetail = useTranslations('pages.retail');
  const qc = useQueryClient();
  const { toast } = useToast();

  const [reason, setReason] = useState('');
  const [showReasonInput, setShowReasonInput] = useState(false);

  const { data: mine, isLoading } = useQuery<MineResponse>({
    queryKey: ['smena-mine'],
    queryFn: () => api.get<MineResponse>('/admin/smenas/mine'),
  });

  const openMut = useMutation({
    mutationFn: (body: object) => api.post('/admin/smenas/open-session', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cashier-session-current'] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const handleOpen = () => {
    if (!mine?.smena) return;
    if (!mine.withinShift && !reason.trim()) {
      setShowReasonInput(true);
      return;
    }
    openMut.mutate({
      smenaId: mine.smena.id,
      openingCashMinor: '0',
      ...(reason.trim() ? { outOfShiftReason: reason.trim() } : {}),
    });
  };

  if (isLoading) {
    return (
      <div className="mx-auto mt-16 max-w-sm text-center text-[var(--ms-text-muted)] text-sm">
        Yuklanmoqda...
      </div>
    );
  }

  // Kassirga smena biriktirilmagan
  if (!mine?.smena) {
    return (
      <div className="mx-auto mt-16 max-w-sm rounded-2xl bg-[var(--ms-bg-surface)] p-6 shadow-lg text-center">
        <h2 className="mb-2 font-semibold text-[var(--ms-text-primary)] text-xl">
          Smena biriktirilmagan
        </h2>
        <p className="text-sm text-[var(--ms-text-muted)]">
          Admin sizga smena biriktirishi kerak.
          <br />
          <a
            href="/settings/smena"
            className="text-[var(--ms-text-brand)] underline mt-1 inline-block"
          >
            Smenalarni boshqarish →
          </a>
        </p>
      </div>
    );
  }

  const { smena, withinShift } = mine;

  return (
    <div className="mx-auto mt-16 max-w-sm rounded-2xl bg-[var(--ms-bg-surface)] p-6 shadow-lg">
      <h2 className="mb-1 font-semibold text-[var(--ms-text-primary)] text-xl">
        {tRetail('open_shift_title')}
      </h2>

      {/* Smena ma'lumotlari */}
      <div className="mt-4 mb-5 rounded-xl bg-[var(--ms-bg-app)] p-4 flex flex-col gap-2 text-sm">
        <div className="flex justify-between">
          <span className="text-[var(--ms-text-muted)]">Smena</span>
          <span className="font-medium">{smena.name}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--ms-text-muted)]">Ish vaqti</span>
          <span
            className={withinShift ? 'text-green-600 font-medium' : 'text-orange-500 font-medium'}
          >
            {smena.schedule.startTime}–{smena.schedule.endTime}
            {withinShift ? ' ✓' : ' (vaqtdan tashqari)'}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--ms-text-muted)]">Tashkilot</span>
          <span>{smena.organization.name}</span>
        </div>
      </div>

      {/* Vaqtdan tashqari — sabab so'rash */}
      {showReasonInput && !withinShift && (
        <div className="mb-4">
          <p className="text-sm text-orange-600 mb-2">
            Siz o'z ish vaqtingizdan ({smena.schedule.startTime}–{smena.schedule.endTime})
            tashqarisida ishlayapsiz. Sabab yozing:
          </p>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Masalan: navbatchi kassir xastalik sababli kelmadi"
            autoFocus
          />
        </div>
      )}

      <Button
        variant="primary"
        size="lg"
        className="w-full"
        loading={openMut.isPending}
        onClick={handleOpen}
        disabled={showReasonInput && !reason.trim()}
      >
        {withinShift ? 'Smena ochish' : showReasonInput ? 'Sabab bilan ochish' : 'Smena ochish'}
      </Button>
    </div>
  );
}

// ── Chek detail panel ────────────────────────────────────────────────────────

interface ChekDetailPosition {
  id: string;
  quantity: string;
  priceMinor: string;
  sumMinor: string;
  discount: string;
  product: { id: string; name: string; code: string | null };
}
interface ChekDetailData {
  id: string;
  name: string;
  moment: string;
  state: string;
  sumMinor: string;
  cashAmountMinor: string;
  cardAmountMinor: string;
  terminalAmountMinor: string;
  agent: { id: string; name: string } | null;
  session: {
    cashier: { id: string; name: string };
    cashDesk: { name: string; currency: string } | null;
    store: { name: string } | null;
  };
  positions: ChekDetailPosition[];
}

function ChekDetailPanel({ saleId, onBack }: { saleId: string; onBack: () => void }) {
  const { data, isLoading } = useQuery<ChekDetailData>({
    queryKey: ['retail-sale-detail', saleId],
    queryFn: () => api.get(`/retail-sales/${saleId}`),
  });

  const qc = useQueryClient();
  const { toast } = useToast();
  const [returnMode, setReturnMode] = useState(false);
  // positionId → qty to return (defaults to the full sold qty on entering mode).
  const [returnQty, setReturnQty] = useState<Record<string, number>>({});

  const refundMut = useMutation({
    mutationFn: async () => {
      const positions = (data?.positions ?? [])
        .filter((p) => (returnQty[p.id] ?? 0) > 0)
        .map((p) => ({
          productId: p.product.id,
          quantity: String(returnQty[p.id]),
          priceMinor: p.priceMinor,
        }));
      if (positions.length === 0) throw new Error('Qaytariladigan tovar tanlanmagan');
      const cashRefund = positions.reduce(
        (sum, pos) => sum + BigInt(pos.priceMinor) * BigInt(pos.quantity),
        0n,
      );
      await api.post(`/retail-sales/${saleId}/refund`, {
        positions,
        cashAmountMinor: cashRefund.toString(),
        cardAmountMinor: '0',
        description: 'POS qaytarish',
      });
    },
    onSuccess: () => {
      toast.success('Qaytarildi — tovar omborga qaytdi, omborchiga joylashtirish yuborildi');
      setReturnMode(false);
      setReturnQty({});
      qc.invalidateQueries({ queryKey: ['retail-sale-detail', saleId] });
      qc.invalidateQueries({ queryKey: ['retail-sales-session'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const startReturn = () => {
    setReturnQty(
      Object.fromEntries((data?.positions ?? []).map((p) => [p.id, Number(p.quantity)])),
    );
    setReturnMode(true);
  };

  if (isLoading || !data) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-[var(--ms-text-muted)]">
        Yuklanmoqda...
      </div>
    );
  }

  const cash = BigInt(data.cashAmountMinor ?? '0');
  const card = BigInt(data.cardAmountMinor ?? '0');
  const terminal = BigInt(data.terminalAmountMinor ?? '0');
  const stateLabel: Record<string, string> = {
    posted: "To'langan",
    draft: 'Qoralama',
    picking: "Yig'ilmoqda",
    ready: 'Tayyor',
    cancelled: 'Bekor',
    refunded: 'Qaytarilgan',
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-[var(--ms-border)] px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--ms-border)] text-[var(--ms-text-muted)] hover:bg-[var(--ms-bg-hover)]"
        >
          ‹
        </button>
        <div className="min-w-0 flex-1">
          <div className="font-bold text-[var(--ms-text-primary)]">{data.name}</div>
          <div className="text-xs text-[var(--ms-text-muted)]">
            {new Date(data.moment).toLocaleString('uz-UZ', {
              day: '2-digit',
              month: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })}
            {' · '}
            <span
              className={
                data.state === 'posted'
                  ? 'text-emerald-600 font-medium'
                  : data.state === 'cancelled'
                    ? 'text-red-500'
                    : ''
              }
            >
              {stateLabel[data.state] ?? data.state}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={async () => {
            // Same routing as a fresh sale: agent → configured receipt printer,
            // else the browser popup.
            const outcome = await printReceiptViaAgent(data.id);
            if (!outcome.handled) {
              window.open(
                `/print/retail-sale/${data.id}?auto=1`,
                '_blank',
                'width=420,height=680,noopener',
              );
            } else if (!outcome.ok) {
              toast.error('Chek chiqmadi — printerni tekshiring');
            }
          }}
          className="flex h-8 items-center gap-1.5 rounded-lg border border-[var(--ms-border)] px-3 text-xs font-medium text-[var(--ms-text-muted)] hover:bg-[var(--ms-bg-hover)]"
        >
          🖨 Chek
        </button>
        {data.state === 'posted' &&
          (returnMode ? (
            <button
              type="button"
              onClick={() => setReturnMode(false)}
              className="flex h-8 items-center gap-1.5 rounded-lg border border-[var(--ms-border)] px-3 text-xs font-medium text-[var(--ms-text-muted)] hover:bg-[var(--ms-bg-hover)]"
            >
              Bekor
            </button>
          ) : (
            <button
              type="button"
              onClick={startReturn}
              className="flex h-8 items-center gap-1.5 rounded-lg bg-[var(--ms-destructive-500)] px-3 text-xs font-bold text-white hover:opacity-90"
            >
              ↩ Qaytarish
            </button>
          ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        {/* Kassir + mijoz */}
        <div className="rounded-xl border border-[var(--ms-border)] bg-[var(--ms-bg-app)] divide-y divide-[var(--ms-border)]">
          <div className="flex justify-between px-4 py-2.5 text-sm">
            <span className="text-[var(--ms-text-muted)]">Kassir</span>
            <span className="font-medium">{data.session.cashier.name}</span>
          </div>
          {data.session.store && (
            <div className="flex justify-between px-4 py-2.5 text-sm">
              <span className="text-[var(--ms-text-muted)]">Do'kon</span>
              <span className="font-medium">{data.session.store.name}</span>
            </div>
          )}
          {data.agent && (
            <div className="flex justify-between px-4 py-2.5 text-sm">
              <span className="text-[var(--ms-text-muted)]">Mijoz</span>
              <span className="font-medium text-[var(--ms-text-brand)]">{data.agent.name}</span>
            </div>
          )}
        </div>

        {/* Positions */}
        <div className="rounded-xl border border-[var(--ms-border)] overflow-hidden">
          <div className="bg-[var(--ms-bg-app)] px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-[var(--ms-text-muted)]">
            Tovarlar
          </div>
          <div className="divide-y divide-[var(--ms-border)]">
            {data.positions.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-[var(--ms-text-primary)]">
                    {p.product.name}
                  </div>
                  {p.product.code && (
                    <div className="text-xs text-[var(--ms-text-muted)]">{p.product.code}</div>
                  )}
                </div>
                {returnMode && (
                  <div className="flex shrink-0 items-center gap-1">
                    <span className="text-xs text-[var(--ms-text-muted)]">Qaytadi:</span>
                    <input
                      type="number"
                      min={0}
                      max={Number(p.quantity)}
                      value={returnQty[p.id] ?? 0}
                      onChange={(e) =>
                        setReturnQty((prev) => ({
                          ...prev,
                          [p.id]: Math.max(
                            0,
                            Math.min(Number(p.quantity), Number(e.target.value) || 0),
                          ),
                        }))
                      }
                      className="w-14 rounded border border-[var(--ms-border)] bg-[var(--ms-bg-input)] px-1.5 py-0.5 text-right text-sm tabular-nums focus:border-[var(--ms-border-focus)] focus:outline-none"
                    />
                    <span className="text-xs text-[var(--ms-text-muted)]">
                      / {Number(p.quantity)}
                    </span>
                  </div>
                )}
                <div className="shrink-0 text-right">
                  <div className="text-sm font-semibold tabular-nums text-[var(--ms-text-primary)]">
                    {formatMoney(BigInt(p.sumMinor))}
                  </div>
                  <div className="text-xs text-[var(--ms-text-muted)] tabular-nums">
                    {Number(p.quantity)} × {formatMoney(BigInt(p.priceMinor))}
                    {Number(p.discount) > 0 && ` −${p.discount}%`}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Payment breakdown */}
        <div className="rounded-xl border border-[var(--ms-border)] bg-[var(--ms-bg-app)] divide-y divide-[var(--ms-border)]">
          {cash > 0n && (
            <div className="flex justify-between px-4 py-2.5 text-sm">
              <span className="text-[var(--ms-text-muted)]">Naqd</span>
              <span className="font-medium tabular-nums">{formatMoney(cash)}</span>
            </div>
          )}
          {card > 0n && (
            <div className="flex justify-between px-4 py-2.5 text-sm">
              <span className="text-[var(--ms-text-muted)]">Karta</span>
              <span className="font-medium tabular-nums">{formatMoney(card)}</span>
            </div>
          )}
          {terminal > 0n && (
            <div className="flex justify-between px-4 py-2.5 text-sm">
              <span className="text-[var(--ms-text-muted)]">Terminal</span>
              <span className="font-medium tabular-nums">{formatMoney(terminal)}</span>
            </div>
          )}
          <div className="flex justify-between px-4 py-3 text-base font-bold">
            <span>Jami</span>
            <span className="tabular-nums">{formatMoney(BigInt(data.sumMinor))}</span>
          </div>
        </div>
      </div>

      {returnMode && (
        <div className="shrink-0 border-t border-[var(--ms-border)] bg-[var(--ms-bg-surface)] p-4">
          {(() => {
            const refundMinor = data.positions.reduce(
              (sum, p) => sum + BigInt(p.priceMinor) * BigInt(returnQty[p.id] ?? 0),
              0n,
            );
            return (
              <>
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm text-[var(--ms-text-muted)]">
                    Qaytariladigan summa (naqd)
                  </span>
                  <span className="font-bold text-lg tabular-nums text-[var(--ms-destructive-500)]">
                    {formatMoney(refundMinor)}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={refundMinor <= 0n || refundMut.isPending}
                  onClick={() => refundMut.mutate()}
                  className="w-full rounded-xl bg-[var(--ms-destructive-500)] py-3 font-bold text-white hover:opacity-90 disabled:opacity-40"
                >
                  {refundMut.isPending ? 'Qaytarilmoqda...' : '↩ Qaytarishni tasdiqlash'}
                </button>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}

// ── Sales screen ─────────────────────────────────────────────────────────────

function SalesScreen({ session }: { session: CurrentSession }) {
  const t = useTranslations('pages.sotuv');
  const qc = useQueryClient();
  const { toast } = useToast();
  const { runDestructive } = useDestructiveMutation();

  // Tan narx BUTUN sahifada ko'rinadi — setkada ham, savatda ham.
  //
  // Ilgari setkadagi «Kelgan» faqat egaga ko'rinardi. Kassa TZ §5.2 savat
  // qatoriga tan narx / optom chegara / jonli foydani chiqargach (2026-08-02,
  // to'lqin 1.1), o'sha gate HIMOYA QILMAY qo'ydi: kassir tovarni bir marta
  // bosib savatga qo'shsa, o'sha raqamni baribir ko'radi. Ishlamaydigan
  // cheklovni saqlash undan ham yomoni — u «bu raqam sir» deb o'rgatadi va
  // ikki soniyadan keyin o'zi ko'rsatadi.
  //
  // Egasining modeli buni allaqachon hal qilgan: «kassirga ishonch + keyingi
  // nazorat» (TZ §5 «Boshqaruvchi falsafa»). Narxni erkin qo'yadigan kassir
  // nima berayotganini ko'rishi KERAK; nazorat esa keyin — audit jurnali va
  // menejer analitikasi orqali (to'lqin 1.3).

  // Real PriceType ids so the cart reads the same tiers the server freezes at
  // post() — the retail tier for the starting price, the «Оптовая цена» tier
  // for the negotiated floor.
  const { defaultId: defaultPriceTypeId, wholesaleId: wholesalePriceTypeId } = usePriceTypeIds();

  const [tab, setTab] = useState<'savat' | 'jarayonda' | 'tayyor' | 'cheklar' | 'smena'>('savat');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [discountPct, setDiscountPct] = useState(0);
  const [discountEditing, setDiscountEditing] = useState(false);

  // ── MIJOZ-EKRAN (televizor) ────────────────────────────────────────────────
  // Kassir O'ZI boshqaradi (avtomat EMAS): tugma yoki F9.
  //  • Sherset dasturi (Electron) — native 2-oyna, HDMI ekranда fullscreen (IPC).
  //  • Oddiy brauzer (Chrome) — yangi brauzer oynasi (window.open); uni televizorga
  //    sudrab F11 bilan fullscreen qilinadi. Savat BroadcastChannel bilan sinxron.
  const [cfdOpen, setCfdOpen] = useState(false);

  // Mijoz-ekranga yuboriladigan savat (bigint IPC/postMessage'da uzatilmaydi → string).
  const cfdPayload = useMemo(
    () => ({
      lines: cart.map((l) => ({
        productId: l.productId,
        name: l.productName,
        quantity: l.quantity,
        priceMinor: String(l.priceMinor),
      })),
      discountPct,
    }),
    [cart, discountPct],
  );
  const cfdPayloadRef = useRef(cfdPayload);
  cfdPayloadRef.current = cfdPayload;

  // Brauzer mijoz-oynasi bilan aloqa kanali (bir marta). Mijoz-oyna ochilganda
  // «cfd-ready» yuboradi — biz joriy savatni qaytaramiz (dastlabki holat uchun).
  const cfdChannelRef = useRef<BroadcastChannel | null>(null);
  const cfdWindowRef = useRef<Window | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return;
    const ch = new BroadcastChannel('sherset-cart');
    ch.onmessage = (e) => {
      if (e.data?.type === 'cfd-ready')
        ch.postMessage({ type: 'cart', payload: cfdPayloadRef.current });
    };
    cfdChannelRef.current = ch;
    return () => {
      ch.close();
      cfdChannelRef.current = null;
    };
  }, []);

  // Dastur ichида bo'lsak — mijoz-oyna allaqachon ochiqmi (holatni tikla).
  useEffect(() => {
    window.electronAPI
      ?.customerDisplayStatus?.()
      .then((s) => setCfdOpen(!!s?.open))
      .catch(() => {});
  }, []);

  const toggleCfd = useCallback(async () => {
    // (a) Sherset dasturi — native 2-oyna.
    if (window.electronAPI?.toggleCustomerDisplay) {
      try {
        const r = await window.electronAPI.toggleCustomerDisplay();
        if (r?.error) toast.error(r.error);
        setCfdOpen(!!r?.open);
      } catch {
        /* IPC xatosi — jim, kassa ishi to'xtamasin */
      }
      return;
    }
    // (b) Brauzer — yangi oyna. Ochiq bo'lsa — yopamiz.
    if (cfdWindowRef.current && !cfdWindowRef.current.closed) {
      cfdWindowRef.current.close();
      cfdWindowRef.current = null;
      setCfdOpen(false);
      return;
    }
    const w = window.open('/customer-display', 'sherset-cfd', 'width=1280,height=720');
    if (!w) {
      toast.error("Oyna ochilmadi — brauzer popup'ni bloklagan. Ruxsat bering va qayta urining.");
      return;
    }
    cfdWindowRef.current = w;
    setCfdOpen(true);
    // Oyna yuklanguncha joriy savatni bir necha marta yuboramiz (handshake zaxirasi).
    for (const ms of [400, 900, 1600]) {
      setTimeout(
        () => cfdChannelRef.current?.postMessage({ type: 'cart', payload: cfdPayloadRef.current }),
        ms,
      );
    }
  }, [toast]);

  // Smena tab — drawer + close shift
  const tillCurrency = isCurrencyCode(session.cashDesk?.currency)
    ? session.cashDesk!.currency
    : 'UZS';
  const [drawerMode, setDrawerMode] = useState<'in' | 'out' | null>(null);
  const [drawerAmount, setDrawerAmount] = useState('');
  const [drawerComment, setDrawerComment] = useState('');
  const [closingCash, setClosingCash] = useState('');
  const [showCloseForm, setShowCloseForm] = useState(false);

  const { data: products, isLoading } = useQuery<ListResponse<ProductRow>>({
    queryKey: ['products-sotuv', search],
    queryFn: () =>
      api.get<ListResponse<ProductRow>>(`/products?search=${encodeURIComponent(search)}&limit=48`),
  });

  interface SaleRow {
    id: string;
    name: string;
    sumMinor: string;
    moment: string;
    state: string;
    agent: { id: string; name: string } | null;
    session: {
      cashier: { id: string; name: string };
      cashDesk: { name: string; currency: string } | null;
    };
    _count?: { positions: number };
  }
  interface SaleDetail extends SaleRow {
    cashAmountMinor: string;
    cardAmountMinor: string;
    terminalAmountMinor: string;
    positions: Array<{
      id: string;
      quantity: string;
      priceMinor: string;
      sumMinor: string;
      discount: string;
      // Frozen at post() — NULL while the receipt is still draft/picking/ready.
      costMinor: string | null;
      basePriceMinor: string | null;
      product: {
        id: string;
        name: string;
        code: string | null;
        buyPrice: string | null;
        salePrices?: Array<{ priceTypeId: string; value: string }> | null;
      };
    }>;
  }

  const [selectedChekId, setSelectedChekId] = useState<string | null>(null);

  const { data: cheklar } = useQuery<{ items: SaleRow[]; total: number }>({
    queryKey: ['retail-sales-session', session.id],
    queryFn: () => api.get(`/retail-sales?sessionId=${session.id}&limit=100`),
    enabled: tab === 'cheklar',
  });

  // Ready state sales — polling every 8s so kassir sees when omborchi marks tayyor
  const { data: readySalesData } = useQuery<{ items: SaleRow[] }>({
    queryKey: ['retail-sales-ready', session.id],
    queryFn: () => api.get(`/retail-sales?sessionId=${session.id}&state=ready&limit=20`),
    refetchInterval: 8000,
  });
  const readySales = readySalesData?.items ?? [];

  // Picking (jarayonda) state sales — omborchi hozir yig'ayotgan savdolar.
  // Polled so the kassir sees live what the warehouse worker is collecting.
  const { data: pickingSalesData } = useQuery<{ items: SaleRow[] }>({
    queryKey: ['retail-sales-picking', session.id],
    queryFn: () => api.get(`/retail-sales?sessionId=${session.id}&state=picking&limit=20`),
    refetchInterval: 8000,
  });
  const pickingSales = pickingSalesData?.items ?? [];

  // Ready sale selected for payment
  const [payingSale, setPayingSale] = useState<{ id: string; sumMinor: bigint } | null>(null);

  const cartCount = cart.reduce((n, l) => n + l.quantity, 0);
  const cartTotal = cart.reduce((sum, l) => sum + l.priceMinor * BigInt(l.quantity), 0n);
  const discountedTotal =
    discountPct > 0 ? cartTotal - (cartTotal * BigInt(discountPct)) / 100n : cartTotal;

  // Chek bo'yicha foyda (kassa TZ §5.2) — profit is taken off the DISCOUNTED
  // total, since that is the money the till actually receives. `complete` goes
  // false as soon as one line has no cost on its card; the footer then says so
  // instead of showing a total that silently counts that line as pure profit.
  const cartCost = sumCostMinor(
    cart.map((l) => ({ costMinor: l.costMinor, quantity: BigInt(l.quantity) })),
  );
  const cartProfitMinor = cartCost.complete ? discountedTotal - cartCost.costMinor : null;
  const cartMarginPct = marginPercent(cartProfitMinor, discountedTotal);

  // The three numbers a cart line carries off the product card (kassa TZ §5.1):
  // cost floor, wholesale floor, retail starting price.
  const cardPrices = useCallback(
    (
      buyPrice: string | null | undefined,
      salePrices: ProductRow['salePrices'],
    ): Pick<CartLine, 'costMinor' | 'wholesaleMinor' | 'basePriceMinor'> => ({
      costMinor: toMinorOrNull(buyPrice),
      wholesaleMinor: toMinorOrNull(resolveWholesaleSalePrice(salePrices, wholesalePriceTypeId)),
      basePriceMinor: toMinorOrNull(resolveDefaultSalePrice(salePrices, defaultPriceTypeId)),
    }),
    [defaultPriceTypeId, wholesalePriceTypeId],
  );

  const addToCart = useCallback(
    (product: ProductRow) => {
      setCart((prev) => {
        const existing = prev.find((l) => l.productId === product.id);
        if (existing) {
          return prev.map((l) =>
            l.productId === product.id ? { ...l, quantity: l.quantity + 1 } : l,
          );
        }
        const minor = BigInt(resolveDefaultSalePriceOrZero(product.salePrices, defaultPriceTypeId));
        return [
          ...prev,
          {
            productId: product.id,
            productName: product.name,
            quantity: 1,
            priceMinor: minor,
            priceStr: (Number(minor) / 100).toString(),
            availableStock: product.stock != null ? Number(product.stock.available) : undefined,
            ...cardPrices(product.buyPrice, product.salePrices),
          },
        ];
      });
    },
    [cardPrices, defaultPriceTypeId],
  );

  // Savat har o'zgarganda mijoz-ekranga uzatamiz — ikkala yo'l bilan:
  //  • Electron IPC (pushCart) — dastur ichidagi native 2-oyna,
  //  • BroadcastChannel — brauzerdagi mijoz-oyna (window.open).
  useEffect(() => {
    window.electronAPI?.pushCart?.(cfdPayload);
    cfdChannelRef.current?.postMessage({ type: 'cart', payload: cfdPayload });
  }, [cfdPayload]);

  const updateQty = useCallback((productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((l) => (l.productId === productId ? { ...l, quantity: l.quantity + delta } : l))
        .filter((l) => l.quantity > 0),
    );
  }, []);

  const removeFromCart = useCallback((productId: string) => {
    setCart((prev) => prev.filter((l) => l.productId !== productId));
  }, []);

  const updatePrice = useCallback((productId: string, input: string) => {
    setCart((prev) =>
      prev.map((l) => {
        if (l.productId !== productId) return l;
        const num = Number.parseFloat(input.replace(/\s/g, '').replace(',', '.'));
        const minor = !Number.isNaN(num) && num >= 0 ? BigInt(Math.round(num * 100)) : l.priceMinor;
        return { ...l, priceStr: input, priceMinor: minor };
      }),
    );
  }, []);

  // Savat darajasidagi chegirma (`discountPct`) har bir pozitsiyaga foiz sifatida
  // yoziladi — shunda backend chegirmali `sumMinor`'ni saqlaydi va chek «Chegirma»
  // qatorini ko'rsata oladi (aks holda chegirma faqat ekranda qolib, yo'qolardi).
  const positions = () =>
    cart.map((l) => ({
      productId: l.productId,
      quantity: String(l.quantity),
      priceMinor: l.priceMinor.toString(),
      discount: discountPct > 0 ? String(discountPct) : '0',
    }));

  const onSold = (saleId: string) => {
    setPayingSale(null);
    setCheckoutOpen(false);
    qc.invalidateQueries({ queryKey: ['cashier-session-current'] });
    qc.invalidateQueries({ queryKey: ['products-sotuv'] });
    qc.invalidateQueries({ queryKey: ['retail-sales-session', session.id] });
    qc.invalidateQueries({ queryKey: ['retail-sales-ready', session.id] });
    qc.invalidateQueries({ queryKey: ['retail-sales-picking', session.id] });
    toast.success(t('success_sold'));
    void printCustomerReceipt(saleId);
  };

  // Print the customer receipt straight to the configured receipt printer via
  // the local agent (one action, correct thermal size — like the omborchi
  // sheet). Falls back to the browser popup when the agent/printer isn't set up.
  const printCustomerReceipt = useCallback(
    async (saleId: string) => {
      const outcome = await printReceiptViaAgent(saleId);
      if (!outcome.handled) {
        window.open(
          `/print/retail-sale/${saleId}?auto=1`,
          '_blank',
          'width=420,height=680,noopener',
        );
      } else if (!outcome.ok) {
        toast.error('Chek chiqmadi — printerni tekshiring');
      }
    },
    [toast],
  );

  // When omborchi marks a sale "Tayyor", the kassir pulls it into the cart:
  // its positions load into the Savat view (read-only echo) and the payment
  // sheet opens against that existing ready sale.
  const loadReadyToCart = useCallback(
    async (saleId: string) => {
      try {
        const d = await api.get<SaleDetail>(`/retail-sales/${saleId}`);
        setCart(
          d.positions.map((p) => {
            const live = cardPrices(p.product.buyPrice, p.product.salePrices);
            return {
              productId: p.product.id,
              productName: p.product.name,
              quantity: Number(p.quantity),
              priceMinor: BigInt(p.priceMinor),
              priceStr: (Number(p.priceMinor) / 100).toString(),
              availableStock: undefined,
              // A ready receipt is not posted yet, so its own snapshot is still
              // NULL — fall back to the live card. Once a receipt IS posted the
              // frozen value wins, so re-opening it never re-prices history.
              costMinor: toMinorOrNull(p.costMinor) ?? live.costMinor,
              basePriceMinor: toMinorOrNull(p.basePriceMinor) ?? live.basePriceMinor,
              wholesaleMinor: live.wholesaleMinor,
            };
          }),
        );
        setPayingSale({ id: d.id, sumMinor: BigInt(d.sumMinor) });
        setTab('savat');
        setCheckoutOpen(true);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Yuklashda xato');
      }
    },
    [toast, cardPrices],
  );

  // Step 1: "Rasmilashtirish" → create draft → send to picking → print picking sheet
  const sendToPickingMut = useMutation({
    mutationFn: async () => {
      const draft = await api.post<{ id: string }>('/retail-sales', {
        sessionId: session.id,
        positions: positions(),
      });
      await api.post(`/retail-sales/${draft.id}/send-to-picking`, {});
      return draft.id;
    },
    onSuccess: async (saleId) => {
      setCart([]);
      setDiscountPct(0);
      setDiscountEditing(false);
      qc.invalidateQueries({ queryKey: ['retail-sales-ready', session.id] });
      qc.invalidateQueries({ queryKey: ['retail-sales-picking', session.id] });
      toast.success('Omborchiga yuborildi');
      // Per-warehouse routing via the local print-agent: each sklad's sheet goes
      // to its own mapped printer (Settings → Sklad-keepers). If the agent isn't
      // running or no printer is mapped, fall back to the browser popup print.
      const outcome = await printPickingViaAgent(saleId);
      if (outcome.handled) {
        if (outcome.printed > 0) {
          toast.success(
            `Chek chiqarildi: ${outcome.printed} ta printer` +
              (outcome.skipped > 0 ? ` (${outcome.skipped} ombor printersiz)` : ''),
          );
        }
        if (outcome.errors > 0)
          toast.error(`${outcome.errors} ta chek chiqmadi — printerni tekshiring`);
      } else {
        window.open(
          `/print/picking/${saleId}?source=retailsale&auto=1`,
          '_blank',
          'width=520,height=800,noopener',
        );
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Yig'ilayotgan / yig'ilgan chekni bekor qilish (mijoz ketib qolsa).
  // Backend `cancel` 2026-08-02 dan `picking`/`ready` ni ham qabul qiladi va
  // omborchining ochiq yig'ish topshiriqlarini yopadi — usiz bunday chek na
  // to'lanardi, na bekor qilinardi (abadiy osilib qolardi).
  const cancelSale = useCallback(
    async (saleId: string, saleName: string) => {
      const ok = await runDestructive({
        title: t('cancel_sale_confirm', { name: saleName }),
        confirmLabel: t('cancel_sale'),
        successMessage: t('cancel_sale_success'),
        run: () => api.post(`/retail-sales/${saleId}/cancel`, {}),
      });
      if (ok) {
        qc.invalidateQueries({ queryKey: ['retail-sales-ready', session.id] });
        qc.invalidateQueries({ queryKey: ['retail-sales-picking', session.id] });
      }
    },
    [runDestructive, qc, session.id, t],
  );

  // Step 2: Pay a ready sale (after omborchi marks tayyor)
  const payReadySaleMut = useMutation({
    mutationFn: async (payment: {
      cashAmountMinor: bigint;
      cardAmountMinor: bigint;
      terminalAmountMinor: bigint;
      debtAmountMinor: bigint;
      agentId?: string;
    }) => {
      if (!payingSale) throw new Error('Sotuv tanlanmagan');
      await api.post(`/retail-sales/${payingSale.id}/post`, {
        cashAmountMinor: payment.cashAmountMinor.toString(),
        cardAmountMinor: payment.cardAmountMinor.toString(),
        terminalAmountMinor: payment.terminalAmountMinor.toString(),
        debtAmountMinor: payment.debtAmountMinor.toString(),
        expectedSumMinor: payingSale.sumMinor.toString(),
        ...(payment.agentId ? { agentId: payment.agentId } : {}),
      });
      return payingSale.id;
    },
    onSuccess: (saleId) => onSold(saleId),
    onError: (e: Error) => toast.error(e.message),
  });

  const drawerMut = useMutation({
    mutationFn: () => {
      if (!(Number(drawerAmount) > 0)) throw new Error("Summa musbat bo'lishi kerak");
      const sumMinor = Money.fromMajor(drawerAmount, tillCurrency).toMinor().toString();
      const path = drawerMode === 'in' ? 'drawer-in' : 'drawer-out';
      return api.post(`/cashier-sessions/${session.id}/${path}`, {
        sumMinor,
        description: drawerComment.trim() || undefined,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cashier-session-current'] });
      setDrawerMode(null);
      setDrawerAmount('');
      setDrawerComment('');
      toast.success(drawerMode === 'in' ? 'Pul kiritildi' : 'Pul chiqarildi');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const closeMut = useMutation({
    mutationFn: () =>
      api.post(`/cashier-sessions/${session.id}/close`, {
        closingCashMinor: Money.fromMajor(closingCash || '0', tillCurrency)
          .toMinor()
          .toString(),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cashier-session-current'] });
      toast.success('Smena yopildi');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="flex flex-1 min-h-0 gap-0 bg-[var(--ms-bg-app)]">
      {/* Left — search + product grid */}
      <div className="flex flex-1 flex-col gap-3 overflow-hidden p-4">
        {/* Session strip */}
        <div className="flex items-center gap-3 rounded-xl border border-[var(--ms-border)] bg-[var(--ms-bg-surface)] px-3 py-2 text-sm">
          <Badge tone="success">{t('shift_open')}</Badge>
          <span className="text-[var(--ms-text-muted)]">
            {session.cashier.name}
            {session.store ? ` · ${session.store.name}` : ''}
          </span>
          <span className="ml-auto font-medium">
            {session.salesCount} · {formatMoney(BigInt(session.salesSumMinor))}
          </span>
          <Button asChild variant="link" className="ml-2 text-xs">
            <a href="/retail">{t('shift_manage')}</a>
          </Button>
        </div>

        {/* Search / barcode */}
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              const first = products?.items?.[0];
              if (first) {
                addToCart(first);
                setSearch('');
              }
            }
          }}
          placeholder={t('search_placeholder')}
          data-test-id="sotuv-search"
          leading={<Search className="h-4 w-4" />}
          className="h-11 rounded-xl text-sm shadow-sm"
        />

        {/* Product grid */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-8 text-center text-[var(--ms-text-muted)] text-sm">
              {t('loading')}
            </div>
          ) : (products?.items.length ?? 0) === 0 ? (
            <div className="p-8 text-center text-[var(--ms-text-muted)] text-sm">
              {t('not_found')}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {products?.items.map((p) => {
                const sale = resolveDefaultSalePrice(p.salePrices);
                const onHand = Number(p.stock?.onHand ?? '0');
                return (
                  <button
                    type="button"
                    key={p.id}
                    onClick={() => addToCart(p)}
                    data-test-id="sotuv-product"
                    className="flex flex-col items-start rounded-xl border border-[var(--ms-border)] bg-[var(--ms-bg-surface)] p-4 text-left shadow-sm transition-colors hover:bg-[var(--ms-bg-hover)]"
                  >
                    <span className="font-medium text-[var(--ms-text-primary)] text-sm">
                      {p.name}
                    </span>
                    <span className="mt-1 font-bold text-[var(--ms-text-destructive)] text-base">
                      {sale != null ? formatMoney(BigInt(sale)) : '—'}
                    </span>
                    <span className="mt-1 text-xs">
                      <span
                        className={
                          onHand <= 0
                            ? 'text-[var(--ms-text-destructive)]'
                            : 'text-[var(--ms-text-muted)]'
                        }
                      >
                        {t('stock')}: {onHand.toLocaleString('uz-UZ')} {t('pieces')}
                      </span>
                      {p.buyPrice != null && (
                        <span
                          data-test-id="sotuv-grid-cost"
                          className="text-[var(--ms-text-muted)]"
                        >
                          {' '}
                          · {t('cost')}: {formatMoney(BigInt(p.buyPrice))}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right — cart (Savat) + Cheklar tabs */}
      <div className="flex w-[600px] shrink-0 flex-col overflow-hidden border-[var(--ms-border)] border-l bg-[var(--ms-bg-surface)]">
        {/* Mijoz-ekran (televizor) boshqaruvi — dasturda ham, brauzerda ham */}
        <div className="flex shrink-0 items-center justify-between border-[var(--ms-border)] border-b px-3 py-1.5">
          <span className="text-[var(--ms-text-muted)] text-xs">🖥 Mijoz ekrani (televizor)</span>
          <button
            type="button"
            onClick={toggleCfd}
            className={`rounded-lg border px-3 py-1 font-medium text-xs transition-colors ${
              cfdOpen
                ? 'border-green-600 bg-green-50 text-green-700 hover:bg-green-100'
                : 'border-[var(--ms-border)] text-[var(--ms-text-muted)] hover:bg-[var(--ms-bg-hover)]'
            }`}
          >
            {cfdOpen ? "🟢 Yoniq — o'chirish" : '📺 Ekranni yoqish'}
          </button>
        </div>
        {/* Tab bar */}
        <div className="flex border-[var(--ms-border)] border-b">
          <button
            type="button"
            onClick={() => setTab('savat')}
            className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition-colors border-b-2 ${
              tab === 'savat'
                ? 'border-[var(--ms-text-brand)] text-[var(--ms-text-brand)]'
                : 'border-transparent text-[var(--ms-text-muted)] hover:text-[var(--ms-text-primary)]'
            }`}
          >
            <ShoppingCart className="h-4 w-4" />
            {t('cart_title')}{' '}
            {cartCount > 0 && (
              <span className="rounded-full bg-[var(--ms-brand)] px-1.5 py-0.5 text-[10px] text-white">
                {cartCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setTab('jarayonda')}
            className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition-colors border-b-2 ${
              tab === 'jarayonda'
                ? 'border-[var(--ms-text-brand)] text-[var(--ms-text-brand)]'
                : 'border-transparent text-[var(--ms-text-muted)] hover:text-[var(--ms-text-primary)]'
            }`}
          >
            <Clock className="h-4 w-4" />
            Jarayonda
            {pickingSales.length > 0 && (
              <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] text-white">
                {pickingSales.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setTab('tayyor')}
            className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition-colors border-b-2 ${
              tab === 'tayyor'
                ? 'border-[var(--ms-text-brand)] text-[var(--ms-text-brand)]'
                : 'border-transparent text-[var(--ms-text-muted)] hover:text-[var(--ms-text-primary)]'
            }`}
          >
            <CheckCircle className="h-4 w-4" />
            Tayyor
            {readySales.length > 0 && (
              <span className="rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] text-white">
                {readySales.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setTab('cheklar')}
            className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition-colors border-b-2 ${
              tab === 'cheklar'
                ? 'border-[var(--ms-text-brand)] text-[var(--ms-text-brand)]'
                : 'border-transparent text-[var(--ms-text-muted)] hover:text-[var(--ms-text-primary)]'
            }`}
          >
            <Receipt className="h-4 w-4" />
            Cheklar
          </button>
          <button
            type="button"
            onClick={() => setTab('smena')}
            className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition-colors border-b-2 ${
              tab === 'smena'
                ? 'border-[var(--ms-text-brand)] text-[var(--ms-text-brand)]'
                : 'border-transparent text-[var(--ms-text-muted)] hover:text-[var(--ms-text-primary)]'
            }`}
          >
            <Settings className="h-4 w-4" />
            Smena
          </button>
        </div>

        {/* ── JARAYONDA TAB ── omborchi hozir yig'ayotgan savdolar ── */}
        {tab === 'jarayonda' && (
          <div className="flex-1 overflow-y-auto p-3">
            {pickingSales.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-[var(--ms-text-muted)]">
                <Clock className="h-10 w-10 opacity-30" />
                <p className="text-sm">Hozircha jarayonda savdo yo'q</p>
                <p className="text-xs">
                  Savatni rasmiylashtirsangiz, omborchi yig'ishi shu yerda ko'rinadi
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {/* Yig'ilmoqda (picking) */}
                {pickingSales.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-amber-600">
                      Yig'ilmoqda — omborchida
                    </p>
                    <div className="flex flex-col gap-1.5">
                      {pickingSales.map((s) => (
                        <div
                          key={s.id}
                          className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2"
                        >
                          <Clock className="h-4 w-4 shrink-0 animate-pulse text-amber-500" />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-semibold text-[var(--ms-text-primary)]">
                              {s.name}
                            </div>
                            <div className="text-xs text-[var(--ms-text-muted)]">
                              {formatMoney(BigInt(s.sumMinor))}
                              {s._count?.positions != null &&
                                ` · ${s._count.positions} ta pozitsiya`}
                            </div>
                          </div>
                          <span className="shrink-0 rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                            Omborchi yig'moqda
                          </span>
                          <button
                            type="button"
                            onClick={() => cancelSale(s.id, s.name)}
                            className="flex h-8 shrink-0 items-center rounded-lg border border-amber-300 px-3 text-xs font-semibold text-amber-800 transition-all hover:bg-amber-100 active:scale-95"
                          >
                            {t('cancel_sale')}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── TAYYOR TAB ── omborchi yig'ib bo'lgan, to'lov kutayotgan savdolar ── */}
        {tab === 'tayyor' && (
          <div className="flex-1 overflow-y-auto p-3">
            {readySales.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-[var(--ms-text-muted)]">
                <CheckCircle className="h-10 w-10 opacity-30" />
                <p className="text-sm">Tayyor savdo yo'q</p>
                <p className="text-xs">
                  Omborchi yig'ib bo'lgan savdolar shu yerda to'lovni kutadi
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {readySales.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2.5"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100">
                      <CheckCircle className="h-4 w-4 text-emerald-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-[var(--ms-text-primary)]">
                        {s.name}
                      </div>
                      <div className="text-xs text-[var(--ms-text-muted)]">
                        {formatMoney(BigInt(s.sumMinor))}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => cancelSale(s.id, s.name)}
                      className="flex h-9 shrink-0 items-center rounded-lg border border-emerald-300 px-3 text-xs font-semibold text-emerald-800 transition-all hover:bg-emerald-100 active:scale-95"
                    >
                      {t('cancel_sale')}
                    </button>
                    <button
                      type="button"
                      onClick={() => loadReadyToCart(s.id)}
                      className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-emerald-500 px-4 text-sm font-bold text-white transition-all hover:bg-emerald-600 active:scale-95"
                    >
                      💳 To'lov
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── CHEKLAR TAB ── */}
        {tab === 'cheklar' && !selectedChekId && (
          <div className="flex-1 overflow-y-auto">
            {!cheklar || cheklar.items.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-1 text-[var(--ms-text-muted)]">
                <Receipt className="h-8 w-8 opacity-40" />
                <span className="text-sm">Bu smenada hali sotuv yo'q</span>
              </div>
            ) : (
              <div className="flex flex-col divide-y divide-[var(--ms-border)]">
                {cheklar.items.map((sale, i) => (
                  <button
                    type="button"
                    key={sale.id}
                    onClick={() => setSelectedChekId(sale.id)}
                    className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-[var(--ms-bg-hover)] active:bg-[var(--ms-bg-hover)]"
                  >
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--ms-bg-app)] text-xs font-medium text-[var(--ms-text-muted)]">
                      {cheklar.items.length - i}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-[var(--ms-text-primary)]">
                          {formatMoney(BigInt(sale.sumMinor))}
                        </span>
                        <span className="shrink-0 text-xs text-[var(--ms-text-muted)]">
                          {new Date(sale.moment).toLocaleTimeString('uz-UZ', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-[var(--ms-text-muted)]">
                        <span>{sale.session.cashier.name}</span>
                        {sale.agent && (
                          <>
                            <span>·</span>
                            <User className="h-3 w-3" />
                            <span>{sale.agent.name}</span>
                          </>
                        )}
                        {sale._count && (
                          <>
                            <span>·</span>
                            <span>{sale._count.positions} tovar</span>
                          </>
                        )}
                      </div>
                    </div>
                    <span className="shrink-0 text-xs text-[var(--ms-text-muted)]">›</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── CHEK DETAIL ── */}
        {tab === 'cheklar' && selectedChekId && (
          <ChekDetailPanel saleId={selectedChekId} onBack={() => setSelectedChekId(null)} />
        )}

        {/* ── SMENA TAB ── */}
        {tab === 'smena' && (
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
            {/* Session info */}
            <div className="rounded-xl border border-[var(--ms-border)] bg-[var(--ms-bg-app)] px-4 py-3 text-sm">
              <div className="flex justify-between mb-1">
                <span className="text-[var(--ms-text-muted)]">Kassir</span>
                <span className="font-medium">{session.cashier.name}</span>
              </div>
              {session.store && (
                <div className="flex justify-between mb-1">
                  <span className="text-[var(--ms-text-muted)]">Ombor</span>
                  <span className="font-medium">{session.store.name}</span>
                </div>
              )}
              {session.cashDesk && (
                <div className="flex justify-between mb-1">
                  <span className="text-[var(--ms-text-muted)]">Kassa</span>
                  <span className="font-medium">{session.cashDesk.name}</span>
                </div>
              )}
              <div className="flex justify-between mb-1">
                <span className="text-[var(--ms-text-muted)]">Ochilgan</span>
                <span className="font-medium tabular-nums">
                  {new Date(session.openedAt).toLocaleTimeString('uz-UZ', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--ms-text-muted)]">Sotuvlar</span>
                <span className="font-medium tabular-nums">
                  {session.salesCount} ta · {formatMoney(BigInt(session.salesSumMinor))}
                </span>
              </div>
            </div>

            {/* Z-hisobot link */}
            <a
              href={`/retail/sessions/${session.id}`}
              className="flex items-center justify-between rounded-xl border border-[var(--ms-border)] bg-[var(--ms-bg-surface)] px-4 py-3 text-sm font-medium text-[var(--ms-text-primary)] hover:bg-[var(--ms-bg-hover)]"
            >
              <span>Z-hisobot</span>
              <span className="text-[var(--ms-text-muted)]">→</span>
            </a>

            {/* Drawer — Внесение / Изъятие */}
            <div className="rounded-xl border border-[var(--ms-border)] bg-[var(--ms-bg-surface)] p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-[var(--ms-text-muted)]">
                Kassa operatsiyasi
              </p>
              <div className="mb-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setDrawerMode(drawerMode === 'in' ? null : 'in')}
                  className={`flex-1 rounded-lg border py-2 text-sm font-medium transition-colors ${
                    drawerMode === 'in'
                      ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
                      : 'border-[var(--ms-border)] text-[var(--ms-text-muted)] hover:bg-[var(--ms-bg-hover)]'
                  }`}
                >
                  + Kirim
                </button>
                <button
                  type="button"
                  onClick={() => setDrawerMode(drawerMode === 'out' ? null : 'out')}
                  className={`flex-1 rounded-lg border py-2 text-sm font-medium transition-colors ${
                    drawerMode === 'out'
                      ? 'border-orange-400 bg-orange-50 text-orange-700'
                      : 'border-[var(--ms-border)] text-[var(--ms-text-muted)] hover:bg-[var(--ms-bg-hover)]'
                  }`}
                >
                  − Chiqim
                </button>
              </div>
              {drawerMode && (
                <div className="flex flex-col gap-2">
                  <input
                    type="number"
                    min="0"
                    inputMode="decimal"
                    value={drawerAmount}
                    onChange={(e) => setDrawerAmount(e.target.value)}
                    placeholder="Summa (so'm)"
                    // biome-ignore lint/a11y/noAutofocus: intentional POS focus — cashier types the amount immediately when this drawer opens.
                    autoFocus
                    className="h-10 w-full rounded-lg border border-[var(--ms-border)] bg-[var(--ms-bg-input)] px-3 text-sm focus:outline-none focus:border-[var(--ms-border-focus)]"
                  />
                  <input
                    type="text"
                    value={drawerComment}
                    onChange={(e) => setDrawerComment(e.target.value)}
                    placeholder="Izoh (ixtiyoriy)"
                    className="h-10 w-full rounded-lg border border-[var(--ms-border)] bg-[var(--ms-bg-input)] px-3 text-sm focus:outline-none focus:border-[var(--ms-border-focus)]"
                  />
                  <button
                    type="button"
                    onClick={() => drawerMut.mutate()}
                    disabled={drawerMut.isPending || !(Number(drawerAmount) > 0)}
                    className={`h-10 w-full rounded-lg font-semibold text-sm text-white disabled:opacity-40 ${
                      drawerMode === 'in'
                        ? 'bg-emerald-500 hover:bg-emerald-600'
                        : 'bg-orange-500 hover:bg-orange-600'
                    }`}
                  >
                    {drawerMut.isPending
                      ? '...'
                      : drawerMode === 'in'
                        ? 'Kirim tasdiqlash'
                        : 'Chiqim tasdiqlash'}
                  </button>
                </div>
              )}
            </div>

            {/* Close shift */}
            <div className="rounded-xl border border-red-200 bg-[var(--ms-bg-surface)] p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-[var(--ms-text-muted)]">
                Smena yopish
              </p>
              {!showCloseForm ? (
                <button
                  type="button"
                  onClick={() => setShowCloseForm(true)}
                  className="w-full rounded-lg border border-red-300 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                >
                  Smenani yopish
                </button>
              ) : (
                <div className="flex flex-col gap-2">
                  <input
                    type="number"
                    min="0"
                    value={closingCash}
                    onChange={(e) => setClosingCash(e.target.value)}
                    placeholder="Kassadagi naqd pul (so'm)"
                    // biome-ignore lint/a11y/noAutofocus: intentional POS focus — cashier enters the closing cash count immediately when this dialog opens.
                    autoFocus
                    className="h-10 w-full rounded-lg border border-[var(--ms-border)] bg-[var(--ms-bg-input)] px-3 text-sm focus:outline-none focus:border-[var(--ms-border-focus)]"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => closeMut.mutate()}
                      disabled={closeMut.isPending}
                      className="flex-1 h-10 rounded-lg bg-red-600 font-semibold text-sm text-white hover:bg-red-700 disabled:opacity-40"
                    >
                      {closeMut.isPending ? 'Yopilmoqda...' : 'Tasdiqlash'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowCloseForm(false);
                        setClosingCash('');
                      }}
                      className="h-10 rounded-lg border border-[var(--ms-border)] px-4 text-sm text-[var(--ms-text-muted)] hover:bg-[var(--ms-bg-hover)]"
                    >
                      Bekor
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── SAVAT TAB ── */}
        {tab === 'savat' && (
          <>
            <div className="flex shrink-0 items-center gap-2 border-[var(--ms-border)] border-b px-4 py-2">
              <span className="text-sm text-[var(--ms-text-muted)]">Savat</span>
              {cart.length > 0 && (
                <Button
                  variant="link"
                  className="ml-auto text-xs"
                  onClick={() => setCart([])}
                  data-test-id="sotuv-cart-clear"
                >
                  {t('clear')}
                </Button>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {cart.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-1 text-[var(--ms-text-muted)]">
                  <ShoppingCart className="h-8 w-8 opacity-40" />
                  <span className="font-medium text-sm">{t('cart_empty_title')}</span>
                  <span className="text-xs">{t('cart_empty_hint')}</span>
                </div>
              ) : (
                <div className="flex flex-col divide-y divide-[var(--ms-border)]">
                  {cart.map((line) => {
                    // Kassa TZ §5.2 — the row's own profit is taken at the price
                    // the cashier typed (the cart-level discount is a separate,
                    // footer-level figure), so editing the price moves this number
                    // immediately and visibly.
                    const band = classifyPrice({
                      priceMinor: line.priceMinor,
                      costMinor: line.costMinor,
                      wholesaleMinor: line.wholesaleMinor,
                    });
                    const qty = BigInt(line.quantity);
                    const lineRevenue = line.priceMinor * qty;
                    const lineProfit = lineProfitMinor({
                      priceMinor: line.priceMinor,
                      costMinor: line.costMinor,
                      quantity: qty,
                    });
                    const linePct = marginPercent(lineProfit, lineRevenue);
                    // «Kassir qancha tushirib berdi» (kassa TZ §5.3) — shown only
                    // when the cashier actually went below the card price; a sale
                    // at or above it needs no annotation.
                    const markdown = markdownMinor({
                      basePriceMinor: line.basePriceMinor,
                      priceMinor: line.priceMinor,
                      quantity: qty,
                    });
                    return (
                      <div
                        key={line.productId}
                        data-test-id="sotuv-cart-line"
                        data-price-band={band}
                        className={`px-3 py-2 ${
                          band === 'loss'
                            ? 'bg-red-50 hover:bg-red-100'
                            : band === 'below-wholesale'
                              ? 'bg-amber-50 hover:bg-amber-100'
                              : 'hover:bg-[var(--ms-bg-hover)]'
                        }`}
                      >
                        {/* Qator 1: Nom + soni + o'chirish */}
                        <div className="flex items-center gap-2">
                          <div className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--ms-text-primary)]">
                            {line.productName}
                          </div>
                          {/* Soni */}
                          <div className="flex shrink-0 items-center gap-0.5">
                            <button
                              type="button"
                              onClick={() => updateQty(line.productId, -1)}
                              className="flex h-6 w-6 items-center justify-center rounded border border-[var(--ms-border)] bg-[var(--ms-bg-input)] text-sm leading-none hover:bg-[var(--ms-bg-hover)]"
                            >
                              −
                            </button>
                            <span className="w-8 text-center text-sm tabular-nums">
                              {line.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => updateQty(line.productId, 1)}
                              className="flex h-6 w-6 items-center justify-center rounded border border-[var(--ms-border)] bg-[var(--ms-bg-input)] text-sm leading-none hover:bg-[var(--ms-bg-hover)]"
                            >
                              +
                            </button>
                          </div>
                          {/* O'chirish */}
                          <button
                            type="button"
                            onClick={() => removeFromCart(line.productId)}
                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--ms-text-muted)] text-xs hover:bg-red-50 hover:text-red-500"
                          >
                            ✕
                          </button>
                        </div>

                        {/* Qator 2: Qolgan · Tan · Min + narx input + summa */}
                        <div className="mt-1.5 flex items-center gap-3">
                          {/* Qolgan · Tan narx · Optom chegara (kassa TZ §5.2) */}
                          <span className="flex flex-wrap items-center gap-x-1.5 text-xs text-[var(--ms-text-muted)]">
                            {line.availableStock !== undefined && (
                              <span>
                                {t('cart_remaining')}:{' '}
                                <span
                                  className={
                                    line.availableStock <= 0
                                      ? 'text-red-500 font-medium'
                                      : 'tabular-nums'
                                  }
                                >
                                  {line.availableStock}
                                </span>
                              </span>
                            )}
                            <span data-test-id="sotuv-cart-cost">
                              · {t('cart_cost')}:{' '}
                              <span className="tabular-nums">
                                {line.costMinor != null ? formatMoney(line.costMinor) : '—'}
                              </span>
                            </span>
                            {line.wholesaleMinor != null && (
                              <span data-test-id="sotuv-cart-min">
                                · {t('cart_min')}:{' '}
                                <span className="tabular-nums">
                                  {formatMoney(line.wholesaleMinor)}
                                </span>
                              </span>
                            )}
                          </span>
                          <div className="flex flex-1 items-center justify-end gap-2">
                            {/* Narx (tahrir qilsa bo'ladi) */}
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-[var(--ms-text-muted)]">
                                {t('cart_price')}:
                              </span>
                              <input
                                type="text"
                                inputMode="decimal"
                                value={line.priceStr}
                                onChange={(e) => updatePrice(line.productId, e.target.value)}
                                onFocus={(e) => e.target.select()}
                                className="w-24 rounded border border-[var(--ms-border)] bg-[var(--ms-bg-input)] px-1.5 py-0.5 text-right text-sm tabular-nums focus:border-[var(--ms-border-focus)] focus:outline-none"
                              />
                            </div>
                            {/* Summa */}
                            <div className="w-28 text-right text-sm font-semibold tabular-nums text-[var(--ms-text-primary)]">
                              {formatMoney(line.priceMinor * BigInt(line.quantity))}
                            </div>
                          </div>
                        </div>

                        {/* Qator 3: chegara ogohlantirishi + qator foydasi */}
                        <div className="mt-1 flex items-center gap-2 text-xs">
                          {band === 'loss' && (
                            <span
                              data-test-id="sotuv-cart-loss"
                              className="rounded bg-red-600 px-1.5 py-0.5 font-bold text-[10px] text-white uppercase tracking-wide"
                            >
                              {t('cart_loss')}
                            </span>
                          )}
                          {band === 'below-wholesale' && (
                            <span className="rounded bg-amber-500 px-1.5 py-0.5 font-semibold text-[10px] text-white">
                              {t('cart_below_wholesale')}
                            </span>
                          )}
                          {markdown != null && markdown > 0n && (
                            <span
                              data-test-id="sotuv-cart-markdown"
                              className="text-[var(--ms-text-muted)] tabular-nums"
                            >
                              −{formatMoney(markdown)} {t('cart_markdown')}
                            </span>
                          )}
                          <span
                            data-test-id="sotuv-cart-profit"
                            className={`ml-auto tabular-nums ${
                              lineProfit == null
                                ? 'text-[var(--ms-text-muted)]'
                                : lineProfit < 0n
                                  ? 'font-semibold text-red-600'
                                  : 'font-medium text-emerald-600'
                            }`}
                          >
                            {t('cart_profit')}:{' '}
                            {lineProfit == null ? (
                              // Tan narx kartochkada yo'q — «0 foyda» EMAS, «noma'lum».
                              <span title={t('cart_cost_missing')}>—</span>
                            ) : (
                              <>
                                {lineProfit > 0n ? '+' : ''}
                                {formatMoney(lineProfit)}
                                {linePct != null && ` (${linePct.toLocaleString('uz-UZ')}%)`}
                              </>
                            )}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer — mijoz turi + Rasmilashtirish */}
            <div className="shrink-0 border-[var(--ms-border)] border-t bg-[var(--ms-bg-surface)] px-4 pt-4 pb-5">
              {/* Jami summa — ikki marta bosib chegirma */}
              <div className="mb-4 text-center">
                <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-widest text-[var(--ms-text-muted)]">
                  {t('total')}
                </p>

                {/* Summa — ikki marta bosish chegirmani ochadi */}
                <div
                  className="cursor-default select-none"
                  onDoubleClick={() => setDiscountEditing((v) => !v)}
                  title="Chegirma uchun ikki marta bosing"
                >
                  {discountPct > 0 && (
                    <p className="text-sm tabular-nums text-[var(--ms-text-muted)] line-through">
                      {formatMoney(cartTotal)}
                    </p>
                  )}
                  <p
                    className={`font-bold tabular-nums leading-none text-3xl ${discountPct > 0 ? 'text-emerald-600' : 'text-[var(--ms-text-primary)]'}`}
                  >
                    {formatMoney(discountedTotal)}
                  </p>
                  {discountPct > 0 && (
                    <p className="mt-0.5 text-xs font-medium text-emerald-600">
                      −{discountPct}% chegirma
                    </p>
                  )}
                </div>

                {cartCount > 0 && (
                  <p className="mt-1 text-xs text-[var(--ms-text-muted)]">
                    {cartCount} ta mahsulot
                  </p>
                )}

                {/* Chek bo'yicha foyda — kassir bir tovarda yon berib boshqasida
                    qoplayotganini ko'radi (kassa TZ §5.2). */}
                {cartCount > 0 && (
                  <p
                    data-test-id="sotuv-cart-total-profit"
                    className={`mt-1 text-xs tabular-nums ${
                      cartProfitMinor == null
                        ? 'text-[var(--ms-text-muted)]'
                        : cartProfitMinor < 0n
                          ? 'font-semibold text-red-600'
                          : 'font-medium text-emerald-600'
                    }`}
                  >
                    {t('cart_total_profit')}:{' '}
                    {cartProfitMinor == null ? (
                      t('cart_cost_missing')
                    ) : (
                      <>
                        {cartProfitMinor > 0n ? '+' : ''}
                        {formatMoney(cartProfitMinor)}
                        {cartMarginPct != null && ` (${cartMarginPct.toLocaleString('uz-UZ')}%)`}
                      </>
                    )}
                  </p>
                )}

                {/* Inline chegirma input */}
                {discountEditing && (
                  <div className="mt-2 flex items-center justify-center gap-2">
                    <span className="text-xs text-[var(--ms-text-muted)]">Chegirma:</span>
                    <div className="flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        // biome-ignore lint/a11y/noAutofocus: intentional POS focus — cashier types the discount percent immediately when this popover opens.
                        autoFocus
                        value={discountPct === 0 ? '' : discountPct}
                        onChange={(e) =>
                          setDiscountPct(
                            Math.min(100, Math.max(0, Number.parseInt(e.target.value, 10) || 0)),
                          )
                        }
                        onBlur={() => setDiscountEditing(false)}
                        onKeyDown={(e) => e.key === 'Enter' && setDiscountEditing(false)}
                        placeholder="0"
                        className="w-10 bg-transparent text-center text-sm font-bold text-emerald-700 outline-none"
                      />
                      <span className="text-sm font-bold text-emerald-600">%</span>
                    </div>
                    {discountPct > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setDiscountPct(0);
                          setDiscountEditing(false);
                        }}
                        className="text-xs text-[var(--ms-text-muted)] hover:text-red-500"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Omborchiga yuborish */}
              <button
                type="button"
                onClick={() => sendToPickingMut.mutate()}
                disabled={cart.length === 0 || sendToPickingMut.isPending}
                data-test-id="sotuv-pay"
                className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 font-semibold text-base text-white shadow-lg transition-all hover:bg-emerald-600 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {sendToPickingMut.isPending ? (
                  <span className="flex items-center gap-2">
                    <svg
                      className="h-4 w-4 animate-spin"
                      viewBox="0 0 24 24"
                      fill="none"
                      aria-hidden="true"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    Yuborilmoqda...
                  </span>
                ) : (
                  <>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                    Omborchiga yuborish
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>

      <RasmiyashtirishModal
        open={checkoutOpen}
        onOpenChange={(o) => {
          setCheckoutOpen(o);
          if (!o) setPayingSale(null);
        }}
        sumMinor={payingSale ? payingSale.sumMinor : discountedTotal}
        onConfirm={(p) => payReadySaleMut.mutate(p)}
        loading={payReadySaleMut.isPending}
      />
    </div>
  );
}

// ── Root ─────────────────────────────────────────────────────────────────────

export default function SotuvPage() {
  const t = useTranslations('pages.sotuv');
  const tCommon = useTranslations('common');
  const { user } = useAuth();

  const { data: session, isLoading } = useQuery<CurrentSession | null>({
    queryKey: ['cashier-session-current'],
    queryFn: () => api.get<CurrentSession | null>('/cashier-sessions/current'),
    enabled: !!user,
  });

  // DIQQAT: hook erta `return`dan YUQORIDA — pastga qo'yilsa React #310
  // («Rendered more hooks…») butun sahifani yiqitadi (2026-08-01 saboqi).
  const { ref: shellRef, height: shellHeight } = useFillViewport<HTMLDivElement>();

  if (!user || isLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-[var(--ms-text-muted)] text-sm">
        {tCommon('loading')}
      </div>
    );
  }

  if (!session) {
    return (
      <div className="p-4">
        <OpenShiftForm />
      </div>
    );
  }

  return (
    // Balandlik O'LCHANADI, qat'iy raqam emas — `hooks/use-fill-viewport.ts` ga
    // qara. Avval `calc(100dvh-58px)` edi (faqat navbar), climart'da esa subnav
    // ham bor → qobiq ~46px uzun bo'lib JAMI + to'lov tugmasi ekrandan chiqib
    // ketardi.
    <div ref={shellRef} className="flex flex-col" style={{ height: shellHeight }}>
      <div className="shrink-0 border-[var(--ms-border)] border-b px-4 py-2">
        <h1 className="font-semibold text-[var(--ms-text-primary)] text-base">{t('title')}</h1>
      </div>
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <SalesScreen session={session} />
      </div>
    </div>
  );
}
