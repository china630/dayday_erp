import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsDateString, IsNumber, IsOptional, IsString, Min } from "class-validator";

export class RecordInvoicePaymentDto {
  @ApiProperty({ example: 100.5, description: "Сумма платежа (≤ остатка по инвойсу)" })
  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  amount!: number;

  @ApiPropertyOptional({
    description: "Дата платежа (YYYY-MM-DD), по умолчанию сегодня UTC",
  })
  @IsOptional()
  @IsDateString()
  paymentDate?: string;

  @ApiPropertyOptional({
    description: "Дт при оплате (101 / 221); по умолчанию из инвойса",
  })
  @IsOptional()
  @IsString()
  debitAccountCode?: string;
}
