import { ApiProperty } from "@nestjs/swagger";
import { IsIn, IsString, Matches } from "class-validator";

export class GenerateTaxDeclarationDto {
  @ApiProperty({
    enum: ["SIMPLIFIED_TAX"],
    example: "SIMPLIFIED_TAX",
  })
  @IsString()
  @IsIn(["SIMPLIFIED_TAX"])
  taxType!: "SIMPLIFIED_TAX";

  @ApiProperty({
    description: "Reporting period in YYYY-MM format",
    example: "2026-04",
  })
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  period!: string;
}
