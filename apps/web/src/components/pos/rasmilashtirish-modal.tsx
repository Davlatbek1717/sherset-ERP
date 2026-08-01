'use client';

import { api } from '@/lib/api-client';
import { Input, formatMoney } from '@moysklad/ui';
import * as Dialog from '@radix-ui/react-dialog';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Banknote, CreditCard, Monitor, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

interface CounterpartyRow {
  id: string;
  name: string;
  phone: string | null;
  tags: string[];
  companyType: string;
}

function cpTypeBadge(row: CounterpartyRow) {
  if (row.tags.includes('usta')) return { label: 'Usta', cls: 'bg-blue-100 text-blue-700' };
  if (row.tags.includes('dokon')) return { label: "Do'kon", cls: 'bg-orange-100 text-orange-700' };
  return null; // oddiy — badge yo'q
}

interface ConfirmParams {
  cashAmountMinor: bigint;
  cardAmountMinor: bigint;
  terminalAmountMinor: bigint;
  debtAmountMinor: bigint;
  agentId?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sumMinor: bigint;
  onConfirm: (params: ConfirmParams) => void;
  loading?: boolean;
}

// Quick-add amounts in minor units (1 sum = 100 minor)
// 1 000 sum, 5 000 sum, 10 000 sum, 50 000 sum
function buildQuickAmounts(sumMinor: bigint): bigint[] {
  const sum = Number(sumMinor);
  if (sum <= 0) return [100_000n, 500_000n, 1_000_000n, 5_000_000n];
  const magnitude = Math.pow(10, Math.floor(Math.log10(sum / 10)));
  const step = Math.max(1, Math.ceil(sum / 10 / magnitude) * magnitude);
  const s = BigInt(step);
  return [s, s * 2n, s * 5n, s * 10n];
}
const NUMPAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', '⌫'];

type ActiveField = 'cash' | 'card' | 'terminal';

const FIELD_COLORS: Record<ActiveField, { border: string; bg: string; icon: string; dot: string }> =
  {
    cash: {
      border: 'border-emerald-400',
      bg: 'bg-emerald-50',
      icon: 'bg-emerald-500',
      dot: 'bg-emerald-500',
    },
    card: { border: 'border-blue-400', bg: 'bg-blue-50', icon: 'bg-blue-500', dot: 'bg-blue-500' },
    terminal: {
      border: 'border-purple-400',
      bg: 'bg-purple-50',
      icon: 'bg-purple-500',
      dot: 'bg-purple-500',
    },
  };

