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
import { AZ_FIN_CODE_PATTERN } from "../../utils/validators/fin.validator";

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
  @Matches(AZ_FIN_CODE_PATTERN, {
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

  @ApiPropertyOptional({ description: "Ata adı (отчество)" })
  @IsOptional()
  @IsString()
  patronymic?: string;

  @ApiPropertyOptional({ description: "Штатная должность" })
  @IsOptional()
  @IsUUID()
  positionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: "Hire date (migration baseline for HR/Absences).",
  })
  @IsOptional()
  @IsDateString()
  hireDate?: string;

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
    description:
      "Initial salary balance (AZN) for average salary calculations (pre-ERP payroll history).",
    example: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  initialSalaryBalance?: number | null;

  @ApiPropertyOptional({
    description: "Initial vacation days at migration date.",
    example: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  initialVacationDays?: number | null;

  @ApiPropertyOptional({
    description:
      "Average monthly salary for last 12 months (migration helper for vacation calculations).",
    example: 2400,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  avgMonthlySalaryLastYear?: number | null;

  @ApiPropertyOptional({
    description: "Субсчёт подотчётного лица (244.xx) для кассы KXO",
    example: "244.01",
  })
  @IsOptional()
  @IsString()
  accountableAccountCode244?: string | null;
}
