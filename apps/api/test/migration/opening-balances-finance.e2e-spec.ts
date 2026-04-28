import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { UserRole } from "@dayday/database";
import request from "supertest";
import type { NextFunction, Request, Response } from "express";
import { OpeningBalancesController } from "../../src/migration/opening-balances.controller";
import { OpeningBalancesService } from "../../src/migration/opening-balances.service";
import { RolesGuard } from "../../src/auth/guards/roles.guard";

describe("OpeningBalancesController /finance (HTTP e2e)", () => {
  let app: INestApplication;
  const service = {
    importFinance: jest.fn(),
    importHr: jest.fn(),
    importInventory: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [OpeningBalancesController],
      providers: [
        { provide: OpeningBalancesService, useValue: service },
        RolesGuard,
        Reflector,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.use((req: Request, _res: Response, next: NextFunction) => {
      const role = String(req.headers["x-role"] ?? "").toUpperCase();
      const organizationId = String(
        req.headers["x-org"] ?? "00000000-0000-0000-0000-000000000001",
      );
      req.user = role
        ? { userId: "u-1", organizationId, role }
        : undefined;
      req.params = { ...(req.params ?? {}), organizationId };
      req.headers["x-organization-id"] = organizationId;
      next();
    });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("allows OWNER and returns success for valid payload", async () => {
    service.importFinance.mockResolvedValue({
      created: 1,
      transactionIds: ["tx-1"],
    });
    const res = await request(app.getHttpServer())
      .post("/migration/opening-balances/finance")
      .set("x-role", UserRole.OWNER)
      .set("x-org", "00000000-0000-0000-0000-000000000001")
      .send([
        {
          accountCode: "101",
          amount: 10000,
          currency: "AZN",
          date: "2026-04-27",
          description: "Opening cash",
        },
      ]);

    expect(res.status).toBe(201);
    expect(service.importFinance).toHaveBeenCalledTimes(1);
  });

  it("returns 403 for USER role", async () => {
    const res = await request(app.getHttpServer())
      .post("/migration/opening-balances/finance")
      .set("x-role", UserRole.USER)
      .send([
        {
          accountCode: "101",
          amount: 10000,
          currency: "AZN",
          date: "2026-04-27",
        },
      ]);
    expect(res.status).toBe(403);
    expect(service.importFinance).not.toHaveBeenCalled();
  });

  it("returns 403 for PROCUREMENT role", async () => {
    const res = await request(app.getHttpServer())
      .post("/migration/opening-balances/finance")
      .set("x-role", UserRole.PROCUREMENT)
      .send([
        {
          accountCode: "101",
          amount: 10000,
          currency: "AZN",
          date: "2026-04-27",
        },
      ]);
    expect(res.status).toBe(403);
    expect(service.importFinance).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid DTO type", async () => {
    const res = await request(app.getHttpServer())
      .post("/migration/opening-balances/finance")
      .set("x-role", UserRole.OWNER)
      .send([
        {
          accountCode: "101",
          amount: "not-a-number",
          currency: "AZN",
          date: "2026-04-27",
        },
      ]);
    expect(res.status).toBe(400);
    expect(service.importFinance).not.toHaveBeenCalled();
  });
});
