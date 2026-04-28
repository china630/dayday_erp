import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";

function pdfBuffer(build: (doc: PDFKit.PDFDocument) => void): Promise<Buffer> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    doc.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    build(doc);
    doc.end();
  });
}

export async function trialBalanceXlsxBuffer(payload: {
  dateFrom: string;
  dateTo: string;
  rows: Array<{
    accountCode: string;
    accountName: string;
    openingDebit: string;
    openingCredit: string;
    periodDebit: string;
    periodCredit: string;
    closingDebit: string;
    closingCredit: string;
  }>;
}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Trial Balance");
  ws.addRow(["Date from", payload.dateFrom, "Date to", payload.dateTo]);
  ws.addRow([]);
  ws.addRow([
    "Code",
    "Name",
    "Opening Dr",
    "Opening Cr",
    "Period Dr",
    "Period Cr",
    "Closing Dr",
    "Closing Cr",
  ]);
  payload.rows.forEach((r) =>
    ws.addRow([
      r.accountCode,
      r.accountName,
      Number(r.openingDebit),
      Number(r.openingCredit),
      Number(r.periodDebit),
      Number(r.periodCredit),
      Number(r.closingDebit),
      Number(r.closingCredit),
    ]),
  );
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function trialBalancePdfBuffer(payload: {
  dateFrom: string;
  dateTo: string;
  rows: Array<{ accountCode: string; accountName: string; periodDebit: string; periodCredit: string }>;
}): Promise<Buffer> {
  return pdfBuffer((doc) => {
    doc.fontSize(16).text("Trial Balance");
    doc.moveDown(0.5).fontSize(10).text(`Period: ${payload.dateFrom} - ${payload.dateTo}`);
    doc.moveDown(0.8).fontSize(9);
    payload.rows.forEach((r) => {
      doc.text(
        `${r.accountCode} | ${r.accountName} | Dr ${Number(r.periodDebit).toFixed(2)} | Cr ${Number(r.periodCredit).toFixed(2)}`,
      );
    });
  });
}

export async function plXlsxBuffer(payload: {
  dateFrom: string;
  dateTo: string;
  lines: Array<{ label: string; amount: string }>;
  netProfit: string;
}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("ProfitAndLoss");
  ws.addRow(["Date from", payload.dateFrom, "Date to", payload.dateTo]);
  ws.addRow([]);
  ws.addRow(["Line", "Amount"]);
  payload.lines.forEach((l) => ws.addRow([l.label, Number(l.amount)]));
  ws.addRow(["Net profit", Number(payload.netProfit)]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function plPdfBuffer(payload: {
  dateFrom: string;
  dateTo: string;
  lines: Array<{ label: string; amount: string }>;
  netProfit: string;
}): Promise<Buffer> {
  return pdfBuffer((doc) => {
    doc.fontSize(16).text("Profit and Loss");
    doc.moveDown(0.5).fontSize(10).text(`Period: ${payload.dateFrom} - ${payload.dateTo}`);
    doc.moveDown(0.8).fontSize(9);
    payload.lines.forEach((l) => {
      doc.text(`${l.label}: ${Number(l.amount).toFixed(2)}`);
    });
    doc.moveDown(0.5).fontSize(11).text(`Net profit: ${Number(payload.netProfit).toFixed(2)}`);
  });
}

export async function cashFlowXlsxBuffer(payload: {
  dateFrom: string;
  dateTo: string;
  sections: Array<{
    section: string;
    rows: Array<{ code: string; name: string; inflow: string; outflow: string; net: string }>;
  }>;
  total: { inflow: string; outflow: string; net: string };
}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("CashFlow");
  ws.addRow(["Date from", payload.dateFrom, "Date to", payload.dateTo]);
  ws.addRow([]);
  ws.addRow(["Section", "Code", "Name", "Inflow", "Outflow", "Net"]);
  payload.sections.forEach((s) =>
    s.rows.forEach((r) =>
      ws.addRow([
        s.section,
        r.code,
        r.name,
        Number(r.inflow),
        Number(r.outflow),
        Number(r.net),
      ]),
    ),
  );
  ws.addRow(["TOTAL", "", "", Number(payload.total.inflow), Number(payload.total.outflow), Number(payload.total.net)]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function cashFlowPdfBuffer(payload: {
  dateFrom: string;
  dateTo: string;
  sections: Array<{
    section: string;
    rows: Array<{ code: string; name: string; inflow: string; outflow: string; net: string }>;
  }>;
  total: { inflow: string; outflow: string; net: string };
}): Promise<Buffer> {
  return pdfBuffer((doc) => {
    doc.fontSize(16).text("Cash Flow");
    doc.moveDown(0.5).fontSize(10).text(`Period: ${payload.dateFrom} - ${payload.dateTo}`);
    doc.moveDown(0.8).fontSize(9);
    payload.sections.forEach((s) => {
      doc.fontSize(10).text(s.section);
      s.rows.forEach((r) => {
        doc.fontSize(9).text(
          `${r.code} ${r.name} | In ${Number(r.inflow).toFixed(2)} | Out ${Number(r.outflow).toFixed(2)} | Net ${Number(r.net).toFixed(2)}`,
        );
      });
      doc.moveDown(0.3);
    });
    doc.fontSize(11).text(
      `TOTAL In ${Number(payload.total.inflow).toFixed(2)} | Out ${Number(payload.total.outflow).toFixed(2)} | Net ${Number(payload.total.net).toFixed(2)}`,
    );
  });
}
