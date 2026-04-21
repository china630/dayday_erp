import { SubscriptionTier } from "@dayday/database";

export type TierQuotas = {
  /** Максимум организаций на один «биллинговый» контур (v4.1+); при 1:1 org–subscription — ориентир для политики. */
  maxOrganizations: number | null;
  maxEmployees: number | null;
  maxInvoicesPerMonth: number | null;
  /** Max object storage for org (logos, PDFs), GB; null = unlimited. */
  maxStorageGb: number | null;
};

export const TIER_QUOTAS: Record<SubscriptionTier, TierQuotas> = {
  STARTER: {
    maxOrganizations: 1,
    maxEmployees: 5,
    maxInvoicesPerMonth: 20,
    maxStorageGb: 1,
  },
  BUSINESS: {
    maxOrganizations: 3,
    maxEmployees: 50,
    maxInvoicesPerMonth: 500,
    maxStorageGb: 20,
  },
  ENTERPRISE: {
    maxOrganizations: null,
    maxEmployees: null,
    maxInvoicesPerMonth: null,
    maxStorageGb: null,
  },
};
