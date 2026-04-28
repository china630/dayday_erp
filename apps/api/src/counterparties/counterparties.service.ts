import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { CounterpartyRole, Prisma } from "@dayday/database";
import { GlobalCompanyDirectoryService } from "../global-directory/global-company-directory.service";
import { PrismaService } from "../prisma/prisma.service";
import { TaxpayerIntegrationService } from "../tax/taxpayer-integration.service";

/**
 * Counterparties MDM adapter:
 * - GlobalCounterparty is the single source of truth per VÖEN (taxId).
 * - Local Counterparty keeps organization-scoped fields and links to globalId.
 */
@Injectable()
export class CounterpartiesService {
  private readonly logger = new Logger(CounterpartiesService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly directory: GlobalCompanyDirectoryService,
    private readonly taxpayer: TaxpayerIntegrationService,
  ) {}

  async findOrCreateByVoen(params: {
    organizationId: string;
    taxId: string;
    /** Used when global record must be created */
    nameFallback: string;
    legalAddressFallback?: string | null;
    vatStatusFallback?: boolean | null;
  }) {
    const taxId = params.taxId.trim();
    if (!/^\d{10}$/.test(taxId)) {
      throw new ConflictException("VÖEN must be 10 digits");
    }

    const global =
      (await this.lookupGlobalByVoen(taxId)) ??
      (await this.prisma.globalCounterparty.upsert({
        where: { taxId },
        create: {
          taxId,
          name: params.nameFallback.trim() || taxId,
          legalAddress: params.legalAddressFallback ?? null,
          vatStatus: params.vatStatusFallback ?? null,
        },
        update: {
          // do not blindly overwrite global data on every call; only fill gaps
          ...(params.nameFallback.trim() ? {} : {}),
          ...(params.legalAddressFallback != null ? {} : {}),
          ...(params.vatStatusFallback != null ? {} : {}),
        },
      }));

    this.directory.scheduleUpsert({
      taxId,
      name: global.name.trim() || taxId,
      legalAddress: global.legalAddress ?? params.legalAddressFallback ?? null,
      phone: null,
      directorName: null,
    });

    // Create or attach local record inside the organization
    const existingLocal = await this.prisma.counterparty.findFirst({
      where: { organizationId: params.organizationId, taxId },
    });
    if (existingLocal) {
      if (!existingLocal.globalId) {
        return this.prisma.counterparty.update({
          where: { id: existingLocal.id },
          data: { globalId: global.id },
        });
      }
      return existingLocal;
    }

    // Local "subscription": keep local name for display but prefer global.name in UI.
    return this.prisma.counterparty.create({
      data: {
        organizationId: params.organizationId,
        globalId: global.id,
        taxId,
        name: global.name,
        kind: "LEGAL_ENTITY",
        role: "CUSTOMER",
        address: null,
        email: null,
        isVatPayer: global.vatStatus ?? null,
      },
    });
  }

