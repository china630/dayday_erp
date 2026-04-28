import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { InventoryAdjustmentDocType } from "@dayday/database";
import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from "class-validator";

export class CreateInventoryAdjustmentLineDto {
  @ApiProperty()
  @IsUUID()
  productId!: string;

  @ApiProperty({ description: "Фактический остаток по результатам пересчёта" })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  actualQuantity!: number;

  @ApiPropertyOptional({
    description:
      "Себестоимость единицы при излишке (опционально; иначе — средняя с карточки склада)",
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitCost?: number;
}

export class CreateInventoryAdjustmentDto {
  @ApiProperty()
  @IsUUID()
  warehouseId!: string;

  @ApiProperty({ example: "2026-04-28" })
  @IsDateString()
  date!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiProperty({ enum: InventoryAdjustmentDocType })
  @IsEnum(InventoryAdjustmentDocType)
  docType!: InventoryAdjustmentDocType;

  @ApiProperty({ type: [CreateInventoryAdjustmentLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateInventoryAdjustmentLineDto)
  lines!: CreateInventoryAdjustmentLineDto[];
}
