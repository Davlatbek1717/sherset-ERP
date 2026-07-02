'use client';

import { useTranslations } from 'next-intl';

/**
 * Placeholder chat affordance shown in the header right cluster.
 * moysklad ships a live-chat widget here that opens a support
 * conversation; we don't have that integration yet, so the button
 * is a no-op for now and renders a tooltip explaining the feature
 * is coming. When the real integration lands (Crisp / Intercom /
 * own SSE feed), wire up `onClick` instead of changing markup.
 */
export function ChatButton() {
  const t = useTranslations('header');
  return (
    <button
      type="button"
      aria-label={t('chat')}
      title={t('chat_tooltip')}
      disabled
      className="inline-flex h-8 w-8 cursor-not-allowed items-center justify-center rounded text-white/60 transition-colors hover:bg-white/10"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        role="img"
        aria-labelledby="chat-button-title"
      >
        <title id="chat-button-title">{t('chat')}</title>
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    </button>
  );
}
