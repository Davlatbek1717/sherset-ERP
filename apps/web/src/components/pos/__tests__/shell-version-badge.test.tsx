import { render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '../../../messages/uz.json';
import { ShellVersionBadge } from '../shell-version-badge';

// Haqiqiy uz.json bilan render — mock emas: `pos.shell_*` kaliti yo'qolsa
// next-intl xato otadi va test darhol qizaradi.
const renderBadge = () =>
  render(
    <NextIntlClientProvider locale="uz" messages={messages}>
      <ShellVersionBadge />
    </NextIntlClientProvider>,
  );

const setShell = (status: unknown) => {
  (window as unknown as { electronAPI?: unknown }).electronAPI = {
    isSherset: true,
    version: '1.5.0',
    shellStatus: vi.fn().mockResolvedValue(status),
  };
};

afterEach(() => {
  (window as unknown as { electronAPI?: unknown }).electronAPI = undefined;
});

describe('ShellVersionBadge — qurilma versiyasi ekranda (K06)', () => {
  it('brauzerda (qobiqsiz) HECH NARSA chizmaydi', () => {
    const { container } = renderBadge();
    expect(container).toBeEmptyDOMElement();
  });

  it('qobiqda versiyani ko`rsatadi', async () => {
    setShell({ version: '1.5.0', updateReady: false, defaultPrinter: 'XP-80' });
    renderBadge();
    await waitFor(() => expect(screen.getByText(/1\.5\.0/)).toBeInTheDocument());
  });

  it('sukut printer nomini ko`rsatadi (chek qayerga chiqadi — K18 diagnostikasi)', async () => {
    setShell({ version: '1.5.0', updateReady: false, defaultPrinter: 'XP-80' });
    renderBadge();
    await waitFor(() => expect(screen.getByText(/XP-80/)).toBeInTheDocument());
  });

  it('printer YO`Q bo`lsa buni OCHIQ aytadi (jim bo`sh qator emas)', async () => {
    setShell({ version: '1.5.0', updateReady: false, defaultPrinter: '' });
    renderBadge();
    await waitFor(() => expect(screen.getByTestId('shell-printer-missing')).toBeInTheDocument());
  });

  it('yangilanish kutayotgani ko`rinadi', async () => {
    setShell({ version: '1.5.0', updateReady: true, defaultPrinter: 'XP-80' });
    renderBadge();
    await waitFor(() => expect(screen.getByTestId('shell-update-ready')).toBeInTheDocument());
  });

  it('eski qobiqda (shellStatus yo`q) faqat versiyani ko`rsatadi, qulamaydi', async () => {
    (window as unknown as { electronAPI?: unknown }).electronAPI = {
      isSherset: true,
      version: '1.4.0',
    };
    renderBadge();
    await waitFor(() => expect(screen.getByText(/1\.4\.0/)).toBeInTheDocument());
  });
});

// F9 (POS redizayn, 2026-08-15) — spec §3.1: badge POS headeriga singdiriladi.
// `variant='header'` oddiy oqimda turadi (fixed EMAS — klaviatura-evristika
// va header-layout sharti); default `floating` kassa-kirish ekranida qoladi.
describe('ShellVersionBadge — header varianti (F9, spec §3.1)', () => {
  const renderVariant = (variant: 'floating' | 'header') =>
    render(
      <NextIntlClientProvider locale="uz" messages={messages}>
        <ShellVersionBadge variant={variant} />
      </NextIntlClientProvider>,
    );

  it('`variant="header"` fixed EMAS — header oqimida turadi', async () => {
    setShell({ version: '1.8.0', updateReady: false, defaultPrinter: 'XP-80' });
    renderVariant('header');
    await waitFor(() => expect(screen.getByTestId('shell-version-badge')).toBeInTheDocument());
    const el = screen.getByTestId('shell-version-badge');
    expect(el.className).not.toMatch(/(^|\s)fixed(\s|$)/);
  });

  it('default (floating) avvalgidek fixed burchakda — kassa-kirish regressi yo`q', async () => {
    setShell({ version: '1.8.0', updateReady: false, defaultPrinter: 'XP-80' });
    renderBadge();
    await waitFor(() => expect(screen.getByTestId('shell-version-badge')).toBeInTheDocument());
    expect(screen.getByTestId('shell-version-badge').className).toMatch(/(^|\s)fixed(\s|$)/);
  });

  it('`variant="header"` brauzerda (qobiqsiz) baribir hech narsa chizmaydi', () => {
    const { container } = renderVariant('header');
    expect(container).toBeEmptyDOMElement();
  });
});
