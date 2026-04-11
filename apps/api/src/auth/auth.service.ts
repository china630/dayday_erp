import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import {
  AccessRequestStatus,
  InviteStatus,
  SubscriptionTier,
  syncAzChartForOrganization,
  UserRole,
} from "@dayday/database";
import * as bcrypt from "bcrypt";
import type { Response } from "express";
import { AccountsService } from "../accounts/accounts.service";
import { OrgStructureService } from "../hr/org-structure.service";
import { QuotaService } from "../quota/quota.service";
import { PrismaService } from "../prisma/prisma.service";
import { DEFAULT_NEW_ORGANIZATION_ACTIVE_MODULES } from "../subscription/subscription.constants";
import type { AuthUser } from "./types/auth-user";
import type { CreateOrgDto } from "./dto/create-org.dto";
import type { LoginDto } from "./dto/login.dto";
import type { RegisterOrgDto } from "./dto/register-org.dto";
import type { RegisterUserDto } from "./dto/register-user.dto";

const REFRESH_COOKIE = "refresh_token";

export type PublicUser = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  role: UserRole | null;
  organizationId: string | null;
  isSuperAdmin: boolean;
};

export type OrgSummary = {
  id: string;
  name: string;
  taxId: string;
  currency: string;
  role: UserRole;
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly accounts: AccountsService,
    private readonly orgStructure: OrgStructureService,
    private readonly quota: QuotaService,
  ) {}

  private get refreshSecret(): string {
    return (
      this.config.get<string>("JWT_REFRESH_SECRET") ??
      this.config.getOrThrow<string>("JWT_SECRET")
    );
  }

  setRefreshCookie(res: Response, refreshToken: string): void {
    const maxAgeMs = this.parseDurationToMs(
      this.config.get<string>("JWT_REFRESH_EXPIRES", "7d"),
    );
    res.cookie(REFRESH_COOKIE, refreshToken, {
      httpOnly: true,
      secure: this.config.get<string>("NODE_ENV") === "production",
      sameSite: "lax",
      maxAge: maxAgeMs,
      path: "/",
    });
  }

  clearRefreshCookie(res: Response): void {
    res.clearCookie(REFRESH_COOKIE, { path: "/" });
  }

  private parseDurationToMs(spec: string): number {
    const m = /^(\d+)([dhms])?$/.exec(spec.trim().toLowerCase());
    if (!m) {
      return 7 * 24 * 3600 * 1000;
    }
    const n = Number(m[1]);
    const u = m[2] ?? "s";
    const mult =
      u === "d" ? 86400_000 : u === "h" ? 3600_000 : u === "m" ? 60_000 : 1000;
    return n * mult;
  }

  /** Регистрация только аккаунта (email + ФИО + пароль); организация — через POST /auth/organizations. */
  async registerUser(dto: RegisterUserDto) {
    const email = dto.email.toLowerCase().trim();
    const existing = await this.prisma.user.findUnique({
      where: { email },
    });
    if (existing) {
      throw new ConflictException("Email already registered");
    }
    const fn = dto.firstName.trim();
    const ln = dto.lastName.trim();
    const fullName = [fn, ln].filter(Boolean).join(" ") || null;
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName: fn,
        lastName: ln,
        fullName,
      },
    });
    const tokens = await this.signTokenPairWithoutOrg(user.id);
    const orgs = await this.listOrganizationsForUser(user.id);
    return {
      ...tokens,
      user: this.toPublicUserNoOrg(user),
      organizations: orgs,
    };
  }

  async register(dto: RegisterOrgDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.adminEmail.toLowerCase() },
    });
    if (existing) {
      throw new ConflictException("Email already registered");
    }

    const passwordHash = await bcrypt.hash(dto.adminPassword, 10);
    const fn = dto.adminFirstName.trim();
    const ln = dto.adminLastName.trim();
    const fullName = [fn, ln].filter(Boolean).join(" ") || null;

    const { org, userId } = await this.prisma.$transaction(async (tx) => {
      const o = await tx.organization.create({
        data: {
          name: dto.organizationName.trim(),
          taxId: dto.taxId,
          currency: (dto.currency ?? "AZN").toUpperCase(),
          subscriptionPlan: "mvp",
          activeModules: [...DEFAULT_NEW_ORGANIZATION_ACTIVE_MODULES],
        },
      });
      const demoExpiresAt = new Date();
      demoExpiresAt.setUTCDate(demoExpiresAt.getUTCDate() + 14);

      await tx.organizationSubscription.create({
        data: {
          organizationId: o.id,
          tier: SubscriptionTier.BUSINESS,
          activeModules: [...DEFAULT_NEW_ORGANIZATION_ACTIVE_MODULES],
          isTrial: true,
          expiresAt: demoExpiresAt,
        },
      });
      const u = await tx.user.create({
        data: {
          email: dto.adminEmail.toLowerCase(),
          passwordHash,
          firstName: fn,
          lastName: ln,
          fullName,
        },
      });
      await tx.organizationMembership.create({
        data: {
          userId: u.id,
          organizationId: o.id,
          role: UserRole.OWNER,
        },
      });
      await syncAzChartForOrganization(tx, o.id);
      await this.accounts.bootstrapMultiGaapForNewOrganization(o.id, tx);
      return { org: o, userId: u.id };
    });

    await this.orgStructure.ensureDefaultDepartmentAndPosition(org.id);

    const tokens = await this.signTokenPair(userId, org.id);
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    const orgs = await this.listOrganizationsForUser(userId);
    return {
      ...tokens,
      user: this.toPublicUser(user, org.id, UserRole.OWNER),
      organizations: orgs,
      organization: {
        id: org.id,
        name: org.name,
        taxId: org.taxId,
        currency: org.currency,
      },
    };
  }

  /** Новая организация для уже авторизованного пользователя (роль OWNER). */
  async createOrganizationForExistingUser(userId: string, dto: CreateOrgDto) {
    const dup = await this.prisma.organization.findFirst({
      where: { taxId: dto.taxId.trim() },
    });
    if (dup) {
      throw new ConflictException("VÖEN already registered");
    }

    await this.quota.assertOrganizationsPerUserMembershipLimit(userId);

    const { org } = await this.prisma.$transaction(async (tx) => {
      const o = await tx.organization.create({
        data: {
          name: dto.organizationName.trim(),
          taxId: dto.taxId,
          currency: (dto.currency ?? "AZN").toUpperCase(),
          subscriptionPlan: "mvp",
          activeModules: [...DEFAULT_NEW_ORGANIZATION_ACTIVE_MODULES],
        },
      });
      const demoExpiresAt = new Date();
      demoExpiresAt.setUTCDate(demoExpiresAt.getUTCDate() + 14);

      await tx.organizationSubscription.create({
        data: {
          organizationId: o.id,
          tier: SubscriptionTier.BUSINESS,
          activeModules: [...DEFAULT_NEW_ORGANIZATION_ACTIVE_MODULES],
          isTrial: true,
          expiresAt: demoExpiresAt,
        },
      });
      await tx.organizationMembership.create({
        data: {
          userId,
          organizationId: o.id,
          role: UserRole.OWNER,
        },
      });
      await syncAzChartForOrganization(tx, o.id);
      await this.accounts.bootstrapMultiGaapForNewOrganization(o.id, tx);
      return { org: o };
    });

    await this.orgStructure.ensureDefaultDepartmentAndPosition(org.id);

    const tokens = await this.signTokenPair(userId, org.id);
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    const orgs = await this.listOrganizationsForUser(userId);
    return {
      ...tokens,
      user: this.toPublicUser(user, org.id, UserRole.OWNER),
      organizations: orgs,
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (!user) {
      throw new UnauthorizedException("Invalid credentials");
    }
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException("Invalid credentials");
    }
    const memberships = await this.prisma.organizationMembership.findMany({
      where: { userId: user.id },
      orderBy: { joinedAt: "asc" },
      include: { organization: true },
    });
    const orgs = await this.listOrganizationsForUser(user.id);
    if (memberships.length === 0) {
      const tokens = await this.signTokenPairWithoutOrg(user.id);
      return {
        ...tokens,
        user: this.toPublicUserNoOrg(user),
        organizations: orgs,
      };
    }
    const first = memberships[0];
    const tokens = await this.signTokenPair(user.id, first.organizationId);
    return {
      ...tokens,
      user: this.toPublicUser(user, first.organizationId, first.role),
      organizations: orgs,
    };
  }

  async refreshFromCookie(refreshToken: string | undefined) {
    if (!refreshToken?.length) {
      throw new UnauthorizedException("Missing refresh token");
    }
    let payload: {
      sub: string;
      typ?: string;
      organizationId?: string | null;
    };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: this.refreshSecret,
      });
    } catch {
      throw new UnauthorizedException("Invalid refresh token");
    }
    if (payload.typ !== "refresh") {
      throw new UnauthorizedException("Invalid refresh token");
    }
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user) {
      throw new UnauthorizedException("User not found");
    }

    const orgIdFromPayload = payload.organizationId;

    if (orgIdFromPayload) {
      const m = await this.prisma.organizationMembership.findUnique({
        where: {
          userId_organizationId: {
            userId: user.id,
            organizationId: orgIdFromPayload,
          },
        },
      });
      if (!m) {
        throw new UnauthorizedException("Organization access revoked");
      }
      const tokens = await this.signTokenPair(user.id, orgIdFromPayload);
      const orgs = await this.listOrganizationsForUser(user.id);
      return {
        ...tokens,
        user: this.toPublicUser(user, orgIdFromPayload, m.role),
        organizations: orgs,
      };
    }

    const first = await this.prisma.organizationMembership.findFirst({
      where: { userId: user.id },
      orderBy: { joinedAt: "asc" },
    });
    if (first) {
      const tokens = await this.signTokenPair(user.id, first.organizationId);
      const orgs = await this.listOrganizationsForUser(user.id);
      return {
        ...tokens,
        user: this.toPublicUser(user, first.organizationId, first.role),
        organizations: orgs,
      };
    }

    const tokens = await this.signTokenPairWithoutOrg(user.id);
    const orgs = await this.listOrganizationsForUser(user.id);
    return {
      ...tokens,
      user: this.toPublicUserNoOrg(user),
      organizations: orgs,
    };
  }

  async switchOrganization(userId: string, organizationId: string) {
    const m = await this.prisma.organizationMembership.findUnique({
      where: {
        userId_organizationId: { userId, organizationId },
      },
    });
    if (!m) {
      throw new ForbiddenException("Not a member of this organization");
    }
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    const tokens = await this.signTokenPair(userId, organizationId);
    const orgs = await this.listOrganizationsForUser(userId);
    return {
      ...tokens,
      user: this.toPublicUser(user, organizationId, m.role),
      organizations: orgs,
    };
  }

  async me(
    userId: string,
    organizationId: string | null,
    role: UserRole | null,
  ) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    const orgs = await this.listOrganizationsForUser(userId);
    if (!organizationId || role == null) {
      return {
        user: this.toPublicUserNoOrg(user),
        organizations: orgs,
      };
    }
    return {
      user: this.toPublicUser(user, organizationId, role),
      organizations: orgs,
    };
  }

  private async listOrganizationsForUser(userId: string): Promise<OrgSummary[]> {
    const rows = await this.prisma.organizationMembership.findMany({
      where: { userId },
      orderBy: { joinedAt: "asc" },
      include: { organization: true },
    });
    return rows.map((r) => ({
      id: r.organization.id,
      name: r.organization.name,
      taxId: r.organization.taxId,
      currency: r.organization.currency,
      role: r.role,
    }));
  }

  private toPublicUser(
    user: {
      id: string;
      email: string;
      firstName: string | null;
      lastName: string | null;
      fullName: string | null;
      avatarUrl: string | null;
      isSuperAdmin?: boolean;
    },
    organizationId: string,
    role: UserRole,
  ): PublicUser {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName ?? null,
      lastName: user.lastName ?? null,
      fullName: user.fullName ?? null,
      avatarUrl: user.avatarUrl ?? null,
      role,
      organizationId,
      isSuperAdmin: Boolean(user.isSuperAdmin),
    };
  }

  private toPublicUserNoOrg(user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    fullName: string | null;
    avatarUrl: string | null;
    isSuperAdmin?: boolean;
  }): PublicUser {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName ?? null,
      lastName: user.lastName ?? null,
      fullName: user.fullName ?? null,
      avatarUrl: user.avatarUrl ?? null,
      role: null,
      organizationId: null,
      isSuperAdmin: Boolean(user.isSuperAdmin),
    };
  }

  /** Сессия без контекста организации (создание компании через POST /auth/organizations). */
  private async signTokenPairWithoutOrg(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      email: user.email,
      organizationId: null,
      role: null,
    });
    const refreshToken = await this.jwt.signAsync(
      { sub: user.id, typ: "refresh", organizationId: null },
      {
        secret: this.refreshSecret,
        expiresIn: (this.config.get<string>("JWT_REFRESH_EXPIRES") ?? "7d") as any,
      },
    );
    return { accessToken, refreshToken };
  }

  private async signTokenPair(userId: string, organizationId: string) {
    const m = await this.prisma.organizationMembership.findUnique({
      where: {
        userId_organizationId: { userId, organizationId },
      },
    });
    if (!m) {
      throw new UnauthorizedException("Invalid organization context");
    }
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      email: user.email,
      organizationId,
      role: m.role,
    });
    const refreshToken = await this.jwt.signAsync(
      { sub: user.id, typ: "refresh", organizationId },
      {
        secret: this.refreshSecret,
        expiresIn: (this.config.get<string>("JWT_REFRESH_EXPIRES") ?? "7d") as any,
      },
    );
    return { accessToken, refreshToken };
  }

  async validateUserForJwtPayload(payload: {
    sub: string;
    email: string;
    organizationId: string | null;
    role: UserRole | null;
  }): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user) {
      throw new UnauthorizedException();
    }
    if (!payload.organizationId) {
      return {
        userId: user.id,
        email: user.email,
        organizationId: null,
        role: null,
        isSuperAdmin: Boolean(user.isSuperAdmin),
      };
    }
    const m = await this.prisma.organizationMembership.findUnique({
      where: {
        userId_organizationId: {
          userId: payload.sub,
          organizationId: payload.organizationId,
        },
      },
    });
    if (!m) {
      throw new UnauthorizedException();
    }
    /** Роль из БД — источник истины (смена OWNER↔ADMIN, transfer ownership без немедленного обновления JWT). */
    return {
      userId: user.id,
      email: user.email,
      organizationId: payload.organizationId,
      role: m.role,
      isSuperAdmin: Boolean(user.isSuperAdmin),
    };
  }

  /**
   * Супер-админ: выдать токены от имени другого пользователя (поддержка).
   */
  async impersonate(superAdminUserId: string, targetUserId: string) {
    const admin = await this.prisma.user.findUnique({
      where: { id: superAdminUserId },
    });
    if (!admin?.isSuperAdmin) {
      throw new ForbiddenException();
    }
    if (targetUserId === superAdminUserId) {
      throw new BadRequestException("Cannot impersonate yourself");
    }
    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
    });
    if (!target) {
      throw new NotFoundException("User not found");
    }
    const memberships = await this.prisma.organizationMembership.findMany({
      where: { userId: targetUserId },
      orderBy: { joinedAt: "asc" },
      include: { organization: true },
    });
    if (memberships.length === 0) {
      throw new BadRequestException("Target user has no organization membership");
    }
    const first = memberships[0];
    const tokens = await this.signTokenPair(targetUserId, first.organizationId);
    const orgs = await this.listOrganizationsForUser(targetUserId);
    return {
      ...tokens,
      user: this.toPublicUser(target, first.organizationId, first.role),
      organizations: orgs,
    };
  }

  /** Запрос на вступление в организацию по VÖEN (организация уже существует). */
  async requestJoinByTaxId(userId: string, taxId: string, message?: string) {
    const normalized = taxId.trim();
    if (!normalized) {
      throw new BadRequestException("taxId required");
    }
    const org = await this.prisma.organization.findFirst({
      where: { taxId: normalized },
    });
    if (!org) {
      throw new NotFoundException("Organization not found for this VÖEN");
    }
    const existing = await this.prisma.organizationMembership.findUnique({
      where: {
        userId_organizationId: { userId, organizationId: org.id },
      },
    });
    if (existing) {
      throw new ConflictException("Already a member of this organization");
    }
    const pending = await this.prisma.accessRequest.findFirst({
      where: {
        organizationId: org.id,
        requesterId: userId,
        status: AccessRequestStatus.PENDING,
      },
    });
    if (pending) {
      throw new ConflictException("Access request already pending");
    }
    return this.prisma.accessRequest.create({
      data: {
        organizationId: org.id,
        requesterId: userId,
        message: message?.trim() || null,
      },
    });
  }

  async listPendingAccessRequests(organizationId: string) {
    return this.prisma.accessRequest.findMany({
      where: {
        organizationId,
        status: AccessRequestStatus.PENDING,
      },
      orderBy: { createdAt: "asc" },
      include: {
        requester: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            fullName: true,
          },
        },
      },
    });
  }

  async decideAccessRequest(
    organizationId: string,
    requestId: string,
    actorUserId: string,
    actorRole: UserRole,
    accept: boolean,
    assignRole: UserRole = UserRole.USER,
  ) {
    if (actorRole !== UserRole.OWNER && actorRole !== UserRole.ADMIN) {
      throw new ForbiddenException();
    }
    const req = await this.prisma.accessRequest.findFirst({
      where: { id: requestId, organizationId },
    });
    if (!req || req.status !== AccessRequestStatus.PENDING) {
      throw new NotFoundException("Request not found");
    }
    await this.prisma.$transaction(async (tx) => {
      if (accept) {
        await tx.organizationMembership.create({
          data: {
            userId: req.requesterId,
            organizationId,
            role: assignRole,
          },
        });
        await tx.accessRequest.update({
          where: { id: requestId },
          data: {
            status: AccessRequestStatus.ACCEPTED,
            decidedAt: new Date(),
            decidedByUserId: actorUserId,
          },
        });
      } else {
        await tx.accessRequest.update({
          where: { id: requestId },
          data: {
            status: AccessRequestStatus.DECLINED,
            decidedAt: new Date(),
            decidedByUserId: actorUserId,
          },
        });
      }
    });
    return { ok: true };
  }

  async createInvite(
    organizationId: string,
    email: string,
    role: UserRole,
    invitedByUserId: string,
  ) {
    const norm = email.toLowerCase().trim();
    const existingUser = await this.prisma.user.findUnique({
      where: { email: norm },
    });
    if (existingUser) {
      const mem = await this.prisma.organizationMembership.findUnique({
        where: {
          userId_organizationId: {
            userId: existingUser.id,
            organizationId,
          },
        },
      });
      if (mem) {
        throw new ConflictException("User already in organization");
      }
    }
    const dup = await this.prisma.organizationInvite.findFirst({
      where: {
        organizationId,
        email: norm,
        status: InviteStatus.PENDING,
      },
    });
    if (dup) {
      throw new ConflictException("Invite already pending");
    }
    return this.prisma.organizationInvite.create({
      data: {
        organizationId,
        email: norm,
        role,
        invitedByUserId,
      },
    });
  }

  async listInvitesForUser(userEmail: string) {
    const norm = userEmail.toLowerCase();
    return this.prisma.organizationInvite.findMany({
      where: {
        email: norm,
        status: InviteStatus.PENDING,
      },
      include: { organization: { select: { id: true, name: true, taxId: true } } },
    });
  }

  async acceptInvite(userId: string, userEmail: string, inviteId: string) {
    const norm = userEmail.toLowerCase();
    const inv = await this.prisma.organizationInvite.findFirst({
      where: {
        id: inviteId,
        email: norm,
        status: InviteStatus.PENDING,
      },
    });
    if (!inv) {
      throw new NotFoundException("Invite not found");
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.organizationMembership.create({
        data: {
          userId,
          organizationId: inv.organizationId,
          role: inv.role,
        },
      });
      await tx.organizationInvite.update({
        where: { id: inv.id },
        data: { status: InviteStatus.ACCEPTED, decidedAt: new Date() },
      });
    });
    return { ok: true };
  }

  async listMembers(organizationId: string) {
    return this.prisma.organizationMembership.findMany({
      where: { organizationId },
      orderBy: { joinedAt: "asc" },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            fullName: true,
            avatarUrl: true,
          },
        },
      },
    });
  }

  async removeMember(
    organizationId: string,
    targetUserId: string,
    actorUserId: string,
    actorRole: UserRole,
  ) {
    if (actorRole !== UserRole.OWNER && actorRole !== UserRole.ADMIN) {
      throw new ForbiddenException();
    }
    if (targetUserId === actorUserId) {
      throw new BadRequestException("Cannot remove yourself");
    }
    const target = await this.prisma.organizationMembership.findUnique({
      where: {
        userId_organizationId: {
          userId: targetUserId,
          organizationId,
        },
      },
    });
    if (!target) {
      throw new NotFoundException("Member not found");
    }
    if (target.role === UserRole.OWNER) {
      throw new ForbiddenException("Cannot remove owner");
    }
    await this.prisma.organizationMembership.delete({
      where: {
        userId_organizationId: {
          userId: targetUserId,
          organizationId,
        },
      },
    });
    return { ok: true };
  }
}
