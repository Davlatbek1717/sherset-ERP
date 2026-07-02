import type { Page } from 'playwright';
import type { PageKind, PageProfile } from './types.ts';

/**
 * Detect the kind of page we're on (list, edit, detail, report, special, settings)
 * by inspecting the DOM. Used to choose the right capture profile.
 */

export async function detectPageProfile(
  page: Page,
  routeId: string,
  hash: string,
): Promise<PageProfile> {
  // Basic settle wait — SPA hydration
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(600);

  const signatures = await page.evaluate(() => {
    const hasTable =
      document.querySelectorAll('table, [role=table], [class*=table]:not([class*=cell])').length >
      0;
    const hasForm =
      document.querySelectorAll('input, textarea, select').length > 5 &&
      document.querySelectorAll('button').length > 2;
    const toolbar = Array.from(document.querySelectorAll('button, a')).filter((el) => {
      const r = el.getBoundingClientRect();
      return r.top < 260 && r.top > 100 && r.height > 18 && r.height < 50;
    });
    const hasToolbar = toolbar.length >= 3;
    const hasSubNav =
      document.querySelectorAll('nav a, [class*=sub-nav] a, [role=tablist] a').length >= 3;
    const hasEmptyState = Array.from(document.querySelectorAll('*')).some((el) => {
      const txt = (el.textContent ?? '').trim();
      return (
        /Создать|Создавайте|Добавьте|создайте/i.test(txt) &&
        txt.length < 100 &&
        el.children.length < 5
      );
    });
    const h1 = document.querySelector('h1, h2, [class*=title]:not(a):not(nav)');
    return {
      hasTable,
      hasForm,
      hasToolbar,
      hasSubNav,
      hasEmptyState,
      interactiveCount: document.querySelectorAll(
        'button, a, input, select, textarea, [role=button], [role=tab], [role=menuitem]',
      ).length,
      bodyHeight: document.body.scrollHeight,
      title: (h1?.textContent ?? '').trim() || null,
    };
  });

  let kind: PageKind = 'unknown';
  if (hash.includes('/edit')) {
    kind = 'edit';
  } else if (hash.includes('detail')) {
    kind = 'detail';
  } else if (
    hash === 'dashboard' ||
    hash === 'homepage' ||
    hash === 'apps' ||
    hash === 'salesfunnel'
  ) {
    kind = 'special';
  } else if (
    hash === 'settings' ||
    hash === 'myaccount' ||
    /^(employee|role|organization|currency|state|group|project|saleschannel|customentity|vatrate|taxrate)$/.test(
      hash,
    )
  ) {
    kind = 'settings';
  } else if (/manager|stockbystore|moneyflow/.test(hash)) {
    kind = 'report';
  } else if (signatures.hasTable || signatures.hasEmptyState) {
    kind = 'list';
  } else if (signatures.hasForm) {
    kind = 'edit';
  }

  return {
    routeId,
    hash,
    kind,
    signatures: {
      hasTable: signatures.hasTable,
      hasForm: signatures.hasForm,
      hasToolbar: signatures.hasToolbar,
      hasSubNav: signatures.hasSubNav,
      hasEmptyState: signatures.hasEmptyState,
      interactiveCount: signatures.interactiveCount,
      bodyHeight: signatures.bodyHeight,
    },
    title: signatures.title,
  };
}
