import * as React from 'react';
import { cn } from '../lib/cn.ts';

export const Skeleton = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      aria-hidden
      className={cn(
        'animate-pulse rounded-[var(--ms-radius-sm)] bg-[var(--ms-bg-muted)]',
        className,
      )}
      {...props}
    />
  ),
);
Skeleton.displayName = 'Skeleton';

export function TableSkeleton({ rows = 5, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="w-full space-y-2 p-2">
      {/* Placeholder boxes from `Array.from({length})`: interchangeable, stateless
          and never reordered, so there is no identity to key on — the index IS the
          identity. (3× suppressions below.) */}
      <div className="flex gap-2">
        {Array.from({ length: cols }).map((_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity beyond their position
          <Skeleton key={i} className="h-8 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: see above — placeholder rows carry no data
        <div key={r} className="flex gap-2">
          {Array.from({ length: cols }).map((_, c) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: see above — placeholder cells carry no data
            <Skeleton key={c} className="h-6 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}
