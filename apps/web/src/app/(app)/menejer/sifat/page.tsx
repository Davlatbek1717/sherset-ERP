'use client';

/**
 * Menejer — ma'lumot sifati paneli (TZ §2.4/§0.2 · MK09).
 *
 * Sahifa yupqa: butun mantiq `DataQualityScreen` da (u testlarda providerlar
 * bilan alohida chiziladi).
 */

import { DataQualityScreen } from '../_components/data-quality-screen';

export default function MenejerSifatPage() {
  return (
    <div className="p-4">
      <DataQualityScreen />
    </div>
  );
}
