import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { UserRole } from "@dayday/database";
import { PrismaService } from "../prisma/prisma.service";
import { AccessControlService } from "../access/access-control.service";

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessControlService,
  ) {}

  /**
   * Смена `organizations.ownerId`; прежний OWNER → ADMIN, новый пользователь → OWNER.
   */
  async transferOwnership(
    currentUserId: string,
    organizationId: string,
    newOwnerUserId: string,
  ): Promise<{ organizationId: string; ownerId: string }> {
    if (newOwnerUserId === currentUserId) {
      throw new BadRequestException("newOwnerUserId must differ from current user");
    }

    await this.access.assertCurrentUserIsOwner(currentUserId, organizationId);

    const newMembership = await this.prisma.organizationMembership.findUnique({
      where: {
        userId_organizationId: {
          userId: newOwnerUserId,
          organizationId,
        },
      },
    });
    if (!newMembership) {
      throw new NotFoundException(
        "New owner must already be a member of this organization",
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.organization.update({
        where: { id: organizationId },
        data: { ownerId: newOwnerUserId },
      });

      await tx.organizationMembership.update({
        where: {
          userId_organizationId: {
            userId: currentUserId,
            organizationId,
          },
        },
        data: { role: UserRole.ADMIN },
      });

      await tx.organizationMembership.update({
        where: {
          userId_organizationId: {
            userId: newOwnerUserId,
            organizationId,
          },
        },
        data: { role: UserRole.OWNER },
      });
    });

    return { organizationId, ownerId: newOwnerUserId };
  }
}
