import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  Decimal,
  LedgerType,
  Prisma,
  TaxDeclarationExportStatus,
} from "@dayday/database";
import ExcelJS from "exceljs";
import { endOfUtcDay, monthRangeUtc } from "./reporting-period.util";
import { PrismaService } from "../prisma/prisma.service";
import { STORAGE_SERVICE, type StorageService } from "../storage/storage.interface";
import type { GenerateTaxDeclarationDto } from "./dto/generate-tax-declaration.dto";
import { REVENUE_ACCOUNT_CODE } from "../ledger.constants";

type DeclarationRecord = {
  id: string;
  taxType: string;
  period: string;
  status: TaxDeclarationExportStatus;
  generatedFileUrl: string;
  receiptFileUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function parsePeriod(period: string): { year: number; month: number } {
  const m = period.match(/^(\d{4})-(\d{2})$/);
  if (!m) throw new BadRequestException("period must be in YYYY-MM format");
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    throw new BadRequestException("invalid period");
  }
  return { year, month };
}

@Injectable()
export class TaxExportService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  async list(organizationId: string): Promise<DeclarationRecord[]> {
    return this.prisma.taxDeclarationExport.findMany({
      where: { organizationId },
      orderBy: [{ period: "desc" }, { createdAt: "desc" }],
    });
  }

  private async aggregateSimplifiedTax(
    organizationId: string,
    period: string,
  ): Promise<{
    periodFrom: string;
    periodTo: string;
    revenueAzn: Decimal;
    simplifiedTaxAmountAzn: Decimal;
  }> {
    const { year, month } = parsePeriod(period);
    const { start, end } = monthRangeUtc(year, month);
    const account = await this.prisma.account.findFirst({
      where: { organizationId, code: REVENUE_ACCOUNT_CODE, ledgerType: LedgerType.NAS },
      select: { id: true },
    });
    if (!account) {
      throw new BadRequestException(
        `Revenue account ${REVENUE_ACCOUNT_CODE} not found for organization`,
      );
    }

    const agg = await this.prisma.journalEntry.aggregate({
      where: {
        organizationId,
        accountId: account.id,
        ledgerType: LedgerType.NAS,
        transaction: { date: { gte: start, lte: endOfUtcDay(end) } },
      },
      _sum: { credit: true },
    });
    const revenueAzn = agg._sum.credit ?? new Prisma.Decimal(0);
    const simplifiedTaxAmountAzn = revenueAzn.mul(new Prisma.Decimal("0.02"));
    return {
      periodFrom: start.toISOString().slice(0, 10),
      periodTo: end.toISOString().slice(0, 10),
      revenueAzn,
      simplifiedTaxAmountAzn,
    };
  }

  private buildSimplifiedTaxXml(input: {
    orgTaxId: string;
    orgName: string;
    period: string;
    periodFrom: string;
    periodTo: string;
    revenueAzn: Decimal;
    simplifiedTaxAmountAzn: Decimal;
  }): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<TaxDeclaration schemaVersion="2.0" target="e-taxes.gov.az">
  <DeclarationType>SIMPLIFIED_TAX</DeclarationType>
  <Period>${input.period}</Period>
  <Taxpayer>
    <TaxId>${input.orgTaxId}</TaxId>
    <Name>${input.orgName}</Name>
  </Taxpayer>
  <Computation>
    <PeriodFrom>${input.periodFrom}</PeriodFrom>
    <PeriodTo>${input.periodTo}</PeriodTo>
    <RevenueAZN>${input.revenueAzn.toFixed(2)}</RevenueAZN>
    <TaxRatePercent>2.00</TaxRatePercent>
    <TaxAmountAZN>${input.simplifiedTaxAmountAzn.toFixed(2)}</TaxAmountAZN>
  </Computation>
  <ComplianceNote>Elektron Bildiriş uploaded separately after portal submission.</ComplianceNote>
