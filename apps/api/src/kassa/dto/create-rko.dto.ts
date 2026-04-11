import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { CashOrderRkoSubtype } from "@dayday/database";
import { Type } from "class-transformer";
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from "class-validator";

export class CreateRkoDraftDto {
  @ApiProperty({ example: "2026-04-03" })
  @IsDateString()
  date!: string;

  @ApiProperty({ enum: CashOrderRkoSubtype })
  @IsEnum(CashOrderRkoSubtype)
  rkoSubtype!: CashOrderRkoSubtype;

  @ApiProperty({ example: 50 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @ApiPropertyOptional({ example: "AZN" })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiProperty()
  @IsString()
  purpose!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cashAccountCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  offsetAccountCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  counterpartyId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
