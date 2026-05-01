import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@dayday/database";
import { Roles } from "../auth/decorators/roles.decorator";
import { RolesGuard } from "../auth/guards/roles.guard";
import { OrganizationId } from "../common/org-id.decorator";
import { PrismaService } from "../prisma/prisma.service";
import { CreateProductDto } from "./dto/create-product.dto";
import { UpdateProductDto } from "./dto/update-product.dto";

@ApiTags("products")
@ApiBearerAuth("bearer")
@Controller("products")
@UseGuards(RolesGuard)
export class ProductsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: "Список товаров" })
  list(
    @OrganizationId() orgId: string,
    @Query("isService") isService?: string,
  ) {
    return this.prisma.product.findMany({
      where: {
        organizationId: orgId,
        ...(isService === "false" ? { isService: false } : {}),
        ...(isService === "true" ? { isService: true } : {}),
      },
      orderBy: { name: "asc" },
    });
  }

  @Get(":id")
  @ApiOperation({ summary: "Товар по id" })
  async getOne(@OrganizationId() orgId: string, @Param("id") id: string) {
    const row = await this.prisma.product.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!row) {
      throw new NotFoundException("Product not found");
    }
    return row;
  }

  @Post()
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: "Создать товар или услугу" })
  async create(@OrganizationId() orgId: string, @Body() dto: CreateProductDto) {
    const isService = dto.isService ?? false;
    let sku = (dto.sku ?? "").trim();
    if (!isService) {
      if (!sku) {
        throw new BadRequestException("sku is required for goods");
      }
    } else if (!sku) {
      for (let attempt = 0; attempt < 12; attempt++) {
        const candidate = `SVC-${randomUUID().replace(/-/g, "").slice(0, 16)}`;
        const clash = await this.prisma.product.findFirst({
          where: { organizationId: orgId, sku: candidate },
          select: { id: true },
        });
        if (!clash) {
          sku = candidate;
          break;
        }
      }
      if (!sku) {
        throw new BadRequestException("Could not allocate internal SKU for service");
      }
    }

    return this.prisma.product.create({
      data: {
        organizationId: orgId,
        name: dto.name,
        sku,
        price: dto.price,
        vatRate: dto.vatRate,
        isService,
      },
    });
  }

  @Patch(":id")
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: "Обновить товар" })
  async update(
    @OrganizationId() orgId: string,
    @Param("id") id: string,
    @Body() dto: UpdateProductDto,
  ) {
    const existing = await this.prisma.product.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!existing) {
      throw new NotFoundException("Product not found");
    }
    return this.prisma.product.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.sku !== undefined && { sku: dto.sku }),
        ...(dto.price !== undefined && { price: dto.price }),
        ...(dto.vatRate !== undefined && { vatRate: dto.vatRate }),
        ...(dto.isService !== undefined && { isService: dto.isService }),
      },
    });
  }
}
