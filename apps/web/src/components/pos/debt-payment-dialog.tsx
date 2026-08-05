'use client';

import { api } from '@/lib/api-client';
import { Input, formatMoney } from '@moysklad/ui';
import * as Dialog from '@radix-ui/react-dialog';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, CreditCard, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

interface CounterpartyRow {
  id: string;
  name: string;
  phone: string | null;
}

interface DebtRow {
  id: string;
  name: string;
  totalMinor: string;
  paidMinor: string;
  outstandingMinor: string;
  currency: string;
  orderAt: string;
}

interface DebtSummary {
  counterparty: CounterpartyRow;
  outstandingMinor: string;
  openCount: number;
  oldestAt: string | null;
  debts: DebtRow[];
}

interface PayResult {
  batchId: string;
  receipt: {
    batchId: string;
    paidMinor: string;
    currency: string;
    method: string;
    lines: Array<{ debtName: string; amountMinor: string; closed: boolean }>;
    outstandingAfterMinor: string;
  };
  closedCount: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Joriy smena — naqd to'lov shu smenaning «kutilgan naqd»iga kiradi (TZ §8.4). */
  sessionId: string;
  cashDeskId?: string | null;
  onPaid?: (result: PayResult) => void;
}

const NUMPAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', '⌫'];

function toMinor(s: string): bigint {
  const n = Number.parseFloat(s);
  if (!s || !Number.isFinite(n) || n < 0) return 0n;
  return BigInt(Math.round(n * 100));
}

/**
 * tiyin → maydon matni, `Number`SIZ.
 *
 * «Hammasi» tugmasi qarz qoldig'ini AYNAN qo'yishi shart: `Number(bigint)/100`
 * katta summada yaxlitlaydi va to'lov bir tiyinga kam/ko'p ketardi — server esa
 * ortiqchani rad etadi. Shuning uchun konversiya satr ustida bajariladi.
 */
