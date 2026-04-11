import { Type } from "class-transformer";
import { IsEnum, IsInt, IsNumber, Max, Min, MinLength, IsOptional } from "class-validator";
import { SubscriptionTier } from "@dayday/database";

export class CheckoutDto {
  /** Если задан — сумма заказа берётся из SystemConfig для тарифа. */
  @IsOptional()
  @IsEnum(SubscriptionTier)
  tier?: SubscriptionTier;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amountAzn!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(36)
  months?: number;

  @IsOptional()
  @MinLength(8)
  idempotencyKey?: string;
}
