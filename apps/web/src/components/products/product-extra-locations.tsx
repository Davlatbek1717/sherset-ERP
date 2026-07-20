'use client';

/**
 * ProductExtraLocations — «Qo'shimcha yacheykalar» card (multi-bin, Phase 1).
 *
 * Manages a product's ADDITIONAL shelf locations (beyond the primary loc* home
 * on the product card) with its OWN local state + save, independent of the main
 * react-hook-form product save. Replace-all semantics: the card always PUTs the
 * full list to /products/:id/locations. Edit-only (needs an existing id).
 *
 * Phase 2 adds an optional per-cell qty per row (manually maintained — no
 * document posts to it); the addresses still tell the picker/omborchi every
 * shelf the product can be found on.
 */

import { api } from '@/lib/api-client';
import { Button, Input, cn } from '@moysklad/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

interface InitialLoc {
  sklad: number;
  polka: number | null;
  qavat: number | null;
  yacheyka: number | null;
  // Per-cell qty (Phase 2) — Decimal column, serialized as a string.
  qty?: string | number | null;
  note: string | null;
}
interface Row {
  uid: string;
  sklad: string;
  polka: string;
  qavat: string;
  yacheyka: string;
  qty: string;
  note: string;
}

const numOrNull = (s: string) => (s.trim() === '' ? null : Number(s));
const numStr = (n: number | null) => (n == null ? '' : String(n));

const SEGMENTS = ['sklad', 'polka', 'qavat', 'yacheyka'] as const;

export function ProductExtraLocations({
  productId,
  initial,
}: {
  productId: string;
  initial: InitialLoc[];
}) {
  const qc = useQueryClient();
  const uidRef = useRef(0);
  const nextUid = () => `r${uidRef.current++}`;
  const [rows, setRows] = useState<Row[]>(() =>
    initial.map((l) => ({
      uid: nextUid(),
      sklad: numStr(l.sklad),
      polka: numStr(l.polka),
      qavat: numStr(l.qavat),
      yacheyka: numStr(l.yacheyka),
      qty: l.qty == null ? '' : String(l.qty),
      note: l.note ?? '',
    })),
  );
  const [error, setError] = useState<string | null>(null);

  // Yangi qo'shilgan qatorni AJRATIB ko'rsatish (2026-07-20i): «+ Yacheyka
  // qo'shish» bo'sh qator qo'shadi, lekin ekranда allaqachon bo'sh qator bo'lsa
  // yangisi bir xil ko'rinib «hech narsa o'zgarmadi» tuyg'usini beradi. Yangi
  // qatorning 1-maydoniga fokus + qisqa fon-belgi bilan uni ko'zга tashlaymiz.
  const firstInputRefs = useRef<Map<string, HTMLInputElement | null>>(new Map());
  const [justAddedUid, setJustAddedUid] = useState<string | null>(null);
  useEffect(() => {
    if (!justAddedUid) return;
    firstInputRefs.current.get(justAddedUid)?.focus();
    const t = setTimeout(() => setJustAddedUid(null), 1600);
    return () => clearTimeout(t);
  }, [justAddedUid]);

  const saveMut = useMutation({
    mutationFn: () => {
      const locations = rows
        .filter((r) => r.sklad.trim() !== '')
        .map((r) => ({
          sklad: Number(r.sklad),
          polka: numOrNull(r.polka),
          qavat: numOrNull(r.qavat),
          yacheyka: numOrNull(r.yacheyka),
          qty: numOrNull(r.qty),
          note: r.note.trim() || null,
        }));
      return api.put(`/products/${productId}/locations`, { locations });
    },
    onSuccess: () => {
      setError(null);
      qc.invalidateQueries({ queryKey: ['product', productId] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const update = (uid: string, field: keyof Row, value: string) =>
    setRows((prev) => prev.map((r) => (r.uid === uid ? { ...r, [field]: value } : r)));
  const addRow = () => {
    const uid = nextUid();
    setRows((prev) => [
      ...prev,
      { uid, sklad: '', polka: '', qavat: '', yacheyka: '', qty: '', note: '' },
    ]);
    setJustAddedUid(uid);
  };
  const removeRow = (uid: string) => setRows((prev) => prev.filter((r) => r.uid !== uid));

  return (
    <div
      className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-4"
      data-test-id="card-extra-locations"
    >
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-semibold text-[var(--ms-text-primary)] text-sm">
          Qo'shimcha yacheykalar
        </h3>
        <button
          type="button"
          className="text-[var(--ms-text-brand)] text-xs hover:underline"
          onClick={addRow}
          data-test-id="extra-loc-add"
        >
          + Yacheyka qo'shish
        </button>
      </div>
      <p className="mb-3 text-[var(--ms-text-muted)] text-xs">
        Asosiy joydan tashqari, shu tovar turadigan boshqa yacheykalar (sklad·polka·qavat·yacheyka),
        yoniga shu yacheykadagi sonini ham yozish mumkin. Terish va joylashtirishda ko'rsatiladi.
      </p>

      {rows.length === 0 ? (
        <p className="text-[var(--ms-text-muted)] text-xs" data-test-id="extra-loc-empty">
          Qo'shimcha yacheyka yo'q.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((r) => (
            <div
              key={r.uid}
              className={cn(
                '-mx-1 flex items-center gap-1.5 rounded-[var(--ms-radius-sm)] px-1 py-0.5 transition-colors',
                r.uid === justAddedUid && 'bg-[var(--ms-bg-selected)]',
              )}
            >
              {SEGMENTS.map((f, idx) => (
                <Input
                  key={f}
                  ref={
                    idx === 0
                      ? (el) => {
                          if (el) firstInputRefs.current.set(r.uid, el);
                          else firstInputRefs.current.delete(r.uid);
                        }
                      : undefined
                  }
                  value={r[f]}
                  onChange={(e) => update(r.uid, f, e.target.value)}
                  inputMode="numeric"
                  placeholder="00"
                  className="w-14 text-center tabular-nums"
                  data-test-id={`extra-loc-${f}`}
                />
              ))}
              {/* Per-cell qty (Phase 2) — units in this bin; empty = not tracked. */}
              <Input
                value={r.qty}
                onChange={(e) => update(r.uid, 'qty', e.target.value)}
                inputMode="decimal"
                placeholder="soni"
                className="w-16 text-center tabular-nums"
                data-test-id="extra-loc-qty"
              />
              <Input
                value={r.note}
                onChange={(e) => update(r.uid, 'note', e.target.value)}
                placeholder="izoh"
                className="flex-1"
                data-test-id="extra-loc-note"
              />
              <button
                type="button"
                className="px-1 text-[var(--ms-text-destructive)] text-sm hover:underline"
                onClick={() => removeRow(r.uid)}
                aria-label="O'chirish"
                data-test-id="extra-loc-remove"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {error && (
        <p
          className="mt-2 text-[var(--ms-text-destructive)] text-xs"
          data-test-id="extra-loc-error"
        >
          {error}
        </p>
      )}

      <div className="mt-3">
        <Button
          variant="secondary"
          onClick={() => saveMut.mutate()}
          disabled={saveMut.isPending}
          data-test-id="extra-loc-save"
        >
          {saveMut.isPending ? '...' : 'Yacheykalarni saqlash'}
        </Button>
      </div>
    </div>
  );
}
