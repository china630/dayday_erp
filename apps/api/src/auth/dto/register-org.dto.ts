import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsEnum,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";
import { TemplateGroup } from "@dayday/database";

export class RegisterOrgDto {
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
      "NAS chart onboarding profile: `full` or `small`. When set, overrides `templateGroup` for chart copy.",
  })
  @IsOptional()
  @IsIn(["full", "small"])
  coaTemplate?: "full" | "small";

  @ApiProperty({ example: "owner@company.com" })
  @IsEmail()
  adminEmail!: string;

  @ApiProperty({ example: "Иван" })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  adminFirstName!: string;

  @ApiProperty({ example: "Иванов" })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  adminLastName!: string;

  @ApiProperty({ minLength: 8, example: "SecretPass1" })
  @IsString()
  @MinLength(8)
  adminPassword!: string;
}
