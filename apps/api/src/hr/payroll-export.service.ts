import { Injectable, NotFoundException } from "@nestjs/common";
import ExcelJS from "exceljs";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class PayrollExportService {
  constructor(private readonly prisma: PrismaService) {}

  async buildRunXlsxBuffer(
    organizationId: string,
    runId: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const run = await this.prisma.payrollRun.findFirst({
      where: { id: runId, organizationId },
      include: {
        slips: { include: { employee: true } },
      },
    });
    if (!run) throw new NotFoundException("Payroll run not found");

    const wb = new ExcelJS.Workbook();
    wb.creator = "DayDay ERP";
    wb.created = new Date();

    const sheet = wb.addWorksheet("Payroll", {
      views: [{ state: "frozen", ySplit: 1 }],
    });

    sheet.columns = [
      { header: "VÖEN", key: "voen", width: 14 },
      { header: "FİO", key: "fio", width: 30 },
      { header: "Gross", key: "gross", width: 14 },
      { header: "Income tax", key: "pit", width: 14 },
      { header: "DSMF (W)", key: "dW", width: 14 },
      { header: "İTS (W)", key: "iW", width: 14 },
      { header: "İşsizlik (W)", key: "uW", width: 14 },
      { header: "Net", key: "net", width: 14 },
    ];

    for (const s of run.slips) {
      const fio = `${s.employee.lastName} ${s.employee.firstName}`.trim();
      sheet.addRow({
        voen: s.employee.voen ?? "",
        fio,
        gross: Number(s.gross),
        pit: Number(s.incomeTax),
        dW: Number(s.dsmfWorker),
        iW: Number(s.itsWorker),
        uW: Number(s.unemploymentWorker),
        net: Number(s.net),
      });
    }

    for (const c of sheet.columns) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      c.numFmt = c.key && c.key !== "voen" && c.key !== "fio" ? "0.00" : undefined!;
    }

    const raw = await wb.xlsx.writeBuffer();
    const buffer = Buffer.isBuffer(raw) ? raw : Buffer.from(new Uint8Array(raw));
    const filename = `payroll-${run.year}-${String(run.month).padStart(2, "0")}.xlsx`;
    return { buffer, filename };
  }
}

