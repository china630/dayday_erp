import { Type } from "class-transformer";
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from "class-validator";
import {
  InventoryValuationMethod,
  OrgBankAccountCurrency,
} from "@dayday/database";

export class OrganizationBankAccountInputDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  @MaxLength(200)
  bankName!: string;

  @IsString()
  @MaxLength(64)
  accountNumber!: string;

  @IsEnum(OrgBankAccountCurrency)
  currency!: OrgBankAccountCurrency;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  iban?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  swift?: string | null;
}

export class PatchOrganizationSettingsDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  legalAddress?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  phone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  directorName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  logoUrl?: string | null;

  @IsOptional()
  @IsEnum(InventoryValuationMethod)
  valuationMethod?: InventoryValuationMethod;

  @IsOptional()
  @IsEnum(InventoryValuationMethod)
  inventoryValuation?: InventoryValuationMethod;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrganizationBankAccountInputDto)
  bankAccounts?: OrganizationBankAccountInputDto[];

  @IsOptional()
  @IsDateString()
  lockedPeriodUntil?: string | null;
}
