import PDFDocument from "pdfkit";
import QRCode from "qrcode";

import {
  PDF_FONT_UNICODE,
  PDF_FONT_UNICODE_BOLD,
  registerUnicodeFonts,
} from "./pdf-font.util";

export type ReconciliationPdfLineKind = "OPENING" | "INVOICE" | "PAYMENT";

export type ReconciliationPdfLine = {
  kind?: ReconciliationPdfLineKind;
  date: string;
  reference: string;
  description: string;
  debit: string;
  credit: string;
  balanceAfter: string;
};

function lineDescriptionAz(row: ReconciliationPdfLine): string {
  switch (row.kind) {
    case "OPENING":
      return "Dövr əvvəli qalığı (debitor)";
    case "INVOICE":
      return "Hesab-faktura (Dt 211)";
    case "PAYMENT":
      return "Ödəniş (Kt 211)";
    default:
      return row.description;
  }
}

export type ReconciliationPdfModel = {
  organizationName: string;
  organizationTaxId: string;
  counterpartyName: string;
  counterpartyTaxId: string;
  dateFrom: string;
  dateTo: string;
  openingBalance: string;
  turnoverDebit: string;
  turnoverCredit: string;
  closingBalance: string;
  lines: ReconciliationPdfLine[];
  /** Azərbaycan mətni (PDF üçün). */
  methodologyNoteAz?: string;
  /** Подписанный акт: QR на https://erp.dayday.az/verify/[logId] */
  signatureVerifyUrl?: string;
};

