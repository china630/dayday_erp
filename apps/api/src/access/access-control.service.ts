import {
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { HoldingAccessRole, UserRole } from "@dayday/database";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Централизованные проверки доступа (v10.3): биллинг, смена владельца и т.д.
 */
@Injectable()
export class AccessControlService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Раздел биллинга / подписки (оплата, смена плана, модули) — только OWNER.
   */
  async assertOwnerForBilling(
    userId: string,
    organizationId: string,
  ): Promise<void> {
    const membership = await this.prisma.organizationMembership.findUnique({
      where: {
        userId_organizationId: { userId, organizationId },
      },
    });
    if (!membership || membership.role !== UserRole.OWNER) {
      throw new ForbiddenException({
        code: "BILLING_OWNER_ONLY",
        message: "Billing is only available to the organization owner.",
      });
    }
  }

  /**
   * Смена владельца — инициатор должен быть OWNER текущей организации.
   */
  async assertCurrentUserIsOwner(
    userId: string,
    organizationId: string,
  ): Promise<void> {
    await this.assertOwnerForBilling(userId, organizationId);
  }

  /**
   * Проведение учёта / касса / банк — не ниже бухгалтера (OWNER, ADMIN, ACCOUNTANT).
   */
  async assertMayPostAccounting(
    userId: string,
    organizationId: string,
  ): Promise<void> {
    const membership = await this.prisma.organizationMembership.findUnique({
      where: {
        userId_organizationId: { userId, organizationId },
      },
    });
    if (
      !membership ||
      (membership.role !== UserRole.OWNER &&
        membership.role !== UserRole.ADMIN &&
        membership.role !== UserRole.ACCOUNTANT)
    ) {
      throw new ForbiddenException({
        code: "ACCOUNTING_ROLE_REQUIRED",
        message:
          "This action requires organization role OWNER, ADMIN, or ACCOUNTANT.",
      });
    }
  }

  /**
   * Просмотр отчётности по холдингу — владелец холдинга или участник с ролью не ниже ACCOUNTANT.
   */
  async assertMayViewHoldingReports(
    userId: string,
    holdingId: string,
  ): Promise<void> {
    const holding = await this.prisma.holding.findFirst({
      where: { id: holdingId, isDeleted: false },
      select: { ownerId: true },
    });
    if (!holding) {
      throw new ForbiddenException({
        code: "HOLDING_NOT_FOUND",
        message: "Holding not found.",
      });
    }
    if (holding.ownerId === userId) {
      return;
    }
    const m = await this.prisma.holdingMembership.findUnique({
      where: {
        userId_holdingId: { userId, holdingId },
      },
    });
    if (
      m &&
      (m.role === HoldingAccessRole.OWNER ||
        m.role === HoldingAccessRole.ADMIN ||
        m.role === HoldingAccessRole.ACCOUNTANT)
    ) {
      return;
    }
    throw new ForbiddenException({
      code: "HOLDING_ACCESS_DENIED",
      message: "No access to this holding.",
    });
  }
}
