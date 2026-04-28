import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { FixedAssetStatus } from "@dayday/database";
import { Type } from "class-transformer";
import {
  IsEnum,
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

  @ApiProperty({
    example: "2024-01-15",
    description: "Дата покупки/ввода в эксплуатацию (purchaseDate)",
  })
  @IsOptional()
  @IsDateString()
  purchaseDate?: string;

  @ApiPropertyOptional({ description: "Legacy alias: commissioningDate" })
  @IsOptional()
  @IsDateString()
  commissioningDate?: string;

  @ApiProperty({ description: "Стоимость приобретения (purchasePrice)" })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  @Min(0.0001)
  purchasePrice?: number;

  @ApiPropertyOptional({ description: "Legacy alias: initialCost" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  initialCost?: number;

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

  @ApiPropertyOptional({ enum: FixedAssetStatus, default: FixedAssetStatus.ACTIVE })
  @IsOptional()
  @IsEnum(FixedAssetStatus)
  status?: FixedAssetStatus;
}
