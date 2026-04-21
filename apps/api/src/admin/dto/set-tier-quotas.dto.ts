import { Type } from "class-transformer";
import {
  IsEnum,
  IsInt,
  IsOptional,
  Min,
  ValidateNested,
} from "class-validator";
import { SubscriptionTier } from "@dayday/database";

export class TierQuotasDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxOrganizations?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxEmployees?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxInvoicesPerMonth?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxStorageGb?: number | null;
}

export class SetTierQuotasDto {
  @IsEnum(SubscriptionTier)
  tier!: SubscriptionTier;

  @ValidateNested()
  @Type(() => TierQuotasDto)
  quotas!: TierQuotasDto;
}
