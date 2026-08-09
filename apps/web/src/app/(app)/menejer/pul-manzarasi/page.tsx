'use client';

/**
 * Menejer — «Korxona puli qayerda» pul manzarasi paneli (4M TZ §8.1/1 · MK15).
 *
 * Sahifa yupqa: butun mantiq `MoneyMapScreen` da (u testlarda providerlar
 * bilan alohida chiziladi) — `menejer/sifat` va `menejer/byudjet` bilan bir
 * xil naqsh.
 */

import { MoneyMapScreen } from '../_components/money-map-screen';

export default function MenejerPulManzarasiPage() {
  return (
    <div className="p-4">
      <MoneyMapScreen />
    </div>
  );
}
