import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsDateString, IsOptional, IsString, IsUUID, Min, IsNumber } from "class-validator";

export class AllocatePaymentDto {
  @ApiProperty({ description: "Контрагент, чьи инвойсы гасим траншем" })
  @IsUUID()
  counterpartyId!: string;

  @ApiProperty({ description: "Сумма поступления для распределения" })
  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  amount!: number;

  @ApiPropertyOptional({
    description: "Дата оплаты (YYYY-MM-DD), по умолчанию сегодня UTC",
  })
  @IsOptional()
  @IsDateString()
  paymentDate?: string;

  @ApiPropertyOptional({
    description: "Дт при оплате (101 / 221); по умолчанию 221",
  })
  @IsOptional()
  @IsString()
  debitAccountCode?: string;
}
