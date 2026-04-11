"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const jwt_1 = require("@nestjs/jwt");
const testing_1 = require("@nestjs/testing");
const config_1 = require("@nestjs/config");
const bcrypt = __importStar(require("bcrypt"));
const database_1 = require("@dayday/database");
const auth_service_1 = require("../../src/auth/auth.service");
const accounts_service_1 = require("../../src/accounts/accounts.service");
const org_structure_service_1 = require("../../src/hr/org-structure.service");
const prisma_service_1 = require("../../src/prisma/prisma.service");
const quota_service_1 = require("../../src/quota/quota.service");
describe("AuthService (JWT: login + switch-org)", () => {
    const orgA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const orgB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    const userId = "cccccccc-cccc-cccc-cccc-cccccccccccc";
    async function createAuthModule(prisma) {
        const moduleRef = await testing_1.Test.createTestingModule({
            imports: [
                config_1.ConfigModule.forRoot({
                    isGlobal: true,
                    load: [
                        () => ({
                            JWT_SECRET: "test-jwt-secret-for-auth-spec",
                            JWT_REFRESH_SECRET: "test-refresh-secret-for-auth-spec",
                        }),
                    ],
                }),
                jwt_1.JwtModule.register({
                    secret: "test-jwt-secret-for-auth-spec",
                    signOptions: { expiresIn: "15m" },
                }),
            ],
            providers: [
                auth_service_1.AuthService,
                { provide: prisma_service_1.PrismaService, useValue: prisma },
                { provide: accounts_service_1.AccountsService, useValue: {} },
                { provide: org_structure_service_1.OrgStructureService, useValue: {} },
                { provide: quota_service_1.QuotaService, useValue: {} },
            ],
        }).compile();
        return {
            auth: moduleRef.get(auth_service_1.AuthService),
            jwt: moduleRef.get(jwt_1.JwtService),
        };
    }
    it("login: access token содержит organizationId первой организации", async () => {
        const hash = await bcrypt.hash("pass123", 4);
        const orgRow = {
            organizationId: orgA,
            role: database_1.UserRole.OWNER,
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
                findUnique: jest.fn().mockResolvedValue({ role: database_1.UserRole.OWNER }),
            },
        };
        const { auth, jwt } = await createAuthModule(prisma);
        const out = await auth.login({
            email: "u@test.local",
            password: "pass123",
        });
        const payload = jwt.decode(out.accessToken);
        expect(payload.sub).toBe(userId);
        expect(payload.organizationId).toBe(orgA);
        expect(payload.role).toBe(database_1.UserRole.OWNER);
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
                findUnique: jest.fn().mockResolvedValue({ role: database_1.UserRole.ADMIN }),
                findMany: jest.fn().mockResolvedValue([
                    {
                        organizationId: orgA,
                        role: database_1.UserRole.OWNER,
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
                        role: database_1.UserRole.ADMIN,
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
        const payload = jwt.decode(out.accessToken);
        expect(payload.organizationId).toBe(orgB);
        expect(payload.role).toBe(database_1.UserRole.ADMIN);
    });
});
//# sourceMappingURL=auth.e2e-spec.js.map