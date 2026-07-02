import * as React from 'react';
import { cn } from '../lib/cn.ts';

export interface AvatarProps {
  /** Display name — used to derive initials and the alt text. */
  name: string;
  /** Optional image URL. Falls back to initials when missing or 404. */
  src?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  /** Override the auto-derived initials. */
  initials?: string;
  /** Border ring colour — useful for status (online, away, busy). */
  ring?: 'none' | 'success' | 'warning' | 'destructive' | 'brand';
  className?: string;
}

const SIZE: Record<NonNullable<AvatarProps['size']>, string> = {
  xs: 'h-5 w-5 text-[9px]',
  sm: 'h-6 w-6 text-[10px]',
  md: 'h-8 w-8 text-xs',
  lg: 'h-10 w-10 text-sm',
  xl: 'h-14 w-14 text-base',
};

const RING: Record<NonNullable<AvatarProps['ring']>, string> = {
  none: '',
  success: 'ring-2 ring-[var(--ms-text-success)] ring-offset-1',
  warning: 'ring-2 ring-[var(--ms-text-warning)] ring-offset-1',
  destructive: 'ring-2 ring-[var(--ms-text-destructive)] ring-offset-1',
  brand: 'ring-2 ring-[var(--ms-text-brand)] ring-offset-1',
};

/**
 * Circular avatar with image-or-initials fallback. The initials path
 * picks a stable colour from the name hash so the same user always gets
 * the same tint — gives the team list a recognisable rhythm without
 * forcing every user to upload a photo.
 */
export function Avatar({
  name,
  src,
  size = 'md',
  initials,
  ring = 'none',
  className,
}: AvatarProps) {
  const [errored, setErrored] = React.useState(false);
  const showImage = src && !errored;
  const text = initials ?? deriveInitials(name);
  const tint = colorFor(name);

  return (
    <span
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full',
        'font-semibold leading-none',
        !showImage && tint,
        SIZE[size],
        RING[ring],
        className,
      )}
      aria-label={name}
      role="img"
    >
      {showImage ? (
        <img
          src={src ?? undefined}
          alt={name}
          loading="lazy"
          onError={() => setErrored(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <span aria-hidden>{text}</span>
      )}
    </span>
  );
}

export const AVATAR_TINTS = [
  'bg-rose-100 text-rose-700',
  'bg-amber-100 text-amber-700',
  'bg-emerald-100 text-emerald-700',
  'bg-sky-100 text-sky-700',
  'bg-indigo-100 text-indigo-700',
  'bg-fuchsia-100 text-fuchsia-700',
  'bg-teal-100 text-teal-700',
  'bg-orange-100 text-orange-700',
] as const;

export function colorFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i += 1) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0;
  }
  return AVATAR_TINTS[h % AVATAR_TINTS.length] ?? AVATAR_TINTS[0]!;
}

export function deriveInitials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  if (parts.length === 0 || parts[0] === '') return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]!.charAt(0) + parts[1]!.charAt(0)).toUpperCase();
}
