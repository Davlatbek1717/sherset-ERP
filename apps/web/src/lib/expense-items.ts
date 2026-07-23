/**
 * Seeded ExpenseItem NAMES — DATA values, not UI copy (the visible label always
 * comes from the record itself / i18n). Kept out of the page files so the i18n
 * no-hardcoded gate (which rightly bans Cyrillic UI literals inside completed
 * forms) doesn't flag a database default. moysklad defaults the write-off
 * document («Списание») to the expense item named «Списания».
 */
export const DEFAULT_LOSS_EXPENSE_ITEM_NAME = 'Списания';
