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
  ValidateIf,
} from "class-validator";
import { FIN_CODE_PATTERN } from "../../common/fin-code.util";

export class CreateEmployeeDto {
  @ApiPropertyOptional({ enum: EmployeeKind, default: EmployeeKind.EMPLOYEE })
  @IsOptional()
  @IsEnum(EmployeeKind)
  kind?: EmployeeKind;

  @ApiProperty({
    example: "1A2B3C4",
    description: "7 символов (латиница/цифры), без I и O",
  })
  @IsString()
  @Matches(FIN_CODE_PATTERN, {
    message: "finCode must be 7 chars (A–Z/0–9, excluding I and O)",
  })
  finCode!: string;

  @ApiPropertyOptional({
    description: "VÖEN (10 цифр), обязателен для CONTRACTOR",
    example: "1234567890",
  })
  @ValidateIf((o: CreateEmployeeDto) => o.kind === EmployeeKind.CONTRACTOR)
  @IsString()
  @Matches(/^\d{10}$/, { message: "voen must be 10 digits" })
  voen?: string;

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

  @ApiProperty({ description: "Штатная должность (справочник JobPosition)" })
  @IsUUID()
  positionId!: string;

  @ApiProperty({ example: "2024-01-15" })
  @IsDateString()
  startDate!: string;

  @ApiProperty({ example: 2500, description: "Gross, AZN" })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  salary!: number;

  @ApiPropertyOptional({
    description:
      "Фиксированные соц. удержания с выплаты подрядчику в месяц (AZN), только для CONTRACTOR",
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  contractorMonthlySocialAzn?: number;
}
