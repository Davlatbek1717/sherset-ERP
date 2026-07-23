'use client';

import * as React from 'react';
import { cn } from '../lib/cn.ts';

/**
 * Sticky horizontal scrollbar for wide tables (user 2026-07-17).
 *
 * Problem: the app uses natural document scroll (no inner scroll boxes), so a
 * wide table's native horizontal scrollbar renders at the BOTTOM of the table —
 * off-screen whenever the table is longer than the viewport. The user can't
 * scroll left/right while reading the top/middle of a long list.
 *
 * Fix: hide the scroller's native x-scrollbar and render a PROXY scrollbar in
 * a `position: sticky; bottom: 0` strip right after the scroller. While the
 * table crosses the bottom edge of the viewport the proxy pins to the screen
 * bottom; once the table's end scrolls into view the proxy settles into its
 * natural place (exactly where the native scrollbar used to be). scrollLeft is
 * kept in sync both ways, so dragging the proxy pans the table and wheel /
 * trackpad panning of the table moves the proxy.
 *
 * IMPORTANT: ancestors between the proxy and the document must not create a
 * scroll container (`overflow: hidden/auto/scroll`), or the proxy will stick
 * to that box instead of the viewport. Use `overflow-clip` for corner clipping
 * — it clips without becoming a scroll container.
 */

/** Hide the native x-scrollbar of the mirrored scroller (both engines). */
export const HIDE_NATIVE_X_SCROLLBAR = '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden';

export interface StickyXScrollbarProps {
  /** The horizontally-scrolling element this proxy mirrors. */
  scrollerRef: React.RefObject<HTMLElement | null>;
  className?: string;
}

/**
 * The sticky proxy strip itself. Render it as the NEXT SIBLING of the
 * horizontal scroller, inside a common parent that spans only the table
 * (the parent is the sticky containing block — it bounds how long the
 * proxy stays pinned). Hidden automatically while the scroller has no
 * horizontal overflow.
 */
export function StickyXScrollbar({ scrollerRef, className }: StickyXScrollbarProps) {
  const proxyRef = React.useRef<HTMLDivElement>(null);
  const spacerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const scroller = scrollerRef.current;
    const proxy = proxyRef.current;
    const spacer = spacerRef.current;
    if (!scroller || !proxy || !spacer) return;

    const update = () => {
      // +1px slack: fractional layout widths report scrollWidth 1px over
      // clientWidth on some zoom levels without any real overflow.
      const hasOverflow = scroller.scrollWidth > scroller.clientWidth + 1;
      proxy.style.display = hasOverflow ? '' : 'none';
      spacer.style.width = `${scroller.scrollWidth}px`;
      if (hasOverflow) proxy.scrollLeft = scroller.scrollLeft;
    };
    update();

    // Track size changes of the scroller AND its content (the table grows or
    // shrinks when rows load, columns resize, or column visibility changes).
    const ro = new ResizeObserver(update);
    ro.observe(scroller);
    const observeChildren = () => {
      for (const child of Array.from(scroller.children)) ro.observe(child);
    };
    observeChildren();
    // Content nodes may be REPLACED (loading state → table) — re-observe.
    const mo = new MutationObserver(() => {
      observeChildren();
      update();
    });
    mo.observe(scroller, { childList: true });

    // Two-way scrollLeft sync. No loop guard needed: assigning an unchanged
    // scrollLeft does not fire a scroll event, so the ping-pong converges.
    const onScrollerScroll = () => {
      proxy.scrollLeft = scroller.scrollLeft;
    };
    const onProxyScroll = () => {
      scroller.scrollLeft = proxy.scrollLeft;
    };
    scroller.addEventListener('scroll', onScrollerScroll, { passive: true });
    proxy.addEventListener('scroll', onProxyScroll, { passive: true });

    return () => {
      ro.disconnect();
      mo.disconnect();
      scroller.removeEventListener('scroll', onScrollerScroll);
      proxy.removeEventListener('scroll', onProxyScroll);
    };
  }, [scrollerRef]);

  return (
    <div
      ref={proxyRef}
      // Solid surface bg: while pinned the strip paints OVER the last visible
      // rows — without a background the track would blend into row content.
      className={cn(
        'sticky bottom-0 z-[3] overflow-x-auto overflow-y-hidden bg-[var(--ms-bg-surface)]',
        // Explicitly styled scrollbar → Chromium falls back to a CLASSIC
        // (always-visible) bar instead of the auto-hiding overlay style,
        // which would collapse this strip to ~1px and hide the affordance
        // (overlay is the default on macOS / fluent-scrollbar Windows).
        '[&::-webkit-scrollbar]:h-3 [&::-webkit-scrollbar]:bg-[var(--ms-bg-muted)]',
        '[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#c1c1c1]',
        '[&::-webkit-scrollbar-thumb:hover]:bg-[#a8a8a8]',
        // NO `scrollbar-color` here: Chromium ≥121 supports it and, when set,
        // DISCARDS all ::-webkit-scrollbar styling — collapsing this strip
        // back to the 1px overlay bar. Firefox simply shows its stock bar.
        className,
      )}
      // Hidden until the first measurement — avoids an SSR/first-paint strip
      // flashing on tables that don't overflow.
      style={{ display: 'none' }}
      // Redundant control: keyboard users scroll the real container; keep the
      // proxy out of the tab order so it never traps focus.
      tabIndex={-1}
      aria-hidden
      data-test-id="sticky-x-scrollbar"
    >
      <div ref={spacerRef} style={{ height: 1 }} />
    </div>
  );
}

export interface StickyHScrollProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Extra classes for the INNER scrolling box (rarely needed). */
  scrollerClassName?: string;
}

/**
 * Drop-in replacement for a `<div className="overflow-x-auto …">` table
 * wrapper. Visual classes (border / rounded / bg / margins / responsive
 * visibility) go on `className` (the outer box); the inner box does the
 * horizontal scrolling with its native scrollbar hidden, and the sticky
 * proxy strip renders underneath.
 */
export function StickyHScroll({
  children,
  className,
  scrollerClassName,
  ...rest
}: StickyHScrollProps) {
  const scrollerRef = React.useRef<HTMLDivElement>(null);
  return (
    <div className={cn('overflow-clip', className)} {...rest}>
      <div
        ref={scrollerRef}
        className={cn('overflow-x-auto', HIDE_NATIVE_X_SCROLLBAR, scrollerClassName)}
      >
        {children}
      </div>
      <StickyXScrollbar scrollerRef={scrollerRef} />
    </div>
  );
}
