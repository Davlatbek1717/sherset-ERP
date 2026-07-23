import { api } from '@/lib/api-client';
import { renderWithProviders, userEvent } from '@/test-utils';
import { screen, waitFor } from '@testing-library/react';
/**
 * DetailContentTabs tests — verify the moysklad-grounded document-detail body:
 * TWO position-area tabs (Главная / Связанные документы) + inline bottom sections
 * for Задачи / Файлы / Изменения (NOT tabs). Covers tab swap, the optional
 * positionsLabel + relatedSlot overrides, the inline slots, and lazy history.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DetailContentTabs } from './detail-content-tabs';

vi.mock('@/lib/api-client', () => ({
  api: {
    get: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    post: vi.fn(),
  },
}));

describe('DetailContentTabs', () => {
  const baseProps = {
    auditEntity: 'CustomerOrder',
    entityId: 'doc-1',
    relatedGroups: [],
    children: <div data-test-id="positions-body">Position editor here</div>,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the moysklad new-design FIVE tabs (files/tasks/events are tabs)', () => {
    renderWithProviders(
      <DetailContentTabs {...baseProps} filesSlot={<div data-test-id="files-body">Files</div>} />,
    );
    expect(screen.getByTestId('tab-positions')).toBeInTheDocument();
    expect(screen.getByTestId('tab-related')).toBeInTheDocument();
    expect(screen.getByTestId('tab-files')).toBeInTheDocument();
    expect(screen.getByTestId('tab-tasks')).toBeInTheDocument();
    expect(screen.getByTestId('tab-events')).toBeInTheDocument();
  });

  it('renders the filesSlot inside the «Файлы» tab', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <DetailContentTabs {...baseProps} filesSlot={<div data-test-id="files-body">Files</div>} />,
    );
    await user.click(screen.getByTestId('tab-files'));
    expect(screen.getByTestId('detail-files-section')).toBeInTheDocument();
    expect(screen.getByTestId('files-body')).toBeInTheDocument();
  });

  it('accepts historyInline (compat) — history lives in the «События» tab now', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DetailContentTabs {...baseProps} historyInline={false} />);
    await user.click(screen.getByTestId('tab-events'));
    expect(screen.getByTestId('detail-events-section')).toBeInTheDocument();
  });

  it('renders the tasksSlot inside the «Задачи» tab', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <DetailContentTabs
        {...baseProps}
        tasksSlot={<div data-test-id="tasks-body">Tasks</div>}
        filesSlot={<div data-test-id="files-body">Files</div>}
      />,
    );
    await user.click(screen.getByTestId('tab-tasks'));
    expect(screen.getByTestId('detail-tasks-section')).toBeInTheDocument();
    expect(screen.getByTestId('tasks-body')).toBeInTheDocument();
  });

  it('renders the positions body by default (Главная tab is initial)', () => {
    renderWithProviders(<DetailContentTabs {...baseProps} />);
    expect(screen.getByTestId('positions-body')).toBeInTheDocument();
  });

  it('uses the default "Pozitsiyalar" label when positionsLabel is omitted', () => {
    renderWithProviders(<DetailContentTabs {...baseProps} />);
    expect(screen.getByTestId('tab-positions').textContent).toMatch(/Pozitsiyalar/);
  });

  it('uses the positionsLabel override (money docs pass "Taqsimlanish")', () => {
    renderWithProviders(<DetailContentTabs {...baseProps} positionsLabel="Taqsimlanish" />);
    expect(screen.getByTestId('tab-positions').textContent).toMatch(/Taqsimlanish/);
  });

  it('swaps to the related tab body when "Bog\'liq hujjatlar" is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DetailContentTabs {...baseProps} />);
    expect(screen.getByTestId('tab-positions')).toHaveAttribute('data-state', 'active');
    await user.click(screen.getByTestId('tab-related'));
    await waitFor(() => {
      expect(screen.getByTestId('tab-related')).toHaveAttribute('data-state', 'active');
    });
    expect(screen.getByTestId('tab-positions')).toHaveAttribute('data-state', 'inactive');
  });

  it('renders the relatedSlot override instead of the default RelatedDocsPanel', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <DetailContentTabs
        {...baseProps}
        relatedSlot={<div data-test-id="custom-related">Custom diagram here</div>}
      />,
    );
    await user.click(screen.getByTestId('tab-related'));
    expect(screen.getByTestId('custom-related')).toBeInTheDocument();
  });

  it('fetches the audit log when the entityId is set', async () => {
    renderWithProviders(<DetailContentTabs {...baseProps} entityId="doc-42" />);
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(expect.stringContaining('entity=CustomerOrder'));
    });
    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('entityId=doc-42'));
  });

  it('skips the audit fetch when entityId is empty', () => {
    renderWithProviders(<DetailContentTabs {...baseProps} entityId="" />);
    expect(api.get).not.toHaveBeenCalled();
  });

  it('renders the body wrapper with data-test-id="detail-content-tabs"', () => {
    renderWithProviders(<DetailContentTabs {...baseProps} />);
    expect(screen.getByTestId('detail-content-tabs')).toBeInTheDocument();
  });
});
