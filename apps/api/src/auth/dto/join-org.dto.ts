import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MinLength } from "class-validator";

export class JoinOrgDto {
  @ApiProperty({ description: "VÖEN (10 цифр)" })
  @IsString()
  @MinLength(1)
  taxId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  message?: string;
}
