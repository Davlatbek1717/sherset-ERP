import { promisify } from 'node:util';
import { Injectable, Logger } from '@nestjs/common';
import Docxtemplater from 'docxtemplater';
import ExcelJS from 'exceljs';
// libreoffice-convert is CommonJS + callback-based: convert(input, ext, filter, cb).
import libre from 'libreoffice-convert';
import PizZip from 'pizzip';
import {
  buildMsDocObject,
  buildMsFormatter,
  evalMsExpr,
  isMoyskladSyntax,
  renderMsExpressions,
} from './ms-template.js';
import {
  type DocRenderContext,
  type RawDocInput,
  type RenderPosition,
  buildDocContext,
} from './print-render.util.js';

const convertAsync = promisify(
  libre.convert as (
    input: Buffer,
    ext: string,
    filter: string | undefined,
    cb: (err: Error | null, done: Buffer) => void,
  ) => void,
);

type Scope = Record<string, unknown>;

/**
 * Renders an uploaded Word/Excel print template (PrintTemplate.bodyDocx) to PDF.
 *
 * Two template dialects are supported (auto-detected):
 *   1. moysklad-native (JXLS) — `${o.name}`, `<jx:forEach items="${o.positions}"
 *      var="position">…</jx:forEach>`, `$[EXCEL_FORMULA]`. This makes genuine
 *      moysklad template files work. xlsx is the primary moysklad format and gets
 *      full support (per-cell `${…}`, `$[…]` → real Excel formula, forEach row
 *      expansion). docx gets scalar `${…}` (Word position tables via forEach use
 *      xlsx — see docs/moysklad-print-template-syntax.md).
 *   2. our simple `{tag}` dialect — `{number}`, `{#positions}…{/positions}` (docx,
 *      docxtemplater) / bare `{tag}` cell text + one repeated row (xlsx).
 *
 * The filled file is converted to PDF by headless LibreOffice (soffice).
 */
@Injectable()
export class DocxRenderService {
  private readonly logger = new Logger(DocxRenderService.name);

  /** Fill a .docx template (moysklad `${…}` or our `{tag}`) and convert to PDF. */
  async renderDocxToPdf(bodyDocx: Buffer, raw: RawDocInput): Promise<Buffer> {
    const zip = new PizZip(bodyDocx);
    const xml = zip.file('word/document.xml')?.asText() ?? '';
    if (isMoyskladSyntax(xml)) {
      // moysklad `${…}` scalar substitution straight on the document XML (works
      // when each placeholder sits in a single run, as authored templates do).
      const scope: Scope = { o: buildMsDocObject(raw), formatter: buildMsFormatter() };
      zip.file('word/document.xml', renderMsExpressions(xml, scope));
      const filled = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
      return this.convertToPdf(filled, '.docx');
    }
    const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
    doc.render(this.flatten(buildDocContext(raw)));
    const filled = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
    return this.convertToPdf(filled, '.docx');
  }

