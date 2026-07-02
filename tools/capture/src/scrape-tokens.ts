import { writeFile } from 'node:fs/promises';
import { launchAuthenticated } from './auth/session.ts';
import { OUTPUT, URLS } from './config.ts';
import { child } from './utils/logger.ts';
import { ensureParent } from './utils/paths.ts';
import { sleep } from './utils/wait.ts';

const log = child('scrape-tokens');

export interface DesignTokens {
  capturedAt: string;
  fontFamily: string;
  bodyColor: string;
  bodyBg: string;
  heading: {
    h1: { family: string; size: string; weight: string; color: string };
    h2: { family: string; size: string; weight: string; color: string };
    h3: { family: string; size: string; weight: string; color: string };
  };
  buttons: {
    primary: {
      bg: string;
      color: string;
      borderRadius: string;
      padding: string;
      fontWeight: string;
    };
    secondary: {
      bg: string;
      color: string;
      border: string;
      borderRadius: string;
    };
  };
  links: { color: string };
  inputs: {
    border: string;
    borderRadius: string;
    padding: string;
    placeholderColor: string;
  };
  spacing: { base: number };
  zIndex: Record<string, number>;
  cssVariables: Record<string, string>;
}

/** Extract computed design tokens from a real logged-in page. */
export async function runScrapeTokens(): Promise<void> {
  log.info('Starting design tokens extractor.');

  const { browser, context } = await launchAuthenticated(true);
  try {
    const page = await context.newPage();
    await page.goto(URLS.app, { waitUntil: 'domcontentloaded' });
    await sleep(2_000);

    const tokens = await page.evaluate(() => {
      const cs = (el: Element, prop: string) => getComputedStyle(el).getPropertyValue(prop);
      const get = (sel: string) => document.querySelector(sel);

      const body = document.body;
      const h1 = get('h1') ?? body;
      const h2 = get('h2') ?? body;
      const h3 = get('h3') ?? body;
      const primary = get('.ms-button-primary, button[class*=primary], button.primary') ?? body;
      const secondary =
        get('.ms-button-additional, button[class*=additional], button[class*=secondary]') ?? body;
      const link = get('a[href]');
      const input = get('input[type=text], input[type=search], input:not([type=hidden])');

      // CSS custom properties (var(--...))
      const vars: Record<string, string> = {};
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          const rules = sheet.cssRules || [];
          for (const rule of Array.from(rules) as CSSStyleRule[]) {
            if (!(rule instanceof CSSStyleRule)) continue;
            for (let i = 0; i < rule.style.length; i++) {
              const name = rule.style[i]!;
              if (name.startsWith('--')) {
                vars[name] = rule.style.getPropertyValue(name).trim();
              }
            }
          }
        } catch {
          // CORS-blocked sheet — skip
        }
      }

      return {
        fontFamily: cs(body, 'font-family'),
        bodyColor: cs(body, 'color'),
        bodyBg: cs(body, 'background-color'),
        heading: {
          h1: {
            family: cs(h1, 'font-family'),
            size: cs(h1, 'font-size'),
            weight: cs(h1, 'font-weight'),
            color: cs(h1, 'color'),
          },
          h2: {
            family: cs(h2, 'font-family'),
            size: cs(h2, 'font-size'),
            weight: cs(h2, 'font-weight'),
            color: cs(h2, 'color'),
          },
          h3: {
            family: cs(h3, 'font-family'),
            size: cs(h3, 'font-size'),
            weight: cs(h3, 'font-weight'),
            color: cs(h3, 'color'),
          },
        },
        buttons: {
          primary: {
            bg: cs(primary, 'background-color'),
            color: cs(primary, 'color'),
            borderRadius: cs(primary, 'border-radius'),
            padding: cs(primary, 'padding'),
            fontWeight: cs(primary, 'font-weight'),
          },
          secondary: {
            bg: cs(secondary, 'background-color'),
            color: cs(secondary, 'color'),
            border: cs(secondary, 'border'),
            borderRadius: cs(secondary, 'border-radius'),
          },
        },
        links: { color: link ? cs(link, 'color') : '' },
        inputs: input
          ? {
              border: cs(input, 'border'),
              borderRadius: cs(input, 'border-radius'),
              padding: cs(input, 'padding'),
              placeholderColor: '',
            }
          : { border: '', borderRadius: '', padding: '', placeholderColor: '' },
        cssVariables: vars,
      };
    });

    const full: DesignTokens = {
      capturedAt: new Date().toISOString(),
      ...tokens,
      spacing: { base: 8 },
      zIndex: { base: 1, modal: 1000, toast: 2000 },
    } as DesignTokens;

    await ensureParent(OUTPUT.designTokens);
    await writeFile(OUTPUT.designTokens, JSON.stringify(full, null, 2), 'utf8');
    log.info({ file: OUTPUT.designTokens }, 'tokens extracted');
  } finally {
    await context.close();
    await browser.close();
  }
}
