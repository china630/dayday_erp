import { Injectable } from "@nestjs/common";
import ExcelJS from "exceljs";

type SalaryRegistryExportRow = {
  employeeName: string;
  employeeFinCode: string | null;
  recipientAccount: string;
  amount: string;
  currency: string;
  purpose: string;
};

@Injectable()
export class UniversalBankExportService {
  async buildSalaryRegistryXlsx(params: {
    organizationTaxId: string;
    year: number;
    month: number;
    rows: SalaryRegistryExportRow[];
  }): Promise<{ filename: string; base64: string }> {
    const wb = new ExcelJS.Workbook();
    wb.creator = "DayDay ERP";
    wb.created = new Date();
    const ws = wb.addWorksheet("SalaryRegistry");
    ws.columns = [
      { header: "VOEN", key: "voen", width: 16 },
      { header: "Employee", key: "employeeName", width: 28 },
      { header: "FIN", key: "employeeFinCode", width: 14 },
      { header: "RecipientAccount", key: "recipientAccount", width: 24 },
      { header: "Amount", key: "amount", width: 14 },
      { header: "Currency", key: "currency", width: 10 },
      { header: "Purpose", key: "purpose", width: 40 },
    ];
    for (const row of params.rows) {
      ws.addRow({
        voen: params.organizationTaxId,
        employeeName: row.employeeName,
        employeeFinCode: row.employeeFinCode ?? "",
        recipientAccount: row.recipientAccount,
        amount: Number(row.amount),
        currency: row.currency,
        purpose: row.purpose,
      });
    }
    ws.getColumn("amount").numFmt = "0.00";
    const raw = await wb.xlsx.writeBuffer();
    const buffer = Buffer.isBuffer(raw) ? raw : Buffer.from(new Uint8Array(raw));
    const filename = `salary-registry-${params.year}-${String(params.month).padStart(2, "0")}.xlsx`;
    return { filename, base64: buffer.toString("base64") };
  }
}

