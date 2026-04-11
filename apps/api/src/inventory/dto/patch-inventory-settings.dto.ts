import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsBoolean, IsOptional, IsUUID } from "class-validator";

export class PatchInventorySettingsDto {
  @ApiPropertyOptional({
    description: "Разрешить уход остатка в минус при продаже",
  })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  allowNegativeStock?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  defaultWarehouseId?: string | null;
}
