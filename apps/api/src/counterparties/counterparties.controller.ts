import {
  Body,
  ConflictException,
  Controller,
  Delete,
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
import { counterpartyKindFromLegalForm } from "./counterparty-kind.util";
import { CreateCounterpartyBankAccountDto } from "./dto/create-counterparty-bank-account.dto";
import { CreateCounterpartyDto } from "./dto/create-counterparty.dto";
import { MergeCounterpartiesDto } from "./dto/merge-counterparties.dto";
import { UpdateCounterpartyDto } from "./dto/update-counterparty.dto";
import { CounterpartiesService } from "./counterparties.service";

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

  @Get("global/by-voen/:taxId")
  @ApiOperation({ summary: "MDM lookup by VÖEN (GlobalCounterparty)" })
  lookupGlobal(@Param("taxId") taxId: string) {
    return this.svc.lookupGlobalByVoen(taxId);
  }

  @Get(":id/bank-accounts")
  @ApiOperation({ summary: "Банковские счета контрагента (1:N)" })
  listBankAccounts(@OrganizationId() orgId: string, @Param("id") id: string) {
    return this.svc.listBankAccounts(orgId, id);
  }

  @Post(":id/bank-accounts")
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: "Добавить банковский счёт контрагенту" })
  createBankAccount(
    @OrganizationId() orgId: string,
    @Param("id") id: string,
    @Body() dto: CreateCounterpartyBankAccountDto,
  ) {
    return this.svc.createBankAccount(orgId, id, dto);
  }

  @Delete(":id/bank-accounts/:accountId")
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: "Удалить банковский счёт контрагента" })
  async deleteBankAccount(
    @OrganizationId() orgId: string,
    @Param("id") id: string,
    @Param("accountId") accountId: string,
  ) {
    await this.svc.deleteBankAccount(orgId, id, accountId);
    return { ok: true };
  }

  @Get(":id")
  @ApiOperation({ summary: "Контрагент по id" })
  async getOne(@OrganizationId() orgId: string, @Param("id") id: string) {
    const row = await this.prisma.counterparty.findFirst({
      where: { id, organizationId: orgId },
      include: { global: true, bankAccounts: { orderBy: { createdAt: "asc" } } },
    });
    if (!row) {
      throw new NotFoundException("Counterparty not found");
    }
    return row;
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

    const kind = counterpartyKindFromLegalForm(dto.legalForm);

    try {
      const linked = await this.svc.findOrCreateByVoen({
        organizationId: orgId,
        taxId,
        nameFallback: name,
        legalAddressFallback: dto.address ?? null,
        vatStatusFallback: dto.isVatPayer ?? null,
      });
      const updated = await this.prisma.counterparty.update({
        where: { id: linked.id },
        data: {
          kind,
          role: dto.role ?? CounterpartyRole.CUSTOMER,
          legalForm: dto.legalForm,
          address: dto.address ?? null,
          email: dto.email?.trim() || null,
          isVatPayer: dto.isVatPayer ?? linked.isVatPayer ?? false,
          ...(dto.portalLocale !== undefined && {
            portalLocale: dto.portalLocale,
          }),
        },
        include: { global: true, bankAccounts: { orderBy: { createdAt: "asc" } } },
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
    }
    const created = await this.prisma.counterparty.create({
      data: {
        organizationId: orgId,
        name,
        taxId,
        kind,
        role: dto.role ?? CounterpartyRole.CUSTOMER,
        legalForm: dto.legalForm,
        address: dto.address ?? null,
        email: dto.email?.trim() || null,
        isVatPayer: dto.isVatPayer ?? false,
        ...(dto.portalLocale !== undefined && {
          portalLocale: dto.portalLocale,
        }),
      },
      include: { global: true, bankAccounts: { orderBy: { createdAt: "asc" } } },
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
    const kindPatch =
      dto.legalForm !== undefined
        ? { kind: counterpartyKindFromLegalForm(dto.legalForm) }
        : {};
    const updated = await this.prisma.counterparty.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(dto.taxId !== undefined && { taxId: dto.taxId.trim() }),
        ...kindPatch,
        ...(dto.role !== undefined && { role: dto.role }),
        ...(dto.legalForm !== undefined && { legalForm: dto.legalForm }),
        ...(dto.address !== undefined && { address: dto.address || null }),
        ...(dto.email !== undefined && { email: dto.email?.trim() || null }),
        ...(dto.isVatPayer !== undefined && { isVatPayer: dto.isVatPayer }),
        ...(dto.portalLocale !== undefined && {
          portalLocale: dto.portalLocale,
        }),
      },
      include: { global: true, bankAccounts: { orderBy: { createdAt: "asc" } } },
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
