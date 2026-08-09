'use client';

/**
 * Menejer — narx siyosati: chegirma va zarar chegaralari (MK38 · 4-bo'lim
 * TZ §6). Chegara BLOKLAMAYDI — navbatga tushadi.
 *
 * Sahifa yupqa: butun mantiq `PricePolicyScreen` da.
 */

import { PricePolicyScreen } from '../_components/price-policy-screen';

export default function MenejerNarxSiyosatiPage() {
  return (
    <div className="p-4">
      <PricePolicyScreen />
    </div>
  );
}
