import axios from "axios";
import Redis from "ioredis";
import type { IntegrationReliabilityService } from "../../src/integrations/integration-reliability.service";
import { BirbankAdapter } from "../../src/banking/bank-providers/birbank.adapter";
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

describe("BirbankAdapter smoke mapping", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("maps Birbank balances and statements to BankingProviderInterface shape", async () => {
    const request = jest.fn();
    const post = jest.fn();
    (axios.create as jest.Mock).mockReturnValue({ request, post });

    redisGet.mockResolvedValueOnce(null).mockResolvedValueOnce("oauth-token");
    redisSet.mockResolvedValue("OK");

    post.mockResolvedValueOnce({
      data: { access_token: "oauth-token", expires_in: 3600 },
    });

    request
      .mockResolvedValueOnce({
        data: {
          accounts: [
            {
              accountId: "ACC-001",
              iban: "AZ00TEST0000000000000000000001",
              currencyCode: "AZN",
              amount: "1200.50",
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        data: {
          transactions: [
            {
              transactionId: "TX-01",
              amount: "150.75",
              currencyCode: "AZN",
              transactionDate: "2026-04-27T09:00:00.000Z",
              description: "Invoice payment",
              counterpartyIban: "AZ00TEST0000000000000000000002",
              counterpartyName: "Test Supplier LLC",
            },
          ],
        },
      });

    const config = {
      get: (key: string, fallback?: string) => {
        const map: Record<string, string> = {
          BIRBANK_API_BASE_URL: "https://api.birbank.business",
          BIRBANK_OAUTH_TOKEN_PATH: "/oauth/token",
          BIRBANK_ACCOUNTS_PATH: "/accounts",
          BIRBANK_STATEMENTS_PATH: "/accounts/statements",
          BIRBANK_CLIENT_ID: "client-id",
          BIRBANK_CLIENT_SECRET: "client-secret",
          REDIS_URL: "redis://127.0.0.1:6379",
        };
        return map[key] ?? fallback ?? "";
      },
    } as const;

    const adapter = new BirbankAdapter(config as never, reliabilityStub, dataMasking);

    const balances = await adapter.getBalances();
    const statements = await adapter.getStatements("2026-04-01", "2026-04-27");

    expect(balances).toEqual([
      {
        accountId: "ACC-001",
        iban: "AZ00TEST0000000000000000000001",
        currency: "AZN",
        amount: "1200.50",
      },
    ]);

    expect(statements).toEqual([
      {
        externalId: "TX-01",
        amount: "150.75",
        currency: "AZN",
        date: "2026-04-27T09:00:00.000Z",
        description: "Invoice payment",
        counterpartyIban: "AZ00TEST0000000000000000000002",
        counterpartyName: "Test Supplier LLC",
      },
    ]);

    expect(post).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("reuses cached OAuth token from Redis", async () => {
    const request = jest.fn().mockResolvedValue({
      data: { accounts: [] },
    });
    const post = jest.fn();
    (axios.create as jest.Mock).mockReturnValue({ request, post });
    redisGet.mockResolvedValueOnce("cached-token");

    const config = {
      get: (key: string, fallback?: string) => {
        const map: Record<string, string> = {
          BIRBANK_API_BASE_URL: "https://api.birbank.business",
          REDIS_URL: "redis://127.0.0.1:6379",
          BIRBANK_CLIENT_ID: "client-id",
          BIRBANK_CLIENT_SECRET: "client-secret",
        };
        return map[key] ?? fallback ?? "";
      },
    } as const;
    const adapter = new BirbankAdapter(config as never, reliabilityStub, dataMasking);

    await adapter.getBalances();

    expect(post).not.toHaveBeenCalled();
    expect(redisGet).toHaveBeenCalledTimes(1);
  });

  it("creates Redis client in adapter", () => {
    const request = jest.fn();
    const post = jest.fn();
    (axios.create as jest.Mock).mockReturnValue({ request, post });

    const config = {
      get: (_key: string, fallback?: string) => fallback ?? "",
    } as const;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const adapter = new BirbankAdapter(config as never, reliabilityStub, dataMasking);
    expect(Redis).toHaveBeenCalled();
  });
});

