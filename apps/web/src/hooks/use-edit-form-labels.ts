'use client';

import { useTranslations } from 'next-intl';

/**
 * Localized labels for the shared `<EditForm/>` pattern (@moysklad/ui).
 *
 * `<EditForm/>` is a locale-agnostic design-system component whose prop
 * defaults are Uzbek (`saveLabel='Saqlash'`, `cancelLabel='Bekor qilish'`,
 * `errorTitle='Xato'`). A page that renders it WITHOUT passing these props
 * leaks Uzbek strings into the RU UI. Spread this hook's result to localize
 * all three at once:
 *
 *   const editFormLabels = useEditFormLabels();
 *   <EditForm {...editFormLabels} title={…} onSubmit={…}>…</EditForm>
 *
 * - saveLabel  → common.save  (ru «Сохранить» / uz «Saqlash»)
 * - cancelLabel→ common.close (ru «Закрыть»  / uz «Yopish») — moysklad's entity
 *   cards use «Закрыть» (close/navigate-away), NOT «Отмена»; our cancelHref
 *   navigates back to the list, so the "close" semantic matches.
 * - errorTitle → common.error_title (ru «Ошибка» / uz «Xato»)
 *
 * UZ: save «Saqlash» and errorTitle «Xato» are unchanged from the old defaults;
 * cancel intentionally moves «Bekor qilish» → «Yopish» so UZ matches moysklad's
 * «Закрыть» (close) rather than «Отмена» (cancel). RU was leaking Uzbek before.
 */
export function useEditFormLabels() {
  const t = useTranslations('common');
  return {
    saveLabel: t('save'),
    cancelLabel: t('close'),
    errorTitle: t('error_title'),
  };
}
