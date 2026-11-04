import ExcelJS from 'exceljs';
import { ReportTable } from '../dto/report.dto';

const BRAND = 'FF2F7D6D';

/** One styled sheet: title block, frozen bold header, auto-filter, number formats per column. */
export async function toExcel(report: ReportTable): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'KinderLog';
  wb.created = new Date();
  const ws = wb.addWorksheet('Báo cáo', { views: [{ state: 'frozen', ySplit: 4 }] });

  const lastCol = report.columns.length;
  ws.mergeCells(1, 1, 1, lastCol);
  ws.getCell(1, 1).value = report.title;
  ws.getCell(1, 1).font = { bold: true, size: 16, color: { argb: BRAND } };
  ws.mergeCells(2, 1, 2, lastCol);
  ws.getCell(2, 1).value = report.subtitle;
  ws.getCell(2, 1).font = { italic: true, color: { argb: 'FF6B7280' } };

  const header = ws.getRow(4);
  report.columns.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    cell.value = c.header;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    ws.getColumn(i + 1).width = c.width ?? 14;
  });
  header.height = 22;

  report.rows.forEach((row, r) => {
    const xr = ws.getRow(5 + r);
    report.columns.forEach((c, i) => {
      const cell = xr.getCell(i + 1);
      const raw = row[c.key];
      const v = c.labels && typeof raw === 'string' ? (c.labels[raw] ?? raw) : raw;
      cell.value = c.format === 'percent' && typeof v === 'number' ? v / 100 : v;
      if (c.format === 'percent') cell.numFmt = '0.0%';
      if (c.format === 'number') cell.alignment = { horizontal: 'right' };
      if (r % 2) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F7F6' } };
    });
  });

  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + report.rows.length, column: lastCol } };
  ws.getRow(6 + report.rows.length).getCell(1).value =
    `Xuất lúc ${new Date().toLocaleString('vi-VN')} · ${report.rows.length} dòng`;

  return Buffer.from(await wb.xlsx.writeBuffer());
}
