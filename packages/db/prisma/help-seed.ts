import type { PrismaClient } from '../src/generated/index.js';

/**
 * Evergreen help articles. Each article exists in two locales (uz + ru).
 * Slugs are stable across locales — the drawer fetches by routeKey +
 * locale, so the same `slug` paired with a different `locale` is the
 * translated copy.
 *
 * Idempotent: upserts by `(accountId, slug, locale)`. Run as part of
 * `pnpm seed` or call `seedHelpArticles(prisma, accountId)` from any
 * other script.
 */

interface ArticleSpec {
  slug: string;
  routeKey: string | null;
  category: string;
  position: number;
  uz: { title: string; bodyMd: string };
  ru: { title: string; bodyMd: string };
}

const ARTICLES: ArticleSpec[] = [
  // === GETTING STARTED ====================================================
  {
    slug: 'welcome',
    routeKey: '',
    category: 'Boshlanish',
    position: 10,
    uz: {
      title: 'MoySklad-ga xush kelibsiz',
      bodyMd:
        "# MoySklad-ga xush kelibsiz\n\nMoySklad — kichik va o'rta biznes uchun bulutli ERP. Quyidagilarni boshqaring:\n\n- **Savdo** — buyurtmalar, hisob-fakturalar, otkazmalar\n- **Xaridlar** — ta'minotchilar bilan ishlash\n- **Ombor** — qoldiqlar, harakat, inventarizatsiya\n- **Pul** — kassa, bank, tushum-chiqim\n- **CRM** — mijozlar, bitimlar, vazifalar\n\nKlaviatura yorlig'i: `Ctrl+K` tezkor harakatlar uchun, `?` yordam ochish uchun.",
    },
    ru: {
      title: 'Добро пожаловать в МойСклад',
      bodyMd:
        '# Добро пожаловать в МойСклад\n\nМойСклад — облачная ERP для малого и среднего бизнеса. Управляйте:\n\n- **Продажами** — заказы, счета, отгрузки\n- **Закупками** — работа с поставщиками\n- **Складом** — остатки, движения, инвентаризации\n- **Деньгами** — касса, банк, поступления и расходы\n- **CRM** — клиенты, сделки, задачи\n\nГорячая клавиша: `Ctrl+K` — быстрые действия, `?` — открыть помощь.',
    },
  },
  {
    slug: 'getting-started-checklist',
    routeKey: '',
    category: 'Boshlanish',
    position: 20,
    uz: {
      title: "5 daqiqalik sozlash ro'yxati",
      bodyMd:
        "# 5 daqiqalik sozlash\n\n1. **Tashkilot** ma'lumotlarini to'ldiring (Sozlamalar → Tashkilotlar) — INN, manzil, bank rekvizitlar.\n2. **Ombor** yarating — kamida bittasi kerak, hujjatlarda ishlatiladi.\n3. **Foydalanuvchilar** qo'shing va rollarni biriktiring.\n4. **Mijoz** va **mahsulot** import qiling (CSV / Excel) yoki birinchisini qo'lda yarating.\n5. Birinchi **mijoz buyurtmasi**ni yarating va `Otkazma`gacha o'tkazing.\n\nBu 5 qadam tugagach — kundalik faoliyatni boshlash mumkin.",
    },
    ru: {
      title: 'Чек-лист быстрого старта',
      bodyMd:
        '# 5-минутная настройка\n\n1. Заполните **Организацию** (Настройки → Организации) — ИНН, адрес, банковские реквизиты.\n2. Создайте **Склад** — нужен хотя бы один, используется в документах.\n3. Добавьте **Пользователей** и назначьте роли.\n4. Импортируйте **Контрагентов** и **Товары** (CSV / Excel) или создайте первого вручную.\n5. Создайте первый **Заказ покупателя** и проведите его до **Отгрузки**.\n\nПосле этих 5 шагов можно начинать ежедневную работу.',
    },
  },

  // === SALES =============================================================
  {
    slug: 'sales-pipeline-overview',
    routeKey: 'customer-orders',
    category: 'Savdo',
    position: 10,
    uz: {
      title: 'Savdo jarayoni: Buyurtma → Otkazma → Tushum',
      bodyMd:
        "# Savdo jarayoni\n\nKlassik 3-bosqichli yo'l:\n\n1. **Mijoz buyurtmasi** — narx kelishildi, hujjat yaratildi. Stok hali yechilmadi.\n2. **Otkazma** — tovar yuborildi. Ombor qoldigi avtomat yechiladi.\n3. **To'lov tushumi** — pul keldi. Mijoz balansi kamayadi.\n\n**Maslahat:** Buyurtmadan otkazmaga `Yarat` tugmasi orqali to'g'ridan-to'g'ri o'tish mumkin — barcha pozitsiyalar avtomat ko'chadi.",
    },
    ru: {
      title: 'Цикл продаж: Заказ → Отгрузка → Поступление',
      bodyMd:
        '# Цикл продаж\n\nКлассические 3 шага:\n\n1. **Заказ покупателя** — цена согласована, документ создан. Со склада ещё не списано.\n2. **Отгрузка** — товар отправлен. Остаток списывается автоматически.\n3. **Поступление** — деньги пришли. Баланс контрагента уменьшается.\n\n**Совет:** Из заказа можно сразу создать отгрузку кнопкой `Создать` — все позиции скопируются автоматически.',
    },
  },
  {
    slug: 'invoice-out-create',
    routeKey: 'invoices-out',
    category: 'Savdo',
    position: 20,
    uz: {
      title: 'Hisob-faktura yaratish',
      bodyMd:
        "# Hisob-faktura\n\nMijoz tomonidan to'lashga ko'rsatma. **Otkazmadan farqi** — ombor qoldigi yechilmaydi. Hisob-faktura faqat to'lash uchun rasmiy hujjat.\n\n## Avtomat 14 kun muddat\n\nHisob-faktura yaratilganda muddati 14 kun. Shu davrda to'lov kelmasa, kron `invoice_overdue` notifikatsiyasi yuboradi.\n\n## To'lov bilan bog'lash\n\nTushum hujjati yaratilgach, uni hisob-fakturaga `linkedDocs` orqali bog'lang. Bu otomat statusni `paid`-ga o'zgartiradi.",
    },
    ru: {
      title: 'Создание счёта-фактуры',
      bodyMd:
        '# Счёт-фактура\n\nДокумент к оплате клиентом. **Отличие от отгрузки** — остаток со склада не списывается. Счёт-фактура — только формальный документ к оплате.\n\n## Автоматический срок 14 дней\n\nПри создании счёта срок — 14 дней. Если оплата не поступит в этот срок, кроне отправит уведомление `invoice_overdue`.\n\n## Связка с поступлением\n\nПосле создания поступления свяжите его со счётом через `linkedDocs`. Это автоматически переведёт статус в `paid`.',
    },
  },

  // === WAREHOUSE =========================================================
  {
    slug: 'inventory-count',
    routeKey: 'inventories',
    category: 'Ombor',
    position: 10,
    uz: {
      title: 'Inventarizatsiya — qoldiqlarni hisoblash',
      bodyMd:
        "# Inventarizatsiya\n\nReal qoldiqni tizim qoldigiga moslash uchun:\n\n1. **Yangi inventarizatsiya** yarating, omborni tanlang.\n2. Tizim joriy qoldiqni `bookQty` sifatida ko'rsatadi.\n3. Real qoldiqni `actualQty` ustuniga kiriting.\n4. Tasdiqlang — farq avtomat `Sapotka` (yo'qotilgan) yoki `Kirim` (qo'shimcha) hujjatiga aylanadi.\n\n**Diqqat:** Otkazma jarayonidagi mahsulotlar ham hisobga olinadi. Inventarizatsiya boshlanishidan oldin barcha otkazmalarni yopish tavsiya etiladi.",
    },
    ru: {
      title: 'Инвентаризация — пересчёт остатков',
      bodyMd:
        '# Инвентаризация\n\nДля синхронизации реальных остатков с системными:\n\n1. Создайте **новую инвентаризацию**, выберите склад.\n2. Система покажет текущий остаток в столбце `bookQty`.\n3. Введите реальный остаток в столбец `actualQty`.\n4. Подтвердите — расхождение автоматически превратится в **Списание** (недостача) или **Оприходование** (излишек).\n\n**Внимание:** Учитываются и товары в процессе отгрузки. Перед началом рекомендуется закрыть все отгрузки.',
    },
  },
  {
    slug: 'stock-balance-fifo',
    routeKey: 'stock-balance',
    category: 'Ombor',
    position: 20,
    uz: {
      title: "FIFO va o'rtacha tannarx",
      bodyMd:
        "# Tannarx hisobi\n\nMoySklad **FIFO** (First In First Out) printsipida ishlaydi: birinchi kelgan tovar birinchi sotiladi.\n\n## Misol\n\n- 10 ta tovar 100 000 so'mdan kirdi → tannarx 100k\n- 5 ta tovar 110 000 so'mdan kirdi → tannarx 110k\n- 8 ta sotilsa: birinchi 10 tadan 8 ta yechiladi, qoldiq: 2×100k + 5×110k\n- Sotuv tannarxi: 8 × 100 000 = 800 000 so'm\n\n## Foyda hisobi\n\nFoydaga FIFO tannarxi ishlatiladi, hisobotlar bo'limida ko'rsatiladi.",
    },
    ru: {
      title: 'FIFO и средняя себестоимость',
      bodyMd:
        '# Учёт себестоимости\n\nМойСклад работает по принципу **FIFO** (First In First Out): что пришло первым — продаётся первым.\n\n## Пример\n\n- Поступили 10 шт по 100 000 → себестоимость 100k\n- Поступили 5 шт по 110 000 → себестоимость 110k\n- Продано 8 шт: списываются 8 из первой партии, остаток: 2×100k + 5×110k\n- Себестоимость продажи: 8 × 100 000 = 800 000\n\n## Расчёт прибыли\n\nДля прибыли используется FIFO-себестоимость, отображается в отчётах.',
    },
  },

  // === MONEY =============================================================
  {
    slug: 'payment-vs-cash',
    routeKey: 'payments-in',
    category: 'Pul',
    position: 10,
    uz: {
      title: 'Bank tushumi va Naqd qabul — farqi',
      bodyMd:
        "# Tushum tipi\n\n**Bank tushumi** (`paymentin`) — bank hisobiga keldi. Bank ko'chirmasi yoki MT940 yuklashda avtomat yaratiladi.\n\n**Naqd qabul** (`cashin`) — kassaga qo'lda kirim qilindi. Soliq.uz EDO uchun `kassa hujjatlari` darajasida hisoblanadi.\n\n## Qaysisini tanlash\n\n- **Bank**: hisobga o'tkazma, plastik karta to'lovi, payme/click integratsiyasi orqali keladigan pul.\n- **Naqd**: kassir qo'lda yozadigan, ECP imzosi bilan tasdiqlanadigan tushum.\n\nIkkalasi ham mijoz balansini bir xil pasaytiradi.",
    },
    ru: {
      title: 'Поступление в банк vs Приём наличных',
      bodyMd:
        '# Тип поступления\n\n**Поступление в банк** (`paymentin`) — пришло на расчётный счёт. Создаётся автоматически при загрузке банковской выписки или MT940.\n\n**Приём наличных** (`cashin`) — оприходование наличных в кассу. Для Soliq.uz EDO учитывается на уровне `кассовых документов`.\n\n## Что выбирать\n\n- **Банк**: переводы, оплата картой, деньги через payme/click.\n- **Наличные**: ручной приём кассиром, подтверждение ЭЦП.\n\nОбе уменьшают баланс контрагента одинаково.',
    },
  },
  {
    slug: 'cash-flow-report',
    routeKey: 'reports/cash-flow',
    category: 'Pul',
    position: 20,
    uz: {
      title: 'Pul oqimi (Cash flow) hisoboti',
      bodyMd:
        "# Pul oqimi\n\nUch bo'limga ajraladi:\n\n1. **Operatsion** — sotuvdan keladigan, xarid uchun ketadigan pul.\n2. **Investitsion** — asosiy vositalar sotib olish/sotish.\n3. **Moliyaviy** — kredit olish/qaytarish, dividend.\n\n## Davr tanlash\n\nDavr **Sana** filtri orqali tanlanadi. Default: shu oy. Yil yarmi yoki yil bo'yicha solishtirish uchun `+ Davr qo'shish` bosing.\n\n## Eksport\n\nO'ng yuqori burchakdagi `Eksport → Excel` orqali to'liq jadvalni yuklab olish mumkin.",
    },
    ru: {
      title: 'Отчёт о движении денежных средств',
      bodyMd:
        '# Cash flow\n\nДелится на 3 раздела:\n\n1. **Операционный** — выручка от продаж, расходы на закупку.\n2. **Инвестиционный** — покупка/продажа основных средств.\n3. **Финансовый** — получение/возврат кредитов, дивиденды.\n\n## Период\n\nВыбирается фильтром **Дата**. По умолчанию — текущий месяц. Для сравнения полугодий или годов нажмите `+ Добавить период`.\n\n## Экспорт\n\nКнопка `Экспорт → Excel` в правом верхнем углу выгружает полную таблицу.',
    },
  },

  // === CRM ===============================================================
  {
    slug: 'opportunity-pipeline',
    routeKey: 'opportunities',
    category: 'CRM',
    position: 10,
    uz: {
      title: 'Bitim voronkasi va bosqichlar',
      bodyMd:
        "# Bitim voronkasi\n\nHar bitim **Pipeline**ga biriktiriladi. Default voronka 5 bosqich:\n\n1. **Aloqa** — birinchi suhbat\n2. **Taklif** — narx taklif qilindi\n3. **Muzokara** — shartlar muhokama\n4. **Yutildi** / **Yutqazildi**\n\n## Bosqichlarni o'zgartirish\n\nSozlamalar → Voronkalar bo'limida o'zingiz uchun moslang. Har bosqichga **konversiya foizi** qo'shing — voronka tahlili uchun ishlatiladi.\n\n## Vazifalar bilan bog'lash\n\nHar bitimga qancha vazifa biriktirilgan bo'lsa, vazifa tugashi bitim bosqichini avtomat o'zgartiradi (avtomatlash qoidalari).",
    },
    ru: {
      title: 'Воронка сделок и стадии',
      bodyMd:
        '# Воронка сделок\n\nКаждая сделка привязана к **Воронке**. Стандартная воронка из 5 стадий:\n\n1. **Контакт** — первый разговор\n2. **Предложение** — выслали цену\n3. **Переговоры** — обсуждение условий\n4. **Выиграна** / **Проиграна**\n\n## Настройка стадий\n\nВ разделе Настройки → Воронки настройте под себя. Добавьте к каждой стадии **процент конверсии** — используется в аналитике воронки.\n\n## Связка с задачами\n\nЕсли к сделке привязаны задачи, их завершение может автоматически менять стадию (правила автоматизации).',
    },
  },

  // === INTEGRATIONS ======================================================
  {
    slug: 'soliq-edo-setup',
    routeKey: 'settings/edo',
    category: 'Integratsiyalar',
    position: 10,
    uz: {
      title: 'Soliq.uz EDO sozlash',
      bodyMd:
        "# Soliq.uz EDO\n\nSoliq.uz orqali EHF (electronic factura) yuborish uchun:\n\n1. **ECP** — Eraqamli imzoni `.pfx` faylda yuklang.\n2. **Tashkilot INN** va kontekst belgilangan bo'lishi kerak.\n3. Provayder tanlang: **Didox**, **E-Docs**, yoki **Soliq native**.\n\n## EHF yuborish\n\nHisob-faktura yaratganda `Soliq EDO yuborish` tugmasi paydo bo'ladi. Bosgach:\n- XML format hosil bo'ladi\n- ECP bilan imzolanadi\n- Provayderga yuboriladi\n- Status `pending → submitted → accepted/rejected` bo'yicha o'zgaradi\n\n## Xato holatlar\n\nAgar `rejected` bo'lsa — `errorMsg` maydonida sabab ko'rsatiladi. Tahrirlab qayta yuborish mumkin.",
    },
    ru: {
      title: 'Настройка Soliq.uz EDO',
      bodyMd:
        '# Soliq.uz EDO\n\nДля отправки ЭСФ (электронных счёт-фактур) через Soliq.uz:\n\n1. **ЭЦП** — загрузите цифровую подпись в `.pfx`.\n2. **ИНН организации** и контекст должны быть указаны.\n3. Выберите провайдера: **Didox**, **E-Docs** или **Soliq native**.\n\n## Отправка ЭСФ\n\nПри создании счёта-фактуры появляется кнопка `Отправить в Soliq EDO`. После нажатия:\n- Формируется XML\n- Подписывается ЭЦП\n- Уходит провайдеру\n- Статус меняется по цепочке `pending → submitted → accepted/rejected`\n\n## Ошибки\n\nЕсли `rejected` — в поле `errorMsg` будет причина. Можно отредактировать и отправить повторно.',
    },
  },
  {
    slug: 'asl-belgisi-marking',
    routeKey: 'settings/marking',
    category: 'Integratsiyalar',
    position: 20,
    uz: {
      title: 'ASL Belgisi (markirovka)',
      bodyMd:
        "# ASL Belgisi\n\nO'zbekiston bo'yicha majburiy markirovka tovarlari:\n\n- Alkogol va sigaret\n- Doril mahsulotlari\n- Bottled suv\n- Oyoq kiyim\n- Sut mahsulotlari\n\n## Hayotiy yo'l\n\n1. **Allocate** — markirovka kodi olinadi (ASL Belgisi serveridan)\n2. **Apply** — kod tovar+lot+seriasiga biriktiriladi\n3. **MarkSold** — sotuvda kod `sold` holatiga o'tadi\n4. **MarkReturned** — qaytarish holatida `returned`\n5. **Retire** — eskirgan kodlarni arxivlash\n\n## DataMatrix kod\n\nGS1 standarti: AI 01 (GTIN) + AI 21 (serial) + AI 91/92 (kripto). Skanerdan o'qilganda avtomat parslanadi.",
    },
    ru: {
      title: 'ASL Belgisi (маркировка)',
      bodyMd:
        '# ASL Belgisi\n\nОбязательная маркировка в Узбекистане:\n\n- Алкоголь и сигареты\n- Лекарства\n- Бутилированная вода\n- Обувь\n- Молочная продукция\n\n## Жизненный путь\n\n1. **Allocate** — получаем код от сервера ASL Belgisi\n2. **Apply** — код привязан к товар+партия+серия\n3. **MarkSold** — при продаже статус `sold`\n4. **MarkReturned** — при возврате `returned`\n5. **Retire** — архивирование старых кодов\n\n## DataMatrix\n\nGS1 стандарт: AI 01 (GTIN) + AI 21 (серийный) + AI 91/92 (крипто). При сканировании парсится автоматически.',
    },
  },
  {
    slug: 'payme-click-setup',
    routeKey: 'settings/payment-gateway',
    category: 'Integratsiyalar',
    position: 30,
    uz: {
      title: 'Payme va Click integratsiyasi',
      bodyMd:
        "# To'lov shlyuzlari\n\n**Payme** (JSON-RPC):\n- Merchant Cabinet → Settings → API → endpoint URL.\n- Secret key biz tarafda, login Payme tarafda.\n- Sinov rejimida `test.paycom.uz` ishlatiladi.\n\n**Click** (form-encoded MD5):\n- Click → SHOP API → service ID + secret key.\n- Endpoint URL Click Cabinet ichida ko'rsatiladi.\n\n## Tranzaksiya hayoti\n\n1. Click `PREPARE` — autorizatsiya, biz `prepare_id` qaytaramiz.\n2. Click `COMPLETE` — bizda capture, status `paid` ga o'tadi yoki `failed` qoladi.\n\nPayme: `CheckPerformTransaction → CreateTransaction → PerformTransaction → CheckTransaction → CancelTransaction` jarayoni.",
    },
    ru: {
      title: 'Интеграция Payme и Click',
      bodyMd:
        '# Платёжные шлюзы\n\n**Payme** (JSON-RPC):\n- Merchant Cabinet → Settings → API → URL endpoint\n- Secret key у нас, логин у Payme\n- Тестовый режим — `test.paycom.uz`\n\n**Click** (form-encoded MD5):\n- Click → SHOP API → service ID + secret key\n- Endpoint URL указан в кабинете Click\n\n## Жизнь транзакции\n\n1. Click `PREPARE` — авторизация, возвращаем `prepare_id`.\n2. Click `COMPLETE` — захват, статус `paid` или `failed`.\n\nPayme: цепочка `CheckPerformTransaction → CreateTransaction → PerformTransaction → CheckTransaction → CancelTransaction`.',
    },
  },

  // === SETTINGS ==========================================================
  {
    slug: 'users-and-roles',
    routeKey: 'settings/users',
    category: 'Sozlamalar',
    position: 10,
    uz: {
      title: 'Foydalanuvchilar va rollar',
      bodyMd:
        "# Rollar\n\n3 ta default rol:\n\n- **EGASI** (Owner) — to'liq huquq, billing va o'chirish kiradi.\n- **ADMIN** — barcha modul, lekin akkount o'chirib bo'lmaydi.\n- **XODIM** (Employee) — faqat o'ziga biriktirilgan modullar.\n\n## Maxsus rollar\n\n`Sozlamalar → Rollar`da o'zingiz yangi rol yaratishingiz mumkin. Har modul uchun: `view / create / update / delete / approve` ruxsatlari.\n\n## Permissions matrix\n\nAdmin auditi: `Sozlamalar → Audit jurnali`da har permission tekshirish ko'rinadi (kim qanday huquq bilan qaysi vaqtda murojaat qildi).",
    },
    ru: {
      title: 'Пользователи и роли',
      bodyMd:
        '# Роли\n\n3 стандартные роли:\n\n- **ВЛАДЕЛЕЦ** — полные права, включая биллинг и удаление.\n- **АДМИН** — все модули, но удалить аккаунт нельзя.\n- **СОТРУДНИК** — только назначенные модули.\n\n## Кастомные роли\n\nВ `Настройки → Роли` можно создать свою роль. По каждому модулю права: `view / create / update / delete / approve`.\n\n## Матрица прав\n\nАудит: в `Настройки → Журнал аудита` видны все проверки прав (кто и когда обращался с какими правами).',
    },
  },
  {
    slug: 'exchange-rates-cbu',
    routeKey: 'settings/exchange-rates',
    category: 'Sozlamalar',
    position: 20,
    uz: {
      title: 'Valyuta kurslari (CBU)',
      bodyMd:
        "# Valyuta kurslari\n\nKurslar **CBU** (Markaziy Bank) saytidan kuniga avtomat yangilanadi. Soat 09:00 da kron ishga tushadi.\n\n## Qaysi valyutalar\n\nUZS, USD, EUR, RUB, KZT default. Boshqa valyuta kerak bo'lsa — qo'lda qo'shish mumkin.\n\n## Hujjatlarda\n\nHar hujjatda kurs **shu kun bo'yicha** snapshot qilinadi. Kelajakda kurs o'zgarsa eski hujjatlar ta'sirlanmaydi — auditda muhim.",
    },
    ru: {
      title: 'Курсы валют (ЦБУ)',
      bodyMd:
        '# Курсы валют\n\nКурсы автоматически обновляются ежедневно с сайта **ЦБУ**. Кроне запускается в 09:00.\n\n## Валюты\n\nUZS, USD, EUR, RUB, KZT по умолчанию. Если нужна другая — добавьте вручную.\n\n## В документах\n\nВ каждом документе курс снимается **снимком на день**. Если курс изменится позже, старые документы не пересчитываются — важно для аудита.',
    },
  },

  // === KEYBOARD SHORTCUTS ================================================
  {
    slug: 'keyboard-shortcuts',
    routeKey: '',
    category: 'Maslahatlar',
    position: 100,
    uz: {
      title: 'Klaviatura yorliqlari',
      bodyMd:
        "# Klaviatura yorliqlari\n\n## Global\n\n- `Ctrl+K` (yoki `⌘K`) — Tezkor harakatlar\n- `?` yoki `Shift+/` — Yordam ochish\n- `Esc` — Modal/drawer yopish\n\n## Ro'yxat sahifalarida\n\n- `↑ ↓` — qatorlar bo'ylab harakat\n- `Enter` — tanlangan qatorni ochish\n- `Ctrl+A` — barchasini tanlash\n- `Delete` — tanlanganlarni o'chirish\n\n## Form'larda\n\n- `Ctrl+S` — saqlash\n- `Ctrl+Enter` — saqlash va davom etish\n\n## Calendar / DatePicker\n\n- Strelkalar — kun tanlash\n- `PageUp/Down` — oyga harakat\n- `Shift+PageUp/Down` — yilga harakat",
    },
    ru: {
      title: 'Горячие клавиши',
      bodyMd:
        '# Горячие клавиши\n\n## Глобальные\n\n- `Ctrl+K` (или `⌘K`) — Быстрые действия\n- `?` или `Shift+/` — Открыть помощь\n- `Esc` — Закрыть модальное окно/drawer\n\n## В списках\n\n- `↑ ↓` — навигация по строкам\n- `Enter` — открыть выделенную строку\n- `Ctrl+A` — выделить всё\n- `Delete` — удалить выделенные\n\n## В формах\n\n- `Ctrl+S` — сохранить\n- `Ctrl+Enter` — сохранить и продолжить\n\n## В календаре\n\n- Стрелки — выбор дня\n- `PageUp/Down` — переход по месяцам\n- `Shift+PageUp/Down` — переход по годам',
    },
  },
];

export async function seedHelpArticles(prisma: PrismaClient, accountId: string): Promise<void> {
  console.log('🌱 Seeding help articles...');
  let count = 0;
  for (const spec of ARTICLES) {
    for (const locale of ['uz', 'ru'] as const) {
      const localised = spec[locale];
      await prisma.helpArticle.upsert({
        where: { accountId_slug_locale: { accountId, slug: spec.slug, locale } },
        update: {
          title: localised.title,
          bodyMd: localised.bodyMd,
          routeKey: spec.routeKey,
          category: spec.category,
          position: spec.position,
          enabled: true,
          archived: false,
        },
        create: {
          accountId,
          slug: spec.slug,
          locale,
          title: localised.title,
          bodyMd: localised.bodyMd,
          routeKey: spec.routeKey,
          category: spec.category,
          position: spec.position,
          enabled: true,
        },
      });
      count += 1;
    }
  }
  console.log(`  ✓ Help articles: ${count} (${ARTICLES.length} × 2 locales)`);
}
