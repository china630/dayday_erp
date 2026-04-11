import { ApiPropertyOptional } from "@nestjs/swagger";
import { EmployeeKind } from "@dayday/database";
import { Type } from "class-transformer";
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Min,
  ValidateIf,
} from "class-validator";
import { FIN_CODE_PATTERN } from "../../common/fin-code.util";

export class UpdateEmployeeDto {
  @ApiPropertyOptional({ enum: EmployeeKind })
  @IsOptional()
  @IsEnum(EmployeeKind)
  kind?: EmployeeKind;

  @ApiPropertyOptional({ description: "Для CONTRACTOR — 10 цифр" })
  @ValidateIf((o: UpdateEmployeeDto) => o.kind === EmployeeKind.CONTRACTOR)
  @IsOptional()
  @IsString()
  @Matches(/^\d{10}$/, { message: "voen must be 10 digits" })
  voen?: string;
  @ApiPropertyOptional({ example: "1A2B3C4" })
  @IsOptional()
  @IsString()
  @Matches(FIN_CODE_PATTERN, {
    message: "finCode must be 7 chars (A–Z/0–9, excluding I and O)",
  })
  finCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional({ description: "Штатная должность" })
  @IsOptional()
  @IsUUID()
  positionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  salary?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  contractorMonthlySocialAzn?: number | null;

  @ApiPropertyOptional({
    description: "Субсчёт подотчётного лица (244.xx) для кассы RKO",
    example: "244.01",
  })
  @IsOptional()
  @IsString()
  accountableAccountCode244?: string | null;
}