export function RasmiyashtirishModal({
  open,
  onOpenChange,
  sumMinor,
  onConfirm,
  loading = false,
}: Props) {
  // ── Counterparty ──────────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [agent, setAgent] = useState<CounterpartyRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newType, setNewType] = useState<'oddiy' | 'usta' | 'dokon'>('oddiy');

  const { data: cpData, isLoading: cpLoading } = useQuery<{ items: CounterpartyRow[] }>({
    queryKey: ['cp-pos-search', search],
    queryFn: () => api.get(`/counterparties?search=${encodeURIComponent(search)}&limit=20`),
    enabled: open && !agent,
  });

  const createMut = useMutation({
    mutationFn: (body: {
      name: string;
      phone: string | null;
      companyType: string;
      tags: string[];
    }) => api.post<CounterpartyRow>('/counterparties', body),
    onSuccess: (row) => {
      setAgent(row);
      setCreating(false);
      setNewName('');
      setNewPhone('');
      setNewType('oddiy');
    },
  });

  // ── Payment inputs (major units string → minor bigint) ────────────────────
  const [cashInput, setCashInput] = useState('');
  const [cardInput, setCardInput] = useState('');
  const [terminalInput, setTerminalInput] = useState('');
  const [activeField, setActiveField] = useState<ActiveField>('cash');

  const toMinor = (s: string): bigint => {
    const n = Number.parseFloat(s);
    if (!s || !Number.isFinite(n) || n < 0) return 0n;
    return BigInt(Math.round(n * 100));
  };

  const cashMinor = toMinor(cashInput);
  const cardMinor = toMinor(cardInput);
  const terminalMinor = toMinor(terminalInput);
  const totalPaid = cashMinor + cardMinor + terminalMinor;
  const debtMinor = totalPaid < sumMinor ? sumMinor - totalPaid : 0n;
  const remaining = debtMinor; // alias for display
  const change = totalPaid > sumMinor ? totalPaid - sumMinor : 0n;

  // Can confirm if fully paid OR if there's debt but agent is selected
  const canConfirm =
    !loading && totalPaid > 0n && (totalPaid >= sumMinor || (debtMinor > 0n && agent !== null));

  // ── Reset on close ────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    setSearch('');
    setAgent(null);
    setCreating(false);
    setNewName('');
    setNewPhone('');
    setNewType('oddiy');
    setCashInput('');
    setCardInput('');
    setTerminalInput('');
    setActiveField('cash');
  }, []);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  // ── Numpad handlers ───────────────────────────────────────────────────────
  const setActive =
    activeField === 'cash'
      ? setCashInput
      : activeField === 'card'
        ? setCardInput
        : setTerminalInput;

  const handleDigit = useCallback(
    (d: string) => {
      setActive((prev) => {
        const next = prev + d;
        return next.length > 12 ? prev : next;
      });
    },
    [setActive],
  );

  const handleBack = useCallback(() => {
    setActive((prev) => prev.slice(0, -1));
  }, [setActive]);

  const handleExact = () => {
    const others =
      (activeField === 'cash' ? 0n : cashMinor) +
      (activeField === 'card' ? 0n : cardMinor) +
      (activeField === 'terminal' ? 0n : terminalMinor);
    const left = sumMinor > others ? sumMinor - others : 0n;
    setActive(String(Number(left) / 100));
  };

  const handleQuick = (amount: bigint) => {
    const cur =
      activeField === 'cash' ? cashMinor : activeField === 'card' ? cardMinor : terminalMinor;
    setActive(String(Number(cur + amount) / 100));
  };

  const handleConfirm = () => {
    if (!canConfirm) return;
    onConfirm({
      cashAmountMinor: cashMinor,
      cardAmountMinor: cardMinor,
      terminalAmountMinor: terminalMinor,
      debtAmountMinor: debtMinor,
      agentId: agent?.id,
    });
  };

  const activeMinor =
    activeField === 'cash' ? cashMinor : activeField === 'card' ? cardMinor : terminalMinor;

  const colors = FIELD_COLORS[activeField];

  const fieldLabel: Record<ActiveField, string> = {
    cash: 'Naqd miqdori',
    card: 'Karta miqdori',
    terminal: 'Terminal miqdori',
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(96vw,42rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-[var(--ms-bg-surface)] shadow-2xl outline-none flex flex-col max-h-[92dvh]">
          {/* Header */}
          <div className="shrink-0 bg-[var(--ms-bg-app)] px-6 py-4 border-b border-[var(--ms-border)] rounded-t-2xl">
            <div className="flex items-start justify-between">
              <div>
                <Dialog.Title className="text-[10px] font-bold uppercase tracking-widest text-[var(--ms-text-muted)]">
                  To'lov summasi
                </Dialog.Title>
                <div className="mt-0.5 text-3xl font-bold tabular-nums text-[var(--ms-text-primary)] leading-none">
                  {formatMoney(sumMinor)}
                </div>
              </div>
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--ms-text-muted)] hover:bg-[var(--ms-bg-hover)]"
                >
                  <X className="h-4 w-4" />
                </button>
              </Dialog.Close>
            </div>
          </div>

          {/* Two-column body */}
          <div className="flex flex-1 min-h-0">
            {/* LEFT — payment summary, confirm pinned at bottom */}
            <div className="flex w-60 shrink-0 flex-col border-r border-[var(--ms-border)]">
              {/* Scrollable area */}
              <div className="flex-1 overflow-y-auto flex flex-col">
                {/* Counterparty — always shown; optional for oddiy, required for usta/dokon */}
                <div className="px-4 pt-4 pb-3 border-b border-[var(--ms-border)]">
                  <div className="mb-2">
                    <span className="text-[10px] text-[var(--ms-text-muted)] italic">
                      Mijoz (ixtiyoriy)
                    </span>
                  </div>
                  {agent ? (
                    <div className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-sm text-[var(--ms-text-primary)] truncate">
                            {agent.name}
                          </span>
                          {(() => {
                            const b = cpTypeBadge(agent);
                            return b ? (
                              <span
                                className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${b.cls}`}
                              >
                                {b.label}
                              </span>
                            ) : null;
                          })()}
                        </div>
                        {agent.phone && (
                          <div className="text-xs text-[var(--ms-text-muted)]">{agent.phone}</div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setAgent(null)}
                        className="shrink-0 text-xs text-[var(--ms-text-muted)] hover:text-red-500"
                      >
                        ✕
                      </button>
                    </div>
                  ) : creating ? (
                    <div className="flex flex-col gap-2">
                      {/* Tur tanlash */}
                      <div className="flex gap-1 rounded-lg bg-[var(--ms-bg-input)] p-0.5">
                        {(['oddiy', 'usta', 'dokon'] as const).map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => setNewType(t)}
                            className={`flex-1 rounded-md py-1 text-[10px] font-semibold transition-all ${
                              newType === t
                                ? 'bg-white text-[var(--ms-text-primary)] shadow-sm'
                                : 'text-[var(--ms-text-muted)] hover:text-[var(--ms-text-primary)]'
                            }`}
                          >
                            {t === 'oddiy' ? 'Oddiy' : t === 'usta' ? 'Usta' : "Do'kon"}
                          </button>
                        ))}
                      </div>
                      <Input
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="Ism Familiya / Tashkilot nomi"
                        autoFocus
                      />
                      <Input
                        value={newPhone}
                        onChange={(e) => setNewPhone(e.target.value)}
                        placeholder="+998 __ ___ __ __"
                        inputMode="tel"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            createMut.mutate({
                              name: newName.trim(),
                              phone: newPhone.trim() || null,
                              companyType: newType === 'dokon' ? 'legalUZ' : 'individualUZ',
                              tags: newType !== 'oddiy' ? [newType] : [],
                            })
                          }
                          disabled={!newName.trim() || createMut.isPending}
                          className="flex-1 rounded-lg bg-[var(--ms-brand)] py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                        >
                          {createMut.isPending ? '...' : "Qo'shish"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setCreating(false)}
                          className="rounded-lg border border-[var(--ms-border)] px-3 py-1.5 text-xs text-[var(--ms-text-muted)]"
                        >
                          Bekor
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-[var(--ms-border)] overflow-hidden">
                      <div className="p-1.5 border-b border-[var(--ms-border)]">
                        <Input
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          placeholder="Qidirish..."
                        />
                      </div>
                      <div className="max-h-28 overflow-y-auto">
                        {cpLoading ? (
                          <p className="py-3 text-center text-xs text-[var(--ms-text-muted)]">
                            ...
                          </p>
                        ) : (cpData?.items.length ?? 0) === 0 ? (
                          <p className="py-3 text-center text-xs text-[var(--ms-text-muted)]">
                            Topilmadi
                          </p>
                        ) : (
                          cpData?.items.map((c) => {
                            const badge = cpTypeBadge(c);
                            return (
                              <button
                                type="button"
                                key={c.id}
                                onClick={() => setAgent(c)}
                                className="flex w-full items-center gap-2 border-b border-[var(--ms-border)] last:border-0 px-3 py-2 text-left hover:bg-[var(--ms-bg-hover)]"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-medium text-xs truncate">{c.name}</span>
                                    {badge && (
                                      <span
                                        className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${badge.cls}`}
                                      >
                                        {badge.label}
                                      </span>
                                    )}
                                  </div>
                                  {c.phone && (
                                    <span className="text-[10px] text-[var(--ms-text-muted)]">
                                      {c.phone}
                                    </span>
                                  )}
                                </div>
                              </button>
                            );
                          })
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setCreating(true);
                          setNewType('oddiy');
                        }}
                        className="w-full border-t border-[var(--ms-border)] px-3 py-2 text-left text-xs text-[var(--ms-text-brand)] hover:bg-[var(--ms-bg-hover)]"
                      >
                        + Yangi mijoz
                      </button>
                    </div>
                  )}
                </div>

                {/* Payment method cards */}
                <div className="flex flex-col gap-2 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--ms-text-muted)]">
                    To'lov turi
                  </p>

                  {/* Naqd */}
                  <button
                    type="button"
                    onClick={() => setActiveField('cash')}
                    className={`flex items-center gap-3 rounded-xl border-2 p-3 text-left transition-all ${
                      activeField === 'cash'
                        ? 'border-emerald-400 bg-emerald-50'
                        : 'border-[var(--ms-border)] bg-[var(--ms-bg-app)] hover:border-emerald-200'
                    }`}
                  >
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${activeField === 'cash' ? 'bg-emerald-500' : 'bg-[var(--ms-bg-input)]'}`}
                    >
                      <Banknote
                        className={`h-4 w-4 ${activeField === 'cash' ? 'text-white' : 'text-[var(--ms-text-muted)]'}`}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--ms-text-muted)]">
                        Naqd
                      </div>
                      <div
                        className={`font-bold tabular-nums leading-tight text-sm ${cashMinor > 0n ? 'text-[var(--ms-text-primary)]' : 'text-[var(--ms-text-muted)]'}`}
                      >
                        {cashMinor > 0n ? formatMoney(cashMinor) : '—'}
                      </div>
                    </div>
                    {activeField === 'cash' && (
                      <div className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                    )}
                  </button>

                  {/* Karta */}
                  <button
                    type="button"
                    onClick={() => setActiveField('card')}
                    className={`flex items-center gap-3 rounded-xl border-2 p-3 text-left transition-all ${
                      activeField === 'card'
                        ? 'border-blue-400 bg-blue-50'
                        : 'border-[var(--ms-border)] bg-[var(--ms-bg-app)] hover:border-blue-200'
                    }`}
                  >
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${activeField === 'card' ? 'bg-blue-500' : 'bg-[var(--ms-bg-input)]'}`}
                    >
                      <CreditCard
                        className={`h-4 w-4 ${activeField === 'card' ? 'text-white' : 'text-[var(--ms-text-muted)]'}`}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--ms-text-muted)]">
                        Karta
                      </div>
                      <div
                        className={`font-bold tabular-nums leading-tight text-sm ${cardMinor > 0n ? 'text-[var(--ms-text-primary)]' : 'text-[var(--ms-text-muted)]'}`}
                      >
                        {cardMinor > 0n ? formatMoney(cardMinor) : '—'}
                      </div>
                    </div>
                    {activeField === 'card' && (
                      <div className="h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                    )}
                  </button>

                  {/* Terminal */}
                  <button
                    type="button"
                    onClick={() => setActiveField('terminal')}
                    className={`flex items-center gap-3 rounded-xl border-2 p-3 text-left transition-all ${
                      activeField === 'terminal'
                        ? 'border-purple-400 bg-purple-50'
                        : 'border-[var(--ms-border)] bg-[var(--ms-bg-app)] hover:border-purple-200'
                    }`}
                  >
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${activeField === 'terminal' ? 'bg-purple-500' : 'bg-[var(--ms-bg-input)]'}`}
                    >
                      <Monitor
                        className={`h-4 w-4 ${activeField === 'terminal' ? 'text-white' : 'text-[var(--ms-text-muted)]'}`}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--ms-text-muted)]">
                        Terminal
                      </div>
                      <div
                        className={`font-bold tabular-nums leading-tight text-sm ${terminalMinor > 0n ? 'text-[var(--ms-text-primary)]' : 'text-[var(--ms-text-muted)]'}`}
                      >
                        {terminalMinor > 0n ? formatMoney(terminalMinor) : '—'}
                      </div>
                    </div>
                    {activeField === 'terminal' && (
                      <div className="h-2 w-2 shrink-0 rounded-full bg-purple-500" />
                    )}
                  </button>
                </div>

                {/* Remaining / Change — pushed to bottom */}
                <div className="mt-auto px-4 pb-4">
                  {debtMinor > 0n ? (
                    agent ? (
                      <div className="rounded-xl bg-red-50 border border-red-300 px-3 py-3 text-center">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-red-500 mb-0.5">
                          Qarz
                        </p>
                        <p className="text-xl font-bold tabular-nums text-red-700 leading-none">
                          {formatMoney(debtMinor)}
                        </p>
                        <p className="mt-1 text-[10px] text-red-400">{agent.name} ga yoziladi</p>
                      </div>
                    ) : (
                      <div className="rounded-xl bg-orange-50 border border-orange-200 px-3 py-3 text-center">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-orange-500 mb-0.5">
                          Qoldi
                        </p>
                        <p className="text-xl font-bold tabular-nums text-orange-700 leading-none">
                          {formatMoney(debtMinor)}
                        </p>
                        <p className="mt-1 text-[10px] text-orange-400">
                          Qarzga berish uchun mijoz tanlang
                        </p>
                      </div>
                    )
                  ) : change > 0n ? (
                    <div className="rounded-xl bg-emerald-50 border border-emerald-300 px-3 py-3 text-center">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-500 mb-0.5">
                        Qaytim
                      </p>
                      <p className="text-2xl font-bold tabular-nums text-emerald-700 leading-none">
                        {formatMoney(change)}
                      </p>
                    </div>
                  ) : totalPaid > 0n && totalPaid === sumMinor ? (
                    <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2.5 text-center">
                      <p className="text-sm font-semibold text-emerald-700">✓ Aniq to'landi</p>
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Confirm — pinned at bottom, never scrolls */}
              <div className="shrink-0 p-4 border-t border-[var(--ms-border)]">
                {/* Hint: why button is disabled */}
                {totalPaid === 0n && !loading && (
                  <p className="mb-2 text-center text-[10px] text-[var(--ms-text-muted)]">
                    To'lov summasini kiriting
                  </p>
                )}
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={!canConfirm}
                  className="h-12 w-full rounded-xl bg-emerald-500 font-bold text-sm text-white shadow-md transition-all hover:bg-emerald-600 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
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
                      Saqlanmoqda...
                    </span>
                  ) : (
                    '✓ Rasmilashtirish'
                  )}
                </button>
              </div>
            </div>

            {/* RIGHT — numpad panel */}
            <div className="flex flex-1 flex-col gap-2 p-4 bg-[var(--ms-bg-app)]">
              {/* Active field — real input, keyboard + numpad both work */}
              <div
                className={`rounded-xl border-2 px-4 py-2 transition-colors ${colors.border} bg-white`}
              >
                <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--ms-text-muted)] mb-0.5">
                  {fieldLabel[activeField]}
                </div>
                <input
                  key={activeField}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  value={
                    activeField === 'cash'
                      ? cashInput
                      : activeField === 'card'
                        ? cardInput
                        : terminalInput
                  }
                  onChange={(e) => setActive(e.target.value)}
                  placeholder="0"
                  // biome-ignore lint/a11y/noAutofocus: intentional POS focus — cashier types the payment amount immediately when this modal opens.
                  autoFocus
                  className="w-full bg-transparent text-2xl font-bold tabular-nums text-[var(--ms-text-primary)] leading-none outline-none placeholder:text-[var(--ms-text-muted)] placeholder:font-normal placeholder:text-lg [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
              </div>

              {/* Aniq summa */}
              <button
                type="button"
                onClick={handleExact}
                className="w-full rounded-xl border-2 border-dashed border-[var(--ms-border)] bg-white py-2 text-sm font-bold text-[var(--ms-text-primary)] hover:border-[var(--ms-brand)] hover:bg-[var(--ms-bg-hover)] transition-colors"
              >
                Aniq summa
              </button>

              {/* Numpad — grows to fill remaining space */}
              <div className="grid grid-cols-3 grid-rows-4 gap-1.5 flex-1">
                {NUMPAD_KEYS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => (k === '⌫' ? handleBack() : handleDigit(k))}
                    className={`rounded-xl border font-semibold text-xl transition-all active:scale-95 ${
                      k === '⌫'
                        ? 'border-[var(--ms-border)] bg-[var(--ms-bg-input)] text-[var(--ms-text-muted)] hover:bg-red-50 hover:text-red-500 hover:border-red-200'
                        : 'border-[var(--ms-border)] bg-white text-[var(--ms-text-primary)] hover:bg-[var(--ms-bg-hover)] shadow-sm'
                    }`}
                  >
                    {k}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
