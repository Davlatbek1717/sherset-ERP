-- moysklad «Отчёт комиссионера» list shows two money columns we did not store:
--   «Сумма комитента» (commitentSum, the amount payable to the consigner) and
--   «Прочие услуги» (otherServices, the sum of non-commission service positions).
-- Both are real document-level money fields (commitentSum is in the moysklad API
-- schema). Added to BOTH report tables, default 0 — renders «0,00» exactly like
-- moysklad's empty list; the create/post FSM sprint will populate them.

ALTER TABLE "commission_reports_out"
  ADD COLUMN "commitent_sum_minor" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "other_services_sum_minor" BIGINT NOT NULL DEFAULT 0;

ALTER TABLE "commission_reports_in"
  ADD COLUMN "commitent_sum_minor" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "other_services_sum_minor" BIGINT NOT NULL DEFAULT 0;
