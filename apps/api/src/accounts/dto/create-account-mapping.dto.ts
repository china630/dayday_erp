import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsNumberString, IsOptional, IsUUID } from "class-validator";

export class CreateAccountMappingDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  nasAccountId!: string;

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  ifrsAccountId!: string;

  @ApiPropertyOptional({
    description: "Коэффициент пересчёта суммы NAS → IFRS (по умолчанию 1)",
    example: "1",
  })
  @IsOptional()
  @IsNumberString()
  ratio?: string;
}
