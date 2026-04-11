import { Injectable } from "@nestjs/common";
import ExcelJS from "exceljs";
import { VatQuarterDataService } from "./vat-quarter-data.service";

@Injectable()
export class VatAppendixExportService {
  constructor(private readonly vatQuarter: VatQuarterDataService) {}

  async buildQuarterlyXlsxBuffer(
    organizationId: string,
    year: number,
    quarter: number,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const { fromStr, toStr, sales, purchases } =
      await this.vatQuarter.loadQuarterVatRows(organizationId, year, quarter);

    const salesRows = sales.map((s) => ({
      date: s.date,
      docNo: s.documentNumber,
      cpName: s.counterpartyName,
      voen: s.counterpartyVoen,
      desc: s.description,
      qty: s.quantity,
      amountExVat: Number(s.amountWithoutVat),
      vat: Number(s.vatAmount),
      total: Number(s.amountWithVat),
    }));

    const purchaseRows = purchases.map((p) => ({
      date: p.date,
      docNo: p.documentNumber,
      supplier: p.supplierName,
      voen: p.supplierVoen,
      desc: p.description,
      qty: p.quantity,
      amountExVat: Number(p.amountWithoutVat),
      vat: Number(p.vatAmount),
      total: Number(p.amountWithVat),
    }));

    const wb = new ExcelJS.Workbook();
    wb.creator = "DayDay ERP";
    wb.created = new Date();

    const salesSheet = wb.addWorksheet("Satış_ƏDV", {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    salesSheet.columns = [
      { header: "Tarix", key: "d", width: 12 },
      { header: "Sənəd №", key: "n", width: 14 },
      { header: "Alıcı (ad)", key: "c", width: 28 },
      { header: "VÖEN", key: "v", width: 14 },
      { header: "Məhsul/xidmət", key: "t", width: 36 },
      { header: "Miqdar", key: "q", width: 10 },
      { header: "Cəm ƏDV-siz", key: "e", width: 14 },
      { header: "ƏDV", key: "a", width: 12 },
      { header: "Cəm", key: "s", width: 14 },
    ];
    for (const r of salesRows) {
      salesSheet.addRow({
        d: r.date,
        n: r.docNo,
        c: r.cpName,
        v: r.voen,
        t: r.desc,
        q: r.qty,
        e: r.amountExVat,
        a: r.vat,
        s: r.total,
      });
    }

    const purchSheet = wb.addWorksheet("Alış_ƏDV", {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    purchSheet.columns = [
      { header: "Tarix", key: "d", width: 12 },
      { header: "Sənəd №", key: "n", width: 14 },
      { header: "Satıcı (ad)", key: "c", width: 28 },
      { header: "VÖEN", key: "v", width: 14 },
      { header: "Məhsul", key: "t", width: 36 },
      { header: "Miqdar", key: "q", width: 10 },
      { header: "Cəm ƏDV-siz", key: "e", width: 14 },
      { header: "ƏDV", key: "a", width: 12 },
      { header: "Cəm", key: "s", width: 14 },
    ];
    for (const r of purchaseRows) {
      purchSheet.addRow({
        d: r.date,
        n: r.docNo,
        c: r.supplier,
        v: r.voen,
        t: r.desc,
        q: r.qty,
        e: r.amountExVat,
        a: r.vat,
        s: r.total,
      });
    }

    const info = wb.addWorksheet("İzahat");
    info.addRow([
      "e-taxes.gov.az — ƏDV əlavəsi (satış/alış siyahısı) üçün ixrac.",
    ]);
    info.addRow([
      `Dövr: ${year} Q${quarter} (${fromStr} — ${toStr}). Satış: hesab-fakturalar (ləğv olunmayan), tarix — recognizedAt və ya createdAt.`,
    ]);
    info.addRow([
      "Alış: anbar daxilolmaları (PURCHASE); təchizatçının VÖEN-i sistemdə yoxdursa sütunlar boş ola bilər — portalda düzəldin.",
    ]);

    const raw = await wb.xlsx.writeBuffer();
    const buffer = Buffer.isBuffer(raw) ? raw : Buffer.from(new Uint8Array(raw));
    const filename = `edv-satis-alis-${year}-Q${quarter}.xlsx`;
    return { buffer, filename };
  }
}
