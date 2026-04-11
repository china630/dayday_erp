import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  Decimal,
  InventoryAuditStatus,
  Prisma,
  UserRole,
} from "@dayday/database";
import { assertMayPostManualJournal } from "../auth/policies/invoice-finance.policy";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateInventoryAuditDto } from "./dto/create-inventory-audit.dto";
import { InventoryService } from "./inventory.service";

@Injectable()
export class InventoryAuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
  ) {}

  async findAll(organizationId: string) {
    return this.prisma.inventoryAudit.findMany({
      where: { organizationId },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    });
  }

  async findOne(organizationId: string, id: string) {
    const row = await this.prisma.inventoryAudit.findFirst({
      where: { id, organizationId },
    });
    if (!row) {
      throw new NotFoundException("Инвентаризационная опись не найдена");
    }
    return row;
  }

  async create(
    organizationId: string,
    dto: CreateInventoryAuditDto,
    actingUserRole: UserRole,
  ) {
    const itemsJson = dto.items as unknown as Prisma.InputJsonValue;

    if (dto.status === InventoryAuditStatus.DRAFT) {
      return this.prisma.inventoryAudit.create({
        data: {
          organizationId,
          date: new Date(dto.date),
          status: dto.status,
          items: itemsJson,
        },
      });
    }

    if (dto.status === InventoryAuditStatus.APPROVED) {
      assertMayPostManualJournal(actingUserRole);
      return this.approve(organizationId, dto, itemsJson);
    }

    throw new BadRequestException("Unsupported inventory audit status");
  }

  /**
   * Проведение сохранённого черновика (TZ §10.1): одна транзакция, обновление той же записи.
   */
  async approveDraft(
    organizationId: string,
    id: string,
    actingUserRole: UserRole,
  ) {
    const draft = await this.prisma.inventoryAudit.findFirst({
      where: { id, organizationId, status: InventoryAuditStatus.DRAFT },
    });
    if (!draft) {
      throw new NotFoundException("Инвентаризационная опись не найдена");
    }
    assertMayPostManualJournal(actingUserRole);
    const items = draft.items as unknown as CreateInventoryAuditDto["items"];
    const d = draft.date;
    const dateStr = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    const dto: CreateInventoryAuditDto = {
      date: dateStr,
      status: InventoryAuditStatus.APPROVED,
      items,
    };
    const itemsJson = dto.items as unknown as Prisma.InputJsonValue;
    return this.prisma.$transaction(async (tx) => {
      await this.applyApprovedAdjustmentsInTx(tx, organizationId, dto);
      return tx.inventoryAudit.update({
        where: { id },
        data: {
          status: InventoryAuditStatus.APPROVED,
          items: itemsJson,
        },
      });
    });
  }

  /**
   * Проведение описи: все корректировки и запись документа — в одном `prisma.$transaction`.
   * Сначала движения/проводки по строкам; при ошибке на любой строке откат без записи описи.
   */
  private async approve(
    organizationId: string,
    dto: CreateInventoryAuditDto,
    itemsJson: Prisma.InputJsonValue,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.applyApprovedAdjustmentsInTx(tx, organizationId, dto);
      return tx.inventoryAudit.create({
        data: {
          organizationId,
          date: new Date(dto.date),
          status: InventoryAuditStatus.APPROVED,
          items: itemsJson,
        },
      });
    });
  }

  /**
   * Только `tx` (без вложенных `$transaction` в adjustStock).
   */
  private async applyApprovedAdjustmentsInTx(
    tx: Prisma.TransactionClient,
    organizationId: string,
    dto: CreateInventoryAuditDto,
  ): Promise<void> {
    for (const row of dto.items) {
      const stock = await tx.stockItem.findFirst({
        where: {
          organizationId,
          warehouseId: row.warehouseId,
          productId: row.productId,
        },
      });
      const system = stock?.quantity ?? new Decimal(0);
      const fact = new Decimal(row.factQty);
      const delta = fact.sub(system);
      if (delta.abs().lt(new Decimal("0.0001"))) {
        continue;
      }
      if (delta.gt(0)) {
        const unit = Number(stock?.averageCost ?? 0);
        if (unit < 0) {
          throw new BadRequestException(
            `Оприходование: укажите корректную себестоимость для ${row.productId}`,
          );
        }
        await this.inventory.adjustStockInTransaction(tx, organizationId, {
          warehouseId: row.warehouseId,
          productId: row.productId,
          quantity: delta.toNumber(),
          type: "IN",
          inventoryAccountCode: row.inventoryAccountCode,
          unitPrice: unit,
        });
      } else {
        await this.inventory.adjustStockInTransaction(tx, organizationId, {
          warehouseId: row.warehouseId,
          productId: row.productId,
          quantity: delta.abs().toNumber(),
          type: "OUT",
          inventoryAccountCode: row.inventoryAccountCode,
        });
      }
    }
  }
}
