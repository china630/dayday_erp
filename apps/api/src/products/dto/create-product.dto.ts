import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsBoolean, IsNumber, IsOptional, IsString } from "class-validator";

export class CreateProductDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty()
  @IsString()
  sku!: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  price!: number;

  @ApiProperty({ description: "НДС, % (0 или 18)" })
  @Type(() => Number)
  @IsNumber()
  vatRate!: number;

  @ApiPropertyOptional({ description: "Услуга (без складского учёта в UI / печать)" })
  @IsOptional()
  @IsBoolean()
  isService?: boolean;
}
