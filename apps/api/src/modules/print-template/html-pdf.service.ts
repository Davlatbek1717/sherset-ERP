import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import type { Browser, PDFMargin, PaperFormat } from 'puppeteer-core';
import puppeteer from 'puppeteer-core';

/**
 * Renders HTML → PDF via a headless Chrome instance (puppeteer-core).
 *
 * Why Chrome and not pdf-lib drawing primitives: the document language is
 * Uzbek-Latin + Russian-Cyrillic. pdf-lib's StandardFonts (Helvetica) only
 * cover WinAnsi, so Cyrillic glyphs are dropped. Chrome renders the full
 * Unicode range with system fonts, plus real CSS layout (tables, page
 * breaks, alignment) — which is what produces a moysklad-faithful invoice.
 *
 * Browser lifecycle: a single instance is launched lazily on first render
 * and reused for the process lifetime (launch is ~300-800ms, too costly to
 * pay per request). It is closed on module destroy. A launch promise guards
 * against a concurrent double-launch when several bulk-print requests race
 * the first render.
 *
 * Executable resolution order:
 *   1. PUPPETEER_EXECUTABLE_PATH env (explicit, for Docker/Linux deploys)
 *   2. channel: 'chrome' (auto-detects a system Chrome install)
 * If neither resolves, {@link renderHtmlToPdf} throws and callers are
 * expected to fall back to the pdf-lib stub renderer (see DocPdfService).
 */
@Injectable()
export class HtmlPdfService implements OnModuleDestroy {
  private readonly logger = new Logger(HtmlPdfService.name);
  private browser: Browser | null = null;
  private launchPromise: Promise<Browser> | null = null;

  /**
   * Cap on concurrent Chrome tabs. The browser is a process-wide singleton,
   * so without a bound a burst of concurrent bulk-print requests would each
   * open a page and could exhaust memory. Excess renders queue for a slot.
   */
  private static readonly MAX_CONCURRENT = 4;
  private active = 0;
  private readonly waiters: Array<() => void> = [];

  private async acquireSlot(): Promise<void> {
    if (this.active < HtmlPdfService.MAX_CONCURRENT) {
      this.active++;
      return;
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve));
    this.active++;
  }

  private releaseSlot(): void {
    this.active--;
    const next = this.waiters.shift();
    if (next) next();
  }

  /** A4 by default; map our enum to puppeteer's PaperFormat. 'Custom' → A4. */
  private static readonly FORMAT_MAP: Record<string, PaperFormat> = {
    A4: 'a4',
    A5: 'a5',
    Letter: 'letter',
    Legal: 'legal',
  };

  private async getBrowser(): Promise<Browser> {
    if (this.browser?.connected) return this.browser;
    // A dead-but-non-null browser (crash/disconnect) must be reaped, not just
    // overwritten — otherwise its process + pipe handles + listeners leak.
    if (this.browser) {
      const dead = this.browser;
      this.browser = null;
      void dead.close().catch(() => {});
    }
    // Coalesce concurrent first-launches into one.
    if (!this.launchPromise) {
      this.launchPromise = this.launch().finally(() => {
        this.launchPromise = null;
      });
    }
    this.browser = await this.launchPromise;
    return this.browser;
  }

  private async launch(): Promise<Browser> {
    const baseArgs = ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'];
    const explicit = process.env.PUPPETEER_EXECUTABLE_PATH;
    const browser = explicit
      ? await puppeteer.launch({ executablePath: explicit, headless: true, args: baseArgs })
      : await puppeteer.launch({ channel: 'chrome', headless: true, args: baseArgs });
    this.logger.log(
      explicit
        ? `Launched Chrome from PUPPETEER_EXECUTABLE_PATH=${explicit}`
        : 'Launched Chrome via channel:chrome (system install)',
    );
    // Drop our reference the moment Chrome disconnects so the next render
    // relaunches cleanly instead of reusing a dead handle.
    browser.on('disconnected', () => {
      if (this.browser === browser) this.browser = null;
    });
    return browser;
  }

  /**
   * Probe whether a Chrome instance can be launched. Used by callers to
   * decide between the real render path and the stub fallback without
   * forcing them to catch render exceptions. Result is the live browser
   * state — a launch failure leaves `browser` null and returns false.
   */
  async isAvailable(): Promise<boolean> {
    try {
      const b = await this.getBrowser();
      return b.connected;
    } catch (e) {
      this.logger.warn(`Chrome unavailable: ${(e as Error).message}`);
      return false;
    }
  }

  /**
   * Render a complete HTML document to a PDF Buffer.
   *
   * @param html  full HTML string (should include its own <style>; the
   *              caller composes multi-document output with page-break CSS)
   * @param opts  page geometry pulled from the PrintTemplate row
   */
  async renderHtmlToPdf(
    html: string,
    opts?: {
      pageSize?: string;
      marginTop?: number;
      marginRight?: number;
      marginBottom?: number;
      marginLeft?: number;
    },
  ): Promise<Buffer> {
    await this.acquireSlot();
    let page: Awaited<ReturnType<Browser['newPage']>> | null = null;
    try {
      const browser = await this.getBrowser();
      page = await browser.newPage();
      // Templates are self-contained (inline CSS, system fonts, no external
      // resources) so 'load' is sufficient — no network to idle-wait on.
      await page.setContent(html, { waitUntil: 'load' });
      const format = HtmlPdfService.FORMAT_MAP[opts?.pageSize ?? 'A4'] ?? 'a4';
      const margin: PDFMargin = {
        top: `${opts?.marginTop ?? 20}mm`,
        right: `${opts?.marginRight ?? 15}mm`,
        bottom: `${opts?.marginBottom ?? 20}mm`,
        left: `${opts?.marginLeft ?? 15}mm`,
      };
      const pdf = await page.pdf({ format, printBackground: true, margin });
      return Buffer.from(pdf);
    } finally {
      // Always release the page even if rendering throws — a leaked page
      // accumulates memory in the long-lived browser instance — then free
      // the concurrency slot for a queued render.
      if (page) await page.close().catch(() => {});
      this.releaseSlot();
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
    }
  }
}
