'use client';

/**
 * Global «Создание печатной формы» dialog — moysklad parity.
 *
 * In moysklad, clicking a print form asks «Создать печатную форму по шаблону
 * '<name>'?» with a mode dropdown (Открыть в браузере / Скачать), a «Запомнить
 * выбор» checkbox, and Да/Нет. We mirror it as a root-mounted provider (like
 * ConfirmProvider) so the dialog survives the «Печать ▾» dropdown closing:
 * `usePrintForm().requestPrint(name)` resolves to the chosen mode (or null).
 *
 * The remembered choice is kept in localStorage; when set, requestPrint resolves
 * immediately and the dialog is skipped (matching «Запомнить выбор»).
 */

import { Button, Checkbox, Modal, NativeSelect } from '@moysklad/ui';
import { useTranslations } from 'next-intl';
import { createContext, useCallback, useContext, useRef, useState } from 'react';

export type PrintMode = 'open' | 'download';
const REMEMBER_KEY = 'ms-print-form-mode';

interface PrintFormContextValue {
  /** Ask how to produce the print form; resolves to the mode, or null if cancelled. */
  requestPrint: (templateName: string) => Promise<PrintMode | null>;
}

const PrintFormContext = createContext<PrintFormContextValue | null>(null);

// Tolerant: the provider is mounted at the app root, but if a consumer renders
// without it (e.g. an isolated unit test), degrade to a no-op instead of throwing.
const NOOP_PRINT_FORM: PrintFormContextValue = { requestPrint: async () => null };

export function usePrintForm(): PrintFormContextValue {
  return useContext(PrintFormContext) ?? NOOP_PRINT_FORM;
}

const SELECT_CLASS =
  'w-full h-9 px-3 text-sm bg-[var(--ms-bg-surface)] border border-[var(--ms-border-default)] rounded-[var(--ms-radius-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ms-border-focus)]';

export function PrintFormProvider({ children }: { children: React.ReactNode }) {
  const t = useTranslations('print_form');
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [mode, setMode] = useState<PrintMode>('open');
  const [remember, setRemember] = useState(false);
  const resolveRef = useRef<((mode: PrintMode | null) => void) | null>(null);

  const requestPrint = useCallback((templateName: string) => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem(REMEMBER_KEY) : null;
    if (saved === 'open' || saved === 'download') return Promise.resolve<PrintMode>(saved);
    setName(templateName);
    setMode('open');
    setRemember(false);
    setOpen(true);
    return new Promise<PrintMode | null>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  const finish = useCallback(
    (chosen: PrintMode | null) => {
      if (chosen && remember && typeof window !== 'undefined') {
        window.localStorage.setItem(REMEMBER_KEY, chosen);
      }
      setOpen(false);
      resolveRef.current?.(chosen);
      resolveRef.current = null;
    },
    [remember],
  );

  return (
    <PrintFormContext.Provider value={{ requestPrint }}>
      {children}
      <Modal
        open={open}
        onOpenChange={(o) => {
          if (!o) finish(null);
        }}
        title={t('title')}
        widthClass="w-[420px]"
        testId="print-form-dialog"
        footer={
          <>
            <Button variant="secondary" onClick={() => finish(null)} data-test-id="print-form-no">
              {t('no')}
            </Button>
            <Button onClick={() => finish(mode)} data-test-id="print-form-yes">
              {t('yes')}
            </Button>
          </>
        }
      >
        <div className="space-y-3 px-4 py-3">
          <p className="text-[var(--ms-text-primary)] text-sm">{t('prompt', { name })}</p>
          <NativeSelect
            value={mode}
            onChange={(e) => setMode(e.target.value as PrintMode)}
            className={SELECT_CLASS}
            data-test-id="print-form-mode"
          >
            <option value="open">{t('mode_open')}</option>
            <option value="download">{t('mode_download')}</option>
          </NativeSelect>
          <label className="flex cursor-pointer items-center gap-2 text-[var(--ms-text-primary)] text-sm">
            <Checkbox
              checked={remember}
              onCheckedChange={(v) => setRemember(!!v)}
              data-test-id="print-form-remember"
            />
            {t('remember')}
          </label>
        </div>
      </Modal>
    </PrintFormContext.Provider>
  );
}
