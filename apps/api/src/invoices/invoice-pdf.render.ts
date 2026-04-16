import PDFDocument from "pdfkit";
import QRCode from "qrcode";

export type InvoicePdfModel = {
  number: string;
  status: string;
  dueDate: Date;
  totalAmount: { toString(): string };
  currency: string;
  counterparty: { name: string; taxId: string };
  items: Array<{
    description: string | null;
    quantity: { toString(): string };
    unitPrice: { toString(): string };
    vatRate: { toString(): string };
    lineTotal: { toString(): string };
    product: { name: string; isService?: boolean } | null;
  }>;
  /** Печать + QR на публичную верификацию */
  signature?: {
    verifyUrl: string;
    signedAt: Date;
    providerLabel: string;
    certificateSubject: string | null;
  };
};

export async function renderInvoicePdf(
  invoice: InvoicePdfModel,
): Promise<Buffer> {
  const qrBuffer =
    invoice.signature != null
      ? await QRCode.toBuffer(invoice.signature.verifyUrl, {
          type: "png",
          width: 240,
          margin: 1,
        })
      : null;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(18).text(`Invoice ${invoice.number}`, { underline: true });
    doc.moveDown();
    doc.fontSize(10);
    doc.text(`Status: ${invoice.status}`);
    doc.text(`Due: ${invoice.dueDate.toISOString().slice(0, 10)}`);
    doc.text(
      `Customer: ${invoice.counterparty.name} (VÖEN ${invoice.counterparty.taxId})`,
    );
    doc.moveDown();
    doc.text("Lines:");
    invoice.items.forEach((line, i) => {
      const baseTitle = line.product?.name ?? line.description ?? `Line ${i + 1}`;
      const kind = line.product?.isService ? "Xidmət" : "Məhsul";
      const title = `${kind}: ${baseTitle}`;
      doc.text(
        `${title} | qty ${line.quantity.toString()} x ${line.unitPrice.toString()} | VAT ${line.vatRate.toString()}% | ${line.lineTotal.toString()} ${invoice.currency}`,
      );
    });
    doc.moveDown();
    doc
      .fontSize(12)
      .text(`Total: ${invoice.totalAmount.toString()} ${invoice.currency}`);

    if (invoice.signature != null && qrBuffer) {
      const pageW = doc.page.width;
      const pageH = doc.page.height;
      const margin = 50;
      const qrSize = 72;
      const stampW = 220;
      const xQr = pageW - margin - qrSize;
      const yQr = pageH - margin - qrSize - 8;
      const yStamp = yQr - 58;

      doc.save();
      doc.opacity(0.92);
      doc
        .roundedRect(margin, yStamp, stampW, 48, 4)
        .strokeColor("#15803d")
        .lineWidth(1.2)
        .stroke();
      doc.fillColor("#166534").fontSize(9).font("Helvetica-Bold");
      doc.text("RƏQƏMSAL İMZA", margin + 8, yStamp + 8, { width: stampW - 16 });
      doc.font("Helvetica").fontSize(8).fillColor("#14532d");
      doc.text(
        `${invoice.signature.providerLabel} · ${invoice.signature.signedAt.toISOString().slice(0, 19).replace("T", " ")} UTC`,
        margin + 8,
        yStamp + 22,
        { width: stampW - 16 },
      );
      if (invoice.signature.certificateSubject) {
        doc.text(
          invoice.signature.certificateSubject.slice(0, 80),
          margin + 8,
          yStamp + 34,
          { width: stampW - 16 },
        );
      }
      doc.image(qrBuffer, xQr, yQr, { width: qrSize, height: qrSize });
      doc.fontSize(6).fillColor("#64748b");
      doc.text("Yoxlama / Verify", xQr, yQr + qrSize + 2, {
        width: qrSize,
        align: "center",
      });
      doc.restore();
    }

    doc.end();
  });
}
