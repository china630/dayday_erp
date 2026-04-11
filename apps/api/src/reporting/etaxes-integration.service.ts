import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import { LedgerType } from "@dayday/database";
import { PrismaService } from "../prisma/prisma.service";
import { REVENUE_ACCOUNT_CODE } from "../ledger.constants";
import { endOfUtcDay, parseIsoDateOnly } from "./reporting-period.util";
import {
  type VatQuarterPurchaseRow,
  type VatQuarterSalesRow,
  VatQuarterDataService,
} from "./vat-quarter-data.service";

/** Нормализованный VÖEN: ровно 10 цифр */
function normalizeVoenDigits(raw: string | null | undefined): string | null {
  if (raw == null || raw === "") return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 0) return null;
  return digits.slice(-10).padStart(10, "0");
}

function isValidVoen10(raw: string | null | undefined): boolean {
  const d = normalizeVoenDigits(raw);
  return d != null && /^\d{10}$/.test(d);
}

export type VatValidationIssue = {
  code: string;
  message: string;
  context?: Record<string, string>;
};

/**
 * JSON-пакет для интеграции с e-taxes (ƏDV / BTP-uyğun sahələr).
 * Названия в `btp` — iş məntiqi ilə şablon sütunlarına uyğunlaşdırılıb (rəsmi BTP kodları portal sənədlərinə əsasən yenilənə bilər).
 */
export type ETaxesVatSalesLineJson = {
  lineNo: number;
  btp: {
    /** Tarix */
    tarixi: string;
    /** Sənəd nömrəsi */
    sened_nomresi: string;
    /** Alıcının adı */
    alici_ad: string;
    /** Alıcının VÖEN-i */
    alici_voen: string;
    /** Mal/xidmət kodu (SKU / təsnifat kodu) */
    mal_xidmet_kodu: string;
    /** Təsvir */
    tesvir: string;
    miqdar: number;
    /** Cəm ƏDV-siz */
    mebleg_edvsiz: string;
    /** ƏDV məbləği */
    edv_meblegi: string;
    /** ƏDV dərəcəsi, % */
    edv_derecesi: string;
    /** Cəm */
    cemi: string;
  };
  sourceSystem: {
    invoiceId: string;
    invoiceLineId: string;
    productId: string | null;
  };
};

export type ETaxesVatPurchaseLineJson = {
  lineNo: number;
  btp: {
    tarixi: string;
    sened_nomresi: string;
    satıcı_ad: string;
    satıcı_voen: string;
    mal_xidmet_kodu: string;
    tesvir: string;
    miqdar: number;
    mebleg_edvsiz: string;
    edv_meblegi: string;
    edv_derecesi: string;
    cemi: string;
  };
  sourceSystem: {
    stockMovementId: string;
    productId: string;
  };
};

export type ETaxesVatDeclarationPackage = {
  meta: {
    schemaVersion: "1.0";
    targetPortal: "e-taxes.gov.az";
    mappingNote: string;
  };
  reportingPeriod: {
    year: number;
    quarter: number;
    dateFrom: string;
    dateTo: string;
  };
  taxpayer: {
    voen: string;
    legalName: string;
  };
  appendixSales: ETaxesVatSalesLineJson[];
  appendixPurchases: ETaxesVatPurchaseLineJson[];
  ledgerReference?: {
    nasRevenue601CreditQuarterAzn?: string | null;
  };
};

