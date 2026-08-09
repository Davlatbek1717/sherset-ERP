'use client';

/**
 * Menejer — xarajat byudjeti (4M TZ §8 · MK12).
 *
 * Sahifa yupqa: butun mantiq `ExpenseBudgetScreen` da (u testlarda
 * providerlar bilan alohida chiziladi) — `menejer/sifat` bilan bir xil naqsh.
 */

import { ExpenseBudgetScreen } from '../_components/expense-budget-screen';

export default function MenejerByudjetPage() {
  return (
    <div className="p-4">
      <ExpenseBudgetScreen />
    </div>
  );
}
