import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsIn, IsOptional, IsString, Matches } from "class-validator";

export class CreateBankAccountDto {
  @ApiProperty({
    description: "Ledger account code (must start with 221.*)",
    example: "221.01",
  })
  @IsString()
  @Matches(/^221(\.\d{2})+$/, { message: "code must match 221.xx" })
  code!: string;

  @ApiProperty({ description: "Display name", example: "Hesab ABB AZN" })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ enum: ["AZN", "USD", "EUR"], default: "AZN" })
  @IsOptional()
  @Type(() => String)
  @IsIn(["AZN", "USD", "EUR"])
  currency?: "AZN" | "USD" | "EUR";
}

