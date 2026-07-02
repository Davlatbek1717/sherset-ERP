import { z } from 'zod';

/**
 * AppInstall — in-app marketplace install state.
 *
 * V1 = static catalog of 6 "available integrations".
 * Install just flips the enabled flag + stores optional config JSON.
 * No actual code execution, no webhook endpoints, no external API calls.
 *
 * V2 deferred:
 *   - Real API integration per appKey
 *   - Code execution sandbox
 *   - Webhook receiver per app
 */

export const APP_KEYS = [
  'telegram_bot',
  'sms_eskiz',
  'webhook_export',
  'soliq_bot',
  'crm_amocrm',
  'analytics_metrika',
] as const;
export type AppKey = (typeof APP_KEYS)[number];

export const AppKeySchema = z.enum(APP_KEYS);

export interface AppCatalogEntry {
  appKey: AppKey;
  iconEmoji: string;
  nameKey: string;
  descriptionKey: string;
}

/**
 * Static app catalog — lives in the service layer.
 * nameKey / descriptionKey are resolved on the frontend via i18n.
 */
export const APP_CATALOG: AppCatalogEntry[] = [
  {
    appKey: 'telegram_bot',
    iconEmoji: '🤖',
    nameKey: 'pages.app_keys.telegram_bot.name',
    descriptionKey: 'pages.app_keys.telegram_bot.description',
  },
  {
    appKey: 'sms_eskiz',
    iconEmoji: '📱',
    nameKey: 'pages.app_keys.sms_eskiz.name',
    descriptionKey: 'pages.app_keys.sms_eskiz.description',
  },
  {
    appKey: 'webhook_export',
    iconEmoji: '🔗',
    nameKey: 'pages.app_keys.webhook_export.name',
    descriptionKey: 'pages.app_keys.webhook_export.description',
  },
  {
    appKey: 'soliq_bot',
    iconEmoji: '🧾',
    nameKey: 'pages.app_keys.soliq_bot.name',
    descriptionKey: 'pages.app_keys.soliq_bot.description',
  },
  {
    appKey: 'crm_amocrm',
    iconEmoji: '🤝',
    nameKey: 'pages.app_keys.crm_amocrm.name',
    descriptionKey: 'pages.app_keys.crm_amocrm.description',
  },
  {
    appKey: 'analytics_metrika',
    iconEmoji: '📊',
    nameKey: 'pages.app_keys.analytics_metrika.name',
    descriptionKey: 'pages.app_keys.analytics_metrika.description',
  },
];

export const InstallAppSchema = z.object({
  appKey: AppKeySchema,
  config: z.record(z.unknown()).nullable().optional(),
});
export type InstallAppInput = z.infer<typeof InstallAppSchema>;

export const SaveConfigSchema = z.object({
  config: z.record(z.unknown()).nullable(),
});
export type SaveConfigInput = z.infer<typeof SaveConfigSchema>;