</TaxDeclaration>`;
  }

  private async buildSimplifiedTaxXlsxBuffer(input: {
    orgName: string;
    orgTaxId: string;
    period: string;
    periodFrom: string;
    periodTo: string;
    revenueAzn: Decimal;
    simplifiedTaxAmountAzn: Decimal;
  }): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    wb.creator = "DayDay ERP";
    wb.created = new Date();
    const sheet = wb.addWorksheet("SimplifiedTax");
    sheet.columns = [
      { header: "Field", key: "field", width: 32 },
      { header: "Value", key: "value", width: 48 },
    ];
    sheet.addRows([
      { field: "Tax type", value: "SIMPLIFIED_TAX" },
      { field: "Taxpayer name", value: input.orgName },
      { field: "Taxpayer VÖEN", value: input.orgTaxId },
      { field: "Period", value: input.period },
      { field: "Period from", value: input.periodFrom },
      { field: "Period to", value: input.periodTo },
      { field: "Revenue (AZN)", value: input.revenueAzn.toFixed(2) },
      { field: "Rate (%)", value: "2.00" },
      { field: "Tax amount (AZN)", value: input.simplifiedTaxAmountAzn.toFixed(2) },
    ]);
    const raw = await wb.xlsx.writeBuffer();
    return Buffer.isBuffer(raw) ? raw : Buffer.from(new Uint8Array(raw));
  }

  async generate(organizationId: string, dto: GenerateTaxDeclarationDto) {
    if (dto.taxType !== "SIMPLIFIED_TAX") {
      throw new BadRequestException("Unsupported tax type");
    }
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, name: true, taxId: true },
    });
    if (!org) throw new NotFoundException("Organization not found");
    if (!org.taxId?.trim()) {
      throw new BadRequestException("Organization tax ID is required");
    }

    const agg = await this.aggregateSimplifiedTax(organizationId, dto.period);
    const xml = this.buildSimplifiedTaxXml({
      orgTaxId: org.taxId,
      orgName: org.name,
      period: dto.period,
      periodFrom: agg.periodFrom,
      periodTo: agg.periodTo,
      revenueAzn: agg.revenueAzn,
      simplifiedTaxAmountAzn: agg.simplifiedTaxAmountAzn,
    });
    const xlsx = await this.buildSimplifiedTaxXlsxBuffer({
      orgName: org.name,
      orgTaxId: org.taxId,
      period: dto.period,
      periodFrom: agg.periodFrom,
      periodTo: agg.periodTo,
      revenueAzn: agg.revenueAzn,
      simplifiedTaxAmountAzn: agg.simplifiedTaxAmountAzn,
    });

    const stamp = Date.now();
    const baseKey = `orgs/${organizationId}/tax-exports/${dto.taxType}/${dto.period}-${stamp}`;
    const xmlKey = `${baseKey}.xml`;
    const xlsxKey = `${baseKey}.xlsx`;
    await this.storage.putObject(xmlKey, Buffer.from(xml, "utf8"), {
      contentType: "application/xml",
    });
    await this.storage.putObject(xlsxKey, xlsx, {
      contentType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    const created = await this.prisma.taxDeclarationExport.create({
      data: {
        organizationId,
        taxType: dto.taxType,
        period: dto.period,
        generatedFileUrl: xmlKey,
        status: TaxDeclarationExportStatus.GENERATED,
      },
    });

    return {
      ...created,
      artifacts: { xmlKey, xlsxKey },
      computation: {
        revenueAzn: agg.revenueAzn.toFixed(2),
        simplifiedTaxAmountAzn: agg.simplifiedTaxAmountAzn.toFixed(2),
      },
    };
  }

  async downloadGenerated(organizationId: string, exportId: string) {
    const row = await this.prisma.taxDeclarationExport.findFirst({
      where: { id: exportId, organizationId },
    });
    if (!row) throw new NotFoundException("Tax declaration export not found");

    const buffer = await this.storage.getObject(row.generatedFileUrl);
    if (row.status === TaxDeclarationExportStatus.GENERATED) {
      await this.prisma.taxDeclarationExport.update({
        where: { id: row.id },
        data: { status: TaxDeclarationExportStatus.UPLOADED },
      });
    }
    return {
      buffer,
      filename: `${row.taxType}-${row.period}.xml`,
      contentType: "application/xml",
    };
  }

  async attachReceipt(
    organizationId: string,
    exportId: string,
    file: Express.Multer.File,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException("receipt file is required");
    }
    if (file.mimetype !== "application/pdf") {
      throw new BadRequestException("receipt must be a PDF");
    }
    const row = await this.prisma.taxDeclarationExport.findFirst({
      where: { id: exportId, organizationId },
    });
    if (!row) throw new NotFoundException("Tax declaration export not found");
    if (row.status === TaxDeclarationExportStatus.GENERATED) {
      throw new BadRequestException(
        "Download declaration first to move status to UPLOADED",
      );
    }

    const key = `orgs/${organizationId}/tax-exports/${row.taxType}/${row.period}-receipt-${Date.now()}.pdf`;
    await this.storage.putObject(key, file.buffer, {
      contentType: "application/pdf",
    });

    return this.prisma.taxDeclarationExport.update({
      where: { id: row.id },
      data: {
        receiptFileUrl: key,
        status: TaxDeclarationExportStatus.CONFIRMED_BY_TAX,
      },
    });
  }
}
