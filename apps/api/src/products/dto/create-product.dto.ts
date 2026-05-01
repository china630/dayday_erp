import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, MinLength } from "class-validator";

export class CreateProductDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiPropertyOptional({
    description: "Артикул; для услуги (`isService: true`) можно не передавать — сервер сгенерирует служебный SKU",
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  sku?: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  price!: number;

  @ApiProperty({
    description:
      "НДС, %: 18, 0 или -1 (освобождение от ƏDV; в расчётах как 0%)",
  })
  @Type(() => Number)
  @IsNumber()
  @IsIn([-1, 0, 18])
  vatRate!: number;

  @ApiPropertyOptional({ description: "Услуга (без складского учёта в UI / печать)" })
  @IsOptional()
  @IsBoolean()
  isService?: boolean;
}
