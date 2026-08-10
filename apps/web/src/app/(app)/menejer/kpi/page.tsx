'use client';

/**
 * Menejer — barcha xodimlar KPI'lari (KPI-04).
 *
 * Sahifa yupqa: butun mantiq `EmployeeKpiScreen` da (u testlarda providerlar
 * bilan alohida chiziladi) — `menejer/plan` va `menejer/byudjet` bilan bir xil
 * naqsh.
 */

import { EmployeeKpiScreen } from '../_components/employee-kpi-screen';

export default function MenejerKpiPage() {
  return (
    <div className="p-4">
      <EmployeeKpiScreen />
    </div>
  );
}
