'use client';

import { useTranslations } from 'next-intl';

/**
 * Localized labels for the shared `<DocumentEditor/>` shell (@moysklad/ui).
 *
 * `<DocumentEditor/>` (toolbar + header + error banner) is locale-agnostic;
 * its prop defaults are the historical hardcoded strings — Uzbek-latin on the
 * toolbar (`Saqlash`/`Yopish`/`O'zgartirish`/`Hujjat yaratish`/`Chop etish`/
 * `Yuborish`, error `Saqlashda xato`/`Qayta urinish`) and RUSSIAN on the
 * header (`Проведено`/`Ожидание`/`Авто`). A page that renders it WITHOUT
 * these props leaks Latin-uz into the RU UI and raw Russian into the UZ UI —
 * the same bug-class as EditForm (see useEditFormLabels, its exact mirror).
 *
 * Spread into every DocumentEditor call:
 *
 *   const docEditorLabels = useDocumentEditorLabels();
 *   <DocumentEditor {...docEditorLabels} onSave={…}>…</DocumentEditor>
 *
 * Sources mirror the [id]-page DetailToolbar/DetailHeader so /new and /[id]
 * read identically per locale:
 * - saveLabel/closeLabel  → common.save / common.close
 * - modifyLabel           → bulk_actions.trigger («Изменить»)
 * - createDocLabel        → create_related.trigger_doc («Создать документ»)
 * - printLabel            → print_menu.trigger («Печать»)
 * - sendLabel             → detail_send.trigger («Отправить»)
 * - applicableLabel       → detail_header.applicable («Проведено»)
 * - waitingLabel          → detail_header.waiting («Ожидание»)
 * - numberPlaceholder     → detail_header.number_auto («Авто»)
 * - errorTitle/RetryLabel → detail_header.save_error / common.retry
 */
export function useDocumentEditorLabels() {
  const tCommon = useTranslations('common');
  const tBulk = useTranslations('bulk_actions');
  const tCreate = useTranslations('create_related');
  const tPrint = useTranslations('print_menu');
  const tSend = useTranslations('detail_send');
  const tHeader = useTranslations('detail_header');
  return {
    saveLabel: tCommon('save'),
    closeLabel: tCommon('close'),
    modifyLabel: tBulk('trigger'),
    createDocLabel: tCreate('trigger_doc'),
    printLabel: tPrint('trigger'),
    sendLabel: tSend('trigger'),
    applicableLabel: tHeader('applicable'),
    waitingLabel: tHeader('waiting'),
    numberPlaceholder: tHeader('number_auto'),
    numberTooltip: tHeader('number_auto_tooltip'),
    errorTitle: tHeader('save_error'),
    errorRetryLabel: tCommon('retry'),
    // Date/time strip — hardcoded Russian in the DS until 2026-07-31; the uz UI
    // showed «от / Открыть календарь / Дата документа / дд.мм.гггг / чч:мм»
    // on prod. `from` already carried the uz decision for the separator («—»).
    dateSeparatorLabel: tHeader('from'),
    openCalendarLabel: tHeader('open_calendar'),
    datePlaceholder: tHeader('date_placeholder'),
    dateAriaLabel: tHeader('date_aria'),
    timePlaceholder: tHeader('time_placeholder'),
    timeAriaLabel: tHeader('time_aria'),
    statusFallbackLabel: tHeader('status'),
  };
}
