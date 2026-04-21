import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@dayday/database";
import { PrismaService } from "../prisma/prisma.service";
import { CreateFixedAssetDto } from "./dto/create-fixed-asset.dto";
import { UpdateFixedAssetDto } from "./dto/update-fixed-asset.dto";

const Decimal = Prisma.Decimal;

@Injectable()
export class FixedAssetsService {
  constructor(private readonly prisma: PrismaService) {}

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
    const salvage = new Decimal(dto.salvageValue ?? 0);
    const initial = new Decimal(dto.initialCost);
    if (salvage.gte(initial)) {
      throw new ConflictException("salvageValue must be less than initialCost");
    }
    try {
      return await this.prisma.fixedAsset.create({
        data: {
          organizationId,
          name: dto.name.trim(),
          inventoryNumber: dto.inventoryNumber.trim(),
          commissioningDate: new Date(dto.commissioningDate),
          initialCost: initial,
          usefulLifeMonths: dto.usefulLifeMonths,
          salvageValue: salvage,
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
    if (dto.commissioningDate != null) {
      data.commissioningDate = new Date(dto.commissioningDate);
    }
    if (dto.initialCost != null) data.initialCost = new Decimal(dto.initialCost);
    if (dto.usefulLifeMonths != null) data.usefulLifeMonths = dto.usefulLifeMonths;
    if (dto.salvageValue != null) data.salvageValue = new Decimal(dto.salvageValue);
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
}
