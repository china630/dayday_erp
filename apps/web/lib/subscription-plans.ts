import type { SubscriptionTier } from "./subscription-context";

export const SUBSCRIPTION_PLANS: {
  tier: SubscriptionTier;
  priceAzn: number;
}[] = [
  { tier: "STARTER", priceAzn: 49 },
  { tier: "BUSINESS", priceAzn: 149 },
  { tier: "ENTERPRISE", priceAzn: 499 },
];
