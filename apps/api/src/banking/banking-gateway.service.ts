import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { Inject } from "@nestjs/common";
import { UserRole } from "@dayday/database";
import { AuditService } from "../audit/audit.service";
import { assertMayAccessPayrollFinance } from "../auth/policies/hr-payroll.policy";
import { PrismaService } from "../prisma/prisma.service";
import { ProviderRegistryService, type BankingProviderKey } from "./bank-providers/provider-registry.service";
import { AbbAdapter } from "./bank-providers/abb.adapter";
import { UniversalBankExportService } from "./universal-bank-export.service";
import {
  STORAGE_SERVICE,
  type StorageService,
} from "../storage/storage.interface";

function asRecord(v: unknown): Record<string, unknown> {
  if (typeof v === "object" && v !== null && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return {};
}

function normalizeProviderKey(raw: unknown): BankingProviderKey | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  if (v === "pasha") return "pasha";
  if (v === "abb") return "abb";
  if (v === "birbank" || v === "kapital" || v === "kapital_bank") return "birbank";
  return null;
}

@Injectable()
export class BankingGatewayService {
  private readonly logger = new Logger(BankingGatewayService.name);
  private readonly failures = new Map<BankingProviderKey, number>();
  private readonly openUntil = new Map<BankingProviderKey, number>();
  private readonly successCounters = new Map<
    BankingProviderKey,
    { attempts: number; success: number }
  >();
  private readonly threshold = 3;
  private readonly openMs = 5 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: ProviderRegistryService,
    private readonly audit: AuditService,
    private readonly abb: AbbAdapter,
    private readonly universalExport: UniversalBankExportService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  private assertCircuitClosed(provider: BankingProviderKey): void {
    const until = this.openUntil.get(provider) ?? 0;
    const now = Date.now();
    if (until > now) {
      throw new ServiceUnavailableException({
        code: "BANK_CIRCUIT_OPEN",
        message: `Provider ${provider} temporarily unavailable (circuit open)`,
        retryAfterMs: until - now,
      });
    }
    if (until > 0 && until <= now) {
      this.openUntil.delete(provider);
      this.failures.set(provider, 0);
    }
  }

  private onProviderSuccess(provider: BankingProviderKey): void {
    this.failures.set(provider, 0);
    this.openUntil.delete(provider);
    this.recordSuccessMetric(provider, true);
  }

