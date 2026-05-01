import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

export class CreateCounterpartyBankAccountDto {
  @ApiProperty({ example: "Kapital Bank" })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  bankName!: string;

  @ApiProperty({ example: "AZ12NABZ00000000000000001234" })
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  iban!: string;

  @ApiPropertyOptional({ example: "BICKAZ22" })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  swift?: string;

  @ApiPropertyOptional({ default: "AZN" })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  @Matches(/^[A-Z]{3}$/i)
  currency?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isPrimary?: boolean;
}
