export type CreatePaymentSessionParams = {
  internalOrderId: string;
  organizationId: string;
  amount: number;
  currency: string;
  description: string;
  /** URL пользователя после оплаты (фронт). */
  returnUrl: string;
  /** URL API для server-to-server callback (банк). */
  callbackUrl: string;
};

export type CreatePaymentSessionResult = {
  paymentUrl: string;
  externalId?: string;
  /** mock — внутренняя симуляция; pasha_bank — ответ шлюза */
  providerMode: "mock" | "pasha_bank";
};
