import axios from "axios";
import type { IntegrationReliabilityService } from "../../src/integrations/integration-reliability.service";
import { AbbAdapter } from "../../src/banking/bank-providers/abb.adapter";
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

describe("AbbAdapter smoke", () => {
  beforeEach(() => jest.clearAllMocks());

  it("maps balances and statement payloads from ABB v1.6 style", async () => {
    const request = jest.fn();
    const post = jest.fn();
    (axios.create as jest.Mock).mockReturnValue({ request, post });

    redisGet
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce("abb-token")
      .mockResolvedValueOnce("abb-token");
    redisSet.mockResolvedValue("OK");
    post.mockResolvedValueOnce({
      data: { access_token: "abb-token", expires_in: 8640000 },
    });

    request
      .mockResolvedValueOnce({
        data: [
          {
            currency: "AZN",
            accountNo: "40050019441853946204",
            availableBalance: 5957.07,
            iban: "AZ59IBAZ40050019441853946204",
          },
        ],
      })
      .mockResolvedValueOnce({
        data: [
          {
            currency: "AZN",
            accountNo: "40050019441853946204",
            availableBalance: 5957.07,
            iban: "AZ59IBAZ40050019441853946204",
          },
        ],
      })
      .mockResolvedValueOnce({
        data: {
          accountInfo: {
            currency: "AZN",
          },
          transaction: {
            transactions: [
              {
                trnRef: "120FTRQ211440024",
                trnDate: "21.05.2021",
                trnDesc: "HESABDAKI QALIQ HESAB AID EDILIR",
                drAmount: 34030.14,
                crAmount: 0,
              },
            ],
          },
        },
      });

    const config = {
      get: (key: string, fallback?: string) => {
        const map: Record<string, string> = {
          ABB_USERNAME: "user",
          ABB_PASSWORD: "pass",
          REDIS_URL: "redis://127.0.0.1:6379",
        };
        return map[key] ?? fallback ?? "";
      },
    } as const;
    const adapter = new AbbAdapter(config as never, reliabilityStub, dataMasking);

    const balances = await adapter.getBalances();
    const statements = await adapter.getStatements("2021-05-01", "2021-05-31");

    expect(balances[0]).toMatchObject({
      accountId: "40050019441853946204",
      currency: "AZN",
      amount: "5957.07",
    });
    expect(statements[0]).toMatchObject({
      externalId: "120FTRQ211440024",
      date: "2021-05-21T00:00:00.000Z",
      currency: "AZN",
      description: "HESABDAKI QALIQ HESAB AID EDILIR",
    });
  });

  it("builds salary XML in ABB v1.6 §5.3 shape", () => {
    const request = jest.fn();
    const post = jest.fn();
    (axios.create as jest.Mock).mockReturnValue({ request, post });
    const config = {
      get: (_key: string, fallback?: string) => fallback ?? "",
    } as const;
    const adapter = new AbbAdapter(config as never, reliabilityStub, dataMasking);
    const xml = adapter.buildSalaryPaymentXml([
      {
        rrn: "RRN-1",
        account: "AZ59IBAZ40050019441853946204",
        amount: "100.00",
        recipientAccount: "AZ66IBAZ40140018409327445353",
        description1: "Salary payment",
      },
    ]);
    expect(xml).toContain("<rrn>RRN-1</rrn>");
    expect(xml).toContain("<recipientAccount>AZ66IBAZ40140018409327445353</recipientAccount>");
    expect(xml).toContain("<description1>Salary payment</description1>");
  });
});

