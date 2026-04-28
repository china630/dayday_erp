import axios from "axios";
import type { IntegrationReliabilityService } from "../../src/integrations/integration-reliability.service";
import { PashaBankAdapter } from "../../src/banking/bank-providers/pasha-bank.adapter";
import { DataMaskingService } from "../../src/privacy/data-masking.service";

const reliabilityStub = {
  executeWithPolicies: async <T>(o: { request: () => Promise<T> }) => o.request(),
} as unknown as IntegrationReliabilityService;

const dataMasking = new DataMaskingService();

jest.mock("axios", () => ({
  __esModule: true,
  default: {
    create: jest.fn(),
    isAxiosError: (v: unknown) =>
      typeof v === "object" && v !== null && (v as { isAxiosError?: boolean }).isAxiosError === true,
  },
}));

const redisGet = jest.fn();
const redisSet = jest.fn();
const redisDel = jest.fn();
const redisQuit = jest.fn();

jest.mock("ioredis", () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    get: redisGet,
    set: redisSet,
    del: redisDel,
    quit: redisQuit,
  })),
}));

describe("PashaBankAdapter smoke", () => {
  beforeEach(() => jest.clearAllMocks());

  it("maps balances and statements", async () => {
    const request = jest.fn();
    const post = jest.fn();
    (axios.create as jest.Mock).mockReturnValue({ request, post });
    redisGet.mockResolvedValueOnce(null).mockResolvedValueOnce("pasha-token");
    redisSet.mockResolvedValue("OK");
    post.mockResolvedValueOnce({ data: { access_token: "pasha-token", expires_in: 3600 } });

    request
      .mockResolvedValueOnce({
        data: {
          accounts: [
            {
              accountId: "PASHA-1",
              iban: "AZ36PAHA00000000000000000001",
              currency: "AZN",
              available_balance: "12000.55",
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        data: {
          transactions: [
            {
              transaction_id: "PX-1",
              transaction_date: "2026-04-27T10:00:00.000Z",
              amount: "89.50",
              currency: "AZN",
              description: "POS fee",
            },
          ],
        },
      });

    const config = {
      get: (key: string, fallback?: string) => {
        const map: Record<string, string> = {
          PASHA_CLIENT_ID: "id",
          PASHA_CLIENT_SECRET: "secret",
          REDIS_URL: "redis://127.0.0.1:6379",
        };
        return map[key] ?? fallback ?? "";
      },
    } as const;

    const adapter = new PashaBankAdapter(config as never, reliabilityStub, dataMasking);
    const balances = await adapter.getBalances();
    const statements = await adapter.getStatements("2026-04-01", "2026-04-27");

    expect(balances[0]).toMatchObject({
      accountId: "PASHA-1",
      currency: "AZN",
      amount: "12000.55",
    });
    expect(statements[0]).toMatchObject({
      externalId: "PX-1",
      date: "2026-04-27T10:00:00.000Z",
      amount: "89.50",
      currency: "AZN",
    });
  });
});

