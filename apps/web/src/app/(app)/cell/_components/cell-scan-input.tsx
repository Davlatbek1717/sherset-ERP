'use client';

import { normalizeCellCode } from '@/lib/bin-location';
import { ScanBarcode } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

/**
 * Yacheyka-skaner kirish maydoni. USB/bluetooth skaner klaviatura sifatida
 * 8 raqam + Enter yuboradi — Enter'da kod normalizatsiya qilinib
 * /cell/NN-NN-NN-NN sahifasiga o'tiladi. Qo'lda tireli kiritish ham ishlaydi.
 */
export function CellScanInput({ autoFocus = true }: { autoFocus?: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState('');
  const [invalid, setInvalid] = useState(false);

  const submit = () => {
    const code = normalizeCellCode(value);
    if (!code) {
      setInvalid(value.trim().length > 0);
      return;
    }
    setInvalid(false);
    setValue('');
    router.push(`/cell/${code}`);
  };

  return (
    <div>
      <div className="flex items-center gap-2 rounded-2xl border border-[var(--ms-border)] bg-[var(--ms-bg-surface)] px-4 py-3 focus-within:border-blue-400">
        <ScanBarcode className="h-5 w-5 shrink-0 text-[var(--ms-text-muted)]" />
        <input
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setInvalid(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          // biome-ignore lint/a11y/noAutofocus: skaner-sahifa — fokus har doim shu maydonda turishi kerak
          autoFocus={autoFocus}
          inputMode="numeric"
          placeholder="Yacheyka barcode'ini skanerlang…"
          aria-label="Yacheyka kodi"
          className="w-full bg-transparent font-mono text-base text-[var(--ms-text-primary)] tracking-widest outline-none placeholder:font-sans placeholder:tracking-normal placeholder:text-[var(--ms-text-muted)]"
        />
      </div>
      {invalid ? (
        <p className="mt-1.5 px-1 text-red-500 text-xs">
          Kod noto&apos;g&apos;ri — 8 raqam yoki NN-NN-NN-NN kutiladi
        </p>
      ) : null}
    </div>
  );
}
