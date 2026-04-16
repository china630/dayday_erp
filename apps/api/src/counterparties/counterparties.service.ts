import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Counterparties MDM adapter:
 * - GlobalCounterparty is the single source of truth per VÖEN (taxId).
 * - Local Counterparty keeps organization-scoped fields and links to globalId.
 */
@Injectable()
export class CounterpartiesService {
  constructor(private readonly prisma: PrismaService) {}

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

    const global = await this.prisma.globalCounterparty.upsert({
      where: { taxId },
      create: {
        taxId,
        name: params.nameFallback.trim() || taxId,
        legalAddress: params.legalAddressFallback ?? null,
        vatStatus: params.vatStatusFallback ?? null,
      },
      update: {
        // do not blindly overwrite global data on every call; only fill gaps
        ...(params.nameFallback.trim()
          ? {}
          : {}),
        ...(params.legalAddressFallback != null ? {} : {}),
        ...(params.vatStatusFallback != null ? {} : {}),
      },
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
    return this.prisma.globalCounterparty.findUnique({
      where: { taxId: id },
    });
  }

  async assertLocal(orgId: string, id: string) {
    const row = await this.prisma.counterparty.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!row) throw new NotFoundException("Counterparty not found");
    return row;
  }
}

