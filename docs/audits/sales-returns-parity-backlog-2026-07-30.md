# Sales-returns («Возврат покупателя») — MoySklad-parity 50-punkt backlog (2026-07-30)

Grounded: `docs/moysklad-reference/salesreturn/` (jonli MoySklad capture) + `docs/audits/sales-returns-live-2026-07-23/_GAP-BACKLOG.md` + purchase-returns sibling.
Playwright (2026-07-30) jonli list tasdiqladi: ustunlar «Валюта»+«Оплачено» yetishmaydi. **[G]**=grounded · **[A]**=capture kerak · **✅**=bittalab bajarilgach belgilanadi.

## LIST — `apps/web/src/app/(app)/sales-returns/page.tsx`
1. [G] «Оплачено» ustuni qo'shish (BE `list()` select'ga `payedSumMinor` + FE column). Sibling: purchase-returns.
2. [G] «Валюта» ustunini default-ko'rinadigan qilish (defined 470-480, default array 301-311'да yo'q).
3. [G] MoySklad'да yo'q filtrlarni olib tashlash/«Ещё»ga: «Отгрузка»/«Заказ покупателя»/«Сумма from-to» (811-853, 951-983).
4. [G] «Дата отгрузки» filtri qo'shish (sibling «Дата приемки»). **BE gap.**
5. [G] «Оплата» (payment-status tri-state) filtri (purchase-returns:132-136,713-725 dan copy). **BE gap.**
6. [G] «Товар или группа» filtri (purchase-returns:202,725-739 dan). **BE gap.**
7. [G] «Счёт контрагента» filtri surface (BE `agentAccountId` tayyor, schema.ts:143) — sof FE.
8. [G] «Счёт организации» filtri surface (BE `organizationAccountId` tayyor, schema.ts:148) — sof FE.
9. [G] «Владелец контрагента» filtri. **BE gap.**
10. [G] «Общий доступ» (shared) filtri. **BE gap.**
11. [G] «Кто изменил» filtri — `SalesReturn`'да `updatedById` yo'q. **BE migration.**
12. [G] Toolbar «Создать ▾» bulk-create dropdown. **FE+BE.**
13. [A] Sahifa CSV «Экспорт» (hozir disabled, 1052) — capture.
14. [verify] «Статус ▾» dropdown — endi bor (1046-1051); capture bilan yopish.
15. [noop] demand/state/positions ustunlari default-yashirin (to'g'ri) — qayta qo'shma.

## DETAIL — `apps/web/src/app/(app)/sales-returns/[id]/page.tsx`
16. [G] Kontragent ostiga qizil «Баланс (нам должны): …» sub-satr (D1).
17. [G] Организация ostiga «Перечисление» (payment-type) dropdown (D2). **BE+FE.**
18. [G] Pozitsiya «Остаток» — real per-store/cell stock (D5). **BE join.**
19. [G] Pozitsiya «Себестоимость единицы» ustuni (D6). **BE+FE.**
20. [G] Pozitsiya «РНПТ» ustuni (D7). **BE+DS.**
21. [G] Tab'lar faqat «Главная»+«Связанные документы» — Файлы/История alohida tab'ini olib tashlash (D10; 1419-1426).
22. [G] «Причина» inputni olib tashlash/«Ещё»ga — MoySklad'да faqat «Комментарий» (N8; 1675-1682).
23. [G] «Создать документ ▾» real to'plam {Исходящий платеж, Расходный ордер, Списание} — labellar+flow (D8; 936-940).
24. [G] «Отправить ▾» capture bilan solishtirish (D9; 917-928).
25. [G] Totals sidebar «Прибыль» (conditional, past-prioritet; S5).
26. [A] Totals sidebar «Вес»/«Объём» — capture.
27. [verify] «Валюта документа» selektor — endi bor (1358-1373).
28. [G] Meta-grid MoySklad'ning ixcham 2-ustunига moslash (D4).
29. [A] Refund «Запросить оплату» chip (S7) — L1/D8 bilan bog'liq.
30. [G] «Ячейка» ustuni default-off qilish (parity; N4).
31. [G] Customs ustunlari detail'да default-ON, /new'да default-OFF — moslash.

## NEW — `apps/web/src/app/(app)/sales-returns/new/page.tsx`
32. [G] Meta-grid maydon tartibi MoySklad create'ga moslash; Валюта — pastki full-width satr (N2/N3).
33. [G] Организация ostiga «Перечисление» combo (N1). **BE+FE.**
34. [G] «Причина» inputni olib tashlash (N8; 1348-1353).
35. [G] Pozitsiya default ustunlari: «Себест. единицы» + «РНПТ» qo'shish (N4).
36. [G] Customs (Себест. ГТД/Страна) /new'да default-ko'rinadigan (N4; 140-147).
37. [verify] Скидка/Сумма НДС/Ед. default-yashirin (N5/N6/N7) — endi to'g'ri.
38. [G] «Создать документ» placeholders — #23 kabi real to'plam (1452-1456).
39. [A] `?fromCustomerOrder=` prefill (hozir faqat `?fromDemand=`) — capture.

## BE — `apps/api/src/modules/sales-return/`
40. [G] `list()` select'ga `payedSumMinor` (89-99) — #1 enabler.
41. [G] `paymentState` filtri (schema.ts:124-198) — #5 enabler.
42. [G] `productId` filtri — #6 enabler.
43. [G] shipment-date filtri — #4 enabler.
44. [G] `updatedById` ustun (migration) — #11 enabler.
45. [G] counterparty-owner / shared filtr maydonlari — #9,#10.
46. [A] sort-key'lar (moment|name|sumMinor|agent|organization|store) — kengaytirish.
47. [G] `agentAccountId`/`organizationAccountId` FE'ga surface — #7,#8 (BE tayyor).
48. [G] `findById` pozitsiya select'ga unit-cost + per-row stock + РНПТ (252-256) — #18/19/20.
49. [A] `from-customer-order` endpoint (hozir faqat `from-demand`; controller.ts:76-84) — #39.
50. [A] Mass-edit'ga salesChannelId/contractId — capture bilan.

## Bittalab tartib (yuqori-qiymat → past-risk avval)
Kvik-winlar (sof FE, grounded): **2, 7, 8, 30, 36, 37-verify, 27-verify, 14-verify, 21**.
Sibling-copy (BE+FE, grounded): **1+40, 5+41, 6+42, 4+43**.
BE-gap (migration/model): **11+44, 9/10+45, 17/33, 18+48, 19, 20**.
Capture kerak (avval MoySklad capture ko'r): **13, 26, 39, 46, 49, 50**.
