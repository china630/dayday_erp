import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from "class-validator";

export class PurchaseLineDto {
  @ApiProperty()
  @IsUUID()
  productId!: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  quantity!: number;

  @ApiProperty({ description: "Цена закупки за единицу" })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitPrice!: number;

  @ApiPropertyOptional({ description: "Ячейка склада (WMS-light)" })
  @IsOptional()
  @IsUUID()
  binId?: string;
}

export class PurchaseStockDto {
  @ApiProperty()
  @IsUUID()
  warehouseId!: string;

  @ApiProperty({ type: [PurchaseLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PurchaseLineDto)
  lines!: PurchaseLineDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiPropertyOptional({
    description: "Поставщик (для аналитики кредиторки 531 и взаимозачёта)",
  })
  @IsOptional()
  @IsUUID()
  counterpartyId?: string;
}
