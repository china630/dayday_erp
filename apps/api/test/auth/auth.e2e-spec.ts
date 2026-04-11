import { JwtModule, JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import * as bcrypt from "bcrypt";
import { UserRole } from "@dayday/database";
import { AuthService } from "../../src/auth/auth.service";
import { AccountsService } from "../../src/accounts/accounts.service";
import { OrgStructureService } from "../../src/hr/org-structure.service";
import { PrismaService } from "../../src/prisma/prisma.service";
import { QuotaService } from "../../src/quota/quota.service";

describe("AuthService (JWT: login + switch-org)", () => {
  const orgA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const orgB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  const userId = "cccccccc-cccc-cccc-cccc-cccccccccccc";

  async function createAuthModule(prisma: object) {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              JWT_SECRET: "test-jwt-secret-for-auth-spec",
              JWT_REFRESH_SECRET: "test-refresh-secret-for-auth-spec",
            }),
          ],
        }),
        JwtModule.register({
          secret: "test-jwt-secret-for-auth-spec",
          signOptions: { expiresIn: "15m" },
        }),
      ],
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: AccountsService, useValue: {} },
        { provide: OrgStructureService, useValue: {} },
        { provide: QuotaService, useValue: {} },
      ],
    }).compile();

    return {
      auth: moduleRef.get(AuthService),
      jwt: moduleRef.get(JwtService),
    };
  }

  it("login: access token содержит organizationId первой организации", async () => {
    const hash = await bcrypt.hash("pass123", 4);
    const orgRow = {
      organizationId: orgA,
      role: UserRole.OWNER,
      joinedAt: new Date(),
      organization: {
        id: orgA,
        name: "Org A",
        taxId: "1000000000",
        currency: "AZN",
      },
    };
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: userId,
          email: "u@test.local",
          passwordHash: hash,
          fullName: null,
          avatarUrl: null,
          isSuperAdmin: false,
        }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: userId,
          email: "u@test.local",
          fullName: null,
          avatarUrl: null,
          isSuperAdmin: false,
        }),
      },
      organizationMembership: {
        findMany: jest.fn().mockResolvedValue([orgRow]),
        findUnique: jest.fn().mockResolvedValue({ role: UserRole.OWNER }),
      },
    };

    const { auth, jwt } = await createAuthModule(prisma);

    const out = await auth.login({
      email: "u@test.local",
      password: "pass123",
    });

    const payload = jwt.decode(out.accessToken) as {
      sub: string;
      organizationId: string;
      role: string;
    };
    expect(payload.sub).toBe(userId);
    expect(payload.organizationId).toBe(orgA);
    expect(payload.role).toBe(UserRole.OWNER);
  });

  it("switchOrganization: новый access token с выбранным organizationId", async () => {
    const prisma = {
      user: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: userId,
          email: "u@test.local",
          fullName: null,
          avatarUrl: null,
          isSuperAdmin: false,
        }),
      },
      organizationMembership: {
        findUnique: jest.fn().mockResolvedValue({ role: UserRole.ADMIN }),
        findMany: jest.fn().mockResolvedValue([
          {
            organizationId: orgA,
            role: UserRole.OWNER,
            joinedAt: new Date(),
            organization: {
              id: orgA,
              name: "A",
              taxId: "1",
              currency: "AZN",
            },
          },
          {
            organizationId: orgB,
            role: UserRole.ADMIN,
            joinedAt: new Date(),
            organization: {
              id: orgB,
              name: "B",
              taxId: "2",
              currency: "AZN",
            },
          },
        ]),
      },
    };

    const { auth, jwt } = await createAuthModule(prisma);

    const out = await auth.switchOrganization(userId, orgB);
    const payload = jwt.decode(out.accessToken) as {
      organizationId: string;
      role: string;
    };
    expect(payload.organizationId).toBe(orgB);
    expect(payload.role).toBe(UserRole.ADMIN);
  });
});
