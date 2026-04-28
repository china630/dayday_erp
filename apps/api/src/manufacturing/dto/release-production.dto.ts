import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsNumber, IsOptional, IsUUID, Min } from "class-validator";

export class ReleaseProductionDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @ApiProperty({
    description: "BOM/recipe ID used for manufacturing release",
  })
  @IsUUID()
  recipeId!: string;

  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  quantity!: number;
}
