'use client';

import * as TabsPrimitive from '@radix-ui/react-tabs';
import * as React from 'react';
import { cn } from '../lib/cn.ts';

export const Tabs = TabsPrimitive.Root;

/** Tab visual styles:
 *  - `underline` (default): a flat row with a brand underline under the active tab.
 *  - `boxed`: equal-width grey boxes, the active tab filled brand-blue (moysklad's
 *    counterparty-card / CRM activity-tab strip). */
type TabsVariant = 'underline' | 'boxed';
const TabsVariantContext = React.createContext<TabsVariant>('underline');

export const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> & { variant?: TabsVariant }
>(({ className, variant = 'underline', ...props }, ref) => (
  <TabsVariantContext.Provider value={variant}>
    <TabsPrimitive.List
      ref={ref}
      className={cn(
        // Mobile: long tab strips (product card ~6 tabs) drove page overflow —
        // below `md` the list becomes a swipeable single row, desktop untouched.
        variant === 'boxed'
          ? 'flex items-stretch gap-1 max-md:flex-wrap'
          : 'inline-flex items-center gap-1 border-[var(--ms-border-default)] border-b max-md:w-full max-md:max-w-full max-md:overflow-x-auto max-md:[&::-webkit-scrollbar]:hidden max-md:[scrollbar-width:none]',
        className,
      )}
      {...props}
    />
  </TabsVariantContext.Provider>
));
TabsList.displayName = 'TabsList';

export const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => {
  const variant = React.useContext(TabsVariantContext);
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        'font-medium text-sm transition-colors duration-[var(--ms-duration-fast)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ms-border-focus)] focus-visible:ring-offset-1',
        'disabled:pointer-events-none disabled:opacity-50',
        variant === 'boxed'
          ? cn(
              'flex-1 rounded-[var(--ms-radius-default)] px-4 py-2 text-center',
              // moysklad CRM-card tab colours, pixel-sampled from the live capture
              // (events-tab-2026-06-23/01-events-tab.png): inactive #e2e2e2, active #1f75a8.
              'bg-[#e2e2e2] text-[var(--ms-text-secondary)] hover:bg-[#d8d8d8]',
              'data-[state=active]:bg-[#1f75a8] data-[state=active]:text-white',
            )
          : cn(
              '-mb-px border-transparent border-b-2 px-4 py-2 text-[var(--ms-text-secondary)]',
              'hover:text-[var(--ms-text-primary)]',
              'data-[state=active]:border-[var(--ms-brand-500)] data-[state=active]:text-[var(--ms-text-brand)]',
            ),
        className,
      )}
      {...props}
    />
  );
});
TabsTrigger.displayName = 'TabsTrigger';

export const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      'mt-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ms-border-focus)] focus-visible:ring-offset-2',
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = 'TabsContent';
