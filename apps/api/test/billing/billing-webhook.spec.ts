import {
  BillingStatus,
  SubscriptionInvoiceStatus,
} from "@dayday/database";
import { PaymentProviderService } from "../../src/billing/payment-provider.service";

describe("PaymentProviderService webhook auto-resume", () => {
  it("marks invoice as PAID and lifts HARD_BLOCK to ACTIVE", async () => {
    const tx = {
      subscriptionInvoice: {
        findUnique: jest.fn().mockResolvedValue({
          id: "11111111-1111-1111-1111-111111111111",
          status: SubscriptionInvoiceStatus.ISSUED,
          items: [{ organizationId: "org-1" }],
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      organization: {
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (fn: (trx: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
    };
    const billing = {};
    const billingPlatform = {};
    const subscriptionAccess = {};
    const orgModules = {};
    const pasha = {
      verifyWebhookSignature: jest.fn().mockReturnValue(true),
    };
    const config = { get: jest.fn(() => "") };
    const systemConfig = {};
    const audit = {};

    const service = new PaymentProviderService(
      prisma as any,
      billing as any,
      billingPlatform as any,
      subscriptionAccess as any,
      orgModules as any,
      pasha as any,
      config as any,
      systemConfig as any,
      audit as any,
    );

    const out = await service.handleWebhook({
      subscriptionInvoiceId: "11111111-1111-1111-1111-111111111111",
      status: "success",
      signature: "sig",
    });

    expect(out).toEqual({ ok: true });
    expect(pasha.verifyWebhookSignature).toHaveBeenCalledWith(
      "11111111-1111-1111-1111-111111111111",
      "success",
      "sig",
    );
    expect(tx.subscriptionInvoice.update).toHaveBeenCalledWith({
      where: { id: "11111111-1111-1111-1111-111111111111" },
      data: { status: SubscriptionInvoiceStatus.PAID },
    });
    expect(tx.organization.update).toHaveBeenCalledWith({
      where: { id: "org-1" },
      data: { billingStatus: BillingStatus.ACTIVE },
    });
  });
});