  async lookupGlobalByVoen(taxId: string) {
    const id = taxId.trim();
    if (!/^\d{10}$/.test(id)) {
      throw new ConflictException("VÖEN must be 10 digits");
    }
    try {
      const cached = await this.prisma.globalCounterparty.findUnique({
        where: { taxId: id },
      });
      if (cached) {
        return cached;
      }
    } catch (e) {
      this.logger.warn(
        `MDM cache unavailable for VÖEN ${id}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    const ext = await this.taxpayer.lookupTaxpayerByVoen(id);
    const hydrated = await this.prisma.globalCounterparty.upsert({
      where: { taxId: id },
      create: {
        taxId: id,
        name: ext.name.trim() || id,
        legalAddress: ext.address ?? null,
        vatStatus: ext.isVatPayer,
      },
      update: {
        name: ext.name.trim() || id,
        legalAddress: ext.address ?? null,
        vatStatus: ext.isVatPayer,
      },
    });
    this.directory.scheduleUpsert({
      taxId: id,
      name: hydrated.name,
      legalAddress: hydrated.legalAddress ?? null,
      phone: null,
      directorName: null,
    });
    return hydrated;
  }

  async assertLocal(orgId: string, id: string) {
    const row = await this.prisma.counterparty.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!row) throw new NotFoundException("Counterparty not found");
    return row;
  }

  /** Refresh global directory row from local counterparty + MDM global. */
  async syncDirectoryAfterLocalSave(organizationId: string, id: string): Promise<void> {
    const row = await this.prisma.counterparty.findFirst({
      where: { id, organizationId },
      include: { global: true },
    });
    if (!row) {
      return;
    }
    const name =
      row.global?.name?.trim() || row.name.trim() || row.taxId.trim();
    const legalAddress = row.global?.legalAddress ?? row.address ?? null;
    this.directory.scheduleUpsert({
      taxId: row.taxId.trim(),
      name,
      legalAddress,
      phone: null,
      directorName: null,
    });
  }

  async mergeCounterparties(params: {
    organizationId: string;
    sourceId: string;
    targetId: string;
  }): Promise<{
    mergedIntoId: string;
    sourceId: string;
    integrity: { ok: boolean; counts: { invoices: number; transactions: number; cashOrders: number } };
  }> {
    const sourceId = params.sourceId.trim();
    const targetId = params.targetId.trim();
    if (!sourceId || !targetId) {
      throw new ConflictException("sourceId and targetId are required");
    }
    if (sourceId === targetId) {
      throw new ConflictException("sourceId and targetId must be different");
    }

    const [source, target] = await Promise.all([
      this.assertLocal(params.organizationId, sourceId),
      this.assertLocal(params.organizationId, targetId),
    ]);

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Transfer all operational links to target (keep in sync with post-merge integrity scan).
      await tx.invoice.updateMany({
        where: { organizationId: params.organizationId, counterpartyId: source.id },
        data: { counterpartyId: target.id },
      });
      await tx.transaction.updateMany({
        where: { organizationId: params.organizationId, counterpartyId: source.id },
        data: { counterpartyId: target.id },
      });
      await tx.cashOrder.updateMany({
        where: { organizationId: params.organizationId, counterpartyId: source.id },
        data: { counterpartyId: target.id },
      });

      // Keep target as canonical, but fill missing fields from source when useful.
      const mergedRole =
        target.role === CounterpartyRole.BOTH || source.role === target.role
          ? target.role
          : CounterpartyRole.BOTH;

      const mergedBankAccounts = (() => {
        const src = Array.isArray(source.bankAccounts)
          ? (source.bankAccounts as Array<{ iban?: string }>)
          : [];
        const tgt = Array.isArray(target.bankAccounts)
          ? (target.bankAccounts as Array<{ iban?: string }>)
          : [];
        const seen = new Set<string>();
        const out: Array<{ iban?: string }> = [];
        for (const row of [...tgt, ...src]) {
          const iban = String(row?.iban ?? "").trim();
          if (!iban || seen.has(iban)) continue;
          seen.add(iban);
          out.push({ iban });
        }
        return out;
      })();

      await tx.counterparty.update({
        where: { id: target.id },
        data: {
          role: mergedRole,
          email: target.email ?? source.email ?? null,
          address: target.address ?? source.address ?? null,
          isVatPayer: target.isVatPayer ?? source.isVatPayer ?? null,
          globalId: target.globalId ?? source.globalId ?? null,
          bankAccounts: mergedBankAccounts,
        },
      });

      await tx.counterparty.delete({
        where: { id: source.id },
      });
    });

    const integrity = await this.scanMergeIntegrity(
      params.organizationId,
      source.id,
    );
    if (!integrity.ok) {
      this.logger.error(
        `Post-merge integrity failed for deleted counterparty ${source.id} in org ${params.organizationId}: ${JSON.stringify(integrity.counts)}`,
      );
    } else {
      this.logger.log(
        `Post-merge integrity OK (no dangling refs to ${source.id}) org=${params.organizationId}`,
      );
    }

    await this.syncDirectoryAfterLocalSave(params.organizationId, target.id);
    return { mergedIntoId: target.id, sourceId: source.id, integrity };
  }

  /**
   * After merge, ensures no operational rows still reference the deleted counterparty id.
   * Extend `counts` keys when new FKs to Counterparty are added.
   */
  async scanMergeIntegrity(
    organizationId: string,
    deletedCounterpartyId: string,
  ): Promise<{
    ok: boolean;
    counts: { invoices: number; transactions: number; cashOrders: number };
  }> {
    const [invoices, transactions, cashOrders] = await Promise.all([
      this.prisma.invoice.count({
        where: { organizationId, counterpartyId: deletedCounterpartyId },
      }),
      this.prisma.transaction.count({
        where: { organizationId, counterpartyId: deletedCounterpartyId },
      }),
      this.prisma.cashOrder.count({
        where: { organizationId, counterpartyId: deletedCounterpartyId },
      }),
    ]);
    const counts = { invoices, transactions, cashOrders };
    const ok = invoices + transactions + cashOrders === 0;
    return { ok, counts };
  }
}

