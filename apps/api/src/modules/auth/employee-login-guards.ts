import { UnauthorizedException } from '@nestjs/common';
import { readEmployeeSystemAttrs } from '../hr/hr-employee/hr-employee.service.js';
import { isIpAllowed } from '../shared/ip-match.js';

/**
 * Parol-login va PIN-login uchun UMUMIY xodim-kartasi qo'riqchilari.
 *
 * NEGA AJRATILDI: bular ilgari faqat `auth.service.login()` ichida edi. Kassa
 * PIN-kirishi ikkinchi kirish yo'li bo'lgani uchun qo'riqchilar nusxa-ko'chirilsa,
 * biri yangilanganda ikkinchisi jimgina eskirardi — bu loyihada allaqachon
 * bo'lgan bug-klass (api-client `download()` da 401-retry shox nusxada
 * yo'qolgan edi).
 *
 * `refresh()` ham shu tekshiruvlarni qiladi, lekin u YAKKA holda `attributes`
 * ni o'qiydi va boshqa xabar beradi — u ataylab tegilmadi.
 */
export interface LoginGuardEmployee {
  lockedUntil: Date | null;
  attributes: unknown;
}

export interface LoginGuardMeta {
  ipAddress?: string;
  /** Hisob holatini oshkor qilmaydigan umumiy xabar (chaqiruvchi beradi). */
  genericMessage: string;
}

export function assertEmployeeMayLogin(e: LoginGuardEmployee, meta: LoginGuardMeta): void {
  if (e.lockedUntil && e.lockedUntil > new Date()) {
    const remaining = Math.ceil((e.lockedUntil.getTime() - Date.now()) / 60_000);
    throw new UnauthorizedException(`Hisob vaqtincha bloklangan (${remaining} daqiqa qoldi)`);
  }

  // moysklad xodim kartasi: «Разрешить вход в систему» olib tashlansa kirish
  // umuman yo'q; «Сеть» ro'yxati bo'lsa faqat o'sha IP/tarmoqdan.
  const sysAttrs = readEmployeeSystemAttrs(e.attributes);
  if (sysAttrs.loginAllowed === false) {
    // Ataylab UMUMIY xabar — «kirish taqiqlangan» deyilsa hisob mavjudligi
    // va holati oshkor bo'lardi.
    throw new UnauthorizedException(meta.genericMessage);
  }
  if (!isIpAllowed(meta.ipAddress, sysAttrs.allowedIps, sysAttrs.allowedNetworks)) {
    throw new UnauthorizedException('Bu IP-manzildan kirish taqiqlangan');
  }
}