/** Akt qarşılıqlı hesablaşma — mətnlər Azərbaycan dilində (PDFKit + DejaVu Sans, см. `pdf-font.util.ts`). */
export async function renderReconciliationPdfAz(
  data: ReconciliationPdfModel,
): Promise<Buffer> {
  const qrBuffer =
    data.signatureVerifyUrl != null
      ? await QRCode.toBuffer(data.signatureVerifyUrl, {
          type: "png",
          width: 240,
          margin: 1,
        })
      : null;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      margin: 40,
      size: "A4",
      info: { Title: "Akt - qarşılıqlı hesablaşma" },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    registerUnicodeFonts(doc);

    const pageW = doc.page.width - 80;
    let y = 40;

    doc.fontSize(14).font(PDF_FONT_UNICODE_BOLD);
    doc.text("QARŞILIQLI HESABLAŞMANIN AKTI", 40, y, {
      width: pageW,
      align: "center",
    });
    y += 28;

    doc.fontSize(9).font(PDF_FONT_UNICODE);
    doc.text(
      `Hesabat dövrü: ${data.dateFrom} - ${data.dateTo}`,
      40,
      y,
      { width: pageW, align: "center" },
    );
    y += 22;

    doc.font(PDF_FONT_UNICODE_BOLD).text("Tərəf A (Biz):", 40, y);
    y += 12;
    doc.font(PDF_FONT_UNICODE).text(data.organizationName, 40, y, { width: pageW * 0.48 });
    doc.text(`VÖEN: ${data.organizationTaxId}`, 40, y + 12);

    const rightX = 40 + pageW * 0.52;
    doc.font(PDF_FONT_UNICODE_BOLD).text("Tərəf B (Kontragent):", rightX, y - 12);
    doc.font(PDF_FONT_UNICODE).text(data.counterpartyName, rightX, y, {
      width: pageW * 0.48,
    });
    doc.text(`VÖEN: ${data.counterpartyTaxId}`, rightX, y + 12);
    y += 48;

    doc.font(PDF_FONT_UNICODE_BOLD).text("Dövr üzrə yekunlar:", 40, y);
    y += 14;
    doc.font(PDF_FONT_UNICODE);
    doc.text(`Dövr əvvəli qalığı (AZN): ${data.openingBalance}`, 40, y);
    y += 12;
    doc.text(`Dövr debet (AZN): ${data.turnoverDebit}`, 40, y);
    y += 12;
    doc.text(`Dövr kredit (AZN): ${data.turnoverCredit}`, 40, y);
    y += 12;
    doc.font(PDF_FONT_UNICODE_BOLD).text(`Dövr sonu qalığı (AZN): ${data.closingBalance}`, 40, y);
    y += 20;

    const colDate = 40;
    const colRef = 95;
    const colDesc = 175;
    const colDr = 340;
    const colCr = 400;
    const colBal = 465;

    doc.font(PDF_FONT_UNICODE_BOLD).fontSize(8);
    doc.text("Tarix", colDate, y);
    doc.text("Sənəd", colRef, y);
    doc.text("Təsvir", colDesc, y);
    doc.text("Dt", colDr, y);
    doc.text("Kt", colCr, y);
    doc.text("Qalıq", colBal, y);
    y += 14;
    doc.moveTo(40, y).lineTo(555, y).stroke();
    y += 6;

    doc.font(PDF_FONT_UNICODE).fontSize(7.5);
    for (const row of data.lines) {
      if (y > 720) {
        doc.addPage();
        y = 40;
      }
      doc.text(row.date.slice(0, 10), colDate, y, { width: 50 });
      doc.text(row.reference.slice(0, 18), colRef, y, { width: 75 });
      doc.text(lineDescriptionAz(row).slice(0, 42), colDesc, y, {
        width: 158,
      });
      doc.text(row.debit, colDr, y, { width: 52, align: "right" });
      doc.text(row.credit, colCr, y, { width: 52, align: "right" });
      doc.text(row.balanceAfter, colBal, y, { width: 70, align: "right" });
      y += 11;
    }

    y += 10;
    const noteAz =
      data.methodologyNoteAz?.trim() ||
      "Qeyd: Qalıq debitor borcunu əks etdirir. Təchizatçı kreditoru (531) bu akta daxil edilməyə bilər.";
    if (y < 680) {
      doc.fontSize(7).fillColor("#444444");
      doc.text(noteAz, 40, y, { width: pageW, align: "left" });
      doc.fillColor("#000000");
      y += 32;
    }

    if (y > 600) {
      doc.addPage();
      y = 40;
    }

    doc.fontSize(9).font(PDF_FONT_UNICODE_BOLD);
    doc.text("İMZALAR", 40, y, { width: pageW, align: "center" });
    y += 22;

    const colW = pageW / 2 - 8;
    const xRight = 40 + colW + 16;
    doc.font(PDF_FONT_UNICODE_BOLD).fontSize(8);
    doc.text("Tərəf A (Biz)", 40, y, { width: colW });
    doc.text("Tərəf B (Kontragent)", xRight, y, { width: colW });
    y += 14;
    doc.font(PDF_FONT_UNICODE).fontSize(7).fillColor("#555555");
    doc.text("(möhür yeri)", 40, y, { width: colW });
    doc.text("(möhür yeri)", xRight, y, { width: colW });
    doc.fillColor("#000000");
    y += 16;

    doc.font(PDF_FONT_UNICODE).fontSize(8);
    const ySig = y;
    doc.text("Direktor: _________________________", 40, ySig, { width: colW });
    doc.text("Direktor: _________________________", xRight, ySig, { width: colW });
    doc.text("Baş mühasib: _____________________", 40, ySig + 22, { width: colW });
    doc.text("Baş mühasib: _____________________", xRight, ySig + 22, {
      width: colW,
    });

    if (qrBuffer && data.signatureVerifyUrl) {
      const margin = 40;
      const qrSize = 72;
      const pageH = doc.page.height;
      const pageWidth = doc.page.width;
      const xQr = pageWidth - margin - qrSize;
      const yQr = pageH - margin - qrSize - 6;
      doc.image(qrBuffer, xQr, yQr, { width: qrSize, height: qrSize });
      doc.fontSize(6).fillColor("#64748b");
      doc.text("Yoxlama / Verify", xQr, yQr + qrSize + 2, {
        width: qrSize,
        align: "center",
      });
      doc.fillColor("#000000");
    }

    doc.end();
  });
}
