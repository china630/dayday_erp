import { ApiPropertyOptional } from "@nestjs/swagger";
import { CounterpartyKind, CounterpartyRole } from "@dayday/database";
import { Type } from "class-transformer";
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  Matches,
} from "class-validator";

export class UpdateCounterpartyDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: "VÖEN, 10 цифр" })
  @IsOptional()
  @IsString()
  @Matches(/^\d{10}$/)
  taxId?: string;

  @ApiPropertyOptional({ enum: CounterpartyKind })
  @IsOptional()
  @IsEnum(CounterpartyKind)
  kind?: CounterpartyKind;

  @ApiPropertyOptional({ enum: CounterpartyRole })
  @IsOptional()
  @IsEnum(CounterpartyRole)
  role?: CounterpartyRole;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ description: "Плательщик НДС по данным e-taxes lookup" })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isVatPayer?: boolean;

  @ApiPropertyOptional({
    description: "Язык гостевого портала счёта: az | ru | en",
  })
  @IsOptional()
  @IsString()
  @IsIn(["az", "ru", "en"])
  portalLocale?: "az" | "ru" | "en";
}
