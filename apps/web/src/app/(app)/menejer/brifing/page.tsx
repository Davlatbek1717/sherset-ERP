'use client';

/**
 * Menejer — ertalabki brifing va kechki yakun (4M TZ §8.1/5 · MK19).
 *
 * Ikkala panel BITTA route'da: menejer bir kunda ikki marta shu yerni ochadi
 * va ikkalasi ham «bugun» degan bitta savolning ikki tomoni. Alohida ikki
 * sahifa bir xil qobiqni ikki marta yozdirardi.
 *
 * Sahifa yupqa: butun mantiq `BriefingScreen` da (u testlarda providerlar
 * bilan alohida chiziladi) — `menejer/pul-manzarasi` bilan bir xil naqsh.
 */

import { BriefingScreen } from '../_components/briefing-screen';

export default function MenejerBrifingPage() {
  return (
    <div className="p-4">
      <BriefingScreen />
    </div>
  );
}
