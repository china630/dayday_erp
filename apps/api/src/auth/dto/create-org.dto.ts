import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
} from "class-validator";
import { TemplateGroup } from "@dayday/database";

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
    enum: TemplateGroup,
    default: TemplateGroup.COMMERCIAL,
    description:
      "NAS chart template: COMMERCIAL (full), SMALL_BUSINESS (simplified), or GOVERNMENT (reserved / payroll profile)",
  })
  @IsOptional()
  @IsEnum(TemplateGroup)
  templateGroup?: TemplateGroup;

  @ApiPropertyOptional({
    enum: ["full", "small"],
    default: "full",
    description:
      "NAS chart onboarding profile: `full` (commercial full) or `small` (simplified). Takes precedence over `templateGroup` when set.",
  })
  @IsOptional()
  @IsIn(["full", "small"])
  coaTemplate?: "full" | "small";

  @ApiPropertyOptional({
    description: "Опционально: привязать организацию к холдингу (владелец холдинга = текущий пользователь)",
  })
  @IsOptional()
  @IsUUID()
  holdingId?: string;
}
