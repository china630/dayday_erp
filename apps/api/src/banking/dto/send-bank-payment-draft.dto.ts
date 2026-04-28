import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsIBAN,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Min,
} from "class-validator";

export class SendBankPaymentDraftDto {
  @ApiProperty({ example: "AZ33IBAZ00000000000000000001" })
  @IsString()
  @IsIBAN()
  fromAccountIban!: string;

  @ApiProperty({ example: "AZ36PAHA00000000000000000002" })
  @IsString()
  @IsIBAN()
  recipientIban!: string;

  @ApiProperty({ example: 3250.5 })
  @Type(() => Number)
  @IsNumber(
    { allowNaN: false, allowInfinity: false, maxDecimalPlaces: 4 },
    { message: "amount must be a finite number" },
  )
  @Min(0.01)
  amount!: number;

  @ApiProperty({ example: "AZN" })
  @IsString()
  @Length(3, 3)
  currency!: string;

  @ApiProperty({ example: "Supplier invoice INV-2026-115" })
  @IsString()
  @MaxLength(255)
  purpose!: string;

  @ApiPropertyOptional({ example: "pasha" })
  @IsOptional()
  @IsString()
  provider?: string;
}
