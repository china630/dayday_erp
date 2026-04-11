import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from "class-validator";

export class CreateFixedAssetDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: "INV-001" })
  @IsString()
  @IsNotEmpty()
  inventoryNumber!: string;

  @ApiProperty({ example: "2024-01-15" })
  @IsDateString()
  commissioningDate!: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  initialCost!: number;

  @ApiProperty({ description: "Срок полезного использования, месяцев" })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  usefulLifeMonths!: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  salvageValue?: number;
}
