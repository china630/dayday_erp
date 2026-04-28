import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@dayday/database";
import { randomUUID } from "node:crypto";
import { serializeForAudit } from "../audit/audit-serialize";
import { GlobalCompanyDirectoryService } from "../global-directory/global-company-directory.service";
import { PrismaService } from "../prisma/prisma.service";
import { QuotaService } from "../quota/quota.service";
import {
  STORAGE_SERVICE,
  type StorageService,
} from "../storage/storage.interface";
import { mergeLockedPeriodUntil } from "../reporting/reporting-period.util";
import type { PatchOrganizationSettingsDto } from "./dto/patch-organization-settings.dto";
import { InventoryValuationMethod } from "@dayday/database";

const LOGO_MAX_BYTES = 2 * 1024 * 1024;

@Injectable()
export class OrganizationSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly directory: GlobalCompanyDirectoryService,
    private readonly quota: QuotaService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  private async getSettingsRaw(organizationId: string) {
    const org = await this.prisma.organization.findFirst({
      where: { id: organizationId, isDeleted: false },
      include: { bankAccountsOrg: { orderBy: { createdAt: "asc" } } },
    });
    if (!org) {
      throw new NotFoundException("Organization not found");
    }
    return org;
  }

  async getSettings(organizationId: string) {
    const org = await this.getSettingsRaw(organizationId);
    // Express JSON can't serialize BigInt (e.g. storageUsedBytes).
    // Reuse common serializer used by audit payloads.
    return serializeForAudit(org);
  }

  async patchSettings(organizationId: string, dto: PatchOrganizationSettingsDto) {
    const org = await this.prisma.organization.findFirst({
      where: { id: organizationId, isDeleted: false },
    });
    if (!org) {
      throw new NotFoundException("Organization not found");
    }

    const valuation =
      dto.inventoryValuation ?? dto.valuationMethod ?? undefined;
    const baseSettings =
      org.settings && typeof org.settings === "object" && !Array.isArray(org.settings)
        ? (org.settings as Record<string, unknown>)
        : {};
    const nextSettings =
      valuation !== undefined
        ? ({
            ...baseSettings,
            inventory: {
              ...(baseSettings.inventory &&
              typeof baseSettings.inventory === "object" &&
              !Array.isArray(baseSettings.inventory)
                ? (baseSettings.inventory as Record<string, unknown>)
                : {}),
              inventoryValuation: valuation,
            },
          } as Prisma.InputJsonValue)
        : undefined;

    await this.prisma.$transaction(async (tx) => {
      await tx.organization.update({
        where: { id: organizationId },
        data: {
          ...(dto.name !== undefined && { name: dto.name.trim() }),
          ...(dto.legalAddress !== undefined && {
            legalAddress: dto.legalAddress?.trim() || null,
          }),
          ...(dto.phone !== undefined && { phone: dto.phone?.trim() || null }),
          ...(dto.directorName !== undefined && {
            directorName: dto.directorName?.trim() || null,
          }),
          ...(dto.logoUrl !== undefined && { logoUrl: dto.logoUrl?.trim() || null }),
          ...(valuation !== undefined && {
            valuationMethod: valuation as InventoryValuationMethod,
          }),
          ...(nextSettings !== undefined && {
            settings: nextSettings,
          }),
          ...(dto.lockedPeriodUntil !== undefined && {
            settings: mergeLockedPeriodUntil(
              nextSettings ?? org.settings,
              dto.lockedPeriodUntil ? dto.lockedPeriodUntil.trim() : null,
            ) as Prisma.InputJsonValue,
          }),
        },
      });

      if (dto.bankAccounts !== undefined) {
        await tx.organizationBankAccount.deleteMany({
          where: { organizationId },
        });
        if (dto.bankAccounts.length > 0) {
          await tx.organizationBankAccount.createMany({
            data: dto.bankAccounts.map((b) => ({
              organizationId,
              bankName: b.bankName.trim(),
              accountNumber: b.accountNumber.trim(),
              currency: b.currency,
              iban: b.iban?.trim() || null,
              swift: b.swift?.trim() || null,
            })),
          });
        }
      }
    });

    const fresh = await this.getSettingsRaw(organizationId);
    this.directory.scheduleUpsert({
      taxId: fresh.taxId,
      name: fresh.name,
      legalAddress: fresh.legalAddress,
      phone: fresh.phone,
      directorName: fresh.directorName,
    });
    return serializeForAudit(fresh);
  }

  async patchPeriodLock(organizationId: string, lockedPeriodUntil: string | null) {
    const org = await this.prisma.organization.findFirst({
      where: { id: organizationId, isDeleted: false },
      select: { id: true, settings: true },
    });
    if (!org) {
      throw new NotFoundException("Organization not found");
    }
    await this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        settings: mergeLockedPeriodUntil(
          org.settings,
          lockedPeriodUntil ? lockedPeriodUntil.trim() : null,
        ) as Prisma.InputJsonValue,
      },
    });
    const fresh = await this.getSettingsRaw(organizationId);
    return serializeForAudit(fresh);
  }

  async uploadLogo(organizationId: string, file: Express.Multer.File | undefined) {
    if (!file?.buffer?.length) {
      throw new BadRequestException("File is required");
    }
    if (file.size > LOGO_MAX_BYTES) {
      throw new BadRequestException("Logo must be at most 2 MB");
    }
    const ext =
      file.mimetype === "image/png"
        ? "png"
        : file.mimetype === "image/jpeg" || file.mimetype === "image/jpg"
          ? "jpg"
          : file.mimetype === "image/webp"
            ? "webp"
            : null;
    if (!ext) {
      throw new BadRequestException("Allowed types: PNG, JPEG, WebP");
    }

    await this.quota.assertStorageQuota(organizationId, file.size);

    const key = `org-logos/${organizationId}/${randomUUID()}.${ext}`;
    await this.storage.putObject(key, file.buffer, {
      contentType: file.mimetype,
    });
    await this.quota.addStorageUsage(organizationId, file.size);
    const publicUrl =
      this.storage.getPublicUrl?.(key) ?? `/files/${key.replace(/\\/g, "/")}`;

    await this.prisma.organization.update({
      where: { id: organizationId },
      data: { logoUrl: publicUrl },
    });

    const org = await this.getSettingsRaw(organizationId);
    this.directory.scheduleUpsert({
      taxId: org.taxId,
      name: org.name,
      legalAddress: org.legalAddress,
      phone: org.phone,
      directorName: org.directorName,
    });

    return { logoUrl: publicUrl };
  }
}