  /** Fill an uploaded .xlsx template (moysklad JXLS or our `{tag}`) → PDF. */
  async renderXlsxToPdf(bodyXlsx: Buffer, raw: RawDocInput): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(this.toArrayBuffer(bodyXlsx));
    if (this.workbookUsesMoyskladSyntax(wb)) {
      const scope: Scope = { o: buildMsDocObject(raw), formatter: buildMsFormatter() };
      for (const ws of wb.worksheets) {
        this.expandMsForEachRows(ws, scope);
        this.fillMsCells(ws, scope);
      }
    } else {
      this.fillTagWorkbook(wb, buildDocContext(raw));
    }
    const filled = await wb.xlsx.writeBuffer();
    return this.convertToPdf(Buffer.from(filled), '.xlsx');
  }

  // ---- moysklad (JXLS) xlsx rendering ----------------------------------------

  private workbookUsesMoyskladSyntax(wb: ExcelJS.Workbook): boolean {
    for (const ws of wb.worksheets) {
      let found = false;
      ws.eachRow({ includeEmpty: false }, (row) => {
        row.eachCell({ includeEmpty: false }, (cell) => {
          if (typeof cell.value === 'string' && isMoyskladSyntax(cell.value)) found = true;
        });
      });
      if (found) return true;
    }
    return false;
  }

  /**
   * Expand a `<jx:forEach items="${EXPR}" var="V" [varStatus="S"]>` … `</jx:forEach>`
   * block: the marker cells sit in their own rows; the rows BETWEEN them are the
   * per-item template. Evaluate EXPR → array, splice the whole block out, then
   * insert one styled copy of the body rows per item with V (+ status) in scope.
   * Handles the first block per sheet (moysklad's document forms use one).
   */
  private expandMsForEachRows(ws: ExcelJS.Worksheet, scope: Scope): void {
    const open = /<jx:forEach\s+items="\$\{(.+?)\}"\s+var="(\w+)"(?:\s+varStatus="(\w+)")?[^>]*>/;
    let openRow = -1;
    let closeRow = -1;
    let itemsExpr = '';
    let varName = '';
    let statusName = '';
    for (let r = 1; r <= ws.rowCount; r++) {
      const text = this.rowText(ws.getRow(r));
      if (openRow === -1) {
        const m = text.match(open);
        if (m) {
          openRow = r;
          itemsExpr = m[1] ?? '';
          varName = m[2] ?? '';
          statusName = m[3] ?? '';
        }
      } else if (text.includes('</jx:forEach>')) {
        closeRow = r;
        break;
      }
    }
    if (openRow === -1 || closeRow === -1 || closeRow <= openRow) return;

    // Capture the body rows (between the markers): per-cell value + style, plus
    // row-level height/font/alignment (a row default font isn't on each cell).
    type BodyCell = { col: number; value: ExcelJS.CellValue; style: Partial<ExcelJS.Style> };
    type BodyRow = {
      height: number | undefined;
      font: Partial<ExcelJS.Font> | undefined;
      alignment: Partial<ExcelJS.Alignment> | undefined;
      cells: BodyCell[];
    };
    const body: BodyRow[] = [];
    for (let r = openRow + 1; r <= closeRow - 1; r++) {
      const row = ws.getRow(r);
      const cells: BodyCell[] = [];
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        cells.push({ col, value: cell.value, style: cell.style });
      });
      body.push({ height: row.height, font: row.font, alignment: row.alignment, cells });
    }

    let items: unknown;
    try {
      // Shared evaluator → Java idioms (.size()/.length()/.isEmpty()) work here too.
      items = evalMsExpr(itemsExpr, scope);
    } catch {
      items = [];
    }
    const list = Array.isArray(items) ? items : [];

    // Remove the whole block (open marker … close marker) and insert filled copies.
    ws.spliceRows(openRow, closeRow - openRow + 1);
    let insertAt = openRow;
    list.forEach((item, i) => {
      const child: Scope = { ...scope, [varName]: item };
      if (statusName)
        child[statusName] = { index: i, count: i + 1, first: i === 0, last: i === list.length - 1 };
      for (const br of body) {
        ws.spliceRows(insertAt, 0, []); // insert a blank row, shifting the rest down
        const newRow = ws.getRow(insertAt);
        if (br.height) newRow.height = br.height;
        if (br.font) newRow.font = br.font;
        if (br.alignment) newRow.alignment = br.alignment;
        for (const c of br.cells) {
          const nc = newRow.getCell(c.col);
          this.setMsCell(nc, c.value, child);
          if (c.style) nc.style = c.style;
        }
        insertAt += 1;
      }
    });
  }

  /** Fill `${…}` / `$[…]` in every remaining cell (header/footer/totals). */
  private fillMsCells(ws: ExcelJS.Worksheet, scope: Scope): void {
    ws.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        if (
          typeof cell.value === 'string' &&
          (cell.value.includes('${') || cell.value.includes('$['))
        )
          this.setMsCell(cell, cell.value, scope);
      });
    });
  }

  /** Resolve one cell: `$[F]` → real Excel formula; otherwise substitute `${…}`. */
  private setMsCell(cell: ExcelJS.Cell, value: ExcelJS.CellValue, scope: Scope): void {
    if (typeof value !== 'string') {
      cell.value = value;
      return;
    }
    const formula = value.match(/^\s*\$\[(.+)\]\s*$/s);
    if (formula?.[1]) {
      cell.value = { formula: formula[1].trim() } as ExcelJS.CellFormulaValue;
      return;
    }
    cell.value = renderMsExpressions(value, scope);
  }

  private rowText(row: ExcelJS.Row): string {
    const parts: string[] = [];
    row.eachCell({ includeEmpty: false }, (cell) => {
      if (typeof cell.value === 'string') parts.push(cell.value);
    });
    return parts.join(' ');
  }

  // ---- our simple {tag} xlsx rendering --------------------------------------

  /** Fill an xlsx that uses our `{tag}` dialect (scalar tags + one repeated row). */
  private fillTagWorkbook(wb: ExcelJS.Workbook, context: DocRenderContext): void {
    const scalar = this.scalarMap(context);
    const posTag = /\{(idx|name|unit|qty|price|sum)\}/;
    for (const ws of wb.worksheets) {
      const tplRowIdx = this.findPositionRow(ws, posTag);
      if (tplRowIdx > 0) this.expandPositionRow(ws, tplRowIdx, context.positions);
      ws.eachRow({ includeEmpty: false }, (row) => {
        row.eachCell({ includeEmpty: false }, (cell) => {
          if (typeof cell.value === 'string' && cell.value.includes('{')) {
            cell.value = this.replaceTags(cell.value, scalar);
          }
        });
      });
    }
  }

  /** First row index holding any line-item tag, or -1 (uses 1-based row nums). */
  private findPositionRow(ws: ExcelJS.Worksheet, posTag: RegExp): number {
    let idx = -1;
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (idx !== -1) return;
      row.eachCell({ includeEmpty: false }, (cell) => {
        if (idx === -1 && typeof cell.value === 'string' && posTag.test(cell.value)) {
          idx = rowNumber;
        }
      });
    });
    return idx;
  }

  /** Duplicate the template row once per position (keeping styles) and fill it. */
  private expandPositionRow(ws: ExcelJS.Worksheet, tplRowIdx: number, positions: RenderPosition[]) {
    if (positions.length === 0) {
      this.fillRow(ws.getRow(tplRowIdx), this.positionMap());
      return;
    }
    if (positions.length > 1) ws.duplicateRow(tplRowIdx, positions.length - 1, true);
    positions.forEach((pos, i) => this.fillRow(ws.getRow(tplRowIdx + i), this.positionMap(pos)));
  }

  private fillRow(row: ExcelJS.Row, map: Record<string, string>): void {
    row.eachCell({ includeEmpty: false }, (cell) => {
      if (typeof cell.value === 'string' && cell.value.includes('{')) {
        cell.value = this.replaceTags(cell.value, map);
      }
    });
  }

  /** Per-position tag→value map (empty strings when no position, to blank tags). */
  private positionMap(pos?: RenderPosition): Record<string, string> {
    return {
      idx: pos ? String(pos.idx) : '',
      name: pos?.name ?? '',
      unit: pos?.unit ?? '',
      qty: pos?.qty ?? '',
      price: pos?.price ?? '',
      sum: pos?.sum ?? '',
    };
  }

  /** Replace every {known_tag} in `s` with its mapped value; unknown tags stay. */
  private replaceTags(s: string, map: Record<string, string>): string {
    return s.replace(/\{(\w+)\}/g, (full, key: string) => map[key] ?? full);
  }

  /** Flat tag set for the .docx (docxtemplater path). */
  private flatten(c: DocRenderContext): Record<string, unknown> {
    return {
      ...this.scalarMap(c),
      positions: c.positions,
      hasPositions: c.hasPositions,
    };
  }

  /** Scalar (non-line) tag→value map, shared by the .docx and .xlsx tag fillers. */
  private scalarMap(c: DocRenderContext): Record<string, string> {
    return {
      title: c.doc.title,
      number: c.doc.number,
      date: c.doc.date,
      sum: c.doc.sum,
      currency: c.doc.currency,
      description: c.doc.description ?? '',
      organization: c.organization?.name ?? '',
      organizationPhone: c.organization?.phone ?? '',
      counterparty: c.counterparty?.name ?? '',
      positionsTotal: c.positionsTotal,
      positionsQtyTotal: c.positionsQtyTotal,
      totalInWords: c.totalInWords,
    };
  }

  /** Node Buffer → ArrayBuffer slice (exceljs's load() type wants ArrayBuffer). */
  private toArrayBuffer(buf: Buffer): ArrayBuffer {
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  }

  /** Convert any LibreOffice-supported buffer (.docx/.xlsx/.html) → PDF. */
  async convertToPdf(input: Buffer, sourceExt: string): Promise<Buffer> {
    try {
      return await convertAsync(input, '.pdf', undefined);
    } catch (e) {
      this.logger.error(`LibreOffice convert failed for ${sourceExt}: ${(e as Error).message}`);
      throw e;
    }
  }
}
