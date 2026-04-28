import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsDateString, IsNumber, IsOptional, IsString, Min } from "class-validator";

export class OpeningBalanceFinanceLineDto {
  @ApiProperty({ example: "101.01" })
  @IsString()
  accountCode!: string;

  @ApiProperty({ example: 1000 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  amount!: number;

  @ApiProperty({ example: "AZN" })
  @IsString()
  currency!: string;

  @ApiProperty({ example: "2026-04-27" })
  @IsDateString()
  date!: string;

  @ApiPropertyOptional({ example: "Opening balance import" })
  @IsOptional()
  @IsString()
  description?: string;
}
