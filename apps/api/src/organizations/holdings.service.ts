import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { HoldingAccessRole, UserRole } from "@dayday/database";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateHoldingDto } from "./dto/create-holding.dto";
import type { UpdateHoldingDto } from "./dto/update-holding.dto";

@Injectable()
export class HoldingsService {
  constructor(private readonly prisma: PrismaService) {}

  async createHolding(ownerUserId: string, dto: CreateHoldingDto) {
    const base =
      dto.baseCurrency?.trim().toUpperCase() === "USD" ||
      dto.baseCurrency?.trim().toUpperCase() === "EUR"
        ? dto.baseCurrency.trim().toUpperCase()
        : "AZN";
    return this.prisma.holding.create({
      data: {
        name: dto.name.trim(),
        ownerId: ownerUserId,
        baseCurrency: base,
      },
    });
  }

  /** Холдинги, где пользователь владелец или участник. */
  async findAllHoldingsForUser(userId: string) {
    return this.prisma.holding.findMany({
      where: {
        OR: [{ ownerId: userId }, { memberships: { some: { userId } } }],
      },
      include: { organizations: { where: { isDeleted: false } } },
      orderBy: { createdAt: "desc" },
    });
  }

  /** Доступ на чтение: владелец или любой участник. */
  async findOneHoldingForAccess(userId: string, id: string) {
    const holding = await this.prisma.holding.findFirst({
      where: {
        id,
        OR: [{ ownerId: userId }, { memberships: { some: { userId } } }],
      },
      include: { organizations: { where: { isDeleted: false } } },
    });
    if (!holding) {
      throw new NotFoundException(`Holding with ID ${id} not found`);
    }
    return holding;
  }

  /** Только владелец (редактирование, отчёты по умолчанию в старом API). */
  async findOneHoldingAsOwner(ownerUserId: string, id: string) {
    const holding = await this.prisma.holding.findFirst({
      where: { id, ownerId: ownerUserId },
      include: { organizations: { where: { isDeleted: false } } },
    });
    if (!holding) {
      throw new NotFoundException(`Holding with ID ${id} not found`);
    }
    return holding;
  }

  async updateHolding(ownerUserId: string, id: string, dto: UpdateHoldingDto) {
    await this.assertHoldingOwner(ownerUserId, id);
    try {
      return await this.prisma.holding.update({
        where: { id },
        data: {
          ...(dto.name != null && dto.name !== "" && { name: dto.name.trim() }),
          ...(dto.baseCurrency != null &&
            dto.baseCurrency !== "" && {
              baseCurrency: ["USD", "EUR", "AZN"].includes(
                dto.baseCurrency.trim().toUpperCase(),
              )
                ? dto.baseCurrency.trim().toUpperCase()
                : "AZN",
            }),
        },
      });
    } catch {
      throw new NotFoundException(`Holding with ID ${id} not found`);
    }
  }

  async deleteHolding(ownerUserId: string, id: string) {
    await this.assertHoldingOwner(ownerUserId, id);
    try {
      return await this.prisma.holding.update({
        where: { id },
        data: { isDeleted: true, deletedAt: new Date() },
      });
    } catch {
      throw new NotFoundException(`Holding with ID ${id} not found`);
    }
  }

  async addOrganizationToHolding(
    ownerUserId: string,
    holdingId: string,
    organizationId: string,
  ) {
    await this.assertHoldingOwner(ownerUserId, holdingId);
    await this.assertUserIsOrganizationOwner(ownerUserId, organizationId);
    return this.prisma.organization.update({
      where: { id: organizationId },
      data: { holding: { connect: { id: holdingId } } },
    });
  }

  async removeOrganizationFromHolding(
    ownerUserId: string,
    holdingId: string,
    organizationId: string,
  ) {
    await this.assertHoldingOwner(ownerUserId, holdingId);
    const org = await this.prisma.organization.findFirst({
      where: { id: organizationId, holdingId },
    });
    if (!org) {
      throw new BadRequestException(
        "Organization is not linked to this holding",
      );
    }
    await this.assertUserIsOrganizationOwner(ownerUserId, organizationId);
    return this.prisma.organization.update({
      where: { id: organizationId },
      data: { holding: { disconnect: true } },
    });
  }

  async listMembers(ownerUserId: string, holdingId: string) {
    await this.assertHoldingOwner(ownerUserId, holdingId);
    return this.prisma.holdingMembership.findMany({
      where: { holdingId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            fullName: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });
  }

  async addMember(
    ownerUserId: string,
    holdingId: string,
    userId: string,
    role: HoldingAccessRole,
  ) {
    await this.assertHoldingOwner(ownerUserId, holdingId);
    const h = await this.prisma.holding.findUniqueOrThrow({
      where: { id: holdingId },
    });
    if (userId === h.ownerId) {
      throw new BadRequestException("Owner already has full access; use another user");
    }
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u) throw new NotFoundException("User not found");
    try {
      return await this.prisma.holdingMembership.create({
        data: { userId, holdingId, role },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });
    } catch {
      throw new ConflictException("User is already a member of this holding");
    }
  }

  async updateMemberRole(
    ownerUserId: string,
    holdingId: string,
    memberUserId: string,
    role: HoldingAccessRole,
  ) {
    await this.assertHoldingOwner(ownerUserId, holdingId);
    const h = await this.prisma.holding.findUniqueOrThrow({
      where: { id: holdingId },
    });
    if (memberUserId === h.ownerId) {
      throw new BadRequestException("Cannot change role of the holding owner");
    }
    try {
      return await this.prisma.holdingMembership.update({
        where: {
          userId_holdingId: { userId: memberUserId, holdingId },
        },
        data: { role },
        include: {
          user: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
        },
      });
    } catch {
      throw new NotFoundException("Membership not found");
    }
  }

  async removeMember(
    ownerUserId: string,
    holdingId: string,
    memberUserId: string,
  ) {
    await this.assertHoldingOwner(ownerUserId, holdingId);
    const h = await this.prisma.holding.findUniqueOrThrow({
      where: { id: holdingId },
    });
    if (memberUserId === h.ownerId) {
      throw new BadRequestException("Cannot remove the holding owner");
    }
    try {
      await this.prisma.holdingMembership.delete({
        where: {
          userId_holdingId: { userId: memberUserId, holdingId },
        },
      });
      return { ok: true };
    } catch {
      throw new NotFoundException("Membership not found");
    }
  }

  private async assertHoldingOwner(ownerUserId: string, holdingId: string) {
    const h = await this.prisma.holding.findFirst({
      where: { id: holdingId, ownerId: ownerUserId },
    });
    if (!h) {
      throw new NotFoundException(`Holding with ID ${holdingId} not found`);
    }
  }

  private async assertUserIsOrganizationOwner(
    userId: string,
    organizationId: string,
  ) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { ownerId: true },
    });
    if (org?.ownerId === userId) return;
    const m = await this.prisma.organizationMembership.findFirst({
      where: { organizationId, userId, role: UserRole.OWNER },
    });
    if (!m) {
      throw new ForbiddenException(
        "Organization not found or you are not the organization owner",
      );
    }
  }
}
