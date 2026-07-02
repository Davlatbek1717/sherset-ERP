/**
 * Route registry — ALL known routes we want to capture.
 * Discovered from the moysklad app shell + sidebar.
 *
 * App is a hash-routed SPA — `/app/#<route>`.
 */

export interface AppRoute {
  /** Stable slug for output filenames */
  id: string;
  /** Module number (1-12) */
  module: number;
  /** Hash portion (without leading #) */
  hash: string;
  /** Human-readable Russian label */
  ruLabel: string;
  /** Human-readable Uzbek label */
  uzLabel: string;
  /** Short description */
  purpose: string;
  /** Is this a list view (has toolbar, filter, etc.) — used to trigger deep capture */
  kind: 'list' | 'report' | 'special' | 'tool';
}

/** All 12 top-level modules + cross-cutting tabs. */
export const APP_ROUTES: AppRoute[] = [
  // ── M01 Показатели ────────────────────────────────────────
  {
    id: 'dashboard',
    module: 1,
    hash: 'dashboard',
    ruLabel: 'Показатели',
    uzLabel: "Ko'rsatkichlar",
    purpose: 'KPI dashboard',
    kind: 'special',
  },
  {
    id: 'documents-all',
    module: 1,
    hash: 'documents',
    ruLabel: 'Документы',
    uzLabel: 'Hujjatlar',
    purpose: 'Cross-module document ledger',
    kind: 'list',
  },
  {
    id: 'recyclebin',
    module: 1,
    hash: 'recyclebin',
    ruLabel: 'Корзина',
    uzLabel: 'Korzina',
    purpose: 'Soft-delete trash',
    kind: 'list',
  },
  {
    id: 'audit',
    module: 1,
    hash: 'audit',
    ruLabel: 'Аудит',
    uzLabel: 'Audit',
    purpose: 'Event log',
    kind: 'list',
  },
  {
    id: 'files',
    module: 1,
    hash: 'files',
    ruLabel: 'Файлы',
    uzLabel: 'Fayllar',
    purpose: 'File attachments',
    kind: 'list',
  },
  {
    id: 'homepage',
    module: 1,
    hash: 'homepage',
    ruLabel: 'Начало работы',
    uzLabel: 'Ishni boshlash',
    purpose: 'Getting started',
    kind: 'special',
  },

  // ── M02 Закупки ────────────────────────────────────────────
  {
    id: 'purchaseorder',
    module: 2,
    hash: 'purchaseorder',
    ruLabel: 'Заказы поставщикам',
    uzLabel: 'Yetkazib beruvchi buyurtmalari',
    purpose: 'Supplier orders',
    kind: 'list',
  },
  {
    id: 'invoicein',
    module: 2,
    hash: 'invoicein',
    ruLabel: 'Счета поставщиков',
    uzLabel: 'Yetkazib beruvchi hisob-fakturalari',
    purpose: 'Supplier invoices',
    kind: 'list',
  },
  {
    id: 'supply',
    module: 2,
    hash: 'supply',
    ruLabel: 'Приемки',
    uzLabel: 'Qabullar',
    purpose: 'Goods receipts',
    kind: 'list',
  },
  {
    id: 'purchasereturn',
    module: 2,
    hash: 'purchasereturn',
    ruLabel: 'Возвраты поставщикам',
    uzLabel: 'Qaytarishlar',
    purpose: 'Returns to supplier',
    kind: 'list',
  },
  {
    id: 'facturein',
    module: 2,
    hash: 'facturein',
    ruLabel: 'Счета-фактуры полученные',
    uzLabel: 'Qabul qilingan schet-fakturalar',
    purpose: 'Received tax invoices',
    kind: 'list',
  },
  {
    id: 'purchase-mgmt',
    module: 2,
    hash: 'purchasemanager',
    ruLabel: 'Управление закупками',
    uzLabel: 'Xaridlarni boshqarish',
    purpose: 'Purchase management report',
    kind: 'report',
  },

  // ── M03 Продажи ────────────────────────────────────────────
  {
    id: 'customerorder',
    module: 3,
    hash: 'customerorder',
    ruLabel: 'Заказы покупателей',
    uzLabel: 'Xaridor buyurtmalari',
    purpose: 'Customer orders',
    kind: 'list',
  },
  {
    id: 'invoiceout',
    module: 3,
    hash: 'invoiceout',
    ruLabel: 'Счета покупателям',
    uzLabel: 'Xaridor hisob-fakturalari',
    purpose: 'Customer invoices',
    kind: 'list',
  },
  {
    id: 'demand',
    module: 3,
    hash: 'demand',
    ruLabel: 'Отгрузки',
    uzLabel: "Jo'natmalar",
    purpose: 'Shipments',
    kind: 'list',
  },
  {
    id: 'salesreturn',
    module: 3,
    hash: 'salesreturn',
    ruLabel: 'Возвраты покупателей',
    uzLabel: 'Xaridor qaytarishlari',
    purpose: 'Sales returns',
    kind: 'list',
  },
  {
    id: 'factureout',
    module: 3,
    hash: 'factureout',
    ruLabel: 'Счета-фактуры выданные',
    uzLabel: 'Chiqarilgan schet-fakturalar',
    purpose: 'Issued tax invoices',
    kind: 'list',
  },
  {
    id: 'sales-funnel',
    module: 3,
    hash: 'salesfunnel',
    ruLabel: 'Воронка продаж',
    uzLabel: 'Savdo voronkasi',
    purpose: 'Sales funnel (kanban)',
    kind: 'special',
  },
  {
    id: 'sales-mgmt',
    module: 3,
    hash: 'salesmanager',
    ruLabel: 'Управление продажами',
    uzLabel: 'Savdoni boshqarish',
    purpose: 'Sales management report',
    kind: 'report',
  },

  // ── M04 Товары ─────────────────────────────────────────────
  {
    id: 'product',
    module: 4,
    hash: 'product',
    ruLabel: 'Товары и услуги',
    uzLabel: 'Tovar va xizmatlar',
    purpose: 'Product catalog',
    kind: 'list',
  },
  {
    id: 'variant',
    module: 4,
    hash: 'variant',
    ruLabel: 'Модификации',
    uzLabel: 'Modifikatsiyalar',
    purpose: 'Product variants',
    kind: 'list',
  },
  {
    id: 'bundle',
    module: 4,
    hash: 'bundle',
    ruLabel: 'Комплекты',
    uzLabel: 'Komplektlar',
    purpose: 'Bundles',
    kind: 'list',
  },
  {
    id: 'service',
    module: 4,
    hash: 'service',
    ruLabel: 'Услуги',
    uzLabel: 'Xizmatlar',
    purpose: 'Services',
    kind: 'list',
  },
  {
    id: 'productfolder',
    module: 4,
    hash: 'productfolder',
    ruLabel: 'Группы товаров',
    uzLabel: 'Tovar guruhlari',
    purpose: 'Folders',
    kind: 'list',
  },
  {
    id: 'pricelist',
    module: 4,
    hash: 'pricelist',
    ruLabel: 'Прайс-листы',
    uzLabel: "Narxlar ro'yxati",
    purpose: 'Price lists',
    kind: 'list',
  },
  {
    id: 'pricetype',
    module: 4,
    hash: 'pricetype',
    ruLabel: 'Типы цен',
    uzLabel: 'Narx turlari',
    purpose: 'Price types',
    kind: 'list',
  },
  {
    id: 'uom',
    module: 4,
    hash: 'uom',
    ruLabel: 'Единицы измерения',
    uzLabel: "O'lchov birliklari",
    purpose: 'Units of measure',
    kind: 'list',
  },

  // ── M05 CRM ────────────────────────────────────────────────
  {
    id: 'counterparty',
    module: 5,
    hash: 'counterparty',
    ruLabel: 'Контрагенты',
    uzLabel: 'Kontragentlar',
    purpose: 'Customers + suppliers',
    kind: 'list',
  },
  {
    id: 'contactperson',
    module: 5,
    hash: 'contactperson',
    ruLabel: 'Контактные лица',
    uzLabel: 'Aloqa shaxslari',
    purpose: 'Contact persons',
    kind: 'list',
  },
  {
    id: 'contract',
    module: 5,
    hash: 'contract',
    ruLabel: 'Договоры',
    uzLabel: 'Shartnomalar',
    purpose: 'Contracts',
    kind: 'list',
  },
  {
    id: 'event',
    module: 5,
    hash: 'event',
    ruLabel: 'События',
    uzLabel: 'Hodisalar',
    purpose: 'CRM interactions',
    kind: 'list',
  },

  // ── M06 Склад ──────────────────────────────────────────────
  {
    id: 'internalorder',
    module: 6,
    hash: 'internalorder',
    ruLabel: 'Внутренние заказы',
    uzLabel: 'Ichki buyurtmalar',
    purpose: 'Internal orders',
    kind: 'list',
  },
  {
    id: 'move',
    module: 6,
    hash: 'move',
    ruLabel: 'Перемещения',
    uzLabel: "Ko'chirishlar",
    purpose: 'Stock moves',
    kind: 'list',
  },
  {
    id: 'enter',
    module: 6,
    hash: 'enter',
    ruLabel: 'Оприходования',
    uzLabel: 'Kirim aktlari',
    purpose: 'Stock enters',
    kind: 'list',
  },
  {
    id: 'loss',
    module: 6,
    hash: 'loss',
    ruLabel: 'Списания',
    uzLabel: 'Hisobdan chiqarish',
    purpose: 'Stock losses',
    kind: 'list',
  },
  {
    id: 'inventory',
    module: 6,
    hash: 'inventory',
    ruLabel: 'Инвентаризации',
    uzLabel: 'Inventarizatsiyalar',
    purpose: 'Stock-takes',
    kind: 'list',
  },
  {
    id: 'store',
    module: 6,
    hash: 'store',
    ruLabel: 'Склады',
    uzLabel: 'Omborlar',
    purpose: 'Warehouses',
    kind: 'list',
  },
  {
    id: 'stock-report',
    module: 6,
    hash: 'stockbystore',
    ruLabel: 'Остатки',
    uzLabel: 'Qoldiqlar',
    purpose: 'Stock balance report',
    kind: 'report',
  },

  // ── M07 Деньги ─────────────────────────────────────────────
  {
    id: 'paymentin',
    module: 7,
    hash: 'paymentin',
    ruLabel: 'Входящие платежи',
    uzLabel: "Kirim to'lovlar",
    purpose: 'Incoming payments',
    kind: 'list',
  },
  {
    id: 'paymentout',
    module: 7,
    hash: 'paymentout',
    ruLabel: 'Исходящие платежи',
    uzLabel: "Chiqim to'lovlar",
    purpose: 'Outgoing payments',
    kind: 'list',
  },
  {
    id: 'cashin',
    module: 7,
    hash: 'cashin',
    ruLabel: 'Приходные ордера',
    uzLabel: 'Kirim orderlari',
    purpose: 'Cash-in orders',
    kind: 'list',
  },
  {
    id: 'cashout',
    module: 7,
    hash: 'cashout',
    ruLabel: 'Расходные ордера',
    uzLabel: 'Chiqim orderlari',
    purpose: 'Cash-out orders',
    kind: 'list',
  },
  {
    id: 'prepayment',
    module: 7,
    hash: 'prepayment',
    ruLabel: 'Предоплаты',
    uzLabel: "Old to'lovlar",
    purpose: 'Prepayments',
    kind: 'list',
  },
  {
    id: 'prepaymentreturn',
    module: 7,
    hash: 'prepaymentreturn',
    ruLabel: 'Возвраты предоплат',
    uzLabel: "Old to'lov qaytarishlari",
    purpose: 'Prepayment returns',
    kind: 'list',
  },
  {
    id: 'counterpartyadjustment',
    module: 7,
    hash: 'counterpartyadjustment',
    ruLabel: 'Корректировки взаиморасчётов',
    uzLabel: 'Hisob-kitob korrektirovkasi',
    purpose: 'Counterparty adjustments',
    kind: 'list',
  },
  {
    id: 'cashflow-report',
    module: 7,
    hash: 'moneyflow',
    ruLabel: 'Движение денег',
    uzLabel: 'Pul harakati',
    purpose: 'Cash flow report',
    kind: 'report',
  },

  // ── M08 Розница ────────────────────────────────────────────
  {
    id: 'retailshift',
    module: 8,
    hash: 'retailshift',
    ruLabel: 'Смены',
    uzLabel: 'Smenalar',
    purpose: 'Retail shifts',
    kind: 'list',
  },
  {
    id: 'retaildemand',
    module: 8,
    hash: 'retaildemand',
    ruLabel: 'Розничные продажи',
    uzLabel: 'Chakana savdolar',
    purpose: 'Retail sales',
    kind: 'list',
  },
  {
    id: 'retailsalesreturn',
    module: 8,
    hash: 'retailsalesreturn',
    ruLabel: 'Розничные возвраты',
    uzLabel: 'Chakana qaytarishlar',
    purpose: 'Retail returns',
    kind: 'list',
  },
  {
    id: 'retaildrawercashin',
    module: 8,
    hash: 'retaildrawercashin',
    ruLabel: 'Внесения денег',
    uzLabel: 'Pul kiritishlar',
    purpose: 'Cash-drawer in',
    kind: 'list',
  },
  {
    id: 'retaildrawercashout',
    module: 8,
    hash: 'retaildrawercashout',
    ruLabel: 'Выплаты денег',
    uzLabel: 'Pul chiqarishlar',
    purpose: 'Cash-drawer out',
    kind: 'list',
  },
  {
    id: 'retailstore',
    module: 8,
    hash: 'retailstore',
    ruLabel: 'Точки продаж',
    uzLabel: 'Savdo nuqtalari',
    purpose: 'Retail points',
    kind: 'list',
  },

  // ── M09 Онлайн-торговля ────────────────────────────────────
  {
    id: 'online-shops',
    module: 9,
    hash: 'onlineshops',
    ruLabel: 'Онлайн-магазины',
    uzLabel: "Onlayn do'konlar",
    purpose: 'Marketplace connectors',
    kind: 'list',
  },

  // ── M10 Производство ───────────────────────────────────────
  {
    id: 'processingplan',
    module: 10,
    hash: 'processingplan',
    ruLabel: 'Техкарты',
    uzLabel: 'Texkartalar',
    purpose: 'BOMs',
    kind: 'list',
  },
  {
    id: 'processingprocess',
    module: 10,
    hash: 'processingprocess',
    ruLabel: 'Техпроцессы',
    uzLabel: 'Texjarayonlar',
    purpose: 'Tech processes',
    kind: 'list',
  },
  {
    id: 'productionorder',
    module: 10,
    hash: 'productionorder',
    ruLabel: 'Заказы на производство',
    uzLabel: 'Ishlab chiqarish buyurtmalari',
    purpose: 'Production orders',
    kind: 'list',
  },
  {
    id: 'productiontask',
    module: 10,
    hash: 'productiontask',
    ruLabel: 'Производственные задания',
    uzLabel: 'Ishlab chiqarish topshiriqlari',
    purpose: 'Production tasks',
    kind: 'list',
  },
  {
    id: 'processing',
    module: 10,
    hash: 'processing',
    ruLabel: 'Техоперации',
    uzLabel: 'Texoperatsiyalar',
    purpose: 'Processing ops',
    kind: 'list',
  },

  // ── M11 Задачи ─────────────────────────────────────────────
  {
    id: 'task',
    module: 11,
    hash: 'task',
    ruLabel: 'Задачи',
    uzLabel: 'Vazifalar',
    purpose: 'Tasks',
    kind: 'list',
  },

  // ── M12 Решения ────────────────────────────────────────────
  {
    id: 'apps',
    module: 12,
    hash: 'apps',
    ruLabel: 'Решения',
    uzLabel: 'Yechimlar',
    purpose: 'Apps marketplace',
    kind: 'special',
  },

  // ── Admin (under user menu) ────────────────────────────────
  {
    id: 'my-account',
    module: 0,
    hash: 'myaccount',
    ruLabel: 'Мой аккаунт',
    uzLabel: 'Akkauntim',
    purpose: 'Account settings',
    kind: 'special',
  },
  {
    id: 'settings',
    module: 0,
    hash: 'settings',
    ruLabel: 'Настройки',
    uzLabel: 'Sozlamalar',
    purpose: 'Admin settings',
    kind: 'special',
  },
  {
    id: 'employee',
    module: 0,
    hash: 'employee',
    ruLabel: 'Сотрудники',
    uzLabel: 'Xodimlar',
    purpose: 'Employees',
    kind: 'list',
  },
  {
    id: 'role',
    module: 0,
    hash: 'role',
    ruLabel: 'Роли',
    uzLabel: 'Rollar',
    purpose: 'Permission roles',
    kind: 'list',
  },
  {
    id: 'organization',
    module: 0,
    hash: 'organization',
    ruLabel: 'Юрлица',
    uzLabel: 'Yuridik shaxslar',
    purpose: 'Organizations',
    kind: 'list',
  },
  {
    id: 'currency',
    module: 0,
    hash: 'currency',
    ruLabel: 'Валюты',
    uzLabel: 'Valyutalar',
    purpose: 'Currencies',
    kind: 'list',
  },
  {
    id: 'state',
    module: 0,
    hash: 'state',
    ruLabel: 'Статусы документов',
    uzLabel: 'Hujjat statuslari',
    purpose: 'Document states',
    kind: 'list',
  },
  {
    id: 'group',
    module: 0,
    hash: 'group',
    ruLabel: 'Отделы',
    uzLabel: "Bo'limlar",
    purpose: 'Departments',
    kind: 'list',
  },
  {
    id: 'project',
    module: 0,
    hash: 'project',
    ruLabel: 'Проекты',
    uzLabel: 'Loyihalar',
    purpose: 'Projects',
    kind: 'list',
  },
  {
    id: 'saleschannel',
    module: 0,
    hash: 'saleschannel',
    ruLabel: 'Каналы продаж',
    uzLabel: 'Savdo kanallari',
    purpose: 'Sales channels',
    kind: 'list',
  },
  {
    id: 'customentity',
    module: 0,
    hash: 'customentity',
    ruLabel: 'Пользовательские справочники',
    uzLabel: "Maxsus ma'lumotnomalar",
    purpose: 'Custom dictionaries',
    kind: 'list',
  },
  {
    id: 'vatrate',
    module: 0,
    hash: 'vatrate',
    ruLabel: 'Ставки НДС',
    uzLabel: 'NDS stavkalari',
    purpose: 'VAT rates',
    kind: 'list',
  },
];

