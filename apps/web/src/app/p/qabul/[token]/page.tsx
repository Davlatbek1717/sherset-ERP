'use client';

/**
 * /p/qabul/[token] — Taminotchi PAROLSIZ tasdiqlash sahifasi (Faza E, public).
 * Token (capability) orqali qabulни ko'rsatadi + «Tasdiqlash»/«Rad etish».
 * Auth = token o'zi; login yo'q. Faqat awaiting_supplier bosqichida tugmalar.
 */

import { Textarea } from '@moysklad/ui';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

interface SupplyView {
  name: string;
  agentName: string | null;
  stage: string;
  currency: string;
  sumMinor: string;
  positions: Array<{ product: string; quantity: string; priceMinor: string }>;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text();
    let msg = `HTTP ${res.status}`;
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed?.message === 'string') msg = parsed.message;
    } catch {
      msg = text || msg;
    }
    throw new Error(msg);
  }
  return res.json();
}

/** tiyin → so'm (×1/100), mingliklar ajratilgan. */
function money(minor: string, currency: string): string {
  const n = Number(minor) / 100;
  return `${n.toLocaleString('ru-RU')} ${currency}`;
}

export default function QabulConfirmPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? '';
  const [view, setView] = useState<SupplyView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<'confirmed' | 'rejected' | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetchJson<SupplyView>(`/api/v1/p/qabul/${token}`)
      .then(setView)
      .catch((e: Error) => setErr(e.message || 'Havola yaroqsiz'))
      .finally(() => setLoading(false));
  }, [token]);

  async function confirm() {
    setBusy(true);
    setErr(null);
    try {
      await fetchJson(`/api/v1/p/qabul/${token}/confirm`, { method: 'POST' });
      setResult('confirmed');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function doReject() {
    if (!reason.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await fetchJson(`/api/v1/p/qabul/${token}/reject`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      setResult('rejected');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const canAct = view?.stage === 'awaiting_supplier' && !result;

  return (
    <div className="flex min-h-screen items-start justify-center bg-slate-100 p-4">
      <div className="mt-6 w-full max-w-md rounded-2xl bg-white p-5 shadow-md">
        <div className="mb-3 font-semibold text-lg text-slate-800">Qabulни tasdiqlash</div>

        {loading && <div className="py-8 text-center text-slate-400">Yuklanmoqda…</div>}

        {!loading && err && !view && (
          <div className="rounded-lg bg-red-50 p-4 text-center text-red-700 text-sm">{err}</div>
        )}

        {result && (
          <div
            className={`rounded-lg p-4 text-center font-medium text-sm ${
              result === 'confirmed' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
            }`}
          >
            {result === 'confirmed'
              ? '✅ Tasdiqlandi. Rahmat!'
              : '❌ Rad etildi. Xabaringiz yuborildi.'}
          </div>
        )}

        {view && (
          <div className="flex flex-col gap-3">
            <div className="text-slate-600 text-sm">
              <div>
                Hujjat: <b>№ {view.name}</b>
              </div>
              {view.agentName && (
                <div>
                  Taminotchi: <b>{view.agentName}</b>
                </div>
              )}
            </div>

            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500 text-xs">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Mahsulot</th>
                    <th className="px-3 py-2 text-right font-medium">Soni</th>
                    <th className="px-3 py-2 text-right font-medium">Narx</th>
                  </tr>
                </thead>
                <tbody>
                  {view.positions.map((p, i) => (
                    <tr key={`${p.product}-${i}`} className="border-slate-100 border-t">
                      <td className="px-3 py-2 text-slate-700">{p.product}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{p.quantity}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {money(p.priceMinor, view.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="text-right font-semibold text-slate-800">
              Jami: {money(view.sumMinor, view.currency)}
            </div>

            {err && view && <div className="text-red-600 text-xs">{err}</div>}

            {!result && !canAct && (
              <div className="rounded-lg bg-slate-50 p-3 text-center text-slate-500 text-sm">
                Bu qabul allaqachon qayta ishlangan.
              </div>
            )}

            {canAct && !rejectOpen && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={confirm}
                  disabled={busy}
                  className="flex-1 rounded-lg bg-emerald-600 py-2.5 font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  ✅ Tasdiqlash
                </button>
                <button
                  type="button"
                  onClick={() => setRejectOpen(true)}
                  disabled={busy}
                  className="flex-1 rounded-lg border border-red-300 py-2.5 font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  ❌ Rad etish
                </button>
              </div>
            )}

            {canAct && rejectOpen && (
              <div className="flex flex-col gap-2">
                <Textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Rad etish sababini yozing…"
                  rows={3}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setRejectOpen(false)}
                    disabled={busy}
                    className="flex-1 rounded-lg border border-slate-300 py-2.5 text-slate-600 hover:bg-slate-50"
                  >
                    Bekor
                  </button>
                  <button
                    type="button"
                    onClick={doReject}
                    disabled={busy || !reason.trim()}
                    className="flex-1 rounded-lg bg-red-600 py-2.5 font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    Rad etishni yuborish
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
