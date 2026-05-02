import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsNotEmpty, IsOptional, IsString, Length, MaxLength } from "class-validator";

export class CreateHoldingDto {
  @ApiProperty({ example: "Holding ABC" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  @ApiPropertyOptional({
    example: "AZN",
    description: "Валюта сводной отчётности холдинга (консолидация по курсу ЦБА)",
  })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  @IsIn(["AZN", "USD", "EUR", "RUB", "TRY"])
  baseCurrency?: string;
}
