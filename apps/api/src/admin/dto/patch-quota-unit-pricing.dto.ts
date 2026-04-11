import { IsNumber, IsOptional, Min } from "class-validator";

export class PatchQuotaUnitPricingDto {
  @IsOptional()
  @IsNumber()
  @Min(1)
  employeeBlockSize?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  pricePerEmployeeBlockAzn?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  documentPackSize?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  pricePerDocumentPackAzn?: number;
}
