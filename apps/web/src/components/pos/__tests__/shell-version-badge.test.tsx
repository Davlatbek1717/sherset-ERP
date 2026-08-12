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
