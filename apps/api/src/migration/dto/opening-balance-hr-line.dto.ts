import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { EmployeeKind } from "@dayday/database";
import { Type } from "class-transformer";
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Min,
} from "class-validator";
import { FIN_CODE_PATTERN } from "../../common/fin-code.util";

export class OpeningBalanceHrLineDto {
  @ApiPropertyOptional({ enum: EmployeeKind, default: EmployeeKind.EMPLOYEE })
  @IsOptional()
  @IsEnum(EmployeeKind)
  kind?: EmployeeKind;

  @ApiProperty({ example: "1A2B3C4" })
  @IsString()
  @Matches(FIN_CODE_PATTERN, {
    message: "finCode must be 7 chars (A–Z/0–9, excluding I and O)",
  })
  finCode!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  firstName!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  lastName!: string;

  @ApiProperty({ description: "Ata adı (отчество)" })
  @IsString()
  @IsNotEmpty()
  patronymic!: string;

  @ApiProperty({ description: "Штатная должность (JobPosition)" })
  @IsUUID()
  positionId!: string;

  @ApiProperty({ example: "2024-01-15" })
  @IsDateString()
  hireDate!: string;

  @ApiProperty({ example: 2500 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  salary!: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  initialVacationDays?: number;

  @ApiPropertyOptional({ example: 2400 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  avgMonthlySalaryLastYear?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  initialSalaryBalance?: number;

  @ApiPropertyOptional({ description: "VÖEN для CONTRACTOR", example: "1234567890" })
  @IsOptional()
  @IsString()
  @Matches(/^\d{10}$/, { message: "voen must be 10 digits" })
  voen?: string;
}
