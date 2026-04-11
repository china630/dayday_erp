import { SubscriptionTier } from "@dayday/database";
import { IsEnum } from "class-validator";

export class SelectPlanDto {
  @IsEnum(SubscriptionTier)
  tier!: SubscriptionTier;
}
