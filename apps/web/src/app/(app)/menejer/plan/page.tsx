'use client';

/**
 * Menejer — sotuv rejasi (xodim × oy × plan turi; MK37/MK38 · 4-bo'lim TZ §6).
 *
 * Sahifa yupqa: butun mantiq `SalesPlanScreen` da (u testlarda providerlar
 * bilan alohida chiziladi) — `menejer/byudjet` bilan bir xil naqsh.
 */

import { SalesPlanScreen } from '../_components/sales-plan-screen';

export default function MenejerPlanPage() {
  return (
    <div className="p-4">
      <SalesPlanScreen />
    </div>
  );
}
