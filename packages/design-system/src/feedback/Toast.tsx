'use client';

import { AlertCircle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import * as React from 'react';
import { cn } from '../lib/cn.ts';

/**
 * Toast notification system. Mirrors moysklad's top-right notification
 * style: 4 tones (success / info / warning / destructive), auto-dismiss
 * after 5s by default, manual close, icon per tone, and a queue so
 * multiple toasts stack.
 *
 * Usage:
 *   1. Wrap the app once with <ToastProvider />
 *   2. Anywhere: const { toast } = useToast();
 *      toast.success("Hujjat saqlandi");
 *      toast.error("Saqlash bajarilmadi", { description: e.message });
 *
 * Design choices:
 * - No external dep (no sonner / react-hot-toast) — fewer bytes, full
 *   control over moysklad parity (animations, spacing, palette).
 * - aria-live=polite so screen readers announce non-disruptive toasts.
 * - aria-live=assertive on destructive so errors interrupt.
 */

export type ToastTone = 'success' | 'info' | 'warning' | 'destructive';

export interface ToastInput {
  /** Headline shown in bold. */
  title: React.ReactNode;
  /** Optional secondary line — typically the error reason or hint. */
  description?: React.ReactNode;
  /** ms before auto-dismiss; 0 = sticky until user closes. Default 5000. */
  duration?: number;
  /** Optional action button (e.g. "Undo"). */
  action?: { label: string; onClick: () => void };
  /** Pre-set id — useful for de-duping or programmatic dismiss. */
  id?: string;
}

interface ToastInstance extends ToastInput {
  id: string;
  tone: ToastTone;
  /** Wall-clock when the toast was created. */
  createdAt: number;
}

type ToastApi = {
  toast: {
    success: (title: React.ReactNode, opts?: Omit<ToastInput, 'title'>) => string;
    info: (title: React.ReactNode, opts?: Omit<ToastInput, 'title'>) => string;
    warning: (title: React.ReactNode, opts?: Omit<ToastInput, 'title'>) => string;
    error: (title: React.ReactNode, opts?: Omit<ToastInput, 'title'>) => string;
    dismiss: (id: string) => void;
    dismissAll: () => void;
  };
};

const ToastContext = React.createContext<ToastApi | null>(null);

const ICON: Record<ToastTone, typeof CheckCircle2> = {
  success: CheckCircle2,
  info: Info,
  warning: AlertCircle,
  destructive: XCircle,
};

const TONE_STYLES: Record<ToastTone, string> = {
  success:
    'border-[var(--ms-success-100)] bg-white text-[var(--ms-text-primary)] [&_svg]:text-[var(--ms-text-success)]',
  info: 'border-[var(--ms-info-100)] bg-white text-[var(--ms-text-primary)] [&_svg]:text-[var(--ms-text-brand)]',
  warning:
    'border-[var(--ms-warning-100)] bg-white text-[var(--ms-text-primary)] [&_svg]:text-[var(--ms-text-warning)]',
  destructive:
    'border-[var(--ms-destructive-100)] bg-white text-[var(--ms-text-primary)] [&_svg]:text-[var(--ms-text-destructive)]',
};

const TONE_ARIA: Record<ToastTone, 'polite' | 'assertive'> = {
  success: 'polite',
  info: 'polite',
  warning: 'polite',
  destructive: 'assertive',
};

let counter = 0;
function genId(): string {
  counter += 1;
  return `t-${Date.now().toString(36)}-${counter}`;
}

export function ToastProvider({
  children,
  /** Maximum toasts visible at once; older ones are kept in the queue. */
  max = 5,
}: {
  children: React.ReactNode;
  max?: number;
}) {
  const [toasts, setToasts] = React.useState<ToastInstance[]>([]);
  const timers = React.useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = React.useCallback(
    (tone: ToastTone, input: ToastInput): string => {
      const id = input.id ?? genId();
      const duration = input.duration ?? 5000;
      const instance: ToastInstance = { ...input, id, tone, createdAt: Date.now() };

      setToasts((prev) => {
        // De-dup by id — replace if present.
        const without = prev.filter((t) => t.id !== id);
        return [...without, instance].slice(-max);
      });

      if (duration > 0) {
        const timer = setTimeout(() => dismiss(id), duration);
        timers.current.set(id, timer);
      }
      return id;
    },
    [dismiss, max],
  );

  const api = React.useMemo<ToastApi>(
    () => ({
      toast: {
        success: (title, opts) => push('success', { title, ...opts }),
        info: (title, opts) => push('info', { title, ...opts }),
        warning: (title, opts) => push('warning', { title, ...opts }),
        error: (title, opts) => push('destructive', { title, ...opts }),
        dismiss,
        dismissAll: () => {
          for (const t of timers.current.values()) clearTimeout(t);
          timers.current.clear();
          setToasts([]);
        },
      },
    }),
    [push, dismiss],
  );

  React.useEffect(() => {
    const captured = timers.current;
    return () => {
      for (const t of captured.values()) clearTimeout(t);
      captured.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toasts={toasts} dismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastViewport({
  toasts,
  dismiss,
}: {
  toasts: ToastInstance[];
  dismiss: (id: string) => void;
}) {
  return (
    <div
      // moysklad places the toast stack top-right, ~16px from edges,
      // stacking down. We follow that exact placement.
      className="pointer-events-none fixed top-4 right-4 z-[var(--ms-z-toast)] flex w-[380px] max-w-[calc(100vw-2rem)] flex-col gap-2"
      data-testid="toast-viewport"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
      ))}
    </div>
  );
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: ToastInstance;
  onDismiss: () => void;
}) {
  const Icon = ICON[toast.tone];
  return (
    <div
      // biome-ignore lint/a11y/useSemanticElements: the suggested <output> is a FORM-associated element (it carries `form`/`for`/`name` and is display:inline). A toast is a floating portal notification, not a form result — role="status" on a div is the conventional shape
      role="status"
      aria-live={TONE_ARIA[toast.tone]}
      data-tone={toast.tone}
      data-testid={`toast-${toast.tone}`}
      className={cn(
        'pointer-events-auto flex items-start gap-3 rounded-[var(--ms-radius-md)] border p-3 shadow-lg',
        'animate-in slide-in-from-right fade-in duration-200',
        TONE_STYLES[toast.tone],
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="font-medium text-sm leading-tight">{toast.title}</div>
        {toast.description ? (
          <div className="mt-0.5 text-[var(--ms-text-muted)] text-xs leading-tight">
            {toast.description}
          </div>
        ) : null}
        {toast.action ? (
          <button
            type="button"
            onClick={() => {
              toast.action?.onClick();
              onDismiss();
            }}
            className="mt-2 font-medium text-[var(--ms-text-brand)] text-xs hover:underline"
          >
            {toast.action.label}
          </button>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Yopish"
        className="rounded-sm p-0.5 text-[var(--ms-text-muted)] transition-colors hover:bg-[var(--ms-bg-hover)] hover:text-[var(--ms-text-primary)]"
      >
        <X className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  );
}

export function useToast(): ToastApi {
  const ctx = React.useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used inside <ToastProvider>');
  }
  return ctx;
}
