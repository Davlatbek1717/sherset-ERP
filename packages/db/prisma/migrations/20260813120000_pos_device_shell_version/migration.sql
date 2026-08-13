-- Kassa exe barqarorligi F3 (reja: docs/superpowers/plans/2026-08-13-kassa-exe-barqarorlik.md, K07)
--
-- pos_devices.shell_version — qurilmadagi Electron qobig'i versiyasi
-- (`app.getVersion()`), har muvaffaqiyatli pos-login'da yangilanadi.
-- NULL = qobiq versiya yubormadi (eski exe yoki brauzerdan kirilgan) —
-- «eski» degani EMAS, «o'lchanmagan».

-- AlterTable
ALTER TABLE "pos_devices" ADD COLUMN     "shell_version" VARCHAR(32);
