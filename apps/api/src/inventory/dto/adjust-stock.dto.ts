import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsIn,
  IsNumber,
  IsUUID,
  Min,
  ValidateIf,
} from "class-validator";

export class AdjustStockDto {
  @ApiProperty()
  @IsUUID()
  warehouseId!: string;

  @ApiProperty()
  @IsUUID()
  productId!: string;

  @ApiProperty({ description: "Количество > 0" })
  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  quantity!: number;

  @ApiProperty({ enum: ["IN", "OUT"] })
  @IsIn(["IN", "OUT"])
  type!: "IN" | "OUT";

  @ApiProperty({
    description: "Счёт запасов: 201 — сырьё/товары, 204 — готовая продукция",
    enum: ["201", "204"],
  })
  @IsIn(["201", "204"])
  inventoryAccountCode!: "201" | "204";

  @ApiPropertyOptional({
    description: "Цена за единицу при оприходовании (обязательна для IN)",
  })
  @ValidateIf((o: AdjustStockDto) => o.type === "IN")
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitPrice?: number;
}
