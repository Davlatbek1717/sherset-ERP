'use client';

/**
 * Menejer — mijoz taqsimoti (MK38 · 4-bo'lim TZ §6).
 *
 * Sahifa yupqa: butun mantiq `CustomerAssignmentScreen` da —
 * `menejer/byudjet` bilan bir xil naqsh.
 */

import { CustomerAssignmentScreen } from '../_components/customer-assignment-screen';

export default function MenejerMijozTaqsimotiPage() {
  return (
    <div className="p-4">
      <CustomerAssignmentScreen />
    </div>
  );
}
