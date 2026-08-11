'use client';

import { CashOutDialog } from '@/components/pos/cash-out-dialog';
import { DebtPaymentDialog } from '@/components/pos/debt-payment-dialog';
import { RasmiyashtirishModal } from '@/components/pos/rasmilashtirish-modal';
import { useDestructiveMutation } from '@/hooks/use-destructive-mutation';
import { useFillViewport } from '@/hooks/use-fill-viewport';
import { usePermissions } from '@/hooks/use-permissions';
import { api } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';
// B8 — savat matematikasi sof modulda (20 test). Ilgari bu qoidalar shu
// faylda edi va ularni sinash uchun butun POS ekranini render qilish
// kerak bo'lardi, shuning uchun ular umuman sinalmagan edi.
import {
  addQtyDecimal,
  cartCostMinor,
  cartLineMarkdownMinor,
  cartLineProfitMinor,
  cartLineRevenueMinor,
  cartTotalMinor,
  clampReturnQty,
  discountedCartTotalMinor,
  normalizeQtyDecimal,
  refundCashShareMinor,
  refundPayoutMinor,
  revenueBaseMinor,
  saleDebtMinor,
  cartCount as sumCartCount,
  toMinorOrNull,
} from '@/lib/pos/cart-math';
// Smena yopish sanog'i uchun xavfsiz pul-parse (buzuq kiritma → 0n, crash emas).
import { parseAmountToMinor } from '@/lib/pos/parse-amount';
import {
  printPickingViaAgent,
  printReceiptViaAgent,
  printZReportViaAgent,
} from '@/lib/print-agent';
import {
  resolveDefaultSalePrice,
  resolveDefaultSalePriceOrZero,
  resolveWholesaleSalePrice,
  usePriceTypeIds,
} from '@/lib/sale-price';
import { useZReceiptLabels } from '@/lib/use-z-receipt-labels';
import type {
  CurrentSession,
  ListEnvelope as ListResponse,
  PosProductRow as ProductRow,
} from '@moysklad/contracts';
import { Money, classifyPrice, formatPercent, marginPercent } from '@moysklad/money';
import { isCurrencyCode } from '@moysklad/money/currencies';
import { Badge, Button, Input, formatMoney, useConfirm, useToast } from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle,
  ClipboardList,
  Clock,
  Receipt,
  Search,
  Settings,
  ShoppingCart,
  User,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Dollar summani (sentda) ekranga chiqaradi — ishora `$` dan OLDIN: `-$10.00`
 * (K-2 tuzatishi: ilgari `$-10.00` chiqardi va so'm qatoridagi
 * «-5 000,00 сум» bilan boshqacha o'qilardi).
 */
function formatUsd(minor: bigint): string {
  const abs = minor < 0n ? -minor : minor;
  return `${minor < 0n ? '-' : ''}$${(Number(abs) / 100).toFixed(2)}`;
}

// ── Types ──────────────────────────────────────────────────────────────────
//
// The API payload types come from `@moysklad/contracts` (audit `FE-12`). This
// page and `/retail` both hand-declared `CurrentSession` for the SAME endpoint
// and disagreed: here `cashDesk`/`store` were nullable, in `/retail` they were
// required. Ground truth settles it — `CashierSession.cashDeskId`/`.storeId`
// are NOT NULL columns and `findCurrentForCashier` includes both relations
// unconditionally, so they are always present and `/retail` was the accurate
// one. The defensive `?.` reads kept below are now redundant rather than
// load-bearing; they are left in place because removing them changes render
// paths for no behavioural gain.
//
// `CartLine` stays local: it is this page's own UI state, not an API payload.

interface CartLine {
  productId: string;
  productName: string;
  /**
   * Miqdor — **DECIMAL SATR** (`Decimal(20,6)`), `number` EMAS (F8 audit).
   *
   * Server sxemasi `/^\d+(\.\d{1,6})?$/` qabul qiladi, ya'ni og'irlik bilan
   * sotiladigan tovar (yoki zakaz pozitsiyasi) savatga `1.5` bo'lib tushishi
   * MUMKIN. Ilgari bu `number` edi va savat jamisi `BigInt(l.quantity)` bilan
   * hisoblanardi — `BigInt(1.5)` **RangeError** otadi. React render'i ichida
   * otilgan xato butun POS ni OQ EKRANGA aylantiradi: chek ham, pul ham
   * yo'qoladi. Hisob endi `scaleMinorByQty` / `cart-math` orqali — serverning
   * fixed-point yo'li bilan bir xil.
   */
  quantity: string;
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
  const t = useTranslations('pages.sotuv');
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
        {t('loading')}
      </div>
    );
  }

  // Kassirga smena biriktirilmagan
  if (!mine?.smena) {
    return (
      <div className="mx-auto mt-16 max-w-sm rounded-2xl bg-[var(--ms-bg-surface)] p-6 shadow-lg text-center">
        <h2 className="mb-2 font-semibold text-[var(--ms-text-primary)] text-xl">
          {t('shift_none_title')}
        </h2>
        <p className="text-sm text-[var(--ms-text-muted)]">
          {t('shift_none_hint')}
          <br />
          <a
            href="/settings/smena"
            className="text-[var(--ms-text-brand)] underline mt-1 inline-block"
          >
            {t('shift_manage_link')}
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
          <span className="text-[var(--ms-text-muted)]">{t('shift_field')}</span>
          <span className="font-medium">{smena.name}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--ms-text-muted)]">{t('work_time')}</span>
          <span
            className={withinShift ? 'text-green-600 font-medium' : 'text-orange-500 font-medium'}
          >
            {smena.schedule.startTime}–{smena.schedule.endTime}
            {withinShift ? ' ✓' : ` ${t('out_of_hours')}`}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--ms-text-muted)]">{t('organization')}</span>
          <span>{smena.organization.name}</span>
        </div>
      </div>

      {/* Vaqtdan tashqari — sabab so'rash */}
      {showReasonInput && !withinShift && (
        <div className="mb-4">
          <p className="text-sm text-orange-600 mb-2">
            {t('out_of_hours_reason', {
              from: smena.schedule.startTime,
              to: smena.schedule.endTime,
            })}
          </p>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('reason_placeholder')}
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
        {showReasonInput && !withinShift ? t('shift_open_with_reason') : t('shift_open_btn')}
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
  /**
   * Chek QANDAY yopilgani (`RetailSalePayment`). Qaytarishda naqd ulushi
   * shundan chiqadi — qarzga olingan tovar uchun kassa pul olmagan.
   */
  payments?: Array<{ method: string; amountBaseMinor: string }> | null;
  agent: { id: string; name: string } | null;
  session: {
    cashier: { id: string; name: string };
    cashDesk: { name: string; currency: string } | null;
    store: { name: string } | null;
  };
  positions: ChekDetailPosition[];
}

