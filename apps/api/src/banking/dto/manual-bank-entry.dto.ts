import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { BankStatementLineType } from "@dayday/database";
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

export class ManualBankEntryDto {
  @ApiProperty({ enum: BankStatementLineType })
  @IsEnum(BankStatementLineType)
  type!: BankStatementLineType;

  @ApiProperty({ example: 150.5 })
  @Type(() => Number)
  @IsNumber(
    { allowNaN: false, allowInfinity: false, maxDecimalPlaces: 4 },
    { message: "amount must be a finite number" },
  )
  @Min(0.01)
  amount!: number;

  @ApiProperty({
    description: "Банковский счёт из ГК (221*, 222*, 223*, 224*)",
    example: "221.01",
  })
  @IsString()
  bankAccountCode!: string;

  @ApiProperty({
    description: "Второй счёт проводки (контрагент / расход / доход)",
    example: "531",
  })
  @IsString()
  offsetAccountCode!: string;

  @ApiProperty({ example: "2026-04-13" })
  @IsDateString()
  date!: string;

  @ApiProperty()
  @IsUUID()
  cashFlowItemId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}