/**
 * Entity slugs for API docs scraping.
 *
 * Slugs match dev.moysklad.ru URL format discovered from cross-references
 * in successfully-captured schemas. They may differ from our internal
 * entity names (e.g. API slug `pricetypes` → clone model `PriceType`).
 */
export const API_ENTITIES: string[] = [
  'assortment',
  'assortment-legacy',
  'bonus-operation', // was: bonustransaction
  'bundle',
  'cashier',
  'companysettings',
  'consignment',
  'contract',
  'counterparty',
  'country',
  'currency',
  'customentity',
  'discount',
  'employee',
  'eventfeed', // was: event
  'expenseitem',
  'files', // was: file (plural!)
  'group',
  'gtd', // was: customsdeclaration
  'images', // was: image (plural!)
  'organization',
  'pricetypes', // was: pricetype (plural!)
  'processingplan',
  'processingplanfolder',
  'processingprocess',
  'processingstage',
  'product',
  'productfolder',
  'project',
  'region',
  'retailstore',
  'saleschannel',
  'service',
  'store',
  'task',
  'taxrate', // was: vatrate
  'tracking-code', // was: trackingcode (hyphen!)
  'uom',
  'usersettings',
  'variant',
  'webhook',
  'webhookstock',
];

/**
 * Document slugs for API docs scraping.
 *
 * Same rule: these are the real Moysklad URL slugs. Our internal document
 * names (PurchaseOrder, CustomerOrder, ...) differ.
 */
export const API_DOCUMENTS: string[] = [
  'cashin',
  'cashout',
  'commissionreportin',
  'commissionreportout',
  'counterpartyadjustment',
  'customer', // was: customerorder
  'demand',
  'emissionorder', // was: markingcodeorder
  'enter',
  'facturein',
  'factureout',
  'internal', // was: internalorder
  'inventory',
  'invoice-in', // was: invoicein
  'invoice-out', // was: invoiceout
  'loss',
  'move',
  'payment-in', // was: paymentin
  'payment-out', // was: paymentout
  'prepayment',
  'prepayment-return', // was: prepaymentreturn
  'pricelist',
  'processing',
  'processingorder', // was: productiontask
  'production', // was: productionorder
  'purchase', // was: purchaseorder
  'purchase-return', // was: purchasereturn
  'retail-sales-return', // was: retailsalesreturn
  'retaildemand',
  'retaildrawercashin',
  'retaildrawercashout',
  'retailshift',
  'retireorder', // was: retirecode
  'sales-return', // was: salesreturn
  'supply',
];

/** Reports */
export const API_REPORTS: string[] = [
  'stock',
  'sales',
  'money',
  'turnover',
  'profit',
  'counterparty',
  'orders',
];
