'use client';

import { PaymentDialog } from '@/components/pos/payment-dialog';
import { api } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';
import { RETAIL_SESSION_STATE_TONE, documentStateTone } from '@/lib/document-state-tone';
import { discountedCartTotalMinor, discountedLineTotalMinor } from '@/lib/pos/cart-math';
import {
  resolveDefaultSalePrice,
  resolveDefaultSalePriceOrZero,
  usePriceTypeIds,
} from '@/lib/sale-price';
import { normalizeScanInput } from '@/lib/scan';
import type {
  CashDeskRef as CashDesk,
  CurrentSession,
  ListEnvelope as ListResponse,
  OrganizationRef as Organization,
  PosProductRow as ProductRow,
  StoreRef as Store,
} from '@moysklad/contracts';
import { Money } from '@moysklad/money';
import { isCurrencyCode } from '@moysklad/money/currencies';
import { Badge, Button, NativeSelect, formatMoney } from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────
//
// `CashDesk`/`Store`/`Organization`/`CurrentSession`/`ProductRow`/`ListResponse`
// used to be hand-declared here AND, differently, in `/sotuv` — one endpoint,
// two contradictory claims, nothing comparing either to the server (audit
// `FE-12`). They now come from `@moysklad/contracts`, where each key is tied to
// the place in apps/api that produces it. `CartLine` stays local: it is this
// page's own UI state, not an API payload.

interface CartLine {
  productId: string;
  productName: string;
  quantity: number;
  priceMinor: bigint;
  discount: number;
}

// ── Open Shift Form ─────────────────────────────────────────────────────────

