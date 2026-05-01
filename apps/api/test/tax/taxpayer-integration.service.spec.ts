import axios from "axios";
import { ConfigService } from "@nestjs/config";
import { NotFoundException } from "@nestjs/common";
import { TaxpayerIntegrationService } from "../../src/tax/taxpayer-integration.service";

const redisMock = {
  get: jest.fn(),
  set: jest.fn(),
  quit: jest.fn(),
};

jest.mock("ioredis", () => {
  return jest.fn().mockImplementation(() => redisMock);
});

describe("TaxpayerIntegrationService fallback", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function makeService() {
    const config = {
      get: jest.fn((k: string, d?: string) => {
        if (k === "TAX_LOOKUP_MOCK") return "0";
        if (k === "REDIS_URL") return "redis://127.0.0.1:6379";
        return d;
      }),
    } as unknown as ConfigService;
    const reliability = {
      trackCache: jest.fn().mockResolvedValue(undefined),
      executeWithPolicies: jest.fn(async (args: { request: () => Promise<unknown> }) =>
        args.request(),
      ),
    };
    const audit = { logOrganizationSystemEvent: jest.fn().mockResolvedValue(undefined) };
    return {
      service: new TaxpayerIntegrationService(config, reliability as any, audit as any),
      reliability,
      audit,
    };
  }

  it("goes to external API when cache read fails", async () => {
    redisMock.get.mockRejectedValueOnce(new Error("redis down"));
    jest.spyOn(axios, "post").mockResolvedValueOnce({
      status: 200,
      headers: { "content-type": "application/json" },
      data: { name: "ACME MMC", isVatPayer: true, address: "Baku" },
    } as any);

    const { service, reliability } = makeService();
    const out = await service.lookupTaxpayerByVoen("1234567890");

    expect(out.name).toBe("ACME MMC");
    expect(reliability.trackCache).toHaveBeenCalledWith("tax", false);
    expect(axios.post).toHaveBeenCalled();
  });

  it("throws not found when all external attempts fail or payload is unusable", async () => {
    redisMock.get.mockResolvedValueOnce(null);
    jest.spyOn(axios, "post").mockResolvedValue({
      status: 500,
      headers: { "content-type": "application/json" },
      data: {},
    } as any);
    jest.spyOn(axios, "get").mockResolvedValue({
      status: 500,
      headers: { "content-type": "application/json" },
      data: {},
    } as any);

    const { service, audit } = makeService();
    await expect(service.lookupTaxpayerByVoen("1234567890")).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(audit.logOrganizationSystemEvent).toHaveBeenCalled();
  });

  it("rejects Cloudflare-style HTML body (200) as invalid lookup", async () => {
    redisMock.get.mockResolvedValueOnce(null);
    const html =
      '<!DOCTYPE html><html><noscript>You need to enable JavaScript to run this app.</noscript></html>';
    jest.spyOn(axios, "post").mockResolvedValue({
      status: 200,
      headers: { "content-type": "text/html" },
      data: html,
    } as any);
    jest.spyOn(axios, "get").mockResolvedValue({
      status: 200,
      headers: { "content-type": "text/html" },
      data: html,
    } as any);

    const { service } = makeService();
    await expect(service.lookupTaxpayerByVoen("1234567890")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
