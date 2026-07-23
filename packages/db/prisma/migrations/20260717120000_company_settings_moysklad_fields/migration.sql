-- moysklad «Настройки компании» page fields missing from the original table
-- (Обратный адрес в письмах · Использовать партии товаров · Включить
-- отображение доп. полей товаров и услуг в позициях документов).
ALTER TABLE "company_settings"
  ADD COLUMN "email_reply_mode" VARCHAR(20) NOT NULL DEFAULT 'EMPLOYEE',
  ADD COLUMN "use_consignments" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "show_position_attributes" BOOLEAN NOT NULL DEFAULT true;
