'use client';

/**
 * Shared «Печать ▾» menu items for an account's uploaded print templates.
 *
 * moysklad lists every account-created print form for a document type in that
 * document's «Печать» menu. We mirror it generically: this fragment loads the
 * account's enabled templates for `entity` and renders one menu item each;
 * clicking POSTs the selected ids to `/{path}/bulk-print` with that templateId
 * and downloads the rendered PDF (DocPdfService fills the Word/Excel/HTML form).
 *
 * Drop it into any document list's print dropdown (between the built-in forms
 * and «Настроить…»). Items are disabled until ≥1 row is selected. Templates are
 * created/managed in the right-side «Настройка шаблонов» slide-over (opened by
 * the «Настроить…» item — moysklad parity, there is no settings page).
 */

import { api } from '@/lib/api-client';
import { DropdownMenu } from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { usePrintForm } from './print-form-provider';
import { usePrintTemplatesManager } from './print-templates-provider';

interface PrintTemplateMenuItem {
  id: string;
  name: string;
}
interface TemplatesResponse {
  items: PrintTemplateMenuItem[];
}

export interface AccountPrintTemplateItemsProps {
  /** moysklad entity slug used to scope templates (e.g. 'customerorder'). */
  entity: string;
  /** URL path segment for the bulk-print endpoint (e.g. 'customer-orders'). */
  path: string;
  /** Selected row ids — gates the items (need ≥1) and is the print payload. */
  selectedIds?: Set<string> | string[];
}

export function AccountPrintTemplateItems({
  entity,
  path,
  selectedIds,
}: AccountPrintTemplateItemsProps) {
  const { data } = useQuery<TemplatesResponse>({
    queryKey: ['print-templates-menu', entity],
    queryFn: () =>
      api.get<TemplatesResponse>(`/print-templates?entity=${entity}&enabled=true&limit=100`),
    staleTime: 60_000,
  });
  const { requestPrint } = usePrintForm();
  const { openTemplates } = usePrintTemplatesManager();
  const t = useTranslations('print_menu');
  const ids = selectedIds ? Array.from(selectedIds) : [];
  const hasSelection = ids.length > 0;
  const templates = data?.items ?? [];

  // moysklad: clicking a form asks «Создать печатную форму…» → open in browser
  // or download (remembered choice skips the prompt).
  const print = async (tpl: PrintTemplateMenuItem) => {
    const mode = await requestPrint(tpl.name);
    if (!mode) return;
    const body = { ids, templateId: tpl.id };
    if (mode === 'open') await api.postOpenInBrowser(`/${path}/bulk-print`, body);
    else await api.postDownload(`/${path}/bulk-print`, body, `${path}.pdf`);
  };

  return (
    <>
      {templates.map((tpl) => (
        <DropdownMenu.Item
          key={tpl.id}
          onSelect={() => void print(tpl)}
          disabled={!hasSelection}
          testId={`print-template-${tpl.id}`}
        >
          {tpl.name}
        </DropdownMenu.Item>
      ))}
      {/* moysklad: «Настроить…» opens the templates panel right from the document
          (not a Settings page) — add/visibility/delete for this entity. */}
      <DropdownMenu.Item onSelect={() => openTemplates(entity)} testId="print-configure-drawer">
        {t('configure')}
      </DropdownMenu.Item>
    </>
  );
}
