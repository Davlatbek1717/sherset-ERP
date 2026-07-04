'use client';

import { useAuth } from '@/lib/auth-store';
import { MapPin } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { CellScanInput } from './_components/cell-scan-input';

/**
 * Yacheyka skaneri — kirish sahifasi. Omborchi shu sahifani ochib skaner
 * bilan yacheyka labelini o'qitadi (yoki kodni qo'lda teradi) → yacheyka
 * kartochkasiga (/cell/NN-NN-NN-NN) o'tadi.
 */
export default function CellScanHome() {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user === null) router.replace('/login');
  }, [user, router]);

  return (
    <div className="mx-auto flex h-[calc(100dvh-58px)] max-w-lg flex-col justify-center gap-5 px-5">
      <div className="text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100">
          <MapPin className="h-7 w-7 text-amber-600" />
        </div>
        <h1 className="font-bold text-[var(--ms-text-primary)] text-xl">Yacheyka skaneri</h1>
        <p className="mt-1 text-[var(--ms-text-muted)] text-sm">
          Yacheyka barcode&apos;ini skanerlang — ichidagi tovarlar va ularning ma&apos;lumotlari
          chiqadi
        </p>
      </div>
      <CellScanInput />
    </div>
  );
}
