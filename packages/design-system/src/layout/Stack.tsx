import * as React from 'react';
import { cn } from '../lib/cn.ts';

export interface StackProps extends React.HTMLAttributes<HTMLDivElement> {
  direction?: 'row' | 'column';
  gap?: 1 | 2 | 3 | 4 | 5 | 6 | 8;
  align?: 'start' | 'center' | 'end' | 'stretch' | 'baseline';
  justify?: 'start' | 'center' | 'end' | 'between' | 'around';
  wrap?: boolean;
}

const gapMap = {
  1: 'gap-1',
  2: 'gap-2',
  3: 'gap-3',
  4: 'gap-4',
  5: 'gap-5',
  6: 'gap-6',
  8: 'gap-8',
} as const;
const alignMap = {
  start: 'items-start',
  center: 'items-center',
  end: 'items-end',
  stretch: 'items-stretch',
  baseline: 'items-baseline',
} as const;
const justifyMap = {
  start: 'justify-start',
  center: 'justify-center',
  end: 'justify-end',
  between: 'justify-between',
  around: 'justify-around',
} as const;

export const Stack = React.forwardRef<HTMLDivElement, StackProps>(
  ({ className, direction = 'column', gap = 3, align, justify, wrap, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'flex',
        direction === 'row' ? 'flex-row' : 'flex-col',
        gapMap[gap],
        align && alignMap[align],
        justify && justifyMap[justify],
        wrap && 'flex-wrap',
        className,
      )}
      {...props}
    />
  ),
);
Stack.displayName = 'Stack';