@Injectable()
export class ETaxesIntegrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vatQuarter: VatQuarterDataService,
    private readonly config: ConfigService,
  ) {}

  private validateRows(
    orgVoen: string,
    sales: VatQuarterSalesRow[],
    purchases: VatQuarterPurchaseRow[],
  ): VatValidationIssue[] {
    const issues: VatValidationIssue[] = [];

    if (!isValidVoen10(orgVoen)) {
      issues.push({
        code: "ORG_VOEN_INVALID",
        message:
          "Təşkilatın VÖEN-i düzgün deyil (10 rəqəm olmalıdır). / Организация: неверный VÖEN.",
      });
    }

    sales.forEach((row, i) => {
      if (!isValidVoen10(row.counterpartyVoen)) {
        issues.push({
          code: "SALE_COUNTERPARTY_VOEN_INVALID",
          message: `Satış sətri ${i + 1} (${row.documentNumber}): alıcı VÖEN-i yoxdur və ya səhvdir.`,
          context: {
            invoiceLineId: row.invoiceLineId,
            documentNumber: row.documentNumber,
          },
        });
      }
      const sku = row.productSku?.trim();
      if (!row.productId || !sku) {
        issues.push({
          code: "SALE_PRODUCT_CODE_MISSING",
          message: `Satış sətri ${i + 1} (${row.documentNumber}): mal kodu (SKU) mütləqdir.`,
          context: {
            invoiceLineId: row.invoiceLineId,
            documentNumber: row.documentNumber,
          },
        });
      }
    });

    purchases.forEach((row, i) => {
      const sku = row.productSku?.trim();
      if (!sku) {
        issues.push({
          code: "PURCHASE_PRODUCT_CODE_MISSING",
          message: `Alış sətri ${i + 1} (${row.documentNumber}): mal kodu (SKU) mütləqdir.`,
          context: {
            stockMovementId: row.stockMovementId,
            documentNumber: row.documentNumber,
          },
        });
      }
      if (
        row.supplierVoen?.trim() &&
        !isValidVoen10(row.supplierVoen)
      ) {
        issues.push({
          code: "PURCHASE_SUPPLIER_VOEN_INVALID",
          message: `Alış sətri ${i + 1}: təchizatçı VÖEN-i səhvdir.`,
          context: { stockMovementId: row.stockMovementId },
        });
      }
    });

    return issues;
  }

  private mapSalesToBtp(rows: VatQuarterSalesRow[]): ETaxesVatSalesLineJson[] {
    return rows.map((row, idx) => ({
      lineNo: idx + 1,
      btp: {
        tarixi: row.date,
        sened_nomresi: row.documentNumber,
        alici_ad: row.counterpartyName,
        alici_voen: normalizeVoenDigits(row.counterpartyVoen) ?? "",
        mal_xidmet_kodu: (row.productSku ?? "").trim() || "—",
        tesvir: row.description,
        miqdar: row.quantity,
        mebleg_edvsiz: row.amountWithoutVat,
        edv_meblegi: row.vatAmount,
        edv_derecesi: row.vatRatePercent,
        cemi: row.amountWithVat,
      },
      sourceSystem: {
        invoiceId: row.invoiceId,
        invoiceLineId: row.invoiceLineId,
        productId: row.productId,
      },
    }));
  }

  private mapPurchasesToBtp(
    rows: VatQuarterPurchaseRow[],
  ): ETaxesVatPurchaseLineJson[] {
    return rows.map((row, idx) => ({
      lineNo: idx + 1,
      btp: {
        tarixi: row.date,
        sened_nomresi: row.documentNumber,
        satıcı_ad: row.supplierName || "—",
        satıcı_voen: normalizeVoenDigits(row.supplierVoen) ?? "",
        mal_xidmet_kodu: (row.productSku ?? "").trim() || "—",
        tesvir: row.description,
        miqdar: row.quantity,
        mebleg_edvsiz: row.amountWithoutVat,
        edv_meblegi: row.vatAmount,
        edv_derecesi: row.vatRatePercent,
        cemi: row.amountWithVat,
      },
      sourceSystem: {
        stockMovementId: row.stockMovementId,
        productId: row.productId,
      },
    }));
  }

  private async ledgerRevenueReference(
    organizationId: string,
    fromStr: string,
    toStr: string,
  ): Promise<string | null> {
    const acc = await this.prisma.account.findFirst({
      where: {
        organizationId,
        code: REVENUE_ACCOUNT_CODE,
        ledgerType: LedgerType.NAS,
      },
      select: { id: true },
    });
    if (!acc) return null;
    const from = parseIsoDateOnly(fromStr);
    const to = endOfUtcDay(parseIsoDateOnly(toStr));
    const agg = await this.prisma.journalEntry.aggregate({
      where: {
        organizationId,
        accountId: acc.id,
        ledgerType: LedgerType.NAS,
        transaction: { date: { gte: from, lte: to } },
      },
      _sum: { credit: true, debit: true },
    });
    const cr = agg._sum.credit;
    if (cr == null) return null;
    return cr.toFixed(4);
  }

  async buildDeclarationPackage(
    organizationId: string,
    year: number,
    quarter: number,
  ): Promise<{
    package: ETaxesVatDeclarationPackage;
    validation: { errors: VatValidationIssue[]; readyToSubmit: boolean };
  }> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true, taxId: true },
    });
    if (!org) throw new BadRequestException("Organization not found");

    const { fromStr, toStr, sales, purchases } =
      await this.vatQuarter.loadQuarterVatRows(organizationId, year, quarter);

    const errors = this.validateRows(org.taxId, sales, purchases);
    const nas601 = await this.ledgerRevenueReference(
      organizationId,
      fromStr,
      toStr,
    );

    const pkg: ETaxesVatDeclarationPackage = {
      meta: {
        schemaVersion: "1.0",
        targetPortal: "e-taxes.gov.az",
        mappingNote:
          "ƏDV əlavəsi (satış/alış). BTP sahələri portal şablonları ilə uyğunlaşdırılmalıdır; nasAccount601CreditQuarterAzn — JournalEntry (601 NAS, kredit) müqayisə üçündür.",
      },
      reportingPeriod: {
        year,
        quarter,
        dateFrom: fromStr,
        dateTo: toStr,
      },
      taxpayer: {
        voen: normalizeVoenDigits(org.taxId) ?? org.taxId.replace(/\D/g, ""),
        legalName: org.name,
      },
      appendixSales: this.mapSalesToBtp(sales),
      appendixPurchases: this.mapPurchasesToBtp(purchases),
      ledgerReference: {
        nasRevenue601CreditQuarterAzn: nas601,
      },
    };

    return {
      package: pkg,
      validation: {
        errors,
        readyToSubmit: errors.length === 0,
      },
    };
  }

  async submitDeclarationToGateway(
    organizationId: string,
    year: number,
    quarter: number,
  ): Promise<{
    submitted: boolean;
    gatewayStatus?: number;
    gatewayMessage?: string;
  }> {
    const { package: pkg, validation } = await this.buildDeclarationPackage(
      organizationId,
      year,
      quarter,
    );
    if (!validation.readyToSubmit) {
      throw new BadRequestException({
        message: "Validation failed",
        errors: validation.errors,
      });
    }

    const url = this.config.get<string>("E_TAXES_VAT_SUBMIT_URL")?.trim();
    if (!url) {
      throw new HttpException(
        {
          code: "E_TAXES_GATEWAY_NOT_CONFIGURED",
          message:
            "E_TAXES_VAT_SUBMIT_URL təyin edilməyib. Birbaşa API inteqrasiyası üçün URL konfiqurasiya edin.",
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    try {
      const res = await axios.post(url, pkg, {
        timeout: 25_000,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        validateStatus: () => true,
      });
      if (res.status >= 200 && res.status < 300) {
        return { submitted: true, gatewayStatus: res.status };
      }
      const bodySnippet =
        typeof res.data === "string"
          ? res.data.slice(0, 500)
          : JSON.stringify(res.data).slice(0, 500);
      throw new HttpException(
        {
          code: "E_TAXES_GATEWAY_REJECTED",
          message: `Portal cavabı: HTTP ${res.status}`,
          body: bodySnippet,
        },
        HttpStatus.BAD_GATEWAY,
      );
    } catch (e) {
      if (e instanceof HttpException) throw e;
      if (axios.isAxiosError(e)) {
        throw new HttpException(
          {
            code: "E_TAXES_GATEWAY_UNREACHABLE",
            message:
              e.code === "ECONNABORTED"
                ? "Gateway timeout"
                : e.message || "Network error",
          },
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      throw e;
    }
  }
}
