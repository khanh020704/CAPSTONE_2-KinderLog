import PDFDocument from 'pdfkit';
import { ReportTable } from '../dto/report.dto';

/** PDFKit's built-in Helvetica has no Vietnamese diacritics, so a Unicode TTF is embedded. */
const FONT = require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans.ttf');
const FONT_BOLD = require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf');
const BRAND = '#2F7D6D';

/** A4 landscape table with repeated header rows and page numbers. */
export function toPdf(report: ReportTable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.registerFont('regular', FONT);
    doc.registerFont('bold', FONT_BOLD);

    const left = doc.page.margins.left;
    const usable = doc.page.width - left - doc.page.margins.right;
    const weights = report.columns.map((c) => c.width ?? 14);
    const total = weights.reduce((a, b) => a + b, 0);
    const widths = weights.map((w) => (w / total) * usable);
    const bottom = () => doc.page.height - doc.page.margins.bottom - 20;

    doc.font('bold').fontSize(18).fillColor(BRAND).text(report.title);
    doc.font('regular').fontSize(10).fillColor('#6B7280').text(report.subtitle).moveDown(0.8);

    const drawRow = (cells: string[], opts: { header?: boolean; shade?: boolean }) => {
      doc.font(opts.header ? 'bold' : 'regular').fontSize(9);
      const height = Math.max(...cells.map((t, i) => doc.heightOfString(t, { width: widths[i] - 8 }))) + 8;
      if (doc.y + height > bottom()) {
        doc.addPage();
        if (!opts.header) drawHeader();
      }
      const y = doc.y;
      if (opts.header) doc.rect(left, y, usable, height).fill(BRAND);
      else if (opts.shade) doc.rect(left, y, usable, height).fill('#F3F7F6');
      let x = left;
      cells.forEach((t, i) => {
        doc.fillColor(opts.header ? '#FFFFFF' : '#111827').text(t, x + 4, y + 4, { width: widths[i] - 8 });
        x += widths[i];
      });
      doc.x = left;
      doc.y = y + height;
    };
    const drawHeader = () =>
      drawRow(
        report.columns.map((c) => c.header),
        { header: true },
      );

    drawHeader();
    if (!report.rows.length) {
      doc
        .moveDown()
        .font('regular')
        .fontSize(10)
        .fillColor('#6B7280')
        .text('Không có dữ liệu trong khoảng thời gian đã chọn.');
    }
    report.rows.forEach((row, r) =>
      drawRow(
        report.columns.map((c) => {
          const raw = row[c.key];
          const v = c.labels && typeof raw === 'string' ? (c.labels[raw] ?? raw) : raw;
          if (v == null || v === '') return '—';
          return c.format === 'percent' ? `${v}%` : String(v);
        }),
        { shade: r % 2 === 1 },
      ),
    );

    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      doc
        .font('regular')
        .fontSize(8)
        .fillColor('#9CA3AF')
        .text(
          `KinderLog · Trang ${i + 1}/${range.count}`,
          left,
          doc.page.height - doc.page.margins.bottom - 10,
          {
            width: usable,
            align: 'right',
            lineBreak: false,
          },
        );
    }
    doc.end();
  });
}