function ChekDetailPanel({ saleId, onBack }: { saleId: string; onBack: () => void }) {
  const t = useTranslations('pages.sotuv');
  const tCommon = useTranslations('common');
  const { data, isLoading } = useQuery<ChekDetailData>({
    queryKey: ['retail-sale-detail', saleId],
    queryFn: () => api.get(`/retail-sales/${saleId}`),
  });

  const qc = useQueryClient();
  const { toast } = useToast();
  const [returnMode, setReturnMode] = useState(false);
  // positionId → qaytariladigan miqdor, **decimal SATR** (defolt — to'liq
  // sotilgan miqdor). FE-02: `number` bo'lganda kassir kasr miqdor kirita
  // olmasdi — «1.» yozilishi bilan nuqta o'chib ketardi, ya'ni og'irlik
  // bilan sotilgan tovarni qisman qaytarib bo'lmasdi.
  const [returnQty, setReturnQty] = useState<Record<string, string>>({});

  const refundMut = useMutation({
    mutationFn: async () => {
      const refundLines = (data?.positions ?? []).filter(
        (p) => normalizeQtyDecimal(returnQty[p.id] ?? '') !== '0',
      );
      if (refundLines.length === 0) throw new Error(t('refund_no_lines'));
      const positions = refundLines.map((p) => ({
        productId: p.product.id,
        // Server sxemasi `^\d+(\.\d{1,6})?$` — «1.» yoki eksponent shakl 400 berardi.
        quantity: normalizeQtyDecimal(returnQty[p.id] ?? ''),
      }));
      // FE-01: naqd asl chekning CHEGIRMALI qator summasidan proporsional —
      // `priceMinor × qty` mijoz to'lamagan pulni qaytarardi. Server ham
      // aynan shu bazadan hisoblaydi va oshib ketsa 400 beradi.
      const refundValue = refundPayoutMinor(
        refundLines.map((p) => ({
          quantity: p.quantity,
          sumMinor: p.sumMinor,
          returnQty: normalizeQtyDecimal(returnQty[p.id] ?? ''),
        })),
      );
      // AUDIT: qarzga sotilgan chekda kassa PUL OLMAGAN — to'liq naqd
      // so'rasak server `moneyMaxMinor` bilan 400 berardi va bunday chekni
      // POS'dan umuman qaytarib bo'lmasdi. Qarz ulushi (`debtReturnMinor`)
      // ATAYLAB yuborilmaydi: server uni o'zi hisoblaydi (auto-split).
      const cashRefund = refundCashShareMinor({
        originalSumMinor: BigInt(data?.sumMinor ?? '0'),
        originalDebtMinor: saleDebtMinor(data?.payments),
        refundSumMinor: refundValue,
      });
      await api.post(`/retail-sales/${saleId}/refund`, {
        positions,
        cashAmountMinor: cashRefund.toString(),
        cardAmountMinor: '0',
        // ⚠️ i18n-emas, ATAYLAB: bu hujjatning DB'da saqlanadigan izohi, ekran
        // matni emas. Kassirning tiliga bog'lasak bir xil hujjat kim yaratganiga
        // qarab turlicha yozilib qolardi (hisobot/qidiruv buziladi).
        description: 'POS qaytarish',
      });
    },
    onSuccess: () => {
      toast.success(t('refund_success'));
      setReturnMode(false);
      setReturnQty({});
      qc.invalidateQueries({ queryKey: ['retail-sale-detail', saleId] });
      qc.invalidateQueries({ queryKey: ['retail-sales-session'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const startReturn = () => {
    setReturnQty(
      Object.fromEntries(
        (data?.positions ?? []).map((p) => [p.id, normalizeQtyDecimal(p.quantity)]),
      ),
    );
    setReturnMode(true);
  };

  if (isLoading || !data) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-[var(--ms-text-muted)]">
        {t('loading')}
      </div>
    );
  }

  const cash = BigInt(data.cashAmountMinor ?? '0');
  const card = BigInt(data.cardAmountMinor ?? '0');
  const terminal = BigInt(data.terminalAmountMinor ?? '0');
  const stateLabel: Record<string, string> = {
    posted: t('state_posted'),
    draft: t('state_draft'),
    picking: t('state_picking'),
    ready: t('state_ready'),
    cancelled: t('state_cancelled'),
    refunded: t('state_refunded'),
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
              toast.error(t('print_error'));
            }
          }}
          className="flex h-8 items-center gap-1.5 rounded-lg border border-[var(--ms-border)] px-3 text-xs font-medium text-[var(--ms-text-muted)] hover:bg-[var(--ms-bg-hover)]"
        >
          🖨 {t('receipt')}
        </button>
        {data.state === 'posted' &&
          (returnMode ? (
            <button
              type="button"
              onClick={() => setReturnMode(false)}
              className="flex h-8 items-center gap-1.5 rounded-lg border border-[var(--ms-border)] px-3 text-xs font-medium text-[var(--ms-text-muted)] hover:bg-[var(--ms-bg-hover)]"
            >
              {tCommon('cancel')}
            </button>
          ) : (
            <button
              type="button"
              onClick={startReturn}
              className="flex h-8 items-center gap-1.5 rounded-lg bg-[var(--ms-destructive-500)] px-3 text-xs font-bold text-white hover:opacity-90"
            >
              ↩ {t('refund')}
            </button>
          ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        {/* Kassir + mijoz */}
        <div className="rounded-xl border border-[var(--ms-border)] bg-[var(--ms-bg-app)] divide-y divide-[var(--ms-border)]">
          <div className="flex justify-between px-4 py-2.5 text-sm">
            <span className="text-[var(--ms-text-muted)]">{t('cashier')}</span>
            <span className="font-medium">{data.session.cashier.name}</span>
          </div>
          {data.session.store && (
            <div className="flex justify-between px-4 py-2.5 text-sm">
              <span className="text-[var(--ms-text-muted)]">{t('shop')}</span>
              <span className="font-medium">{data.session.store.name}</span>
            </div>
          )}
          {data.agent && (
            <div className="flex justify-between px-4 py-2.5 text-sm">
              <span className="text-[var(--ms-text-muted)]">{t('customer')}</span>
              <span className="font-medium text-[var(--ms-text-brand)]">{data.agent.name}</span>
            </div>
          )}
        </div>

        {/* Positions */}
        <div className="rounded-xl border border-[var(--ms-border)] overflow-hidden">
          <div className="bg-[var(--ms-bg-app)] px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-[var(--ms-text-muted)]">
            {t('products')}
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
                    <span className="text-xs text-[var(--ms-text-muted)]">
                      {t('refund_qty_label')}
                    </span>
                    {/* `type="number"` EMAS: brauzer «1.» oraliq holatini
                        bo'sh satr sifatida qaytaradi va kasr miqdorni
                        yozib bo'lmaydi (FE-02). */}
                    <input
                      type="text"
                      inputMode="decimal"
                      value={returnQty[p.id] ?? ''}
                      onChange={(e) =>
                        setReturnQty((prev) => ({
                          ...prev,
                          [p.id]: clampReturnQty(e.target.value, p.quantity),
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
              <span className="text-[var(--ms-text-muted)]">{t('cash')}</span>
              <span className="font-medium tabular-nums">{formatMoney(cash)}</span>
            </div>
          )}
          {card > 0n && (
            <div className="flex justify-between px-4 py-2.5 text-sm">
              <span className="text-[var(--ms-text-muted)]">{t('card')}</span>
              <span className="font-medium tabular-nums">{formatMoney(card)}</span>
            </div>
          )}
          {terminal > 0n && (
            <div className="flex justify-between px-4 py-2.5 text-sm">
              <span className="text-[var(--ms-text-muted)]">{t('terminal')}</span>
              <span className="font-medium tabular-nums">{formatMoney(terminal)}</span>
            </div>
          )}
          <div className="flex justify-between px-4 py-3 text-base font-bold">
            <span>{t('total')}</span>
            <span className="tabular-nums">{formatMoney(BigInt(data.sumMinor))}</span>
          </div>
        </div>
      </div>

      {returnMode && (
        <div className="shrink-0 border-t border-[var(--ms-border)] bg-[var(--ms-bg-surface)] p-4">
          {(() => {
            // Ekranda ko'rinadigan raqam so'rovga ketadigani bilan bir xil
            // formuladan chiqsin (FE-01) — aks holda kassir bir summani
            // ko'rib boshqasini yuborardi.
            const refundValue = refundPayoutMinor(
              data.positions.map((p) => ({
                quantity: p.quantity,
                sumMinor: p.sumMinor,
                returnQty: normalizeQtyDecimal(returnQty[p.id] ?? ''),
              })),
            );
            const saleDebt = saleDebtMinor(data.payments);
            const refundMinor = refundCashShareMinor({
              originalSumMinor: BigInt(data.sumMinor),
              originalDebtMinor: saleDebt,
              refundSumMinor: refundValue,
            });
            // Qarzdan yechiladigan qism — serverning auto-split'i aynan shu
            // qoldiqni yozadi. Kassir mijozga «pulingiz emas, qarzingiz
            // kamayadi» deyishi uchun ekranda ko'rinishi SHART.
            const refundDebtMinor = refundValue - refundMinor;
            return (
              <>
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm text-[var(--ms-text-muted)]">
                    {t('refund_amount_cash')}
                  </span>
                  <span className="font-bold text-lg tabular-nums text-[var(--ms-destructive-500)]">
                    {formatMoney(refundMinor)}
                  </span>
                </div>
                {saleDebt > 0n && refundDebtMinor > 0n && (
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-sm text-[var(--ms-text-muted)]">
                      {t('refund_amount_debt')}
                    </span>
                    <span className="font-semibold tabular-nums text-[var(--ms-text-primary)]">
                      {formatMoney(refundDebtMinor)}
                    </span>
                  </div>
                )}
                <button
                  type="button"
                  // Qaytariladigan QIYMAT nolga teng bo'lsagina bloklanadi —
                  // to'liq qarzli chekda naqd 0 bo'ladi, lekin qaytarish
                  // O'ZI to'g'ri amal (qarz yechiladi).
                  disabled={refundValue <= 0n || refundMut.isPending}
                  onClick={() => refundMut.mutate()}
                  className="w-full rounded-xl bg-[var(--ms-destructive-500)] py-3 font-bold text-white hover:opacity-90 disabled:opacity-40"
                >
                  {refundMut.isPending ? t('refunding') : `↩ ${t('refund_confirm')}`}
                </button>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}

// ── Zakazlar (F7) ────────────────────────────────────────────────────────────

/**
 * POS'da ko'rinadigan zakaz holatlari — CustomerOrder FSM'ning boshlanish
 * qismi (`customer-order.service.ts#validateTransition`).
 *
 * 🔴 Bu YANGI holat-o'qi EMAS. CustomerOrder'da allaqachon ikkita bor:
 * FSM `state` va tenant sozlaydigan `statusId`. Uchinchisini qo'shish
 * chalkashtirardi, shuning uchun POS mavjud `state` ni o'qiydi va mavjud
 * transition endpointini chaqiradi.
 */
const POS_ORDER_STATES = ['draft', 'confirmed', 'awaiting_payment'] as const;
type PosOrderState = (typeof POS_ORDER_STATES)[number];

interface OrderRow {
  id: string;
  name: string;
  moment: string;
  sumMinor: string;
  state: string;
  agent: { id: string; name: string } | null;
}

interface OrderPosition {
  id: string;
  quantity: string;
  /** Rezerv qilingan miqdor — tasdiqlashdan keyin shu raqam ko'tariladi. */
  reservedQty: string;
  priceMinor: string;
  discount: string;
  product: { id: string; name: string; code: string | null; uom: string | null } | null;
}

interface OrderDetail extends OrderRow {
  positions: OrderPosition[];
}

/**
 * Zakaz detali + `draft → confirmed` tasdiqlash.
 *
 * Tasdiqlash AYNAN `POST /customer-orders/:id/transitions/confirmed` ga
 * boradi — kiosk allowlist'da ochilgan yagona yozuv yo'li. Rezervni FE
 * QO'YMAYDI: server `confirmed` da uni o'zi qo'yadi
 * (`customer-order.service.ts` → `applyReservationInvariant('hold-remaining')`),
 * shuning uchun bu yerda `bulk-reserve` kabi ikkinchi chaqiruv YO'Q.
 */
function ZakazDetailPanel({
  orderId,
  onBack,
  onPay,
  paying,
}: {
  orderId: string;
  onBack: () => void;
  /** F8 — zakazni savatga yuklab chek yaratadi (`SalesScreen` bajaradi). */
  onPay: (order: OrderDetail) => void;
  paying: boolean;
}) {
  const t = useTranslations('pages.sotuv');
  const qc = useQueryClient();
  const { toast } = useToast();
  const { can } = usePermissions();

  const { data, isLoading } = useQuery<OrderDetail>({
    queryKey: ['pos-customer-order', orderId],
    queryFn: () => api.get(`/customer-orders/${orderId}`),
  });

  const confirmMut = useMutation({
    mutationFn: () => api.post(`/customer-orders/${orderId}/transitions/confirmed`, {}),
    onSuccess: () => {
      toast.success(t('orders_confirm_success'));
      qc.invalidateQueries({ queryKey: ['pos-customer-order', orderId] });
      qc.invalidateQueries({ queryKey: ['pos-customer-orders'] });
    },
    // Server xatosi (masalan «O'tkazilmaydi: cancelled → confirmed») kassirga
    // AYNAN ko'rsatiladi — jim yutilsa u tugmani qayta-qayta bosardi.
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !data) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-[var(--ms-text-muted)]">
        {t('loading')}
      </div>
    );
  }

  // Tugma FAQAT `draft` da: qolgan holatlarda server ham rad etadi
  // (`validateTransition`), ya'ni ko'rsatish yolg'on va'da bo'lardi.
  const canConfirm = data.state === 'draft' && can('customerorder', 'approve');
  /**
   * F8 — «To'lash» FAQAT to'lanadigan holatda.
   *
   * Ro'yxat serverdagi `ORDER_PAYABLE_STATES` bilan AYNI: `draft` da rezerv
   * hali tushmagan (avval «Tasdiqlash»), `paid`/`cancelled`/jo'natilganlarda
   * esa server 409/400 beradi. Tugmani ko'rsatib keyin rad etish — yolg'on
   * va'da; lekin bu FAQAT ekran qulfi, haqiqiy himoya serverda va tranzaksiya
   * ichida (`retail-sale.service.post()` → holat-shartli `updateMany`).
   */
  const canPay =
    (data.state === 'confirmed' || data.state === 'awaiting_payment') &&
    can('retailsale', 'create');

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
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
          <div className="truncate text-xs text-[var(--ms-text-muted)]">
            {data.agent?.name ?? t('orders_no_agent')}
            {' · '}
            {t(`orders_filter_${data.state === 'awaiting_payment' ? 'awaiting' : data.state}`, {})}
          </div>
        </div>
        <div className="shrink-0 text-right font-bold tabular-nums text-[var(--ms-text-primary)]">
          {formatMoney(BigInt(data.sumMinor))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <p className="mb-1.5 font-bold text-[10px] text-[var(--ms-text-muted)] uppercase tracking-widest">
          {t('orders_positions')}
        </p>
        <div className="flex flex-col gap-1.5">
          {data.positions.map((p) => (
            <div
              key={p.id}
              className="rounded-xl border border-[var(--ms-border)] bg-[var(--ms-bg-app)] px-3 py-2"
            >
              <div className="truncate font-medium text-[var(--ms-text-primary)] text-sm">
                {p.product?.name ?? '—'}
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-[var(--ms-text-muted)] text-xs">
                <span className="tabular-nums">
                  {normalizeQtyDecimal(p.quantity)} × {formatMoney(BigInt(p.priceMinor))}
                </span>
                <span>·</span>
                {/* Rezerv — F7 ning butun qiymati shu raqamda ko'rinadi:
                    tasdiqlashdan keyin u miqdorga tenglashadi. */}
                <span className="tabular-nums">
                  {t('orders_reserved')}: {normalizeQtyDecimal(p.reservedQty)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {(canConfirm || canPay) && (
        <div className="shrink-0 border-t border-[var(--ms-border)] p-3">
          {canConfirm && (
            <Button
              className="h-12 w-full text-base"
              disabled={confirmMut.isPending}
              onClick={() => confirmMut.mutate()}
            >
              {t('orders_confirm')}
            </Button>
          )}
          {canPay && (
            <Button
              className="h-12 w-full text-base"
              data-test-id="sotuv-order-pay"
              disabled={paying}
              onClick={() => onPay(data)}
            >
              {t('orders_pay')}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Z-hisobot chop etish (F11) ───────────────────────────────────────────────

/**
 * Z-hisobotni chop etish — chek bilan AYNI yo'l: agent/Electron chek
 * printeriga jim bosadi, aks holda brauzer popup'i (`?auto=1`) ochiladi.
 *
 * Ikki chaqiruvchi bor (ochiq smenadagi tugma va yopilgandan keyingi
 * tugma), shuning uchun yo'l bitta hookda — ikki joyda ayri yozilsa,
 * biri fallback'ni unutib qo'yardi.
 */
function usePrintZReport() {
  const t = useTranslations('pages.sotuv');
  const { toast } = useToast();
  const labels = useZReceiptLabels();
  return useCallback(
    async (sessionId: string) => {
      const outcome = await printZReportViaAgent(sessionId, labels);
      if (!outcome.handled) {
        window.open(`/print/z-report/${sessionId}?auto=1`, '_blank', 'width=420,height=760');
        return;
      }
      if (!outcome.ok) toast.error(t('print_error'));
    },
    [labels, toast, t],
  );
}

// ── Sales screen ─────────────────────────────────────────────────────────────

function SalesScreen({
  session,
  onShiftClosed,
}: {
  session: CurrentSession;
  /** Smena yopilgach id'ni yuqoriga uzatadi — ekran «smena ochish»ga
   *  qaytadi va Z-hisobotga yo'l shu id orqali saqlanib qoladi. */
  onShiftClosed: (sessionId: string) => void;
}) {
  const t = useTranslations('pages.sotuv');
  const tCommon = useTranslations('common');
  const qc = useQueryClient();
  const { toast } = useToast();
  const { confirm } = useConfirm();
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

  const printZReport = usePrintZReport();

  const [tab, setTab] = useState<
    'savat' | 'jarayonda' | 'tayyor' | 'zakazlar' | 'cheklar' | 'smena'
  >('savat');
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
        // Miqdor SATR bo'lib ketadi (`Decimal(20,6)`) — mijoz-ekran uni
        // `BigInt()` ga bermasligi kerak edi; `customer-display/page.tsx`
        // shu bilan birga tuzatildi (kasr miqdor u yerda ham RangeError otardi).
        quantity: normalizeQtyDecimal(l.quantity),
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
      toast.error(t('cfd_popup_blocked'));
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
  }, [toast, t]);

  // Smena tab — drawer + close shift
  const tillCurrency = isCurrencyCode(session.cashDesk?.currency)
    ? session.cashDesk!.currency
    : 'UZS';
  const [drawerMode, setDrawerMode] = useState<'in' | 'out' | null>(null);
  const [debtPayOpen, setDebtPayOpen] = useState(false);
  const [cashOutOpen, setCashOutOpen] = useState(false);
  const [drawerAmount, setDrawerAmount] = useState('');
  const [drawerComment, setDrawerComment] = useState('');
  const [closingCash, setClosingCash] = useState('');
  // MK31 — sanalgan DOLLAR (§8.4 «UZS va USD alohida»). Bo'sh satr =
  // «sanalmagan»: server uni `null` deb qabul qiladi va 0 bilan
  // aralashtirmaydi.
  const [closingCashUsd, setClosingCashUsd] = useState('');
  const [showCloseForm, setShowCloseForm] = useState(false);
  const [varianceNote, setVarianceNote] = useState('');

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

  // ── ZAKAZLAR (F7) ──────────────────────────────────────────────────────────
  // Holat filtri SERVERGA ketadi (`state=`), FE saralamaydi: aks holda
  // `limit` chegarasi «yangi» zakazlarni yopiq zakazlar bilan to'ldirib
  // yuborardi va kassir kutayotgan zakazni umuman ko'rmasdi.
  //
  // `storeId` ham SERVER filtri — kassir o'z do'konining zakazini ko'radi.
  const { can: canDo } = usePermissions();
  const canSeeOrders = canDo('customerorder', 'view');
  const [orderState, setOrderState] = useState<PosOrderState>('draft');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  const { data: ordersData } = useQuery<ListResponse<OrderRow>>({
    queryKey: ['pos-customer-orders', orderState, session.store?.id ?? null],
    queryFn: () =>
      api.get(
        `/customer-orders?state=${orderState}&storeId=${session.store?.id ?? ''}&limit=50&sortBy=moment&sortDir=desc`,
      ),
    enabled: tab === 'zakazlar' && canSeeOrders,
  });
  const orders = ordersData?.items ?? [];

  // Ready sale selected for payment
  const [payingSale, setPayingSale] = useState<{ id: string; sumMinor: bigint } | null>(null);
  /**
   * F8 — savat AYNAN shu zakazni yopmoqda.
   *
   * Bu bo'sh bo'lmasa savat QULFLANADI (narx/miqdor tahriri va qator o'chirish
   * yo'q). Sabab: chek serverda zakazga bog'lanadi va CHEK SUMMASI zakazga
   * to'lov sifatida tushadi (`CustomerOrderService.applyPayment`). Kassir
   * narxni tushirsa yoki qator o'chirsa, zakaz JIMGINA «to'liq to'lanmagan»
   * bo'lib qolardi: pul olingan, tovar ketgan, zakaz esa hamon `confirmed`.
   * Kelishilgan narxni o'zgartirish — zakaz hujjatining ishi, kassaning emas.
   */
  const [payingOrderId, setPayingOrderId] = useState<string | null>(null);
  const cartLocked = payingOrderId != null;

  const cartCount = sumCartCount(cart);
  const cartTotal = cartTotalMinor(cart);
  /**
   * Chegirmali jami — **server formulasi** (AUDIT tuzatishi).
   *
   * Ilgari bu yerda `applyDiscountMinor(cartTotal, discountPct)` turardi:
   * chegirma JAMIga bir marta va pastga yaxlitlab qo'llanardi. Server esa
   * har qatorni ALOHIDA half-up yaxlitlaydi (`computePositionTotal`) va
   * `post()` da `expectedSumMinor` ni QAT'IY tenglik bilan tekshiradi.
   * Ikkalasi tiyinda ayriladi — o'lchangan misol: 3 × 115 tiyin, −10% →
   * ekran 311, server 312 (`cart-math.test.ts` da qulflangan). Ya'ni kassir
   * ko'rgan raqam chekdagi raqam emas edi, va chekka o'sha farq bilan
   * yuborilgan `expectedSumMinor` 409 bilan qaytardi.
   */
  const discountedTotal = discountedCartTotalMinor(
    cart.map((l) => ({ quantity: l.quantity, priceMinor: l.priceMinor, discount: discountPct })),
  );

  // Chek bo'yicha foyda (kassa TZ §5.2) — profit is taken off the DISCOUNTED
  // total, since that is the money the till actually receives. `complete` goes
  // false as soon as one line has no cost on its card; the footer then says so
  // instead of showing a total that silently counts that line as pure profit.
  // `cartCostMinor` — `@moysklad/money` dagi `sumCostMinor` ning kasr-miqdorli
  // varianti (u `bigint` miqdor talab qiladi, ya'ni 1.5 kg ni ifodalay olmaydi).
  // `complete` shartnomasi o'zgarmagan: NULL tan narx qo'shilmaydi va jami
  // «to'liq emas» deb belgilanadi (NULL ≠ 0).
  const cartCost = cartCostMinor(cart);
  // Foyda asosi = kassa HAQIQATAN oladigan pul. Mavjud chekni to'layotgan
  // bo'lsak (omborchidan qaytgan «Tayyor» chek) — bu serverning o'z `sumMinor`i,
  // qayta hisoblangan raqam emas: server qator-ba-qator yaxlitlagan, biz esa
  // jamiga foiz qo'llaymiz, ikkalasi tiyinda farq qilishi mumkin.
  const revenueMinor = revenueBaseMinor(payingSale?.sumMinor, discountedTotal);
  const cartProfitMinor = cartCost.complete ? revenueMinor - cartCost.costMinor : null;
  const cartMarginPct = marginPercent(cartProfitMinor, revenueMinor);

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
            l.productId === product.id ? { ...l, quantity: addQtyDecimal(l.quantity, 1) } : l,
          );
        }
        const minor = BigInt(resolveDefaultSalePriceOrZero(product.salePrices, defaultPriceTypeId));
        return [
          ...prev,
          {
            productId: product.id,
            productName: product.name,
            quantity: '1',
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
        .map((l) =>
          l.productId === productId ? { ...l, quantity: addQtyDecimal(l.quantity, delta) } : l,
        )
        // `addQtyDecimal` manfiy natijani `'0'` ga qisadi — 0 li qator olib
        // tashlanadi (avvalgi `quantity > 0` filtri bilan bir xil xulq).
        .filter((l) => l.quantity !== '0'),
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
        // K-3: parse muvaffaqiyatsiz (bo'sh satr, harf) → 0n, ESKI narx EMAS.
        // Ko'ringan narsa = yuboriladigan narsa: maydon bo'sh ko'rinib turib
        // rasmiylashtirishga eski narx ketishi kassirni aldardi. 0 narxli
        // qatorni esa ZARAR tasmasi darhol ko'rsatadi va server ham ushlaydi.
        const minor = !Number.isNaN(num) && num >= 0 ? BigInt(Math.round(num * 100)) : 0n;
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
      quantity: normalizeQtyDecimal(l.quantity),
      priceMinor: l.priceMinor.toString(),
      discount: discountPct > 0 ? String(discountPct) : '0',
    }));

  const onSold = (saleId: string) => {
    setPayingSale(null);
    // F8 — zakaz bog'lanishi ham uziladi, aks holda keyingi savat qulflangan
    // qolardi va zakaz ro'yxati eski holatni ko'rsatardi.
    if (payingOrderId) {
      qc.invalidateQueries({ queryKey: ['pos-customer-orders'] });
      qc.invalidateQueries({ queryKey: ['pos-customer-order', payingOrderId] });
    }
    setPayingOrderId(null);
    setCheckoutOpen(false);
    // «Tayyor» chek to'langach savat va chegirma TOZALANADI — aks holda
    // `loadReadyToCart` yuklagan pozitsiyalar savatda qolib, keyingi
    // «Omborchiga yuborish» xuddi shu chekni DUBLIKAT sotuv qilib yaratardi
    // (solishtir: `sendToPickingMut.onSuccess` ham shunday tozalaydi).
    setCart([]);
    setDiscountPct(0);
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
        toast.error(t('print_error'));
      }
    },
    [toast, t],
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
              // Miqdor SATR bo'lib qoladi — `Number(...)` qilib qaytib
              // `BigInt(...)` ga berish aynan RangeError yo'li edi.
              quantity: normalizeQtyDecimal(String(p.quantity)),
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
        // Saqlangan chegirmani TIKLAYMIZ. Aks holda savat chekni yolg'on
        // ko'rsatadi: qatorlar chegirmasiz narxda qayta yuklanadi-yu, chek esa
        // chegirmali summaga to'lanadi. Brauzer-QA da (2026-08-02) aynan shu
        // ko'rindi — savat «29 000», to'lov oynasi «26 100», va savat foydasi
        // «+4 200» deganda hisobot to'g'ri «+1 300» derdi. Kassir pul olayotgan
        // ondagi foyda raqami noto'g'ri bo'lishi mumkin emas.
        // Savat chegirmasi hamma qatorga BIR XIL foiz sifatida yoziladi
        // (`positions()` shunday yuboradi), shuning uchun qatorlar bir xil
        // bo'lsagina tiklanadi; aralash bo'lsa 0 qoladi va jami — sotuvning
        // o'z `sumMinor`i orqali baribir to'g'ri chiqadi.
        const discounts = new Set(d.positions.map((p) => String(p.discount ?? '0')));
        const uniform = discounts.size === 1 ? Number([...discounts][0]) : Number.NaN;
        setDiscountPct(Number.isFinite(uniform) && uniform > 0 ? uniform : 0);
        setPayingSale({ id: d.id, sumMinor: BigInt(d.sumMinor) });
        setTab('savat');
        setCheckoutOpen(true);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t('load_error'));
      }
    },
    [toast, cardPrices, t],
  );

  /**
   * F8 — ZAKAZNI TO'LASH: zakaz → savat → chek (`customerOrderId` bilan) →
   * mavjud to'lov oynasi.
   *
   * Nega chek DARHOL yaratiladi (`send-to-picking` orqali EMAS):
   * `send-to-picking` omborga yig'ish varaqasini chiqaradi va ombor
   * qoldig'iga UMUMAN tegmaydi (`retail-sale.service.sendToPicking` —
   * faqat holat flipi + `RestockTask`). Zakaz esa allaqachon tasdiqlangan va
   * REZERV QILINGAN — tovar band. Ya'ni yig'ish zanjiri bu yerda ikkinchi
   * marta bajariladigan ish bo'lardi. Chek — tovar chiqimi hujjati, va
   * `post()` rezervni o'sha tranzaksiyada yutadi.
   *
   * Chek `draft` holatida yaratiladi va darhol to'lanadi: `post()` FSM'i
   * `draft` dan to'lovni ALLAQACHON qabul qiladi (`allowedFrom('post')`).
   */
  const payOrderMut = useMutation({
    mutationFn: async (order: OrderDetail) => {
      const lines = order.positions.filter((p) => p.product != null);
      if (lines.length === 0) throw new Error(t('orders_pay_no_positions'));
      const sale = await api.post<{ id: string; sumMinor?: string }>('/retail-sales', {
        sessionId: session.id,
        // Mijoz chekka tushadi — qarz/loyalty aynan shu maydondan o'qiydi.
        ...(order.agent ? { agentId: order.agent.id } : {}),
        customerOrderId: order.id,
        positions: lines.map((p) => ({
          // biome-ignore lint/style/noNonNullAssertion: filtered above
          productId: p.product!.id,
          quantity: normalizeQtyDecimal(p.quantity),
          priceMinor: String(p.priceMinor),
          discount: String(p.discount ?? '0'),
        })),
      });
      // Summa SERVERNIKI, zakazniki emas: `post()` `expectedSumMinor` ni
      // chek `sumMinor`i bilan QAT'IY solishtiradi va farq bo'lsa 409 beradi.
      // Server qator-ba-qator yaxlitlaydi — zakaz jamisi bir tiyinga
      // ayrilishi mumkin (aynan shu faza tuzatgan chegirma farqi klassi).
      return { saleId: sale.id, sumMinor: sale.sumMinor ?? order.sumMinor, order, lines };
    },
    onSuccess: ({ saleId, sumMinor, order, lines }) => {
      setCart(
        lines.map((p) => ({
          // biome-ignore lint/style/noNonNullAssertion: filtered above
          productId: p.product!.id,
          // biome-ignore lint/style/noNonNullAssertion: filtered above
          productName: p.product!.name,
          quantity: normalizeQtyDecimal(p.quantity),
          priceMinor: BigInt(p.priceMinor),
          priceStr: (Number(p.priceMinor) / 100).toString(),
          availableStock: undefined,
          // Zakaz pozitsiyasi tovar kartochkasining narx qatlamlarini OLIB
          // KELMAYDI (`/customer-orders/:id` faqat id/nom/kod/uom qaytaradi).
          // NULL — «yig'ilmagan», 0 EMAS: savat «—» ko'rsatadi va foyda
          // hisoblanmaydi. Nolni tan narx deb sanash 100% marja yolg'oni
          // bo'lardi (kassa TZ §5.3).
          costMinor: null,
          wholesaleMinor: null,
          basePriceMinor: null,
        })),
      );
      // Chegirma qator darajasida allaqachon zakazdan ketdi — savat
      // darajasidagi foizni QAYTA qo'llash uni ikki marta hisoblardi.
      setDiscountPct(0);
      setPayingOrderId(order.id);
      setPayingSale({ id: saleId, sumMinor: BigInt(sumMinor) });
      setSelectedOrderId(null);
      setTab('savat');
      setCheckoutOpen(true);
    },
    onError: (e: Error) => toast.error(e.message),
  });

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
      toast.success(t('sent_to_picker'));
      // Per-warehouse routing via the local print-agent: each sklad's sheet goes
      // to its own mapped printer (Settings → Sklad-keepers). If the agent isn't
      // running or no printer is mapped, fall back to the browser popup print.
      const outcome = await printPickingViaAgent(saleId);
      if (outcome.handled) {
        if (outcome.printed > 0) {
          toast.success(
            t('print_ok_count', { printers: outcome.printed }) +
              (outcome.skipped > 0 ? ` ${t('print_skipped_count', { n: outcome.skipped })}` : ''),
          );
        }
        if (outcome.errors > 0) toast.error(t('print_error_count', { n: outcome.errors }));
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

  /**
   * «Jarayonda» dagi chekni kassirning O'ZI tasdiqlashi (`picking → ready`).
   *
   * NEGA KERAK (egasi, 2026-08-11): bu o'tishni faqat omborchi qilardi. Omborchi
   * belgilamasa — masalan tovarni qo'lma-qo'l berib yuborsa yoki ombor terminali
   * band bo'lsa — chek «Jarayonda» da abadiy osilib qolardi: to'lash mumkin
   * emas (to'lov faqat `ready` dan), bekor qilishdan boshqa yo'l yo'q edi.
   *
   * `runDestructive` ATAYLAB ishlatilmadi — u qizil «o'chirish» ohangini
   * majburlaydi va bu ijobiy amal. Lekin tasdiqsiz ham qo'yilmadi: «Bekor
   * qilish» tugmasi yonida turadi va noto'g'ri bosilsa kassir yig'ilmagan
   * tovarga pul olib qo'yardi.
   */
  const markReady = useCallback(
    async (saleId: string, saleName: string) => {
      const ok = await confirm({
        title: t('mark_ready_confirm', { name: saleName }),
        description: t('mark_ready_hint'),
        confirmLabel: t('mark_ready'),
        cancelLabel: tCommon('cancel'),
      });
      if (!ok) return;
      try {
        await api.post(`/retail-sales/${saleId}/mark-ready`, {});
        toast.success(t('mark_ready_success'));
        qc.invalidateQueries({ queryKey: ['retail-sales-ready', session.id] });
        qc.invalidateQueries({ queryKey: ['retail-sales-picking', session.id] });
      } catch (e) {
        // Server rad etsa (masalan omborchi allaqachon holatni o'zgartirgan)
        // xabar KASSIRGA ko'rinsin — jim yutilsa tugma «ishlamayapti» bo'lardi.
        toast.error(e instanceof Error ? e.message : t('mark_ready_error'));
      }
    },
    [confirm, toast, qc, session.id, t, tCommon],
  );

  // Step 2: Pay a ready sale (after omborchi marks tayyor)
  const payReadySaleMut = useMutation({
    mutationFn: async (payment: {
      cashAmountMinor: bigint;
      cardAmountMinor: bigint;
      terminalAmountMinor: bigint;
      debtAmountMinor: bigint;
      cashUsdAmountMinor: bigint;
      usdRateMinor: string | null;
      agentId?: string;
    }) => {
      if (!payingSale) throw new Error(t('no_sale_selected'));
      await api.post(`/retail-sales/${payingSale.id}/post`, {
        cashAmountMinor: payment.cashAmountMinor.toString(),
        cardAmountMinor: payment.cardAmountMinor.toString(),
        terminalAmountMinor: payment.terminalAmountMinor.toString(),
        debtAmountMinor: payment.debtAmountMinor.toString(),
        // MK31 — dollar naqd SENTDA, kurs esa KANONIK ×10^8 satr (oynada
        // serverdan olingan, qayta hisoblanmagan). Ikkalasi FAQAT dollar
        // berilganda qo'shiladi: sxemada ikkisi ham `.default('0')` /
        // `optional`, ya'ni eski payload shakli buzilmaydi.
        ...(payment.cashUsdAmountMinor > 0n && payment.usdRateMinor
          ? {
              cashUsdAmountMinor: payment.cashUsdAmountMinor.toString(),
              usdRateMinor: payment.usdRateMinor,
            }
          : {}),
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
      if (!(Number(drawerAmount) > 0)) throw new Error(t('amount_must_be_positive'));
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
      toast.success(drawerMode === 'in' ? t('drawer_in_done') : t('drawer_out_done'));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /**
   * Kutilgan naqd — smena yopilishidan OLDIN.
   *
   * Server ham hisoblaydi (yagona haqiqat), lekin kassir tasdiqlashdan
   * oldin raqamni ko'rishi kerak: farqni faqat menejer ertaga ko'rsa,
   * sababini hech kim eslamaydi.
   */
  const { data: closePreview } = useQuery<{
    expectedCashMinor: string;
    expectedUsdCashMinor: string;
  }>({
    queryKey: ['z-report-preview', session.id],
    queryFn: () => api.get(`/cashier-sessions/${session.id}/z-report`),
    enabled: showCloseForm,
  });
  const expectedCash = closePreview ? BigInt(closePreview.expectedCashMinor) : null;
  // Sanoq XAVFSIZ parse qilinadi: `type="number"` inputi `e` harfini
  // o'tkazadi («5e3») va `Money.fromMajor` render tanasida otilib butun
  // sahifani yiqitardi. `parseAmountToMinor` buzuq kiritmani 0n deb qaytaradi
  // — kassir farq qatorida darhol ko'radi, crash o'rniga.
  const countedCash =
    closingCash.trim() === '' ? null : parseAmountToMinor(closingCash, tillCurrency);
  const closeVariance =
    expectedCash === null || countedCash === null ? null : countedCash - expectedCash;

  // Dollar maydoni FAQAT smenada dollar oqimi bo'lganda ko'rinadi: dollarsiz
  // kassada u har yopishda ortiqcha savol bo'lardi va kassir uni e'tiborsiz
  // qoldirishga o'rganib qolardi (izoh maydoni bilan bir xil qoida).
  // Oqim bo'lsa server sanoqni MAJBURIY qiladi — maydonsiz yopib bo'lmaydi.
  const expectedCashUsd = closePreview ? BigInt(closePreview.expectedUsdCashMinor) : null;
  const usdInPlay = expectedCashUsd !== null && expectedCashUsd !== 0n;
  // Yuqoridagi so'm sanog'i bilan bir xil sabab: buzuq kiritma → 0n, crash emas.
  const countedCashUsd =
    closingCashUsd.trim() === '' ? null : parseAmountToMinor(closingCashUsd, 'USD');
  const closeVarianceUsd =
    expectedCashUsd === null || countedCashUsd === null ? null : countedCashUsd - expectedCashUsd;

  const closeMut = useMutation({
    mutationFn: () =>
      api.post(`/cashier-sessions/${session.id}/close`, {
        // Ekranda farq qanday sanoqdan hisoblangan bo'lsa, serverga ham AYNAN
        // o'sha qiymat ketadi (bo'sh maydon avvalgidek 0 deb yuboriladi).
        closingCashMinor: (countedCash ?? 0n).toString(),
        // Sanalmagan dollar UZATILMAYDI (0 emas): `null` va `0` server
        // uchun boshqa-boshqa ma'no — «sanalmagan» va «sanadim, yo'q».
        ...(countedCashUsd !== null ? { closingCashUsdMinor: countedCashUsd.toString() } : {}),
        // Farq bo'lsa akt yoziladi va izoh o'sha aktga tushadi (TZ §8.4).
        // Kassir sababni ayni damda yozadi — ertaga eslay olmaydi.
        varianceNote: varianceNote.trim() || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cashier-session-current'] });
      toast.success(
        closeVariance === null || closeVariance === 0n
          ? t('shift_closed')
          : t('shift_closed_with_variance'),
      );
      setVarianceNote('');
      setClosingCashUsd('');
      // Yopilgan smenaning id'si — Z-hisobot chop tugmasi uchun. Ekran shu
      // zahoti «smena ochish» formasiga qaytadi, id esa yuqorida saqlanadi.
      onShiftClosed(session.id);
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
          <span className="text-[var(--ms-text-muted)] text-xs">🖥 {t('cfd_title')}</span>
          <button
            type="button"
            onClick={toggleCfd}
            className={`rounded-lg border px-3 py-1 font-medium text-xs transition-colors ${
              cfdOpen
                ? 'border-green-600 bg-green-50 text-green-700 hover:bg-green-100'
                : 'border-[var(--ms-border)] text-[var(--ms-text-muted)] hover:bg-[var(--ms-bg-hover)]'
            }`}
          >
            {cfdOpen ? `🟢 ${t('cfd_on')}` : `📺 ${t('cfd_off')}`}
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
            {t('tab_in_progress')}
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
            {t('tab_ready')}
            {readySales.length > 0 && (
              <span className="rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] text-white">
                {readySales.length}
              </span>
            )}
          </button>
          {/* ── ZAKAZLAR (F7) ──
              Yorliq `customerorder.view` bo'yicha yashiriladi. Bu FAQAT UX:
              haqiqiy qulf serverda (`KioskGuard` allowlist'i +
              `@RequirePermission`) — «UI yashirish yetarli emas» (TZ §3.1). */}
          {canSeeOrders && (
            <button
              type="button"
              onClick={() => setTab('zakazlar')}
              className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition-colors border-b-2 ${
                tab === 'zakazlar'
                  ? 'border-[var(--ms-text-brand)] text-[var(--ms-text-brand)]'
                  : 'border-transparent text-[var(--ms-text-muted)] hover:text-[var(--ms-text-primary)]'
              }`}
            >
              <ClipboardList className="h-4 w-4" />
              {t('tab_orders')}
            </button>
          )}
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
            {t('tab_receipts')}
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
            {t('tab_shift')}
          </button>
        </div>

        {/* ── JARAYONDA TAB ── omborchi hozir yig'ayotgan savdolar ── */}
        {tab === 'jarayonda' && (
          <div className="flex-1 overflow-y-auto p-3">
            {pickingSales.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-[var(--ms-text-muted)]">
                <Clock className="h-10 w-10 opacity-30" />
                <p className="text-sm">{t('picking_empty_title')}</p>
                <p className="text-xs">{t('picking_empty_hint')}</p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {/* Yig'ilmoqda (picking) */}
                {pickingSales.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-amber-600">
                      {t('picking_section_title')}
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
                                ` · ${t('positions_count', { n: s._count.positions })}`}
                            </div>
                          </div>
                          <span className="shrink-0 rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                            {t('picker_collecting')}
                          </span>
                          <button
                            type="button"
                            onClick={() => cancelSale(s.id, s.name)}
                            className="flex h-8 shrink-0 items-center rounded-lg border border-amber-300 px-3 text-xs font-semibold text-amber-800 transition-all hover:bg-amber-100 active:scale-95"
                          >
                            {t('cancel_sale')}
                          </button>
                          <button
                            type="button"
                            onClick={() => markReady(s.id, s.name)}
                            className="flex h-8 shrink-0 items-center gap-1 rounded-lg bg-amber-500 px-3 text-xs font-bold text-white transition-all hover:bg-amber-600 active:scale-95"
                          >
                            <CheckCircle className="h-3.5 w-3.5" />
                            {t('mark_ready')}
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
                <p className="text-sm">{t('ready_empty_title')}</p>
                <p className="text-xs">{t('ready_empty_hint')}</p>
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
                      💳 {t('pay')}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── ZAKAZLAR TAB ── jarayondagi mijoz zakazlari ── */}
        {tab === 'zakazlar' && !selectedOrderId && (
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Holat filtri — har chip serverga boshqa `state` yuboradi. */}
            <div className="flex shrink-0 gap-1.5 border-[var(--ms-border)] border-b p-2">
              {POS_ORDER_STATES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setOrderState(s)}
                  className={`flex-1 rounded-lg border px-2 py-1.5 font-medium text-xs transition-colors ${
                    orderState === s
                      ? 'border-[var(--ms-brand)] bg-[var(--ms-brand)] text-white'
                      : 'border-[var(--ms-border)] text-[var(--ms-text-muted)] hover:bg-[var(--ms-bg-hover)]'
                  }`}
                >
                  {t(`orders_filter_${s === 'awaiting_payment' ? 'awaiting' : s}`)}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {orders.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-[var(--ms-text-muted)]">
                  <ClipboardList className="h-10 w-10 opacity-30" />
                  <p className="text-sm">{t('orders_empty')}</p>
                  <p className="text-xs">{t('orders_empty_hint')}</p>
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {orders.map((o) => (
                    <button
                      type="button"
                      key={o.id}
                      onClick={() => setSelectedOrderId(o.id)}
                      className="flex items-center gap-2 rounded-xl border border-[var(--ms-border)] bg-[var(--ms-bg-app)] px-3 py-2.5 text-left hover:bg-[var(--ms-bg-hover)]"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold text-[var(--ms-text-primary)] text-sm">
                          {o.name}
                        </div>
                        <div className="truncate text-[var(--ms-text-muted)] text-xs">
                          {o.agent?.name ?? t('orders_no_agent')}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="font-semibold text-[var(--ms-text-primary)] text-sm tabular-nums">
                          {formatMoney(BigInt(o.sumMinor))}
                        </div>
                        <div className="text-[var(--ms-text-muted)] text-xs tabular-nums">
                          {new Date(o.moment).toLocaleDateString('uz-UZ', {
                            day: '2-digit',
                            month: '2-digit',
                          })}
                        </div>
                      </div>
                      <span className="shrink-0 text-[var(--ms-text-muted)] text-xs">›</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── ZAKAZ DETALI ── */}
        {tab === 'zakazlar' && selectedOrderId && (
          <ZakazDetailPanel
            orderId={selectedOrderId}
            onBack={() => setSelectedOrderId(null)}
            onPay={(order) => payOrderMut.mutate(order)}
            paying={payOrderMut.isPending}
          />
        )}

        {/* ── CHEKLAR TAB ── */}
        {tab === 'cheklar' && !selectedChekId && (
          <div className="flex-1 overflow-y-auto">
            {!cheklar || cheklar.items.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-1 text-[var(--ms-text-muted)]">
                <Receipt className="h-8 w-8 opacity-40" />
                <span className="text-sm">{t('receipts_empty')}</span>
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
                        {/* Server include'i buni kafolatlaydi (qo'riqchi:
                            api → retail-sale-list-contract.test.ts), lekin
                            kassir ismi — kosmetik maydon: u yetib kelmasa
                            butun POS ekrani oq bo'lib qolmasin. */}
                        <span>{sale.session.cashier?.name ?? ''}</span>
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
                            <span>{t('items_count', { n: sale._count.positions })}</span>
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
                <span className="text-[var(--ms-text-muted)]">{t('cashier')}</span>
                <span className="font-medium">{session.cashier.name}</span>
              </div>
              {session.store && (
                <div className="flex justify-between mb-1">
                  <span className="text-[var(--ms-text-muted)]">{t('store')}</span>
                  <span className="font-medium">{session.store.name}</span>
                </div>
              )}
              {session.cashDesk && (
                <div className="flex justify-between mb-1">
                  <span className="text-[var(--ms-text-muted)]">{t('cash_desk')}</span>
                  <span className="font-medium">{session.cashDesk.name}</span>
                </div>
              )}
              <div className="flex justify-between mb-1">
                <span className="text-[var(--ms-text-muted)]">{t('opened_at')}</span>
                <span className="font-medium tabular-nums">
                  {new Date(session.openedAt).toLocaleTimeString('uz-UZ', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--ms-text-muted)]">{t('sales')}</span>
                <span className="font-medium tabular-nums">
                  {t('sales_count', { n: session.salesCount })} ·{' '}
                  {formatMoney(BigInt(session.salesSumMinor))}
                </span>
              </div>
            </div>

            {/* Z-hisobot link */}
            <a
              href={`/retail/sessions/${session.id}`}
              className="flex items-center justify-between rounded-xl border border-[var(--ms-border)] bg-[var(--ms-bg-surface)] px-4 py-3 text-sm font-medium text-[var(--ms-text-primary)] hover:bg-[var(--ms-bg-hover)]"
            >
              <span>{t('z_report')}</span>
              <span className="text-[var(--ms-text-muted)]">→</span>
            </a>

            {/* Z-hisobotni chop etish (F11). Ochiq smenada ham ishlaydi —
                server shu holatda sanoq va farqni `null` qaytaradi, chek
                esa ularni «sanalmagan» deb chizadi (nol EMAS). */}
            <button
              type="button"
              onClick={() => void printZReport(session.id)}
              data-test-id="print-z-report"
              className="flex w-full items-center justify-between rounded-xl border border-[var(--ms-border)] bg-[var(--ms-bg-surface)] px-4 py-3 text-left font-medium text-[var(--ms-text-primary)] text-sm hover:bg-[var(--ms-bg-hover)]"
            >
              <span>{t('print_z_report')}</span>
              <span className="text-[var(--ms-text-muted)]">🖨</span>
            </button>

            {/* Drawer — Внесение / Изъятие */}
            <div className="rounded-xl border border-[var(--ms-border)] bg-[var(--ms-bg-surface)] p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-[var(--ms-text-muted)]">
                {t('cash_operation')}
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
                  + {t('drawer_in')}
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
                  − {t('drawer_out')}
                </button>
              </div>
              {/* Qarz to'lovi (kassa TZ §7.2) — naqd bo'lsa shu smenaning
                  «kutilgan naqd»iga kiradi, ya'ni smena yakunida ortiqcha
                  ko'rinmaydi. Shuning uchun u shu yerda, kassa operatsiyalari
                  ichida turadi. */}
              <button
                type="button"
                onClick={() => setDebtPayOpen(true)}
                data-test-id="pos-debt-pay-open"
                className="mb-3 w-full rounded-lg border border-[var(--ms-border)] py-2 text-sm font-medium text-[var(--ms-text-primary)] transition-colors hover:bg-[var(--ms-bg-hover)]"
              >
                {t('debt_payment')}
              </button>
              {/* Xarajat (RKO) va inkassatsiya — kassa TZ §8.2/§8.3. Ikkalasi
                  ham yashiqdan pul chiqaradi, ya'ni smena yakunidagi
                  «kutilgan naqd» shuncha kamayadi. */}
              <button
                type="button"
                onClick={() => setCashOutOpen(true)}
                data-test-id="pos-cash-out-open"
                className="mb-3 w-full rounded-lg border border-[var(--ms-border)] py-2 text-sm font-medium text-[var(--ms-text-primary)] transition-colors hover:bg-[var(--ms-bg-hover)]"
              >
                {t('expense_or_collection')}
              </button>
              {drawerMode && (
                <div className="flex flex-col gap-2">
                  <input
                    type="number"
                    min="0"
                    inputMode="decimal"
                    value={drawerAmount}
                    onChange={(e) => setDrawerAmount(e.target.value)}
                    placeholder={t('amount_placeholder')}
                    // biome-ignore lint/a11y/noAutofocus: intentional POS focus — cashier types the amount immediately when this drawer opens.
                    autoFocus
                    className="h-10 w-full rounded-lg border border-[var(--ms-border)] bg-[var(--ms-bg-input)] px-3 text-sm focus:outline-none focus:border-[var(--ms-border-focus)]"
                  />
                  <input
                    type="text"
                    value={drawerComment}
                    onChange={(e) => setDrawerComment(e.target.value)}
                    placeholder={t('comment_placeholder')}
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
                        ? t('drawer_in_confirm')
                        : t('drawer_out_confirm')}
                  </button>
                </div>
              )}
            </div>

            {/* Close shift */}
            <div className="rounded-xl border border-red-200 bg-[var(--ms-bg-surface)] p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-[var(--ms-text-muted)]">
                {t('shift_close_section')}
              </p>
              {!showCloseForm ? (
                <button
                  type="button"
                  onClick={() => setShowCloseForm(true)}
                  className="w-full rounded-lg border border-red-300 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                >
                  {t('shift_close_btn')}
                </button>
              ) : (
                <div className="flex flex-col gap-2">
                  <input
                    type="number"
                    min="0"
                    value={closingCash}
                    onChange={(e) => setClosingCash(e.target.value)}
                    placeholder={t('closing_cash_placeholder')}
                    // biome-ignore lint/a11y/noAutofocus: intentional POS focus — cashier enters the closing cash count immediately when this dialog opens.
                    autoFocus
                    className="h-10 w-full rounded-lg border border-[var(--ms-border)] bg-[var(--ms-bg-input)] px-3 text-sm focus:outline-none focus:border-[var(--ms-border-focus)]"
                  />

                  {/* MK31 — sanalgan DOLLAR (§8.4). Faqat smenada dollar
                      oqimi bo'lgan holatda; server bu holatda sanoqni
                      MAJBURIY qiladi. */}
                  {usdInPlay && (
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={closingCashUsd}
                      onChange={(e) => setClosingCashUsd(e.target.value)}
                      placeholder={t('closing_cash_usd_placeholder')}
                      data-test-id="close-cash-usd"
                      className="h-10 w-full rounded-lg border border-[var(--ms-border)] bg-[var(--ms-bg-input)] px-3 text-sm focus:outline-none focus:border-[var(--ms-border-focus)]"
                    />
                  )}

                  {/* Kutilgan naqd va farq — TASDIQLASHDAN OLDIN.
                      Kassir raqamni ko'rmasdan yopsa, farqni faqat menejer
                      ertaga ko'radi va sababini hech kim eslamaydi. */}
                  {expectedCash !== null && (
                    <div className="rounded-lg border border-[var(--ms-border)] bg-[var(--ms-bg-input)] px-3 py-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-[var(--ms-text-muted)]">{t('expected_cash')}</span>
                        <span className="font-medium tabular-nums">
                          {formatMoney(expectedCash)}
                        </span>
                      </div>
                      {closeVariance !== null && (
                        <div
                          className={`mt-1 flex justify-between font-semibold ${
                            closeVariance === 0n
                              ? 'text-emerald-700'
                              : closeVariance < 0n
                                ? 'text-red-700'
                                : 'text-amber-700'
                          }`}
                          data-test-id="close-variance"
                        >
                          <span>
                            {closeVariance === 0n
                              ? t('variance_none')
                              : closeVariance < 0n
                                ? t('variance_shortage')
                                : t('variance_surplus')}
                          </span>
                          <span className="tabular-nums">
                            {closeVariance === 0n ? '0' : formatMoney(closeVariance)}
                          </span>
                        </div>
                      )}

                      {/* Dollar qatori — SENTDA, so'mga o'girilmaydi (§8.4).
                          O'girilsa yo'qolgan dollar «taxminiy so'm»ga
                          aylanib, farq dalil bo'lishdan to'xtardi. */}
                      {usdInPlay && expectedCashUsd !== null && (
                        <>
                          <div className="mt-1 flex justify-between border-t border-[var(--ms-border)] pt-1">
                            <span className="text-[var(--ms-text-muted)]">
                              {t('expected_cash_usd')}
                            </span>
                            <span className="font-medium tabular-nums">
                              {formatUsd(expectedCashUsd)}
                            </span>
                          </div>
                          {closeVarianceUsd !== null && (
                            <div
                              className={`mt-1 flex justify-between font-semibold ${
                                closeVarianceUsd === 0n
                                  ? 'text-emerald-700'
                                  : closeVarianceUsd < 0n
                                    ? 'text-red-700'
                                    : 'text-amber-700'
                              }`}
                              data-test-id="close-variance-usd"
                            >
                              <span>
                                {closeVarianceUsd === 0n
                                  ? t('variance_none')
                                  : closeVarianceUsd < 0n
                                    ? t('variance_shortage')
                                    : t('variance_surplus')}
                              </span>
                              <span className="tabular-nums">{formatUsd(closeVarianceUsd)}</span>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {/* Izoh maydoni FAQAT farq bo'lganda: farqsiz smenada u
                      ortiqcha savol bo'lardi va kassir uni e'tiborsiz
                      qoldirishga o'rganib qolardi. */}
                  {((closeVariance !== null && closeVariance !== 0n) ||
                    (closeVarianceUsd !== null && closeVarianceUsd !== 0n)) && (
                    <input
                      type="text"
                      value={varianceNote}
                      onChange={(e) => setVarianceNote(e.target.value)}
                      placeholder={t('variance_note_placeholder')}
                      data-test-id="close-variance-note"
                      className="h-10 w-full rounded-lg border border-amber-300 bg-amber-50 px-3 text-sm focus:outline-none focus:border-amber-500"
                    />
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => closeMut.mutate()}
                      disabled={closeMut.isPending}
                      className="flex-1 h-10 rounded-lg bg-red-600 font-semibold text-sm text-white hover:bg-red-700 disabled:opacity-40"
                    >
                      {closeMut.isPending ? t('closing') : t('confirm')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowCloseForm(false);
                        setClosingCash('');
                        setVarianceNote('');
                      }}
                      className="h-10 rounded-lg border border-[var(--ms-border)] px-4 text-sm text-[var(--ms-text-muted)] hover:bg-[var(--ms-bg-hover)]"
                    >
                      {tCommon('cancel')}
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
              <span className="text-sm text-[var(--ms-text-muted)]">{t('cart_title')}</span>
              {cart.length > 0 && (
                <Button
                  variant="link"
                  className="ml-auto text-xs"
                  onClick={() => {
                    setCart([]);
                    // F8 — savatni tozalash zakaz/chek bog'lanishini ham uzadi:
                    // aks holda bo'sh-u QULFLANGAN savat qolib, kassir undan
                    // chiqolmasdi.
                    setPayingOrderId(null);
                    setPayingSale(null);
                  }}
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
                    // 🔴 Ilgari `BigInt(line.quantity)` edi — kasr miqdorda
                    // RangeError otib butun sahifani oq ekranga aylantirardi.
                    // Formulalar sahifada QAYTA YOZILMAYDI: ular
                    // `lib/pos/cart-math.ts` da, sof va sinalgan holda
                    // (`@moysklad/money` variantlari `bigint` miqdor talab
                    // qiladi, ya'ni 1.5 kg ni ifodalay olmaydi).
                    const qty = normalizeQtyDecimal(line.quantity);
                    const lineRevenue = cartLineRevenueMinor(line);
                    const lineProfit = cartLineProfitMinor(line);
                    const linePct = marginPercent(lineProfit, lineRevenue);
                    // «Kassir qancha tushirib berdi» (kassa TZ §5.3) — shown only
                    // when the cashier actually went below the card price; a sale
                    // at or above it needs no annotation.
                    const markdown = cartLineMarkdownMinor(line);
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
                          {/* Soni — zakazga bog'langan savatda QULFLANGAN */}
                          {cartLocked ? (
                            <span
                              data-test-id="sotuv-cart-qty"
                              className="shrink-0 px-1 text-center text-sm tabular-nums"
                            >
                              {qty}
                            </span>
                          ) : (
                            <div className="flex shrink-0 items-center gap-0.5">
                              <button
                                type="button"
                                onClick={() => updateQty(line.productId, -1)}
                                className="flex h-6 w-6 items-center justify-center rounded border border-[var(--ms-border)] bg-[var(--ms-bg-input)] text-sm leading-none hover:bg-[var(--ms-bg-hover)]"
                              >
                                −
                              </button>
                              <span
                                data-test-id="sotuv-cart-qty"
                                className="w-8 text-center text-sm tabular-nums"
                              >
                                {qty}
                              </span>
                              <button
                                type="button"
                                onClick={() => updateQty(line.productId, 1)}
                                className="flex h-6 w-6 items-center justify-center rounded border border-[var(--ms-border)] bg-[var(--ms-bg-input)] text-sm leading-none hover:bg-[var(--ms-bg-hover)]"
                              >
                                +
                              </button>
                            </div>
                          )}
                          {/* O'chirish */}
                          {!cartLocked && (
                            <button
                              type="button"
                              onClick={() => removeFromCart(line.productId)}
                              className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--ms-text-muted)] text-xs hover:bg-red-50 hover:text-red-500"
                            >
                              ✕
                            </button>
                          )}
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
                              {cartLocked ? (
                                <span className="w-24 text-right text-sm tabular-nums">
                                  {formatMoney(line.priceMinor)}
                                </span>
                              ) : (
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={line.priceStr}
                                  onChange={(e) => updatePrice(line.productId, e.target.value)}
                                  onFocus={(e) => e.target.select()}
                                  className="w-24 rounded border border-[var(--ms-border)] bg-[var(--ms-bg-input)] px-1.5 py-0.5 text-right text-sm tabular-nums focus:border-[var(--ms-border-focus)] focus:outline-none"
                                />
                              )}
                            </div>
                            {/* Summa */}
                            <div className="w-28 text-right text-sm font-semibold tabular-nums text-[var(--ms-text-primary)]">
                              {formatMoney(lineRevenue)}
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
                                {linePct != null && ` (${formatPercent(linePct)})`}
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
                  title={t('discount_dblclick_hint')}
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
                      {t('discount_applied', { pct: discountPct })}
                    </p>
                  )}
                </div>

                {cartCount > 0 && (
                  <p className="mt-1 text-xs text-[var(--ms-text-muted)]">
                    {t('products_count', { n: cartCount })}
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
                        {cartMarginPct != null && ` (${formatPercent(cartMarginPct)})`}
                      </>
                    )}
                  </p>
                )}

                {/* Inline chegirma input */}
                {discountEditing && (
                  <div className="mt-2 flex items-center justify-center gap-2">
                    <span className="text-xs text-[var(--ms-text-muted)]">{t('discount')}:</span>
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
                    {t('sending')}
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
                    {t('send_to_picker')}
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>

      <CashOutDialog
        open={cashOutOpen}
        onOpenChange={setCashOutOpen}
        sessionId={session.id}
        currency={tillCurrency}
        onDone={(doc) => {
          // `CASH_OVERDRAWN` — yashiqda yo'q pul chiqarildi. Server to'xtatmaydi
          // (Q10), lekin kassir buni BILISHI kerak: aks holda farq faqat smena
          // yopilganda chiqib, sababi unutilgan bo'lardi.
          if (doc.auditTypes.includes('CASH_OVERDRAWN')) {
            toast.error(t('cash_overdrawn_warning'));
          } else {
            toast.success(t('document_created', { name: doc.name }));
          }
          window.open(`/print/cash-out/${doc.id}?auto=1`, '_blank');
        }}
      />

      <DebtPaymentDialog
        open={debtPayOpen}
        onOpenChange={setDebtPayOpen}
        sessionId={session.id}
        cashDeskId={session.cashDesk?.id ?? null}
        currency={tillCurrency}
        onPaid={(result) => {
          toast.success(
            result.closedCount > 0
              ? t('debt_paid_with_closed', { n: result.closedCount })
              : t('debt_paid'),
          );
          // PKO cheki — kassa TZ §7.2/5-qadam. Yangi oynada, `auto=1` bilan
          // darhol chop etish dialogi ochiladi (retail-sale cheki bilan bir xil).
          window.open(`/print/debt-payment/${result.batchId}?auto=1`, '_blank');
        }}
      />

      <RasmiyashtirishModal
        open={checkoutOpen}
        onOpenChange={(o) => {
          setCheckoutOpen(o);
          if (!o) {
            setPayingSale(null);
            setPayingOrderId(null);
          }
        }}
        sumMinor={payingSale ? payingSale.sumMinor : discountedTotal}
        currency={tillCurrency}
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
  // F11 — yopilgan smenaning Z-hisobotini chop etish yo'li. Holat AYNAN shu
  // yerda turadi: `SalesScreen` smena yopilishi bilan unmount bo'ladi, ya'ni
  // ichkarida saqlangan id o'sha zahoti yo'qolardi.
  const [closedSessionId, setClosedSessionId] = useState<string | null>(null);
  const printZReport = usePrintZReport();

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
        {/* Endi yopilgan smena — Z-hisobot qog'ozi hali chiqarilmagan
            bo'lishi mumkin. Yo'l shu yerda qoladi, aks holda kassir uni
            faqat `/retail/sessions` ro'yxatidan topardi. */}
        {closedSessionId && (
          <button
            type="button"
            onClick={() => void printZReport(closedSessionId)}
            data-test-id="print-closed-z-report"
            className="mb-3 flex w-full items-center justify-between rounded-xl border border-[var(--ms-border)] bg-[var(--ms-bg-surface)] px-4 py-3 text-left font-medium text-[var(--ms-text-primary)] text-sm hover:bg-[var(--ms-bg-hover)]"
          >
            <span>{t('print_z_report')}</span>
            <span className="text-[var(--ms-text-muted)]">🖨</span>
          </button>
        )}
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
        <SalesScreen session={session} onShiftClosed={setClosedSessionId} />
      </div>
    </div>
  );
}
