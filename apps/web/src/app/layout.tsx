import {
  CatalogPickerLabelsProvider,
  ConfirmProvider,
  ModalLabelsProvider,
  PaginationLabelsProvider,
  ThemeProvider,
  ToastProvider,
  TooltipProvider,
} from '@moysklad/ui';
import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';
import './globals.css';
import { PrintFormProvider } from '@/components/print/print-form-provider';
import { PrintTemplatesProvider } from '@/components/print/print-templates-provider';
import { UnsavedNavGuard } from '@/components/unsaved-nav-guard';
import { QueryProvider } from '@/lib/query-client';

export const metadata: Metadata = {
  title: 'Sherset — Biznes boshqaruv tizimi',
  description: 'Bulutli ERP, buxgalteriya va savdo boshqaruvi',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Resolve locale + messages on the server (cookie-based, see src/i18n/request.ts)
  const locale = await getLocale();
  const messages = await getMessages();
  // Localized fallbacks for confirm() dialogs that omit explicit labels —
  // otherwise the design-system default leaks Uzbek («Davom etish» /
  // «Bekor qilish») into the RU UI.
  const tCommon = await getTranslations('common');
  // Picker-specific strings (the rest reuse common.*). Without this the
  // CatalogPicker design-system defaults leak Uzbek into the RU UI.
  const tPicker = await getTranslations('catalog_picker');
  // List pager: range connector + icon-button aria-labels. Without this the
  // Pagination design-system defaults leak (range «из» into the UZ UI; English
  // aria-labels everywhere) — same default-leak bug-class as the providers above.
  const tPag = await getTranslations('pagination');

  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <QueryProvider>
            {/* Theme + tooltip + toast + confirm providers wrap the whole tree
                so any page can use useTheme() / useToast() / useConfirm() /
                <Tooltip>. One mount only — duplicating them would queue toasts
                twice and break the Radix tooltip singleton. ThemeProvider must
                be outermost so `<html class="dark">` flips before any
                Tailwind-conditional CSS runs. */}
            {/* Force light mode — moysklad.uz is light-only, our dark
                tokens stay in the design-system for future use but the
                web app must not surface them. `forced='light'` is a
                hard lock that ignores any stored localStorage value
                from a previous session (e.g. when the toggle still
                existed) and the OS `prefers-color-scheme` signal.
                When we eventually ship a dark theme audit, swap this
                to `defaultTheme='light'` and reintroduce the toggle. */}
            <ThemeProvider defaultTheme="light" forced="light">
              <TooltipProvider>
                <ToastProvider>
                  <ModalLabelsProvider closeLabel={tCommon('close')}>
                    <CatalogPickerLabelsProvider
                      labels={{
                        searchPlaceholder: tCommon('search'),
                        createLabel: tCommon('create'),
                        emptyTitle: tCommon('no_results'),
                        emptyDescription: tPicker('empty_description'),
                        loadingLabel: tCommon('loading'),
                        clearLabel: tCommon('clear'),
                        cancelLabel: tCommon('cancel'),
                        closeLabel: tCommon('close'),
                        pickLabel: tPicker('pick_aria'),
                        fieldPlaceholder: tPicker('field_placeholder'),
                      }}
                    >
                      <ConfirmProvider
                        defaultLabels={{ confirm: tCommon('continue'), cancel: tCommon('cancel') }}
                      >
                        <UnsavedNavGuard />
                        <PaginationLabelsProvider
                          labels={{
                            of: tPag('of'),
                            first: tPag('first'),
                            previous: tPag('previous'),
                            next: tPag('next'),
                            last: tPag('last'),
                          }}
                        >
                          <PrintFormProvider>
                            <PrintTemplatesProvider>{children}</PrintTemplatesProvider>
                          </PrintFormProvider>
                        </PaginationLabelsProvider>
                      </ConfirmProvider>
                    </CatalogPickerLabelsProvider>
                  </ModalLabelsProvider>
                </ToastProvider>
              </TooltipProvider>
            </ThemeProvider>
          </QueryProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
