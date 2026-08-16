'use client';

/**
 * /p/[token] — Public document viewer (no auth).
 *
 * Flow:
 *   1. Resolve the token → metadata (targetType, targetId, password-protected?)
 *   2. If password-protected: prompt for password, verify via /p/:token/verify
 *   3. Fetch the actual document body — for now we render a minimal preview
 *      card (full per-doctype rendering is a follow-up sprint)
 *   4. Record view (best-effort, errors ignored)
 *
 * On 410 Gone / 404 / wrong password: show a clear error state with no
 * leakage of doc internals.
 */

import { PasswordInput } from '@moysklad/ui';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { PublicReceipt, type PublicReceiptSale } from './public-receipt';

interface PublicMeta {
  id: string;
  targetType: string;
  targetId: string;
  description: string | null;
  passwordProtected: boolean;
  expiresAt: string | null;
  viewCount: number;
}

const TARGET_LABEL: Record<string, string> = {
  // Kassa cheki (2026-08-16) — mijozga Telegram xabaridagi «🧾 Chek» havolasi.
  retailsale: 'Kassa cheki',
  customerorder: 'Mijoz buyurtmasi',
  invoiceout: 'Mijozga schyot',
  demand: 'Yuk berish',
  supply: "Ta'minlash",
  paymentin: "Kiruvchi to'lov",
  paymentout: "Chiquvchi to'lov",
  cashin: 'Kassa kirim',
  cashout: 'Kassa chiqim',
  payroll: 'Ish haqi',
  factureout: 'Schyot-faktura',
  pricelist: "Narx ro'yxati",
  prepayment: 'Avans',
};

type State =
  | { kind: 'loading' }
  | { kind: 'error'; status: number; message: string }
  | { kind: 'password-prompt'; meta: PublicMeta }
  /** `sale` — kassa cheki tanasi; boshqa turlarda `null` (metama'lumot kartasi). */
  | { kind: 'ready'; meta: PublicMeta; sale: PublicReceiptSale | null };

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
    const err = new Error(msg) as Error & { status: number };
    err.status = res.status;
    throw err;
  }
  return res.json();
}

/**
 * Hujjat TANASI (chek) — `POST /p/:token/document`.
 *
 * 🔴 Fail-open: tana kelmasa sahifa YIQILMAYDI, eski metama'lumot kartasi
 * ko'rinadi. Mijoz uchun «hech narsa ochilmadi» eng yomon natija.
 */
async function loadSale(token: string, password?: string): Promise<PublicReceiptSale | null> {
  try {
    const r = await fetchJson<{ targetType: string; sale: PublicReceiptSale | null }>(
      `/api/v1/p/${token}/document`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(password ? { password } : {}),
      },
    );
    return r.sale;
  } catch {
    return null;
  }
}

export default function PublicViewerPage() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [password, setPassword] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  // Step 1: resolve metadata
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const meta = await fetchJson<PublicMeta>(`/api/v1/p/${token}`);
        if (cancelled) return;
        if (meta.passwordProtected) {
          setState({ kind: 'password-prompt', meta });
        } else {
          const sale = await loadSale(token);
          if (cancelled) return;
          setState({ kind: 'ready', meta, sale });
          // Best-effort view counter
          fetch(`/api/v1/p/${token}/view`, { method: 'POST' }).catch(() => undefined);
        }
      } catch (e) {
        if (cancelled) return;
        const err = e as Error & { status?: number };
        setState({
          kind: 'error',
          status: err.status ?? 500,
          message: err.message,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (state.kind !== 'password-prompt') return;
    setVerifying(true);
    setVerifyError(null);
    try {
      await fetchJson(`/api/v1/p/${token}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const sale = await loadSale(token, password);
      setState({ kind: 'ready', meta: state.meta, sale });
      fetch(`/api/v1/p/${token}/view`, { method: 'POST' }).catch(() => undefined);
    } catch (err) {
      setVerifyError((err as Error).message);
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="mx-auto max-w-2xl px-4 py-12">
        <div className="mb-6 flex items-center justify-between">
          <div className="font-medium text-slate-700 text-sm">Hujjat</div>
          <div className="text-slate-400 text-xs">Sherset</div>
        </div>

        {state.kind === 'loading' && (
          <div className="rounded-lg border border-[var(--ms-border-default)] bg-white p-8 text-center text-slate-500">
            Yuklanmoqda…
          </div>
        )}

        {state.kind === 'error' && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-8 text-center">
            <div className="mb-2 font-semibold text-2xl text-rose-700">
              {state.status === 404
                ? '404 — Topilmadi'
                : state.status === 410
                  ? '410 — Havola muddati tugagan / bekor qilingan'
                  : 'Xato yuz berdi'}
            </div>
            <div className="text-rose-600 text-sm">{state.message}</div>
          </div>
        )}

        {state.kind === 'password-prompt' && (
          <form
            onSubmit={submitPassword}
            className="rounded-lg border border-[var(--ms-border-default)] bg-white p-8"
          >
            <div className="mb-4 text-center">
              <div className="mx-auto mb-3 text-4xl">🔒</div>
              <h1 className="font-semibold text-lg text-slate-800">Parol bilan himoyalangan</h1>
              <p className="mt-1 text-slate-500 text-sm">Bu havolani ochish uchun parol kerak</p>
            </div>
            {/* Public page — no i18n bundle here; the PasswordInput eye-toggle
                keeps its Uzbek defaults (page copy is Uzbek-hardcoded too). */}
            <PasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Parol"
              autoFocus
            />
            {verifyError && <div className="mt-2 text-rose-600 text-sm">{verifyError}</div>}
            <button
              type="submit"
              disabled={verifying || !password}
              className="mt-4 w-full rounded-md bg-blue-600 px-4 py-2 font-medium text-sm text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {verifying ? 'Tekshirilmoqda…' : 'Davom etish'}
            </button>
          </form>
        )}

        {state.kind === 'ready' && state.sale && <PublicReceipt sale={state.sale} />}

        {state.kind === 'ready' && !state.sale && (
          <div className="space-y-4 rounded-lg border border-[var(--ms-border-default)] bg-white p-8">
            <div className="border-[var(--ms-border-default)] border-b pb-4">
              <div className="text-slate-400 text-xs uppercase tracking-wide">
                {TARGET_LABEL[state.meta.targetType] ?? state.meta.targetType}
              </div>
              <div className="mt-1 font-semibold text-slate-800 text-xl">
                {state.meta.description ?? 'Hujjat'}
              </div>
            </div>

            <div className="space-y-2 text-sm">
              {state.meta.expiresAt && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Amal qiladi:</span>
                  <span className="text-slate-700">
                    {new Date(state.meta.expiresAt).toLocaleString('uz')}
                  </span>
                </div>
              )}
            </div>

            {/* Kassa chekidan boshqa turlar uchun to'liq ko'rinish hali yo'q.
                Hujjat UUID'i mijozga hech nima anglatmaydi — ko'rsatilmaydi. */}
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-800 text-xs">
              ℹ Bu hujjat turi uchun to'liq ko'rinish hali qo'shilmagan.
            </div>
          </div>
        )}

        <div className="mt-6 text-center text-slate-400 text-xs">
          Sherset — savdo va ombor boshqaruvi
        </div>
      </div>
    </div>
  );
}
