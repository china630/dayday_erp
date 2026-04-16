import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { CashOrderPkoSubtype } from "@dayday/database";
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

export class CreatePkoDraftDto {
  @ApiProperty({ example: "2026-04-03" })
  @IsDateString()
  date!: string;

  @ApiProperty({ enum: CashOrderPkoSubtype })
  @IsEnum(CashOrderPkoSubtype)
  pkoSubtype!: CashOrderPkoSubtype;

  @ApiProperty({ example: 100 })
  @Type(() => Number)
  @IsNumber(
    { allowNaN: false, allowInfinity: false, maxDecimalPlaces: 4 },
    { message: "amount must be a finite number" },
  )
  @Min(0.01)
  amount!: number;

  @ApiPropertyOptional({ example: "AZN" })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiProperty({ example: "Nağd satış" })
  @IsString()
  purpose!: string;

  @ApiPropertyOptional({ example: "101.01" })
  @IsOptional()
  @IsString()
  cashAccountCode?: string;

  @ApiPropertyOptional({ description: "Второй счёт (обязателен для OTHER / RETURN)" })
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

  @ApiProperty({ description: "Статья ДДС (обязательна)" })
  @IsUUID()
  cashFlowItemId!: string;

  @ApiPropertyOptional({ description: "Физическая касса" })
  @IsOptional()
  @IsUUID()
  cashDeskId?: string;
}
