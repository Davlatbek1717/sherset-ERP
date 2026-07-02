import { renderWithProviders, screen } from '@/test-utils';
import { type AuditEntry, HistoryTimeline } from '@moysklad/ui';
/**
 * HistoryTimeline (from @moysklad/ui) tests — moysklad «История изменений»
 * change-history list. Each entry shows the editor's avatar + bold name +
 * ", <action> <timestamp>", followed by a three-column «Поле / Было / Стало»
 * diff table (NO timeline rail, NO line-through — matches the live audit modal).
 *
 * Tests guard the empty state, the entry rendering (action, user, timestamp),
 * the 3-column diff table (one row per field), the optional translateAction/
 * translateField/translateValue hooks, and the value formatter.
 */
import { describe, expect, it } from 'vitest';

const ENTRY_BASE: AuditEntry = {
  id: 'e1',
  action: 'demand.post',
  at: '2026-04-24T12:00:00Z',
  user: { id: 'u1', name: 'Alice', email: 'a@x.com' },
  fieldChanges: null,
};

describe('HistoryTimeline', () => {
  describe('empty state', () => {
    it('renders the empty message when entries=[]', () => {
      renderWithProviders(<HistoryTimeline entries={[]} />);
      const empty = screen.getByTestId('history-empty');
      expect(empty).toBeInTheDocument();
      expect(empty.textContent).toContain('Tarix yo');
    });

    it('honors custom emptyLabel', () => {
      renderWithProviders(<HistoryTimeline entries={[]} emptyLabel="No history yet" />);
      expect(screen.getByText('No history yet')).toBeInTheDocument();
    });

    it('does NOT render any entry block when empty', () => {
      renderWithProviders(<HistoryTimeline entries={[]} />);
      expect(screen.queryByTestId('history-entry-e1')).toBeNull();
    });
  });

  describe('entry rendering (no diffs)', () => {
    it('renders one entry block per entry with the correct testId', () => {
      renderWithProviders(<HistoryTimeline entries={[ENTRY_BASE]} />);
      expect(screen.getByTestId('history-entry-e1')).toBeInTheDocument();
    });

    it('renders the raw action when no translateAction provided', () => {
      renderWithProviders(<HistoryTimeline entries={[ENTRY_BASE]} />);
      expect(screen.getByTestId('history-entry-e1').textContent).toContain('demand.post');
    });

    it('renders the user name (bold, no leading "·")', () => {
      renderWithProviders(<HistoryTimeline entries={[ENTRY_BASE]} />);
      expect(screen.getByText('Alice')).toBeInTheDocument();
      // moysklad header is "<Name>, <action> <date>" — no "·" separator.
      expect(screen.queryByText('· Alice')).toBeNull();
    });

    it('does NOT render user when user=null', () => {
      renderWithProviders(<HistoryTimeline entries={[{ ...ENTRY_BASE, user: null }]} />);
      expect(screen.queryByText(/Alice/)).toBeNull();
    });

    it('renders the timestamp via formatDate', () => {
      renderWithProviders(<HistoryTimeline entries={[ENTRY_BASE]} />);
      const text = screen.getByTestId('history-entry-e1').textContent;
      expect(text).toMatch(/24/);
      expect(text).toMatch(/2026/);
    });

    it('accepts Date object as `at` (not just ISO string)', () => {
      renderWithProviders(
        <HistoryTimeline entries={[{ ...ENTRY_BASE, at: new Date('2026-04-24T12:00:00Z') }]} />,
      );
      expect(screen.getByTestId('history-entry-e1').textContent).toMatch(/24/);
    });
  });

  describe('translateAction hook', () => {
    it('calls translateAction with the raw action string', () => {
      renderWithProviders(
        <HistoryTimeline entries={[ENTRY_BASE]} translateAction={(a) => `[${a.toUpperCase()}]`} />,
      );
      expect(screen.getByText(/\[DEMAND\.POST\]/)).toBeInTheDocument();
    });

    it('translateAction can return JSX', () => {
      renderWithProviders(
        <HistoryTimeline
          entries={[ENTRY_BASE]}
          translateAction={(a) => <em data-test-id="tx-action">{a}</em>}
        />,
      );
      expect(screen.getByTestId('tx-action')).toBeInTheDocument();
    });
  });

  describe('field diff rendering (3-column Поле/Было/Стало table)', () => {
    it('does NOT render the diff table when fieldChanges is empty/null', () => {
      renderWithProviders(<HistoryTimeline entries={[{ ...ENTRY_BASE, fieldChanges: {} }]} />);
      expect(screen.queryByTestId('history-diff-table')).toBeNull();
    });

    it('renders custom column headers', () => {
      renderWithProviders(
        <HistoryTimeline
          entries={[{ ...ENTRY_BASE, fieldChanges: { x: { before: 'a', after: 'b' } } }]}
          fieldHeader="Поле"
          beforeHeader="Было"
          afterHeader="Стало"
        />,
      );
      expect(screen.getByText('Поле')).toBeInTheDocument();
      expect(screen.getByText('Было')).toBeInTheDocument();
      expect(screen.getByText('Стало')).toBeInTheDocument();
    });

    it('renders one diff row per fieldChanges entry', () => {
      const { container } = renderWithProviders(
        <HistoryTimeline
          entries={[
            {
              ...ENTRY_BASE,
              fieldChanges: {
                vatEnabled: { before: false, after: true },
                comment: { before: 'old', after: 'new' },
              },
            },
          ]}
        />,
      );
      // tbody rows only (thead has the header row)
      const bodyRows = container.querySelectorAll('tbody tr');
      expect(bodyRows).toHaveLength(2);
    });

    it('hides internal fields (version/updatedAt/createdAt) from the diff', () => {
      const { container } = renderWithProviders(
        <HistoryTimeline
          entries={[
            {
              ...ENTRY_BASE,
              fieldChanges: {
                version: { before: 1, after: 2 },
                comment: { before: 'a', after: 'b' },
              },
            },
          ]}
        />,
      );
      // only the business field renders — moysklad never shows the version counter.
      expect(container.querySelectorAll('tbody tr')).toHaveLength(1);
      expect(screen.queryByText('version')).toBeNull();
      expect(screen.getByText('comment')).toBeInTheDocument();
    });

    it('formats an ISO-datetime diff value instead of the raw string', () => {
      renderWithProviders(
        <HistoryTimeline
          entries={[
            {
              ...ENTRY_BASE,
              fieldChanges: { moment: { before: '2026-06-13T18:02:30.273Z', after: null } },
            },
          ]}
        />,
      );
      // raw ISO must NOT leak; the value is rendered via formatDate (dotted date).
      expect(screen.queryByText('2026-06-13T18:02:30.273Z')).toBeNull();
      expect(screen.getAllByText(/\d{2}\.\d{2}\.2026/).length).toBeGreaterThan(0);
    });

    it('renders the field key (no trailing colon) when no translateField', () => {
      renderWithProviders(
        <HistoryTimeline
          entries={[
            { ...ENTRY_BASE, fieldChanges: { vatEnabled: { before: false, after: true } } },
          ]}
        />,
      );
      expect(screen.getByText('vatEnabled')).toBeInTheDocument();
      expect(screen.queryByText('vatEnabled:')).toBeNull();
    });

    it('translateField changes the rendered field label', () => {
      renderWithProviders(
        <HistoryTimeline
          entries={[
            { ...ENTRY_BASE, fieldChanges: { vatEnabled: { before: false, after: true } } },
          ]}
          translateField={(f) => (f === 'vatEnabled' ? 'NDS faol' : f)}
        />,
      );
      expect(screen.getByText('NDS faol')).toBeInTheDocument();
    });

    it('renders before and after as plain cells (no line-through)', () => {
      const { container } = renderWithProviders(
        <HistoryTimeline
          entries={[{ ...ENTRY_BASE, fieldChanges: { x: { before: 'old', after: 'new' } } }]}
        />,
      );
      expect(screen.getByText('old')).toBeInTheDocument();
      expect(screen.getByText('new')).toBeInTheDocument();
      // moysklad shows the old value plainly — no strike-through.
      const strike = Array.from(container.querySelectorAll('*')).find(
        (el) => el.textContent === 'old' && el.className?.toString().includes('line-through'),
      );
      expect(strike).toBeUndefined();
    });
  });

  describe('translateValue hook (FSM status diff localization)', () => {
    const TRANSITION_ENTRY: AuditEntry = {
      ...ENTRY_BASE,
      action: 'transition:completed',
      fieldChanges: { from: { before: 'in_progress', after: 'completed' } },
    };

    it('uses translateValue for both before and after when it returns a string', () => {
      renderWithProviders(
        <HistoryTimeline
          entries={[TRANSITION_ENTRY]}
          translateValue={(field, value, action) =>
            field === 'from' && action.startsWith('transition') && typeof value === 'string'
              ? `<${value.toUpperCase()}>`
              : undefined
          }
        />,
      );
      expect(screen.getByText('<IN_PROGRESS>')).toBeInTheDocument();
      expect(screen.getByText('<COMPLETED>')).toBeInTheDocument();
      expect(screen.queryByText('in_progress')).toBeNull();
      expect(screen.queryByText('completed')).toBeNull();
    });

    it('falls back to formatValue when translateValue returns undefined', () => {
      renderWithProviders(
        <HistoryTimeline
          entries={[{ ...ENTRY_BASE, fieldChanges: { comment: { before: 'old', after: 'new' } } }]}
          translateValue={() => undefined}
        />,
      );
      expect(screen.getByText('old')).toBeInTheDocument();
      expect(screen.getByText('new')).toBeInTheDocument();
    });

    it('passes the entry action to translateValue', () => {
      const seen: string[] = [];
      renderWithProviders(
        <HistoryTimeline
          entries={[TRANSITION_ENTRY]}
          translateValue={(_field, _value, action) => {
            seen.push(action);
            return undefined;
          }}
        />,
      );
      expect(seen).toContain('transition:completed');
    });
  });

  describe('formatValue', () => {
    it('renders "—" for null/undefined', () => {
      renderWithProviders(
        <HistoryTimeline
          entries={[{ ...ENTRY_BASE, fieldChanges: { x: { before: null, after: undefined } } }]}
        />,
      );
      const dashes = screen.getAllByText('—');
      expect(dashes.length).toBeGreaterThanOrEqual(2);
    });

    it('renders booleans as "true"/"false"', () => {
      renderWithProviders(
        <HistoryTimeline
          entries={[{ ...ENTRY_BASE, fieldChanges: { x: { before: true, after: false } } }]}
        />,
      );
      expect(screen.getByText('true')).toBeInTheDocument();
      expect(screen.getByText('false')).toBeInTheDocument();
    });

    it('truncates long strings with "..." after 77 chars', () => {
      const longStr = 'a'.repeat(100);
      renderWithProviders(
        <HistoryTimeline
          entries={[{ ...ENTRY_BASE, fieldChanges: { x: { before: longStr, after: 'short' } } }]}
        />,
      );
      const truncated = screen.getByText(/^a+\.\.\.$/);
      expect(truncated.textContent).toHaveLength(80);
    });

    it('JSON-stringifies object values', () => {
      renderWithProviders(
        <HistoryTimeline
          entries={[{ ...ENTRY_BASE, fieldChanges: { x: { before: { a: 1 }, after: { b: 2 } } } }]}
        />,
      );
      expect(screen.getByText('{"a":1}')).toBeInTheDocument();
      expect(screen.getByText('{"b":2}')).toBeInTheDocument();
    });
  });

  describe('multiple entries', () => {
    it('renders entries in the order provided', () => {
      renderWithProviders(
        <HistoryTimeline
          entries={[
            { ...ENTRY_BASE, id: 'e1', action: 'first' },
            { ...ENTRY_BASE, id: 'e2', action: 'second' },
            { ...ENTRY_BASE, id: 'e3', action: 'third' },
          ]}
        />,
      );
      expect(screen.getByTestId('history-entry-e1').textContent).toContain('first');
      expect(screen.getByTestId('history-entry-e2').textContent).toContain('second');
      expect(screen.getByTestId('history-entry-e3').textContent).toContain('third');
    });
  });
});
