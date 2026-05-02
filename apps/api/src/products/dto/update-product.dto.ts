import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from "class-validator";

export class UpdateProductDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sku?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price?: number;

  @ApiPropertyOptional({
    description: "НДС, %: 18, 8, 2, 0 или -1 (освобождение от ƏDV)",
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsIn([-1, 0, 2, 8, 18])
  vatRate?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isService?: boolean;
}
