import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { CounterpartyKind, CounterpartyRole } from "@dayday/database";
import { Type } from "class-transformer";
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from "class-validator";

export class CreateCounterpartyDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: "name is required" })
  @MaxLength(255)
  name!: string;

  @ApiProperty({ description: "VÖEN, 10 цифр" })
  @IsString()
  @Matches(/^\d{10}$/, { message: "taxId must be 10 digits (VÖEN)" })
  taxId!: string;

  @ApiProperty({ enum: CounterpartyKind })
  @IsEnum(CounterpartyKind)
  kind!: CounterpartyKind;

  @ApiPropertyOptional({ enum: CounterpartyRole })
  @IsOptional()
  @IsEnum(CounterpartyRole)
  role?: CounterpartyRole;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ description: "Для отправки счёта на почту" })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ description: "Плательщик НДС (после Yoxla / e-taxes)" })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isVatPayer?: boolean;
}
