'use client';

import { Paperclip, UploadCloud, X } from 'lucide-react';
import * as React from 'react';
import { cn } from '../lib/cn.ts';

export interface FileDropProps {
  /** Currently-selected files (caller-owned). */
  files: File[];
  onFilesChange: (next: File[]) => void;
  /** Allow multiple selection. Default true. */
  multiple?: boolean;
  /** MIME or extension filter — same syntax as native `accept`. */
  accept?: string;
  /** Hard cap per file in bytes. Files exceeding it are rejected. */
  maxSizeBytes?: number;
  /** Optional cap on total file count. */
  maxFiles?: number;
  /** Called when a file is rejected (size/count cap, mime mismatch). */
  onReject?: (reason: 'size' | 'count' | 'type', file: File) => void;
  disabled?: boolean;
  /** Override the prompt text. Defaults to a translated-elsewhere prompt. */
  hint?: React.ReactNode;
  className?: string;
  testId?: string;
}

/**
 * Drag-and-drop file picker with a fallback `<input type="file">`. Used
 * by the import wizard, attachment uploaders, and the avatar/logo
 * pickers. Caller owns the file list — this component only emits events.
 */
export function FileDrop({
  files,
  onFilesChange,
  multiple = true,
  accept,
  maxSizeBytes,
  maxFiles,
  onReject,
  disabled,
  hint,
  className,
  testId,
}: FileDropProps) {
  const [dragOver, setDragOver] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const acceptList = React.useMemo(
    () => (accept ? accept.split(',').map((s) => s.trim().toLowerCase()) : null),
    [accept],
  );

  const merge = (incoming: FileList | File[]) => {
    const list = Array.from(incoming);
    const accepted: File[] = [];
    for (const file of list) {
      if (maxSizeBytes !== undefined && file.size > maxSizeBytes) {
        onReject?.('size', file);
        continue;
      }
      if (acceptList && !matchesAccept(file, acceptList)) {
        onReject?.('type', file);
        continue;
      }
      accepted.push(file);
    }
    if (accepted.length === 0) return;
    const merged = multiple ? [...files, ...accepted] : accepted.slice(0, 1);
    if (maxFiles !== undefined && merged.length > maxFiles) {
      const overflow = merged.slice(maxFiles);
      for (const f of overflow) onReject?.('count', f);
    }
    onFilesChange(merged.slice(0, maxFiles ?? merged.length));
  };

  const remove = (i: number) => {
    onFilesChange(files.filter((_, j) => j !== i));
  };

  return (
    <div className={className} data-testid={testId}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (disabled) return;
          if (e.dataTransfer.files.length > 0) merge(e.dataTransfer.files);
        }}
        className={cn(
          'flex w-full flex-col items-center justify-center gap-2 rounded-[var(--ms-radius-default)]',
          'border-2 border-dashed px-4 py-6 transition-colors',
          dragOver
            ? 'border-[var(--ms-action-primary)] bg-[var(--ms-bg-hover)]'
            : 'border-[var(--ms-border-default)] hover:border-[var(--ms-border-strong)] hover:bg-[var(--ms-bg-muted)]',
          disabled && 'cursor-not-allowed opacity-60',
        )}
      >
        <UploadCloud className="h-6 w-6 text-[var(--ms-text-muted)]" />
        <span className="text-[var(--ms-text-secondary)] text-sm">
          {hint ?? 'Faylni shu yerga sudrab tashlang yoki bosing'}
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple={multiple}
        accept={accept}
        disabled={disabled}
        className="hidden"
        onChange={(e) => {
          if (e.target.files) merge(e.target.files);
          e.target.value = '';
        }}
      />

      {files.length > 0 && (
        <ul className="mt-2 space-y-1">
          {files.map((file, i) => (
            <li
              key={`${file.name}-${i}`}
              className="flex items-center gap-2 rounded-[var(--ms-radius-default)] bg-[var(--ms-bg-muted)] px-2 py-1.5 text-sm"
            >
              <Paperclip className="h-3.5 w-3.5 shrink-0 text-[var(--ms-text-muted)]" />
              <span className="min-w-0 flex-1 truncate text-[var(--ms-text-primary)]">
                {file.name}
              </span>
              <span className="shrink-0 text-[var(--ms-text-muted)] text-xs">
                {formatBytes(file.size)}
              </span>
              <button
                type="button"
                onClick={() => remove(i)}
                aria-label="Remove"
                className="rounded p-0.5 text-[var(--ms-text-muted)] hover:bg-[var(--ms-bg-surface)] hover:text-[var(--ms-text-destructive)]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function matchesAccept(file: File, list: string[]): boolean {
  const name = file.name.toLowerCase();
  const mime = file.type.toLowerCase();
  return list.some((entry) => {
    if (entry.startsWith('.')) return name.endsWith(entry);
    if (entry.endsWith('/*')) return mime.startsWith(entry.slice(0, -1));
    return mime === entry;
  });
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}