function minorToInput(minor: bigint): string {
  const s = minor.toString().padStart(3, '0');
  const frac = s.slice(-2);
  const int = s.slice(0, -2);
  return frac === '00' ? int : `${int}.${frac}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('uz-UZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** Eng eski qarzdan bugungacha necha kun — kassir «qancha eski» ekanini ko'rsin. */
function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  return ms > 0 ? Math.floor(ms / 86_400_000) : 0;
}

/**
 * POS «Qarz to'lovi» oynasi (kassa TZ §7.2).
 *
 * Kassir mijozni topadi → qoldiqni KO'RADI (jami, eng eski qarz sanasi,
 * qarzlar ro'yxati) → summa kiritadi → tasdiqlaydi. Qaysi `QRZ-` hujjatga
 * tushishini tanlamaydi: server eng eskisidan FIFO bo'yicha taqsimlaydi.
 *
 * NEGA qoldiq ko'rsatiladi: faqat summa maydonini berish kassirni ko'r-ko'rona
 * kiritishga majbur qilardi — mijoz «hammasini yopaman» desa qancha ekanini
 * bilmasdi. «Hammasi» tugmasi ham shuning uchun bor.
 *
 * ⚠️ Ortiqcha to'lovni server RAD etadi (qaytim naqddan beriladi, §6.2), shuning
 * uchun tugma bu yerda ham oldindan bloklanadi — kassir xatoni bosgandan KEYIN
 * emas, OLDIN ko'rsin.
 */
export function DebtPaymentDialog({ open, onOpenChange, sessionId, cashDeskId, onPaid }: Props) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [agent, setAgent] = useState<CounterpartyRow | null>(null);
  const [amountInput, setAmountInput] = useState('');
  const [method, setMethod] = useState<'cash' | 'terminal'>('cash');
  const [error, setError] = useState<string | null>(null);

  const { data: cpData, isLoading: cpLoading } = useQuery<{ items: CounterpartyRow[] }>({
    queryKey: ['cp-debt-search', search],
    queryFn: () => api.get(`/counterparties?search=${encodeURIComponent(search)}&limit=20`),
    enabled: open && !agent,
  });

  const { data: summary, isLoading: sumLoading } = useQuery<DebtSummary>({
    queryKey: ['debt-pos-summary', agent?.id],
    queryFn: () => api.get(`/debts/pos/summary/${agent?.id}`),
    enabled: open && !!agent,
  });

  const outstanding = BigInt(summary?.outstandingMinor ?? '0');
  const amountMinor = toMinor(amountInput);
  const overpay = amountMinor > outstanding ? amountMinor - outstanding : 0n;
  const canConfirm = amountMinor > 0n && overpay === 0n && outstanding > 0n;

  const payMut = useMutation<PayResult>({
    mutationFn: () =>
      api.post<PayResult>('/debts/pos/pay', {
        counterpartyId: agent?.id,
        amountMinor: amountMinor.toString(),
        method,
        cashDeskId: cashDeskId ?? null,
        retailShiftId: sessionId,
      }),
    onSuccess: (result) => {
      // Smena yig'indilari o'zgardi: naqd to'lov «kutilgan naqd»ga kiradi.
      qc.invalidateQueries({ queryKey: ['cashier-session-current'] });
      qc.invalidateQueries({ queryKey: ['debt-pos-summary'] });
      onPaid?.(result);
      onOpenChange(false);
    },
    onError: (e: unknown) => {
      setError(e instanceof Error ? e.message : 'To`lov amalga oshmadi');
    },
  });

  const reset = useCallback(() => {
    setSearch('');
    setAgent(null);
    setAmountInput('');
    setMethod('cash');
    setError(null);
  }, []);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  const handleDigit = useCallback((d: string) => {
    setError(null);
    setAmountInput((prev) => {
      const next = prev + d;
      return next.length > 12 ? prev : next;
    });
  }, []);

  const oldestDays = daysSince(summary?.oldestAt ?? null);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content className="-translate-x-1/2 -translate-y-1/2 fixed top-1/2 left-1/2 z-50 flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-[var(--ms-bg-surface)] shadow-2xl outline-none">
          <div className="flex items-center justify-between border-[var(--ms-border)] border-b px-5 py-3">
            <Dialog.Title className="font-semibold text-[var(--ms-text-primary)] text-lg">
              Qarz to'lovi
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Yopish"
                className="rounded-lg p-1 text-[var(--ms-text-muted)] hover:bg-[var(--ms-bg-hover)]"
              >
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            {/* ── 1-qadam: mijoz ──────────────────────────────────────────── */}
            {!agent ? (
              <div className="flex flex-col gap-3">
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Mijoz ismi yoki telefon…"
                  autoFocus
                />
                {cpLoading && <p className="text-[var(--ms-text-muted)] text-sm">Qidirilmoqda…</p>}
                <div className="flex flex-col gap-1">
                  {(cpData?.items ?? []).map((row) => (
                    <button
                      key={row.id}
                      type="button"
                      onClick={() => setAgent(row)}
                      data-test-id={`debt-pay-cp-${row.id}`}
                      className="flex flex-col rounded-lg border border-[var(--ms-border)] px-3 py-2 text-left transition-colors hover:bg-[var(--ms-bg-hover)]"
                    >
                      <span className="font-medium text-[var(--ms-text-primary)] text-sm">
                        {row.name}
                      </span>
                      {row.phone && (
                        <span className="text-[var(--ms-text-muted)] text-xs">{row.phone}</span>
                      )}
                    </button>
                  ))}
                  {!cpLoading && (cpData?.items ?? []).length === 0 && (
                    <p className="py-6 text-center text-[var(--ms-text-muted)] text-sm">
                      Mijoz topilmadi
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {/* ── 2-qadam: qoldiq konteksti ─────────────────────────────── */}
                <div className="flex items-center justify-between rounded-lg border border-[var(--ms-border)] bg-[var(--ms-bg-input)] px-3 py-2">
                  <div>
                    <div className="font-medium text-[var(--ms-text-primary)] text-sm">
                      {agent.name}
                    </div>
                    {agent.phone && (
                      <div className="text-[var(--ms-text-muted)] text-xs">{agent.phone}</div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setAgent(null);
                      setAmountInput('');
                    }}
                    className="text-[var(--ms-brand)] text-xs hover:underline"
                  >
                    O'zgartirish
                  </button>
                </div>

                {sumLoading ? (
                  <p className="text-[var(--ms-text-muted)] text-sm">Qarz yuklanmoqda…</p>
                ) : outstanding === 0n ? (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-4 text-center">
                    <p className="font-semibold text-emerald-800 text-sm">Qarz yo'q</p>
                    <p className="mt-1 text-emerald-700 text-xs">Bu mijozda ochiq qarz qolmagan.</p>
                  </div>
                ) : (
                  <>
                    <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3">
                      <div className="text-orange-700 text-xs">Jami qarz</div>
                      <div
                        className="font-bold text-2xl text-orange-900 tabular-nums"
                        data-test-id="debt-pay-outstanding"
                      >
                        {formatMoney(outstanding)}
                      </div>
                      <div className="mt-1 text-orange-700 text-xs">
                        {summary?.openCount} ta qarz · eng eskisi{' '}
                        {fmtDate(summary?.oldestAt ?? null)}
                        {oldestDays !== null && oldestDays > 0 && ` (${oldestDays} kun)`}
                      </div>
                    </div>

                    {/* Qarzlar ro'yxati — qaysi biri qachon ochilgani ko'rinsin. */}
                    <div className="flex flex-col gap-1">
                      {(summary?.debts ?? []).map((d) => (
                        <div
                          key={d.id}
                          className="flex items-center justify-between rounded-lg border border-[var(--ms-border)] px-3 py-1.5 text-xs"
                        >
                          <span className="text-[var(--ms-text-muted)]">
                            {d.name} · {fmtDate(d.orderAt)}
                          </span>
                          <span className="font-medium tabular-nums">
                            {formatMoney(BigInt(d.outstandingMinor))}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* ── 3-qadam: to'lov turi ────────────────────────────────── */}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setMethod('cash')}
                        className={`flex flex-1 items-center justify-center gap-2 rounded-lg border py-2 font-medium text-sm transition-colors ${
                          method === 'cash'
                            ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
                            : 'border-[var(--ms-border)] text-[var(--ms-text-muted)]'
                        }`}
                      >
                        <Banknote size={16} /> Naqd
                      </button>
                      <button
                        type="button"
                        onClick={() => setMethod('terminal')}
                        className={`flex flex-1 items-center justify-center gap-2 rounded-lg border py-2 font-medium text-sm transition-colors ${
                          method === 'terminal'
                            ? 'border-purple-400 bg-purple-50 text-purple-700'
                            : 'border-[var(--ms-border)] text-[var(--ms-text-muted)]'
                        }`}
                      >
                        <CreditCard size={16} /> Terminal
                      </button>
                    </div>

                    {/* ── 4-qadam: summa ─────────────────────────────────────── */}
                    <div className="rounded-xl border-2 border-[var(--ms-brand)] bg-[var(--ms-brand)]/5 px-4 py-3">
                      <div className="text-[var(--ms-text-muted)] text-xs">To'lov summasi</div>
                      <div
                        className="font-bold text-2xl text-[var(--ms-text-primary)] tabular-nums"
                        data-test-id="debt-pay-amount"
                      >
                        {amountInput ? formatMoney(amountMinor) : '0'}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setAmountInput(minorToInput(outstanding))}
                        className="flex-1 rounded-lg border border-[var(--ms-border)] py-2 font-medium text-xs hover:bg-[var(--ms-bg-hover)]"
                      >
                        Hammasi ({formatMoney(outstanding)})
                      </button>
                      <button
                        type="button"
                        onClick={() => setAmountInput('')}
                        className="rounded-lg border border-[var(--ms-border)] px-3 py-2 text-xs hover:bg-[var(--ms-bg-hover)]"
                      >
                        Tozalash
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      {NUMPAD_KEYS.map((k) => (
                        <button
                          type="button"
                          key={k}
                          onClick={() =>
                            k === '⌫' ? setAmountInput((p) => p.slice(0, -1)) : handleDigit(k)
                          }
                          className="h-11 rounded-lg border border-[var(--ms-border)] bg-[var(--ms-bg-input)] font-semibold text-[var(--ms-text-primary)] text-lg transition-all hover:bg-[var(--ms-bg-hover)] active:scale-95"
                        >
                          {k}
                        </button>
                      ))}
                    </div>

                    {overpay > 0n && (
                      <p className="rounded-lg bg-red-50 px-3 py-2 text-red-700 text-xs">
                        Qarzdan {formatMoney(overpay)} ko'p. Qaytimni kassadan bering yoki summani
                        kamaytiring.
                      </p>
                    )}
                    {error && (
                      <p className="rounded-lg bg-red-50 px-3 py-2 text-red-700 text-xs">{error}</p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {agent && outstanding > 0n && (
            <div className="border-[var(--ms-border)] border-t px-5 py-3">
              <button
                type="button"
                onClick={() => payMut.mutate()}
                disabled={!canConfirm || payMut.isPending}
                data-test-id="debt-pay-confirm"
                className="h-12 w-full rounded-xl bg-[var(--ms-brand)] font-semibold text-base text-white transition-all hover:bg-[var(--ms-brand-hover)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {payMut.isPending ? '...' : 'To`lovni qabul qilish'}
              </button>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
