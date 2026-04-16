import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsArray, IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator";

export class CreateCashDeskDto {
  @ApiProperty({ example: "Əsas nağd kassa" })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @ApiPropertyOptional({
    description: "ISO валюты, например AZN, USD",
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  currencies?: string[];
}
