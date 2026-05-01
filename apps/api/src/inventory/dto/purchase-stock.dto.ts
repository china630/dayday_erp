import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from "class-validator";

export class PurchaseLineDto {
  @ApiProperty()
  @IsUUID(undefined, { message: "productId must be a valid UUID" })
  productId!: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber({}, { message: "quantity must be a number" })
  @Min(0.0001, { message: "quantity must be greater than 0" })
  quantity!: number;

  @ApiProperty({ description: "Цена закупки за единицу (без НДС или с НДС — см. pricesIncludeVat)" })
  @Type(() => Number)
  @IsNumber({}, { message: "unitPrice must be a number" })
  @Min(0, { message: "unitPrice must be >= 0" })
  unitPrice!: number;

  @ApiPropertyOptional({ description: "Ячейка склада (WMS-light); только для kind=goods" })
  @IsOptional()
  @IsUUID()
  binId?: string;
}

export class PurchaseStockDto {
  @ApiPropertyOptional({
    enum: ["goods", "services"],
    description:
      "goods — приход на склад (Дт 201); services — закупка услуг, без движений по складу (Дт 731)",
  })
  @IsOptional()
  @IsIn(["goods", "services"])
  kind?: "goods" | "services";

  @ApiPropertyOptional({
    description: "Обязателен при kind=goods (или по умолчанию goods)",
  })
  @IsOptional()
  @IsUUID(undefined, { message: "warehouseId must be a valid UUID" })
  warehouseId?: string;

  @ApiProperty({ type: [PurchaseLineDto] })
  @IsArray()
  @ArrayMinSize(1, { message: "lines must contain at least one item" })
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

  @ApiPropertyOptional({
    description:
      "Если true: unitPrice в строках указан с НДС; на склад и в 201/731 попадает сумма без НДС, НДС — на 241",
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  pricesIncludeVat?: boolean;
}
