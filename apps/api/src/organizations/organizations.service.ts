import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  CoaTemplateProfile,
  UserRole,
  provisionNasAccountsForOrganization,
  type Prisma,
} from "@dayday/database";
import { AccountsService } from "../accounts/accounts.service";
import { PrismaService } from "../prisma/prisma.service";
import { AccessControlService } from "../access/access-control.service";

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessControlService,
    private readonly accounts: AccountsService,
  ) {}

  /**
   * Копирует глобальный NAS (`template_accounts`, иначе legacy `chart_of_accounts_entries`) в
   * `accounts` организации по профилю Small/Full, затем Multi-GAAP bootstrap. Вызывать в той же
   * `prisma.$transaction`, что и `organization.create`.
   */
  async provisionChartOfAccountsFromTemplate(
    tx: Prisma.TransactionClient,
    organizationId: string,
    profile: CoaTemplateProfile = CoaTemplateProfile.COMMERCIAL_FULL,
  ): Promise<void> {
    await provisionNasAccountsForOrganization(tx, organizationId, profile);
    await this.accounts.bootstrapMultiGaapForNewOrganization(organizationId, tx);
  }

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

  async getOrganizationsTreeForUser(userId: string) {
    const memberships = await this.prisma.organizationMembership.findMany({
      where: { userId },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            taxId: true,
            currency: true,
            holdingId: true,
            holding: { select: { id: true, name: true, baseCurrency: true } },
          },
        },
      },
      orderBy: { joinedAt: "asc" },
    });

    const free: Array<{
      id: string;
      name: string;
      taxId: string;
      currency: string;
    }> = [];

    const byHolding = new Map<
      string,
      {
        holdingId: string;
        holdingName: string;
        baseCurrency: string;
        organizations: typeof free;
      }
    >();

    for (const m of memberships) {
      const o = m.organization;
      if (!o.holdingId || !o.holding) {
        free.push({
          id: o.id,
          name: o.name,
          taxId: o.taxId,
          currency: o.currency,
        });
        continue;
      }
      const h = o.holding;
      const key = h.id;
      const cur =
        byHolding.get(key) ??
        {
          holdingId: h.id,
          holdingName: h.name,
          baseCurrency: (h.baseCurrency ?? "AZN").toUpperCase(),
          organizations: [],
        };
      cur.organizations.push({
        id: o.id,
        name: o.name,
        taxId: o.taxId,
        currency: o.currency,
      });
      byHolding.set(key, cur);
    }

    const holdings = [...byHolding.values()].sort((a, b) =>
      a.holdingName.localeCompare(b.holdingName),
    );

    free.sort((a, b) => a.name.localeCompare(b.name));

    return { holdings, freeOrganizations: free };
  }
}
