import { ApiPropertyOptional } from "@nestjs/swagger";
import { FixedAssetStatus } from "@dayday/database";
import { Type } from "class-transformer";
import {
  IsEnum,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from "class-validator";

export class UpdateFixedAssetDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  inventoryNumber?: string;

  @ApiPropertyOptional({ description: "Дата покупки/ввода (purchaseDate)" })
  @IsOptional()
  @IsDateString()
  purchaseDate?: string;

  @ApiPropertyOptional({ description: "Legacy alias: commissioningDate" })
  @IsOptional()
  @IsDateString()
  commissioningDate?: string;

  @ApiPropertyOptional({ description: "Стоимость приобретения (purchasePrice)" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  purchasePrice?: number;

  @ApiPropertyOptional({ description: "Legacy alias: initialCost" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  initialCost?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  usefulLifeMonths?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  salvageValue?: number;

  @ApiPropertyOptional({ enum: FixedAssetStatus })
  @IsOptional()
  @IsEnum(FixedAssetStatus)
  status?: FixedAssetStatus;
}
