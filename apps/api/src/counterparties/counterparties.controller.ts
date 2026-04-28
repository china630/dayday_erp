import {
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CounterpartyRole, UserRole } from "@dayday/database";
import { Roles } from "../auth/decorators/roles.decorator";
import { RolesGuard } from "../auth/guards/roles.guard";
import { OrganizationId } from "../common/org-id.decorator";
import { PrismaService } from "../prisma/prisma.service";
import { CreateCounterpartyDto } from "./dto/create-counterparty.dto";
import { MergeCounterpartiesDto } from "./dto/merge-counterparties.dto";
import { UpdateCounterpartyDto } from "./dto/update-counterparty.dto";
import { CounterpartiesService } from "./counterparties.service";

function buildBankAccountsPayload(ibanRaw?: string | null): Array<{ iban: string }> {
  const iban = ibanRaw?.trim();
  if (!iban) return [];
  return [{ iban }];
}

@ApiTags("counterparties")
@ApiBearerAuth("bearer")
@Controller("counterparties")
@UseGuards(RolesGuard)
@Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.USER)
export class CounterpartiesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly svc: CounterpartiesService,
  ) {}

  @Get()
  @ApiOperation({ summary: "Список контрагентов" })
  list(@OrganizationId() orgId: string) {
    return this.prisma.counterparty.findMany({
      where: { organizationId: orgId },
      orderBy: { name: "asc" },
      include: { global: true },
    });
  }

  @Get(":id")
  @ApiOperation({ summary: "Контрагент по id" })
  async getOne(@OrganizationId() orgId: string, @Param("id") id: string) {
    const row = await this.prisma.counterparty.findFirst({
      where: { id, organizationId: orgId },
      include: { global: true },
    });
    if (!row) {
      throw new NotFoundException("Counterparty not found");
    }
    return row;
  }

  @Get("global/by-voen/:taxId")
  @ApiOperation({ summary: "MDM lookup by VÖEN (GlobalCounterparty)" })
  lookupGlobal(@Param("taxId") taxId: string) {
    return this.svc.lookupGlobalByVoen(taxId);
  }

  @Post()
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: "Создать контрагента" })
  async create(
    @OrganizationId() orgId: string,
    @Body() dto: CreateCounterpartyDto,
  ) {
    const name = dto.name.trim();
    if (!name) {
      throw new ConflictException("name is required");
    }
    const taxId = dto.taxId.trim();
    const dup = await this.prisma.counterparty.findFirst({
      where: { organizationId: orgId, taxId },
    });
    if (dup) {
      throw new ConflictException(
        "A counterparty with this VÖEN already exists in the organization",
      );
    }

    // MDM: attach to global registry if possible (or create global stub).
    // Local counterparty remains the org-scoped record with globalId link.
    try {
      const linked = await this.svc.findOrCreateByVoen({
        organizationId: orgId,
        taxId,
        nameFallback: name,
        legalAddressFallback: dto.address ?? null,
        vatStatusFallback: dto.isVatPayer ?? null,
      });
      // allow local overrides of kind/role/email if provided
      const updated = await this.prisma.counterparty.update({
        where: { id: linked.id },
        data: {
          kind: dto.kind,
          role: dto.role ?? CounterpartyRole.CUSTOMER,
          address: dto.address ?? null,
          email: dto.email?.trim() || null,
          ...(dto.iban !== undefined && {
            bankAccounts: buildBankAccountsPayload(dto.iban),
          }),
          isVatPayer: dto.isVatPayer ?? linked.isVatPayer ?? null,
          ...(dto.portalLocale !== undefined && {
            portalLocale: dto.portalLocale,
          }),
        },
        include: { global: true },
      });
      await this.svc.syncDirectoryAfterLocalSave(orgId, updated.id);
      return updated;
    } catch (e) {
      await this.prisma.auditLog.create({
        data: {
          organizationId: orgId,
          userId: null,
          entityType: "Counterparty",
          entityId: taxId,
          action: "DEGRADED_MODE_ETAXES_FALLBACK",
          newValues: {
            reason: e instanceof Error ? e.message : String(e),
            taxId,
          } as object,
        },
      });
      // fallback to legacy local-only create
    }
    const created = await this.prisma.counterparty.create({
      data: {
        organizationId: orgId,
        name,
        taxId,
        kind: dto.kind,
        role: dto.role ?? CounterpartyRole.CUSTOMER,
        address: dto.address ?? null,
        email: dto.email?.trim() || null,
        ...(dto.iban !== undefined && {
          bankAccounts: buildBankAccountsPayload(dto.iban),
        }),
        isVatPayer: dto.isVatPayer ?? null,
        ...(dto.portalLocale !== undefined && {
          portalLocale: dto.portalLocale,
        }),
      },
      include: { global: true },
    });
    await this.svc.syncDirectoryAfterLocalSave(orgId, created.id);
    return created;
  }

  @Patch(":id")
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: "Обновить контрагента" })
  async update(
    @OrganizationId() orgId: string,
    @Param("id") id: string,
    @Body() dto: UpdateCounterpartyDto,
  ) {
    const existing = await this.prisma.counterparty.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!existing) {
      throw new NotFoundException("Counterparty not found");
    }
    if (dto.taxId !== undefined && dto.taxId.trim() !== existing.taxId) {
      const dup = await this.prisma.counterparty.findFirst({
        where: {
          organizationId: orgId,
          taxId: dto.taxId.trim(),
          NOT: { id },
        },
      });
      if (dup) {
        throw new ConflictException(
          "A counterparty with this VÖEN already exists in the organization",
        );
      }
    }
    const updated = await this.prisma.counterparty.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(dto.taxId !== undefined && { taxId: dto.taxId.trim() }),
        ...(dto.kind !== undefined && { kind: dto.kind }),
        ...(dto.role !== undefined && { role: dto.role }),
        ...(dto.address !== undefined && { address: dto.address || null }),
        ...(dto.email !== undefined && { email: dto.email?.trim() || null }),
        ...(dto.iban !== undefined && {
          bankAccounts: buildBankAccountsPayload(dto.iban),
        }),
        ...(dto.isVatPayer !== undefined && { isVatPayer: dto.isVatPayer }),
        ...(dto.portalLocale !== undefined && {
          portalLocale: dto.portalLocale,
        }),
      },
      include: { global: true },
    });
    await this.svc.syncDirectoryAfterLocalSave(orgId, updated.id);
    return updated;
  }

  @Post("merge")
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: "Слить дубликаты контрагентов (source -> target)" })
  async merge(
    @OrganizationId() orgId: string,
    @Body() dto: MergeCounterpartiesDto,
  ) {
    return this.svc.mergeCounterparties({
      organizationId: orgId,
      sourceId: dto.sourceId,
      targetId: dto.targetId,
    });
  }
}
