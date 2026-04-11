import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsNumber, IsOptional, IsString, Min } from "class-validator";

export class CashOutDto {
  @ApiProperty({ example: 25.5 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @ApiPropertyOptional({ example: "Yanacaq" })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: "2026-04-03" })
  @IsOptional()
  @IsString()
  date?: string;
}
