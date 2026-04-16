import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsIn, IsNumber, IsUUID, Min } from "class-validator";

/** Оприходование излишков (Дт 201/204 — Кт 631). */
export class SurplusStockDocumentDto {
  @ApiProperty()
  @IsUUID()
  warehouseId!: string;

  @ApiProperty()
  @IsUUID()
  productId!: string;

  @ApiProperty({ description: "Количество излишка > 0" })
  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  quantity!: number;

  @ApiProperty({ enum: ["201", "204"] })
  @IsIn(["201", "204"])
  inventoryAccountCode!: "201" | "204";

  @ApiProperty({ description: "Цена за единицу для оприходования" })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitPrice!: number;
}
