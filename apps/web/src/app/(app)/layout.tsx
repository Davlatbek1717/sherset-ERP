'use client';

import { ChatButton } from '@/components/chat-button';
import { CommandPalette } from '@/components/command-palette';
import { FontSizeToggle } from '@/components/font-size-toggle';
import { HelpButton } from '@/components/help-button';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { NotificationBell } from '@/components/notification-bell';
import { useNotificationStream } from '@/hooks/use-notification-stream';
import { useTasksBadgeCount } from '@/hooks/use-tasks-badge-count';
import { api } from '@/lib/api-client';
import { hasAuthHint, logout, useAuth } from '@/lib/auth-store';
import { AppShell, Icons, type NavItem, ShersetLogo, SubNav, type SubNavItem } from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';

// Each top-level navbar module → the entities that make it relevant. A module
// is shown when the user can view ANY of them (empty = always visible). Keep in
// sync with the ENTITIES list in permissions.controller.ts (backend).
const MODULE_ENTITIES: Record<string, string[]> = {
  homepage: [],
  apps: [],
  purchases: ['purchaseorder', 'invoicein', 'supply', 'purchasereturn', 'facturein'],
  sales: ['customerorder', 'invoiceout', 'demand', 'salesreturn', 'factureout', 'commissionreport'],
  goods: ['product', 'productfolder', 'pricelist'],
  // «Kontragentlar» (merged CRM+Money, user decision 2026-07-04): counterparty
  // work AND its money documents live in one module now.
  crm: ['counterparty', 'contract', 'paymentin', 'paymentout', 'cashin', 'cashout', 'prepayment'],
  // 'store' is a catalog/reference entity many roles need for dropdowns — it
  // must NOT reveal the Stock (operations) module. Gate on stock DOCUMENTS only.
  stock: ['move', 'enter', 'loss', 'inventory', 'internalorder'],
  // Retail (POS) is gated on cashiersession only — a warehouse worker gets
  // retailsale view/update for the picking flow but must NOT see the POS module.
  retail: ['cashiersession'],
  production: ['processing', 'processingorder', 'bom'],
  tasks: ['task'],
  hr: ['employee'],
  analitika: ['analitika'],
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  const auth = useAuth();
  const tNav = useTranslations('nav');
  const tCommon = useTranslations('common');
  const tSales = useTranslations('subnav.sales');
  const tPurchases = useTranslations('subnav.purchases');
  const tMoney = useTranslations('subnav.money');
  const tCrm = useTranslations('subnav.crm');
  const tProducts = useTranslations('subnav.products');
  const tStock = useTranslations('subnav.stock');
  const tReports = useTranslations('subnav.reports');
  const tProduction = useTranslations('subnav.production');
  const tRetail = useTranslations('subnav.retail');
  const tEcom = useTranslations('subnav.ecom');
  const tHr = useTranslations('subnav.hr');
  const tAnalitika = useTranslations('subnav.analitika');

  // Redirect to /login if not authenticated (after bootstrap attempt).
  // Suppress the redirect when sessionStorage still has the auth hint —
  // that means this tab WAS logged in, the cookie is presumed still valid,
  // and bootstrap simply hasn't finished refreshing the access token yet
  // (typical after a Next.js dev HMR chunk reload). Without this guard,
  // every HMR refresh briefly flashes the user to /login.
  useEffect(() => {
    if (auth.initialized && !auth.user && !hasAuthHint()) {
      const redirect = encodeURIComponent(pathname);
      router.replace(`/login?redirect=${redirect}`);
    }
  }, [auth.initialized, auth.user, pathname, router]);

  // Realtime notifications via SSE. Internally a no-op until auth.user
  // resolves, so it's safe to call unconditionally here.
  useNotificationStream();

  // Overdue/active task count for the Задачи tab badge — moysklad parity
  // (their navbar shows e.g. "7" in red on the tab when the user has
  // tasks past their dueAt). The hook gracefully returns 0 when the
  // user isn't yet authenticated.
  const tasksBadgeCount = useTasksBadgeCount();

  // Effective permission matrix → drives which navbar modules are visible.
  // Admin (HR 'admin') sees everything; otherwise a module shows only when the
  // user can view at least one of its entities. While the matrix is still
  // loading (permMine undefined) we show all items to avoid an empty-nav flash.
  const isNavAdmin = auth.user?.hrRoles?.includes('admin') ?? false;
  const { data: permMine } = useQuery<{ matrix: Record<string, Record<string, string>> }>({
    queryKey: ['permissions-me'],
    queryFn: () => api.get('/permissions/me'),
    enabled: !!auth.user && !isNavAdmin,
    staleTime: 5 * 60_000,
  });
  const canViewModule = (ents: string[]) =>
    isNavAdmin ||
    ents.length === 0 ||
    !permMine ||
    ents.some((e) => (permMine.matrix?.[e]?.view ?? 'NO') !== 'NO');

  if (!auth.initialized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--ms-bg-app)] text-[var(--ms-text-muted)] text-sm">
        {tCommon('loading')}
      </div>
    );
  }

  if (!auth.user) {
    // Redirect effect above will fire; render nothing to avoid flash
    return null;
  }

  // Module nav matches moysklad's 12-tab layout exactly:
  //   Показатели · Закупки · Продажи · Товары · CRM · Склад · Деньги ·
  //   Розница · Онлайн-торговля · Производство · Задачи · Решения
  // Reports and Settings are intentionally absent here — moysklad
  // exposes them differently:
  //   - Reports → reachable via the per-module sub-nav (Sales/Money/Stock
  //     each surface their relevant report), plus the `/reports` URL
  //     remains addressable for direct navigation.
  //   - Settings → reachable via the user-block dropdown in the header
  //     (and `/settings/*` remains addressable). Removing them from the
  //     primary nav matches moysklad parity and leaves room for the
  //     "Решения" tab (apps/integrations marketplace).
  // Moysklad parity: every navbar icon is rendered MONO-CHROMATIC
  // (white on the medium-blue navbar, dark on the active white pill)
  // — NOT per-module brand colors. The colorful icon palette we used
  // earlier was a misread of the screenshots; moysklad's real navbar
  // is a single-tone line-icon set inheriting the navbar text color.
  // We let lucide icons inherit `currentColor` from the surrounding
  // text class — no per-item iconColorClass.
  // Icon size = 24px, MEASURED from live moysklad (2026-06-23): their navbar
  // icon is a 24×24 raster sitting at top:15 inside the 58px bar. The earlier
  // 18px was only a workaround for the too-short 42px bar (a bigger icon
  // overflowed it and tripped a scrollbar). Now that the bar is a
  // moysklad-correct 58px (see AppShell), 24px icons fit cleanly
  // (15 + 24 + 11px label = 50 < 58) and read as crisp as moysklad's.
  // stroke-width 1.5 (USER 2026-06-23 «iconlar qalin, ingichka qil»): lucide
  // line icons default to strokeWidth 2 which read heavy/bold next to moysklad's
  // fine raster glyphs. The arbitrary CSS `stroke-width` overrides the SVG's
  // presentation attribute (CSS beats presentation attrs), thinning every nav
  // icon without touching icons elsewhere in the app.
  const navIconClass = 'w-[24px] h-[24px] [stroke-width:1.5]';
  const moduleNav: NavItem[] = [
    {
      key: 'homepage',
      label: tNav('homepage'),
      href: '/',
      icon: <Icons.homepage className={navIconClass} />,
    },
    {
      key: 'purchases',
      label: tNav('purchases'),
      href: '/purchase-orders',
      icon: <Icons.purchases className={navIconClass} />,
    },
    {
      key: 'sales',
      label: tNav('sales'),
      href: '/customer-orders',
      icon: <Icons.sales className={navIconClass} />,
    },
    {
      key: 'goods',
      label: tNav('goods'),
      href: '/products',
      icon: <Icons.goods className={navIconClass} />,
    },
    {
      key: 'crm',
      label: tNav('crm'),
      href: '/counterparties',
      icon: <Icons.crm className={navIconClass} />,
    },
    {
      key: 'stock',
      label: tNav('stock'),
      href: '/moves',
      icon: <Icons.stock className={navIconClass} />,
    },
    {
      key: 'retail',
      label: tNav('retail'),
      href: '/retail',
      icon: <Icons.retail className={navIconClass} />,
    },
    // «Онлайн-торговля» is NOT a top-level moysklad navbar module (grounded live
    // 2026-06-23: their bar is 11 tabs, no e-commerce tab). moysklad exposes
    // e-commerce as an INTEGRATION under «Решения». So we drop the standalone tab;
    // /ecommerce now lives under the apps module (see activeModule + the entry
    // card on /apps). User decision 2026-06-23: «Решения ostiga ko'chirish».
    {
      key: 'production',
      label: tNav('production'),
      href: '/production',
      icon: <Icons.production className={navIconClass} />,
    },
    {
      key: 'tasks',
      label: tNav('tasks'),
      href: '/tasks',
      icon: <Icons.tasks className={navIconClass} />,
      badge:
        tasksBadgeCount > 0 ? (
          <span
            className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[var(--ms-destructive-500)] px-1 font-bold text-[10px] text-white tabular-nums leading-none shadow-sm"
            data-test-id="nav-tasks-badge"
          >
            {tasksBadgeCount > 99 ? '99+' : tasksBadgeCount}
          </span>
        ) : null,
    },
    {
      key: 'apps',
      label: tNav('apps'),
      href: '/apps',
      icon: <Icons.apps className={navIconClass} />,
    },
    {
      key: 'hr',
      label: tNav('hr'),
      href: '/hr',
      icon: <Icons.hr className={navIconClass} />,
    },
    {
      key: 'analitika',
      label: tNav('analitika'),
      href: '/analitika',
      icon: <Icons.analitika className={navIconClass} />,
    },
  ];

  // moysklad's CRM second-level nav is exactly these 4 (live-grounded 2026-06-25 on
  // climart_santex_group → docs/audits/crm-menu-2026-06-25/02-counterparties.png):
  // Контрагенты · Договоры · Звонки · Операции с баллами. The deals/funnel pages
  // (Сделки/Канбан/Воронки) are moysklad's tariff-gated advanced CRM — not surfaced
  // here; Контактные лица live inside the counterparty card; «Скидки» is not a CRM
  // section in moysklad. Those routes still exist but are no longer linked in the strip.
  // «Kontragentlar» — the merged CRM+Money strip (user decision 2026-07-04):
  // everything counterparty-related on one page. Deals/Kanban/Funnels/Calls left
  // the strip (routes still work by URL); payroll moved to HR; the cash-flow/PnL
  // reports stay in «Hisobotlar».
  const crmSubNav: SubNavItem[] = [
    { key: 'counterparties', label: tCrm('counterparties'), href: '/counterparties' },
    { key: 'payments', label: tMoney('payments'), href: '/payments' },
    {
      key: 'mutualsettlements',
      label: tMoney('mutual_settlements'),
      href: '/reports/counterparty-balance',
    },
    // «Qarz undirish» (TZ v2) — call-markaz + kassa moduli. Kontragent
    // bo'limida turadi, chunki qarz har doim KONTRAGENTGA bog'langan; o'zaro
    // hisob-kitobdan farqi — bu FAOL UNDIRISH jarayoni (qo'ng'iroq, izoh,
    // keyingi aloqa sanasi), sof balans ko'rinishi emas.
    { key: 'debts', label: tCrm('debts'), href: '/debts' },
    { key: 'prepayments', label: tMoney('prepayments'), href: '/prepayments' },
    { key: 'contracts', label: tCrm('contracts'), href: '/contracts' },
    { key: 'discounts', label: tCrm('discounts'), href: '/discounts' },
    { key: 'bonus_operations', label: tCrm('bonus_operations'), href: '/loyalty-operations' },
    { key: 'corrections', label: tMoney('corrections'), href: '/counterparty-adjustments' },
    { key: 'bank_import', label: tMoney('bank_import'), href: '/bank-import' },
  ];

  // Order matches moysklad's "Закупки" sub-nav strip exactly:
  // Заказы поставщикам / Счета поставщиков / Приёмки / Возвраты поставщикам /
  // Счета-фактуры полученные / Управление закупками / Обучение
  // (see docs/moysklad-reference/visual-captures/02-module/purchaseorder/).
  // Hard-coded labels removed — every entry now goes through i18n so the
  // ru/uz toggle keeps subnav consistent (previously "Olingan schyot-
  // fakturalar" leaked uz strings into ru pages).
  const purchasesSubNav: SubNavItem[] = [
    { key: 'purchaseorders', label: tPurchases('purchase_orders'), href: '/purchase-orders' },
    { key: 'invoicesin', label: tPurchases('invoices_in'), href: '/invoices-in' },
    { key: 'supplies', label: tPurchases('supplies'), href: '/supplies' },
    { key: 'returnsout', label: tPurchases('purchase_returns'), href: '/purchase-returns' },
    { key: 'facturesin', label: tPurchases('factures_in'), href: '/factures-in' },
    {
      key: 'purchase-mgmt',
      label: tPurchases('purchase_management'),
      href: '/reports/purchase-management',
    },
    {
      key: 'education',
      label: tPurchases('education'),
      href: '/help/purchases',
    },
  ];

  // Order matches moysklad's "Продажи" sub-nav exactly (live-grounded
  // 2026-06-25 from demands/detail/edit-default.html + the user's screenshot):
  // Заказы покупателей / Счета покупателям / Отгрузки / Отчеты комиссионера /
  // Возвраты покупателей / Счета-фактуры выданные / Прибыльность /
  // Товары на реализации / Воронка продаж / Юнит-экономика / Обучение
  // Hard-coded uz labels removed — every entry now goes through i18n
  // so the ru/uz toggle keeps the subnav consistent on every page.
  const salesSubNav: SubNavItem[] = [
    { key: 'customerorders', label: tSales('customer_orders'), href: '/customer-orders' },
    { key: 'invoices', label: tSales('invoices_out'), href: '/invoices-out' },
    { key: 'demands', label: tSales('demands'), href: '/demands' },
    {
      key: 'commission',
      label: tSales('commission_reports'),
      href: '/commission-reports',
    },
    { key: 'salesreturns', label: tSales('sales_returns'), href: '/sales-returns' },
    {
      key: 'facturesout',
      label: tSales('factures_out'),
      href: '/factures-out',
    },
    { key: 'profit', label: tSales('profitability'), href: '/reports/profitability' },
    { key: 'consign', label: tSales('consignments'), href: '/consignments' },
    // «Воронка продаж» — the funnel page lives at /opportunities (the
    // /sales-funnel route never existed → the tab 404'd). Label grounded
    // to the full «Воронка продаж» (was the truncated «Воронка»).
    { key: 'funnel', label: tSales('funnel'), href: '/opportunities' },
    /* moysklad's 10th sub-nav tab — "Юнит-экономика". Surfaces the
       unit-economics report (margin per SKU after costs); marked
       unbuilt for now since the report backend isn't wired. */
    {
      key: 'unit_economics',
      label: tSales('unit_economics'),
      href: '/reports/unit-economics',
    },
    // moysklad's 11th tab — «Обучение» (training). Points at our onboarding
    // page; moysklad opens its academy, the closest internal equivalent.
    { key: 'training', label: tSales('training'), href: '/getting-started' },
  ];

  // Order matches moysklad's «Склад» sub-nav exactly (live-grounded 2026-06-20):
  // Оприходования · Списания · Перемещения · Инвентаризации · [Волны отбора] ·
  // Внутренние заказы · Остатки · [Обороты] · [Склады] · [Обучение].
  // Bracketed entries are not built yet — tracked as the remaining Склад-section
  // work (NEXT): Волны отбора + Обороты (new reports/features), Склады (warehouse
  // list), Обучение (training/help). Existing six are now in moysklad order.
  const stockSubNav: SubNavItem[] = [
    { key: 'enters', label: tStock('enters'), href: '/enters' },
    { key: 'losses', label: tStock('losses'), href: '/losses' },
    { key: 'moves', label: tStock('moves'), href: '/moves' },
    { key: 'inventories', label: tStock('inventories'), href: '/inventories' },
    { key: 'pickingwaves', label: tStock('picking_waves'), href: '/picking-waves' },
    { key: 'internalorders', label: tStock('internal_orders'), href: '/internal-orders' },
    { key: 'restocktasks', label: tStock('restock'), href: '/restock-tasks' },
    { key: 'omborchi', label: "Omborchi (yig'ish)", href: '/omborchi' },
    { key: 'cellscanner', label: 'Yacheyka skaneri', href: '/cell' },
    { key: 'replenishment', label: "To'ldirish kerak", href: '/replenishment' },
    // «Остатки» (/stock-balance) removed — that route has no page (dead link);
    // the working stock-balance lives under Hisobotlar → /reports/stock-balance.
    { key: 'turnover', label: tStock('turnover'), href: '/turnover' },
    // «Склады» (/stores) 2026-07-04 user talabi bilan QAYTARILDI — yacheyka
    // labellari kirish nuqtasi shu ro'yxatda (Sozlamalar → Склады bilan bir
    // xil StoresListView, faqat Sklad-modul chrome'ida).
    { key: 'stores', label: tStock('stores'), href: '/stores' },
    { key: 'training', label: tStock('training'), href: '/stock-training' },
  ];

  const reportsSubNav: SubNavItem[] = [
    { key: 'overview', label: tReports('overview'), href: '/reports' },
    { key: 'sales', label: tReports('sales'), href: '/reports/sales' },
    { key: 'cashflow', label: tReports('cash_flow'), href: '/reports/cash-flow' },
    { key: 'pnl', label: tReports('pnl'), href: '/reports/pnl' },
    { key: 'stockbalance', label: tReports('stock_balance'), href: '/reports/stock-balance' },
    {
      key: 'cpbalance',
      label: tReports('counterparty_balance'),
      href: '/reports/counterparty-balance',
    },
  ];

  const productionSubNav: SubNavItem[] = [
    { key: 'overview', label: tProduction('overview'), href: '/production' },
    { key: 'productions', label: tProduction('productions'), href: '/productions' },
    { key: 'boms', label: tProduction('boms'), href: '/production/boms' },
    { key: 'processes', label: tProduction('processes'), href: '/production/processes' },
    { key: 'stages', label: tProduction('stages'), href: '/production/stages' },
    { key: 'work_orders', label: tProduction('work_orders'), href: '/production/work-orders' },
    {
      key: 'processing_orders',
      label: tProduction('processing_orders'),
      href: '/processing-orders',
    },
    { key: 'processings', label: tProduction('processings'), href: '/processings' },
  ];

  const retailSubNav: SubNavItem[] = [
    { key: 'sotuv', label: tRetail('sotuv'), href: '/sotuv' },
    { key: 'sessions', label: tRetail('sessions'), href: '/retail/sessions' },
    { key: 'sales', label: tRetail('sales'), href: '/retail/sales' },
    { key: 'z_report', label: tRetail('z_report'), href: '/retail/z-report' },
  ];

  const ecomSubNav: SubNavItem[] = [
    { key: 'overview', label: tEcom('overview'), href: '/ecommerce' },
    { key: 'channels', label: tEcom('channels'), href: '/ecommerce/channels' },
    { key: 'orders', label: tEcom('orders'), href: '/ecommerce/orders' },
  ];

  // moysklad's «Товары» section nav is exactly 3 tabs — «Товары и услуги ·
  // Прайс-листы · Серийные номера» (grounded live on online.moysklad.uz). The
  // other product concepts are NOT tabs there: Услуги/Комплекты are the «Тип»
  // filter inside the list, Группы товаров is the left folder tree, Остатки
  // lives under «Склад», Типы цен under «Настройки». We mirror that — same
  // parity pattern as Reports/Settings above: trimmed from the sub-nav while the
  // pages stay URL-addressable (and keep highlighting «Товары» via activeModule).
  // «Серийные номера» is a read-only serial-number registry — empty until a
  // serial-accounting subsystem populates it (moysklad's own account is empty
  // here too), but the page exists for 1:1 parity.
  const productSubNav: SubNavItem[] = [
    { key: 'list', label: tProducts('list'), href: '/products' },
    { key: 'price-lists', label: tProducts('price_lists'), href: '/price-lists' },
    { key: 'serial-numbers', label: tProducts('serial_numbers'), href: '/serial-numbers' },
  ];

  const hrSubNav: SubNavItem[] = [
    { key: 'home', label: tHr('home'), href: '/hr' },
    { key: 'employees', label: tHr('employees'), href: '/hr/employees' },
    { key: 'attendance', label: tHr('attendance'), href: '/hr/attendance' },
    { key: 'tasks', label: tHr('tasks'), href: '/hr/tasks' },
    { key: 'review', label: tHr('review'), href: '/hr/review' },
    { key: 'my-tasks', label: tHr('my_tasks'), href: '/hr/my-tasks' },
    { key: 'payroll', label: tHr('payroll'), href: '/hr/payroll' },
    { key: 'messages', label: tHr('messages'), href: '/hr/messages' },
    { key: 'reports', label: tHr('reports'), href: '/hr/reports' },
    { key: 'settings', label: tHr('settings'), href: '/hr/settings' },
  ];

  const analitikaSubNav: SubNavItem[] = [
    { key: 'dashboard', label: tAnalitika('dashboard'), href: '/analitika' },
    {
      key: 'counterparties',
      label: tAnalitika('counterparties'),
      href: '/analitika/kontragentlar',
    },
    { key: 'products', label: tAnalitika('products'), href: '/analitika/mahsulotlar' },
    { key: 'orders', label: tAnalitika('orders'), href: '/analitika/buyurtmalar' },
    { key: 'inventory', label: tAnalitika('inventory'), href: '/analitika/inventerizatsiya' },
    { key: 'staff', label: tAnalitika('staff'), href: '/analitika/xodimlar' },
    { key: 'sync', label: tAnalitika('sync'), href: '/analitika/sinxronlash' },
    { key: 'settings', label: tAnalitika('settings'), href: '/analitika/sozlamalar' },
  ];

  const activeModule =
    pathname.startsWith('/products') ||
    pathname.startsWith('/product-folders') ||
    pathname.startsWith('/services') ||
    pathname.startsWith('/bundles') ||
    pathname.startsWith('/variants') ||
    pathname.startsWith('/price-lists') ||
    pathname.startsWith('/price-types') ||
    pathname.startsWith('/serial-numbers') ||
    pathname.startsWith('/tracking-codes')
      ? 'goods'
      : pathname.startsWith('/counterparties') ||
          pathname.startsWith('/contracts') ||
          pathname.startsWith('/contact-persons') ||
          pathname.startsWith('/calls') ||
          pathname.startsWith('/loyalty-operations') ||
          pathname.startsWith('/opportunities') ||
          pathname.startsWith('/pipelines') ||
          pathname.startsWith('/discounts') ||
          // merged «Pul» routes (user decision 2026-07-04) — one module now
          pathname === '/payments' ||
          pathname.startsWith('/payments-in') ||
          pathname.startsWith('/payments-out') ||
          pathname.startsWith('/cash-in') ||
          pathname.startsWith('/cash-out') ||
          pathname.startsWith('/bank-import') ||
          pathname.startsWith('/counterparty-adjustments') ||
          pathname.startsWith('/prepayments') ||
          pathname.startsWith('/prepayment-returns') ||
          pathname.startsWith('/money') ||
          // «Qarz undirish» (TZ v2) — call-markaz + kassa moduli
          pathname.startsWith('/debts') ||
          // the «O'zaro hisob-kitoblar» tab lives at /reports/* but belongs here
          pathname.startsWith('/reports/counterparty-balance')
        ? 'crm'
        : pathname.startsWith('/customer-orders') ||
            pathname.startsWith('/invoices-out') ||
            pathname.startsWith('/demands') ||
            pathname.startsWith('/sales-returns') ||
            pathname.startsWith('/sales-funnel')
          ? 'sales'
          : pathname.startsWith('/purchases') ||
              pathname.startsWith('/purchase-orders') ||
              pathname.startsWith('/invoices-in') ||
              pathname.startsWith('/supplies') ||
              pathname.startsWith('/purchase-returns')
            ? 'purchases'
            : pathname.startsWith('/moves') ||
                pathname.startsWith('/internal-orders') ||
                pathname.startsWith('/losses') ||
                pathname.startsWith('/enters') ||
                pathname.startsWith('/inventories') ||
                pathname.startsWith('/picking-waves') ||
                pathname.startsWith('/stores') ||
                pathname.startsWith('/turnover') ||
                pathname.startsWith('/stock-balance') ||
                pathname.startsWith('/omborchi') ||
                pathname.startsWith('/replenishment') ||
                pathname.startsWith('/restock-tasks') ||
                pathname.startsWith('/stock')
              ? 'stock'
              : pathname.startsWith('/reports')
                ? 'reports'
                : pathname.startsWith('/settings')
                  ? 'settings'
                  : pathname.startsWith('/production') ||
                      pathname.startsWith('/processing-orders') ||
                      pathname.startsWith('/processings')
                    ? 'production'
                    : pathname.startsWith('/retail') || pathname.startsWith('/sotuv')
                      ? 'retail'
                      : // e-commerce lives UNDER «Решения» (apps), not as its own
                        // tab — /ecommerce highlights the Решения module.
                        pathname.startsWith('/ecommerce')
                        ? 'apps'
                        : pathname.startsWith('/apps')
                          ? 'apps'
                          : pathname.startsWith('/hr') || pathname.startsWith('/payrolls')
                            ? 'hr'
                            : pathname.startsWith('/analitika')
                              ? 'analitika'
                              : pathname === '/'
                                ? 'homepage'
                                : null;

  const navWithActive = moduleNav
    .filter((m) => canViewModule(MODULE_ENTITIES[m.key] ?? []))
    .map((m) => ({ ...m, active: m.key === activeModule }));

  const matchActive = (items: SubNavItem[]): SubNavItem[] =>
    items.map((i) => ({ ...i, active: pathname === i.href || pathname.startsWith(`${i.href}/`) }));

  const subNavItems =
    activeModule === 'goods'
      ? matchActive(productSubNav)
      : activeModule === 'crm'
        ? matchActive(crmSubNav)
        : activeModule === 'sales'
          ? matchActive(salesSubNav)
          : activeModule === 'purchases'
            ? matchActive(purchasesSubNav)
            : activeModule === 'stock'
              ? matchActive(stockSubNav)
              : activeModule === 'reports'
                ? matchActive(reportsSubNav)
                : activeModule === 'settings'
                  ? null /* settings now uses left sidebar (SettingsSidebar) */
                  : activeModule === 'production'
                    ? matchActive(productionSubNav)
                    : activeModule === 'retail'
                      ? matchActive(retailSubNav)
                      : // on /ecommerce the active module is «apps» (Решения), but we
                        // still surface the e-commerce sub-nav (overview/channels/orders).
                        pathname.startsWith('/ecommerce')
                        ? matchActive(ecomSubNav)
                        : activeModule === 'hr'
                          ? matchActive(hrSubNav)
                          : activeModule === 'analitika'
                            ? matchActive(analitikaSubNav)
                            : null;

  // Trial banner removed from the global layout — moysklad surfaces the
  // upgrade CTA in /settings/billing instead, and the orange strip across
  // every page added visual noise without driving conversions. The
  // <TrialBanner> component is kept in the codebase and re-rendered on
  // the billing page only when the account is on the trial plan.

  return (
    <AppShell
      brand={
        <a href="/" aria-label="Sherset — bosh sahifa" className="flex items-center">
          <ShersetLogo variant="white" height={22} className="shrink-0" />
        </a>
      }
      primaryNav={navWithActive}
      topRightExtras={
        <div className="flex items-center gap-1">
          {/* Moysklad parity: navbar has NO global search button — search
              lives inside each list page header. CommandPalette stays
              mounted as a hidden cmd+k overlay so power users can still
              jump between modules without surfacing a navbar trigger. */}
          <CommandPalette hideTrigger />
          {/* <sm (phone): only the notification bell stays on the top bar —
              the rest overflow the narrow viewport. Font-size/chat/help show
              from `sm` up; language moves into the hamburger drawer below. */}
          <div className="hidden items-center gap-1 sm:flex">
            <FontSizeToggle />
            <ChatButton />
          </div>
          <NotificationBell />
          <div className="hidden items-center gap-1 sm:flex">
            <HelpButton />
            <LocaleSwitcher />
          </div>
        </div>
      }
      drawerExtras={<LocaleSwitcher variant="plain" />}
      user={{
        name: auth.user.name,
        email: auth.user.email,
      }}
      onLogout={logout}
      onSettings={() => router.push('/settings/profile')}
    >
      {subNavItems && <SubNav items={subNavItems} />}
      {/* Natural document scroll — the app grows with its content and the
          document body scrolls (NO inner scroll boxes), per the user's
          «remove inner scrolls completely» request. Any list page that still
          passes DataTable `fillHeight` is inert here (no height-bounded
          ancestor), so the grid never gets its own internal scrollbar. */}
      <div className="flex flex-col">{children}</div>
    </AppShell>
  );
}
