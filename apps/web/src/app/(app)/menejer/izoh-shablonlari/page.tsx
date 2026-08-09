'use client';

/**
 * Menejer — izoh shablonlari (4M TZ §8.1/6 · MK20).
 *
 * Sahifa yupqa: butun mantiq `CommentTemplateSettings` da (u testlarda
 * providerlar bilan alohida chiziladi) — `menejer/byudjet` bilan bir xil naqsh.
 */

import { CommentTemplateSettings } from '../_components/comment-template-settings';

export default function MenejerIzohShablonlariPage() {
  return (
    <div className="p-4">
      <CommentTemplateSettings />
    </div>
  );
}
