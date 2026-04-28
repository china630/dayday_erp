import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@dayday/database";
import { PrismaService } from "../prisma/prisma.service";
import { CreateFixedAssetDto } from "./dto/create-fixed-asset.dto";
import { UpdateFixedAssetDto } from "./dto/update-fixed-asset.dto";
import { DepreciationService } from "./depreciation.service";

const Decimal = Prisma.Decimal;

@Injectable()
export class FixedAssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly depreciation: DepreciationService,
  ) {}

  list(organizationId: string) {
    return this.prisma.fixedAsset.findMany({
      where: { organizationId },
      orderBy: [{ inventoryNumber: "asc" }],
    });
  }

  async getOne(organizationId: string, id: string) {
    const row = await this.prisma.fixedAsset.findFirst({
      where: { id, organizationId },
    });
    if (!row) throw new NotFoundException("Fixed asset not found");
    return row;
  }

  async create(organizationId: string, dto: CreateFixedAssetDto) {
    const purchaseDateRaw = dto.purchaseDate ?? dto.commissioningDate;
    const purchasePriceRaw = dto.purchasePrice ?? dto.initialCost;
    if (!purchaseDateRaw) {
      throw new BadRequestException("purchaseDate is required");
    }
    if (purchasePriceRaw == null) {
      throw new BadRequestException("purchasePrice is required");
    }
    const salvage = new Decimal(dto.salvageValue ?? 0);
    const initial = new Decimal(purchasePriceRaw);
    if (salvage.gte(initial)) {
      throw new ConflictException("salvageValue must be less than purchasePrice");
    }
    try {
      return await this.prisma.fixedAsset.create({
        data: {
          organizationId,
          name: dto.name.trim(),
          inventoryNumber: dto.inventoryNumber.trim(),
          purchaseDate: new Date(purchaseDateRaw),
          purchasePrice: initial,
          usefulLifeMonths: dto.usefulLifeMonths,
          salvageValue: salvage,
          status: dto.status,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw new ConflictException("Инвентарный номер уже занят");
      }
      throw e;
    }
  }

  async update(organizationId: string, id: string, dto: UpdateFixedAssetDto) {
    await this.getOne(organizationId, id);
    const data: Record<string, unknown> = {};
    if (dto.name != null) data.name = dto.name.trim();
    if (dto.inventoryNumber != null) data.inventoryNumber = dto.inventoryNumber.trim();
    const purchaseDateRaw = dto.purchaseDate ?? dto.commissioningDate;
    if (purchaseDateRaw != null) {
      data.purchaseDate = new Date(purchaseDateRaw);
    }
    const purchasePriceRaw = dto.purchasePrice ?? dto.initialCost;
    if (purchasePriceRaw != null) data.purchasePrice = new Decimal(purchasePriceRaw);
    if (dto.usefulLifeMonths != null) data.usefulLifeMonths = dto.usefulLifeMonths;
    if (dto.salvageValue != null) data.salvageValue = new Decimal(dto.salvageValue);
    if (dto.status != null) data.status = dto.status;
    try {
      return await this.prisma.fixedAsset.update({
        where: { id },
        data,
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw new ConflictException("Инвентарный номер уже занят");
      }
      throw e;
    }
  }

  async remove(organizationId: string, id: string) {
    await this.getOne(organizationId, id);
    try {
      await this.prisma.fixedAsset.delete({ where: { id } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
        throw new ConflictException("Нельзя удалить: есть начисления амортизации");
      }
      throw e;
    }
  }

  async runMonthlyDepreciation(
    organizationId: string,
    period: { year: number; month: number },
  ) {
    if (period.year < 1900 || period.year > 2100) {
      throw new ConflictException("year must be in range 1900-2100");
    }
    if (period.month < 1 || period.month > 12) {
      throw new ConflictException("month must be in range 1-12");
    }
    return this.prisma.$transaction((tx) =>
      this.depreciation.runMonthlyDepreciation(
        tx,
        organizationId,
        period.year,
        period.month,
      ),
    );
  }
}
