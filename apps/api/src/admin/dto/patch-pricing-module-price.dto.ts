import { IsNumber, Min } from "class-validator";

export class PatchPricingModulePriceDto {
  @IsNumber()
  @Min(0)
  pricePerMonth!: number;
}
