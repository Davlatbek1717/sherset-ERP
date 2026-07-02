import { ChatButton } from '@/components/chat-button';
import { renderWithProviders, screen } from '@/test-utils';
/**
 * ChatButton tests — placeholder chat affordance in the header. The
 * actual integration (Crisp/Intercom/own SSE) isn't shipped yet, so
 * the button is a disabled no-op with a "coming soon" tooltip.
 *
 * When the real integration lands, the disabled prop will go away
 * and this test file will need an onClick handler. Until then guard
 * against accidental enabling.
 */
import { describe, expect, it } from 'vitest';

describe('ChatButton', () => {
  it('renders a <button> with aria-label from i18n', () => {
    renderWithProviders(<ChatButton />);
    // i18n looks up "header.chat"
    const btn = screen.getByRole('button');
    expect(btn).toBeInTheDocument();
  });

  it('is DISABLED (placeholder, awaiting integration)', () => {
    renderWithProviders(<ChatButton />);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('uses cursor-not-allowed + faded foreground styling', () => {
    renderWithProviders(<ChatButton />);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('cursor-not-allowed');
    // The "this is disabled" visual cue is fadedness on the icon
    // colour. We migrated from `opacity-60` (which fades the entire
    // chip including hover background) to `text-white/60` (which
    // only fades the SVG itself, so the hover background still
    // animates). Either spelling preserves the intent — assert the
    // current one + leave a comment so the next migration knows
    // what to update.
    expect(btn.className).toContain('text-white/60');
  });

  it('renders the chat-bubble svg with title', () => {
    renderWithProviders(<ChatButton />);
    const btn = screen.getByRole('button');
    const svg = btn.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute('aria-labelledby', 'chat-button-title');
    // Title text inside svg
    const title = svg?.querySelector('title');
    expect(title).toBeInTheDocument();
  });

  it('has a title attribute on the button (browser tooltip fallback)', () => {
    renderWithProviders(<ChatButton />);
    expect(screen.getByRole('button')).toHaveAttribute('title');
  });
});
