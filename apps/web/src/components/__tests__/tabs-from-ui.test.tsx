import { renderWithProviders, screen, userEvent } from '@/test-utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@moysklad/ui';
/**
 * Tabs (from @moysklad/ui) tests — Radix-backed tab strip used by
 * DetailContentTabs (Pozitsiyalar/Bog'liq/Fayllar/Tarix) and any
 * other places we want a moysklad-parity underline-active tab UX.
 *
 * The Radix primitive itself is well-tested; these tests guard our
 * STYLING wrapper (className mappings + the active state's
 * underline + the brand color).
 */
import { describe, expect, it } from 'vitest';

describe('Tabs', () => {
  function harness(defaultValue = 'a') {
    return (
      <Tabs defaultValue={defaultValue}>
        <TabsList data-test-id="list">
          <TabsTrigger value="a" data-test-id="ta">
            A
          </TabsTrigger>
          <TabsTrigger value="b" data-test-id="tb">
            B
          </TabsTrigger>
          <TabsTrigger value="c" data-test-id="tc" disabled>
            C
          </TabsTrigger>
        </TabsList>
        <TabsContent value="a" data-test-id="ca">
          Content A
        </TabsContent>
        <TabsContent value="b" data-test-id="cb">
          Content B
        </TabsContent>
        <TabsContent value="c" data-test-id="cc">
          Content C
        </TabsContent>
      </Tabs>
    );
  }

  describe('TabsList', () => {
    it('applies inline-flex + border-b layout baseline', () => {
      renderWithProviders(harness());
      const list = screen.getByTestId('list');
      expect(list.className).toContain('inline-flex');
      expect(list.className).toContain('items-center');
      expect(list.className).toContain('border-b');
      expect(list.className).toContain('ms-border-default');
    });
  });

  describe('TabsTrigger', () => {
    it('applies underline-active style baseline (px-4 py-2 + border-b-2)', () => {
      renderWithProviders(harness());
      const ta = screen.getByTestId('ta');
      expect(ta.className).toContain('px-4');
      expect(ta.className).toContain('py-2');
      expect(ta.className).toContain('border-b-2');
    });

    it('uses secondary text for inactive triggers', () => {
      renderWithProviders(harness());
      // tb is inactive (defaultValue = 'a'); class should include the
      // secondary text token.
      const tb = screen.getByTestId('tb');
      expect(tb.className).toContain('ms-text-secondary');
    });

    it('uses brand color + brand-500 underline for active trigger', () => {
      renderWithProviders(harness());
      const ta = screen.getByTestId('ta');
      // The data-[state=active] selector applies these. Radix sets
      // data-state="active" on the active trigger — assert that, plus
      // the conditional class is in the className string.
      expect(ta).toHaveAttribute('data-state', 'active');
      expect(ta.className).toContain('data-[state=active]:text-[var(--ms-text-brand)]');
      expect(ta.className).toContain('data-[state=active]:border-[var(--ms-brand-500)]');
    });

    it('disabled trigger has disabled visual + pointer-events-none', () => {
      renderWithProviders(harness());
      const tc = screen.getByTestId('tc');
      expect(tc).toBeDisabled();
      expect(tc.className).toContain('disabled:opacity-50');
      expect(tc.className).toContain('disabled:pointer-events-none');
    });
  });

  describe('content + active state swap', () => {
    it('renders the default tab content first', () => {
      renderWithProviders(harness('a'));
      expect(screen.getByTestId('ta')).toHaveAttribute('data-state', 'active');
      expect(screen.getByTestId('tb')).toHaveAttribute('data-state', 'inactive');
      expect(screen.getByTestId('ca')).toBeInTheDocument();
    });

    it('honors a different defaultValue', () => {
      renderWithProviders(harness('b'));
      expect(screen.getByTestId('tb')).toHaveAttribute('data-state', 'active');
      expect(screen.getByTestId('ta')).toHaveAttribute('data-state', 'inactive');
    });

    it('clicking a trigger swaps the active state', async () => {
      const user = userEvent.setup();
      renderWithProviders(harness('a'));
      // click B
      await user.click(screen.getByTestId('tb'));
      expect(screen.getByTestId('tb')).toHaveAttribute('data-state', 'active');
      expect(screen.getByTestId('ta')).toHaveAttribute('data-state', 'inactive');
    });

    it('disabled trigger does NOT swap active state on click', async () => {
      const user = userEvent.setup();
      renderWithProviders(harness('a'));
      // user-event's click on a disabled element no-ops.
      await user.click(screen.getByTestId('tc'));
      expect(screen.getByTestId('ta')).toHaveAttribute('data-state', 'active');
      expect(screen.getByTestId('tc')).toHaveAttribute('data-state', 'inactive');
    });
  });

  describe('TabsContent', () => {
    it('applies mt-4 spacing baseline', () => {
      renderWithProviders(harness());
      const ca = screen.getByTestId('ca');
      expect(ca.className).toContain('mt-4');
    });

    it('focus-visible ring is configured', () => {
      renderWithProviders(harness());
      const ca = screen.getByTestId('ca');
      expect(ca.className).toContain('focus-visible:ring-2');
    });
  });

  describe('keyboard navigation (Radix primitive)', () => {
    it('Arrow Right moves focus to the next trigger and swaps state', async () => {
      const user = userEvent.setup();
      renderWithProviders(harness('a'));
      const ta = screen.getByTestId('ta');
      ta.focus();
      await user.keyboard('{ArrowRight}');
      // Should activate B (Radix moves focus AND activates by default for
      // automatic activation mode).
      expect(screen.getByTestId('tb')).toHaveAttribute('data-state', 'active');
    });
  });

  describe('className merge', () => {
    it('TabsList merges user className', () => {
      renderWithProviders(
        <Tabs defaultValue="a">
          <TabsList className="my-list-extra" data-test-id="list">
            <TabsTrigger value="a">A</TabsTrigger>
          </TabsList>
          <TabsContent value="a">A</TabsContent>
        </Tabs>,
      );
      expect(screen.getByTestId('list').className).toContain('my-list-extra');
    });

    it('TabsTrigger merges user className', () => {
      renderWithProviders(
        <Tabs defaultValue="a">
          <TabsList>
            <TabsTrigger value="a" className="trig-extra" data-test-id="ta">
              A
            </TabsTrigger>
          </TabsList>
          <TabsContent value="a">A</TabsContent>
        </Tabs>,
      );
      expect(screen.getByTestId('ta').className).toContain('trig-extra');
    });
  });
});
