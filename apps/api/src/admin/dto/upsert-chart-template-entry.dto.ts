import { Type } from "class-transformer";
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";
import { AccountType, TemplateGroup } from "@dayday/database";

export class UpsertChartTemplateEntryDto {
  @IsOptional()
  @IsEnum(TemplateGroup)
  templateGroup?: TemplateGroup;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  code!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  nameAz!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  nameRu!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  nameEn!: string;

  @IsEnum(AccountType)
  accountType!: AccountType;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  parentCode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  cashProfile?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isDeprecated?: boolean;
}
