import { SetMetadata } from "@nestjs/common";
import type { QuotaResource } from "../../quota/quota-resource";

export const CHECK_QUOTA_KEY = "dayday:checkQuota";

/** Declares which quota {@link QuotaGuard} must assert before the handler runs. */
export const CheckQuota = (resource: QuotaResource) =>
  SetMetadata(CHECK_QUOTA_KEY, resource);
