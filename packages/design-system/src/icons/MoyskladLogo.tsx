import type * as React from 'react';

/**
 * Moysklad-style cloud logo. The real moysklad.uz brand mark is a
 * stylised cloud rendered as a vector — we reproduce a close visual
 * twin here so the navbar reads as the same product to a returning
 * user without copying the trademarked asset.
 *
 * Sized via the parent's `width`/`height` props or `className`.
 */
export function MoyskladLogo({
  className,
  size = 32,
}: {
  className?: string;
  size?: number;
}): React.ReactElement {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 48"
      width={size}
      height={(size * 48) / 64}
      className={className}
      role="img"
      aria-label="Moysklad"
    >
      {/* Light outer cloud silhouette */}
      <path
        fill="#7BB6E8"
        d="M50.5 22.4c-.4 0-.7 0-1.1.1-.5-7.6-6.9-13.6-14.6-13.6-5.5 0-10.4 3-12.9 7.6-1.4-.7-2.9-1-4.5-1-5.6 0-10.2 4.4-10.6 9.9-3.7.9-6.5 4.2-6.5 8.2 0 4.7 3.8 8.5 8.5 8.5h41.7c5.6 0 10.2-4.6 10.2-10.2s-4.6-9.5-10.2-9.5z"
      />
      {/* Mid layer for depth */}
      <path
        fill="#3B7ED1"
        d="M50.5 24.4c-.4 0-.7 0-1.1.1-.5-6.3-5.7-11.3-12.1-11.3-4.6 0-8.6 2.5-10.7 6.3-1.2-.6-2.4-.8-3.7-.8-4.7 0-8.5 3.6-8.8 8.2-3.1.8-5.4 3.5-5.4 6.8 0 3.9 3.1 7 7 7h34.8c4.7 0 8.5-3.8 8.5-8.5s-3.8-7.8-8.5-7.8z"
      />
      {/* Inner highlight stripe — gives the cloud a "drawer/storage" read */}
      <path fill="#FFFFFF" opacity="0.85" d="M22 30h20v3H22zm0-5h20v3H22z" />
    </svg>
  );
}
