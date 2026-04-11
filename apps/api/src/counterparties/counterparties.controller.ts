import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CounterpartyRole } from "@dayday/database";
import { OrganizationId } from "../common/org-id.decorator";
import { PrismaService } from "../prisma/prisma.service";
import { CreateCounterpartyDto } from "./dto/create-counterparty.dto";
import { UpdateCounterpartyDto } from "./dto/update-counterparty.dto";

@ApiTags("counterparties")
@ApiBearerAuth("bearer")
@Controller("counterparties")
export class CounterpartiesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: "Список контрагентов" })
  list(@OrganizationId() orgId: string) {
    return this.prisma.counterparty.findMany({
      where: { organizationId: orgId },
      orderBy: { name: "asc" },
    });
  }

  @Get(":id")
  @ApiOperation({ summary: "Контрагент по id" })
  async getOne(@OrganizationId() orgId: string, @Param("id") id: string) {
    const row = await this.prisma.counterparty.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!row) {
      throw new NotFoundException("Counterparty not found");
    }
    return row;
  }

  @Post()
  @ApiOperation({ summary: "Создать контрагента" })
  create(@OrganizationId() orgId: string, @Body() dto: CreateCounterpartyDto) {
    return this.prisma.counterparty.create({
      data: {
        organizationId: orgId,
        name: dto.name,
        taxId: dto.taxId,
        kind: dto.kind,
        role: dto.role ?? CounterpartyRole.CUSTOMER,
        address: dto.address ?? null,
        email: dto.email?.trim() || null,
        isVatPayer: dto.isVatPayer ?? null,
      },
    });
  }

  @Patch(":id")
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
    return this.prisma.counterparty.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.taxId !== undefined && { taxId: dto.taxId }),
        ...(dto.kind !== undefined && { kind: dto.kind }),
        ...(dto.role !== undefined && { role: dto.role }),
        ...(dto.address !== undefined && { address: dto.address || null }),
        ...(dto.email !== undefined && { email: dto.email?.trim() || null }),
        ...(dto.isVatPayer !== undefined && { isVatPayer: dto.isVatPayer }),
      },
    });
  }
}