  private onProviderFailure(provider: BankingProviderKey, error: unknown): void {
    this.recordSuccessMetric(provider, false);
    const next = (this.failures.get(provider) ?? 0) + 1;
    this.failures.set(provider, next);
    if (next >= this.threshold) {
      const until = Date.now() + this.openMs;
      this.openUntil.set(provider, until);
      this.logger.error(
        `Bank circuit opened for ${provider} after ${next} failures; open for ${this.openMs}ms. Last error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private recordSuccessMetric(
    provider: BankingProviderKey,
    success: boolean,
  ): void {
    const curr = this.successCounters.get(provider) ?? { attempts: 0, success: 0 };
    curr.attempts += 1;
    if (success) curr.success += 1;
    this.successCounters.set(provider, curr);
  }

  private buildSuccessRateMetrics() {
    return Array.from(this.successCounters.entries()).map(([provider, v]) => ({
      provider,
      attempts: v.attempts,
      success: v.success,
      failed: Math.max(0, v.attempts - v.success),
      successRatePct:
        v.attempts === 0 ? "0.00" : ((v.success * 100) / v.attempts).toFixed(2),
    }));
  }

  async getBalances(organizationId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { settings: true },
    });
    const root = asRecord(org?.settings);
    const direct = asRecord(root.bankingDirect);

    const directPrimary =
      normalizeProviderKey(direct.primaryProvider) ??
      normalizeProviderKey(root.bankKey) ??
      normalizeProviderKey(root.bankingProvider);

    const enabled: BankingProviderKey[] = [];
    if ((asRecord(direct.pasha).enabled as boolean | undefined) !== false) enabled.push("pasha");
    if ((asRecord(direct.abb).enabled as boolean | undefined) !== false) enabled.push("abb");
    if ((asRecord(direct.kapital).enabled as boolean | undefined) !== false) enabled.push("birbank");

    const providerKeys = directPrimary ? [directPrimary] : enabled.length ? enabled : ["pasha", "abb", "birbank"];
    const uniqueKeys = Array.from(new Set(providerKeys)) as BankingProviderKey[];

    const byProvider = await Promise.all(
      uniqueKeys.map(async (key) => {
        const adapter = this.providers.getProvider(key);
        try {
          this.assertCircuitClosed(key);
          const balances = await adapter.getBalances();
          this.onProviderSuccess(key);
          return { provider: key, balances, error: null as string | null };
        } catch (e) {
          this.onProviderFailure(key, e);
          const safeRawResponse = this.safeRawResponse(e);
          await this.audit.logOrganizationSystemEvent({
            organizationId,
            entityType: "integration.failure",
            entityId: key,
            action: "READ_BALANCES",
            payload: {
              provider: key,
              message: e instanceof Error ? e.message : String(e),
              rawResponse: safeRawResponse,
            },
          });
          return {
            provider: key,
            balances: [],
            error: e instanceof Error ? e.message : "provider error",
          };
        }
      }),
    );

    return {
      organizationId,
      providers: byProvider,
      balances: byProvider.flatMap((p) =>
        p.balances.map((b) => ({ ...b, provider: p.provider })),
      ),
      successRateMetrics: this.buildSuccessRateMetrics(),
    };
  }

  private safeRawResponse(error: unknown): Record<string, unknown> | null {
    if (typeof error !== "object" || error === null) return null;
    const response = (error as { response?: unknown }).response;
    if (typeof response !== "object" || response === null) return null;
    const status = (response as { status?: unknown }).status;
    const data = (response as { data?: unknown }).data;
    return {
      status: typeof status === "number" ? status : null,
      data:
        data == null
          ? null
          : typeof data === "string"
            ? data.slice(0, 1000)
            : data,
    };
  }

  async prepareSalaryRegistry(registryId: string, actingUserRole: UserRole) {
    assertMayAccessPayrollFinance(actingUserRole);
    const registry = await (this.prisma as any).salaryRegistry.findUnique({
      where: { id: registryId },
      include: {
        payrollRun: {
          include: {
            slips: {
              include: { employee: true },
            },
            organization: true,
          },
        },
        bankAccount: true,
      },
    });
    if (!registry) {
      throw new Error("Salary registry not found");
    }
    if (registry.status !== "DRAFT") {
      return registry;
    }

    const provider = this.providerFromBankName(registry.bankAccount?.bankName);
    const run = registry.payrollRun;
    const rows: Array<{
      employeeName: string;
      employeeFinCode: string | null;
      recipientAccount: string;
      amount: string;
      currency: string;
      purpose: string;
    }> = run.slips
      .filter((s: any) => Number(s.net) > 0)
      .map((s: any) => ({
        employeeName: `${s.employee.lastName} ${s.employee.firstName}`.trim(),
        employeeFinCode: s.employee.finCode ?? null,
        recipientAccount: s.employee.accountNumber ?? "",
        amount: String(s.net),
        currency: registry.bankAccount.currency,
        purpose: `Salary ${run.month}/${run.year}`,
      }));
    const invalid = rows.find((r: { recipientAccount: string }) => !r.recipientAccount.trim());
    if (invalid) {
      throw new Error(`Employee accountNumber is required for ${invalid.employeeName}`);
    }

    if (provider === "abb" && registry.payoutFormat === "ABB_XML") {
      const xml = this.abb.buildSalaryPaymentXml(
        rows.map((r: {
          employeeFinCode: string | null;
          amount: string;
          purpose: string;
          recipientAccount: string;
        }) => ({
          rrn: `PAY-${run.id.slice(0, 8)}-${r.employeeFinCode ?? "EMP"}`,
          account: registry.bankAccount.iban ?? registry.bankAccount.accountNumber,
          amount: r.amount,
          recipientAccount: r.recipientAccount,
          description1: r.purpose.slice(0, 35),
        })),
      );
      const sent = await this.abb.sendSalaryRegistryXml(
        xml,
        `salary-registry-${registry.id}`,
      );
      const updated = await (this.prisma as any).salaryRegistry.update({
        where: { id: registry.id },
        data: {
          status: "SENT",
          externalId: sent.batchNumber || null,
        },
      });
      await this.audit.logOrganizationSystemEvent({
        organizationId: registry.organizationId,
        entityType: "salary.registry",
        entityId: registry.id,
        action: "SEND_ABB_XML",
        payload: {
          payrollRunId: registry.payrollRunId,
          bankAccountId: registry.bankAccountId,
          externalId: sent.batchNumber || null,
        },
      });
      return updated;
    }

    const exported = await this.universalExport.buildSalaryRegistryXlsx({
      organizationTaxId: run.organization.taxId,
      year: run.year,
      month: run.month,
      rows,
    });
    const objectKey = `orgs/${registry.organizationId}/payroll/registries/${registry.id}/${exported.filename}`;
    await this.storage.putObject(objectKey, Buffer.from(exported.base64, "base64"), {
      contentType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const updated = await (this.prisma as any).salaryRegistry.update({
      where: { id: registry.id },
      data: {
        status: "SENT",
        externalId: exported.filename,
        exportUrl: objectKey,
      },
    });
    await this.audit.logOrganizationSystemEvent({
      organizationId: registry.organizationId,
      entityType: "salary.registry",
      entityId: registry.id,
      action: "GENERATE_UNIVERSAL_EXPORT",
      payload: {
        payrollRunId: registry.payrollRunId,
        bankAccountId: registry.bankAccountId,
        filename: exported.filename,
      },
    });
    return updated;
  }

  async sendPaymentDraft(
    organizationId: string,
    payload: {
      fromAccountIban: string;
      recipientIban: string;
      amount: string;
      currency: string;
      purpose: string;
      provider?: string;
    },
  ) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { settings: true },
    });
    const root = asRecord(org?.settings);
    const direct = asRecord(root.bankingDirect);
    const preferred =
      normalizeProviderKey(payload.provider) ??
      normalizeProviderKey(direct.primaryProvider) ??
      normalizeProviderKey(root.bankKey) ??
      normalizeProviderKey(root.bankingProvider) ??
      "pasha";
    const adapter = this.providers.getProvider(preferred);
    this.assertCircuitClosed(preferred);

    const draft = await (this.prisma as any).bankPaymentDraft.create({
      data: {
        organizationId,
        amount: payload.amount,
        currency: payload.currency.toUpperCase(),
        recipientIban: payload.recipientIban,
        purpose: payload.purpose,
        provider: preferred,
        status: "PENDING",
      },
    });

    try {
      const sent = await adapter.sendPaymentDraft({
        fromAccountIban: payload.fromAccountIban,
        toIban: payload.recipientIban,
        amount: payload.amount,
        currency: payload.currency.toUpperCase(),
        purpose: payload.purpose,
        reference: `bp-${draft.id.slice(0, 8)}`,
      });
      this.onProviderSuccess(preferred);
      return (this.prisma as any).bankPaymentDraft.update({
        where: { id: draft.id },
        data: {
          status: "SENT",
          providerDraftId: sent.draftId || null,
          sentAt: new Date(),
        },
      });
    } catch (e) {
      this.onProviderFailure(preferred, e);
      const message = e instanceof Error ? e.message : String(e);
      await (this.prisma as any).bankPaymentDraft.update({
        where: { id: draft.id },
        data: {
          status: "REJECTED",
          rejectionReason: message.slice(0, 500),
        },
      });
      throw e;
    }
  }

  private providerFromBankName(bankNameRaw: unknown): BankingProviderKey | "other" {
    if (typeof bankNameRaw !== "string") return "other";
    const v = bankNameRaw.trim().toLowerCase();
    if (v.includes("abb")) return "abb";
    if (v.includes("pasha")) return "pasha";
    if (v.includes("birbank") || v.includes("kapital")) return "birbank";
    return "other";
  }
}

