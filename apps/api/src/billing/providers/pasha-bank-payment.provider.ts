import {
  BadGatewayException,
  Injectable,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac, timingSafeEqual } from "crypto";
import type {
  CreatePaymentSessionParams,
  CreatePaymentSessionResult,
} from "../payment.types";

function stableStringify(obj: Record<string, unknown>): string {
  const keys = Object.keys(obj).sort();
  const sorted: Record<string, unknown> = {};
  for (const k of keys) sorted[k] = obj[k];
  return JSON.stringify(sorted);
}

/**
 * Интеграция с PAŞA Bank (или совместимым шлюзом): создание сессии оплаты и проверка подписи вебхука.
 *
 * Env (реальный шлюз):
 * - PASHA_BANK_CREATE_ORDER_URL — полный URL POST создания платежа (выдаётся банком при подключении)
 * - PASHA_BANK_MERCHANT_ID, PASHA_BANK_SECRET — идентификатор и секрет для подписи тела запроса
 * - PASHA_BANK_TERMINAL_ID — опционально
 *
 * Без PASHA_BANK_CREATE_ORDER_URL используется mock: редирект на /api/public/billing/mock-pay
 */
@Injectable()
export class PashaBankPaymentProvider {
  private readonly logger = new Logger(PashaBankPaymentProvider.name);

  constructor(private readonly config: ConfigService) {}

  signOrderToken(orderId: string): string {
    const secret = this.requireWebhookSecret();
    return createHmac("sha256", secret).update(`order:${orderId}`).digest("hex");
  }

  verifyOrderToken(orderId: string, token: string): boolean {
    try {
      const expected = this.signOrderToken(orderId);
      const a = Buffer.from(token, "utf8");
      const b = Buffer.from(expected, "utf8");
      return a.length === b.length && timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  /**
   * Подпись для вебхука: HMAC-SHA256(`${orderId}|${status}`, secret)
   */
  signWebhookPayload(orderId: string, status: string): string {
    const secret = this.requireWebhookSecret();
    return createHmac("sha256", secret)
      .update(`${orderId}|${status}`)
      .digest("hex");
  }

  verifyWebhookSignature(
    orderId: string,
    status: string,
    signature: string,
  ): boolean {
    const expected = this.signWebhookPayload(orderId, status);
    try {
      const a = Buffer.from(signature, "utf8");
      const b = Buffer.from(expected, "utf8");
      return a.length === b.length && timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  async createPaymentSession(
    params: CreatePaymentSessionParams,
  ): Promise<CreatePaymentSessionResult> {
    const endpoint = this.config
      .get<string>("PASHA_BANK_CREATE_ORDER_URL", "")
      ?.trim();
    const merchantId = this.config
      .get<string>("PASHA_BANK_MERCHANT_ID", "")
      ?.trim();
    const secret = this.config.get<string>("PASHA_BANK_SECRET", "")?.trim();

    if (!endpoint) {
      return this.buildMockRedirect(params);
    }

    if (!merchantId || !secret) {
      this.logger.warn(
        "PASHA_BANK_CREATE_ORDER_URL set but MERCHANT_ID/SECRET missing — falling back to mock",
      );
      return this.buildMockRedirect(params);
    }

    const terminalId = this.config.get<string>("PASHA_BANK_TERMINAL_ID", "")?.trim();
    const body: Record<string, unknown> = {
      merchant_id: merchantId,
      order_id: params.internalOrderId,
      amount: params.amount,
      currency: params.currency,
      description: params.description,
      return_url: params.returnUrl,
      callback_url: params.callbackUrl,
    };
    if (terminalId) body.terminal_id = terminalId;

    const stable = stableStringify(body);
    body.signature = createHmac("sha256", secret).update(stable).digest("hex");

    let gatewayRes: Awaited<ReturnType<typeof fetch>>;
    try {
      gatewayRes = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (e) {
      this.logger.error(`Pasha Bank create order fetch failed: ${String(e)}`);
      throw new BadGatewayException("Payment gateway unreachable");
    }

    if (!gatewayRes.ok) {
      const text = await gatewayRes.text();
      this.logger.warn(`Pasha Bank HTTP ${gatewayRes.status}: ${text}`);
      throw new BadGatewayException("Payment gateway rejected the request");
    }

    const json = (await gatewayRes.json()) as Record<string, unknown>;
    const paymentUrl =
      (typeof json.paymentUrl === "string" && json.paymentUrl) ||
      (typeof json.payment_url === "string" && json.payment_url) ||
      (typeof json.redirect_url === "string" && json.redirect_url) ||
      (typeof json.url === "string" && json.url);

    if (!paymentUrl || typeof paymentUrl !== "string") {
      throw new BadGatewayException(
        "Payment gateway response missing payment URL",
      );
    }

    const externalId =
      (typeof json.transaction_id === "string" && json.transaction_id) ||
      (typeof json.transactionId === "string" && json.transactionId) ||
      undefined;

    return {
      paymentUrl,
      externalId,
      providerMode: "pasha_bank",
    };
  }

  private buildMockRedirect(
    params: CreatePaymentSessionParams,
  ): CreatePaymentSessionResult {
    const apiPublic = this.config
      .get<string>("API_PUBLIC_URL", "http://127.0.0.1:4000")
      .replace(/\/$/, "");
    const token = this.signOrderToken(params.internalOrderId);
    const q = new URLSearchParams({
      orderId: params.internalOrderId,
      token,
    });
    return {
      paymentUrl: `${apiPublic}/api/public/billing/mock-pay?${q.toString()}`,
      providerMode: "mock",
    };
  }

  private requireWebhookSecret(): string {
    const s = this.config.get<string>("PAYMENT_WEBHOOK_SECRET", "")?.trim();
    if (!s) {
      return this.config.get<string>("JWT_SECRET", "dev-insecure") ?? "dev";
    }
    return s;
  }
}
