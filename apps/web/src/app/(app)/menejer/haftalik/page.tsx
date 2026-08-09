'use client';

/**
 * Menejer — egaga haftalik xulosa (M-Q7 · TZ §7).
 *
 * Sahifa yupqa: butun mantiq `WeeklySummaryScreen` da (u testlarda
 * providerlar bilan alohida chiziladi).
 */

import { WeeklySummaryScreen } from '../_components/weekly-summary-screen';

export default function MenejerHaftalikPage() {
  return (
    <div className="p-4">
      <WeeklySummaryScreen />
    </div>
  );
}
