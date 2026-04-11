import { IsArray, IsNumber, IsOptional, IsString, Max, Min } from "class-validator";

export class CreatePricingBundleDto {
  @IsString()
  name!: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  discountPercent!: number;

  @IsArray()
  @IsString({ each: true })
  moduleKeys!: string[];
}

export class UpdatePricingBundleDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  discountPercent?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  moduleKeys?: string[];
}