function OpenShiftForm({ onOpened }: { onOpened: () => void }) {
  const t = useTranslations('pages.retail');
  const qc = useQueryClient();

  const [cashDeskId, setCashDeskId] = useState('');
  const [storeId, setStoreId] = useState('');
  const [organizationId, setOrganizationId] = useState('');
  const [openingCash, setOpeningCash] = useState('0');
  const [error, setError] = useState<string | null>(null);

  const { data: cashDesks } = useQuery<ListResponse<CashDesk>>({
    queryKey: ['cashdesks'],
    queryFn: () => api.get<ListResponse<CashDesk>>('/cash-desks'),
  });
  const { data: stores } = useQuery<ListResponse<Store>>({
    queryKey: ['stores'],
    queryFn: () => api.get<ListResponse<Store>>('/stores'),
  });
  const { data: orgs } = useQuery<ListResponse<Organization>>({
    queryKey: ['organizations'],
    queryFn: () => api.get<ListResponse<Organization>>('/organizations'),
  });

  const openMut = useMutation({
    mutationFn: (body: object) => api.post('/cashier-sessions/open', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cashier-session-current'] });
      onOpened();
    },
    onError: (e: Error) => setError(e.message),
  });

  const handleSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    setError(null);
    // The opening cash is entered in the SELECTED desk's currency — derive its
    // scale so the major→minor conversion is correct (a hardcoded *100 inflates a
    // JPY-style 0-decimal desk 100×; parseInt silently truncated tiyin from a
    // decimal entry). Mirrors the register drawer + close-shift.
    const deskCurrency = cashDesks?.items.find((d) => d.id === cashDeskId)?.currency;
    const currency = isCurrencyCode(deskCurrency) ? deskCurrency : 'UZS';
    openMut.mutate({
      cashDeskId,
      storeId,
      organizationId,
      openingCashMinor: Money.fromMajor(openingCash || '0', currency)
        .toMinor()
        .toString(),
    });
  };

  return (
    <div className="mx-auto mt-16 max-w-sm rounded-2xl bg-[var(--ms-bg-surface)] p-6 shadow-lg">
      <h2 className="mb-1 font-semibold text-[var(--ms-text-primary)] text-xl">
        {t('open_shift_title')}
      </h2>
      <p className="mb-5 text-[var(--ms-text-muted)] text-sm">{t('no_session_message')}</p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div>
          <span className="mb-1 block text-[var(--ms-text-muted)] text-xs">Kassa</span>
          <NativeSelect required value={cashDeskId} onChange={(e) => setCashDeskId(e.target.value)}>
            <option value="">— tanlang —</option>
            {cashDesks?.items.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div>
          <span className="mb-1 block text-[var(--ms-text-muted)] text-xs">Ombor</span>
          <NativeSelect required value={storeId} onChange={(e) => setStoreId(e.target.value)}>
            <option value="">— tanlang —</option>
            {stores?.items.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div>
          <span className="mb-1 block text-[var(--ms-text-muted)] text-xs">Tashkilot</span>
          <NativeSelect
            required
            value={organizationId}
            onChange={(e) => setOrganizationId(e.target.value)}
          >
            <option value="">— tanlang —</option>
            {orgs?.items.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div>
          <span className="mb-1 block text-[var(--ms-text-muted)] text-xs">
            {t('opening_cash')} (so&apos;m)
          </span>
          <input
            type="number"
            min="0"
            value={openingCash}
            onChange={(e) => setOpeningCash(e.target.value)}
            className="h-9 w-full rounded-lg border border-[var(--ms-border)] bg-[var(--ms-bg-input)] px-3 text-sm"
          />
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-red-600 text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={openMut.isPending}
          className="h-10 rounded-xl bg-[var(--ms-brand)] font-semibold text-sm text-white disabled:opacity-50"
        >
          {openMut.isPending ? 'Ochilmoqda...' : t('open_shift_title')}
        </button>
      </form>
    </div>
  );
}

// ── POS UI ──────────────────────────────────────────────────────────────────

function PosUI({
  session,
  onSessionClosed,
}: { session: CurrentSession; onSessionClosed: () => void }) {
  const t = useTranslations('pages.retail');
  // Tier id for the sale-price resolver — without it it falls back to
  // salePrices[0] (write order), so «Оптовая» can be charged as retail.
  const { defaultId } = usePriceTypeIds();
  // Drawer labels are GROUNDED in the cashier-session detail page (the sibling
  // drawer): drawer_in «Внесение», drawer_out «Выплата», drawer_comment
  // «Комментарий». Reuse them so both drawers stay in lockstep.
  const tSessions = useTranslations('pages.cashier_sessions');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const qc = useQueryClient();

  const [productSearch, setProductSearch] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [postingError, setPostingError] = useState<string | null>(null);
  const [closeError, setCloseError] = useState<string | null>(null);
  const [closingCash, setClosingCash] = useState('');
  const [showCloseForm, setShowCloseForm] = useState(false);
  // Drawer Внесение/Изъятие directly from the till (moysklad parity —
  // cashier shouldn't leave the register). Backend: §101 G1.
  const [drawerMode, setDrawerMode] = useState<'in' | 'out' | null>(null);
  const [drawerAmount, setDrawerAmount] = useState('');
  const [drawerComment, setDrawerComment] = useState('');
  const [drawerError, setDrawerError] = useState<string | null>(null);
  // Till currency — drives Money.fromMajor so the drawer amount is parsed at
  // the cash-desk's scale (mirrors the session-detail drawer; NOT a hardcoded
  // *100 which only works for 2-decimal currencies).
  const tillCurrency = isCurrencyCode(session.cashDesk.currency)
    ? session.cashDesk.currency
    : 'UZS';

  const { data: products } = useQuery<ListResponse<ProductRow>>({
    queryKey: ['products-pos', productSearch],
    // normalizeScanInput: a scanner reading the printed QR types the whole
    // /scan?c=… deep-link — peel the code out so the POS lookup still hits.
    queryFn: () =>
      api.get<ListResponse<ProductRow>>(
        `/products?search=${encodeURIComponent(normalizeScanInput(productSearch))}&limit=20`,
      ),
    enabled: productSearch.length > 0,
  });

  // FE-01: jami SERVER formulasi bilan hisoblanadi (`computePositionTotal`).
  // Ilgari bu yerda float `Math.round(qty * Number(priceMinor) * (1 - d/100))`
  // turardi — server esa `expectedSumMinor` bilan QAT'IY tenglikni tekshiradi
  // va bir tiyinlik farqda chekni rad etardi (115 tiyin, −10%: float 103,
  // server 104).
  const cartTotal = discountedCartTotalMinor(cart);

  const addToCart = useCallback(
    (product: ProductRow) => {
      setCart((prev) => {
        const existing = prev.find((l) => l.productId === product.id);
        if (existing) {
          return prev.map((l) =>
            l.productId === product.id ? { ...l, quantity: l.quantity + 1 } : l,
          );
        }
        return [
          ...prev,
          {
            productId: product.id,
            productName: product.name,
            quantity: 1,
            priceMinor: BigInt(resolveDefaultSalePriceOrZero(product.salePrices, defaultId)),
            discount: 0,
          },
        ];
      });
      setProductSearch('');
      // `defaultId` MUST be a dep: the price-type list resolves asynchronously, so
      // a callback frozen with `defaultId === null` would keep resolving the tier
      // by the salePrices[0] fallback for the rest of the shift.
    },
    [defaultId],
  );

  const updateQty = useCallback((productId: string, delta: number) => {
    setCart((prev) => {
      return prev
        .map((l) => (l.productId === productId ? { ...l, quantity: l.quantity + delta } : l))
        .filter((l) => l.quantity > 0);
    });
  }, []);

  const removeFromCart = useCallback((productId: string) => {
    setCart((prev) => prev.filter((l) => l.productId !== productId));
  }, []);

  const postMut = useMutation({
    mutationFn: async (payment: {
      cashAmountMinor: bigint;
      cardAmountMinor: bigint;
    }) => {
      // 1. Create draft sale
      const draft = await api.post<{ id: string }>('/retail-sales', {
        sessionId: session.id,
        positions: cart.map((l) => ({
          productId: l.productId,
          quantity: String(l.quantity),
          priceMinor: l.priceMinor.toString(),
          discount: String(l.discount),
        })),
      });
      // 2. Post it
      return api.post(`/retail-sales/${draft.id}/post`, {
        cashAmountMinor: payment.cashAmountMinor.toString(),
        cardAmountMinor: payment.cardAmountMinor.toString(),
        expectedSumMinor: cartTotal.toString(),
      });
    },
    onSuccess: () => {
      setCart([]);
      setPaymentOpen(false);
      setPostingError(null);
      qc.invalidateQueries({ queryKey: ['cashier-session-current'] });
    },
    onError: (e: Error) => {
      setPostingError(e.message);
      setPaymentOpen(false);
    },
  });

  const closeMut = useMutation({
    mutationFn: () =>
      api.post(`/cashier-sessions/${session.id}/close`, {
        // Currency-aware major→minor (mirrors the drawer + open-shift): the till
        // scale drives the conversion — NOT a hardcoded *100 (wrong for non-2-decimal
        // currencies) nor parseInt (which silently truncated tiyin from a decimal entry).
        closingCashMinor: Money.fromMajor(closingCash || '0', tillCurrency)
          .toMinor()
          .toString(),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cashier-session-current'] });
      onSessionClosed();
    },
    onError: (e: Error) => setCloseError(e.message),
  });

  const drawerMut = useMutation({
    mutationFn: () => {
      if (!(Number(drawerAmount) > 0)) throw new Error(t('drawer_amount_positive'));
      // Currency-aware major→minor (no IEEE-754 *100 drift, correct scale per
      // currency) — mirrors the session-detail drawer. The Комментарий is
      // optional; the backend DrawerCashSchema already accepts `description`.
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
      setDrawerError(null);
    },
    onError: (e: Error) => setDrawerError(e.message),
  });

  const handlePaymentConfirm = (cashAmountMinor: bigint, cardAmountMinor: bigint) => {
    postMut.mutate({ cashAmountMinor, cardAmountMinor });
  };

  return (
    <div className="flex h-full gap-0 bg-[var(--ms-bg-app)]">
      {/* Left panel — product search + quick grid */}
      <div className="flex flex-1 flex-col gap-4 overflow-hidden p-4">
        {/* Session header */}
        <div className="flex items-center gap-3 rounded-xl border border-[var(--ms-border)] bg-[var(--ms-bg-surface)] px-3 py-2">
          <Badge tone={documentStateTone('open', RETAIL_SESSION_STATE_TONE)}>
            {tSessions('statuses.open')}
          </Badge>
          <span className="text-[var(--ms-text-muted)] text-sm">
            {session.cashier.name} · {session.cashDesk.name} ·{' '}
            {new Date(session.openedAt).toLocaleTimeString('uz-UZ', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
          <span className="ml-auto font-medium text-sm">
            {session.salesCount} ta sotuv · {formatMoney(BigInt(session.salesSumMinor))}
          </span>
          <Button asChild variant="link" className="ml-2 h-auto px-0 text-xs">
            <a href={`/retail/sessions/${session.id}`}>Z-hisobot</a>
          </Button>
          <Button
            type="button"
            variant="link"
            onClick={() => {
              setDrawerMode('in');
              setDrawerError(null);
            }}
            className="ml-2 h-auto px-0 text-xs"
          >
            + {t('drawer_in')}
          </Button>
          <Button
            type="button"
            variant="link"
            onClick={() => {
              setDrawerMode('out');
              setDrawerError(null);
            }}
            className="ml-2 h-auto px-0 text-xs"
          >
            − {t('drawer_out')}
          </Button>
          <Button
            type="button"
            variant="link"
            onClick={() => setShowCloseForm(true)}
            className="ml-2 h-auto px-0 text-[var(--ms-text-destructive)] text-xs"
          >
            {t('close_shift_button')}
          </Button>
        </div>

        {/* Drawer Внесение/Изъятие inline panel (§101 backend) */}
        {drawerMode && (
          <div className="rounded-xl border border-[var(--ms-border)] bg-[var(--ms-bg-surface)] p-4">
            <h3 className="mb-3 font-semibold text-sm">
              {drawerMode === 'in' ? t('drawer_in') : t('drawer_out')}
            </h3>
            <div className="mb-3">
              <span className="mb-1 block text-[var(--ms-text-muted)] text-xs">
                {tFields('sum')}
              </span>
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={drawerAmount}
                onChange={(e) => setDrawerAmount(e.target.value)}
                className="h-9 w-full rounded-lg border border-[var(--ms-border)] bg-[var(--ms-bg-input)] px-3 text-sm"
                data-test-id="register-drawer-amount"
              />
            </div>
            <div className="mb-3">
              <span className="mb-1 block text-[var(--ms-text-muted)] text-xs">
                {tSessions('drawer_comment')}
              </span>
              <input
                type="text"
                value={drawerComment}
                onChange={(e) => setDrawerComment(e.target.value)}
                placeholder={tSessions('drawer_comment')}
                className="h-9 w-full rounded-lg border border-[var(--ms-border)] bg-[var(--ms-bg-input)] px-3 text-sm"
                data-test-id="register-drawer-comment"
              />
            </div>
            {drawerError && (
              <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-2 text-red-600 text-sm">
                {drawerError}
              </div>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => drawerMut.mutate()}
                disabled={drawerMut.isPending || !(Number(drawerAmount) > 0)}
                className="h-9 flex-1 rounded-lg bg-[var(--ms-brand)] font-semibold text-sm text-white disabled:opacity-50"
              >
                {drawerMut.isPending ? '...' : t('drawer_confirm')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setDrawerMode(null);
                  setDrawerAmount('');
                  setDrawerComment('');
                  setDrawerError(null);
                }}
                className="h-9 rounded-lg border border-[var(--ms-border)] px-4 text-sm"
              >
                {tCommon('cancel')}
              </button>
            </div>
          </div>
        )}

        {/* Product search */}
        <div className="relative">
          <input
            type="text"
            value={productSearch}
            onChange={(e) => setProductSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                const first = products?.items?.[0];
                if (first) addToCart(first);
              }
            }}
            placeholder={t('search_product')}
            data-test-id="register-scan-input"
            className="h-11 w-full rounded-xl border border-[var(--ms-border)] bg-[var(--ms-bg-surface)] pr-10 pl-4 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--ms-brand)]"
          />
        </div>

        {/* Search results */}
        {productSearch && products && (
          <div className="max-h-64 overflow-y-auto rounded-xl border border-[var(--ms-border)] bg-[var(--ms-bg-surface)] shadow-lg">
            {products.items.length === 0 ? (
              <div className="p-4 text-center text-[var(--ms-text-muted)] text-sm">Topilmadi</div>
            ) : (
              products.items.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => addToCart(p)}
                  className="flex w-full items-center gap-3 border-[var(--ms-border)] border-b px-4 py-2.5 text-left transition-colors last:border-0 hover:bg-[var(--ms-bg-hover)]"
                >
                  <div>
                    <div className="font-medium text-sm">{p.name}</div>
                    {p.code && <div className="text-[var(--ms-text-muted)] text-xs">{p.code}</div>}
                  </div>
                  {resolveDefaultSalePrice(p.salePrices, defaultId) != null && (
                    <div className="ml-auto font-semibold text-sm tabular-nums">
                      {formatMoney(BigInt(resolveDefaultSalePrice(p.salePrices, defaultId) ?? '0'))}
                    </div>
                  )}
                </button>
              ))
            )}
          </div>
        )}

        {/* Error */}
        {postingError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-600 text-sm">
            {postingError}
          </div>
        )}

        {/* Close shift form */}
        {showCloseForm && (
          <div className="rounded-xl border border-red-200 bg-[var(--ms-bg-surface)] p-4">
            <h3 className="mb-3 font-semibold text-sm">{t('close_shift_button')}</h3>
            <div className="mb-3">
              <span className="mb-1 block text-[var(--ms-text-muted)] text-xs">
                {t('closing_cash')} (so&apos;m)
              </span>
              <input
                type="number"
                min="0"
                value={closingCash}
                onChange={(e) => setClosingCash(e.target.value)}
                className="h-9 w-full rounded-lg border border-[var(--ms-border)] bg-[var(--ms-bg-input)] px-3 text-sm"
              />
            </div>
            {closeError && (
              <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-2 text-red-600 text-sm">
                {closeError}
              </div>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => closeMut.mutate()}
                disabled={closeMut.isPending}
                className="h-9 flex-1 rounded-lg bg-red-600 font-semibold text-sm text-white disabled:opacity-50"
              >
                {closeMut.isPending ? 'Yopilmoqda...' : 'Smenani yopish'}
              </button>
              <button
                type="button"
                onClick={() => setShowCloseForm(false)}
                className="h-9 rounded-lg border border-[var(--ms-border)] px-4 text-sm"
              >
                Bekor
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Right panel — receipt */}
      <div className="flex w-80 flex-col border-[var(--ms-border)] border-l bg-[var(--ms-bg-surface)]">
        {/* Cart items */}
        <div className="flex-1 overflow-y-auto p-3">
          {cart.length === 0 ? (
            <div className="flex h-full items-center justify-center text-[var(--ms-text-muted)] text-sm">
              {t('empty_cart')}
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {cart.map((line) => {
                const lineTotal = discountedLineTotalMinor(line);
                return (
                  <div
                    key={line.productId}
                    className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-[var(--ms-bg-hover)]"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-sm">{line.productName}</div>
                      <div className="text-[var(--ms-text-muted)] text-[12px] tabular-nums">
                        {formatMoney(line.priceMinor)} × {line.quantity}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => updateQty(line.productId, -1)}
                        className="flex h-6 w-6 items-center justify-center rounded-md border border-[var(--ms-border)] bg-[var(--ms-bg-input)] text-sm"
                      >
                        −
                      </button>
                      <span className="w-6 text-center text-sm tabular-nums">{line.quantity}</span>
                      <button
                        type="button"
                        onClick={() => updateQty(line.productId, 1)}
                        className="flex h-6 w-6 items-center justify-center rounded-md border border-[var(--ms-border)] bg-[var(--ms-bg-input)] text-sm"
                      >
                        +
                      </button>
                      <button
                        type="button"
                        onClick={() => removeFromCart(line.productId)}
                        className="ml-1 flex h-6 w-6 items-center justify-center rounded-md text-red-500 text-xs hover:bg-red-50"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="w-20 shrink-0 text-right font-semibold text-sm tabular-nums">
                      {formatMoney(lineTotal)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-[var(--ms-border)] border-t p-3">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[var(--ms-text-muted)] text-sm">{t('total')}</span>
            <span className="font-bold text-xl tabular-nums">{formatMoney(cartTotal)}</span>
          </div>
          <button
            type="button"
            onClick={() => setPaymentOpen(true)}
            disabled={cart.length === 0 || postMut.isPending}
            className="h-12 w-full rounded-xl bg-[var(--ms-brand)] font-semibold text-base text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t('pay_button')}
          </button>
        </div>
      </div>

      <PaymentDialog
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        sumMinor={cartTotal}
        currency={tillCurrency}
        onConfirm={handlePaymentConfirm}
        loading={postMut.isPending}
      />
    </div>
  );
}

// ── Root page ──────────────────────────────────────────────────────────────

export default function RetailPage() {
  const t = useTranslations('pages.retail');
  const tCommon = useTranslations('common');
  const { user } = useAuth();

  const { data: session, isLoading } = useQuery<CurrentSession | null>({
    queryKey: ['cashier-session-current'],
    queryFn: () => api.get<CurrentSession | null>('/cashier-sessions/current'),
    enabled: !!user,
  });

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
        <OpenShiftForm onOpened={() => {}} />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-[var(--ms-border)] border-b px-4 py-2">
        <h1 className="font-semibold text-[var(--ms-text-primary)] text-base">{t('pos_title')}</h1>
      </div>
      <div className="flex-1 overflow-hidden">
        <PosUI session={session} onSessionClosed={() => {}} />
      </div>
    </div>
  );
}
