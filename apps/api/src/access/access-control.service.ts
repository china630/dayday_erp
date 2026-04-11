import {
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { UserRole } from "@dayday/database";
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
}
