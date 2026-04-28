import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsOptional, IsString, MinLength } from "class-validator";

export class CreateIfrsMappingRuleDto {
  @ApiProperty({ example: "211" })
  @IsString()
  @MinLength(1)
  sourceNasAccountCode!: string;

  @ApiProperty({ example: "1200" })
  @IsString()
  @MinLength(1)
  targetIfrsAccountCode!: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
