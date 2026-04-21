import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

export type DirectoryUpsertInput = {
  taxId: string;
  name: string;
  legalAddress?: string | null;
  phone?: string | null;
  directorName?: string | null;
};

@Injectable()
export class GlobalCompanyDirectoryService {
  private readonly logger = new Logger(GlobalCompanyDirectoryService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Fire-and-forget: does not block HTTP response.
   */
  scheduleUpsert(input: DirectoryUpsertInput): void {
    void this.upsert(input).catch((e) => {
      this.logger.warn(
        `GlobalCompanyDirectory upsert failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    });
  }

  async upsert(input: DirectoryUpsertInput): Promise<void> {
    const taxId = input.taxId.trim();
    if (!/^\d{10}$/.test(taxId)) {
      return;
    }
    const name = input.name.trim() || taxId;
    const legalAddress = input.legalAddress?.trim() || null;
    const phone = input.phone?.trim() || null;
    const directorName = input.directorName?.trim() || null;

    const prev = await this.prisma.globalCompanyDirectory.findUnique({
      where: { taxId },
    });
    const mergedName = name || prev?.name || taxId;
    const mergedLegal =
      legalAddress != null && legalAddress !== ""
        ? legalAddress
        : (prev?.legalAddress ?? null);
    const mergedPhone =
      phone != null && phone !== "" ? phone : (prev?.phone ?? null);
    const mergedDirector =
      directorName != null && directorName !== ""
        ? directorName
        : (prev?.directorName ?? null);

    await this.prisma.globalCompanyDirectory.upsert({
      where: { taxId },
      create: {
        taxId,
        name: mergedName,
        legalAddress: legalAddress ?? null,
        phone: phone ?? null,
        directorName: directorName ?? null,
      },
      update: {
        name: mergedName,
        legalAddress: mergedLegal,
        phone: mergedPhone,
        directorName: mergedDirector,
      },
    });
  }

  async findByTaxId(taxId: string) {
    const id = taxId.trim();
    if (!/^\d{10}$/.test(id)) {
      return null;
    }
    return this.prisma.globalCompanyDirectory.findUnique({
      where: { taxId: id },
    });
  }
}
