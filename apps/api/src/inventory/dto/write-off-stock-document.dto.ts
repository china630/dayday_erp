import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsIn, IsNumber, IsUUID, Min } from "class-validator";

/** Списание (Дт 731 — Кт 201/204). */
export class WriteOffStockDocumentDto {
  @ApiProperty()
  @IsUUID()
  warehouseId!: string;

  @ApiProperty()
  @IsUUID()
  productId!: string;

  @ApiProperty({ description: "Количество к списанию > 0" })
  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  quantity!: number;

  @ApiProperty({ enum: ["201", "204"] })
  @IsIn(["201", "204"])
  inventoryAccountCode!: "201" | "204";
}
