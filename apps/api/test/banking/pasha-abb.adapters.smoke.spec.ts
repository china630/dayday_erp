import axios from "axios";
import type { IntegrationReliabilityService } from "../../src/integrations/integration-reliability.service";
import { AbbAdapter } from "../../src/banking/bank-providers/abb.adapter";
import { PashaBankAdapter } from "../../src/banking/bank-providers/pasha-bank.adapter";
import { DataMaskingService } from "../../src/privacy/data-masking.service";

const reliabilityStub = {
  executeWithPolicies: async <T>(o: { request: () => Promise<T> }) => o.request(),
} as unknown as IntegrationReliabilityService;

const dataMasking = new DataMaskingService();

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

jest.mock("axios", () => ({
  __esModule: true,
  default: {
    create: jest.fn(),
    isAxiosError: (v: unknown) =>
      typeof v === "object" &&
      v !== null &&
      (v as { isAxiosError?: boolean }).isAxiosError === true,
  },
}));

describe("Pasha/ABB adapters smoke", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("maps Pasha balances/statements into internal format", async () => {
    const request = jest.fn();
    const post = jest.fn();
    (axios.create as jest.Mock).mockReturnValueOnce({ request, post });
    redisGet.mockResolvedValueOnce(null).mockResolvedValueOnce("pasha-token");
    post.mockResolvedValueOnce({ data: { access_token: "pasha-token", expires_in: 3600 } });
    request
      .mockResolvedValueOnce({
        data: {
          accounts: [
            {
              accountId: "PA-1",
              iban: "AZ96IBAZ40060019443689677120",
              amount: "200.50",
              currency: "AZN",
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        data: {
          transactions: [
            {
              transaction_id: "PTX-1",
              transaction_date: "2026-04-27T10:00:00.000Z",
              amount: "45.00",
              currency: "AZN",
              description: "Fees",
            },
          ],
        },
      });
    const config = {
      get: (k: string, fallback?: string) =>
        (
          {
            PASHA_CLIENT_ID: "id",
            PASHA_CLIENT_SECRET: "secret",
            REDIS_URL: "redis://127.0.0.1:6379",
          } as Record<string, string>
        )[k] ?? fallback ?? "",
    };
    const adapter = new PashaBankAdapter(config as never, reliabilityStub, dataMasking);

    const balances = await adapter.getBalances();
    const statements = await adapter.getStatements("2026-04-01", "2026-04-30");

    expect(balances[0]).toMatchObject({
      accountId: "PA-1",
      currency: "AZN",
      amount: "200.50",
    });
    expect(statements[0]).toMatchObject({
      externalId: "PTX-1",
      amount: "45.00",
      currency: "AZN",
      date: "2026-04-27T10:00:00.000Z",
    });
  });

  it("maps ABB balances/statements and builds salary xml", async () => {
    const request = jest.fn();
    const post = jest.fn();
    (axios.create as jest.Mock).mockReturnValueOnce({ request, post });
    redisGet
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce("abb-token")
      .mockResolvedValueOnce("abb-token");
    post.mockResolvedValueOnce({ data: { access_token: "abb-token", expires_in: 3600 } });
    const abbAccountsPayload = {
      data: {
        items: [
          {
            accountNo: "40050019441853946204",
            currency: "AZN",
            availableBalance: 5000,
            iban: "AZ59IBAZ40050019449310375120",
          },
        ],
      },
    };
    const abbStatementPayload = {
      data: {
        accountInfo: { currency: "AZN" },
        transaction: {
          transactions: [
            {
              trnRef: "ABB-1",
              trnDate: "21.05.2021",
              trnDesc: "TEST PAYMENT",
              drAmount: 100,
              crAmount: 0,
            },
          ],
        },
      },
    };
    request
      .mockResolvedValueOnce(abbAccountsPayload)
      .mockResolvedValueOnce(abbAccountsPayload)
      .mockResolvedValueOnce(abbStatementPayload);
    const config = {
      get: (k: string, fallback?: string) =>
        (
          {
            ABB_USERNAME: "test-user",
            ABB_PASSWORD: "test",
            ABB_CIF: "3689677",
            REDIS_URL: "redis://127.0.0.1:6379",
          } as Record<string, string>
        )[k] ?? fallback ?? "",
    };
    const adapter = new AbbAdapter(config as never, reliabilityStub, dataMasking);

    const balances = await adapter.getBalances();
    const statements = await adapter.getStatements("2026-04-01", "2026-04-30");
    const xml = adapter.buildSalaryPaymentXml([
      {
        rrn: "RRN-1",
        account: "AZ96IBAZ40060019443689677120",
        amount: "1000.00",
        recipientAccount: "AZ98IBAZ41040019443689677216",
        description1: "Salary April",
      },
    ]);

    expect(balances[0]).toMatchObject({
      currency: "AZN",
      amount: "5000.00",
    });
    expect(statements[0]).toMatchObject({
      externalId: "ABB-1",
      amount: "-100.00",
      currency: "AZN",
      description: "TEST PAYMENT",
    });
    expect(xml).toContain("<payments>");
    expect(xml).toContain("<rrn>RRN-1</rrn>");
    expect(xml).toContain("<recipientAccount>AZ98IBAZ41040019443689677216</recipientAccount>");
  });
});

