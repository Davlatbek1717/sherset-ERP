'use client';

import type { PresenceViewer } from '@/hooks/use-presence';

/**
 * moysklad «Смотрит» indicator — shown top-right next to the owner block when
 * OTHER employees are currently viewing the same document. Renders the label
 * plus a small overlapping avatar (coloured initial) per viewer; nothing renders
 * when no one else is looking (the common single-viewer case), exactly like
 * moysklad shows for users without a profile photo.
 */

// Deterministic avatar background per viewer (stable colour from the user id).
const AVATAR_COLORS = ['#2563eb', '#008739', '#e68116', '#a2308f', '#0891b2', '#b91c1c', '#475569'];
function colorFor(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length] ?? '#2563eb';
}

export function PresenceIndicator({
  viewers,
  label,
}: {
  viewers: PresenceViewer[];
  label: string;
}) {
  if (viewers.length === 0) return null;
  const shown = viewers.slice(0, 3);
  const extra = viewers.length - shown.length;
  return (
    <div
      className="flex items-center gap-1.5 text-[var(--ms-text-muted)] text-xs"
      data-test-id="presence-indicator"
    >
      <span>{label}</span>
      <div className="-space-x-1.5 flex">
        {shown.map((v) => (
          // moysklad shows each viewer's avatar with a name tooltip on hover.
          <span
            key={v.userId}
            className="flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 border-[var(--ms-bg-surface)] font-medium text-[11px] text-white"
            style={{ backgroundColor: colorFor(v.userId) }}
            aria-label={v.name}
            title={v.name}
          >
            {v.name?.trim()?.[0]?.toUpperCase() ?? '?'}
          </span>
        ))}
        {extra > 0 && (
          <span
            className="flex h-[22px] items-center justify-center rounded-full border-2 border-[var(--ms-bg-surface)] bg-[var(--ms-text-muted)] px-1 font-medium text-[11px] text-white"
            title={viewers
              .slice(3)
              .map((v) => v.name)
              .join(', ')}
          >
            +{extra}
          </span>
        )}
      </div>
    </div>
  );
}
