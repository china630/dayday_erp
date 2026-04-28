import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
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
  list(@OrganizationId() orgId: string) {
    return this.prisma.product.findMany({
      where: { organizationId: orgId },
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
  @ApiOperation({ summary: "Создать товар" })
  create(@OrganizationId() orgId: string, @Body() dto: CreateProductDto) {
    return this.prisma.product.create({
      data: {
        organizationId: orgId,
        name: dto.name,
        sku: dto.sku,
        price: dto.price,
        vatRate: dto.vatRate,
        isService: dto.isService ?? false,
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
