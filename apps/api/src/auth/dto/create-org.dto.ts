import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
} from "class-validator";

export class CreateOrgDto {
  @ApiProperty({ example: "ООО Пример" })
  @IsString()
  @MaxLength(255)
  organizationName!: string;

  @ApiProperty({ description: "VÖEN — 10 цифр", example: "1234567890" })
  @IsString()
  @Matches(/^\d{10}$/, { message: "taxId must be 10 digits (VÖEN)" })
  taxId!: string;

  @ApiPropertyOptional({ default: "AZN" })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @ApiPropertyOptional({
    description: "Опционально: привязать организацию к холдингу (владелец холдинга = текущий пользователь)",
  })
  @IsOptional()
  @IsUUID()
  holdingId?: string;
}
