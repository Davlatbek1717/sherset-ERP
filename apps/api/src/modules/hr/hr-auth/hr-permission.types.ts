export const HR_PAGE_KEYS = [
  'dashboard',
  'messages',
  'reports',
  'employees',
  'tasks',
  'oylik',
  'activity',
  'settings',
] as const;

export type HrPageKey = (typeof HR_PAGE_KEYS)[number];

export const HR_MESSAGE_SECTIONS = [
  'messages:demand',
  'messages:customer_order',
  'messages:payment_in',
  'messages:supply',
  'messages:sales_return',
] as const;

export type HrMessageSection = (typeof HR_MESSAGE_SECTIONS)[number];

export const HR_ACCESS_LEVELS = ['full', 'read', 'own_only'] as const;
export type HrAccessLevel = (typeof HR_ACCESS_LEVELS)[number];

export const HR_PERMISSION_METADATA_KEY = 'hr_permission';

export interface HrPermissionRequirement {
  page: HrPageKey;
  access: HrAccessLevel;
  section?: string;
}
