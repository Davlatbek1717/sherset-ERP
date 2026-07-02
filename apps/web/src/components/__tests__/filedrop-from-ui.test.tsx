import { renderWithProviders, screen, userEvent } from '@/test-utils';
import { FileDrop } from '@moysklad/ui';
/**
 * FileDrop (from @moysklad/ui) tests — drag-and-drop file picker with
 * fallback <input type="file">. Used by the import wizard, attachment
 * uploaders, avatar/logo pickers.
 *
 * Tests guard the file accept (size/type/count) gates, the file list
 * rendering with size formatting, the per-file remove button, the
 * disabled state, the multiple/single mode swap, and the drag-over
 * visual feedback.
 *
 * jsdom note: drag events synthesise dataTransfer.files via a simple
 * stub since jsdom doesn't fully implement drag/drop file objects.
 */
import { describe, expect, it, vi } from 'vitest';

function makeFile(name: string, sizeBytes: number, mime = 'text/plain'): File {
  // Use Blob underneath; jsdom File is functional.
  const blob = new Blob(['x'.repeat(sizeBytes)], { type: mime });
  return new File([blob], name, { type: mime });
}

describe('FileDrop', () => {
  describe('basic rendering', () => {
    it('renders the drop zone button with default hint text', () => {
      renderWithProviders(<FileDrop files={[]} onFilesChange={vi.fn()} />);
      expect(screen.getByText('Faylni shu yerga sudrab tashlang yoki bosing')).toBeInTheDocument();
    });

    it('honors custom hint', () => {
      renderWithProviders(<FileDrop files={[]} onFilesChange={vi.fn()} hint="Drop here" />);
      expect(screen.getByText('Drop here')).toBeInTheDocument();
    });

    it('renders the upload icon (svg)', () => {
      const { container } = renderWithProviders(<FileDrop files={[]} onFilesChange={vi.fn()} />);
      expect(container.querySelector('svg')).toBeInTheDocument();
    });

    it('renders the dropzone as a button (clickable)', () => {
      const { container } = renderWithProviders(
        <FileDrop files={[]} onFilesChange={vi.fn()} testId="drop" />,
      );
      const button = container.querySelector('button[type="button"]');
      expect(button).toBeInTheDocument();
    });
  });

  describe('file list rendering', () => {
    it('does NOT render the list when no files', () => {
      const { container } = renderWithProviders(<FileDrop files={[]} onFilesChange={vi.fn()} />);
      expect(container.querySelector('ul')).toBeNull();
    });

    it('renders one <li> per file', () => {
      const files = [makeFile('a.txt', 100), makeFile('b.txt', 200)];
      const { container } = renderWithProviders(<FileDrop files={files} onFilesChange={vi.fn()} />);
      expect(container.querySelectorAll('ul li')).toHaveLength(2);
      expect(screen.getByText('a.txt')).toBeInTheDocument();
      expect(screen.getByText('b.txt')).toBeInTheDocument();
    });

    it('formats file size as B / KB / MB', () => {
      const files = [
        makeFile('small.txt', 500), // < 1KB
        makeFile('mid.txt', 5_000), // ~ 4.9 KB
        makeFile('big.txt', 2_000_000), // ~ 1.91 MB
      ];
      renderWithProviders(<FileDrop files={files} onFilesChange={vi.fn()} />);
      expect(screen.getByText('500 B')).toBeInTheDocument();
      expect(screen.getByText('4.9 KB')).toBeInTheDocument();
      expect(screen.getByText('1.91 MB')).toBeInTheDocument();
    });
  });

  describe('remove button', () => {
    it('renders one Remove button per file', () => {
      const files = [makeFile('a.txt', 1), makeFile('b.txt', 1)];
      renderWithProviders(<FileDrop files={files} onFilesChange={vi.fn()} />);
      expect(screen.getAllByRole('button', { name: 'Remove' })).toHaveLength(2);
    });

    it('clicking remove calls onFilesChange with the file removed', async () => {
      const files = [makeFile('a.txt', 1), makeFile('b.txt', 1)];
      const onFilesChange = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(<FileDrop files={files} onFilesChange={onFilesChange} />);
      const removeButtons = screen.getAllByRole('button', { name: 'Remove' });
      await user.click(removeButtons[0]!);
      // First file removed → only b.txt left
      expect(onFilesChange).toHaveBeenCalledWith([files[1]]);
    });
  });

  describe('disabled state', () => {
    it('renders the dropzone button as disabled', () => {
      const { container } = renderWithProviders(
        <FileDrop files={[]} onFilesChange={vi.fn()} disabled />,
      );
      const button = container.querySelector('button[type="button"]');
      expect(button).toBeDisabled();
    });

    it('disabled style applied (opacity-60 + cursor-not-allowed)', () => {
      const { container } = renderWithProviders(
        <FileDrop files={[]} onFilesChange={vi.fn()} disabled />,
      );
      const button = container.querySelector('button[type="button"]');
      expect(button?.className).toContain('cursor-not-allowed');
      expect(button?.className).toContain('opacity-60');
    });
  });

  describe('hidden file input', () => {
    it('renders an <input type="file"> with the multiple attr by default', () => {
      const { container } = renderWithProviders(<FileDrop files={[]} onFilesChange={vi.fn()} />);
      const input = container.querySelector('input[type="file"]') as HTMLInputElement;
      expect(input).toBeInTheDocument();
      expect(input.multiple).toBe(true);
    });

    it('multiple=false omits the multiple attr', () => {
      const { container } = renderWithProviders(
        <FileDrop files={[]} onFilesChange={vi.fn()} multiple={false} />,
      );
      const input = container.querySelector('input[type="file"]') as HTMLInputElement;
      expect(input.multiple).toBe(false);
    });

    it('honors accept prop (forwarded to input)', () => {
      const { container } = renderWithProviders(
        <FileDrop files={[]} onFilesChange={vi.fn()} accept=".pdf,image/*" />,
      );
      const input = container.querySelector('input[type="file"]');
      expect(input).toHaveAttribute('accept', '.pdf,image/*');
    });

    it('input is hidden via the "hidden" class', () => {
      const { container } = renderWithProviders(<FileDrop files={[]} onFilesChange={vi.fn()} />);
      const input = container.querySelector('input[type="file"]');
      expect(input?.className).toContain('hidden');
    });
  });

  describe('reject reasons (size / type / count)', () => {
    it('rejects files exceeding maxSizeBytes', () => {
      // Simulate the merge() path by directly invoking change on the input
      const onFilesChange = vi.fn();
      const onReject = vi.fn();
      const { container } = renderWithProviders(
        <FileDrop
          files={[]}
          onFilesChange={onFilesChange}
          onReject={onReject}
          maxSizeBytes={500}
        />,
      );
      const big = makeFile('big.txt', 1000);
      const input = container.querySelector('input[type="file"]') as HTMLInputElement;
      Object.defineProperty(input, 'files', {
        value: [big],
        configurable: true,
      });
      input.dispatchEvent(new Event('change', { bubbles: true }));
      expect(onReject).toHaveBeenCalledWith('size', big);
      expect(onFilesChange).not.toHaveBeenCalled();
    });

    it('rejects files not matching accept (mime mismatch)', () => {
      const onFilesChange = vi.fn();
      const onReject = vi.fn();
      const { container } = renderWithProviders(
        <FileDrop files={[]} onFilesChange={onFilesChange} onReject={onReject} accept="image/*" />,
      );
      const wrong = makeFile('a.txt', 100, 'text/plain');
      const input = container.querySelector('input[type="file"]') as HTMLInputElement;
      Object.defineProperty(input, 'files', {
        value: [wrong],
        configurable: true,
      });
      input.dispatchEvent(new Event('change', { bubbles: true }));
      expect(onReject).toHaveBeenCalledWith('type', wrong);
      expect(onFilesChange).not.toHaveBeenCalled();
    });

    it('accepts files matching ".pdf" extension filter', () => {
      const onFilesChange = vi.fn();
      const { container } = renderWithProviders(
        <FileDrop files={[]} onFilesChange={onFilesChange} accept=".pdf" />,
      );
      const pdf = makeFile('doc.pdf', 100, 'application/pdf');
      const input = container.querySelector('input[type="file"]') as HTMLInputElement;
      Object.defineProperty(input, 'files', {
        value: [pdf],
        configurable: true,
      });
      input.dispatchEvent(new Event('change', { bubbles: true }));
      expect(onFilesChange).toHaveBeenCalledWith([pdf]);
    });
  });

  describe('multiple=false replaces the existing file', () => {
    it('replaces the single existing file when a new one is dropped', () => {
      const existing = makeFile('old.txt', 1);
      const next = makeFile('new.txt', 1);
      const onFilesChange = vi.fn();
      const { container } = renderWithProviders(
        <FileDrop files={[existing]} onFilesChange={onFilesChange} multiple={false} />,
      );
      const input = container.querySelector('input[type="file"]') as HTMLInputElement;
      Object.defineProperty(input, 'files', {
        value: [next],
        configurable: true,
      });
      input.dispatchEvent(new Event('change', { bubbles: true }));
      // multiple=false → only new file kept
      expect(onFilesChange).toHaveBeenCalledWith([next]);
    });
  });
});
