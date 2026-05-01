import { JwtModule, JwtService } from "@nestjs/jwt";
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { InviteStatus, Prisma, UserRole } from "@dayday/database";
import { AuthService } from "../../src/auth/auth.service";
import { AccountsService } from "../../src/accounts/accounts.service";
import { OrgStructureService } from "../../src/hr/org-structure.service";
import { PrismaService } from "../../src/prisma/prisma.service";
import { QuotaService } from "../../src/quota/quota.service";
import { OrganizationsService } from "../../src/organizations/organizations.service";
import { MailService } from "../../src/mail/mail.service";

describe("AuthService invite security (M1)", () => {
  const userId = "cccccccc-cccc-cccc-cccc-cccccccccccc";
  const orgId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

  async function createAuthModule(prisma: object, jwtOverrides?: Partial<JwtService>) {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              JWT_SECRET: "test-jwt-secret-for-auth-spec",
              JWT_REFRESH_SECRET: "test-refresh-secret-for-auth-spec",
              INVITE_TOKEN_SECRET: "invite-secret-test-only",
            }),
          ],
        }),
        JwtModule.register({
          secret: "test-jwt-secret-for-auth-spec",
          signOptions: { expiresIn: "12h" },
        }),
      ],
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: AccountsService, useValue: {} },
        { provide: OrganizationsService, useValue: {} },
        { provide: OrgStructureService, useValue: {} },
        { provide: QuotaService, useValue: {} },
        {
          provide: MailService,
          useValue: { sendMail: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    const auth = moduleRef.get(AuthService);
    const jwt = moduleRef.get(JwtService);
    if (jwtOverrides) {
      Object.assign(jwt, jwtOverrides);
    }
    return { auth, jwt };
  }

  it("acceptInviteByToken: expired JWT → Invite token expired", async () => {
    const prisma = { $transaction: jest.fn() };
    const { auth } = await createAuthModule(prisma, {
      verifyAsync: jest.fn().mockRejectedValue(Object.assign(new Error("jwt expired"), { name: "TokenExpiredError" })),
    });
    await expect(
      auth.acceptInviteByToken(userId, "user@test.com", "any-token"),
    ).rejects.toThrow(UnauthorizedException);
    await expect(
      auth.acceptInviteByToken(userId, "user@test.com", "any-token"),
    ).rejects.toThrow("Invite token expired");
  });

  it("acceptInviteByToken: email mismatch → Forbidden", async () => {
    const prisma = { $transaction: jest.fn() };
    const { auth, jwt } = await createAuthModule(prisma);
    const token = await jwt.signAsync(
      {
        typ: "org-invite",
        inviteId: "inv-1",
        email: "a@test.com",
      },
      { secret: "invite-secret-test-only", expiresIn: "1h" },
    );
    await expect(
      auth.acceptInviteByToken(userId, "b@test.com", token),
    ).rejects.toThrow(ForbiddenException);
  });

  it("acceptInvite: second accept on same invite → Conflict", async () => {
    type InvRow = {
      id: string;
      email: string;
      organizationId: string;
      role: UserRole;
      status: InviteStatus;
    };
    const invites = new Map<string, InvRow>([
      [
        "inv-1",
        {
          id: "inv-1",
          email: "a@test.com",
          organizationId: orgId,
          role: UserRole.USER,
          status: InviteStatus.PENDING,
        },
      ],
    ]);
    const memberships: { userId: string; organizationId: string; role: UserRole }[] = [];

    const prisma = {
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          organizationInvite: {
            findFirst: jest.fn(async ({ where }: { where: { id: string; email: string } }) => {
              const row = invites.get(where.id);
              if (!row || row.email !== where.email) return null;
              return { ...row };
            }),
            updateMany: jest.fn(
              async ({
                where,
              }: {
                where: { id: string; status: InviteStatus };
              }) => {
                const row = invites.get(where.id);
                if (!row || row.status !== InviteStatus.PENDING) {
                  return { count: 0 };
                }
                row.status = InviteStatus.ACCEPTED;
                return { count: 1 };
              },
            ),
            findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
              const row = invites.get(where.id);
              return row ? { ...row } : null;
            }),
          },
          organizationMembership: {
            create: jest.fn(async ({ data }: { data: (typeof memberships)[0] }) => {
              memberships.push(data);
            }),
          },
        };
        return fn(tx);
      }),
    };

    const { auth } = await createAuthModule(prisma);
    await auth.acceptInvite(userId, "a@test.com", "inv-1");
    await expect(auth.acceptInvite(userId, "a@test.com", "inv-1")).rejects.toThrow(
      ConflictException,
    );
    await expect(auth.acceptInvite(userId, "a@test.com", "inv-1")).rejects.toThrow(
      "Invite already accepted",
    );
  });

  it("acceptInvite: duplicate membership (multi-org edge) → Conflict", async () => {
    const invites = new Map<
      string,
      {
        id: string;
        email: string;
        organizationId: string;
        role: UserRole;
        status: InviteStatus;
      }
    >([
      [
        "inv-2",
        {
          id: "inv-2",
          email: "dup@test.com",
          organizationId: orgId,
          role: UserRole.USER,
          status: InviteStatus.PENDING,
        },
      ],
    ]);
    const prisma = {
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          organizationInvite: {
            findFirst: jest.fn(async ({ where }: { where: { id: string; email: string } }) => {
              const row = invites.get(where.id);
              return row && row.email === where.email ? { ...row } : null;
            }),
            updateMany: jest.fn(async () => {
              const row = invites.get("inv-2")!;
              row.status = InviteStatus.ACCEPTED;
              return { count: 1 };
            }),
            findUnique: jest.fn(async ({ where }: { where: { id: string } }) =>
              invites.get(where.id) ? { ...invites.get(where.id)! } : null,
            ),
          },
          organizationMembership: {
            create: jest.fn(async () => {
              throw new Prisma.PrismaClientKnownRequestError("dup", {
                code: "P2002",
                clientVersion: "test",
                meta: {},
              });
            }),
          },
        };
        return fn(tx);
      }),
    };
    const { auth } = await createAuthModule(prisma);
    await expect(auth.acceptInvite(userId, "dup@test.com", "inv-2")).rejects.toThrow(
      ConflictException,
    );
    await expect(auth.acceptInvite(userId, "dup@test.com", "inv-2")).rejects.toThrow(
      "Already a member of this organization",
    );
  });

  it("acceptInvite: unknown invite id → NotFound", async () => {
    const prisma = {
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          organizationInvite: {
            findFirst: jest.fn().mockResolvedValue(null),
            updateMany: jest.fn(),
            findUnique: jest.fn(),
          },
          organizationMembership: { create: jest.fn() },
        };
        return fn(tx);
      }),
    };
    const { auth } = await createAuthModule(prisma);
    await expect(auth.acceptInvite(userId, "x@test.com", "missing")).rejects.toThrow(
      NotFoundException,
    );
  });

  it("stress: 60 parallel revokeInvite calls complete", async () => {
    const updates: string[] = [];
    const prisma = {
      organizationInvite: {
        findFirst: jest.fn(async ({ where: { id } }: { where: { id: string } }) => ({
          id,
          organizationId: orgId,
          status: InviteStatus.PENDING,
        })),
        update: jest.fn(async ({ where: { id } }: { where: { id: string } }) => {
          updates.push(id);
          return { id };
        }),
      },
    };
    const { auth } = await createAuthModule(prisma);
    const ids = Array.from({ length: 60 }, (_, i) => `invite-${i}`);
    await Promise.all(
      ids.map((inviteId) => auth.revokeInvite(orgId, inviteId, UserRole.ADMIN)),
    );
    expect(updates.length).toBe(60);
    expect(new Set(updates).size).toBe(60);
  });
});
