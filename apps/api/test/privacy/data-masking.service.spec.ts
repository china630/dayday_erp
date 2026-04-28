import { DataMaskingService, MASKED } from "../../src/privacy/data-masking.service";

describe("DataMaskingService", () => {
  let svc: DataMaskingService;

  beforeEach(() => {
    svc = new DataMaskingService();
  });

  it("masks known sensitive keys case-insensitively and ignores separators", () => {
    const out = svc.maskDeep({
      Password: "x",
      access_token: "t",
      API_KEY: "k",
      normal: "keep",
    }) as Record<string, unknown>;
    expect(out.Password).toBe(MASKED);
    expect(out.access_token).toBe(MASKED);
    expect(out.API_KEY).toBe(MASKED);
    expect(out.normal).toBe("keep");
  });

  it("recurses into nested objects and arrays", () => {
    const out = svc.maskDeep({
      user: { fin: "1234567", name: "A" },
      rows: [{ iban: "AZ00", amount: 1 }, { balance: 99, ok: true }],
    }) as Record<string, unknown>;

    expect((out.user as Record<string, unknown>).fin).toBe(MASKED);
    expect((out.user as Record<string, unknown>).name).toBe("A");
    const rows = out.rows as Record<string, unknown>[];
    expect(rows[0].iban).toBe(MASKED);
    expect(rows[0].amount).toBe(1);
    expect(rows[1].balance).toBe(MASKED);
    expect(rows[1].ok).toBe(true);
  });

  it("parses JSON-looking strings and masks inside", () => {
    const nested = JSON.stringify({ token: "secret", id: 5 });
    const out = svc.maskDeep({ payload: nested }) as Record<string, unknown>;
    expect(out.payload).toEqual({ token: MASKED, id: 5 });
  });

  it("maskForLogSnippet applies deep mask then truncates", () => {
    const big = { pin: "1111", data: "x".repeat(500) };
    const s = svc.maskForLogSnippet(big, 80);
    expect(s).toContain(MASKED);
    expect(s.endsWith("…")).toBe(true);
    expect(s.length).toBeLessThanOrEqual(81);
  });
});
